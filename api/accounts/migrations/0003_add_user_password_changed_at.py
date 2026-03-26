"""Add password_changed_at field to User model.

Backfills existing users with their date_joined value.
"""

from django.db import migrations, models


def backfill_password_changed_at(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(password_changed_at__isnull=True).update(
        password_changed_at=models.F("date_joined"),
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_add_user_avatar_uri"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="password_changed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(
            backfill_password_changed_at,
            migrations.RunPython.noop,
        ),
    ]
