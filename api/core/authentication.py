"""Custom session authentication that returns 401 for unauthenticated requests.

DRF's SessionAuthentication returns 403 for unauthenticated requests because
it doesn't define authenticate_header(). This subclass adds it so DRF returns
401 instead — which the frontend interceptor uses to redirect to /login.

It also respects Django's @csrf_exempt decorator. DRF's SessionAuthentication
enforces CSRF by creating its own CSRFCheck instance and calling process_view
with callback=None, which means it never sees the @csrf_exempt attribute on the
view function. This subclass checks the resolved view for csrf_exempt before
running the CSRF check.
"""

from rest_framework.authentication import SessionAuthentication


class SessionAuthWith401(SessionAuthentication):
    """SessionAuthentication that returns 401 (not 403) when unauthenticated,
    and respects @csrf_exempt on views."""

    def authenticate_header(self, request):
        return 'Session'

    def authenticate(self, request):
        # Check if the resolved view is csrf_exempt — if so, skip CSRF entirely
        resolver_match = getattr(request, 'resolver_match', None)
        if resolver_match:
            view_func = resolver_match.func
            # DRF wraps views, check both the wrapper and the original
            if getattr(view_func, 'csrf_exempt', False):
                # Still authenticate the user via session, just skip CSRF
                user = getattr(request._request, 'user', None)
                if user and user.is_authenticated:
                    return (user, None)
                return None
            # Check wrapped initkwargs (for class-based views)
            cls = getattr(view_func, 'cls', None)
            if cls and getattr(cls, 'csrf_exempt', False):
                user = getattr(request._request, 'user', None)
                if user and user.is_authenticated:
                    return (user, None)
                return None

        return super().authenticate(request)
