"""Extract and validate @[display_name](user_id) mentions from comment body."""

import re

from tenancy.models import TenantMember

# Matches @[Display Name](id) where id is any non-empty string of digits or UUID
MENTION_RE = re.compile(r"@\[([^\]]+)\]\((\w[\w-]*)\)")


def strip_mention_syntax(body_md: str) -> str:
    """Convert @[Display Name](id) → @Display Name for human-readable previews."""
    return MENTION_RE.sub(r"@\1", body_md)


def extract_mention_user_ids(body_md: str) -> list[str]:
    """Return list of user ID strings from mention syntax in body."""
    return [match.group(2) for match in MENTION_RE.finditer(body_md)]


def validate_mentions(tenant, user_ids: list[str]) -> list[str]:
    """Filter to only user IDs that are active tenant members.

    Returns list of valid user ID strings.
    """
    if not user_ids:
        return []

    # Convert to integers (User PK is auto-increment int)
    valid_ids = []
    for uid in user_ids:
        try:
            valid_ids.append(int(uid))
        except (ValueError, TypeError):
            continue

    if not valid_ids:
        return []

    active_user_ids = set(
        TenantMember.objects.filter(
            tenant=tenant,
            is_active=True,
            user_id__in=valid_ids,
        ).values_list("user_id", flat=True)
    )
    return [str(uid) for uid in active_user_ids]
