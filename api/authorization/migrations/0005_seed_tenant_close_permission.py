"""Data migration: seed tenant.close permission and Tenant Managers group."""

from django.db import migrations


def forward(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    TenantGroup = apps.get_model("authorization", "TenantGroup")
    Tenant = apps.get_model("tenancy", "Tenant")

    # Create the tenant.close permission
    perm, _ = Permission.objects.update_or_create(
        codename="tenant.close",
        defaults={
            "name": "Close tenant",
            "category": "system",
            "resource": "tenant",
        },
    )

    # Resolve permissions for Tenant Managers group
    tm_perm_codes = ["tenant_settings.view", "tenant_settings.manage", "tenant.close"]
    tm_perms = list(Permission.objects.filter(codename__in=tm_perm_codes))

    # Create Tenant Managers group for all existing tenants
    for tenant in Tenant.objects.all():
        group, created = TenantGroup.objects.get_or_create(
            tenant=tenant,
            name="Tenant Managers",
            defaults={
                "description": "Manage tenant settings and closure",
                "is_default": True,
            },
        )
        if created:
            group.permissions.set(tm_perms)


def reverse(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    TenantGroup = apps.get_model("authorization", "TenantGroup")

    TenantGroup.objects.filter(name="Tenant Managers", is_default=True).delete()
    Permission.objects.filter(codename="tenant.close").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0004_rename_settings_to_tenant_settings"),
        ("tenancy", "0005_invite_support"),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
