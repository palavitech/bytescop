"""Views for tenant-scoped settings management."""

import logging

from django.http import FileResponse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.models import AuditAction
from audit.service import log_audit
from authorization.permissions import check_permission

from .definitions import DEFINITION_MAP, SETTING_DEFINITIONS, SettingType
from .logo_service import LogoService
from .models import AccountSetting
from .password_policy import (
    _COMPLEXITY_KEYS,
    is_policy_tightened,
    record_policy_tightened,
)

logger = logging.getLogger("bytescop.settings")


def _merge_settings(tenant):
    """Return all setting definitions merged with tenant overrides."""
    stored = {
        s.key: s
        for s in AccountSetting.objects.filter(tenant=tenant).select_related("updated_by")
        if not s.key.startswith("_")
    }
    result = []
    for defn in sorted(SETTING_DEFINITIONS, key=lambda d: d.order):
        obj = stored.get(defn.key)
        entry = {
            "key": defn.key,
            "label": defn.label,
            "description": defn.description,
            "setting_type": defn.setting_type,
            "choices": list(defn.choices),
            "default": defn.default,
            "group": defn.group,
            "order": defn.order,
            "value": obj.value if obj else defn.default,
            "has_value": obj is not None,
            "updated_at": obj.updated_at.isoformat() if obj else None,
            "updated_by": obj.updated_by.email if obj and obj.updated_by else None,
        }
        result.append(entry)
    return result


def _merge_single(tenant, key):
    """Return a single setting definition merged with tenant value."""
    defn = DEFINITION_MAP[key]
    obj = (
        AccountSetting.objects
        .filter(tenant=tenant, key=key)
        .select_related("updated_by")
        .first()
    )
    return {
        "key": defn.key,
        "label": defn.label,
        "description": defn.description,
        "setting_type": defn.setting_type,
        "choices": list(defn.choices),
        "default": defn.default,
        "group": defn.group,
        "order": defn.order,
        "value": obj.value if obj else defn.default,
        "has_value": obj is not None,
        "updated_at": obj.updated_at.isoformat() if obj else None,
        "updated_by": obj.updated_by.email if obj and obj.updated_by else None,
    }


def _validate_value(defn, value):
    """Validate value against the definition. Returns error string or None."""
    if defn.setting_type == SettingType.BOOLEAN:
        if value not in ('true', 'false'):
            return "Boolean setting must be 'true' or 'false'."
    elif defn.setting_type == SettingType.CHOICE:
        if value not in defn.choices:
            return f"Invalid choice. Must be one of: {', '.join(defn.choices)}."
    return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def settings_list(request):
    """List all settings with definitions merged with tenant values."""
    _, err = check_permission(request, ["tenant_settings.view"])
    if err:
        return err

    data = _merge_settings(request.tenant)
    return Response(data)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def settings_detail(request, key):
    """Upsert (PUT) or reset (DELETE) a single setting."""
    _, err = check_permission(request, ["tenant_settings.manage"])
    if err:
        return err

    if key not in DEFINITION_MAP:
        return Response(
            {"detail": f"Unknown setting key: {key}"},
            status=status.HTTP_404_NOT_FOUND,
        )

    defn = DEFINITION_MAP[key]

    if request.method == "PUT":
        value = request.data.get("value")
        if value is None:
            return Response(
                {"detail": "Field 'value' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        value = str(value)

        error = _validate_value(defn, value)
        if error:
            return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)

        # Capture old value for tightening check
        old_value = None
        if key in _COMPLEXITY_KEYS:
            existing = AccountSetting.objects.filter(
                tenant=request.tenant, key=key,
            ).values_list("value", flat=True).first()
            old_value = existing if existing is not None else defn.default

        obj, created = AccountSetting.objects.get_or_create(
            tenant=request.tenant,
            key=key,
            defaults={"value": value, "updated_by": request.user},
        )

        if created:
            log_audit(
                request=request,
                action=AuditAction.CREATE,
                resource_type="setting",
                resource_id=key,
                resource_repr=f"Setting: {defn.label}",
                after={"key": key, "value": value},
            )
        else:
            before = {"key": key, "value": obj.value}
            if old_value is None and key in _COMPLEXITY_KEYS:
                old_value = obj.value
            obj.value = value
            obj.updated_by = request.user
            obj.save(update_fields=["value", "updated_by", "updated_at"])
            log_audit(
                request=request,
                action=AuditAction.UPDATE,
                resource_type="setting",
                resource_id=key,
                resource_repr=f"Setting: {defn.label}",
                before=before,
                after={"key": key, "value": value},
            )

        # Track policy tightening
        if old_value is not None and is_policy_tightened(key, old_value, value):
            record_policy_tightened(request.tenant, request.user)

        logger.info(
            "Setting %s key=%s user=%s tenant=%s",
            "created" if created else "updated",
            key, request.user.pk, request.tenant.slug,
        )
        return Response(_merge_single(request.tenant, key))

    # DELETE — reset to default
    deleted_count, _ = AccountSetting.objects.filter(
        tenant=request.tenant, key=key,
    ).delete()

    if deleted_count:
        log_audit(
            request=request,
            action=AuditAction.DELETE,
            resource_type="setting",
            resource_id=key,
            resource_repr=f"Setting reset: {defn.label}",
            before={"key": key},
        )
        logger.info(
            "Setting reset key=%s user=%s tenant=%s",
            key, request.user.pk, request.tenant.slug,
        )

    return Response(_merge_single(request.tenant, key))


# ── Logo endpoints ────────────────────────────────────────────────────────────


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def logo_manage(request):
    """Check, upload, or delete the tenant logo."""
    if request.method == "GET":
        _, err = check_permission(request, ["tenant_settings.view"])
        if err:
            return err
        has_logo = AccountSetting.objects.filter(
            tenant=request.tenant, key="logo",
        ).exists()
        return Response({"has_logo": has_logo})

    # POST and DELETE require settings.manage
    _, err = check_permission(request, ["tenant_settings.manage"])
    if err:
        return err

    service = LogoService()

    if request.method == "POST":
        file_obj = request.FILES.get("logo")
        if not file_obj:
            return Response(
                {"detail": "No file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            storage_uri = service.process_and_save(request.tenant, file_obj)
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        AccountSetting.objects.update_or_create(
            tenant=request.tenant,
            key="logo",
            defaults={"value": storage_uri, "updated_by": request.user},
        )

        log_audit(
            request=request,
            action=AuditAction.UPDATE,
            resource_type="setting",
            resource_id="logo",
            resource_repr="Setting: Logo",
            after={"key": "logo", "value": "(uploaded)"},
        )
        logger.info(
            "Logo uploaded tenant=%s user=%s",
            request.tenant.slug, request.user.pk,
        )
        return Response({"has_logo": True}, status=status.HTTP_201_CREATED)

    # DELETE
    try:
        setting = AccountSetting.objects.get(tenant=request.tenant, key="logo")
        service.delete(setting.value)
        setting.delete()
        log_audit(
            request=request,
            action=AuditAction.DELETE,
            resource_type="setting",
            resource_id="logo",
            resource_repr="Setting: Logo",
            before={"key": "logo"},
        )
        logger.info(
            "Logo deleted tenant=%s user=%s",
            request.tenant.slug, request.user.pk,
        )
    except AccountSetting.DoesNotExist:
        pass
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def logo_content(request):
    """Serve the tenant logo image bytes."""
    try:
        setting = AccountSetting.objects.get(tenant=request.tenant, key="logo")
    except AccountSetting.DoesNotExist:
        return Response(
            {"detail": "No logo found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    storage_uri = setting.value
    service = LogoService()

    f = service.open(storage_uri)
    if f is None:
        return Response(
            {"detail": "Logo file not found."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return FileResponse(f, content_type="image/png")
