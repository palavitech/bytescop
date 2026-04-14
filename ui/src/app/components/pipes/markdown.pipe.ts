import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value?.trim()) return '';
    let html = marked.parse(value, { async: false }) as string;
    html = DOMPurify.sanitize(html, {
      ADD_ATTR: ['class', 'title', 'alt', 'src'],
      ADD_TAGS: ['figure', 'figcaption'],
    });
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
