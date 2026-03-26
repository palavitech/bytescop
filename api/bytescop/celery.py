"""Celery app configuration for BytesCop."""

import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bytescop.settings.production')

app = Celery('bytescop')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# bytescop/tasks.py is in the project package, not a Django app.
# autodiscover_tasks() only finds tasks in installed Django apps.
# Explicitly register our tasks module.
import bytescop.tasks  # noqa: F401, E402

# Route tasks to separate queues
app.conf.task_routes = {
    'bytescop.tasks.process_notification': {'queue': 'notifications'},
    'bytescop.tasks.process_job': {'queue': 'jobs'},
    'bytescop.tasks.cleanup_expired_jobs': {'queue': 'jobs'},
}
