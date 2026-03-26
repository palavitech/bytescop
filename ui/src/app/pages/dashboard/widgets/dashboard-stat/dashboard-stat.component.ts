import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { NgClass } from '@angular/common';
import { DashboardWidget, StatData } from '../../models/dashboard.model';

const ICON_MAP: Record<string, { icon: string; colorVar: string }> = {
  // Admin/Owner widgets
  active_engagements: { icon: 'bi-briefcase', colorVar: 'var(--bc-accent)' },
  total_findings:     { icon: 'bi-bug', colorVar: 'var(--bc-danger)' },
  critical_high_findings: { icon: 'bi-exclamation-triangle', colorVar: '#ffaa33' },
  total_clients:      { icon: 'bi-building', colorVar: 'var(--bc-accent2)' },
  total_assets:       { icon: 'bi-hdd-network', colorVar: 'var(--bc-accent2)' },
  active_users:       { icon: 'bi-people', colorVar: 'var(--bc-accent)' },
  // Analyst widgets
  my_engagements:     { icon: 'bi-briefcase', colorVar: 'var(--bc-accent)' },
  my_open_findings:   { icon: 'bi-bug', colorVar: 'var(--bc-danger)' },
  my_critical_high:   { icon: 'bi-exclamation-triangle', colorVar: '#ffaa33' },
  findings_this_week: { icon: 'bi-calendar-check', colorVar: 'var(--bc-accent)' },
  // Collaborator widgets
  engagements_in_progress:  { icon: 'bi-briefcase', colorVar: 'var(--bc-accent)' },
  unresolved_critical_high: { icon: 'bi-exclamation-triangle', colorVar: '#ffaa33' },
  findings_resolved_rate:   { icon: 'bi-check-circle', colorVar: 'var(--bc-accent)' },
};

@Component({
  selector: 'app-dashboard-stat',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-stat.component.html',
  styleUrl: './dashboard-stat.component.css',
})
export class DashboardStatComponent {
  @Input({ required: true }) widget!: DashboardWidget;

  get statData(): StatData {
    return this.widget.data as StatData;
  }

  get iconClass(): string {
    return ICON_MAP[this.widget.id]?.icon ?? 'bi-bar-chart';
  }

  get iconColor(): string {
    return ICON_MAP[this.widget.id]?.colorVar ?? 'var(--bc-accent)';
  }
}
