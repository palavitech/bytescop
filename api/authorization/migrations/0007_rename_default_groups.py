"""Rename default groups: PenTesters→Analysts, Viewers→Collaborators, remove Tenant Managers.

Analysts also gains the audit.view permission.
"""

from django.db import migrations


RENAMES = [
    ("PenTesters", "Analysts"),
    ("Viewers", "Collaborators"),
]

REMOVE = ["Tenant Managers"]

# Analysts should gain audit.view
ANALYSTS_ADD_PERMS = ["audit.view"]


def forwards(apps, schema_editor):
    TenantGroup = apps.get_model("authorization", "TenantGroup")
    Permission = apps.get_model("authorization", "Permission")

    # Rename groups
    for old_name, new_name in RENAMES:
        TenantGroup.objects.filter(name=old_name, is_default=True).update(
            name=new_name,
        )

    # Add audit.view to all Analysts groups
    audit_perms = Permission.objects.filter(codename__in=ANALYSTS_ADD_PERMS)
    for group in TenantGroup.objects.filter(name="Analysts", is_default=True):
        group.permissions.add(*audit_perms)

    # Remove Tenant Managers groups
    TenantGroup.objects.filter(name__in=REMOVE, is_default=True).delete()


def backwards(apps, schema_editor):
    TenantGroup = apps.get_model("authorization", "TenantGroup")
    Permission = apps.get_model("authorization", "Permission")

    # Reverse renames
    for old_name, new_name in RENAMES:
        TenantGroup.objects.filter(name=new_name, is_default=True).update(
            name=old_name,
        )

    # Remove audit.view from PenTesters (reversed name)
    audit_perms = Permission.objects.filter(codename__in=ANALYSTS_ADD_PERMS)
    for group in TenantGroup.objects.filter(name="PenTesters", is_default=True):
        group.permissions.remove(*audit_perms)

    # Re-create Tenant Managers is complex (need tenant refs + permissions).
    # Skip — this is a one-way migration in practice.


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0006_seed_comment_permissions"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
