"""Setting definitions registry.

All available settings are declared here. The AccountSetting model stores
only per-tenant overrides. The API returns definitions merged with tenant
values so the frontend always knows the full settings schema.

To add a new setting, append to SETTING_DEFINITIONS — no migration needed.
"""

from dataclasses import dataclass


class SettingType:
    TEXT = 'text'
    BOOLEAN = 'boolean'
    CHOICE = 'choice'


@dataclass(frozen=True)
class SettingDefinition:
    key: str
    label: str
    description: str
    setting_type: str = SettingType.TEXT
    choices: tuple[str, ...] = ()
    default: str = ''
    group: str = 'General'
    order: int = 0


SETTING_DEFINITIONS: tuple[SettingDefinition, ...] = (
    # ── General ──
    SettingDefinition(
        key='company_name',
        label='Workspace Name',
        description='Your organization name, shown in reports and exports.',
        group='General',
        order=10,
    ),
    # ── Password Policy ──
    SettingDefinition(
        key='password_min_length',
        label='Minimum Password Length',
        description='Minimum number of characters required for passwords.',
        setting_type=SettingType.CHOICE,
        choices=('8', '10', '12', '14', '16'),
        default='10',
        group='Password Policy',
        order=100,
    ),
    SettingDefinition(
        key='password_require_uppercase',
        label='Require Uppercase',
        description='Require at least one uppercase letter in passwords.',
        setting_type=SettingType.BOOLEAN,
        default='true',
        group='Password Policy',
        order=110,
    ),
    SettingDefinition(
        key='password_require_special',
        label='Require Special Character',
        description='Require at least one special character (!@#$%^&*) in passwords.',
        setting_type=SettingType.BOOLEAN,
        default='true',
        group='Password Policy',
        order=120,
    ),
    SettingDefinition(
        key='password_require_number',
        label='Require Number',
        description='Require at least one numeric digit in passwords.',
        setting_type=SettingType.BOOLEAN,
        default='true',
        group='Password Policy',
        order=130,
    ),
    SettingDefinition(
        key='password_expiry_days',
        label='Password Expiry (Days)',
        description='Number of days before passwords expire and users must reset. Set to 0 to disable expiry.',
        setting_type=SettingType.CHOICE,
        choices=('0', '30', '60', '90', '180', '365'),
        default='0',
        group='Password Policy',
        order=140,
    ),
    # ── MFA Policy ──
    SettingDefinition(
        key='mfa_required_all',
        label='Require MFA for All Users',
        description='When enabled, all users must set up MFA. Owners and Administrators are always required.',
        setting_type=SettingType.BOOLEAN,
        default='false',
        group='MFA Policy',
        order=150,
    ),
    # ── Display ──
    SettingDefinition(
        key='date_format',
        label='Date Format',
        description='Date format used across the application. Timestamps like audit logs and created/updated fields use a fixed format.',
        setting_type=SettingType.CHOICE,
        choices=(
            'MMM d, yyyy',
            'dd MMM yyyy',
            'dd/MM/yyyy',
            'MM/dd/yyyy',
            'yyyy-MM-dd',
            'EEE, MMM d, yyyy',
        ),
        default='MMM d, yyyy',
        group='Display',
        order=50,
    ),
)

DEFINITION_MAP: dict[str, SettingDefinition] = {d.key: d for d in SETTING_DEFINITIONS}
