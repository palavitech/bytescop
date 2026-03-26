"""Permission-driven dashboard widget registry.

Each widget declares the permissions it requires. The ``get_dashboard_widgets``
function filters the catalogue based on the requesting user's effective
permissions, computes only the authorised data, and returns a list of widget
dicts ready for serialisation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from django.db.models import Case, Count, IntegerField, Q, Value, When
from django.utils import timezone

from assets.models import Asset
from audit.models import AuditLog
from clients.models import Client
from engagements.models import Engagement
from findings.models import Finding
from tenancy.models import TenantMember, TenantRole

logger = logging.getLogger("bytescop.dashboard")

# ---------------------------------------------------------------------------
# Widget definition
# ---------------------------------------------------------------------------

@dataclass
class WidgetDef:
    id: str
    title: str
    widget_type: str  # "stat" | "chart" | "table"
    size: str         # "sm" | "md" | "lg"
    required_permissions: list[str] = field(default_factory=list)
    build: Callable[..., dict[str, Any]] = field(default=lambda t: {})
    default_size: str = ''
    allowed_sizes: list[str] = field(default_factory=list)
    description: str = ''
    default_visible: bool = True


# ---------------------------------------------------------------------------
# Stat builders
# ---------------------------------------------------------------------------

def build_active_engagements(tenant, eng_ids=None, **kw) -> dict:
    qs = Engagement.objects.filter(tenant=tenant, status="active")
    if eng_ids is not None:
        qs = qs.filter(pk__in=eng_ids)
    return {"value": qs.count()}


def build_total_findings(tenant, eng_ids=None, **kw) -> dict:
    qs = Finding.objects.filter(tenant=tenant, is_draft=False)
    if eng_ids is not None:
        qs = qs.filter(engagement_id__in=eng_ids)
    return {"value": qs.count()}


def build_critical_high_findings(tenant, eng_ids=None, **kw) -> dict:
    qs = Finding.objects.filter(
        tenant=tenant, is_draft=False, severity__in=["critical", "high"],
    ).exclude(status__in=["fixed", "false_positive"])
    if eng_ids is not None:
        qs = qs.filter(engagement_id__in=eng_ids)
    return {"value": qs.count()}


def build_total_clients(tenant, eng_ids=None, **kw) -> dict:
    qs = Client.objects.filter(tenant=tenant)
    if eng_ids is not None:
        qs = qs.filter(engagements__pk__in=eng_ids).distinct()
    return {"value": qs.count()}


def build_total_assets(tenant, eng_ids=None, **kw) -> dict:
    qs = Asset.objects.filter(tenant=tenant)
    if eng_ids is not None:
        qs = qs.filter(sow_links__sow__engagement_id__in=eng_ids).distinct()
    return {"value": qs.count()}


def build_active_users(tenant, eng_ids=None, **kw) -> dict:
    # Active users is admin-only (requires user.view), so eng_ids not applied
    value = TenantMember.objects.filter(tenant=tenant, is_active=True).count()
    return {"value": value}


# ---------------------------------------------------------------------------
# Chart builders
# ---------------------------------------------------------------------------

SEVERITY_COLORS = {
    "critical": "#ff5c5c",
    "high": "#ffaa33",
    "medium": "#ffe066",
    "low": "#55ccff",
    "info": "rgba(201,212,255,0.7)",
}

STATUS_COLORS = {
    "open": "#ff5c5c",
    "triage": "#ffaa33",
    "accepted": "#ffe066",
    "fixed": "#00ffb3",
    "false_positive": "rgba(201,212,255,0.5)",
}

ENGAGEMENT_STATUS_COLORS = {
    "planned": "#55ccff",
    "active": "#00ffb3",
    "on_hold": "#ffaa33",
    "completed": "rgba(201,212,255,0.5)",
}

ASSET_TYPE_COLORS = {
    "host": "#00ffb3",
    "webapp": "#00b7ff",
    "api": "#ff5c5c",
    "cloud": "#a78bfa",
    "network_device": "#ffaa33",
    "mobile_app": "#f472b6",
    "other": "rgba(201,212,255,0.5)",
}

ASSET_TYPE_LABELS = {
    "host": "Host",
    "webapp": "WebApp",
    "api": "API",
    "cloud": "Cloud",
    "network_device": "Network Device",
    "mobile_app": "Mobile App",
    "other": "Other",
}

CRITICALITY_COLORS = {
    "high": "#ff5c5c",
    "medium": "#ffaa33",
    "low": "#55ccff",
}


def build_findings_by_severity(tenant, eng_ids=None, **kw) -> dict:
    base = Finding.objects.filter(tenant=tenant, is_draft=False)
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    qs = (
        base
        .values("severity")
        .annotate(count=Count("id"))
        .order_by()
    )
    counts = {row["severity"]: row["count"] for row in qs}
    labels = list(SEVERITY_COLORS.keys())
    return {
        "chart_type": "doughnut",
        "labels": [l.capitalize() for l in labels],
        "values": [counts.get(s, 0) for s in labels],
        "colors": [SEVERITY_COLORS[s] for s in labels],
    }


def build_findings_by_status(tenant, eng_ids=None, **kw) -> dict:
    base = Finding.objects.filter(tenant=tenant, is_draft=False)
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    qs = (
        base
        .values("status")
        .annotate(count=Count("id"))
        .order_by()
    )
    counts = {row["status"]: row["count"] for row in qs}
    labels = list(STATUS_COLORS.keys())
    return {
        "chart_type": "doughnut",
        "labels": [l.replace("_", " ").capitalize() for l in labels],
        "values": [counts.get(s, 0) for s in labels],
        "colors": [STATUS_COLORS[s] for s in labels],
    }


def build_engagement_status(tenant, eng_ids=None, **kw) -> dict:
    base = Engagement.objects.filter(tenant=tenant)
    if eng_ids is not None:
        base = base.filter(pk__in=eng_ids)
    qs = (
        base
        .values("status")
        .annotate(count=Count("id"))
        .order_by()
    )
    counts = {row["status"]: row["count"] for row in qs}
    labels = list(ENGAGEMENT_STATUS_COLORS.keys())
    return {
        "chart_type": "doughnut",
        "labels": [l.replace("_", " ").capitalize() for l in labels],
        "values": [counts.get(s, 0) for s in labels],
        "colors": [ENGAGEMENT_STATUS_COLORS[s] for s in labels],
    }


# ---------------------------------------------------------------------------
# Table builders
# ---------------------------------------------------------------------------

def build_recent_findings(tenant, eng_ids=None, **kw) -> dict:
    qs = Finding.objects.filter(tenant=tenant, is_draft=False)
    if eng_ids is not None:
        qs = qs.filter(engagement_id__in=eng_ids)
    rows = (
        qs.select_related("engagement")
        .order_by("-created_at")[:10]
    )
    return {
        "columns": ["Title", "Severity", "Status", "Engagement", "Date"],
        "rows": [
            [
                f.title,
                f.severity.capitalize(),
                f.status.replace("_", " ").capitalize(),
                f.engagement.name if f.engagement else "",
                f.created_at.strftime("%Y-%m-%d"),
            ]
            for f in rows
        ],
    }


def build_engagements_timeline(tenant, eng_ids=None, **kw) -> dict:
    base = Engagement.objects.filter(tenant=tenant)
    if eng_ids is not None:
        base = base.filter(pk__in=eng_ids)
    rows = (
        base
        .filter(Q(status="active") | Q(status="planned"))
        .select_related("client")
        .order_by("-created_at")[:10]
    )
    return {
        "columns": ["Name", "Client", "Status", "Start", "End"],
        "rows": [
            [
                e.name,
                e.client.name if e.client else e.client_name or "",
                e.status.replace("_", " ").capitalize(),
                e.start_date.strftime("%Y-%m-%d") if e.start_date else "",
                e.end_date.strftime("%Y-%m-%d") if e.end_date else "",
            ]
            for e in rows
        ],
    }


def build_recent_activity(tenant, eng_ids=None, **kw) -> dict:
    # Audit log is admin-only (requires audit.view), so eng_ids not applied
    rows = (
        AuditLog.objects.filter(tenant=tenant)
        .select_related("actor")
        .order_by("-timestamp")[:10]
    )
    return {
        "columns": ["Action", "Resource", "User", "Timestamp"],
        "rows": [
            [
                r.action.replace("_", " ").capitalize(),
                f"{r.resource_type} {r.resource_repr}".strip(),
                r.actor_email or (r.actor.email if r.actor else ""),
                r.timestamp.strftime("%Y-%m-%d %H:%M"),
            ]
            for r in rows
        ],
    }


# ---------------------------------------------------------------------------
# Analyst-specific builders
# ---------------------------------------------------------------------------

def build_my_engagements(tenant, eng_ids=None, **kw) -> dict:
    qs = Engagement.objects.filter(tenant=tenant, status="active")
    if eng_ids is not None:
        qs = qs.filter(pk__in=eng_ids)
    return {"value": qs.count()}


def build_my_open_findings(tenant, eng_ids=None, user=None, **kw) -> dict:
    qs = Finding.objects.filter(tenant=tenant, is_draft=False)
    if eng_ids is not None:
        qs = qs.filter(engagement_id__in=eng_ids)
    if user is not None:
        qs = qs.filter(created_by=user)
    qs = qs.exclude(status__in=["fixed", "false_positive"])
    return {"value": qs.count()}


def build_my_critical_high(tenant, eng_ids=None, user=None, **kw) -> dict:
    qs = Finding.objects.filter(
        tenant=tenant, is_draft=False, severity__in=["critical", "high"],
    ).exclude(status__in=["fixed", "false_positive"])
    if eng_ids is not None:
        qs = qs.filter(engagement_id__in=eng_ids)
    if user is not None:
        qs = qs.filter(created_by=user)
    return {"value": qs.count()}


def build_findings_this_week(tenant, eng_ids=None, user=None, **kw) -> dict:
    now = timezone.now()
    week_ago = now - timezone.timedelta(days=7)
    qs = Finding.objects.filter(
        tenant=tenant, is_draft=False, created_at__gte=week_ago,
    )
    if eng_ids is not None:
        qs = qs.filter(engagement_id__in=eng_ids)
    if user is not None:
        qs = qs.filter(created_by=user)
    return {"value": qs.count()}


def build_my_findings_by_severity(tenant, eng_ids=None, user=None, **kw) -> dict:
    base = Finding.objects.filter(tenant=tenant, is_draft=False)
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    if user is not None:
        base = base.filter(created_by=user)
    qs = base.values("severity").annotate(count=Count("id")).order_by()
    counts = {row["severity"]: row["count"] for row in qs}
    labels = list(SEVERITY_COLORS.keys())
    return {
        "chart_type": "doughnut",
        "labels": [l.capitalize() for l in labels],
        "values": [counts.get(s, 0) for s in labels],
        "colors": [SEVERITY_COLORS[s] for s in labels],
    }


def build_my_findings_by_status(tenant, eng_ids=None, user=None, **kw) -> dict:
    base = Finding.objects.filter(tenant=tenant, is_draft=False)
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    if user is not None:
        base = base.filter(created_by=user)
    qs = base.values("status").annotate(count=Count("id")).order_by()
    counts = {row["status"]: row["count"] for row in qs}
    labels = list(STATUS_COLORS.keys())
    return {
        "chart_type": "doughnut",
        "labels": [l.replace("_", " ").capitalize() for l in labels],
        "values": [counts.get(s, 0) for s in labels],
        "colors": [STATUS_COLORS[s] for s in labels],
    }


def build_my_findings_by_cwe(tenant, eng_ids=None, user=None, **kw) -> dict:
    """Top 10 CWEs across the analyst's findings, shown as a bar chart."""
    base = Finding.objects.filter(tenant=tenant, is_draft=False).exclude(cwe_id='')
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    if user is not None:
        base = base.filter(created_by=user)
    qs = (
        base.values("cwe_id")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    labels = [row["cwe_id"] for row in qs]
    values = [row["count"] for row in qs]
    bar_colors = [
        "#00ffb3",  # accent green
        "#00b7ff",  # accent blue
        "#ff5c5c",  # red
        "#ffaa33",  # orange
        "#ffe066",  # yellow
        "#a78bfa",  # violet
        "#f472b6",  # pink
        "#34d399",  # emerald
        "#38bdf8",  # sky
        "#fb923c",  # amber
    ]
    return {
        "chart_type": "bar",
        "labels": labels,
        "values": values,
        "colors": bar_colors[:len(labels)],
    }


def build_my_recent_findings(tenant, eng_ids=None, user=None, **kw) -> dict:
    qs = Finding.objects.filter(tenant=tenant, is_draft=False)
    if eng_ids is not None:
        qs = qs.filter(engagement_id__in=eng_ids)
    if user is not None:
        qs = qs.filter(created_by=user)
    rows = qs.select_related("engagement").order_by("-created_at")[:10]
    return {
        "columns": ["Title", "Severity", "Status", "Engagement", "Date"],
        "rows": [
            [
                f.title,
                f.severity.capitalize(),
                f.status.replace("_", " ").capitalize(),
                f.engagement.name if f.engagement else "",
                f.created_at.strftime("%Y-%m-%d"),
            ]
            for f in rows
        ],
    }


def build_upcoming_deadlines(tenant, eng_ids=None, **kw) -> dict:
    now = timezone.now().date()
    qs = Engagement.objects.filter(
        tenant=tenant,
        status__in=["active", "planned"],
        end_date__gte=now,
    ).order_by("end_date")
    if eng_ids is not None:
        qs = qs.filter(pk__in=eng_ids)
    rows = qs.select_related("client")[:10]
    return {
        "columns": ["Engagement", "Client", "Status", "End Date", "Days Left"],
        "rows": [
            [
                e.name,
                e.client.name if e.client else e.client_name or "",
                e.status.replace("_", " ").capitalize(),
                e.end_date.strftime("%Y-%m-%d") if e.end_date else "",
                str((e.end_date - now).days) if e.end_date else "",
            ]
            for e in rows
        ],
    }


# ---------------------------------------------------------------------------
# Collaborator-specific builders
# ---------------------------------------------------------------------------

def build_collab_findings_resolved_rate(tenant, eng_ids=None, **kw) -> dict:
    """Percentage of findings that are resolved (fixed or false positive)."""
    base = Finding.objects.filter(tenant=tenant, is_draft=False)
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    total = base.count()
    if total == 0:
        return {"value": 0, "suffix": "%"}
    resolved = base.filter(status__in=["fixed", "false_positive"]).count()
    return {"value": round(resolved / total * 100), "suffix": "%"}


def build_collab_engagement_progress(tenant, eng_ids=None, **kw) -> dict:
    """Per-engagement bar chart: resolved vs total findings."""
    base = Engagement.objects.filter(tenant=tenant)
    if eng_ids is not None:
        base = base.filter(pk__in=eng_ids)
    rows = (
        base.filter(status__in=["active", "planned"])
        .annotate(
            total=Count(
                "findings", filter=Q(findings__is_draft=False),
            ),
            resolved=Count(
                "findings",
                filter=Q(
                    findings__is_draft=False,
                    findings__status__in=["fixed", "false_positive"],
                ),
            ),
        )
        .order_by("-total")[:10]
    )
    labels = [e.name[:20] + '…' if len(e.name) > 20 else e.name for e in rows]
    resolved_vals = [e.resolved for e in rows]
    remaining_vals = [e.total - e.resolved for e in rows]
    return {
        "chart_type": "bar",
        "labels": labels,
        "stacked": True,
        "datasets": [
            {
                "label": "Resolved",
                "values": resolved_vals,
                "color": "#00ffb3",
            },
            {
                "label": "Remaining",
                "values": remaining_vals,
                "color": "rgba(201,212,255,0.3)",
            },
        ],
    }


def build_collab_engagement_summary(tenant, eng_ids=None, **kw) -> dict:
    """One row per engagement with finding counts."""
    base = Engagement.objects.filter(tenant=tenant)
    if eng_ids is not None:
        base = base.filter(pk__in=eng_ids)
    rows = (
        base.select_related("client")
        .annotate(
            total_findings=Count(
                "findings", filter=Q(findings__is_draft=False),
            ),
            critical_high_open=Count(
                "findings",
                filter=Q(
                    findings__is_draft=False,
                    findings__severity__in=["critical", "high"],
                ) & ~Q(findings__status__in=["fixed", "false_positive"]),
            ),
        )
        .order_by("-created_at")[:20]
    )
    return {
        "columns": ["Name", "Client", "Status", "Findings", "Critical/High Open", "End Date"],
        "rows": [
            [
                e.name,
                e.client.name if e.client else e.client_name or "",
                e.status.replace("_", " ").capitalize(),
                e.total_findings,
                e.critical_high_open,
                e.end_date.strftime("%Y-%m-%d") if e.end_date else "",
            ]
            for e in rows
        ],
    }


# ---------------------------------------------------------------------------
# Asset & countdown builders
# ---------------------------------------------------------------------------

BAR_COLORS_10 = [
    "#00ffb3",  # accent green
    "#00b7ff",  # accent blue
    "#ff5c5c",  # red
    "#ffaa33",  # orange
    "#ffe066",  # yellow
    "#a78bfa",  # violet
    "#f472b6",  # pink
    "#34d399",  # emerald
    "#38bdf8",  # sky
    "#fb923c",  # amber
]


def _medal_table_assets(base_qs, limit=10) -> list[dict]:
    """Rank assets using Olympic medal-table logic.

    Sort by critical count desc, then high desc, then medium desc, then low
    desc.  Volume of lower-severity findings never outranks a single
    higher-severity finding.
    """
    qs = (
        base_qs.values("asset__name")
        .annotate(
            n_critical=Count("id", filter=Q(severity="critical")),
            n_high=Count("id", filter=Q(severity="high")),
            n_medium=Count("id", filter=Q(severity="medium")),
            n_low=Count("id", filter=Q(severity="low")),
        )
        .order_by("-n_critical", "-n_high", "-n_medium", "-n_low")[:limit]
    )
    return list(qs)


def build_top_riskiest_assets(tenant, eng_ids=None, **kw) -> dict:
    """Top 10 assets ranked by severity (Olympic medal-table order)."""
    base = Finding.objects.filter(
        tenant=tenant, is_draft=False,
    ).exclude(status__in=["fixed", "false_positive"])
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    base = base.exclude(asset__isnull=True)
    rows = _medal_table_assets(base)
    labels = [row["asset__name"][:25] for row in rows]
    values = [
        row["n_critical"] + row["n_high"] + row["n_medium"] + row["n_low"]
        for row in rows
    ]
    return {
        "chart_type": "bar",
        "labels": labels,
        "values": values,
        "colors": BAR_COLORS_10[:len(labels)],
    }


def build_assets_by_type(tenant, eng_ids=None, **kw) -> dict:
    """Doughnut chart of assets grouped by type."""
    if eng_ids is not None:
        base = Asset.objects.filter(
            tenant=tenant,
            sow_links__sow__engagement_id__in=eng_ids,
        ).distinct()
    else:
        base = Asset.objects.filter(tenant=tenant)
    qs = base.values("asset_type").annotate(count=Count("id")).order_by()
    counts = {row["asset_type"]: row["count"] for row in qs}
    labels = list(ASSET_TYPE_COLORS.keys())
    return {
        "chart_type": "doughnut",
        "labels": [ASSET_TYPE_LABELS.get(t, t.capitalize()) for t in labels],
        "values": [counts.get(t, 0) for t in labels],
        "colors": [ASSET_TYPE_COLORS[t] for t in labels],
    }


def build_engagement_countdown(tenant, eng_ids=None, **kw) -> dict:
    """Bar chart showing days remaining for active/planned engagements."""
    today = timezone.now().date()
    base = Engagement.objects.filter(
        tenant=tenant,
        status__in=["active", "planned"],
        end_date__isnull=False,
        end_date__gte=today,
    ).order_by("end_date")
    if eng_ids is not None:
        base = base.filter(pk__in=eng_ids)
    rows = list(base[:10])
    labels = []
    values = []
    colors = []
    for e in rows:
        name = e.name[:20] + "\u2026" if len(e.name) > 20 else e.name
        labels.append(name)
        days_remaining = (e.end_date - today).days
        values.append(days_remaining)
        if days_remaining <= 3:
            colors.append("#ff5c5c")
        elif days_remaining <= 14:
            colors.append("#ffaa33")
        elif days_remaining <= 30:
            colors.append("#ffe066")
        else:
            colors.append("#00ffb3")
    return {
        "chart_type": "bar",
        "labels": labels,
        "values": values,
        "colors": colors,
    }


def build_my_top_assets_open(tenant, eng_ids=None, user=None, **kw) -> dict:
    """Top 10 assets ranked by severity (medal-table) for the current user."""
    base = Finding.objects.filter(
        tenant=tenant, is_draft=False,
        status__in=["open", "triage"],
    )
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    if user is not None:
        base = base.filter(created_by=user)
    base = base.exclude(asset__isnull=True)
    rows = _medal_table_assets(base)
    labels = [row["asset__name"][:25] for row in rows]
    values = [
        row["n_critical"] + row["n_high"] + row["n_medium"] + row["n_low"]
        for row in rows
    ]
    return {
        "chart_type": "bar",
        "labels": labels,
        "values": values,
        "colors": BAR_COLORS_10[:len(labels)],
    }


def build_asset_remediation_progress(tenant, eng_ids=None, **kw) -> dict:
    """Stacked bar: fixed vs remaining findings per asset."""
    base = Finding.objects.filter(
        tenant=tenant, is_draft=False,
    ).exclude(asset__isnull=True)
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    qs = (
        base.values("asset__name")
        .annotate(
            total=Count("id"),
            fixed=Count(
                "id",
                filter=Q(status__in=["fixed", "false_positive"]),
            ),
        )
        .order_by("-total")[:10]
    )
    rows = list(qs)
    labels = [
        row["asset__name"][:20] + "\u2026" if len(row["asset__name"]) > 20
        else row["asset__name"]
        for row in rows
    ]
    fixed_vals = [row["fixed"] for row in rows]
    remaining_vals = [row["total"] - row["fixed"] for row in rows]
    return {
        "chart_type": "bar",
        "labels": labels,
        "stacked": True,
        "datasets": [
            {
                "label": "Fixed",
                "values": fixed_vals,
                "color": "#00ffb3",
            },
            {
                "label": "Remaining",
                "values": remaining_vals,
                "color": "rgba(201,212,255,0.3)",
            },
        ],
    }


def build_riskiest_assets_table(tenant, eng_ids=None, **kw) -> dict:
    """Top 10 riskiest assets as a table with per-severity counts."""
    base = Finding.objects.filter(
        tenant=tenant, is_draft=False,
    ).exclude(status__in=["fixed", "false_positive"])
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    base = base.exclude(asset__isnull=True)
    rows = _medal_table_assets(base)
    return {
        "columns": ["Asset", "Critical", "High", "Medium", "Low", "Total"],
        "rows": [
            [
                row["asset__name"],
                row["n_critical"],
                row["n_high"],
                row["n_medium"],
                row["n_low"],
                row["n_critical"] + row["n_high"] + row["n_medium"] + row["n_low"],
            ]
            for row in rows
        ],
    }


SEVERITY_RANK = Case(
    When(severity="critical", then=Value(0)),
    When(severity="high", then=Value(1)),
    When(severity="medium", then=Value(2)),
    When(severity="low", then=Value(3)),
    When(severity="info", then=Value(4)),
    default=Value(5),
    output_field=IntegerField(),
)


def build_collab_top_unresolved(tenant, eng_ids=None, **kw) -> dict:
    """Top 10 unresolved findings ordered by severity then age."""
    now = timezone.now()
    base = Finding.objects.filter(
        tenant=tenant, is_draft=False,
    ).exclude(status__in=["fixed", "false_positive"])
    if eng_ids is not None:
        base = base.filter(engagement_id__in=eng_ids)
    rows = (
        base.select_related("engagement")
        .annotate(sev_rank=SEVERITY_RANK)
        .order_by("sev_rank", "created_at")[:10]
    )
    return {
        "columns": ["Title", "Severity", "Status", "Engagement", "Age (days)"],
        "rows": [
            [
                f.title,
                f.severity.capitalize(),
                f.status.replace("_", " ").capitalize(),
                f.engagement.name if f.engagement else "",
                (now - f.created_at).days,
            ]
            for f in rows
        ],
    }


# ---------------------------------------------------------------------------
# Coordinate-based grid constants
# ---------------------------------------------------------------------------

GRID_COLS = 6

COL_SPAN_BY_TYPE = {
    'stat': 1,
    'chart': 3,
    'table': 6,
}

# ---------------------------------------------------------------------------
# Size presets for the customizable grid (kept for backward compat)
# ---------------------------------------------------------------------------

# 6-column grid.  Keys are "{cols}x{rows}" presets.
SIZE_PRESETS = {
    '1x1': {'cols': 1, 'rows': 1},
    '2x1': {'cols': 2, 'rows': 1},
    '3x1': {'cols': 3, 'rows': 1},
    '3x2': {'cols': 3, 'rows': 2},
    '3x3': {'cols': 3, 'rows': 3},
    '6x1': {'cols': 6, 'rows': 1},
    '6x2': {'cols': 6, 'rows': 2},
    '6x3': {'cols': 6, 'rows': 3},
}

ALLOWED_SIZES_BY_TYPE = {
    'stat': ['1x1', '2x1', '3x1'],
    'chart': ['3x2', '3x3', '6x2', '6x3'],
    'table': ['3x2', '3x3', '6x2', '6x3'],
}

DEFAULT_SIZE_MAP = {
    'sm': '1x1',
    'md': '3x3',
    'lg': '6x3',
}


# ---------------------------------------------------------------------------
# Coordinate layout helpers
# ---------------------------------------------------------------------------

def compute_default_layout(registry, user_permissions, engagement_ids=None):
    """Pack default-visible widgets into (col, row) coordinates.

    Uses a simple left-to-right, top-to-bottom algorithm on a GRID_COLS-wide
    grid.  Returns a list of ``{widget_id, col, row}`` dicts.
    """
    result = []
    col = 0
    row = 0
    for wd in registry:
        if not wd.default_visible:
            continue
        if user_permissions != '__all__':
            if not all(p in user_permissions for p in wd.required_permissions):
                continue
        col_span = COL_SPAN_BY_TYPE.get(wd.widget_type, 1)
        if col + col_span > GRID_COLS:
            col = 0
            row += 1
        result.append({'widget_id': wd.id, 'col': col, 'row': row})
        col += col_span
        if col >= GRID_COLS:
            col = 0
            row += 1
    return result


def migrate_legacy_layout(widgets, registry):
    """Convert position-based layouts to coordinate-based layouts.

    Legacy format: ``[{widget_id, size, position}]``
    New format:    ``[{widget_id, col, row}]``

    Uses the same left-to-right packing algorithm as compute_default_layout,
    iterating widgets in their saved order (sorted by position).
    """
    reg_by_id = {wd.id: wd for wd in registry}
    sorted_items = sorted(widgets, key=lambda x: x.get('position', 0))
    result = []
    col = 0
    row = 0
    for item in sorted_items:
        widget_id = item.get('widget_id', '')
        wd = reg_by_id.get(widget_id)
        if wd is None:
            continue
        col_span = COL_SPAN_BY_TYPE.get(wd.widget_type, 1)
        if col + col_span > GRID_COLS:
            col = 0
            row += 1
        result.append({'widget_id': widget_id, 'col': col, 'row': row})
        col += col_span
        if col >= GRID_COLS:
            col = 0
            row += 1
    return result


# ---------------------------------------------------------------------------
# Widget registry
# ---------------------------------------------------------------------------

WIDGET_REGISTRY: list[WidgetDef] = [
    # Stats
    WidgetDef(
        id="active_engagements",
        title="Active Engagements",
        widget_type="stat",
        size="sm",
        required_permissions=["engagement.view"],
        build=build_active_engagements,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Count of active engagements",
    ),
    WidgetDef(
        id="total_findings",
        title="Total Findings",
        widget_type="stat",
        size="sm",
        required_permissions=["finding.view"],
        build=build_total_findings,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Total non-draft findings across all engagements",
    ),
    WidgetDef(
        id="critical_high_findings",
        title="Critical & High",
        widget_type="stat",
        size="sm",
        required_permissions=["finding.view"],
        build=build_critical_high_findings,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Unresolved critical and high severity findings",
    ),
    WidgetDef(
        id="total_clients",
        title="Total Clients",
        widget_type="stat",
        size="sm",
        required_permissions=["client.view"],
        build=build_total_clients,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Total client organizations",
    ),
    WidgetDef(
        id="total_assets",
        title="Total Assets",
        widget_type="stat",
        size="sm",
        required_permissions=["asset.view"],
        build=build_total_assets,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Total assets across all clients",
    ),
    WidgetDef(
        id="active_users",
        title="Active Users",
        widget_type="stat",
        size="sm",
        required_permissions=["user.view"],
        build=build_active_users,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Active users in the organization",
    ),
    # Charts
    WidgetDef(
        id="findings_by_severity",
        title="Findings by Severity",
        widget_type="chart",
        size="md",
        required_permissions=["finding.view"],
        build=build_findings_by_severity,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Doughnut chart of findings grouped by severity level",
        default_visible=False,
    ),
    WidgetDef(
        id="findings_by_status",
        title="Findings by Status",
        widget_type="chart",
        size="md",
        required_permissions=["finding.view"],
        build=build_findings_by_status,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Doughnut chart of findings grouped by status",
        default_visible=False,
    ),
    WidgetDef(
        id="engagement_status",
        title="Engagement Status",
        widget_type="chart",
        size="md",
        required_permissions=["engagement.view"],
        build=build_engagement_status,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Doughnut chart of engagement statuses",
    ),
    WidgetDef(
        id="top_riskiest_assets",
        title="Top 10 Riskiest Assets",
        widget_type="chart",
        size="md",
        required_permissions=["finding.view", "asset.view"],
        build=build_top_riskiest_assets,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Top 10 assets ranked by severity (medal-table)",
        default_visible=False,
    ),
    WidgetDef(
        id="assets_by_type",
        title="Assets by Type",
        widget_type="chart",
        size="md",
        required_permissions=["asset.view"],
        build=build_assets_by_type,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Doughnut chart of assets grouped by type",
    ),
    WidgetDef(
        id="engagement_countdown",
        title="Engagement Countdown",
        widget_type="chart",
        size="md",
        required_permissions=["engagement.view"],
        build=build_engagement_countdown,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Days remaining for active engagements",
    ),
    # Tables
    WidgetDef(
        id="recent_findings",
        title="Recent Findings",
        widget_type="table",
        size="lg",
        required_permissions=["finding.view"],
        build=build_recent_findings,
        default_size="6x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['table'],
        description="10 most recent findings with details",
        default_visible=False,
    ),
    WidgetDef(
        id="engagements_timeline",
        title="Engagements Timeline",
        widget_type="table",
        size="lg",
        required_permissions=["engagement.view"],
        build=build_engagements_timeline,
        default_size="6x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['table'],
        description="Active and planned engagements with dates",
    ),
    WidgetDef(
        id="recent_activity",
        title="Recent Activity",
        widget_type="table",
        size="lg",
        required_permissions=["audit.view"],
        build=build_recent_activity,
        default_size="6x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['table'],
        description="10 most recent audit log entries",
    ),
    WidgetDef(
        id="riskiest_assets_table",
        title="Top Riskiest Assets",
        widget_type="table",
        size="lg",
        required_permissions=["finding.view", "asset.view"],
        build=build_riskiest_assets_table,
        default_size="6x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['table'],
        description="Top 10 assets ranked by severity with per-severity counts",
        default_visible=False,
    ),
]

ANALYST_WIDGET_REGISTRY: list[WidgetDef] = [
    # Stats
    WidgetDef(
        id="my_engagements",
        title="My Engagements",
        widget_type="stat",
        size="sm",
        required_permissions=["engagement.view"],
        build=build_my_engagements,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Count of your active engagements",
    ),
    WidgetDef(
        id="my_open_findings",
        title="My Open Findings",
        widget_type="stat",
        size="sm",
        required_permissions=["finding.view"],
        build=build_my_open_findings,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Your open findings count",
    ),
    WidgetDef(
        id="my_critical_high",
        title="My Critical & High",
        widget_type="stat",
        size="sm",
        required_permissions=["finding.view"],
        build=build_my_critical_high,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Your unresolved critical and high findings",
    ),
    WidgetDef(
        id="findings_this_week",
        title="Findings This Week",
        widget_type="stat",
        size="sm",
        required_permissions=["finding.view"],
        build=build_findings_this_week,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Findings you created this week",
    ),
    # Charts
    WidgetDef(
        id="my_findings_by_severity",
        title="My Findings by Severity",
        widget_type="chart",
        size="md",
        required_permissions=["finding.view"],
        build=build_my_findings_by_severity,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Your findings grouped by severity level",
    ),
    WidgetDef(
        id="my_findings_by_status",
        title="My Findings by Status",
        widget_type="chart",
        size="md",
        required_permissions=["finding.view"],
        build=build_my_findings_by_status,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Your findings grouped by status",
    ),
    WidgetDef(
        id="my_findings_by_cwe",
        title="Top CWEs",
        widget_type="chart",
        size="md",
        required_permissions=["finding.view"],
        build=build_my_findings_by_cwe,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Your top 10 CWEs by finding count",
    ),
    WidgetDef(
        id="my_top_assets_open",
        title="My Top Assets by Open Findings",
        widget_type="chart",
        size="md",
        required_permissions=["finding.view"],
        build=build_my_top_assets_open,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Your top assets by open finding count",
    ),
    WidgetDef(
        id="top_riskiest_assets",
        title="Top 10 Riskiest Assets",
        widget_type="chart",
        size="md",
        required_permissions=["finding.view", "asset.view"],
        build=build_top_riskiest_assets,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Top 10 assets ranked by severity (medal-table)",
    ),
    WidgetDef(
        id="my_engagement_countdown",
        title="My Engagement Countdown",
        widget_type="chart",
        size="md",
        required_permissions=["engagement.view"],
        build=build_engagement_countdown,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Days remaining for your engagements",
    ),
    WidgetDef(
        id="my_engagements_by_status",
        title="My Engagements by Status",
        widget_type="chart",
        size="md",
        required_permissions=["engagement.view"],
        build=build_engagement_status,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Your engagements grouped by status",
    ),
    # Tables
    WidgetDef(
        id="my_recent_findings",
        title="Recent Findings",
        widget_type="table",
        size="lg",
        required_permissions=["finding.view"],
        build=build_my_recent_findings,
        default_size="6x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['table'],
        description="Your 10 most recent findings",
    ),
    WidgetDef(
        id="upcoming_deadlines",
        title="Upcoming Deadlines",
        widget_type="table",
        size="lg",
        required_permissions=["engagement.view"],
        build=build_upcoming_deadlines,
        default_size="6x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['table'],
        description="Upcoming engagement deadlines",
    ),
    WidgetDef(
        id="my_riskiest_assets_table",
        title="My Top Riskiest Assets",
        widget_type="table",
        size="lg",
        required_permissions=["finding.view", "asset.view"],
        build=build_riskiest_assets_table,
        default_size="6x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['table'],
        description="Your top 10 assets ranked by severity with per-severity counts",
    ),
]

COLLABORATOR_WIDGET_REGISTRY: list[WidgetDef] = [
    # Stats
    WidgetDef(
        id="engagements_in_progress",
        title="Engagements In Progress",
        widget_type="stat", size="sm",
        required_permissions=["engagement.view"],
        build=build_active_engagements,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Count of engagements currently in progress",
    ),
    WidgetDef(
        id="total_findings",
        title="Total Findings",
        widget_type="stat", size="sm",
        required_permissions=["finding.view"],
        build=build_total_findings,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Total non-draft findings across all engagements",
    ),
    WidgetDef(
        id="unresolved_critical_high",
        title="Unresolved Critical & High",
        widget_type="stat", size="sm",
        required_permissions=["finding.view"],
        build=build_critical_high_findings,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Unresolved critical and high findings",
    ),
    WidgetDef(
        id="findings_resolved_rate",
        title="Resolved Rate",
        widget_type="stat", size="sm",
        required_permissions=["finding.view"],
        build=build_collab_findings_resolved_rate,
        default_size="1x1",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['stat'],
        description="Percentage of findings resolved",
    ),
    # Charts
    WidgetDef(
        id="findings_severity_breakdown",
        title="Findings by Severity",
        widget_type="chart", size="md",
        required_permissions=["finding.view"],
        build=build_findings_by_severity,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Findings grouped by severity level",
    ),
    WidgetDef(
        id="findings_status_breakdown",
        title="Findings by Status",
        widget_type="chart", size="md",
        required_permissions=["finding.view"],
        build=build_findings_by_status,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Findings grouped by status",
    ),
    WidgetDef(
        id="engagement_progress",
        title="Engagement Progress",
        widget_type="chart", size="md",
        required_permissions=["engagement.view", "finding.view"],
        build=build_collab_engagement_progress,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Per-engagement resolved vs remaining findings",
    ),
    WidgetDef(
        id="asset_remediation_progress",
        title="Asset Remediation Progress",
        widget_type="chart", size="md",
        required_permissions=["finding.view", "asset.view"],
        build=build_asset_remediation_progress,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Per-asset fixed vs remaining findings",
    ),
    WidgetDef(
        id="top_riskiest_assets",
        title="Top 10 Riskiest Assets",
        widget_type="chart", size="md",
        required_permissions=["finding.view", "asset.view"],
        build=build_top_riskiest_assets,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Top 10 assets ranked by severity (medal-table)",
    ),
    WidgetDef(
        id="engagement_countdown",
        title="Engagement Countdown",
        widget_type="chart", size="md",
        required_permissions=["engagement.view"],
        build=build_engagement_countdown,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Days remaining for active engagements",
    ),
    WidgetDef(
        id="engagements_by_status",
        title="Engagements by Status",
        widget_type="chart", size="md",
        required_permissions=["engagement.view"],
        build=build_engagement_status,
        default_size="3x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['chart'],
        description="Engagements grouped by status",
    ),
    # Tables
    WidgetDef(
        id="engagement_summary",
        title="Engagement Summary",
        widget_type="table", size="lg",
        required_permissions=["engagement.view", "finding.view"],
        build=build_collab_engagement_summary,
        default_size="6x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['table'],
        description="Engagement summary with finding counts",
    ),
    WidgetDef(
        id="top_unresolved_findings",
        title="Top Unresolved Findings",
        widget_type="table", size="lg",
        required_permissions=["finding.view"],
        build=build_collab_top_unresolved,
        default_size="6x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['table'],
        description="Top unresolved findings by severity and age",
    ),
    WidgetDef(
        id="collab_riskiest_assets_table",
        title="Top Riskiest Assets",
        widget_type="table",
        size="lg",
        required_permissions=["finding.view", "asset.view"],
        build=build_riskiest_assets_table,
        default_size="6x3",
        allowed_sizes=ALLOWED_SIZES_BY_TYPE['table'],
        description="Top 10 assets ranked by severity with per-severity counts",
    ),
]


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

def get_dashboard_alerts(tenant, member) -> list[dict[str, str]]:
    """Return a list of actionable alerts for the dashboard.

    Each alert is a dict with: id, level ('warning'|'danger'), title, message, action_label, action_url.
    Only returns alerts relevant to the current user's role.
    """
    alerts: list[dict[str, str]] = []

    # Single-owner warning — only shown to owners
    if member.role == TenantRole.OWNER:
        owner_count = TenantMember.objects.filter(
            tenant=tenant, role=TenantRole.OWNER, is_active=True,
        ).count()
        if owner_count < 2:
            alerts.append({
                "id": "single_owner",
                "level": "warning",
                "title": "Single Owner Account",
                "message": (
                    "Your organization has only one owner. "
                    "If you lose access to your account, MFA device, or backup codes, "
                    "there will be no way to recover. "
                    "Add a second owner to prevent lockout."
                ),
                "action_label": "Manage Users",
                "action_url": "/admin/users",
            })

    return alerts


def get_collaborator_alerts(tenant, eng_ids) -> list[dict[str, str]]:
    """Return alerts relevant to a collaborator (management oversight)."""
    alerts: list[dict[str, str]] = []

    if eng_ids is None:
        return alerts

    # Overdue engagements — past end_date but still active
    now = timezone.now().date()
    overdue = Engagement.objects.filter(
        tenant=tenant, pk__in=eng_ids, status="active",
        end_date__lt=now,
    )[:5]
    for eng in overdue:
        alerts.append({
            "id": f"overdue_{eng.pk}",
            "level": "warning",
            "title": "Overdue Engagement",
            "message": f'"{eng.name}" is past its end date ({eng.end_date}).',
            "action_label": "View Engagement",
            "action_url": f"/engagements/{eng.pk}",
        })

    # Stale critical findings — open for more than 14 days
    cutoff = timezone.now() - timezone.timedelta(days=14)
    stale = Finding.objects.filter(
        tenant=tenant, engagement_id__in=eng_ids, is_draft=False,
        severity="critical", status="open", created_at__lte=cutoff,
    ).select_related("engagement")[:5]
    for f in stale:
        age = (timezone.now() - f.created_at).days
        alerts.append({
            "id": f"stale_critical_{f.pk}",
            "level": "danger",
            "title": "Stale Critical Finding",
            "message": f'"{f.title}" has been open for {age} days.',
            "action_label": "View Finding",
            "action_url": f"/engagements/{f.engagement_id}/findings/{f.pk}",
        })

    return alerts


REGISTRY_MAP = {
    'default': WIDGET_REGISTRY,
    'analyst': ANALYST_WIDGET_REGISTRY,
    'collaborator': COLLABORATOR_WIDGET_REGISTRY,
}


def get_widget_catalog(user_permissions, view=None):
    """Return metadata-only widget catalog (no data built)."""
    registry = REGISTRY_MAP.get(view or 'default', WIDGET_REGISTRY)
    catalog = []
    for wd in registry:
        if user_permissions != "__all__":
            if not all(p in user_permissions for p in wd.required_permissions):
                continue
        catalog.append({
            'id': wd.id,
            'title': wd.title,
            'type': wd.widget_type,
            'col_span': COL_SPAN_BY_TYPE.get(wd.widget_type, 1),
            'default_size': wd.default_size,
            'allowed_sizes': wd.allowed_sizes,
            'description': wd.description,
        })
    return catalog


def _is_legacy_layout(layout):
    """Detect whether a saved layout uses the old position/size format."""
    if not layout:
        return False
    first = layout[0]
    return ('position' in first or 'size' in first) and 'col' not in first


def get_dashboard_widgets(
    tenant,
    user_permissions,
    engagement_ids=None,
    user=None,
    view=None,
    layout=None,
) -> list[dict[str, Any]]:
    """Build the list of widgets the user is allowed to see.

    *user_permissions* should be ``"__all__"`` for root users (owner bypass)
    or a ``set[str]`` of permission codenames.

    *engagement_ids* should be ``None`` for full-visibility users or a
    ``set`` of engagement PKs for engagement-scoped users.

    *view* can be ``"analyst"``, ``"collaborator"``, or ``None`` (auto).

    *layout* is an optional list of dicts with widget_id, col, row.
    When provided, only the specified widgets are built in layout order.
    Legacy layouts (with position/size) are auto-migrated.
    """
    if layout is not None:
        registry = REGISTRY_MAP.get(view or 'default', WIDGET_REGISTRY)
        reg_by_id = {wd.id: wd for wd in registry}

        # Auto-migrate legacy layouts
        if _is_legacy_layout(layout):
            layout = migrate_legacy_layout(layout, registry)

        # Sort by row then col for deterministic order
        sorted_items = sorted(layout, key=lambda x: (x.get('row', 0), x.get('col', 0)))
        widgets = []
        for item in sorted_items:
            wd = reg_by_id.get(item.get('widget_id', ''))
            if wd is None:
                continue
            if user_permissions != "__all__":
                if not all(p in user_permissions for p in wd.required_permissions):
                    continue
            try:
                data = wd.build(tenant, eng_ids=engagement_ids, user=user)
            except Exception:
                logger.exception("Widget %s build failed for tenant %s", wd.id, tenant)
                continue
            col_span = COL_SPAN_BY_TYPE.get(wd.widget_type, 1)
            size = item.get('size', wd.default_size)
            if size not in SIZE_PRESETS:
                size = wd.default_size
            widgets.append({
                'id': wd.id,
                'title': wd.title,
                'type': wd.widget_type,
                'col': item.get('col', 0),
                'row': item.get('row', 0),
                'col_span': col_span,
                'size': size,
                'data': data,
            })
        return widgets

    if view == "collaborator":
        registry = COLLABORATOR_WIDGET_REGISTRY
    elif view == "analyst" or engagement_ids is not None:
        registry = ANALYST_WIDGET_REGISTRY
    else:
        registry = WIDGET_REGISTRY

    # Compute default coordinate layout
    default_coords = compute_default_layout(registry, user_permissions, engagement_ids)
    coords_by_id = {item['widget_id']: item for item in default_coords}

    widgets: list[dict[str, Any]] = []

    for wd in registry:
        # Only show default-visible widgets when no custom layout
        if not wd.default_visible:
            continue

        # Permission check
        if user_permissions != "__all__":
            if not all(p in user_permissions for p in wd.required_permissions):
                continue

        try:
            data = wd.build(tenant, eng_ids=engagement_ids, user=user)
        except Exception:
            logger.exception("Widget %s build failed for tenant %s", wd.id, tenant)
            continue

        coords = coords_by_id.get(wd.id, {'col': 0, 'row': 0})
        col_span = COL_SPAN_BY_TYPE.get(wd.widget_type, 1)
        widgets.append({
            "id": wd.id,
            "title": wd.title,
            "type": wd.widget_type,
            "col": coords['col'],
            "row": coords['row'],
            "col_span": col_span,
            "size": wd.default_size or DEFAULT_SIZE_MAP.get(wd.size, wd.size),
            "data": data,
        })

    return widgets
