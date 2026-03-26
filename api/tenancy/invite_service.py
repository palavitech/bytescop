"""Invite token service — generate, validate, and consume invite tokens."""

import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from tenancy.models import InviteToken, InviteStatus

logger = logging.getLogger("bytescop.invite")


def _hash_token(raw_token: str) -> str:
    """SHA-256 hash of a raw token."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def generate_invite_token(member) -> str:
    """Generate a new invite token for a member.

    Marks any existing unused tokens for this member as used (invalidated).
    Returns the raw token (to be sent in the email — never stored).
    """
    expiry_hours = getattr(settings, "BC_INVITE_EXPIRY_HOURS", 72)

    # Invalidate any existing unused tokens for this member
    InviteToken.objects.filter(member=member, used=False).update(used=True)

    raw_token = secrets.token_urlsafe(36)  # ~48 chars
    token_hash = _hash_token(raw_token)

    InviteToken.objects.create(
        member=member,
        token_hash=token_hash,
        expires_at=timezone.now() + timedelta(hours=expiry_hours),
    )

    member.last_invited_at = timezone.now()
    member.save(update_fields=["last_invited_at", "updated_at"])

    logger.info("Invite token generated for member=%s", member.pk)
    return raw_token


def validate_and_consume_token(raw_token: str):
    """Validate and atomically consume an invite token.

    Returns (member, None) on success, or (None, error_message) on failure.
    Uses constant-time comparison after DB lookup.
    """
    token_hash = _hash_token(raw_token)

    # Atomic: UPDATE ... WHERE used=False AND expires_at > now()
    # Returns count of rows updated — 1 means success, 0 means invalid/expired/used
    updated = InviteToken.objects.filter(
        token_hash=token_hash,
        used=False,
        expires_at__gt=timezone.now(),
    ).update(used=True)

    if updated == 0:
        return None, "This invitation link is invalid or has expired."

    invite = InviteToken.objects.select_related("member", "member__user", "member__tenant").get(
        token_hash=token_hash,
    )

    # Constant-time verification (defense in depth — DB already matched)
    if not hmac.compare_digest(token_hash, invite.token_hash):
        return None, "This invitation link is invalid or has expired."

    logger.info("Invite token consumed for member=%s", invite.member.pk)
    return invite.member, None


def check_reinvite_cooldown(member) -> bool:
    """Return True if re-invite is allowed (cooldown has passed)."""
    cooldown_minutes = getattr(settings, "BC_INVITE_COOLDOWN_MINUTES", 15)

    if member.last_invited_at is None:
        return True

    elapsed = timezone.now() - member.last_invited_at
    return elapsed >= timedelta(minutes=cooldown_minutes)
