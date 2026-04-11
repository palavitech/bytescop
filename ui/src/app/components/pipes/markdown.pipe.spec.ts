import { TestBed } from '@angular/core/testing';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MarkdownPipe } from './markdown.pipe';

describe('MarkdownPipe', () => {
  let pipe: MarkdownPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MarkdownPipe],
    });
    pipe = TestBed.inject(MarkdownPipe);
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  it('returns empty string for null input', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(pipe.transform('   ')).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(pipe.transform('')).toBe('');
  });

  it('converts markdown heading to HTML', () => {
    const result = pipe.transform('# Hello');
    // SafeHtml wraps the actual string; convert to string representation
    const html = extractHtml(result);
    expect(html).toContain('<h1');
    expect(html).toContain('Hello');
  });

  it('converts bold markdown to HTML', () => {
    const result = pipe.transform('**bold text**');
    const html = extractHtml(result);
    expect(html).toContain('<strong>');
    expect(html).toContain('bold text');
  });

  it('converts markdown paragraphs', () => {
    const result = pipe.transform('Hello world');
    const html = extractHtml(result);
    expect(html).toContain('<p>');
    expect(html).toContain('Hello world');
  });

  it('sanitizes dangerous HTML', () => {
    const result = pipe.transform('<script>alert("xss")</script>');
    const html = extractHtml(result);
    expect(html).not.toContain('<script>');
  });

  it('preserves allowed tags like figure and figcaption', () => {
    const result = pipe.transform('<figure><figcaption>Caption</figcaption></figure>');
    const html = extractHtml(result);
    expect(html).toContain('<figure>');
    expect(html).toContain('<figcaption>');
  });
});

/**
 * Extract the underlying HTML string from a SafeHtml value.
 * Angular's DomSanitizer wraps it, but we can access the internal value.
 */
function extractHtml(safeHtml: SafeHtml): string {
  // SafeHtmlImpl stores the value in changingThisBreaksApplicationSecurity
  // but we can also just toString() or check the type
  const str = (safeHtml as any)?.changingThisBreaksApplicationSecurity
    ?? (safeHtml as any)?.toString()
    ?? String(safeHtml);
  return str;
}
