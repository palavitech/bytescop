import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import { ForensicsEvidenceService } from './forensics-evidence.service';
import { ForensicsEvidence, EvidenceSourceType, EVIDENCE_SOURCE_TYPE_LABELS } from './forensics.model';
import { NotificationService } from '../../../../services/core/notify/notification.service';

type ScopeState = 'init' | 'ready' | 'error';

@Component({
  selector: 'app-sow-scope-evidence-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  styleUrl: './sow-scope-evidence-edit.component.css',
  template: `
    <div class="bc-card mt-3">
      <div class="bc-scopeHead">
        <div class="d-flex align-items-center gap-2">
          <span class="bc-sub fw-semibold">Evidence Sources</span>
          <span class="badge bg-secondary" *ngIf="state() === 'ready'">{{ items().length }}</span>
        </div>
        <button class="btn btn-sm btn-outline-light bc-btnSoft" type="button" (click)="load()">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
      </div>

      <!-- Add form (hidden when locked) -->
      <div class="bc-addRow" *ngIf="!isLocked && state() === 'ready'" style="position:relative">
        <input class="form-control form-control-sm bc-input" style="max-width:240px"
          [(ngModel)]="newName" [ngModelOptions]="{standalone:true}" placeholder="Evidence name..." />
        <select class="form-select form-select-sm bc-input" style="max-width:200px"
          [(ngModel)]="newType" [ngModelOptions]="{standalone:true}">
          <option *ngFor="let t of evidenceTypes" [value]="t.value">{{ t.label }}</option>
        </select>
        <button class="btn btn-sm btn-success bc-btn" type="button"
          [disabled]="!newName.trim() || (adding$ | async)"
          (click)="addEvidence()">
          <i class="bi bi-plus-lg me-1"></i>
          {{ (adding$ | async) ? 'Adding...' : 'Add' }}
        </button>
      </div>

      <!-- Loading -->
      <div class="p-4" *ngIf="state() === 'init'">
        <div class="bc-sub">Loading evidence sources...</div>
      </div>

      <!-- Error -->
      <div class="p-4" *ngIf="state() === 'error'">
        <div class="bc-sub text-danger">Failed to load evidence sources.</div>
      </div>

      <!-- Ready -->
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
                <th *ngIf="!isLocked" style="width:60px"></th>
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
                <td *ngIf="!isLocked" class="text-end bc-removeCell">
                  <ng-container *ngIf="confirmingId() === e.id; else delBtn">
                    <span class="bc-sub me-1">Remove?</span>
                    <button class="btn btn-sm btn-danger bc-btn me-1" (click)="deleteEvidence(e.id)">
                      <i class="bi bi-check-lg me-1"></i>Yes
                    </button>
                    <button class="btn btn-sm btn-outline-light bc-btnSoft" (click)="cancelConfirm()">
                      <i class="bi bi-x-lg me-1"></i>No
                    </button>
                  </ng-container>
                  <ng-template #delBtn>
                    <button class="btn btn-sm btn-outline-danger bc-btnSoft" type="button"
                      (click)="confirmDelete(e.id)" title="Remove evidence source">
                      <i class="bi bi-trash3"></i>
                    </button>
                  </ng-template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>

      <div class="p-3 text-center" *ngIf="isLocked && state() === 'ready'">
        <span class="bc-sub"><i class="bi bi-lock-fill me-1"></i>Scope locked — revert SoW to Draft to manage evidence sources.</span>
      </div>
    </div>
  `,
})
export class SowScopeEvidenceEditComponent implements OnInit {
  private readonly forensicsService = inject(ForensicsEvidenceService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) engagementId!: string;
  @Input() clientId = '';
  @Input() isLocked = false;

  readonly typeLabels = EVIDENCE_SOURCE_TYPE_LABELS;
  readonly evidenceTypes = Object.entries(EVIDENCE_SOURCE_TYPE_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  readonly state = signal<ScopeState>('init');
  readonly items = signal<ForensicsEvidence[]>([]);
  readonly confirmingId = signal<string | null>(null);
  readonly adding$ = new BehaviorSubject(false);

  newName = '';
  newType: EvidenceSourceType = 'disk_image';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('init');
    this.forensicsService.listEvidence(this.engagementId).subscribe({
      next: (items) => { this.items.set(items); this.state.set('ready'); this.cdr.markForCheck(); },
      error: () => { this.items.set([]); this.state.set('error'); this.cdr.markForCheck(); },
    });
  }

  addEvidence(): void {
    const name = this.newName.trim();
    if (!name) return;
    this.adding$.next(true);
    this.forensicsService.addEvidence(this.engagementId, {
      name,
      evidence_type: this.newType,
    }).subscribe({
      next: () => {
        this.newName = '';
        this.adding$.next(false);
        this.load();
      },
      error: (err) => {
        this.adding$.next(false);
        this.notify.error(err?.error?.message || err?.error?.detail || 'Failed to add evidence source.');
      },
    });
  }

  confirmDelete(id: string): void {
    this.confirmingId.set(id);
  }

  cancelConfirm(): void {
    this.confirmingId.set(null);
  }

  deleteEvidence(id: string): void {
    this.confirmingId.set(null);
    this.forensicsService.deleteEvidence(this.engagementId, id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.notify.error(err?.error?.message || err?.error?.detail || 'Failed to remove evidence source.');
      },
    });
  }
}
