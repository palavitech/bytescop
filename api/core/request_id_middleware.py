"""Middleware that assigns a unique request ID to every request.

Place early in MIDDLEWARE (after SecurityMiddleware, before CorsMiddleware)
so every downstream middleware and view has access to the ID.
"""

import uuid

from django.utils.deprecation import MiddlewareMixin

from core.logging import request_id_var


class RequestIdMiddleware(MiddlewareMixin):
    """Read or generate an ``X-Request-ID`` and propagate it."""

    def process_request(self, request):
        rid = request.META.get("HTTP_X_REQUEST_ID") or uuid.uuid4().hex[:12]
        request.request_id = rid
        request._request_id_token = request_id_var.set(rid)

    def process_response(self, request, response):
        rid = getattr(request, "request_id", request_id_var.get())
        response["X-Request-ID"] = rid
        # Reset the context var to avoid leaking across requests in
        # threaded/async servers.
        token = getattr(request, "_request_id_token", None)
        if token is not None:
            request_id_var.reset(token)
        return response
