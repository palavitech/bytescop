import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Finding } from '../../models/finding.model';
import { FORENSICS_CONFIDENCE_LABELS, ForensicsConfidence, MITRE_TACTICS } from './forensics.model';
import { BcDatePipe } from '../../../../components/pipes/bc-date.pipe';
import { MarkdownPipe } from '../../../../components/pipes/markdown.pipe';

@Component({
  selector: 'app-findings-table-forensics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, BcDatePipe, MarkdownPipe],
  template: `
    <div class="table-responsive">
      <table class="table table-dark mb-0 align-middle bc-table">
        <thead>
          <tr>
            <th style="width:36px"></th>
            <th style="min-width:240px">Title</th>
            <th style="min-width:160px">Evidence Source</th>
            <th style="min-width:160px">ATT&amp;CK Tactic</th>
            <th style="min-width:120px">Confidence</th>
            <th style="min-width:140px">Timeline</th>
            <th style="min-width:160px">Updated</th>
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
              <td>
                <i class="bi bi-search me-1" style="color:var(--bc-accent2)"></i>
                {{ f.evidence_source_name || '—' }}
              </td>
              <td>{{ prettyTactic(f.mitre_tactic) }}</td>
              <td>
                <span class="bc-confidencePill" [attr.data-confidence]="f.confidence">
                  {{ prettyConfidence(f.confidence) }}
                </span>
              </td>
              <td>{{ f.occurrence_date || '—' }}</td>
              <td>{{ f.updated_at | bcDate }}</td>
            </tr>
            <tr *ngIf="expandedId === f.id" class="bc-expandRow">
              <td [attr.colspan]="7" class="p-0">
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
    .bc-confidencePill {
      font-size: 0.78rem;
      font-family: 'IBM Plex Mono', monospace;
      letter-spacing: 0.5px;
    }
    .bc-confidencePill[data-confidence="confirmed"] { color: #00c853; }
    .bc-confidencePill[data-confidence="probable"] { color: #ffab00; }
    .bc-confidencePill[data-confidence="possible"] { color: #ff9100; }
    .bc-confidencePill[data-confidence="inconclusive"] { color: #718096; }
  `],
})
export class FindingsTableForensicsComponent {
  @Input({ required: true }) findings: Finding[] = [];
  @Input({ required: true }) engagementId = '';
  @Input() requestRefresh?: () => void;

  expandedId: string | null = null;

  private readonly tacticMap = new Map(MITRE_TACTICS.map(t => [t.value, t.label]));

  toggleExpand(id: string): void {
    this.expandedId = this.expandedId === id ? null : id;
  }

  prettyTactic(tactic: string): string {
    return this.tacticMap.get(tactic) ?? (tactic || '—');
  }

  prettyConfidence(confidence: string): string {
    return FORENSICS_CONFIDENCE_LABELS[confidence as ForensicsConfidence] ?? (confidence || '—');
  }
}
