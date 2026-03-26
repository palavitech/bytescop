import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ClassificationEntry } from '../models/classification-data';

@Injectable({ providedIn: 'root' })
export class ClassificationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/classifications/`;

  readonly assessmentAreas$: Observable<ClassificationEntry[]> = this.http
    .get<ClassificationEntry[]>(this.baseUrl, { params: { type: 'assessment_area' } })
    .pipe(shareReplay(1));

  readonly owaspCategories$: Observable<ClassificationEntry[]> = this.http
    .get<ClassificationEntry[]>(this.baseUrl, { params: { type: 'owasp' } })
    .pipe(shareReplay(1));

  readonly cweEntries$: Observable<ClassificationEntry[]> = this.http
    .get<ClassificationEntry[]>(this.baseUrl, { params: { type: 'cwe' } })
    .pipe(shareReplay(1));

  readonly assessmentAreaMap$: Observable<Map<string, ClassificationEntry>> = this.assessmentAreas$.pipe(
    map(entries => new Map(entries.map(e => [e.code, e]))),
    shareReplay(1),
  );

  readonly owaspMap$: Observable<Map<string, ClassificationEntry>> = this.owaspCategories$.pipe(
    map(entries => new Map(entries.map(e => [e.code, e]))),
    shareReplay(1),
  );

  readonly cweMap$: Observable<Map<string, ClassificationEntry>> = this.cweEntries$.pipe(
    map(entries => new Map(entries.map(e => [e.code, e]))),
    shareReplay(1),
  );
}
