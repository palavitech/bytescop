import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { NgClass } from '@angular/common';
import { DashboardWidget, TableData } from '../../models/dashboard.model';

const SEVERITY_CLASSES: Record<string, string> = {
  Critical: 'bc-severityPill bc-severityPill--critical',
  High: 'bc-severityPill bc-severityPill--high',
  Medium: 'bc-severityPill bc-severityPill--medium',
  Low: 'bc-severityPill bc-severityPill--low',
  Info: 'bc-severityPill bc-severityPill--info',
};

const STATUS_CLASSES: Record<string, string> = {
  Open: 'bc-severityPill bc-severityPill--critical',
  Triage: 'bc-severityPill bc-severityPill--high',
  Accepted: 'bc-severityPill bc-severityPill--medium',
  Fixed: 'bc-severityPill bc-severityPill--low',
  'False positive': 'bc-severityPill bc-severityPill--info',
  Active: 'bc-severityPill bc-severityPill--low',
  Planned: 'bc-severityPill bc-severityPill--info',
  'On hold': 'bc-severityPill bc-severityPill--high',
  Completed: 'bc-severityPill bc-severityPill--medium',
};

@Component({
  selector: 'app-dashboard-table',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-table.component.html',
  styleUrl: './dashboard-table.component.css',
})
export class DashboardTableComponent {
  @Input({ required: true }) widget!: DashboardWidget;

  get tableData(): TableData {
    return this.widget.data as TableData;
  }

  get hasRows(): boolean {
    return (this.tableData.rows?.length ?? 0) > 0;
  }

  pillClass(col: string, value: string | number): string {
    const v = String(value);
    if (col === 'Severity') return SEVERITY_CLASSES[v] ?? '';
    if (col === 'Status') return STATUS_CLASSES[v] ?? '';
    return '';
  }

  isPill(col: string): boolean {
    return col === 'Severity' || col === 'Status';
  }
}
