import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component,
  ElementRef, EventEmitter, inject, Input, NgZone, OnDestroy, OnInit, Output,
  ViewChild, ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, firstValueFrom, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

import { ForensicsEvidence, ForensicsFindingPayload, EVIDENCE_SOURCE_TYPE_LABELS, MITRE_TACTICS, IOC_TYPES } from './forensics.model';
import { ForensicsEvidenceService } from './forensics-evidence.service';
import { FindingsService } from '../../services/findings.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { environment } from '../../../../../environments/environment';

import { Crepe } from '@milkdown/crepe';
import { getMarkdown } from '@milkdown/utils';
import { wireMilkdownImages, MilkdownImagesDisposer } from '../../engagement-findings-create/milkdown-images';

export { ForensicsFindingPayload } from './forensics.model';

@Component({
  selector: 'app-finding-section-forensics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './finding-section-forensics.component.html',
})
export class FindingSectionForensicsComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly fb = inject(FormBuilder);
  private readonly findingsService = inject(FindingsService);
  private readonly forensicsService = inject(ForensicsEvidenceService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) engagementId!: string;
  @Input() initialData: Partial<ForensicsFindingPayload> | null = null;

  @Output() submitted = new EventEmitter<ForensicsFindingPayload>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() dirtyChange = new EventEmitter<boolean>();

  evidenceSources$!: Observable<ForensicsEvidence[]>;

  readonly evidenceTypeLabels = EVIDENCE_SOURCE_TYPE_LABELS;
  readonly mitreTactics = MITRE_TACTICS;
  readonly iocTypes = IOC_TYPES;

  busy = false;
  imageUploading = false;

  form!: FormGroup;

  private editorEl?: HTMLElement;
  private crepe?: Crepe;
  private editorReady?: Promise<unknown>;
  private imagesDispose?: MilkdownImagesDisposer;
  private editorInited = false;
  private viewReady = false;

  @ViewChild('descEditorRef')
  set editorRefSetter(ref: ElementRef<HTMLElement> | undefined) {
    this.editorEl = ref?.nativeElement;
    this.tryInitEditor();
  }

  constructor() {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(180)]],
      evidence_source_id: ['', [Validators.required]],
      mitre_tactic: [''],
      mitre_technique: ['', [Validators.maxLength(20)]],
      ioc_type: [''],
      ioc_value: ['', [Validators.maxLength(500)]],
      occurrence_date: [''],
      description_md: ['', [Validators.maxLength(20000)]],
    });

    this.form.valueChanges.subscribe(() => {
      this.dirtyChange.emit(this.form.dirty);
    });
  }

  ngOnInit(): void {
    this.evidenceSources$ = this.forensicsService.listEvidence(this.engagementId).pipe(
      catchError(() => of([] as ForensicsEvidence[])),
      shareReplay(1),
    );
  }

  ngAfterViewInit(): void {
    this.viewReady = true;

    if (this.initialData) {
      this.form.patchValue({
        title: this.initialData.title ?? '',
        evidence_source_id: this.initialData.evidence_source_id ?? '',
        mitre_tactic: this.initialData.mitre_tactic ?? '',
        mitre_technique: this.initialData.mitre_technique ?? '',
        ioc_type: this.initialData.ioc_type ?? '',
        ioc_value: this.initialData.ioc_value ?? '',
        occurrence_date: this.initialData.occurrence_date ?? '',
        description_md: this.initialData.description_md ?? '',
      });
    }

    this.tryInitEditor();
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  async readDescriptionMarkdown(): Promise<string> {
    if (this.crepe) {
      try {
        await this.editorReady;
        return this.crepe.editor.action(getMarkdown()) ?? '';
      } catch {
        return this.form.get('description_md')?.value ?? '';
      }
    }
    return this.form.get('description_md')?.value ?? '';
  }

  async save(isDraft = false): Promise<void> {
    if (!isDraft && this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (isDraft) {
      const title = this.form.get('title')?.value?.trim();
      if (!title || title.length < 6) {
        this.form.get('title')?.setErrors({ required: true });
        this.form.get('title')?.markAsTouched();
        return;
      }
    }

    const md = await this.readDescriptionMarkdown();
    const val = this.form.getRawValue();

    this.submitted.emit({
      title: val.title,
      evidence_source_id: val.evidence_source_id,
      mitre_tactic: val.mitre_tactic,
      mitre_technique: val.mitre_technique,
      ioc_type: val.ioc_type,
      ioc_value: val.ioc_value,
      occurrence_date: val.occurrence_date,
      description_md: md,
      is_draft: isDraft,
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }

  ngOnDestroy(): void {
    this.imagesDispose?.();
    this.crepe?.destroy();
  }

  private async uploadImageToApi(file: File): Promise<string> {
    this.imageUploading = true;
    this.cdr.markForCheck();

    try {
      const res = await firstValueFrom(this.findingsService.uploadImage(this.engagementId, file));
      const url = (res?.url || '').trim();
      if (!url) throw new Error('Upload succeeded but no image URL was returned.');

      if (/^https?:\/\//i.test(url)) return url;
      const base = (environment.apiUrl || '').replace(/\/+$/, '');
      const path = url.startsWith('/') ? url : `/${url}`;
      return `${base}${path}`;
    } catch (err) {
      this.notify.error('Image upload failed: ' + ((err as any)?.error?.message || (err as any)?.error?.detail || 'Unknown error'));
      throw err;
    } finally {
      this.imageUploading = false;
      this.cdr.markForCheck();
    }
  }

  private tryInitEditor(): void {
    if (this.editorInited || !this.viewReady || !this.editorEl) return;
    this.editorInited = true;

    this.zone.runOutsideAngular(() => {
      const defaultValue = this.initialData?.description_md ?? this.form.get('description_md')?.value ?? '';

      this.crepe = new Crepe({
        root: this.editorEl!,
        defaultValue,
        featureConfigs: {
          'image-block': {
            blockOnUpload: async (file: File) => {
              return await this.zone.run(() => this.uploadImageToApi(file));
            },
          },
        },
      });

      this.editorReady = this.crepe.create();

      this.imagesDispose = wireMilkdownImages({
        zone: this.zone,
        ready: this.editorReady,
        getCrepe: () => this.crepe,
        uploadImage: (file) => this.uploadImageToApi(file),
        markDirty: () => { this.form.markAsDirty(); this.dirtyChange.emit(true); },
        notifyError: (msg) => this.notify.error(msg),
      });
    });
  }
}
