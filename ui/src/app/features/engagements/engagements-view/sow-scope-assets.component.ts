import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS } from '../../assets/models/asset.model';

export type ScopeState = 'init' | 'ready' | 'error';

export interface ScopeViewModel {
  state: ScopeState;
  assets: Asset[];
  total: number;
}

@Component({
  selector: 'app-sow-scope-assets',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <ng-container *ngIf="scopeVm$ | async as svm">
      <div class="bc-scopeHead">
        <div class="d-flex align-items-center gap-2">
          <span class="bc-sub fw-semibold">Scope Assets</span>
          <span class="badge bg-secondary" *ngIf="svm.state === 'ready'">{{ svm.total }}</span>
        </div>
      </div>

      <!-- Loading -->
      <div class="p-4" *ngIf="svm.state === 'init'">
        <div class="bc-sub">Loading scope assets...</div>
      </div>

      <!-- Error -->
      <div class="p-4" *ngIf="svm.state === 'error'">
        <div class="bc-sub text-danger">Failed to load scope assets.</div>
      </div>

      <!-- Ready -->
      <ng-container *ngIf="svm.state === 'ready'">
        <!-- Empty -->
        <div class="p-4" *ngIf="svm.assets.length === 0">
          <div class="bc-sub">No assets in scope yet.</div>
        </div>

        <!-- Table -->
        <div class="table-responsive" *ngIf="svm.assets.length > 0">
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
              <tr *ngFor="let asset of svm.assets">
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
    </ng-container>
  `,
})
export class SowScopeAssetsComponent {
  @Input({ required: true }) scopeVm$!: Observable<ScopeViewModel>;

  readonly typeLabels = ASSET_TYPE_LABELS;
  readonly envLabels = ASSET_ENV_LABELS;
  readonly critLabels = ASSET_CRIT_LABELS;
}
