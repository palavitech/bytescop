from django.conf import settings
from django.utils.deprecation import MiddlewareMixin


class VersionHeaderMiddleware(MiddlewareMixin):
    """Add X-API-Version header to every response."""

    def process_response(self, request, response):
        response['X-API-Version'] = settings.APP_VERSION
        return response
