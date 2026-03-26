"""Request-ID context variable, logging filter, and JSON formatter.

Usage in settings.LOGGING:
    'filters': {
        'request_id': {'()': 'core.logging.RequestIdFilter'},
    }
    'formatters': {
        'standard': {
            'format': '%(asctime)s %(levelname)-8s [%(request_id)s] %(name)s %(message)s',
        },
        'json': {
            '()': 'core.logging.JsonFormatter',
        },
    }
"""

import json
import logging
from contextvars import ContextVar

# Holds the current request's ID; accessible from any async-safe code path.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    """Inject ``request_id`` into every log record."""

    def filter(self, record):
        record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    """Single-line JSON formatter for CloudWatch Logs Insights.

    Each log line is a JSON object with: timestamp, level, logger,
    request_id, message, module, lineno.  Tracebacks are included as
    a ``traceback`` field when present.
    """

    def format(self, record):
        entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
            "module": record.module,
            "lineno": record.lineno,
        }
        if record.exc_info and record.exc_info[0] is not None:
            entry["traceback"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


class JsonAccessLogFormatter(logging.Formatter):
    """JSON formatter for gunicorn access logs.

    Unlike the template-based ``--access-logformat``, this uses
    ``json.dumps`` so values containing quotes or special characters
    (e.g. User-Agent) are properly escaped.

    Gunicorn passes ``record.args`` as a SafeAtoms dict with
    single-letter keys (``h``, ``m``, ``U``, ``s``, ``M``, ``a``,
    etc.) plus ``{header}i`` for request headers.  We extract what
    we need and build a proper JSON line.
    """

    def format(self, record):
        # record.args is gunicorn's SafeAtoms (dict-like)
        atoms = record.args if isinstance(record.args, dict) else {}
        entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "type": "access",
            "method": str(atoms.get("m", "-")),
            "path": str(atoms.get("U", "-")),
            "query": str(atoms.get("q", "")),
            "status": str(atoms.get("s", "-")),
            "response_bytes": str(atoms.get("B", "-")),
            "duration_ms": str(atoms.get("M", "-")),
            "remote_ip": str(atoms.get("{x-forwarded-for}i",
                                       atoms.get("h", "-"))),
            "user_agent": str(atoms.get("a", "-")),
        }
        return json.dumps(entry, default=str)
