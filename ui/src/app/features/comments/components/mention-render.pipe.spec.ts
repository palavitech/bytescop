import { TestBed } from '@angular/core/testing';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MentionRenderPipe } from './mention-render.pipe';

describe('MentionRenderPipe', () => {
  let pipe: MentionRenderPipe;
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MentionRenderPipe],
    });
    pipe = TestBed.inject(MentionRenderPipe);
    sanitizer = TestBed.inject(DomSanitizer);
  });

  it('should be created', () => {
    expect(pipe).toBeTruthy();
  });

  // --- null/undefined/empty branches ---

  it('should return empty string for null', () => {
    const result = pipe.transform(null);
    expect(result).toBe('');
  });

  it('should return empty string for undefined', () => {
    const result = pipe.transform(undefined);
    expect(result).toBe('');
  });

  it('should return empty string for empty string', () => {
    const result = pipe.transform('');
    expect(result).toBe('');
  });

  // --- HTML escaping ---

  it('should escape & characters', () => {
    const result = pipe.transform('A & B') as any;
    // SafeHtml wraps internal value; check via toString or changingDetection
    expect(result).toBeTruthy();
    // Verify by getting the underlying value
    const html = unwrapSafeHtml(result);
    expect(html).toContain('&amp;');
    expect(html).not.toContain('& ');
  });

  it('should escape < characters', () => {
    const html = unwrapSafeHtml(pipe.transform('<script>'));
    expect(html).toContain('&lt;');
    expect(html).not.toContain('<script>');
  });

  it('should escape > characters', () => {
    const html = unwrapSafeHtml(pipe.transform('a > b'));
    expect(html).toContain('&gt;');
  });

  // --- Mention rendering ---

  it('should render a mention as a span', () => {
    const html = unwrapSafeHtml(pipe.transform('@[John Doe](user-123)'));
    expect(html).toContain('<span class="bc-mention">@John Doe</span>');
  });

  it('should render multiple mentions', () => {
    const html = unwrapSafeHtml(
      pipe.transform('Hello @[Alice](1) and @[Bob](2)!'),
    );
    expect(html).toContain('<span class="bc-mention">@Alice</span>');
    expect(html).toContain('<span class="bc-mention">@Bob</span>');
  });

  it('should not render invalid mention syntax', () => {
    const html = unwrapSafeHtml(pipe.transform('@[Name]'));
    expect(html).not.toContain('bc-mention');
    expect(html).toContain('@[Name]');
  });

  // --- Newline conversion ---

  it('should convert newlines to <br>', () => {
    const html = unwrapSafeHtml(pipe.transform('line1\nline2'));
    expect(html).toContain('line1<br>line2');
  });

  it('should convert multiple newlines', () => {
    const html = unwrapSafeHtml(pipe.transform('a\n\nb'));
    expect(html).toContain('a<br><br>b');
  });

  // --- Combined ---

  it('should escape HTML, render mentions, and convert newlines together', () => {
    const input = 'Hello @[Alice](1) & @[Bob](2)\n<script>';
    const html = unwrapSafeHtml(pipe.transform(input));
    expect(html).toContain('<span class="bc-mention">@Alice</span>');
    expect(html).toContain('&amp;');
    expect(html).toContain('<br>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should handle plain text with no special content', () => {
    const html = unwrapSafeHtml(pipe.transform('Just a plain comment'));
    expect(html).toBe('Just a plain comment');
  });
});

/**
 * Extracts the underlying string from a SafeHtml value.
 * Angular's DomSanitizer.bypassSecurityTrustHtml wraps strings
 * in an object with a changingThisBreaksApplicationSecurity property.
 */
function unwrapSafeHtml(value: SafeHtml): string {
  if (typeof value === 'string') return value;
  return (value as any).changingThisBreaksApplicationSecurity ?? String(value);
}
