"""Seed permission definitions into the database.

Idempotent — safe to run multiple times (creates or updates permissions).

Usage:
    python manage.py seed_permissions
"""

from django.core.management.base import BaseCommand

from authorization.seed import seed_permissions


class Command(BaseCommand):
    help = 'Create or update all permission definitions.'

    def handle(self, *args, **options):
        permissions = seed_permissions()
        self.stdout.write(f'  Seeded {len(permissions)} permission(s).')
        self.stdout.write(self.style.SUCCESS('Done.'))
