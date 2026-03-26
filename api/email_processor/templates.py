"""Template loading and rendering — filesystem + Jinja2 with template inheritance."""

import logging
from pathlib import Path

import jinja2

logger = logging.getLogger(__name__)

# Templates are bundled in the Docker image at this path
TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / 'email_templates'

_env = None


def _get_env():
    global _env
    if _env is None:
        _env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR)),
            autoescape=True,
        )
    return _env


def render_template(template_path: str, data: dict) -> str:
    """Load a template from the filesystem (with inheritance) and render it.

    Args:
        template_path: Relative path, e.g. 'membership/member_created.html'
        data: Dict of template variables.

    Returns:
        Rendered HTML string.
    """
    env = _get_env()
    template = env.get_template(template_path)
    return template.render(**data)
