"""Ensure InstallState singleton row exists (id=1)."""

from django.core.management.base import BaseCommand

from core.models import InstallState


class Command(BaseCommand):
    help = 'Create InstallState(id=1) if it does not exist.'

    def handle(self, *args, **options):
        _, created = InstallState.objects.get_or_create(id=1)
        if created:
            self.stdout.write('Created InstallState(id=1)')
        else:
            state = InstallState.objects.get(id=1)
            self.stdout.write(f'InstallState exists (installed={state.installed})')
