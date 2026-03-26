import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClassificationEntry } from '../../models/classification-data';
import { ClassificationsService } from '../../services/classifications.service';

@Component({
  selector: 'app-classification-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './classification-card.component.html',
  styleUrl: './classification-card.component.css',
})
export class ClassificationCardComponent implements OnInit {
  @Input() assessmentArea = '';
  @Input() owaspCategory = '';
  @Input() cweId = '';
  @Input() bare = false;

  private areaMap = new Map<string, ClassificationEntry>();
  private owaspMap = new Map<string, ClassificationEntry>();
  private cweMap = new Map<string, ClassificationEntry>();

  private readonly classificationsService = inject(ClassificationsService);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.classificationsService.assessmentAreaMap$.subscribe(map => {
      this.areaMap = map;
      this.cdr.markForCheck();
    });

    this.classificationsService.owaspMap$.subscribe(map => {
      this.owaspMap = map;
      this.cdr.markForCheck();
    });

    this.classificationsService.cweMap$.subscribe(map => {
      this.cweMap = map;
      this.cdr.markForCheck();
    });
  }

  get areaEntry(): ClassificationEntry | null {
    return this.areaMap.get(this.assessmentArea) ?? null;
  }

  get owaspEntry(): ClassificationEntry | null {
    return this.owaspMap.get(this.owaspCategory) ?? null;
  }

  get cweEntry(): ClassificationEntry | null {
    if (!this.cweId) return null;
    return this.cweMap.get(this.cweId) ?? null;
  }

  get hasAny(): boolean {
    return !!this.assessmentArea || !!this.owaspCategory || !!this.cweId;
  }
}
