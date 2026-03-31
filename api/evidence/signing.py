"""HMAC-signed URLs for attachment content serving.

Attachments are referenced in markdown ``<img src>`` tags which cannot send
Authorization headers.  Instead we append ``?sig=<hmac>&tid=<tenant_id>`` to
the URL.  The view validates the signature before serving the file.

The signature is ``HMAC-SHA256(SECRET_KEY, tenant_id:attachment_uuid)``
truncated to 16 hex chars — short enough for URLs, strong enough to prevent
brute-force.  Including tenant_id binds each signed URL to a specific tenant,
preventing cross-tenant attachment access.
"""

import hashlib
import hmac

from django.conf import settings


def _sign(attachment_id: str, tenant_id: str = '') -> str:
    key = settings.SECRET_KEY.encode()
    msg = f"{tenant_id}:{attachment_id}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:16]


def sign_attachment_url(attachment_id, tenant_id: str = '',
                        base_url: str | None = None) -> str:
    aid = str(attachment_id)
    tid = str(tenant_id) if tenant_id else ''
    sig = _sign(aid, tid)
    url = base_url or f"/api/attachments/{aid}/content/"
    qs = f"sig={sig}"
    if tid:
        qs += f"&tid={tid}"
    return f"{url}?{qs}"


def verify_attachment_sig(attachment_id, sig: str, tenant_id: str = '') -> bool:
    if not sig:
        return False
    expected = _sign(str(attachment_id), str(tenant_id) if tenant_id else '')
    return hmac.compare_digest(sig, expected)


# ---------------------------------------------------------------------------
# Export download signing
# ---------------------------------------------------------------------------

def sign_download_url(job_id, tenant_id: str = '') -> str:
    """Build a signed URL for downloading an export ZIP."""
    jid = str(job_id)
    tid = str(tenant_id) if tenant_id else ''
    sig = _sign(f"export:{jid}", tid)
    url = f"/api/settings/export/{jid}/download/"
    qs = f"sig={sig}"
    if tid:
        qs += f"&tid={tid}"
    return f"{url}?{qs}"


def verify_download_sig(job_id, sig: str, tenant_id: str = '') -> bool:
    """Verify a signed export download URL."""
    if not sig:
        return False
    expected = _sign(f"export:{str(job_id)}", str(tenant_id) if tenant_id else '')
    return hmac.compare_digest(sig, expected)


# ---------------------------------------------------------------------------
# Malware sample download signing
# ---------------------------------------------------------------------------

def sign_sample_url(sample_id, tenant_id: str = '') -> str:
    """Build a signed URL for downloading a malware sample."""
    sid = str(sample_id)
    tid = str(tenant_id) if tenant_id else ''
    sig = _sign(f"sample:{sid}", tid)
    url = f"/api/samples/{sid}/download/"
    qs = f"sig={sig}"
    if tid:
        qs += f"&tid={tid}"
    return f"{url}?{qs}"


def verify_sample_sig(sample_id, sig: str, tenant_id: str = '') -> bool:
    """Verify a signed malware sample download URL."""
    if not sig:
        return False
    expected = _sign(f"sample:{str(sample_id)}", str(tenant_id) if tenant_id else '')
    return hmac.compare_digest(sig, expected)
