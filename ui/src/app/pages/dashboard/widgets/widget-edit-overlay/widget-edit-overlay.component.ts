import { Component, ChangeDetectionStrategy, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-widget-edit-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './widget-edit-overlay.component.html',
  styleUrl: './widget-edit-overlay.component.css',
})
export class WidgetEditOverlayComponent {
  @Output() remove = new EventEmitter<void>();
}
