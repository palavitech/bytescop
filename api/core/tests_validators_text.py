"""Unit tests for text sanitization and malicious content detection."""

from django.core.exceptions import ValidationError
from django.test import TestCase

from core.validators import (
    check_sqli,
    check_xss,
    sanitize_text,
    strip_html_tags,
    validate_safe_text,
)


class StripHtmlTagsTests(TestCase):
    """strip_html_tags() should remove all HTML and unescape entities."""

    def test_plain_text_unchanged(self):
        self.assertEqual(strip_html_tags('Hello world'), 'Hello world')

    def test_strips_simple_tags(self):
        self.assertEqual(strip_html_tags('<b>bold</b>'), 'bold')

    def test_strips_nested_tags(self):
        self.assertEqual(strip_html_tags('<div><p>text</p></div>'), 'text')

    def test_strips_self_closing_tags(self):
        self.assertEqual(strip_html_tags('before<br/>after'), 'beforeafter')

    def test_unescapes_entities(self):
        self.assertEqual(strip_html_tags('&amp; &lt; &gt;'), '& < >')

    def test_strips_tags_with_attributes(self):
        self.assertEqual(
            strip_html_tags('<a href="https://evil.com">click</a>'),
            'click',
        )


class CheckXssTests(TestCase):
    """check_xss() should detect common XSS vectors."""

    def test_script_tag(self):
        self.assertIsNotNone(check_xss('<script>alert(1)</script>'))

    def test_script_tag_case_insensitive(self):
        self.assertIsNotNone(check_xss('<SCRIPT>alert(1)</SCRIPT>'))

    def test_script_tag_with_space(self):
        self.assertIsNotNone(check_xss('< script>alert(1)</ script>'))

    def test_javascript_uri(self):
        self.assertIsNotNone(check_xss('javascript:alert(1)'))

    def test_event_handler(self):
        self.assertIsNotNone(check_xss('onerror=alert(1)'))

    def test_onclick_handler(self):
        self.assertIsNotNone(check_xss('onclick=doEvil()'))

    def test_iframe_tag(self):
        self.assertIsNotNone(check_xss('<iframe src="evil.com">'))

    def test_object_tag(self):
        self.assertIsNotNone(check_xss('<object data="evil.swf">'))

    def test_embed_tag(self):
        self.assertIsNotNone(check_xss('<embed src="evil.swf">'))

    def test_form_tag(self):
        self.assertIsNotNone(check_xss('<form action="evil.com">'))

    def test_data_uri(self):
        self.assertIsNotNone(check_xss('data:text/html,<script>'))

    def test_css_expression(self):
        self.assertIsNotNone(check_xss('expression(alert(1))'))

    def test_clean_text_passes(self):
        self.assertIsNone(check_xss('Hello, I need help with pricing.'))

    def test_url_in_text_passes(self):
        self.assertIsNone(check_xss('Visit https://example.com for info'))

    def test_email_in_text_passes(self):
        self.assertIsNone(check_xss('Contact me at user@example.com'))


class CheckSqliTests(TestCase):
    """check_sqli() should detect common SQL injection patterns."""

    def test_union_select(self):
        self.assertIsNotNone(check_sqli("UNION SELECT * FROM users"))

    def test_union_all_select(self):
        self.assertIsNotNone(check_sqli("UNION ALL SELECT 1,2,3"))

    def test_drop_table(self):
        self.assertIsNotNone(check_sqli("DROP TABLE users"))

    def test_insert_into(self):
        self.assertIsNotNone(check_sqli("INSERT INTO users VALUES"))

    def test_delete_from(self):
        self.assertIsNotNone(check_sqli("DELETE FROM users WHERE 1=1"))

    def test_update_set(self):
        self.assertIsNotNone(check_sqli("UPDATE users SET admin=1"))

    def test_semicolon_drop(self):
        self.assertIsNotNone(check_sqli("; DROP TABLE users"))

    def test_or_1_equals_1(self):
        self.assertIsNotNone(check_sqli("' OR '1'='1"))

    def test_sql_comment_dash(self):
        self.assertIsNotNone(check_sqli("admin'-- "))

    def test_sql_comment_block(self):
        self.assertIsNotNone(check_sqli("admin/* comment */"))

    def test_xp_cmdshell(self):
        self.assertIsNotNone(check_sqli("EXEC xp_cmdshell 'dir'"))

    def test_clean_text_passes(self):
        self.assertIsNone(check_sqli('I want to select a pricing plan'))

    def test_normal_apostrophe_passes(self):
        self.assertIsNone(check_sqli("I can't find the delete button"))


class SanitizeTextTests(TestCase):
    """sanitize_text() should strip tags, unescape, and trim."""

    def test_strips_and_trims(self):
        self.assertEqual(sanitize_text('  <b>hello</b>  '), 'hello')

    def test_entities_unescaped(self):
        self.assertEqual(sanitize_text('&amp;test'), '&test')


class ValidateSafeTextTests(TestCase):
    """validate_safe_text() should raise ValidationError for malicious input."""

    def test_xss_raises(self):
        with self.assertRaises(ValidationError):
            validate_safe_text('<script>alert(1)</script>', 'message')

    def test_sqli_raises(self):
        with self.assertRaises(ValidationError):
            validate_safe_text("' OR '1'='1", 'message')

    def test_clean_text_passes(self):
        validate_safe_text('Hello, I have a question.', 'message')

    def test_error_message_includes_field_name(self):
        try:
            validate_safe_text('<script>', 'Name')
            self.fail('Expected ValidationError')
        except ValidationError as e:
            self.assertIn('Name', str(e))
