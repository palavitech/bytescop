from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class EngagementType(models.TextChoices):
    WEB_APP_PENTEST = 'web_app_pentest', 'Web App Pen Testing'
    EXTERNAL_PENTEST = 'external_pentest', 'External Pen Testing'
    MOBILE_PENTEST = 'mobile_pentest', 'Mobile Pen Testing'
    INTERNAL_PENTEST = 'internal_pentest', 'Internal Pen Testing'
    WIFI = 'wifi', 'WiFi Assessment'
    MALWARE_ANALYSIS = 'malware_analysis', 'Malware Analysis'
    DIGITAL_FORENSICS = 'digital_forensics', 'Digital Forensics'
    ACTIVE_DIRECTORY = 'active_directory', 'Active Directory'
    LINUX_AUDIT = 'linux_audit', 'Linux Server Audit'
    WINDOWS_AUDIT = 'windows_audit', 'Windows Audit'
    GENERAL = 'general', 'General / Other'


class EngagementStatus(models.TextChoices):
    PLANNED = 'planned', 'Planned'
    ACTIVE = 'active', 'Active'
    ON_HOLD = 'on_hold', 'On hold'
    COMPLETED = 'completed', 'Completed'


class SowStatus(models.TextChoices):
    DRAFT = 'draft', 'Draft'
    APPROVED = 'approved', 'Approved'


class Engagement(TimeStampedModel):
    tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.CASCADE,
        related_name='engagements',
    )
    name = models.CharField(max_length=200)
    engagement_type = models.CharField(
        max_length=30,
        choices=EngagementType.choices,
        default=EngagementType.GENERAL,
    )
    client = models.ForeignKey(
        'clients.Client',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='engagements',
    )
    client_name = models.CharField(max_length=200, blank=True, default='')
    status = models.CharField(
        max_length=20,
        choices=EngagementStatus.choices,
        default=EngagementStatus.PLANNED,
    )
    description = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='engagements_created',
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', '-created_at']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self) -> str:
        return self.name


class Sow(TimeStampedModel):
    engagement = models.OneToOneField(
        'engagements.Engagement',
        on_delete=models.CASCADE,
        related_name='sow',
    )
    title = models.CharField(max_length=240, default='', blank=True)
    status = models.CharField(
        max_length=20,
        choices=SowStatus.choices,
        default=SowStatus.DRAFT,
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.title or f'SoW for {self.engagement_id}'


class SowAsset(TimeStampedModel):
    sow = models.ForeignKey(
        'engagements.Sow',
        on_delete=models.CASCADE,
        related_name='sow_assets',
    )
    asset = models.ForeignKey(
        'assets.Asset',
        on_delete=models.PROTECT,
        related_name='sow_links',
    )
    in_scope = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['sow', 'asset'],
                name='uq_sow_asset_pair',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.sow} — {self.asset}'


class StakeholderRole(models.TextChoices):
    ACCOUNT_MANAGER = 'account_manager', 'Account Manager'
    PROJECT_MANAGER = 'project_manager', 'Project Manager'
    SECURITY_ENGINEER = 'security_engineer', 'Security Engineer'
    LEAD_TESTER = 'lead_tester', 'Lead Tester'
    QA_REVIEWER = 'qa_reviewer', 'QA Reviewer'
    CLIENT_POC = 'client_poc', 'Client Point of Contact'
    TECHNICAL_LEAD = 'technical_lead', 'Technical Lead'
    OBSERVER = 'observer', 'Observer'


class EngagementStakeholder(TimeStampedModel):
    """A designated stakeholder for an engagement.

    References an active TenantMember with a role in the engagement.
    """

    engagement = models.ForeignKey(
        'engagements.Engagement',
        on_delete=models.CASCADE,
        related_name='stakeholders',
    )
    member = models.ForeignKey(
        'tenancy.TenantMember',
        on_delete=models.CASCADE,
        related_name='stakeholder_entries',
    )
    role = models.CharField(
        max_length=30,
        choices=StakeholderRole.choices,
        default=StakeholderRole.ACCOUNT_MANAGER,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )

    class Meta(TimeStampedModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['engagement', 'member'],
                name='unique_engagement_stakeholder_member',
            ),
        ]

    def __str__(self) -> str:
        return f'Stakeholder: {self.member} ({self.engagement})'


class EngagementSetting(TimeStampedModel):
    """Engagement-scoped key-value setting override."""

    engagement = models.ForeignKey(
        'engagements.Engagement',
        on_delete=models.CASCADE,
        related_name='engagement_settings',
    )
    key = models.CharField(max_length=100)
    value = models.TextField(blank=True, default='')
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )

    class Meta(TimeStampedModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['engagement', 'key'],
                name='unique_engagement_setting_key',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.key}={self.value}'
