"""Validate that a target entity exists within the tenant."""

from comments.models import TargetType
from engagements.models import Engagement
from findings.models import Finding

# Maps target_type to (Model, permission_prefix)
TARGET_CONFIG = {
    TargetType.ENGAGEMENT: (Engagement, "engagement"),
    TargetType.FINDING: (Finding, "finding"),
}


def resolve_target(tenant, target_type: str, target_id):
    """Validate the target entity exists in the tenant.

    Returns the target object or None.
    """
    config = TARGET_CONFIG.get(target_type)
    if config is None:
        return None

    model_class, _ = config
    try:
        return model_class.objects.get(tenant=tenant, id=target_id)
    except model_class.DoesNotExist:
        return None


def get_resource_permission_prefix(target_type: str) -> str | None:
    """Return the permission prefix for the target type (e.g., 'engagement')."""
    config = TARGET_CONFIG.get(target_type)
    if config is None:
        return None
    return config[1]


def get_target_label(target_type: str, target_obj) -> str:
    """Return a human-readable label for the target entity."""
    if hasattr(target_obj, "name"):
        return f"{target_type.capitalize()}: {target_obj.name}"
    if hasattr(target_obj, "title"):
        return f"{target_type.capitalize()}: {target_obj.title}"
    return f"{target_type.capitalize()}: {target_obj.pk}"
