"""Seed project CRUD permissions.

Assigned to:
  - Administrators: all four (view, create, update, delete)
  - Analysts: view only
  - Collaborators: view only
"""

from django.db import migrations


PROJECT_PERMISSIONS = [
    ("project.view", "View projects", "model", "project"),
    ("project.create", "Create projects", "model", "project"),
    ("project.update", "Update projects", "model", "project"),
    ("project.delete", "Delete projects", "model", "project"),
]


def seed_permissions(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    TenantGroup = apps.get_model("authorization", "TenantGroup")

    perms = {}
    for codename, name, category, resource in PROJECT_PERMISSIONS:
        obj, _ = Permission.objects.update_or_create(
            codename=codename,
            defaults={"name": name, "category": category, "resource": resource},
        )
        perms[codename] = obj

    # Administrators get all project permissions
    for group in TenantGroup.objects.filter(is_default=True, name="Administrators"):
        group.permissions.add(*perms.values())

    # Analysts and Collaborators get view only
    view_perm = perms["project.view"]
    for group in TenantGroup.objects.filter(
        is_default=True, name__in=["Analysts", "Collaborators"]
    ):
        group.permissions.add(view_perm)


def reverse_seed(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    Permission.objects.filter(resource="project").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0011_seed_engagement_settings_view"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, reverse_seed),
    ]
