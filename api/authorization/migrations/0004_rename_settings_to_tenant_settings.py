"""Data migration: rename settings.* permissions to tenant_settings.*"""

from django.db import migrations


RENAMES = [
    ("settings.view", "tenant_settings.view", "View tenant settings", "tenant_settings"),
    ("settings.manage", "tenant_settings.manage", "Manage tenant settings", "tenant_settings"),
]


def forward(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    for old_code, new_code, new_name, new_resource in RENAMES:
        Permission.objects.filter(codename=old_code).update(
            codename=new_code,
            name=new_name,
            resource=new_resource,
        )


def reverse(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    Permission.objects.filter(codename="tenant_settings.view").update(
        codename="settings.view",
        name="View settings",
        resource="settings",
    )
    Permission.objects.filter(codename="tenant_settings.manage").update(
        codename="settings.manage",
        name="Manage settings",
        resource="settings",
    )


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0003_seed_audit_permission"),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
