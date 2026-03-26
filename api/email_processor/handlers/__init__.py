"""Event handler registry — maps (area, event_type) to handler classes."""

from email_processor.handlers.closure import ClosureConfirmHandler, ClosureExecuteHandler, ClosurePurgedHandler
from email_processor.handlers.comments import CommentMentionHandler, CommentReplyHandler
from email_processor.handlers.member_locked import MemberLockedHandler, MemberUnlockedHandler
from email_processor.handlers.member_removed import MemberRemovedHandler
from email_processor.handlers.membership import MemberCreatedHandler, MemberDemotedHandler, MemberPromotedHandler
from email_processor.handlers.forgot_password import ForgotPasswordHandler
from email_processor.handlers.password_changed import PasswordChangedHandler
from email_processor.handlers.mfa import (
    MfaBackupCodesRegeneratedHandler,
    MfaDeviceChangedHandler,
    MfaDisabledHandler,
    MfaEnrolledHandler,
    MfaResetByAdminHandler,
)
from email_processor.handlers.welcome import WelcomeHandler

HANDLER_REGISTRY: dict[tuple[str, str], type] = {
    ('membership', 'member_created'): MemberCreatedHandler,
    ('membership', 'member_promoted'): MemberPromotedHandler,
    ('membership', 'member_demoted'): MemberDemotedHandler,
    ('membership', 'member_removed'): MemberRemovedHandler,
    ('membership', 'member_locked'): MemberLockedHandler,
    ('membership', 'member_unlocked'): MemberUnlockedHandler,
    ('tenant', 'closure_confirm'): ClosureConfirmHandler,
    ('tenant', 'closure_execute'): ClosureExecuteHandler,
    ('tenant', 'closure_purged'): ClosurePurgedHandler,
    ('account', 'password_changed'): PasswordChangedHandler,
    ('account', 'welcome'): WelcomeHandler,
    ('account', 'forgot_password'): ForgotPasswordHandler,
    ('account', 'mfa_enrolled'): MfaEnrolledHandler,
    ('account', 'mfa_disabled'): MfaDisabledHandler,
    ('account', 'mfa_device_changed'): MfaDeviceChangedHandler,
    ('account', 'mfa_backup_codes_regenerated'): MfaBackupCodesRegeneratedHandler,
    ('account', 'mfa_reset_by_admin'): MfaResetByAdminHandler,
    ('comments', 'mention'): CommentMentionHandler,
    ('comments', 'reply'): CommentReplyHandler,
}


def get_handler(area: str, event_type: str):
    """Look up and instantiate the handler for the given event, or None."""
    cls = HANDLER_REGISTRY.get((area, event_type))
    if cls is None:
        return None
    return cls()
