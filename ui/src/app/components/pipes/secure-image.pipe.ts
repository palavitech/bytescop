import { Pipe, PipeTransform, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/**
 * Fetches an image URL via HttpClient (with auth headers from interceptor)
 * and returns a sanitized blob object URL for use in <img [src]>.
 *
 * Usage: <img [src]="avatarUrl | secureImage | async">
 */
@Pipe({ name: 'secureImage', standalone: true })
export class SecureImagePipe implements PipeTransform {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  transform(url: string | null): Observable<SafeUrl | null> {
    if (!url) return of(null);

    return this.http.get(url, { responseType: 'blob' }).pipe(
      map(blob => {
        const objectUrl = URL.createObjectURL(blob);
        return this.sanitizer.bypassSecurityTrustUrl(objectUrl);
      }),
      catchError(() => of(null)),
    );
  }
}
