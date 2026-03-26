"""Custom test runner that bootstraps required database state.

Creates the InstallState singleton so that SetupGateMiddleware
doesn't block every request with 403 during tests.
"""

from django.test.runner import DiscoverRunner


class BytesCopTestRunner(DiscoverRunner):

    def setup_databases(self, **kwargs):
        result = super().setup_databases(**kwargs)
        self._create_install_state()
        return result

    @staticmethod
    def _create_install_state():
        try:
            from core.models import InstallState
            InstallState.objects.get_or_create(id=1, defaults={"installed": True})
        except Exception:
            # DB setup was skipped (e.g. only _FailedTest stubs found) — safe to ignore
            pass
