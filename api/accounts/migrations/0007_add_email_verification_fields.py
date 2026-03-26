"""Add email_verified and last_verification_sent_at to User.

Existing users are backfilled as email_verified=True so they are not
disrupted by the new verification gate.
"""

from django.db import migrations, models


def backfill_existing_users(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(email_verified=False).update(email_verified=True)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_add_phone_timezone"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verified",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="user",
            name="last_verification_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_existing_users, migrations.RunPython.noop),
    ]
