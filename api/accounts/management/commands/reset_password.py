"""Reset a user's password from the command line."""

import getpass
import logging

from django.core.management.base import BaseCommand, CommandError

from accounts.models import User

logger = logging.getLogger("bytescop.accounts")


class Command(BaseCommand):
    help = "Reset a user's password by email address"

    def add_arguments(self, parser):
        parser.add_argument("email", type=str, help="Email address of the user")
        parser.add_argument(
            "--password",
            type=str,
            default=None,
            help="New password (omit for interactive prompt)",
        )

    def handle(self, *args, **options):
        email = options["email"].strip().lower()

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            logger.error("Password reset failed: user not found email=%s", email)
            raise CommandError(f"No user found with email: {email}")

        self.stdout.write(f"[*] Looking up user {email}...")

        if not user.is_active:
            self.stderr.write(
                self.style.WARNING(f"[!] User {email} is inactive.")
            )

        password = options.get("password")

        if password:
            new_password = password
        else:
            new_password = getpass.getpass("[?] New password: ")
            if not new_password:
                raise CommandError("[-] Password cannot be empty.")
            confirm = getpass.getpass("[?] Confirm password: ")
            if new_password != confirm:
                raise CommandError("[-] Passwords do not match.")

        self.stdout.write("[*] Validating password against policy...")

        from django.contrib.auth.password_validation import validate_password

        try:
            validate_password(new_password, user=user)
        except Exception as e:
            logger.warning("Password reset validation failed: email=%s reason=%s", email, e)
            messages = "\n".join(e.messages) if hasattr(e, "messages") else str(e)
            raise CommandError(f"[-] Password validation failed:\n{messages}")

        user.set_password(new_password)
        user.save(update_fields=["password"])

        logger.info("Password reset successfully: email=%s", email)
        self.stdout.write(self.style.SUCCESS(f"[+] Password reset successfully for {email}."))
