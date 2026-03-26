"""Subscription models.

SubscriptionPlan  — defines a plan (Free, Pro, Enterprise, ...) with limit fields.
TenantSubscription — links a Tenant to its active plan.
"""

from django.db import models

from core.models import TimeStampedModel
from tenancy.models import Tenant


class SubscriptionStatus(models.TextChoices):
    ACTIVE = 'active', 'Active'
    EXPIRED = 'expired', 'Expired'
    CANCELLED = 'cancelled', 'Cancelled'


class SubscriptionPlan(TimeStampedModel):
    """A subscription plan that defines limits and feature flags.

    Limit fields use 0 to mean "unlimited".
    """

    name = models.CharField(max_length=100)
    code = models.SlugField(max_length=50, unique=True)
    description = models.TextField(blank=True, default='')
    is_default = models.BooleanField(
        default=False,
        help_text='Auto-assigned to new tenants on signup.',
    )
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    # --- Quantity limits (0 = unlimited) ---
    max_members = models.PositiveIntegerField(default=0)
    max_clients = models.PositiveIntegerField(default=0)
    max_assets = models.PositiveIntegerField(default=0)
    max_engagements = models.PositiveIntegerField(default=0)
    max_findings_per_engagement = models.PositiveIntegerField(default=0)
    max_images_per_finding = models.PositiveIntegerField(default=0)

    # --- Feature flags ---
    audit_log_enabled = models.BooleanField(default=True)
    data_export_enabled = models.BooleanField(default=False)
    custom_branding_enabled = models.BooleanField(default=False)

    class Meta:
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name

    def get_limit(self, field_name):
        """Return the limit value for a given field, or 0 (unlimited)."""
        return getattr(self, field_name, 0)


class TenantSubscription(TimeStampedModel):
    """Links a Tenant to a SubscriptionPlan."""

    tenant = models.OneToOneField(
        Tenant,
        on_delete=models.CASCADE,
        related_name='subscription',
    )
    plan = models.ForeignKey(
        SubscriptionPlan,
        on_delete=models.PROTECT,
        related_name='subscriptions',
    )
    status = models.CharField(
        max_length=20,
        choices=SubscriptionStatus.choices,
        default=SubscriptionStatus.ACTIVE,
    )
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.tenant.name} — {self.plan.name}'

    @property
    def is_active(self):
        return self.status == SubscriptionStatus.ACTIVE
