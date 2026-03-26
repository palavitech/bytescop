from django.db import migrations


def update_free_plan(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    SubscriptionPlan.objects.filter(code='free').update(max_engagements=3)


def reverse(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    SubscriptionPlan.objects.filter(code='free').update(max_engagements=5)


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0002_seed_free_plan'),
    ]

    operations = [
        migrations.RunPython(update_free_plan, reverse),
    ]
