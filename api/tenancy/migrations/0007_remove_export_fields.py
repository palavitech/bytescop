"""Remove last_export_at fields — data export feature removed from on-prem."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("tenancy", "0006_tenant_closure"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="tenant",
            name="last_export_at",
        ),
        migrations.RemoveField(
            model_name="tenantclosure",
            name="last_export_at",
        ),
    ]
