import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';

const MENTION_RE = /@\[([^\]]+)\]\((\w[\w-]*)\)/g;

@Pipe({ name: 'bcMentionRender', standalone: true })
export class MentionRenderPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';

    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const rendered = escaped.replace(
      MENTION_RE,
      '<span class="bc-mention">@$1</span>',
    );

    // Convert newlines to <br>
    const withBreaks = rendered.replace(/\n/g, '<br>');

    return this.sanitizer.bypassSecurityTrustHtml(withBreaks);
  }
}
