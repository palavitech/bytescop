from django.db import migrations


def seed_feature_request_permission(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    TenantGroup = apps.get_model("authorization", "TenantGroup")

    perm, _ = Permission.objects.update_or_create(
        codename="feature_request.create",
        defaults={
            "name": "Submit feature requests",
            "category": "system",
            "resource": "feature_request",
        },
    )

    # Add to all default groups — every role can submit feature requests
    for group in TenantGroup.objects.filter(is_default=True):
        group.permissions.add(perm)


def reverse_seed(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    Permission.objects.filter(codename="feature_request.create").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0008_downgrade_administrators"),
    ]

    operations = [
        migrations.RunPython(seed_feature_request_permission, reverse_seed),
    ]
