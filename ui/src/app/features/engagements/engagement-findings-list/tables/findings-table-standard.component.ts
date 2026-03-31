import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Finding, FINDING_SEVERITY_LABELS, FINDING_STATUS_LABELS, FindingSeverity, FindingStatus } from '../../models/finding.model';
import { BcDatePipe } from '../../../../components/pipes/bc-date.pipe';

@Component({
  selector: 'app-findings-table-standard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, BcDatePipe],
  template: `
    <div class="table-responsive">
      <table class="table table-dark mb-0 align-middle bc-table">
        <thead>
          <tr>
            <th style="min-width:260px">Title</th>
            <th style="min-width:140px">Asset</th>
            <th style="min-width:140px">Severity</th>
            <th style="min-width:140px">Status</th>
            <th style="min-width:180px">Updated</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let f of findings">
            <td>
              <a class="bc-rowLink" [routerLink]="['/engagements', engagementId, 'findings', f.id]">{{ f.title }}</a>
              <span class="bc-draftBadge ms-2" *ngIf="f.is_draft">Draft</span>
            </td>
            <td>{{ f.asset_name || '—' }}</td>
            <td><span class="bc-severityPill bc-severityPill--{{ f.severity }}">{{ prettySeverity(f.severity) }}</span></td>
            <td>{{ prettyStatus(f.status) }}</td>
            <td>{{ f.updated_at | bcDate }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class FindingsTableStandardComponent {
  @Input({ required: true }) findings: Finding[] = [];
  @Input({ required: true }) engagementId = '';

  prettySeverity(s: string): string {
    return FINDING_SEVERITY_LABELS[s as FindingSeverity] ?? s;
  }

  prettyStatus(s: string): string {
    return FINDING_STATUS_LABELS[s as FindingStatus] ?? s;
  }
}
