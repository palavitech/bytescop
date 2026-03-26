"""Seed permissions and default tenant groups."""

from authorization.models import Permission, PermissionCategory, TenantGroup

# ---------------------------------------------------------------------------
# All permission definitions (~26)
# ---------------------------------------------------------------------------

PERMISSIONS = [
    # Model CRUD — client
    ("client.view", "View clients", PermissionCategory.MODEL, "client"),
    ("client.create", "Create clients", PermissionCategory.MODEL, "client"),
    ("client.update", "Update clients", PermissionCategory.MODEL, "client"),
    ("client.delete", "Delete clients", PermissionCategory.MODEL, "client"),
    # Model CRUD — asset
    ("asset.view", "View assets", PermissionCategory.MODEL, "asset"),
    ("asset.create", "Create assets", PermissionCategory.MODEL, "asset"),
    ("asset.update", "Update assets", PermissionCategory.MODEL, "asset"),
    ("asset.delete", "Delete assets", PermissionCategory.MODEL, "asset"),
    # Model CRUD — engagement
    ("engagement.view", "View engagements", PermissionCategory.MODEL, "engagement"),
    ("engagement.create", "Create engagements", PermissionCategory.MODEL, "engagement"),
    ("engagement.update", "Update engagements", PermissionCategory.MODEL, "engagement"),
    ("engagement.delete", "Delete engagements", PermissionCategory.MODEL, "engagement"),
    # Model CRUD — finding
    ("finding.view", "View findings", PermissionCategory.MODEL, "finding"),
    ("finding.create", "Create findings", PermissionCategory.MODEL, "finding"),
    ("finding.update", "Update findings", PermissionCategory.MODEL, "finding"),
    ("finding.delete", "Delete findings", PermissionCategory.MODEL, "finding"),
    # Model CRUD — evidence
    ("evidence.view", "View evidence", PermissionCategory.MODEL, "evidence"),
    ("evidence.create", "Create evidence", PermissionCategory.MODEL, "evidence"),
    ("evidence.update", "Update evidence", PermissionCategory.MODEL, "evidence"),
    ("evidence.delete", "Delete evidence", PermissionCategory.MODEL, "evidence"),
    # Model CRUD — sow
    ("sow.view", "View SOW", PermissionCategory.MODEL, "sow"),
    ("sow.create", "Create SOW", PermissionCategory.MODEL, "sow"),
    ("sow.update", "Update SOW", PermissionCategory.MODEL, "sow"),
    ("sow.delete", "Delete SOW", PermissionCategory.MODEL, "sow"),
    # Model — scope
    ("scope.view", "View scope assets", PermissionCategory.MODEL, "scope"),
    ("scope.manage", "Manage scope assets", PermissionCategory.MODEL, "scope"),
    # Model — engagement settings
    ("engagement_settings.view", "View engagement settings", PermissionCategory.MODEL, "engagement_settings"),
    # System — user management
    ("user.view", "View users", PermissionCategory.SYSTEM, "user"),
    ("user.create", "Create users", PermissionCategory.SYSTEM, "user"),
    ("user.update", "Update users", PermissionCategory.SYSTEM, "user"),
    ("user.delete", "Delete users", PermissionCategory.SYSTEM, "user"),
    # System — group management
    ("group.view", "View groups", PermissionCategory.SYSTEM, "group"),
    ("group.create", "Create groups", PermissionCategory.SYSTEM, "group"),
    ("group.update", "Update groups", PermissionCategory.SYSTEM, "group"),
    ("group.delete", "Delete groups", PermissionCategory.SYSTEM, "group"),
    # System — billing
    ("billing.view", "View billing", PermissionCategory.SYSTEM, "billing"),
    ("billing.manage", "Manage billing", PermissionCategory.SYSTEM, "billing"),
    # System — settings
    ("tenant_settings.view", "View settings", PermissionCategory.SYSTEM, "tenant_settings"),
    ("tenant_settings.manage", "Manage settings", PermissionCategory.SYSTEM, "tenant_settings"),
    # Model CRUD — comment
    ("comment.create", "Create comments", PermissionCategory.MODEL, "comment"),
    ("comment.edit", "Edit comments", PermissionCategory.MODEL, "comment"),
    ("comment.delete", "Delete any comment", PermissionCategory.MODEL, "comment"),
    # System — audit
    ("audit.view", "View audit logs", PermissionCategory.SYSTEM, "audit"),
    # System — tenant
    ("tenant.close", "Close tenant", PermissionCategory.SYSTEM, "tenant"),
    # System — feedback
    ("feature_request.create", "Submit feature requests", PermissionCategory.SYSTEM, "feature_request"),
]

# ---------------------------------------------------------------------------
# Default group definitions
# ---------------------------------------------------------------------------

MODEL_RESOURCES = ["client", "asset", "engagement", "finding", "evidence", "sow", "scope", "comment"]

# Permissions restricted to Owner only (not given to Administrators)
OWNER_ONLY_PERMISSIONS = {
    "tenant.close",       # irreversible tenant destruction
    "billing.manage",     # subscription/billing changes
    "group.create",       # privilege escalation vector
    "group.update",       # privilege escalation vector
    "group.delete",       # could remove security constraints
    "user.delete",        # destructive — admins can deactivate instead
}

DEFAULT_GROUPS = {
    "Administrators": {
        "description": "Day-to-day administration (users, settings, all model ops)",
        "permissions": [
            code for code, _, _cat, _res in PERMISSIONS
            if code not in OWNER_ONLY_PERMISSIONS
        ],
    },
    "Analysts": {
        "description": "Findings & evidence CRUD, read-only access to clients/assets/engagements/SOW/scope",
        "permissions": [
            # View-only for organizational resources
            "client.view",
            "asset.view",
            "engagement.view",
            "engagement_settings.view",
            "sow.view",
            "scope.view",
            # Full CRUD for core pentester work
            "finding.view", "finding.create", "finding.update", "finding.delete",
            "evidence.view", "evidence.create", "evidence.update", "evidence.delete",
            # Collaboration
            "comment.create", "comment.edit",
            # System
            "feature_request.create",
        ],
    },
    "Collaborators": {
        "description": "Read-only access to model data",
        "permissions": [
            code for code, _, cat, res in PERMISSIONS
            if cat == PermissionCategory.MODEL and res != "engagement_settings" and (
                code.endswith(".view")
                or code in ("comment.create", "comment.edit")
            )
        ] + ["feature_request.create"],
    },
}


def seed_permissions():
    """Create or update all permission definitions. Returns all Permission objects."""
    objs = []
    for codename, name, category, resource in PERMISSIONS:
        obj, _ = Permission.objects.update_or_create(
            codename=codename,
            defaults={"name": name, "category": category, "resource": resource},
        )
        objs.append(obj)
    return objs


def create_default_groups_for_tenant(tenant):
    """Create the default groups (Administrators, Analysts, Collaborators) for a tenant.

    Returns a dict mapping group name → TenantGroup instance.
    Safe to call multiple times (idempotent via get_or_create).
    """
    all_permissions = {p.codename: p for p in Permission.objects.all()}
    groups = {}

    for group_name, config in DEFAULT_GROUPS.items():
        group, created = TenantGroup.objects.get_or_create(
            tenant=tenant,
            name=group_name,
            defaults={
                "description": config["description"],
                "is_default": True,
            },
        )

        if created:
            perm_objs = [
                all_permissions[code]
                for code in config["permissions"]
                if code in all_permissions
            ]
            group.permissions.set(perm_objs)

        groups[group_name] = group

    return groups
