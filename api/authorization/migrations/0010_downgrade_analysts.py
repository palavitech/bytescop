"""Restrict Analysts group to findings/evidence CRUD + read-only elsewhere.

Previously Analysts had full CRUD on all model resources. Now scoped to:
- View-only: client, asset, engagement, sow, scope
- Full CRUD: finding, evidence
- Collaboration: comment.create, comment.edit
- System: feature_request.create
- Removed: audit.view and all create/update/delete on client, asset,
  engagement, sow, scope, comment.delete
"""

from django.db import migrations

ANALYSTS_PERMISSIONS = [
    "client.view",
    "asset.view",
    "engagement.view",
    "sow.view",
    "scope.view",
    "finding.view", "finding.create", "finding.update", "finding.delete",
    "evidence.view", "evidence.create", "evidence.update", "evidence.delete",
    "comment.create", "comment.edit",
    "feature_request.create",
]


def forwards(apps, schema_editor):
    TenantGroup = apps.get_model("authorization", "TenantGroup")
    Permission = apps.get_model("authorization", "Permission")

    new_perms = Permission.objects.filter(codename__in=ANALYSTS_PERMISSIONS)
    for group in TenantGroup.objects.filter(name="Analysts", is_default=True):
        group.permissions.set(new_perms)


def backwards(apps, schema_editor):
    """Restore Analysts to full model CRUD + audit.view."""
    TenantGroup = apps.get_model("authorization", "TenantGroup")
    Permission = apps.get_model("authorization", "Permission")

    all_model = Permission.objects.filter(category="model")
    audit_view = Permission.objects.filter(codename="audit.view")
    feature_req = Permission.objects.filter(codename="feature_request.create")

    for group in TenantGroup.objects.filter(name="Analysts", is_default=True):
        group.permissions.set(list(all_model) + list(audit_view) + list(feature_req))


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0009_seed_feature_request_permission"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
