"""Data migration: seed audit.view permission and add to existing Administrators groups."""

from django.db import migrations


def forward(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    TenantGroup = apps.get_model("authorization", "TenantGroup")

    # Create the audit.view permission
    perm, _ = Permission.objects.update_or_create(
        codename="audit.view",
        defaults={
            "name": "View audit logs",
            "category": "system",
            "resource": "audit",
        },
    )

    # Add audit.view to all existing Administrators groups
    for group in TenantGroup.objects.filter(name="Administrators", is_default=True):
        group.permissions.add(perm)


def reverse(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    Permission.objects.filter(codename="audit.view").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0002_seed_permissions_and_groups"),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
