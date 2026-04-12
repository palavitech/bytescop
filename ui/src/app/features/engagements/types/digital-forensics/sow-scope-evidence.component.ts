import { Component, ChangeDetectionStrategy, Input, ViewEncapsulation, inject, OnInit, OnChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ForensicsEvidenceService } from './forensics-evidence.service';
import { ForensicsEvidence, EVIDENCE_SOURCE_TYPE_LABELS } from './forensics.model';

type ScopeState = 'init' | 'ready' | 'error';

@Component({
  selector: 'app-sow-scope-evidence',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule],
  styles: [`
    .bc-scopeHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-top: 1px solid rgba(0, 255, 179, 0.1);
      border-bottom: 1px solid rgba(0, 255, 179, 0.06);
      position: relative;
    }
  `],
  template: `
    <div class="bc-scopeHead">
      <div class="d-flex align-items-center gap-2">
        <span class="bc-sub fw-semibold">Evidence Sources</span>
        <span class="badge bg-secondary" *ngIf="state() === 'ready'">{{ items().length }}</span>
      </div>
    </div>

    <div class="p-4" *ngIf="state() === 'init'">
      <div class="bc-sub">Loading evidence sources...</div>
    </div>

    <div class="p-4" *ngIf="state() === 'error'">
      <div class="bc-sub text-danger">Failed to load evidence sources.</div>
    </div>

    <ng-container *ngIf="state() === 'ready'">
      <div class="p-4" *ngIf="items().length === 0">
        <div class="bc-sub">No evidence sources added yet.</div>
      </div>

      <div class="table-responsive" *ngIf="items().length > 0">
        <table class="table bc-table mb-0">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Acquired</th>
              <th>SHA-256</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let e of items()">
              <td>
                <i class="bi bi-search me-1" style="color:var(--bc-accent2)"></i>
                {{ e.name }}
              </td>
              <td>{{ typeLabels[e.evidence_type] || e.evidence_type }}</td>
              <td class="bc-sub">{{ e.acquisition_date || '—' }}</td>
              <td><code class="bc-sub" style="font-size:0.75rem">{{ e.sha256 | slice:0:16 }}...</code></td>
            </tr>
          </tbody>
        </table>
      </div>
    </ng-container>
  `,
})
export class SowScopeEvidenceComponent implements OnInit, OnChanges {
  private readonly forensicsService = inject(ForensicsEvidenceService);

  @Input({ required: true }) engagementId!: string;
  @Input() refreshTrigger = 0;

  readonly typeLabels = EVIDENCE_SOURCE_TYPE_LABELS;
  readonly state = signal<ScopeState>('init');
  readonly items = signal<ForensicsEvidence[]>([]);

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(): void {
    if (this.engagementId) {
      this.load();
    }
  }

  private load(): void {
    this.state.set('init');
    this.forensicsService.listEvidence(this.engagementId).subscribe({
      next: (items) => { this.items.set(items); this.state.set('ready'); },
      error: () => { this.items.set([]); this.state.set('error'); },
    });
  }
}
