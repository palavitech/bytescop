"""Tenant purge job handler — permanently deletes all tenant data.

Flow:
  1. Collect file paths and user IDs before deleting DB records
  2. Delete all tenant-scoped data via Django ORM (cascade handles most)
  3. Delete orphaned users (no remaining memberships in other tenants)
  4. Delete the tenant record itself
  5. Delete all tenant files from local filesystem
  6. Stamp TenantClosure.purged_at
  7. Publish closure_purged notification event
"""

import logging
import shutil
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.utils import timezone

from job_processor.handlers.base import BaseJobHandler

logger = logging.getLogger(__name__)


class TenantPurgeHandler(BaseJobHandler):
    """Purges all data for a closing tenant."""

    STEP_NAMES = [
        'Collecting user data',
        'Deleting database records',
        'Removing orphaned users',
        'Deleting workspace',
        'Removing files',
        'Finalizing',
    ]

    def run(self, payload: dict) -> dict:
        tenant_id = payload.get('tenant_id', '')
        tenant_slug = payload.get('tenant_slug', '')
        closure_id = payload.get('closure_id', '')

        if not tenant_id:
            raise ValueError('closure_execute event missing tenant_id')

        logger.info('Starting tenant purge: tenant=%s slug=%s', tenant_id, tenant_slug)

        # Initialise progress tracking
        self._init_progress(closure_id)

        try:
            # 0. Collect user IDs before deleting members
            self._update_step(closure_id, 0, 'in_progress')
            member_user_ids = self._collect_user_ids(tenant_id, payload)
            logger.info('Collected %d user IDs from tenant members', len(member_user_ids))
            self._update_step(closure_id, 0, 'done')

            # 1. Delete all tenant-scoped data (Django cascade handles dependencies)
            self._update_step(closure_id, 1, 'in_progress')
            deleted_counts = self._purge_database(tenant_id)
            logger.info('Database purge complete: %s', deleted_counts)
            self._update_step(closure_id, 1, 'done')

            # 2. Delete orphaned users
            self._update_step(closure_id, 2, 'in_progress')
            orphans_deleted = self._delete_orphaned_users(member_user_ids)
            logger.info('Deleted %d orphaned users', orphans_deleted)
            self._update_step(closure_id, 2, 'done')

            # 3. Delete the tenant record
            self._update_step(closure_id, 3, 'in_progress')
            self._delete_tenant(tenant_id)
            self._update_step(closure_id, 3, 'done')

            # 4. Delete local files
            self._update_step(closure_id, 4, 'in_progress')
            files_deleted = self._purge_local_files(tenant_id)
            logger.info('Local file purge complete: %d files deleted', files_deleted)
            self._update_step(closure_id, 4, 'done')

            # 5. Stamp TenantClosure.purged_at
            self._update_step(closure_id, 5, 'in_progress')
            self._finalize(closure_id)
            self._update_step(closure_id, 5, 'done')
        except Exception as exc:
            self._set_progress_error(closure_id, str(exc))
            raise

        return {
            'tenant_id': tenant_id,
            'tenant_slug': tenant_slug,
            'db_deleted': deleted_counts,
            'orphans_deleted': orphans_deleted,
            'files_deleted': files_deleted,
        }

    # ------------------------------------------------------------------
    # Progress tracking
    # ------------------------------------------------------------------

    def _init_progress(self, closure_id: str) -> None:
        """Initialise the progress JSON with all steps as pending."""
        if not closure_id:
            return
        from tenancy.models import TenantClosure
        steps = [{'name': name, 'status': 'pending'} for name in self.STEP_NAMES]
        TenantClosure.objects.filter(id=closure_id).update(
            progress={'steps': steps, 'error': None},
        )

    def _update_step(self, closure_id: str, step_index: int, status: str) -> None:
        """Update a single step's status in the progress JSON."""
        if not closure_id:
            return
        from tenancy.models import TenantClosure
        closure = TenantClosure.objects.filter(id=closure_id).first()
        if not closure or not closure.progress:
            return
        steps = closure.progress.get('steps', [])
        if step_index < len(steps):
            steps[step_index]['status'] = status
            closure.progress['steps'] = steps
            closure.save(update_fields=['progress'])

    def _set_progress_error(self, closure_id: str, error_msg: str) -> None:
        """Record an error in the progress JSON."""
        if not closure_id:
            return
        from tenancy.models import TenantClosure
        closure = TenantClosure.objects.filter(id=closure_id).first()
        if not closure:
            return
        if not closure.progress:
            closure.progress = {}
        closure.progress['error'] = error_msg
        closure.save(update_fields=['progress'])

    # ------------------------------------------------------------------
    # Database purge
    # ------------------------------------------------------------------

    def _collect_user_ids(self, tenant_id: str, payload: dict) -> list:
        """Collect all user IDs from tenant members before deleting."""
        from tenancy.models import TenantMember

        user_ids = list(
            TenantMember.objects.filter(tenant_id=tenant_id)
            .values_list('user_id', flat=True)
        )

        if not user_ids:
            owner_user_id = payload.get('user_id')
            if owner_user_id:
                logger.info(
                    'Member table empty (retry); using owner user_id=%s from payload',
                    owner_user_id,
                )
                user_ids = [owner_user_id]

        return user_ids

    def _purge_database(self, tenant_id: str) -> dict:
        """Delete all tenant-scoped data. Uses raw SQL for tables that
        don't have direct tenant FK (subquery-based deletion)."""
        from evidence.models import Attachment
        from findings.models import Finding
        from engagements.models import Engagement, Sow, SowAsset
        from assets.models import Asset
        from clients.models import Client
        from audit.models import AuditLog
        from account_settings.models import AccountSetting
        from authorization.models import TenantGroup
        from tenancy.models import TenantMember
        from comments.models import Comment
        from jobs.models import BackgroundJob

        counts = {}

        # Delete in dependency order
        counts['attachments'] = Attachment.objects.filter(tenant_id=tenant_id).delete()[0]
        counts['findings'] = Finding.objects.filter(tenant_id=tenant_id).delete()[0]
        counts['comments'] = Comment.objects.filter(tenant_id=tenant_id).delete()[0]
        counts['background_jobs'] = BackgroundJob.objects.filter(tenant_id=tenant_id).delete()[0]

        # Engagement sub-tables (cascade from engagement delete handles most)
        eng_ids = list(Engagement.objects.filter(tenant_id=tenant_id).values_list('id', flat=True))

        # SowAsset → Sow → Engagement
        with connection.cursor() as cur:
            if eng_ids:
                cur.execute(
                    'DELETE FROM engagements_sowasset WHERE sow_id IN '
                    '(SELECT id FROM engagements_sow WHERE engagement_id = ANY(%s))',
                    [eng_ids],
                )
                counts['sow_assets'] = cur.rowcount
                cur.execute(
                    'DELETE FROM engagements_sow WHERE engagement_id = ANY(%s)',
                    [eng_ids],
                )
                counts['sows'] = cur.rowcount

        counts['engagements'] = Engagement.objects.filter(tenant_id=tenant_id).delete()[0]
        counts['assets'] = Asset.objects.filter(tenant_id=tenant_id).delete()[0]
        counts['clients'] = Client.objects.filter(tenant_id=tenant_id).delete()[0]
        counts['audit_logs'] = AuditLog.objects.filter(tenant_id=tenant_id).delete()[0]
        counts['settings'] = AccountSetting.objects.filter(tenant_id=tenant_id).delete()[0]
        counts['groups'] = TenantGroup.objects.filter(tenant_id=tenant_id).delete()[0]
        counts['members'] = TenantMember.objects.filter(tenant_id=tenant_id).delete()[0]

        return counts

    # ------------------------------------------------------------------
    # Local file purge
    # ------------------------------------------------------------------

    def _purge_local_files(self, tenant_id: str) -> int:
        """Delete all local files for a tenant (media + exports)."""
        deleted = 0
        media_root = Path(settings.MEDIA_ROOT)

        # Tenant media directory: {MEDIA_ROOT}/{tenant_id}/
        tenant_dir = media_root / tenant_id
        if tenant_dir.exists():
            count = sum(1 for _ in tenant_dir.rglob('*') if _.is_file())
            shutil.rmtree(tenant_dir, ignore_errors=True)
            deleted += count
            logger.info('Deleted tenant media directory: %s (%d files)', tenant_dir, count)

        # Tenant exports: {MEDIA_ROOT}/exports/{tenant_id}/
        exports_dir = media_root / 'exports' / tenant_id
        if exports_dir.exists():
            count = sum(1 for _ in exports_dir.rglob('*') if _.is_file())
            shutil.rmtree(exports_dir, ignore_errors=True)
            deleted += count
            logger.info('Deleted tenant exports directory: %s (%d files)', exports_dir, count)

        return deleted

    # ------------------------------------------------------------------
    # Orphaned users + tenant deletion
    # ------------------------------------------------------------------

    def _delete_orphaned_users(self, user_ids: list) -> int:
        """Delete users who have no remaining tenant memberships."""
        if not user_ids:
            return 0

        from accounts.models import User
        from tenancy.models import TenantMember

        # Find users with no remaining memberships
        active_member_user_ids = set(
            TenantMember.objects.filter(user_id__in=user_ids)
            .values_list('user_id', flat=True)
        )
        orphan_ids = [uid for uid in user_ids if uid not in active_member_user_ids]

        if not orphan_ids:
            return 0

        # Delete all sessions for orphaned users.
        # Django stores user_id in session data (not a column), so we can't
        # filter by user. Delete expired sessions as cleanup instead.
        with connection.cursor() as cur:
            cur.execute('DELETE FROM django_session WHERE expire_date < NOW()')

        count = User.objects.filter(id__in=orphan_ids).delete()[0]
        logger.info('Deleted %d orphaned user accounts', count)
        return count

    def _delete_tenant(self, tenant_id: str) -> None:
        """Delete the tenant record itself. If no tenants remain, reset
        InstallState so the setup wizard runs again."""
        from tenancy.models import Tenant
        Tenant.objects.filter(id=tenant_id).delete()
        logger.info('Deleted tenant record: %s', tenant_id)

        remaining = Tenant.objects.count()
        if remaining == 0:
            from core.models import InstallState
            InstallState.objects.filter(id=1).update(installed=False)
            logger.info('No tenants remaining — reset InstallState to trigger setup wizard')

    # ------------------------------------------------------------------
    # Finalize
    # ------------------------------------------------------------------

    def _finalize(self, closure_id: str) -> None:
        """Stamp TenantClosure.purged_at."""
        if not closure_id:
            logger.warning('No closure_id in payload — cannot finalize')
            return
        from tenancy.models import TenantClosure
        closure = TenantClosure.objects.filter(id=closure_id).first()
        if closure:
            closure.purged_at = timezone.now()
            closure.save(update_fields=['purged_at'])
            self._closed_date = (
                closure.closed_at.strftime('%B %d, %Y') if closure.closed_at else ''
            )
            logger.info('Finalized closure: closure=%s', closure_id)
        else:
            logger.error('Closure record not found: closure=%s — purged_at not stamped', closure_id)

    def get_completion_event(self, payload: dict, result: dict) -> dict | None:
        return {
            'routing': ['notification'],
            'event_area': 'tenant',
            'event_type': 'closure_purged',
            'tenant_id': payload.get('tenant_id'),
            'user_id': payload.get('user_id'),
            'email': payload.get('email', ''),
            'name': payload.get('name', ''),
            'tenant_name': payload.get('tenant_name', ''),
            'data_export_choice': payload.get('data_export_choice', ''),
            'closed_date': getattr(self, '_closed_date', ''),
            'version': '1',
        }
