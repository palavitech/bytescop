"""
Seed (or clean up) a load-test tenant with users and realistic data.

Usage:
    # Seed 50 users + data
    python manage.py seed_loadtest

    # Seed custom count
    python manage.py seed_loadtest --users 20

    # Clean up everything
    python manage.py seed_loadtest --cleanup

    # Dry run (show what would be created/deleted)
    python manage.py seed_loadtest --dry-run
    python manage.py seed_loadtest --cleanup --dry-run
"""

import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from assets.models import Asset, AssetCriticality, AssetEnvironment, AssetType
from clients.models import Client
from engagements.models import Engagement, EngagementStatus, Sow, SowAsset
from findings.models import Finding
from tenancy.models import Tenant, TenantMember, TenantRole

TENANT_SLUG = "loadtest"
TENANT_NAME = "Load Test Tenant"
EMAIL_DOMAIN = "loadtest.bytescop.example.com"
PASSWORD = "LoadTest2026!"

# ---------------------------------------------------------------------------
# Realistic seed data
# ---------------------------------------------------------------------------

CLIENT_NAMES = [
    "Acme Corp", "Globex Industries", "Initech Solutions", "Umbrella Ltd",
    "Cyberdyne Systems", "Stark Enterprises", "Wayne Tech", "Oscorp Labs",
    "Vanguard Finance", "Meridian Health",
]

ASSET_TEMPLATES = [
    ("Web Portal", AssetType.WEBAPP, "https://portal.example.com"),
    ("API Gateway", AssetType.API, "https://api.example.com"),
    ("Mail Server", AssetType.HOST, "10.0.1.10"),
    ("Cloud Storage", AssetType.CLOUD, "s3://data-bucket"),
    ("Core Switch", AssetType.NETWORK_DEVICE, "10.0.0.1"),
    ("Mobile App", AssetType.MOBILE_APP, "com.example.app"),
    ("Auth Service", AssetType.API, "https://auth.example.com"),
    ("Database Server", AssetType.HOST, "10.0.1.20"),
    ("CDN Edge", AssetType.CLOUD, "cdn.example.com"),
    ("Admin Panel", AssetType.WEBAPP, "https://admin.example.com"),
]

FINDING_TITLES = [
    "SQL Injection in login form",
    "Cross-Site Scripting (Stored) in comment field",
    "Insecure Direct Object Reference on user profile",
    "Missing rate limiting on authentication endpoint",
    "TLS 1.0 enabled on web server",
    "Default credentials on admin panel",
    "Server-Side Request Forgery via image upload",
    "Open redirect in OAuth callback",
    "Sensitive data exposure in API response",
    "Missing Content-Security-Policy header",
    "Unrestricted file upload allows executable",
    "Broken access control on admin endpoint",
    "XML External Entity injection",
    "Weak password policy allows dictionary words",
    "Session fixation after login",
    "CORS misconfiguration allows wildcard origin",
    "Information disclosure via verbose error messages",
    "Unpatched Apache Struts (CVE-2017-5638)",
    "Hardcoded API key in JavaScript bundle",
    "Privilege escalation via parameter tampering",
]

FINDING_CATEGORIES = [
    "application_security", "network_security", "api_security",
    "cloud_security", "infrastructure_security", "cryptography",
    "auth_and_access_control", "configuration_and_deployment",
]

SEVERITIES = ["critical", "high", "medium", "low", "info"]
SEVERITY_WEIGHTS = [5, 15, 40, 25, 15]

STATUSES = ["open", "triage", "accepted", "fixed", "false_positive"]
STATUS_WEIGHTS = [30, 15, 20, 25, 10]


class Command(BaseCommand):
    help = "Seed or clean up a load-test tenant with users and realistic data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--users", type=int, default=50,
            help="Number of test users to create (default: 50)",
        )
        parser.add_argument(
            "--cleanup", action="store_true", default=False,
            help="Remove the load-test tenant and all associated data",
        )
        parser.add_argument(
            "--dry-run", action="store_true", default=False,
            help="Show what would happen without making changes",
        )

    def handle(self, *args, **options):
        if options["cleanup"]:
            self._cleanup(dry_run=options["dry_run"])
        else:
            self._seed(
                user_count=options["users"],
                dry_run=options["dry_run"],
            )

    def _cleanup(self, dry_run=False):
        try:
            tenant = Tenant.objects.get(slug=TENANT_SLUG)
        except Tenant.DoesNotExist:
            self.stdout.write("No load-test tenant found. Nothing to clean up.")
            return

        # Count what will be deleted
        members = TenantMember.objects.filter(tenant=tenant)
        user_ids = list(members.values_list("user_id", flat=True))
        users = User.objects.filter(id__in=user_ids, email__endswith=f"@{EMAIL_DOMAIN}")
        findings = Finding.objects.filter(tenant=tenant)
        engagements = Engagement.objects.filter(tenant=tenant)
        assets = Asset.objects.filter(tenant=tenant)
        clients = Client.objects.filter(tenant=tenant)

        self.stdout.write(f"Load-test tenant: {tenant.name} ({tenant.slug})")
        self.stdout.write(f"  Users:       {users.count()}")
        self.stdout.write(f"  Members:     {members.count()}")
        self.stdout.write(f"  Findings:    {findings.count()}")
        self.stdout.write(f"  Engagements: {engagements.count()}")
        self.stdout.write(f"  Assets:      {assets.count()}")
        self.stdout.write(f"  Clients:     {clients.count()}")

        if dry_run:
            self.stdout.write("\n[DRY RUN] No changes made.")
            return

        with transaction.atomic():
            # Delete in dependency order (findings → engagements → assets → clients → members → users → tenant)
            findings.delete()
            # SowAssets and Sows cascade from engagements
            engagements.delete()
            assets.delete()
            clients.delete()
            members.delete()
            users.delete()
            tenant.delete()

        self.stdout.write(self.style.SUCCESS("\nLoad-test tenant and all data deleted."))

    def _seed(self, user_count=50, dry_run=False):
        if Tenant.objects.filter(slug=TENANT_SLUG).exists():
            self.stdout.write(self.style.ERROR(
                f"Tenant '{TENANT_SLUG}' already exists. "
                f"Run with --cleanup first, then re-seed."
            ))
            return

        if dry_run:
            self.stdout.write(f"[DRY RUN] Would create:")
            self.stdout.write(f"  1 tenant ({TENANT_SLUG})")
            self.stdout.write(f"  {user_count} users (loadtest+01@{EMAIL_DOMAIN} .. loadtest+{user_count:02d}@{EMAIL_DOMAIN})")
            self.stdout.write(f"  {len(CLIENT_NAMES)} clients")
            self.stdout.write(f"  {len(CLIENT_NAMES) * len(ASSET_TEMPLATES)} assets")
            self.stdout.write(f"  {len(CLIENT_NAMES) * 2} engagements")
            self.stdout.write(f"  ~{len(CLIENT_NAMES) * 2 * 8} findings")
            self.stdout.write(f"\n  Password for all users: {PASSWORD}")
            return

        now = timezone.now()

        with transaction.atomic():
            # 1. Tenant
            tenant = Tenant.objects.create(name=TENANT_NAME, slug=TENANT_SLUG)
            self.stdout.write(f"Created tenant: {tenant.slug}")

            # 2. Users + Members
            users = []
            for i in range(1, user_count + 1):
                email = f"loadtest+{i:02d}@{EMAIL_DOMAIN}"
                user = User.objects.create_user(
                    email=email,
                    password=PASSWORD,
                    first_name=f"Tester",
                    last_name=f"{i:02d}",
                )
                user.email_verified = True
                user.save(update_fields=["email_verified"])
                users.append(user)

            # First user is owner, rest are members
            TenantMember.objects.create(
                tenant=tenant, user=users[0], role=TenantRole.OWNER, is_active=True,
            )
            TenantMember.objects.bulk_create([
                TenantMember(
                    tenant=tenant, user=u, role=TenantRole.MEMBER, is_active=True,
                )
                for u in users[1:]
            ])
            self.stdout.write(f"Created {len(users)} users (1 owner + {len(users)-1} members)")

            # 3. Clients
            clients = Client.objects.bulk_create([
                Client(tenant=tenant, name=name) for name in CLIENT_NAMES
            ])
            self.stdout.write(f"Created {len(clients)} clients")

            # 4. Assets (each client gets all asset templates)
            assets_to_create = []
            for client in clients:
                for name, atype, target in ASSET_TEMPLATES:
                    assets_to_create.append(Asset(
                        tenant=tenant,
                        client=client,
                        name=f"{client.name} - {name}",
                        asset_type=atype,
                        environment=random.choice(AssetEnvironment.values),
                        criticality=random.choice(AssetCriticality.values),
                        target=target,
                    ))
            assets = Asset.objects.bulk_create(assets_to_create)
            self.stdout.write(f"Created {len(assets)} assets")

            # 5. Engagements (2 per client: 1 active, 1 completed)
            eng_statuses = [EngagementStatus.ACTIVE, EngagementStatus.COMPLETED]
            engagements = []
            for client in clients:
                for idx, status in enumerate(eng_statuses):
                    eng = Engagement.objects.create(
                        tenant=tenant,
                        name=f"{client.name} - Assessment Q{idx+1}",
                        client=client,
                        client_name=client.name,
                        status=status,
                        start_date=(now - timedelta(days=90 - idx * 45)).date(),
                        end_date=(now - timedelta(days=45 - idx * 45)).date() if status == EngagementStatus.COMPLETED else None,
                        created_by=random.choice(users),
                    )
                    engagements.append(eng)
            self.stdout.write(f"Created {len(engagements)} engagements")

            # 6. Sow + SowAssets (link client's assets to engagement's sow)
            sow_assets_to_create = []
            for eng in engagements:
                # Auto-created Sow may not exist if no signal — create if needed
                sow, _ = Sow.objects.get_or_create(engagement=eng, defaults={"title": f"SoW - {eng.name}"})
                client_assets = [a for a in assets if a.client_id == eng.client_id]
                for asset in client_assets[:5]:  # 5 assets per engagement
                    sow_assets_to_create.append(SowAsset(sow=sow, asset=asset, in_scope=True))
            SowAsset.objects.bulk_create(sow_assets_to_create, ignore_conflicts=True)
            self.stdout.write(f"Created {len(sow_assets_to_create)} scope assets")

            # 7. Findings (6-10 per engagement)
            findings_to_create = []
            for eng in engagements:
                client_assets = [a for a in assets if a.client_id == eng.client_id]
                num_findings = random.randint(6, 10)
                for _ in range(num_findings):
                    findings_to_create.append(Finding(
                        tenant=tenant,
                        engagement=eng,
                        asset=random.choice(client_assets) if client_assets else None,
                        title=random.choice(FINDING_TITLES),
                        severity=random.choices(SEVERITIES, weights=SEVERITY_WEIGHTS, k=1)[0],
                        assessment_area=random.choice(FINDING_CATEGORIES),
                        status=random.choices(STATUSES, weights=STATUS_WEIGHTS, k=1)[0],
                        description_md=f"## Description\n\nThis is a load-test finding for **{eng.name}**.\n\n"
                                       f"Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                        created_by=random.choice(users),
                    ))
            Finding.objects.bulk_create(findings_to_create)
            self.stdout.write(f"Created {len(findings_to_create)} findings")

        # Summary
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Load-test data seeded successfully!"))
        self.stdout.write(f"  Tenant:      {TENANT_SLUG}")
        self.stdout.write(f"  Users:       {user_count} (loadtest+01@{EMAIL_DOMAIN} .. loadtest+{user_count:02d}@{EMAIL_DOMAIN})")
        self.stdout.write(f"  Password:    {PASSWORD}")
        self.stdout.write(f"  Clients:     {len(clients)}")
        self.stdout.write(f"  Assets:      {len(assets)}")
        self.stdout.write(f"  Engagements: {len(engagements)}")
        self.stdout.write(f"  Findings:    {len(findings_to_create)}")
