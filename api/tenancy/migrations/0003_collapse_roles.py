"""Collapse admin/analyst/viewer roles into 'member'."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("tenancy", "0002_tenantmember_groups"),
    ]

    operations = [
        migrations.RunSQL(
            sql="UPDATE tenancy_tenantmember SET role = 'member' WHERE role IN ('admin', 'analyst', 'viewer');",
            reverse_sql="UPDATE tenancy_tenantmember SET role = 'viewer' WHERE role = 'member';",
        ),
    ]
