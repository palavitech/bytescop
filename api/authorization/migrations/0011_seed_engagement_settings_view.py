"""Add engagement_settings.view permission.

Engagement settings contain configuration that affects report output and
workflow.  Collaborators (read-only viewers) should not see these, but
Analysts and Administrators need visibility.

Assigned to: Administrators, Analysts (not Collaborators).
"""

from django.db import migrations


def seed_permission(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    TenantGroup = apps.get_model("authorization", "TenantGroup")

    perm, _ = Permission.objects.update_or_create(
        codename="engagement_settings.view",
        defaults={
            "name": "View engagement settings",
            "category": "model",
            "resource": "engagement_settings",
        },
    )

    # Add to Administrators and Analysts — not Collaborators
    for group in TenantGroup.objects.filter(
        is_default=True, name__in=["Administrators", "Analysts"]
    ):
        group.permissions.add(perm)


def reverse_seed(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    Permission.objects.filter(codename="engagement_settings.view").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0010_downgrade_analysts"),
    ]

    operations = [
        migrations.RunPython(seed_permission, reverse_seed),
    ]
