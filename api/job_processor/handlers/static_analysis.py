"""Static analysis handler — generates findings from malware sample files.

Reads the sample binary (read-only, never executed) and produces:
  1. File hash identification (MD5, SHA1, SHA256)
  2. Extracted printable strings (> 4 chars)

Each step creates a Finding record and updates job progress so the
frontend can display real-time step status.
"""

import hashlib
import logging
import re

from django.utils import timezone

from evidence.models import MalwareSample
from evidence.storage.factory import get_attachment_storage
from findings.models import Finding
from jobs.models import BackgroundJob

from .base import BaseJobHandler

logger = logging.getLogger('bytescop.static_analysis')

# Match printable ASCII runs of 4+ chars in raw bytes
_STRINGS_RE = re.compile(rb'[\x20-\x7e]{4,}')

# Cap extracted strings to avoid giant findings
MAX_STRINGS = 500
MAX_STRING_LENGTH = 200


def _update_progress(tenant_id, job_id, steps, findings_created):
    """Write step progress to the job result field for frontend polling."""
    total = len(steps)
    done = sum(1 for s in steps if s['status'] == 'done')
    current = next((i for i, s in enumerate(steps) if s['status'] == 'in_progress'), done)
    BackgroundJob.objects.filter(
        tenant_id=tenant_id, id=job_id,
    ).update(result={
        'steps': steps,
        'findings_created': findings_created,
        'current_step': current,
        'total_steps': total,
    })


class StaticAnalysisHandler(BaseJobHandler):

    def run(self, payload: dict) -> dict:
        tenant_id = payload['tenant_id']
        job_id = payload['job_id']
        engagement_id = payload['engagement_id']
        sample_id = payload['sample_id']
        user_id = payload.get('user_id')

        sample = MalwareSample.objects.select_related('tenant').get(
            id=sample_id, tenant_id=tenant_id,
        )

        storage = get_attachment_storage()
        filename = sample.original_filename

        # Initialize step tracking
        steps = [
            {'name': 'hash_generation', 'label': 'Generating file hashes', 'status': 'pending'},
            {'name': 'string_extraction', 'label': 'Extracting strings', 'status': 'pending'},
        ]
        findings_created = 0

        # ── Step 1: Generate Hashes ──────────────────────────────────
        steps[0]['status'] = 'in_progress'
        _update_progress(tenant_id, job_id, steps, findings_created)

        md5, sha1, sha256 = self._compute_hashes(storage, sample.storage_uri)

        description = (
            f'## File Hashes — {filename}\n\n'
            f'| Algorithm | Hash |\n'
            f'|-----------|------|\n'
            f'| MD5 | `{md5}` |\n'
            f'| SHA-1 | `{sha1}` |\n'
            f'| SHA-256 | `{sha256}` |\n'
        )

        Finding.objects.create(
            tenant_id=tenant_id,
            engagement_id=engagement_id,
            sample=sample,
            title=f'File Hash Identification — {filename}',
            analysis_type='static',
            description_md=description,
            created_by_id=user_id,
        )
        findings_created += 1
        steps[0]['status'] = 'done'
        _update_progress(tenant_id, job_id, steps, findings_created)

        # ── Step 2: Extract Strings ──────────────────────────────────
        steps[1]['status'] = 'in_progress'
        _update_progress(tenant_id, job_id, steps, findings_created)

        strings = self._extract_strings(storage, sample.storage_uri)

        if strings:
            truncated = len(strings) > MAX_STRINGS
            display_strings = strings[:MAX_STRINGS]
            lines = '\n'.join(s[:MAX_STRING_LENGTH] for s in display_strings)
            description = (
                f'## Extracted Strings — {filename}\n\n'
                f'Found **{len(strings)}** printable strings (> 4 characters).'
            )
            if truncated:
                description += f' Showing first {MAX_STRINGS}.'
            description += f'\n\n```\n{lines}\n```\n'
        else:
            description = (
                f'## Extracted Strings — {filename}\n\n'
                f'No printable strings longer than 4 characters were found.'
            )

        Finding.objects.create(
            tenant_id=tenant_id,
            engagement_id=engagement_id,
            sample=sample,
            title=f'Extracted Strings — {filename}',
            analysis_type='static',
            description_md=description,
            created_by_id=user_id,
        )
        findings_created += 1
        steps[1]['status'] = 'done'
        _update_progress(tenant_id, job_id, steps, findings_created)

        logger.info(
            'Static analysis complete: sample=%s findings=%d',
            sample_id, findings_created,
        )

        return {
            'steps': steps,
            'findings_created': findings_created,
            'current_step': len(steps),
            'total_steps': len(steps),
        }

    @staticmethod
    def _compute_hashes(storage, storage_uri: str) -> tuple[str, str, str]:
        """Compute MD5, SHA1, SHA256 from sample file (read-only)."""
        md5 = hashlib.md5()
        sha1 = hashlib.sha1()
        sha256 = hashlib.sha256()

        f = storage.open(storage_uri)
        try:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                md5.update(chunk)
                sha1.update(chunk)
                sha256.update(chunk)
        finally:
            f.close()

        return md5.hexdigest(), sha1.hexdigest(), sha256.hexdigest()

    @staticmethod
    def _extract_strings(storage, storage_uri: str) -> list[str]:
        """Extract printable ASCII strings > 4 chars from sample file."""
        f = storage.open(storage_uri)
        try:
            data = f.read()
        finally:
            f.close()

        matches = _STRINGS_RE.findall(data)
        return [m.decode('ascii', errors='replace') for m in matches]
