"""Tests for the permission-driven dashboard API."""

from django.test import TestCase
from rest_framework.test import APITestCase

from accounts.models import User
from assets.models import Asset
from audit.models import AuditLog
from authorization.models import Permission, TenantGroup
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from clients.models import Client
from core.test_utils import login_as
from engagements.models import Engagement
from findings.models import Finding
from tenancy.models import Tenant, TenantMember, TenantRole

from api.dashboard import (
    COLLABORATOR_WIDGET_REGISTRY,
    WIDGET_REGISTRY,
    build_active_engagements,
    build_active_users,
    build_collab_engagement_progress,
    build_collab_engagement_summary,
    build_collab_findings_resolved_rate,
    build_collab_top_unresolved,
    build_critical_high_findings,
    build_engagement_status,
    build_engagements_timeline,
    build_findings_by_severity,
    build_findings_by_status,
    build_recent_activity,
    build_recent_findings,
    build_top_riskiest_assets,
    build_total_assets,
    build_total_clients,
    build_total_findings,
    get_collaborator_alerts,
    get_dashboard_widgets,
)

STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp", **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


def _seed_test_data(tenant, user):
    """Create sample domain objects for builder tests."""
    client = Client.objects.create(tenant=tenant, name="Test Client")
    asset = Asset.objects.create(tenant=tenant, name="web.example.com", client=client)

    eng1 = Engagement.objects.create(
        tenant=tenant, name="Web Audit", client=client, status="active",
        start_date="2026-03-01", end_date="2026-03-31", created_by=user,
    )
    eng2 = Engagement.objects.create(
        tenant=tenant, name="API Review", status="planned",
        start_date="2026-04-01", created_by=user,
    )

    findings = []
    for sev in ["critical", "high", "medium", "low", "info"]:
        findings.append(Finding.objects.create(
            tenant=tenant, engagement=eng1, asset=asset,
            title=f"{sev.capitalize()} Finding", severity=sev,
            status="open", created_by=user,
        ))
    # One fixed finding
    Finding.objects.create(
        tenant=tenant, engagement=eng1, title="Fixed Bug",
        severity="medium", status="fixed", created_by=user,
    )

    AuditLog.objects.create(
        tenant=tenant, actor=user, actor_email=user.email,
        action="create", resource_type="engagement",
        resource_repr="Web Audit",
    )

    return {
        "client": client, "asset": asset,
        "eng1": eng1, "eng2": eng2, "findings": findings,
    }


# ---------------------------------------------------------------------------
# Builder unit tests
# ---------------------------------------------------------------------------


class StatBuilderTests(TestCase):
    """Each stat builder returns the correct count."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)
        self.data = _seed_test_data(self.tenant, self.user)

    def test_active_engagements(self):
        result = build_active_engagements(self.tenant)
        self.assertEqual(result, {"value": 1})  # only eng1 is active

    def test_total_findings(self):
        result = build_total_findings(self.tenant)
        self.assertEqual(result, {"value": 6})  # 5 open + 1 fixed

    def test_critical_high_findings(self):
        result = build_critical_high_findings(self.tenant)
        # Only open critical + high (excludes fixed/false_positive)
        self.assertEqual(result, {"value": 2})

    def test_total_clients(self):
        result = build_total_clients(self.tenant)
        self.assertEqual(result, {"value": 1})

    def test_total_assets(self):
        result = build_total_assets(self.tenant)
        self.assertEqual(result, {"value": 1})

    def test_active_users(self):
        result = build_active_users(self.tenant)
        self.assertEqual(result, {"value": 1})


class ChartBuilderTests(TestCase):
    """Chart builders return the correct shape."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)
        self.data = _seed_test_data(self.tenant, self.user)

    def test_findings_by_severity_shape(self):
        result = build_findings_by_severity(self.tenant)
        self.assertEqual(result["chart_type"], "doughnut")
        self.assertEqual(len(result["labels"]), 5)
        self.assertEqual(len(result["values"]), 5)
        self.assertEqual(len(result["colors"]), 5)
        # Critical=1, High=1, Medium=2, Low=1, Info=1
        self.assertEqual(sum(result["values"]), 6)

    def test_findings_by_status_shape(self):
        result = build_findings_by_status(self.tenant)
        self.assertEqual(result["chart_type"], "doughnut")
        self.assertIn("Open", result["labels"])
        self.assertIn("Fixed", result["labels"])
        self.assertEqual(sum(result["values"]), 6)

    def test_engagement_status_shape(self):
        result = build_engagement_status(self.tenant)
        self.assertEqual(result["chart_type"], "doughnut")
        self.assertIn("Active", result["labels"])
        self.assertIn("Planned", result["labels"])
        self.assertEqual(sum(result["values"]), 2)


class TableBuilderTests(TestCase):
    """Table builders return correct columns and rows."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)
        self.data = _seed_test_data(self.tenant, self.user)

    def test_recent_findings_shape(self):
        result = build_recent_findings(self.tenant)
        self.assertEqual(
            result["columns"],
            ["Title", "Severity", "Status", "Engagement", "Date"],
        )
        self.assertEqual(len(result["rows"]), 6)
        # Each row has 5 columns
        for row in result["rows"]:
            self.assertEqual(len(row), 5)

    def test_engagements_timeline_shape(self):
        result = build_engagements_timeline(self.tenant)
        self.assertEqual(
            result["columns"],
            ["Name", "Client", "Status", "Start", "End"],
        )
        # Both engagements are active/planned
        self.assertEqual(len(result["rows"]), 2)

    def test_recent_activity_shape(self):
        result = build_recent_activity(self.tenant)
        self.assertEqual(
            result["columns"],
            ["Action", "Resource", "User", "Timestamp"],
        )
        self.assertEqual(len(result["rows"]), 1)


# ---------------------------------------------------------------------------
# Empty state tests
# ---------------------------------------------------------------------------


class EmptyStateTests(TestCase):
    """Widgets return zero counts / empty arrays for tenant with no data."""

    def setUp(self):
        self.tenant = _create_tenant()

    def test_stat_builders_return_zero(self):
        self.assertEqual(build_active_engagements(self.tenant), {"value": 0})
        self.assertEqual(build_total_findings(self.tenant), {"value": 0})
        self.assertEqual(build_critical_high_findings(self.tenant), {"value": 0})
        self.assertEqual(build_total_clients(self.tenant), {"value": 0})
        self.assertEqual(build_total_assets(self.tenant), {"value": 0})
        self.assertEqual(build_active_users(self.tenant), {"value": 0})

    def test_chart_builders_return_zero_values(self):
        result = build_findings_by_severity(self.tenant)
        self.assertTrue(all(v == 0 for v in result["values"]))

        result = build_findings_by_status(self.tenant)
        self.assertTrue(all(v == 0 for v in result["values"]))

        result = build_engagement_status(self.tenant)
        self.assertTrue(all(v == 0 for v in result["values"]))

    def test_table_builders_return_empty_rows(self):
        self.assertEqual(build_recent_findings(self.tenant)["rows"], [])
        self.assertEqual(build_engagements_timeline(self.tenant)["rows"], [])
        self.assertEqual(build_recent_activity(self.tenant)["rows"], [])


# ---------------------------------------------------------------------------
# Permission filtering tests
# ---------------------------------------------------------------------------


class PermissionFilteringTests(TestCase):
    """get_dashboard_widgets filters widgets by user permissions."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)

    def test_all_permissions_returns_all_widgets(self):
        widgets = get_dashboard_widgets(self.tenant, "__all__")
        self.assertEqual(len(widgets), len([w for w in WIDGET_REGISTRY if w.default_visible]))

    def test_no_permissions_returns_no_widgets(self):
        widgets = get_dashboard_widgets(self.tenant, set())
        self.assertEqual(len(widgets), 0)

    def test_client_view_only(self):
        widgets = get_dashboard_widgets(self.tenant, {"client.view"})
        ids = [w["id"] for w in widgets]
        self.assertEqual(ids, ["total_clients"])

    def test_finding_view_returns_finding_widgets(self):
        widgets = get_dashboard_widgets(self.tenant, {"finding.view"})
        ids = [w["id"] for w in widgets]
        expected = [
            "total_findings", "critical_high_findings",
        ]
        self.assertEqual(ids, expected)

    def test_engagement_view_returns_engagement_widgets(self):
        widgets = get_dashboard_widgets(self.tenant, {"engagement.view"})
        ids = [w["id"] for w in widgets]
        expected = ["active_engagements", "engagement_status", "engagement_countdown", "engagements_timeline"]
        self.assertEqual(ids, expected)

    def test_audit_view_returns_activity_widget(self):
        widgets = get_dashboard_widgets(self.tenant, {"audit.view"})
        ids = [w["id"] for w in widgets]
        self.assertEqual(ids, ["recent_activity"])

    def test_widget_shape(self):
        widgets = get_dashboard_widgets(self.tenant, {"client.view"})
        w = widgets[0]
        self.assertEqual(w["id"], "total_clients")
        self.assertEqual(w["title"], "Total Clients")
        self.assertEqual(w["type"], "stat")
        self.assertIn("col", w)
        self.assertIn("row", w)
        self.assertIn("col_span", w)
        self.assertEqual(w["col_span"], 1)
        self.assertIsInstance(w["col"], int)
        self.assertIsInstance(w["row"], int)
        self.assertIn("value", w["data"])


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


class DashboardAPITests(APITestCase):
    """Integration tests for GET /api/dashboard/."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

    def test_unauthenticated_returns_401(self):
        self.client.logout()
        resp = self.client.get("/api/dashboard/")
        self.assertEqual(resp.status_code, 401)

    def test_owner_gets_all_widgets(self):
        owner = _create_user(email="owner@acme.example.com")
        _create_membership(owner, self.tenant, role=TenantRole.OWNER)

        login_as(self.client, owner, self.tenant)
        resp = self.client.get("/api/dashboard/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("widgets", data)
        self.assertEqual(len(data["widgets"]), len([w for w in WIDGET_REGISTRY if w.default_visible]))

    def test_analyst_gets_analyst_widgets(self):
        from engagements.models import Engagement, EngagementStakeholder
        analyst = _create_user(email="analyst@acme.example.com")
        member = _create_membership(analyst, self.tenant, role=TenantRole.MEMBER)
        member.groups.add(self.groups["Analysts"])
        eng = Engagement.objects.create(tenant=self.tenant, name="E1")
        EngagementStakeholder.objects.create(engagement=eng, member=member)

        login_as(self.client, analyst, self.tenant)
        resp = self.client.get("/api/dashboard/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        widget_ids = [w["id"] for w in data["widgets"]]
        # Analyst-specific widgets
        self.assertIn("my_engagements", widget_ids)
        self.assertIn("my_open_findings", widget_ids)
        self.assertIn("my_critical_high", widget_ids)
        self.assertIn("findings_this_week", widget_ids)
        self.assertIn("my_findings_by_severity", widget_ids)
        self.assertIn("my_findings_by_status", widget_ids)
        self.assertIn("my_recent_findings", widget_ids)
        self.assertIn("upcoming_deadlines", widget_ids)
        # Admin widgets should NOT appear
        self.assertNotIn("active_engagements", widget_ids)
        self.assertNotIn("active_users", widget_ids)
        self.assertNotIn("recent_activity", widget_ids)

    def test_collaborator_gets_analyst_widgets(self):
        from engagements.models import Engagement, EngagementStakeholder
        viewer = _create_user(email="viewer@acme.example.com")
        member = _create_membership(viewer, self.tenant, role=TenantRole.MEMBER)
        member.groups.add(self.groups["Collaborators"])
        eng = Engagement.objects.create(tenant=self.tenant, name="E1")
        EngagementStakeholder.objects.create(engagement=eng, member=member)

        login_as(self.client, viewer, self.tenant)
        resp = self.client.get("/api/dashboard/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        widget_ids = [w["id"] for w in data["widgets"]]
        # Engagement-scoped users get analyst dashboard
        self.assertIn("my_engagements", widget_ids)
        self.assertIn("my_recent_findings", widget_ids)
        # Admin widgets should NOT appear
        self.assertNotIn("active_users", widget_ids)
        self.assertNotIn("recent_activity", widget_ids)

    def test_member_no_groups_gets_empty(self):
        user = _create_user(email="nogroup@acme.example.com")
        _create_membership(user, self.tenant, role=TenantRole.MEMBER)

        login_as(self.client, user, self.tenant)
        resp = self.client.get("/api/dashboard/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["widgets"], [])

    def test_admin_gets_all_widgets(self):
        admin = _create_user(email="admin@acme.example.com")
        member = _create_membership(
            admin, self.tenant, role=TenantRole.MEMBER,
        )
        member.groups.add(self.groups["Administrators"])

        login_as(self.client, admin, self.tenant)
        resp = self.client.get("/api/dashboard/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["widgets"]), len([w for w in WIDGET_REGISTRY if w.default_visible]))

    def test_response_shape(self):
        owner = _create_user(email="shape@acme.example.com")
        _create_membership(owner, self.tenant, role=TenantRole.OWNER)

        login_as(self.client, owner, self.tenant)
        resp = self.client.get("/api/dashboard/")
        data = resp.json()
        for w in data["widgets"]:
            self.assertIn("id", w)
            self.assertIn("title", w)
            self.assertIn("type", w)
            self.assertIn("col", w)
            self.assertIn("row", w)
            self.assertIn("col_span", w)
            self.assertIn("data", w)
            self.assertIn(w["type"], ["stat", "chart", "table"])
            self.assertIsInstance(w["col"], int)
            self.assertIsInstance(w["row"], int)
            self.assertGreaterEqual(w["col"], 0)
            self.assertLessEqual(w["col"], 5)
            self.assertGreaterEqual(w["row"], 0)
            self.assertIn(w["col_span"], [1, 3, 6])

    def test_inactive_member_returns_403(self):
        user = _create_user(email="inactive@acme.example.com")
        _create_membership(
            user, self.tenant, role=TenantRole.MEMBER, is_active=False,
        )

        login_as(self.client, user, self.tenant)
        resp = self.client.get("/api/dashboard/")
        self.assertEqual(resp.status_code, 403)

    def test_collaborator_view_param(self):
        from engagements.models import Engagement, EngagementStakeholder
        viewer = _create_user(email="collab@acme.example.com")
        member = _create_membership(viewer, self.tenant, role=TenantRole.MEMBER)
        member.groups.add(self.groups["Collaborators"])
        eng = Engagement.objects.create(tenant=self.tenant, name="E1", status="active")
        EngagementStakeholder.objects.create(engagement=eng, member=member)

        login_as(self.client, viewer, self.tenant)
        resp = self.client.get("/api/dashboard/?view=collaborator")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        widget_ids = [w["id"] for w in data["widgets"]]
        # Collaborator-specific widgets
        self.assertIn("engagements_in_progress", widget_ids)
        self.assertIn("total_findings", widget_ids)
        self.assertIn("unresolved_critical_high", widget_ids)
        self.assertIn("findings_resolved_rate", widget_ids)
        self.assertIn("engagement_summary", widget_ids)
        self.assertIn("top_unresolved_findings", widget_ids)
        # Analyst-specific widgets should NOT appear
        self.assertNotIn("my_engagements", widget_ids)
        self.assertNotIn("my_open_findings", widget_ids)

    def test_owner_can_use_collaborator_view(self):
        from engagements.models import Engagement, EngagementStakeholder
        owner = _create_user(email="owner-collab@acme.example.com")
        member = _create_membership(owner, self.tenant, role=TenantRole.OWNER)
        eng = Engagement.objects.create(tenant=self.tenant, name="E1", status="active")
        EngagementStakeholder.objects.create(engagement=eng, member=member)

        login_as(self.client, owner, self.tenant)
        resp = self.client.get("/api/dashboard/?view=collaborator")
        self.assertEqual(resp.status_code, 200)
        widget_ids = [w["id"] for w in resp.json()["widgets"]]
        self.assertIn("engagements_in_progress", widget_ids)
        self.assertEqual(len(widget_ids), len(COLLABORATOR_WIDGET_REGISTRY))


# ---------------------------------------------------------------------------
# Collaborator builder tests
# ---------------------------------------------------------------------------


class CollaboratorStatBuilderTests(TestCase):
    """Collaborator-specific stat builders."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)
        self.data = _seed_test_data(self.tenant, self.user)
        self.eng_ids = {self.data["eng1"].pk, self.data["eng2"].pk}

    def test_resolved_rate_with_data(self):
        # 6 total findings, 1 fixed = 17%
        result = build_collab_findings_resolved_rate(self.tenant, self.eng_ids)
        self.assertEqual(result["value"], 17)
        self.assertEqual(result["suffix"], "%")

    def test_resolved_rate_empty(self):
        result = build_collab_findings_resolved_rate(self.tenant, eng_ids=set())
        self.assertEqual(result, {"value": 0, "suffix": "%"})


class CollaboratorChartBuilderTests(TestCase):
    """Collaborator engagement progress chart."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)
        self.data = _seed_test_data(self.tenant, self.user)
        self.eng_ids = {self.data["eng1"].pk, self.data["eng2"].pk}

    def test_engagement_progress_shape(self):
        result = build_collab_engagement_progress(self.tenant, self.eng_ids)
        self.assertEqual(result["chart_type"], "bar")
        self.assertIn("datasets", result)
        self.assertEqual(len(result["datasets"]), 2)
        self.assertEqual(result["datasets"][0]["label"], "Resolved")
        self.assertEqual(result["datasets"][1]["label"], "Remaining")
        self.assertTrue(result["stacked"])

    def test_engagement_progress_values(self):
        result = build_collab_engagement_progress(self.tenant, self.eng_ids)
        # eng1 has 6 findings (1 fixed → 5 remaining), eng2 has 0
        resolved = result["datasets"][0]["values"]
        remaining = result["datasets"][1]["values"]
        self.assertEqual(sum(resolved), 1)
        self.assertEqual(sum(remaining), 5)

    def test_engagement_progress_empty(self):
        result = build_collab_engagement_progress(self.tenant, eng_ids=set())
        self.assertEqual(result["labels"], [])


class CollaboratorTableBuilderTests(TestCase):
    """Collaborator table builders."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)
        self.data = _seed_test_data(self.tenant, self.user)
        self.eng_ids = {self.data["eng1"].pk, self.data["eng2"].pk}

    def test_engagement_summary_shape(self):
        result = build_collab_engagement_summary(self.tenant, self.eng_ids)
        self.assertEqual(
            result["columns"],
            ["Name", "Client", "Status", "Findings", "Critical/High Open", "End Date"],
        )
        self.assertEqual(len(result["rows"]), 2)
        for row in result["rows"]:
            self.assertEqual(len(row), 6)

    def test_engagement_summary_counts(self):
        result = build_collab_engagement_summary(self.tenant, self.eng_ids)
        # Find eng1 row (has findings)
        eng1_row = next(r for r in result["rows"] if r[0] == "Web Audit")
        self.assertEqual(eng1_row[3], 6)  # total findings
        self.assertEqual(eng1_row[4], 2)  # critical + high open

    def test_top_unresolved_shape(self):
        result = build_collab_top_unresolved(self.tenant, self.eng_ids)
        self.assertEqual(
            result["columns"],
            ["Title", "Severity", "Status", "Engagement", "Age (days)"],
        )
        # 5 open findings (fixed one excluded)
        self.assertEqual(len(result["rows"]), 5)

    def test_top_unresolved_ordered_by_severity(self):
        result = build_collab_top_unresolved(self.tenant, self.eng_ids)
        severities = [r[1] for r in result["rows"]]
        # Critical first, then high, then medium, etc.
        self.assertEqual(severities[0], "Critical")
        self.assertEqual(severities[1], "High")


class CollaboratorAlertTests(TestCase):
    """Collaborator-specific alerts."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)

    def test_overdue_engagement_alert(self):
        import datetime
        eng = Engagement.objects.create(
            tenant=self.tenant, name="Overdue", status="active",
            end_date=datetime.date(2026, 1, 1), created_by=self.user,
        )
        alerts = get_collaborator_alerts(self.tenant, {eng.pk})
        overdue = [a for a in alerts if a["id"].startswith("overdue_")]
        self.assertEqual(len(overdue), 1)
        self.assertEqual(overdue[0]["level"], "warning")
        self.assertIn("Overdue", overdue[0]["message"])

    def test_no_alerts_for_on_time_engagement(self):
        import datetime
        eng = Engagement.objects.create(
            tenant=self.tenant, name="On Time", status="active",
            end_date=datetime.date(2026, 12, 31), created_by=self.user,
        )
        alerts = get_collaborator_alerts(self.tenant, {eng.pk})
        overdue = [a for a in alerts if a["id"].startswith("overdue_")]
        self.assertEqual(len(overdue), 0)

    def test_stale_critical_finding_alert(self):
        from django.utils import timezone as tz
        eng = Engagement.objects.create(
            tenant=self.tenant, name="E1", status="active", created_by=self.user,
        )
        f = Finding.objects.create(
            tenant=self.tenant, engagement=eng, title="Old Critical",
            severity="critical", status="open", created_by=self.user,
        )
        # Backdate to 20 days ago
        Finding.objects.filter(pk=f.pk).update(
            created_at=tz.now() - tz.timedelta(days=20),
        )
        alerts = get_collaborator_alerts(self.tenant, {eng.pk})
        stale = [a for a in alerts if a["id"].startswith("stale_critical_")]
        self.assertEqual(len(stale), 1)
        self.assertEqual(stale[0]["level"], "danger")

    def test_no_stale_alert_for_recent_critical(self):
        eng = Engagement.objects.create(
            tenant=self.tenant, name="E1", status="active", created_by=self.user,
        )
        Finding.objects.create(
            tenant=self.tenant, engagement=eng, title="Fresh Critical",
            severity="critical", status="open", created_by=self.user,
        )
        alerts = get_collaborator_alerts(self.tenant, {eng.pk})
        stale = [a for a in alerts if a["id"].startswith("stale_critical_")]
        self.assertEqual(len(stale), 0)

    def test_no_alerts_when_eng_ids_none(self):
        alerts = get_collaborator_alerts(self.tenant, None)
        self.assertEqual(alerts, [])


# ---------------------------------------------------------------------------
# Top riskiest assets — medal-table ranking tests
# ---------------------------------------------------------------------------


class TopRiskiestAssetsTests(TestCase):
    """build_top_riskiest_assets should rank assets using Olympic medal-table
    logic: most Criticals first, then Highs break ties, then Mediums, then
    Lows.  Volume of lower-severity findings must NEVER outrank a single
    higher-severity finding."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)
        self.client_obj = Client.objects.create(
            tenant=self.tenant, name="Test Client",
        )
        self.eng = Engagement.objects.create(
            tenant=self.tenant, name="Pen Test", status="active",
            created_by=self.user,
        )

    def _make_asset(self, name):
        return Asset.objects.create(
            tenant=self.tenant, name=name, client=self.client_obj,
        )

    def _add_findings(self, asset, critical=0, high=0, medium=0, low=0, info=0):
        for sev, count in [
            ("critical", critical), ("high", high), ("medium", medium),
            ("low", low), ("info", info),
        ]:
            for i in range(count):
                Finding.objects.create(
                    tenant=self.tenant, engagement=self.eng, asset=asset,
                    title=f"{sev}-{asset.name}-{i}", severity=sev,
                    status="open", created_by=self.user,
                )

    def test_one_critical_beats_many_lows(self):
        """Asset with 1 Critical must outrank asset with 100 Lows."""
        asset_crit = self._make_asset("one-critical")
        asset_lows = self._make_asset("many-lows")
        self._add_findings(asset_crit, critical=1)
        self._add_findings(asset_lows, low=100)

        result = build_top_riskiest_assets(self.tenant)
        self.assertEqual(result["labels"][0], "one-critical")
        self.assertEqual(result["labels"][1], "many-lows")

    def test_one_high_beats_many_mediums(self):
        """Asset with 1 High must outrank asset with 50 Mediums."""
        asset_high = self._make_asset("one-high")
        asset_meds = self._make_asset("many-mediums")
        self._add_findings(asset_high, high=1)
        self._add_findings(asset_meds, medium=50)

        result = build_top_riskiest_assets(self.tenant)
        self.assertEqual(result["labels"][0], "one-high")
        self.assertEqual(result["labels"][1], "many-mediums")

    def test_tiebreak_by_next_severity(self):
        """Two assets with equal Criticals — the one with more Highs ranks first."""
        asset_a = self._make_asset("a-2crit-3high")
        asset_b = self._make_asset("b-2crit-1high")
        self._add_findings(asset_a, critical=2, high=3)
        self._add_findings(asset_b, critical=2, high=1)

        result = build_top_riskiest_assets(self.tenant)
        self.assertEqual(result["labels"][0], "a-2crit-3high")
        self.assertEqual(result["labels"][1], "b-2crit-1high")

    def test_deep_tiebreak(self):
        """Same Criticals and Highs — Medium count breaks the tie."""
        asset_a = self._make_asset("a-1c-1h-5m")
        asset_b = self._make_asset("b-1c-1h-2m")
        self._add_findings(asset_a, critical=1, high=1, medium=5)
        self._add_findings(asset_b, critical=1, high=1, medium=2)

        result = build_top_riskiest_assets(self.tenant)
        self.assertEqual(result["labels"][0], "a-1c-1h-5m")
        self.assertEqual(result["labels"][1], "b-1c-1h-2m")

    def test_info_findings_excluded_from_ranking(self):
        """Asset with only Info findings should rank below asset with 1 Low."""
        asset_low = self._make_asset("one-low")
        asset_info = self._make_asset("many-info")
        self._add_findings(asset_low, low=1)
        self._add_findings(asset_info, info=50)

        result = build_top_riskiest_assets(self.tenant)
        # Info-only asset may or may not appear, but one-low must be first
        self.assertEqual(result["labels"][0], "one-low")

    def test_fixed_findings_not_counted(self):
        """Fixed/false-positive findings should not contribute to ranking."""
        asset = self._make_asset("has-fixed")
        self._add_findings(asset, critical=1)
        # Add a fixed critical — should not count
        Finding.objects.create(
            tenant=self.tenant, engagement=self.eng, asset=asset,
            title="fixed-crit", severity="critical", status="fixed",
            created_by=self.user,
        )
        result = build_top_riskiest_assets(self.tenant)
        # Only 1 open critical should be reflected, not 2
        self.assertEqual(len(result["labels"]), 1)

    def test_limit_to_10(self):
        """Only top 10 assets should be returned."""
        for i in range(15):
            a = self._make_asset(f"asset-{i:02d}")
            self._add_findings(a, low=15 - i)

        result = build_top_riskiest_assets(self.tenant)
        self.assertEqual(len(result["labels"]), 10)

    def test_empty_state(self):
        """No findings → empty chart."""
        result = build_top_riskiest_assets(self.tenant)
        self.assertEqual(result["labels"], [])
        self.assertEqual(result["values"], [])
