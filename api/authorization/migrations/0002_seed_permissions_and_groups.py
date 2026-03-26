"""Data migration: seed permissions, create default groups, map existing roles."""

from django.db import migrations

# All permission definitions
PERMISSIONS = [
    ("client.view", "View clients", "model", "client"),
    ("client.create", "Create clients", "model", "client"),
    ("client.update", "Update clients", "model", "client"),
    ("client.delete", "Delete clients", "model", "client"),
    ("asset.view", "View assets", "model", "asset"),
    ("asset.create", "Create assets", "model", "asset"),
    ("asset.update", "Update assets", "model", "asset"),
    ("asset.delete", "Delete assets", "model", "asset"),
    ("engagement.view", "View engagements", "model", "engagement"),
    ("engagement.create", "Create engagements", "model", "engagement"),
    ("engagement.update", "Update engagements", "model", "engagement"),
    ("engagement.delete", "Delete engagements", "model", "engagement"),
    ("finding.view", "View findings", "model", "finding"),
    ("finding.create", "Create findings", "model", "finding"),
    ("finding.update", "Update findings", "model", "finding"),
    ("finding.delete", "Delete findings", "model", "finding"),
    ("evidence.view", "View evidence", "model", "evidence"),
    ("evidence.create", "Create evidence", "model", "evidence"),
    ("evidence.update", "Update evidence", "model", "evidence"),
    ("evidence.delete", "Delete evidence", "model", "evidence"),
    ("sow.view", "View SOW", "model", "sow"),
    ("sow.update", "Update SOW", "model", "sow"),
    ("user.view", "View users", "system", "user"),
    ("user.create", "Create users", "system", "user"),
    ("user.update", "Update users", "system", "user"),
    ("user.delete", "Delete users", "system", "user"),
    ("group.view", "View groups", "system", "group"),
    ("group.create", "Create groups", "system", "group"),
    ("group.update", "Update groups", "system", "group"),
    ("group.delete", "Delete groups", "system", "group"),
    ("billing.view", "View billing", "system", "billing"),
    ("billing.manage", "Manage billing", "system", "billing"),
    ("settings.view", "View settings", "system", "settings"),
    ("settings.manage", "Manage settings", "system", "settings"),
]

# Default groups: name → (description, permission filter)
# "all" = all permissions, "model" = model-category only, "model_view" = model *.view only
DEFAULT_GROUPS = [
    ("Administrators", "Full access to all features", "all"),
    ("PenTesters", "Full access to model CRUD operations", "model"),
    ("Viewers", "Read-only access to model data", "model_view"),
]

ROLE_TO_GROUP = {
    "admin": "Administrators",
    "analyst": "PenTesters",
    "viewer": "Viewers",
    "owner": "Administrators",
}


def forward(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    TenantGroup = apps.get_model("authorization", "TenantGroup")
    Tenant = apps.get_model("tenancy", "Tenant")
    TenantMember = apps.get_model("tenancy", "TenantMember")

    # 1. Seed permissions
    perm_map = {}
    for codename, name, category, resource in PERMISSIONS:
        perm, _ = Permission.objects.update_or_create(
            codename=codename,
            defaults={"name": name, "category": category, "resource": resource},
        )
        perm_map[codename] = perm

    # Precompute permission sets for groups
    all_perms = list(perm_map.values())
    model_perms = [p for code, p in perm_map.items() if p.category == "model"]
    model_view_perms = [
        p for code, p in perm_map.items()
        if p.category == "model" and code.endswith(".view")
    ]
    perm_sets = {
        "all": all_perms,
        "model": model_perms,
        "model_view": model_view_perms,
    }

    # 2. Create default groups for every existing tenant
    for tenant in Tenant.objects.all():
        group_map = {}
        for group_name, description, perm_key in DEFAULT_GROUPS:
            group, created = TenantGroup.objects.get_or_create(
                tenant=tenant,
                name=group_name,
                defaults={"description": description, "is_default": True},
            )
            if created:
                group.permissions.set(perm_sets[perm_key])
            group_map[group_name] = group

        # 3. Map existing members to default groups based on role
        for member in TenantMember.objects.filter(tenant=tenant):
            target_group_name = ROLE_TO_GROUP.get(member.role)
            if target_group_name and target_group_name in group_map:
                member.groups.add(group_map[target_group_name])


def reverse(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    TenantGroup = apps.get_model("authorization", "TenantGroup")
    TenantGroup.objects.filter(is_default=True).delete()
    Permission.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0001_initial"),
        ("tenancy", "0002_tenantmember_groups"),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
