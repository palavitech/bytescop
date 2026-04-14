import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';
import { VizCatalogWidget } from './visualize.model';

@Component({
  selector: 'app-visualize-catalog',
  standalone: true,
  imports: [NgClass],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visualize-catalog.component.html',
  styleUrl: './visualize-catalog.component.css',
})
export class VisualizeCatalogComponent {
  @Input() widgets: VizCatalogWidget[] = [];
  @Input() activeIds: Set<string> = new Set();

  @Output() addWidget = new EventEmitter<VizCatalogWidget>();

  get categories(): string[] {
    const seen = new Set<string>();
    return this.widgets
      .map(w => w.category)
      .filter(c => {
        if (seen.has(c)) return false;
        seen.add(c);
        return true;
      });
  }

  widgetsForCategory(category: string): VizCatalogWidget[] {
    return this.widgets.filter(w => w.category === category);
  }

  isActive(id: string): boolean {
    return this.activeIds.has(id);
  }

  categoryIcon(category: string): string {
    switch (category) {
      case 'Findings Analysis': return 'bi-bug';
      case 'Asset Analysis': return 'bi-hdd-network';
      default: return 'bi-grid';
    }
  }
}
