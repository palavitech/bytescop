import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Finding, FINDING_SEVERITY_LABELS, FINDING_STATUS_LABELS, FindingSeverity, FindingStatus } from '../../models/finding.model';
import { BcDatePipe } from '../../../../components/pipes/bc-date.pipe';
import { MarkdownPipe } from '../../../../components/pipes/markdown.pipe';

@Component({
  selector: 'app-findings-table-standard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, BcDatePipe, MarkdownPipe],
  template: `
    <div class="table-responsive">
      <table class="table table-dark mb-0 align-middle bc-table">
        <thead>
          <tr>
            <th style="width:36px"></th>
            <th style="min-width:260px">Title</th>
            <th style="min-width:140px">Asset</th>
            <th style="min-width:140px">Severity</th>
            <th style="min-width:140px">Status</th>
            <th style="min-width:180px">Updated</th>
          </tr>
        </thead>
        <tbody>
          <ng-container *ngFor="let f of findings">
            <tr>
              <td class="bc-expandCell">
                <button class="btn btn-sm bc-expandBtn" (click)="toggleExpand(f.id)" [title]="expandedId === f.id ? 'Collapse' : 'Expand'">
                  <i class="bi" [ngClass]="expandedId === f.id ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                </button>
              </td>
              <td>
                <a class="bc-rowLink" [routerLink]="['/engagements', engagementId, 'findings', f.id]">{{ f.title }}</a>
                <span class="bc-draftBadge ms-2" *ngIf="f.is_draft">Draft</span>
              </td>
              <td>{{ f.asset_name || '—' }}</td>
              <td><span class="bc-severityPill bc-severityPill--{{ f.severity }}">{{ prettySeverity(f.severity) }}</span></td>
              <td>{{ prettyStatus(f.status) }}</td>
              <td>{{ f.updated_at | bcDate }}</td>
            </tr>
            <tr *ngIf="expandedId === f.id" class="bc-expandRow">
              <td [attr.colspan]="6" class="p-0">
                <div class="bc-expandPanel bc-md" [innerHTML]="f.description_md ? (f.description_md | markdown) : 'No description.'"></div>
              </td>
            </tr>
          </ng-container>
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .bc-expandCell { padding: 0 4px !important; width: 36px; }
    .bc-expandBtn {
      color: var(--bc-accent2, #00b7ff);
      padding: 2px 6px;
      line-height: 1;
      background: none;
      border: none;
      opacity: .6;
      transition: opacity .15s;
    }
    .bc-expandBtn:hover { opacity: 1; }
    .bc-expandRow > td { border-top: none !important; }
    .bc-expandPanel {
      max-height: 500px;
      overflow-y: auto;
      padding: 8px 14px;
      font-size: 12px;
      line-height: 1.55;

      color: rgba(201, 212, 255, .78);
      background: rgba(0, 183, 255, .04);
      border-top: 1px solid rgba(0, 183, 255, .10);
      scrollbar-width: thin;
      scrollbar-color: rgba(0, 183, 255, .18) transparent;
    }
    .bc-expandPanel::-webkit-scrollbar { width: 4px; }
    .bc-expandPanel::-webkit-scrollbar-track { background: transparent; }
    .bc-expandPanel::-webkit-scrollbar-thumb { background: rgba(0, 183, 255, .22); border-radius: 4px; }
  `],
})
export class FindingsTableStandardComponent {
  @Input({ required: true }) findings: Finding[] = [];
  @Input({ required: true }) engagementId = '';
  @Input() requestRefresh?: () => void;

  expandedId: string | null = null;

  toggleExpand(id: string): void {
    this.expandedId = this.expandedId === id ? null : id;
  }

  prettySeverity(s: string): string {
    return FINDING_SEVERITY_LABELS[s as FindingSeverity] ?? s;
  }

  prettyStatus(s: string): string {
    return FINDING_STATUS_LABELS[s as FindingStatus] ?? s;
  }
}
