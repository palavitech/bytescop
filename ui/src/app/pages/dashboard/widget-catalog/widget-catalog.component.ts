import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CatalogWidget } from '../models/dashboard.model';

@Component({
  selector: 'app-widget-catalog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './widget-catalog.component.html',
  styleUrl: './widget-catalog.component.css',
})
export class WidgetCatalogComponent {
  @Input() widgets: CatalogWidget[] = [];
  @Input() activeIds: Set<string> = new Set();

  @Output() addWidget = new EventEmitter<CatalogWidget>();

  get stats(): CatalogWidget[] {
    return this.widgets.filter(w => w.type === 'stat');
  }

  get charts(): CatalogWidget[] {
    return this.widgets.filter(w => w.type === 'chart');
  }

  get tables(): CatalogWidget[] {
    return this.widgets.filter(w => w.type === 'table');
  }

  isActive(id: string): boolean {
    return this.activeIds.has(id);
  }

  typeIcon(type: string): string {
    switch (type) {
      case 'stat': return 'bi-hash';
      case 'chart': return 'bi-pie-chart';
      case 'table': return 'bi-table';
      default: return 'bi-grid';
    }
  }
}
