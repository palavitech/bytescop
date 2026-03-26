"""Add InstallState model for first-run setup gate."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_rate_limit_entry"),
    ]

    operations = [
        migrations.CreateModel(
            name="InstallState",
            fields=[
                ("id", models.IntegerField(default=1, primary_key=True, serialize=False)),
                ("installed", models.BooleanField(default=False)),
                ("installed_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "verbose_name": "Install State",
            },
        ),
    ]
