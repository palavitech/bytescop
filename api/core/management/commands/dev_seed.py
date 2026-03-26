"""Generate complete seed data for local development.

Flushes all existing data, then creates tenants, users, subscriptions,
classification entries, and domain data (clients, assets, engagements,
findings, audit logs).

Usage:
    python manage.py dev_seed          # flush + seed
    python manage.py dev_seed --no-flush   # seed without flushing (fails if data exists)
"""

import random
import uuid
from datetime import date, timedelta

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from account_settings.models import AccountSetting
from accounts.models import User
from assets.models import Asset, AssetCriticality, AssetEnvironment, AssetType
from audit.models import AuditAction, AuditLog
from audit.service import log_audit
from authorization.models import TenantGroup
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from clients.models import Client, ClientStatus
from comments.models import Comment
from core.rate_limit.models import RateLimitEntry
from engagements.models import (
    Engagement, EngagementSetting, EngagementStakeholder, EngagementStatus,
    Sow, SowAsset, SowStatus,
)
from evidence.models import Attachment
from findings.models import Finding
from subscriptions.models import TenantSubscription
from subscriptions.services import assign_default_plan
from tenancy.models import (
    InviteToken, Tenant, TenantClosure, TenantMember, TenantRole,
)


SEED_PASSWORD = 'BytesCop!2026'

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Edg/131.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
]

SEED_TENANTS = [
    {'name': 'Acme Security', 'slug': 'acme-security'},
    {'name': 'NovaCyber Labs', 'slug': 'novacyber-labs'},
    {'name': 'Redline Defense', 'slug': 'redline-defense'},
]

SEED_USERS = [
    {'email': 'alice.morgan@bytescop.example.com', 'first_name': 'Alice', 'last_name': 'Morgan',
     'group': 'Administrators', 'tenants': [0], 'owner_of': 0},
    {'email': 'bob.chen@bytescop.example.com', 'first_name': 'Bob', 'last_name': 'Chen',
     'group': 'Administrators', 'tenants': [0]},
    {'email': 'carol.santos@bytescop.example.com', 'first_name': 'Carol', 'last_name': 'Santos',
     'group': 'Analysts', 'tenants': [0, 1]},
    {'email': 'david.kim@bytescop.example.com', 'first_name': 'David', 'last_name': 'Kim',
     'group': 'Analysts', 'tenants': [0]},
    {'email': 'eva.novak@bytescop.example.com', 'first_name': 'Eva', 'last_name': 'Novak',
     'group': 'Administrators', 'tenants': [1], 'owner_of': 1},
    {'email': 'frank.osei@bytescop.example.com', 'first_name': 'Frank', 'last_name': 'Osei',
     'group': 'Analysts', 'tenants': [1, 2]},
    {'email': 'grace.taylor@bytescop.example.com', 'first_name': 'Grace', 'last_name': 'Taylor',
     'group': 'Collaborators', 'tenants': [1]},
    {'email': 'hiro.tanaka@bytescop.example.com', 'first_name': 'Hiro', 'last_name': 'Tanaka',
     'group': 'Administrators', 'tenants': [2], 'owner_of': 2},
    {'email': 'ivan.petrov@bytescop.example.com', 'first_name': 'Ivan', 'last_name': 'Petrov',
     'group': 'Analysts', 'tenants': [2, 0]},
    {'email': 'jada.williams@bytescop.example.com', 'first_name': 'Jada', 'last_name': 'Williams',
     'group': 'Collaborators', 'tenants': [2, 1]},
]

ORG_NAMES_BY_TENANT = [
    ['Nexus Dynamics', 'Apex Innovations', 'CloudBridge Ltd'],
    ['Sentinel Corp', 'Quantum Mesh Inc', 'HorizonTech'],
    ['Vaultline Systems', 'CyberForge Inc', 'Stealth Networks'],
]

ASSET_TEMPLATES = [
    ('api.{domain}', AssetType.API, 'REST API gateway'),
    ('app.{domain}', AssetType.WEBAPP, 'Customer portal'),
    ('admin.{domain}', AssetType.WEBAPP, 'Admin panel'),
    ('db-primary.{domain}', AssetType.HOST, 'Primary database server'),
    ('cdn.{domain}', AssetType.OTHER, 'CDN endpoint'),
    ('vpn.{domain}', AssetType.NETWORK_DEVICE, 'VPN gateway'),
    ('mobile-ios.{domain}', AssetType.MOBILE_APP, 'iOS application'),
    ('k8s-cluster.{domain}', AssetType.CLOUD, 'Kubernetes cluster'),
]

ENGAGEMENT_TEMPLATES = [
    'External Pentest',
    'Web Application Assessment',
    'API Security Review',
    'Cloud Infrastructure Audit',
]

FINDING_TITLES_WITH_CWE = [
    ('Broken access control on admin endpoints', 'CWE-284'),
    ('SQL injection in search parameter', 'CWE-89'),
    ('Stored XSS in user profile field', 'CWE-79'),
    ('Missing authentication on internal API', 'CWE-306'),
    ('Privilege escalation via IDOR', 'CWE-862'),
    ('Insecure TLS configuration', 'CWE-327'),
    ('Sensitive data exposure in error responses', 'CWE-200'),
    ('Missing rate limiting on login endpoint', 'CWE-770'),
    ('Weak password hashing algorithm', 'CWE-522'),
    ('Business logic flaw in payment flow', 'CWE-863'),
    ('CSRF token not validated on state-changing requests', 'CWE-352'),
    ('Server-side request forgery in URL import', 'CWE-918'),
    ('Open redirect in OAuth callback', 'CWE-601'),
    ('Insecure direct object reference in file download', 'CWE-862'),
    ('Information disclosure via verbose error messages', 'CWE-532'),
    ('XML external entity injection', 'CWE-611'),
    ('Insufficient logging and monitoring', 'CWE-778'),
    ('Unrestricted file upload', 'CWE-434'),
    ('Hardcoded credentials in client-side code', 'CWE-798'),
    ('Missing security headers', 'CWE-346'),
]

CATEGORIES = [
    'application_security',
    'network_security',
    'cloud_security',
    'auth_and_access_control',
    'cryptography',
    'configuration_and_deployment',
]


class _FakeRequest:
    """Lightweight request object that satisfies log_audit()."""

    def __init__(self, user, tenant, path='/api/dev/seed/'):
        self.user = user
        self.tenant = tenant
        self.request_id = str(uuid.uuid4())
        self._path = path
        self.META = {
            'REMOTE_ADDR': f'192.168.1.{random.randint(10, 200)}',
            'HTTP_USER_AGENT': random.choice(USER_AGENTS),
        }

    def get_full_path(self):
        return self._path


def _random_ts(days_back=30):
    offset = random.randint(0, days_back * 24 * 3600)
    return timezone.now() - timedelta(seconds=offset)


def _flush_all():
    """Delete everything across all tenants and users."""
    AuditLog.objects.all().delete()
    RateLimitEntry.objects.all().delete()
    Comment.objects.all().delete()
    AccountSetting.objects.all().delete()
    Attachment.objects.all().delete()
    Finding.objects.all().delete()
    EngagementStakeholder.objects.all().delete()
    EngagementSetting.objects.all().delete()
    SowAsset.objects.all().delete()
    Sow.objects.all().delete()
    Engagement.objects.all().delete()
    Asset.objects.all().delete()
    Client.objects.all().delete()
    TenantGroup.objects.all().delete()
    InviteToken.objects.all().delete()
    TenantClosure.objects.all().delete()
    TenantSubscription.objects.all().delete()
    TenantMember.objects.all().delete()
    Tenant.objects.all().delete()
    User.objects.all().delete()


def _seed_tenant_data(tenant, tenant_idx, tenant_users):
    """Generate domain data for one tenant. Returns counts dict."""
    today = date.today()
    audit_pks = []

    admins = [u for u in tenant_users if u['_group'] == 'Administrators']
    analysts = [u for u in tenant_users if u['_group'] == 'Analysts']
    active_users = admins + analysts
    all_users_objs = [u['_user'] for u in tenant_users]

    def _pick(pool):
        return random.choice(pool)['_user'] if pool else tenant_users[0]['_user']

    counts = {'organizations': 0, 'assets': 0, 'engagements': 0, 'findings': 0}

    # ── Clients ──
    org_names = ORG_NAMES_BY_TENANT[tenant_idx]
    clients = []
    for name in org_names:
        actor = _pick(active_users)
        c = Client.objects.create(
            tenant=tenant, name=name,
            website=f"https://{name.lower().replace(' ', '-')}.com",
            status=ClientStatus.ACTIVE, notes='Generated test data',
        )
        clients.append(c)
        counts['organizations'] += 1
        fake_req = _FakeRequest(actor, tenant, '/api/clients/')
        entry = log_audit(fake_req, action=AuditAction.CREATE, resource_type='client',
                          resource_id=str(c.pk), resource_repr=c.name,
                          after={'name': c.name, 'website': c.website, 'status': c.status})
        if entry:
            audit_pks.append(entry.pk)

    # ── Assets ──
    client_assets: dict[str, list[Asset]] = {}
    envs = list(AssetEnvironment)
    crits = list(AssetCriticality)

    for client in clients:
        domain = f"{client.name.lower().replace(' ', '')}.com"
        assets = []
        for tpl_name, atype, note in ASSET_TEMPLATES:
            actor = _pick(analysts or active_users)
            a = Asset.objects.create(
                tenant=tenant, client=client,
                name=tpl_name.format(domain=domain), asset_type=atype,
                environment=random.choice(envs), criticality=random.choice(crits),
                target=f"https://{tpl_name.format(domain=domain)}", notes=note,
            )
            assets.append(a)
            counts['assets'] += 1
            fake_req = _FakeRequest(actor, tenant, '/api/assets/')
            entry = log_audit(fake_req, action=AuditAction.CREATE, resource_type='asset',
                              resource_id=str(a.pk), resource_repr=a.name,
                              after={'name': a.name, 'asset_type': a.asset_type,
                                     'environment': a.environment, 'criticality': a.criticality})
            if entry:
                audit_pks.append(entry.pk)
        client_assets[str(client.id)] = assets

    # ── Engagements + SoWs + scope ──
    statuses = list(EngagementStatus)
    sow_statuses_map = {
        EngagementStatus.PLANNED: SowStatus.DRAFT,
        EngagementStatus.ACTIVE: SowStatus.APPROVED,
        EngagementStatus.ON_HOLD: SowStatus.APPROVED,
        EngagementStatus.COMPLETED: SowStatus.APPROVED,
    }

    all_engagements = []
    all_findings = []

    for client in clients:
        assets = client_assets[str(client.id)]
        for i, eng_name in enumerate(ENGAGEMENT_TEMPLATES):
            status = statuses[i % len(statuses)]
            actor = _pick(analysts or active_users)

            if status == EngagementStatus.COMPLETED:
                start = today - timedelta(days=random.randint(30, 60))
                end = today - timedelta(days=random.randint(1, 10))
            elif status == EngagementStatus.PLANNED:
                start = today + timedelta(days=random.randint(5, 20))
                end = start + timedelta(days=random.randint(14, 45))
            else:
                start = today - timedelta(days=random.randint(5, 15))
                end = today + timedelta(days=random.randint(10, 40))

            engagement = Engagement.objects.create(
                tenant=tenant, client=client, client_name=client.name,
                name=f'{client.name} — {eng_name}', status=status,
                start_date=start, end_date=end,
                notes=f'Auto-generated {eng_name.lower()} engagement.',
                created_by=actor,
            )
            all_engagements.append(engagement)
            counts['engagements'] += 1

            eng_path = f'/api/engagements/{engagement.pk}/'
            fake_req = _FakeRequest(actor, tenant, '/api/engagements/')
            entry = log_audit(fake_req, action=AuditAction.CREATE, resource_type='engagement',
                              resource_id=str(engagement.pk), resource_repr=engagement.name,
                              after={'name': engagement.name, 'status': engagement.status,
                                     'client': client.name, 'start_date': str(start), 'end_date': str(end)})
            if entry:
                audit_pks.append(entry.pk)

            sow = Sow.objects.create(
                engagement=engagement, title=f'SoW — {engagement.name}',
                status=sow_statuses_map.get(status, SowStatus.DRAFT),
            )
            fake_req = _FakeRequest(actor, tenant, f'{eng_path}sow/')
            entry = log_audit(fake_req, action=AuditAction.CREATE, resource_type='sow',
                              resource_id=str(sow.pk), resource_repr=sow.title,
                              after={'title': sow.title, 'status': sow.status})
            if entry:
                audit_pks.append(entry.pk)

            scoped = random.sample(assets, k=min(len(assets), random.randint(3, 6)))
            for a in scoped:
                sa = SowAsset.objects.create(sow=sow, asset=a, in_scope=True)
                fake_req = _FakeRequest(actor, tenant, f'{eng_path}scope/')
                entry = log_audit(fake_req, action=AuditAction.CREATE, resource_type='scope',
                                  resource_id=str(sa.pk),
                                  resource_repr=f'{a.name} → {engagement.name}',
                                  after={'asset': a.name, 'in_scope': True})
                if entry:
                    audit_pks.append(entry.pk)

            # Findings (skip PLANNED)
            if status == EngagementStatus.PLANNED:
                continue

            severities = ['critical', 'high', 'medium', 'low', 'info']
            finding_statuses = ['open', 'triage', 'accepted', 'fixed', 'false_positive']
            used_titles: set[str] = set()
            num_findings = random.randint(5, 12)

            for f_idx in range(num_findings):
                actor = _pick(analysts or active_users)
                base_title, cwe_id = random.choice(FINDING_TITLES_WITH_CWE)
                title = base_title if base_title not in used_titles else f'{base_title} ({f_idx + 1})'
                used_titles.add(title)

                sev = random.choice(severities)
                f_status = random.choice(finding_statuses)
                finding = Finding.objects.create(
                    tenant=tenant, engagement=engagement, asset=random.choice(scoped),
                    title=title, severity=sev, cwe_id=cwe_id,
                    assessment_area=random.choice(CATEGORIES), status=f_status,
                    description_md=f'## {title}\n\nAuto-generated finding for testing.',
                    created_by=actor,
                )
                all_findings.append(finding)
                counts['findings'] += 1

                fake_req = _FakeRequest(actor, tenant, f'{eng_path}findings/')
                entry = log_audit(fake_req, action=AuditAction.CREATE, resource_type='finding',
                                  resource_id=str(finding.pk), resource_repr=title,
                                  after={'title': title, 'severity': sev, 'status': f_status,
                                         'assessment_area': finding.assessment_area})
                if entry:
                    audit_pks.append(entry.pk)

    # ── UPDATE audit entries ──
    for c in random.sample(clients, k=min(2, len(clients))):
        actor = _pick(active_users)
        fake_req = _FakeRequest(actor, tenant, f'/api/clients/{c.pk}/')
        entry = log_audit(fake_req, action=AuditAction.UPDATE, resource_type='client',
                          resource_id=str(c.pk), resource_repr=c.name,
                          before={'notes': '', 'status': 'active'},
                          after={'notes': 'Updated contact information', 'status': 'active'})
        if entry:
            audit_pks.append(entry.pk)

    all_assets_qs = Asset.objects.filter(tenant=tenant)
    for a in random.sample(list(all_assets_qs), k=min(3, all_assets_qs.count())):
        actor = _pick(active_users)
        fake_req = _FakeRequest(actor, tenant, f'/api/assets/{a.pk}/')
        entry = log_audit(fake_req, action=AuditAction.UPDATE, resource_type='asset',
                          resource_id=str(a.pk), resource_repr=a.name,
                          before={'criticality': random.choice(['low', 'medium'])},
                          after={'criticality': random.choice(['high', 'critical'])})
        if entry:
            audit_pks.append(entry.pk)

    for eng in random.sample(all_engagements, k=min(3, len(all_engagements))):
        old_s, new_s = random.choice([
            ('planned', 'active'), ('active', 'on_hold'),
            ('on_hold', 'active'), ('active', 'completed'),
        ])
        actor = _pick(active_users)
        fake_req = _FakeRequest(actor, tenant, f'/api/engagements/{eng.pk}/')
        entry = log_audit(fake_req, action=AuditAction.UPDATE, resource_type='engagement',
                          resource_id=str(eng.pk), resource_repr=eng.name,
                          before={'status': old_s}, after={'status': new_s})
        if entry:
            audit_pks.append(entry.pk)

    for f in random.sample(all_findings, k=min(3, len(all_findings))):
        before, after = random.choice([
            ({'status': 'open'}, {'status': 'triage'}),
            ({'status': 'triage'}, {'status': 'accepted'}),
            ({'severity': 'medium', 'status': 'open'}, {'severity': 'high', 'status': 'triage'}),
            ({'status': 'accepted'}, {'status': 'fixed'}),
        ])
        actor = _pick(active_users)
        fake_req = _FakeRequest(actor, tenant, f'/api/engagements/{f.engagement_id}/findings/{f.pk}/')
        entry = log_audit(fake_req, action=AuditAction.UPDATE, resource_type='finding',
                          resource_id=str(f.pk), resource_repr=f.title,
                          before=before, after=after)
        if entry:
            audit_pks.append(entry.pk)

    # ── DELETE audit entries (throwaway findings) ──
    active_engs = [e for e in all_engagements if e.status != EngagementStatus.PLANNED]
    admin_users = [u['_user'] for u in admins] if admins else [tenant_users[0]['_user']]
    analyst_users = [u['_user'] for u in analysts] if analysts else [tenant_users[0]['_user']]

    for _ in range(random.randint(2, 4)):
        if not active_engs:
            break
        eng = random.choice(active_engs)
        scoped_assets = list(
            SowAsset.objects.filter(sow__engagement=eng, in_scope=True)
            .values_list('asset', flat=True)
        )
        if not scoped_assets:
            continue
        actor = random.choice(analyst_users)
        title = f'Duplicate — {random.choice(FINDING_TITLES_WITH_CWE)[0]}'
        finding = Finding.objects.create(
            tenant=tenant, engagement=eng, asset_id=random.choice(scoped_assets),
            title=title, severity=random.choice(['low', 'info']),
            assessment_area='configuration_and_deployment', status='open',
            description_md=f'## {title}\n\nDuplicate finding — removed.',
            created_by=actor,
        )
        fake_req = _FakeRequest(actor, tenant, f'/api/engagements/{eng.pk}/findings/')
        entry = log_audit(fake_req, action=AuditAction.CREATE, resource_type='finding',
                          resource_id=str(finding.pk), resource_repr=title,
                          after={'title': title, 'severity': finding.severity, 'status': 'open'})
        if entry:
            audit_pks.append(entry.pk)

        deleted_id = str(finding.pk)
        deleted_data = {'title': title, 'severity': finding.severity, 'status': 'open'}
        finding.delete()

        deleter = random.choice(admin_users)
        fake_req = _FakeRequest(deleter, tenant, f'/api/engagements/{eng.pk}/findings/{deleted_id}/')
        entry = log_audit(fake_req, action=AuditAction.DELETE, resource_type='finding',
                          resource_id=deleted_id, resource_repr=title, before=deleted_data)
        if entry:
            audit_pks.append(entry.pk)

    # ── LOGIN/LOGOUT entries ──
    for u_obj in all_users_objs:
        for _ in range(random.randint(2, 4)):
            fake_req = _FakeRequest(u_obj, tenant, '/api/auth/login/')
            entry = log_audit(fake_req, action=AuditAction.LOGIN_SUCCESS, resource_type='auth',
                              resource_repr=f'{u_obj.first_name} {u_obj.last_name} logged in')
            if entry:
                audit_pks.append(entry.pk)
        for _ in range(random.randint(1, 3)):
            fake_req = _FakeRequest(u_obj, tenant, '/api/auth/logout/')
            entry = log_audit(fake_req, action=AuditAction.LOGOUT, resource_type='auth',
                              resource_repr=f'{u_obj.first_name} {u_obj.last_name} logged out')
            if entry:
                audit_pks.append(entry.pk)

    failed_emails = ['attacker@malicious.example.com', 'admin@bytescop.example.com', 'test@test.example.com']
    for email in random.sample(failed_emails, k=random.randint(2, 3)):
        entry = AuditLog.objects.create(
            tenant=tenant, actor=None, actor_email=email,
            action=AuditAction.LOGIN_FAILED, resource_type='auth',
            resource_repr=f'Failed login attempt for {email}',
            ip_address=f'10.0.{random.randint(1, 50)}.{random.randint(1, 254)}',
            user_agent=random.choice(USER_AGENTS),
            request_id=str(uuid.uuid4()), request_path='/api/auth/login/',
        )
        audit_pks.append(entry.pk)

    # Backdate timestamps
    for pk in audit_pks:
        AuditLog.objects.filter(pk=pk).update(timestamp=_random_ts(30))

    counts['audit_entries'] = len(audit_pks)
    return counts


class Command(BaseCommand):
    help = 'Flush database and generate seed data (tenants, users, domain data).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--no-flush', action='store_true',
            help='Skip flushing existing data before seeding.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('This command is only available when DEBUG=True.')

        # ── Flush ──
        if not options['no_flush']:
            self.stdout.write('Flushing all data...')
            _flush_all()
            self.stdout.write(self.style.SUCCESS('  Flushed.'))

        now = timezone.now()

        # ── Step 1: Global reference data ──
        self.stdout.write('Seeding global reference data...')
        seed_permissions()
        call_command('ensure_subscription_plans', verbosity=0)
        call_command('ensure_classification_entries', verbosity=0)
        self.stdout.write(self.style.SUCCESS('  Permissions, plans, CWEs seeded.'))

        # ── Step 2: Tenants ──
        self.stdout.write('Creating tenants...')
        tenants = []
        for t_def in SEED_TENANTS:
            tenant = Tenant.objects.create(name=t_def['name'], slug=t_def['slug'])
            create_default_groups_for_tenant(tenant)
            assign_default_plan(tenant)
            AccountSetting.objects.create(
                tenant=tenant, key='company_name', value=t_def['name'],
            )
            tenants.append(tenant)
            self.stdout.write(f'  {tenant.name} ({tenant.slug})')

        # Build group lookups per tenant
        groups_per_tenant = {}
        for tenant in tenants:
            groups_per_tenant[tenant.pk] = {
                g.name: g for g in TenantGroup.objects.filter(tenant=tenant)
            }

        # ── Step 3: Users + memberships ──
        self.stdout.write('Creating users...')
        users_per_tenant: dict[int, list[dict]] = {i: [] for i in range(len(tenants))}

        for u_def in SEED_USERS:
            user = User.objects.create_user(
                email=u_def['email'], password=SEED_PASSWORD,
                first_name=u_def['first_name'], last_name=u_def['last_name'],
            )
            user.password_changed_at = now
            user.email_verified = True
            user.save(update_fields=['password_changed_at', 'email_verified'])

            tenant_names = []
            for t_idx in u_def['tenants']:
                tenant = tenants[t_idx]
                is_owner = u_def.get('owner_of') == t_idx
                is_primary = t_idx == u_def['tenants'][0]

                role = TenantRole.OWNER if is_owner else TenantRole.MEMBER
                member = TenantMember.objects.create(
                    tenant=tenant, user=user, role=role, is_active=True,
                )

                group_name = u_def['group'] if is_primary else 'Collaborators'
                group = groups_per_tenant[tenant.pk].get(group_name)
                if group:
                    member.groups.add(group)
                if is_owner:
                    admin_group = groups_per_tenant[tenant.pk].get('Administrators')
                    if admin_group:
                        member.groups.add(admin_group)

                users_per_tenant[t_idx].append({
                    '_user': user,
                    '_group': u_def['group'] if is_primary else 'Collaborators',
                })
                tenant_names.append(tenant.name)

            multi = f' (also in {", ".join(tenant_names[1:])})' if len(tenant_names) > 1 else ''
            role_label = 'OWNER' if 'owner_of' in u_def else u_def['group']
            self.stdout.write(f'  {user.email:45} {role_label:20} {tenant_names[0]}{multi}')

        # ── Step 4: Domain data per tenant ──
        totals = {'organizations': 0, 'assets': 0, 'engagements': 0, 'findings': 0, 'audit_entries': 0}
        for t_idx, tenant in enumerate(tenants):
            self.stdout.write(f'Generating data for {tenant.name}...')
            counts = _seed_tenant_data(tenant, t_idx, users_per_tenant[t_idx])
            for key in totals:
                totals[key] += counts.get(key, 0)
            self.stdout.write(
                f'  {counts["organizations"]} clients, {counts["assets"]} assets, '
                f'{counts["engagements"]} engagements, {counts["findings"]} findings, '
                f'{counts["audit_entries"]} audit entries'
            )

        # ── Summary ──
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=== Seed complete ==='))
        self.stdout.write(f'  Tenants:      {len(tenants)}')
        self.stdout.write(f'  Users:        {len(SEED_USERS)}')
        self.stdout.write(f'  Organizations:{totals["organizations"]}')
        self.stdout.write(f'  Assets:       {totals["assets"]}')
        self.stdout.write(f'  Engagements:  {totals["engagements"]}')
        self.stdout.write(f'  Findings:     {totals["findings"]}')
        self.stdout.write(f'  Audit entries:{totals["audit_entries"]}')
        self.stdout.write('')
        self.stdout.write(f'  Password (all users): {SEED_PASSWORD}')
        self.stdout.write('')
        self.stdout.write('  Tenants:')
        for t in tenants:
            self.stdout.write(f'    {t.name} → slug: {t.slug}')
