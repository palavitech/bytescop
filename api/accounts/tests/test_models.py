from django.test import TestCase
from django.db import IntegrityError

from accounts.models import User


STRONG_PASSWORD = "Str0ngP@ss!99"


class UserManagerCreateUserTests(TestCase):
    """Test UserManager.create_user()."""

    def test_create_user_success(self):
        user = User.objects.create_user(email="test@example.com", password=STRONG_PASSWORD)
        self.assertEqual(user.email, "test@example.com")
        self.assertTrue(user.check_password(STRONG_PASSWORD))

    def test_create_user_normalizes_email(self):
        user = User.objects.create_user(email="Test@EXAMPLE.COM", password=STRONG_PASSWORD)
        self.assertEqual(user.email, "Test@example.com")

    def test_create_user_no_email_raises(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", password=STRONG_PASSWORD)

    def test_create_user_extra_fields(self):
        user = User.objects.create_user(
            email="test@example.com",
            password=STRONG_PASSWORD,
            first_name="John",
            last_name="Doe",
        )
        self.assertEqual(user.first_name, "John")
        self.assertEqual(user.last_name, "Doe")

    def test_create_user_not_staff(self):
        user = User.objects.create_user(email="test@example.com", password=STRONG_PASSWORD)
        self.assertFalse(user.is_staff)

    def test_create_user_not_superuser(self):
        user = User.objects.create_user(email="test@example.com", password=STRONG_PASSWORD)
        self.assertFalse(user.is_superuser)

    def test_create_user_is_active(self):
        user = User.objects.create_user(email="test@example.com", password=STRONG_PASSWORD)
        self.assertTrue(user.is_active)


class UserManagerCreateSuperuserTests(TestCase):
    """Test UserManager.create_superuser()."""

    def test_create_superuser_is_staff(self):
        user = User.objects.create_superuser(email="admin@example.com", password=STRONG_PASSWORD)
        self.assertTrue(user.is_staff)

    def test_create_superuser_is_superuser(self):
        user = User.objects.create_superuser(email="admin@example.com", password=STRONG_PASSWORD)
        self.assertTrue(user.is_superuser)

    def test_create_superuser_can_login(self):
        user = User.objects.create_superuser(email="admin@example.com", password=STRONG_PASSWORD)
        self.assertTrue(user.check_password(STRONG_PASSWORD))


class UserModelTests(TestCase):
    """Test User model fields and behavior."""

    def test_username_field_is_email(self):
        self.assertEqual(User.USERNAME_FIELD, "email")

    def test_required_fields_empty(self):
        self.assertEqual(User.REQUIRED_FIELDS, [])

    def test_str_returns_email(self):
        user = User.objects.create_user(email="test@example.com", password=STRONG_PASSWORD)
        self.assertEqual(str(user), "test@example.com")

    def test_email_unique(self):
        User.objects.create_user(email="test@example.com", password=STRONG_PASSWORD)
        with self.assertRaises(IntegrityError):
            User.objects.create_user(email="test@example.com", password=STRONG_PASSWORD)

    def test_ordering_by_date_joined_desc(self):
        u1 = User.objects.create_user(email="first@example.com", password=STRONG_PASSWORD)
        u2 = User.objects.create_user(email="second@example.com", password=STRONG_PASSWORD)
        users = list(User.objects.all())
        self.assertEqual(users[0].pk, u2.pk)
        self.assertEqual(users[1].pk, u1.pk)

    def test_no_username_field(self):
        self.assertIsNone(User.username)
