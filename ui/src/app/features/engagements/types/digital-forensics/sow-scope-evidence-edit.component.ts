import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

import { ForensicsEvidenceService } from './forensics-evidence.service';
import {
  ForensicsEvidence, EvidenceSourceType, AcquisitionMethod,
  EVIDENCE_SOURCE_TYPE_LABELS, ACQUISITION_METHOD_LABELS,
} from './forensics.model';
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

      <!-- Locked hint -->
      <div class="bc-scopeLockedHint" *ngIf="isLocked && state() === 'ready'">
        <i class="bi bi-lock-fill me-1"></i>
        Scope is locked. Revert SoW to <strong>Draft</strong> to add or remove evidence sources.
      </div>

      <!-- Add button (hidden when locked or form open) -->
      <div class="p-3" *ngIf="!isLocked && state() === 'ready' && !formOpen()">
        <button class="btn btn-sm btn-outline-success bc-btn" type="button" (click)="toggleForm()">
          <i class="bi bi-plus-lg me-1"></i> Add Evidence Source
        </button>
      </div>

      <!-- Add form panel (hidden when locked) -->
      <div class="bc-evidenceFormPanel" *ngIf="!isLocked && state() === 'ready' && formOpen()">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="bc-label" style="font-size:0.8rem">New Evidence Source</span>
          <button class="btn btn-sm btn-outline-light bc-btnSoft" type="button" (click)="toggleForm()">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="row g-2">
          <div class="col-md-6">
            <label class="form-label bc-sub" style="font-size:0.75rem">Name <span class="text-danger">*</span></label>
            <input class="form-control form-control-sm bc-input"
              [(ngModel)]="newName" [ngModelOptions]="{standalone:true}" placeholder="Evidence name..." />
          </div>
          <div class="col-md-6">
            <label class="form-label bc-sub" style="font-size:0.75rem">Type <span class="text-danger">*</span></label>
            <select class="form-select form-select-sm bc-input"
              [(ngModel)]="newType" [ngModelOptions]="{standalone:true}">
              <option *ngFor="let t of evidenceTypes" [value]="t.value">{{ t.label }}</option>
            </select>
          </div>
          <div class="col-12">
            <label class="form-label bc-sub" style="font-size:0.75rem">Source Path / URI <span class="text-danger">*</span></label>
            <input class="form-control form-control-sm bc-input"
              [(ngModel)]="newSourcePath" [ngModelOptions]="{standalone:true}"
              placeholder="/mnt/evidence/case-42/disk.E01 or s3://..." />
          </div>
          <div class="col-md-4">
            <label class="form-label bc-sub" style="font-size:0.75rem">Acquisition Date</label>
            <input type="date" class="form-control form-control-sm bc-input"
              [(ngModel)]="newAcquisitionDate" [ngModelOptions]="{standalone:true}" />
          </div>
          <div class="col-md-4">
            <label class="form-label bc-sub" style="font-size:0.75rem">Acquisition Method</label>
            <select class="form-select form-select-sm bc-input"
              [(ngModel)]="newAcquisitionMethod" [ngModelOptions]="{standalone:true}">
              <option value="">— Select —</option>
              <option *ngFor="let m of acquisitionMethods" [value]="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label bc-sub" style="font-size:0.75rem">Acquisition Tool</label>
            <input class="form-control form-control-sm bc-input"
              [(ngModel)]="newAcquisitionTool" [ngModelOptions]="{standalone:true}" placeholder="e.g. FTK Imager" />
          </div>
          <div class="col-md-6">
            <label class="form-label bc-sub" style="font-size:0.75rem">Source Device</label>
            <input class="form-control form-control-sm bc-input"
              [(ngModel)]="newSourceDevice" [ngModelOptions]="{standalone:true}" placeholder="Hostname or serial" />
          </div>
          <div class="col-md-6">
            <label class="form-label bc-sub" style="font-size:0.75rem">SHA-256</label>
            <input class="form-control form-control-sm bc-input"
              [(ngModel)]="newSha256" [ngModelOptions]="{standalone:true}" placeholder="Hash for integrity" maxlength="64" />
          </div>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-success bc-btn" type="button"
            [disabled]="!canSubmitForm() || (adding$ | async)"
            (click)="addEvidence()">
            <i class="bi bi-plus-lg me-1"></i>
            {{ (adding$ | async) ? 'Adding...' : 'Add' }}
          </button>
          <button class="btn btn-sm btn-outline-light bc-btnSoft" type="button" (click)="toggleForm()">Cancel</button>
        </div>
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
        <div class="p-4" *ngIf="items().length === 0 && !formOpen()">
          <div class="bc-sub">No evidence sources added yet.</div>
        </div>

        <div class="table-responsive" *ngIf="items().length > 0">
          <table class="table bc-table mb-0">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Source Path</th>
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
                <td><code class="bc-sub" style="font-size:0.75rem; word-break:break-all">{{ e.source_path || '—' }}</code></td>
                <td class="bc-sub">{{ e.acquisition_date || '—' }}</td>
                <td>
                  <ng-container *ngIf="e.sha256">
                    <code class="bc-sub" style="font-size:0.75rem">{{ e.sha256 | slice:0:16 }}...</code>
                  </ng-container>
                  <span class="bc-sub" *ngIf="!e.sha256">—</span>
                </td>
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
  readonly acquisitionMethods = Object.entries(ACQUISITION_METHOD_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  readonly state = signal<ScopeState>('init');
  readonly items = signal<ForensicsEvidence[]>([]);
  readonly confirmingId = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly adding$ = new BehaviorSubject(false);

  newName = '';
  newType: EvidenceSourceType = 'disk_image';
  newSourcePath = '';
  newAcquisitionDate = '';
  newAcquisitionMethod: AcquisitionMethod = '';
  newAcquisitionTool = '';
  newSourceDevice = '';
  newSha256 = '';

  ngOnInit(): void {
    this.load();
  }

  toggleForm(): void {
    this.formOpen.update(v => !v);
  }

  load(): void {
    this.state.set('init');
    this.forensicsService.listEvidence(this.engagementId).subscribe({
      next: (items) => { this.items.set(items); this.state.set('ready'); this.cdr.markForCheck(); },
      error: () => { this.items.set([]); this.state.set('error'); this.cdr.markForCheck(); },
    });
  }

  canSubmitForm(): boolean {
    return !!this.newName.trim() && !!this.newSourcePath.trim();
  }

  resetForm(): void {
    this.newName = '';
    this.newType = 'disk_image';
    this.newSourcePath = '';
    this.newAcquisitionDate = '';
    this.newAcquisitionMethod = '';
    this.newAcquisitionTool = '';
    this.newSourceDevice = '';
    this.newSha256 = '';
  }

  addEvidence(): void {
    const name = this.newName.trim();
    const sourcePath = this.newSourcePath.trim();
    if (!name || !sourcePath) return;
    this.adding$.next(true);
    this.forensicsService.addEvidence(this.engagementId, {
      name,
      evidence_type: this.newType,
      source_path: sourcePath,
      acquisition_date: this.newAcquisitionDate || undefined,
      acquisition_method: this.newAcquisitionMethod || undefined,
      acquisition_tool: this.newAcquisitionTool.trim() || undefined,
      source_device: this.newSourceDevice.trim() || undefined,
      sha256: this.newSha256.trim() || undefined,
    }).subscribe({
      next: () => {
        this.resetForm();
        this.formOpen.set(false);
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
