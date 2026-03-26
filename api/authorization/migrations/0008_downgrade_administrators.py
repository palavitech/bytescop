"""Remove owner-only permissions from existing Administrators groups.

Strips: tenant.close, billing.manage, group.create, group.update,
group.delete, user.delete — these are now Owner-only.
"""

from django.db import migrations

OWNER_ONLY = [
    "tenant.close",
    "billing.manage",
    "group.create",
    "group.update",
    "group.delete",
    "user.delete",
]


def forwards(apps, schema_editor):
    TenantGroup = apps.get_model("authorization", "TenantGroup")
    Permission = apps.get_model("authorization", "Permission")

    perms = Permission.objects.filter(codename__in=OWNER_ONLY)
    for group in TenantGroup.objects.filter(name="Administrators", is_default=True):
        group.permissions.remove(*perms)


def backwards(apps, schema_editor):
    TenantGroup = apps.get_model("authorization", "TenantGroup")
    Permission = apps.get_model("authorization", "Permission")

    perms = Permission.objects.filter(codename__in=OWNER_ONLY)
    for group in TenantGroup.objects.filter(name="Administrators", is_default=True):
        group.permissions.add(*perms)


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0007_rename_default_groups"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
