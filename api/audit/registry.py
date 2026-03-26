"""Audit registry — declarative set of all (resource_type, action) tuples that must be audited.

Used for automated completeness verification in tests.
"""

from .models import AuditAction

# Each entry is (resource_type, AuditAction) that the system MUST produce
# an AuditLog row for when the corresponding operation succeeds.
AUDIT_REGISTRY = frozenset({
    # Clients (AuditedModelViewSet)
    ("client", AuditAction.CREATE),
    ("client", AuditAction.UPDATE),
    ("client", AuditAction.DELETE),

    # Assets (AuditedModelViewSet)
    ("asset", AuditAction.CREATE),
    ("asset", AuditAction.UPDATE),
    ("asset", AuditAction.DELETE),

    # Engagements (AuditedModelViewSet)
    ("engagement", AuditAction.CREATE),
    ("engagement", AuditAction.UPDATE),
    ("engagement", AuditAction.DELETE),

    # SoW (@audited decorator)
    ("sow", AuditAction.CREATE),
    ("sow", AuditAction.UPDATE),
    ("sow", AuditAction.DELETE),

    # Scope (@audited decorator)
    ("scope", AuditAction.CREATE),
    ("scope", AuditAction.DELETE),

    # Findings (@audited decorator + direct log_audit for READ)
    ("finding", AuditAction.CREATE),
    ("finding", AuditAction.READ),
    ("finding", AuditAction.UPDATE),
    ("finding", AuditAction.DELETE),

    # Attachment (direct log_audit — upload_image + evidence content view)
    ("attachment", AuditAction.CREATE),
    ("attachment", AuditAction.READ),

    # Groups (direct log_audit — FBVs)
    ("group", AuditAction.CREATE),
    ("group", AuditAction.UPDATE),
    ("group", AuditAction.DELETE),

    # Members (direct log_audit — FBVs)
    ("member", AuditAction.CREATE),
    ("member", AuditAction.UPDATE),
    ("member", AuditAction.DELETE),

    # Settings (direct log_audit — FBVs)
    ("setting", AuditAction.CREATE),
    ("setting", AuditAction.UPDATE),
    ("setting", AuditAction.DELETE),

    # Profile (direct log_audit — FBVs)
    ("profile", AuditAction.UPDATE),
    ("profile", AuditAction.DELETE),

    # Password (self-service change)
    ("password", AuditAction.UPDATE),

    # Auth events (direct log_audit — unique non-CRUD)
    ("auth", AuditAction.LOGIN_SUCCESS),
    ("auth", AuditAction.LOGIN_FAILED),
    ("auth", AuditAction.LOGOUT),
    ("auth", AuditAction.SIGNUP),
    ("auth", AuditAction.TENANT_SWITCH),
})
