from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenancy', '0007_remove_export_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenantclosure',
            name='progress',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
