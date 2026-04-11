import { Component, ChangeDetectionStrategy, Input, ViewEncapsulation, inject, OnInit, OnChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { SowService } from '../services/sow.service';
import { Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS } from '../../assets/models/asset.model';

type ScopeState = 'init' | 'ready' | 'error';

@Component({
  selector: 'app-sow-scope-assets',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, RouterLink],
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
    .bc-typeBadge {
      font-size: 0.78rem;
      font-family: 'IBM Plex Mono', monospace;
      letter-spacing: 0.5px;
      color: var(--bc-blue);
    }
  `],
  template: `
    <div class="bc-scopeHead">
      <div class="d-flex align-items-center gap-2">
        <span class="bc-sub fw-semibold">Scope Assets</span>
        <span class="badge bg-secondary" *ngIf="state() === 'ready'">{{ assets().length }}</span>
      </div>
    </div>

    <!-- Loading -->
    <div class="p-4" *ngIf="state() === 'init'">
      <div class="bc-sub">Loading scope assets...</div>
    </div>

    <!-- Error -->
    <div class="p-4" *ngIf="state() === 'error'">
      <div class="bc-sub text-danger">Failed to load scope assets.</div>
    </div>

    <!-- Ready -->
    <ng-container *ngIf="state() === 'ready'">
      <!-- Empty -->
      <div class="p-4" *ngIf="assets().length === 0">
        <div class="bc-sub">No assets in scope yet.</div>
      </div>

      <!-- Table -->
      <div class="table-responsive" *ngIf="assets().length > 0">
        <table class="table bc-table mb-0">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th>Environment</th>
              <th>Criticality</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let asset of assets()">
              <td>
                <a class="bc-link" [routerLink]="['/assets', asset.id]">{{ asset.name }}</a>
              </td>
              <td><span class="bc-typeBadge">{{ typeLabels[asset.asset_type] }}</span></td>
              <td>{{ envLabels[asset.environment] }}</td>
              <td>
                <span class="bc-critBadge" [attr.data-crit]="asset.criticality">
                  {{ critLabels[asset.criticality] }}
                </span>
              </td>
              <td>
                <span class="bc-target" *ngIf="asset.target">{{ asset.target }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </ng-container>
  `,
})
export class SowScopeAssetsComponent implements OnInit, OnChanges {
  private readonly sowService = inject(SowService);

  @Input({ required: true }) engagementId!: string;
  @Input() refreshTrigger = 0;

  readonly state = signal<ScopeState>('init');
  readonly assets = signal<Asset[]>([]);

  readonly typeLabels = ASSET_TYPE_LABELS;
  readonly envLabels = ASSET_ENV_LABELS;
  readonly critLabels = ASSET_CRIT_LABELS;

  ngOnInit(): void {
    this.loadScope();
  }

  ngOnChanges(): void {
    if (this.engagementId) {
      this.loadScope();
    }
  }

  private loadScope(): void {
    this.state.set('init');
    this.sowService.listScope(this.engagementId).subscribe({
      next: (assets) => {
        this.assets.set(assets);
        this.state.set('ready');
      },
      error: () => {
        this.assets.set([]);
        this.state.set('error');
      },
    });
  }
}
