import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';

import { ENGAGEMENT_TYPE_META, EngagementTypeMeta } from '../models/engagement.model';

@Component({
  selector: 'app-engagement-type-select',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagement-type-select.component.html',
  styleUrl: './engagement-type-select.component.css',
})
export class EngagementTypeSelectComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  readonly types: EngagementTypeMeta[] = ENGAGEMENT_TYPE_META;

  goBack(): void {
    this.location.back();
  }

  selectType(type: EngagementTypeMeta): void {
    const currentParams = this.route.snapshot.queryParams;
    this.router.navigate(['/engagements/create/wizard'], {
      queryParams: { ...currentParams, type: type.key },
    });
  }
}
