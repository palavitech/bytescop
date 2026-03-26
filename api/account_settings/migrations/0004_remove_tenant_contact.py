"""Remove TenantContact model — contact people feature removed."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("account_settings", "0003_simplify_tenant_contact"),
    ]

    operations = [
        migrations.DeleteModel(
            name="TenantContact",
        ),
    ]
