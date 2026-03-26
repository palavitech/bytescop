"""List all users with key details."""

from django.core.management.base import BaseCommand

from accounts.models import User
from tenancy.models import TenantMember


class Command(BaseCommand):
    help = "List all users with key details"

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant", type=str, help="Filter by tenant slug",
        )

    def handle(self, *args, **options):
        qs = User.objects.order_by("date_joined")
        tenant_slug = options.get("tenant")

        if tenant_slug:
            user_ids = TenantMember.objects.filter(
                tenant__slug=tenant_slug,
            ).values_list("user_id", flat=True)
            qs = qs.filter(id__in=user_ids)

        # Prefetch tenant memberships
        memberships = {}
        for tm in TenantMember.objects.select_related("tenant").all():
            memberships.setdefault(tm.user_id, []).append(
                f"{tm.tenant.slug} ({tm.role})"
            )

        # Column widths
        hdr = f"{'#':<4} {'Email':<45} {'Name':<25} {'MFA':<5} {'Active':<7} {'Staff':<6} {'Super':<6} {'Joined':<12} Tenants"
        self.stdout.write(hdr)
        self.stdout.write("-" * len(hdr))

        for i, u in enumerate(qs, 1):
            tenants = ", ".join(memberships.get(u.id, ["-"]))
            self.stdout.write(
                f"{i:<4} {u.email:<45} "
                f"{u.first_name} {u.last_name:<18} "
                f"{'Y' if u.mfa_enabled else 'N':<5} "
                f"{'Y' if u.is_active else 'N':<7} "
                f"{'Y' if u.is_staff else 'N':<6} "
                f"{'Y' if u.is_superuser else 'N':<6} "
                f"{u.date_joined.strftime('%Y-%m-%d'):<12} "
                f"{tenants}"
            )

        self.stdout.write(f"\nTotal: {qs.count()} users")
