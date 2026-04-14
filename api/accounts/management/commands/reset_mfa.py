"""Disable MFA for a user so they can log in and re-enroll."""

import logging

from django.core.management.base import BaseCommand, CommandError

from accounts.models import User

logger = logging.getLogger("bytescop.accounts")


class Command(BaseCommand):
    help = "Disable MFA for a user (clears secret, backup codes, and enrollment)"

    def add_arguments(self, parser):
        parser.add_argument("email", type=str, help="Email address of the user")
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Skip confirmation prompt",
        )

    def handle(self, *args, **options):
        email = options["email"].strip().lower()

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            logger.error("MFA reset failed: user not found email=%s", email)
            raise CommandError(f"No user found with email: {email}")

        if not user.mfa_enabled:
            self.stdout.write(self.style.WARNING(f"[!] MFA is already disabled for {email}."))
            return

        if not options["yes"]:
            confirm = input(f"[?] Disable MFA for {email}? This cannot be undone. [y/N] ")
            if confirm.lower() != "y":
                self.stdout.write("[-] Aborted.")
                return

        self.stdout.write(f"[*] Looking up user {email}...")
        self.stdout.write("[*] Clearing MFA secret, backup codes, and enrollment...")

        user.mfa_enabled = False
        user.mfa_secret = ""
        user.mfa_backup_codes = []
        user.mfa_enrolled_at = None
        user.last_totp_at = None
        user.save(update_fields=[
            "mfa_enabled",
            "mfa_secret",
            "mfa_backup_codes",
            "mfa_enrolled_at",
            "last_totp_at",
        ])

        logger.info("MFA reset successfully: email=%s", email)
        self.stdout.write(self.style.SUCCESS(f"[+] MFA has been reset for {email}."))
        self.stdout.write("[*] Log in again — you will be guided through fresh MFA registration.")
