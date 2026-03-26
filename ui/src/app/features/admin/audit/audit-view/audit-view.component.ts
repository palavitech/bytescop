import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { switchMap, map, tap, catchError } from 'rxjs/operators';

import { AuditService } from '../services/audit.service';
import {
  AuditLogDetail,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_COLORS,
  AuditAction,
} from '../models/audit-log.model';
import { BcDatePipe } from '../../../../components/pipes/bc-date.pipe';

type ViewState = 'init' | 'ready' | 'error' | 'missing';

interface ViewModel {
  state: ViewState;
  entry: AuditLogDetail | null;
}

interface AnnotatedLine {
  text: string;
  highlighted: boolean;
}

@Component({
  selector: 'app-audit-view',
  standalone: true,
  imports: [CommonModule, BcDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit-view.component.html',
  styleUrl: './audit-view.component.css',
})
export class AuditViewComponent implements OnInit {
  private readonly auditService = inject(AuditService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  showHelp = false;
  showBefore = false;
  showAfter = false;

  beforeLines: AnnotatedLine[] = [];
  afterLines: AnnotatedLine[] = [];

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private entryId = 0;

  vm$ = of<ViewModel>({ state: 'init', entry: null });

  ngOnInit(): void {
    this.entryId = Number(this.route.snapshot.paramMap.get('id') ?? '0');

    this.vm$ = this.refresh$.pipe(
      switchMap(() =>
        this.auditService.getById(this.entryId).pipe(
          map(entry => ({ state: 'ready' as ViewState, entry })),
          tap(vm => {
            if (vm.entry) {
              this.beforeLines = this.buildAnnotatedJson(vm.entry.before, vm.entry.diff);
              this.afterLines = this.buildAnnotatedJson(vm.entry.after, vm.entry.diff);
            }
          }),
          catchError(err => {
            if (err?.status === 404) {
              return of({ state: 'missing' as ViewState, entry: null });
            }
            return of({ state: 'error' as ViewState, entry: null });
          }),
        ),
      ),
    );
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  refresh(): void {
    this.refresh$.next();
  }

  toggleBefore(): void {
    this.showBefore = !this.showBefore;
  }

  toggleAfter(): void {
    this.showAfter = !this.showAfter;
  }

  getActionLabel(action: string): string {
    return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
  }

  getActionColor(action: string): string {
    return AUDIT_ACTION_COLORS[action as AuditAction] ?? 'secondary';
  }

  formatJson(obj: unknown): string {
    if (!obj) return '(empty)';
    return JSON.stringify(obj, null, 2);
  }

  getDiffKeys(diff: Record<string, { old: unknown; new: unknown }> | null): string[] {
    if (!diff) return [];
    return Object.keys(diff);
  }

  formatValue(val: unknown): string {
    if (val === null || val === undefined) return '\u2014';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  buildAnnotatedJson(
    obj: Record<string, unknown> | null,
    diff: Record<string, unknown> | null,
  ): AnnotatedLine[] {
    if (!obj) return [];
    const keys = Object.keys(obj);
    const lines: AnnotatedLine[] = [{ text: '{', highlighted: false }];
    keys.forEach((key, i) => {
      const valStr = JSON.stringify(obj[key]);
      const comma = i < keys.length - 1 ? ',' : '';
      lines.push({
        text: `  "${key}": ${valStr}${comma}`,
        highlighted: !!diff && key in diff,
      });
    });
    lines.push({ text: '}', highlighted: false });
    return lines;
  }
}
