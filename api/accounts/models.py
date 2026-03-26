from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    """Manager for email-based User model (no username)."""

    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)


class User(AbstractUser):
    """Custom user with email as the login identifier."""

    username = None  # type: ignore[assignment]
    email = models.EmailField("email address", unique=True)
    phone = models.CharField(max_length=40, blank=True, default="")
    timezone = models.CharField(max_length=80, blank=True, default="")
    avatar_uri = models.TextField(blank=True, default="")
    password_changed_at = models.DateTimeField(null=True, blank=True)

    # Email verification
    email_verified = models.BooleanField(default=False)

    # MFA fields
    mfa_secret = models.CharField(max_length=255, blank=True, default="")
    mfa_enabled = models.BooleanField(default=False)
    mfa_backup_codes = models.JSONField(default=list, blank=True)
    mfa_enrolled_at = models.DateTimeField(null=True, blank=True)
    last_totp_at = models.BigIntegerField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = UserManager()  # type: ignore[assignment]

    class Meta:
        ordering = ["-date_joined"]

    def __str__(self) -> str:
        return self.email
