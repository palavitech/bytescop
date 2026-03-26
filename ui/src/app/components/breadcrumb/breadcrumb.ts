import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';
import { filter } from 'rxjs/operators';

type Crumb = { label: string; url: string };

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgFor, NgIf, RouterLink],
  templateUrl: './breadcrumb.html',
  styleUrls: ['./breadcrumb.css'],
})
export class BreadcrumbComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  crumbs: Crumb[] = [];

  constructor(private router: Router, private route: ActivatedRoute) {
    const rebuild = () => {
      this.crumbs = this.buildCrumbs(this.route.root);
      this.cdr.markForCheck();
    };

    rebuild();

    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => rebuild());
  }

  private buildCrumbs(route: ActivatedRoute, url = '', out: Crumb[] = []): Crumb[] {
    const child = route.firstChild;
    if (!child) return out;

    const seg = child.snapshot.url.map(s => s.path).join('/');
    const nextUrl = seg ? `${url}/${seg}` : url;

    const label = child.snapshot.data?.['breadcrumb'] ?? this.titleize(seg);
    if (label) out.push({ label, url: nextUrl || '/' });

    return this.buildCrumbs(child, nextUrl, out);
  }

  private titleize(seg: string): string {
    if (!seg) return '';
    return seg
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, m => m.toUpperCase());
  }
}
