import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component,
  ElementRef, EventEmitter, inject, Input, NgZone, OnDestroy, Output,
  ViewChild, ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, firstValueFrom } from 'rxjs';

import { Asset } from '../../../assets/models/asset.model';
import { FindingSeverity, FindingStatus, FINDING_SEVERITIES, FINDING_STATUSES } from '../../models/finding.model';
import { FindingsService } from '../../services/findings.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { ClassificationEntry } from '../../models/classification-data';
import { ClassificationsService } from '../../services/classifications.service';
import { ClassificationCardComponent } from '../../components/classification-card/classification-card.component';

import { Crepe } from '@milkdown/crepe';
import { getMarkdown } from '@milkdown/utils';
import { environment } from '../../../../../environments/environment';
import { wireMilkdownImages, MilkdownImagesDisposer } from '../../engagement-findings-create/milkdown-images';

export interface StandardFindingPayload {
  title: string;
  assessment_area: string;
  owasp_category: string;
  cwe_id: string;
  severity: FindingSeverity;
  status: FindingStatus;
  asset_id: string;
  description_md: string;
  recommendation_md: string;
  is_draft: boolean;
}

@Component({
  selector: 'app-finding-section-standard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, ReactiveFormsModule, ClassificationCardComponent],
  templateUrl: './finding-section-standard.component.html',
})
export class FindingSectionStandardComponent implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly fb = inject(FormBuilder);
  private readonly findingsService = inject(FindingsService);
  private readonly notify = inject(NotificationService);
  private readonly classificationsService = inject(ClassificationsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly profileService = inject(UserProfileService);

  @Input({ required: true }) engagementId!: string;
  @Input({ required: true }) scopeAssets$!: Observable<Asset[]>;
  @Input() initialData: Partial<StandardFindingPayload> | null = null;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() isDraft = false;
  @Input() busy = false;

  @Output() submitted = new EventEmitter<StandardFindingPayload>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() dirtyChange = new EventEmitter<boolean>();

  imageUploading = false;

  readonly severities = FINDING_SEVERITIES;
  readonly statuses = FINDING_STATUSES;

  readonly assessmentAreas$ = this.classificationsService.assessmentAreas$;
  readonly owaspCategories$ = this.classificationsService.owaspCategories$;
  cweCatalog: ClassificationEntry[] = [];
  cweFiltered: ClassificationEntry[] = [];
  cweSearch = '';
  cweDropdownOpen = false;
  cweHighlightIndex = -1;

  form = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(180)]],
    assessment_area: ['application_security'],
    owasp_category: [''],
    cwe_id: [''],
    severity: ['medium' as FindingSeverity, [Validators.required]],
    status: ['open' as FindingStatus, [Validators.required]],
    asset_id: ['', [Validators.required]],
    description_md: ['', [Validators.maxLength(20000)]],
    recommendation_md: ['', [Validators.maxLength(20000)]],
  });

  /* --- Description editor --- */
  private descEditorEl?: HTMLElement;
  private descCrepe?: Crepe;
  private descReady?: Promise<unknown>;
  private descImagesDispose?: MilkdownImagesDisposer;
  private descEditorInited = false;

  /* --- Recommendation editor --- */
  private recEditorEl?: HTMLElement;
  private recCrepe?: Crepe;
  private recReady?: Promise<unknown>;
  private recImagesDispose?: MilkdownImagesDisposer;
  private recEditorInited = false;

  private viewReady = false;
  private mdReady = false;

  @ViewChild('editorRef')
  set editorRefSetter(ref: ElementRef<HTMLElement> | undefined) {
    this.descEditorEl = ref?.nativeElement;
    this.tryInitDescEditor();
  }

  @ViewChild('recEditorRef')
  set recEditorRefSetter(ref: ElementRef<HTMLElement> | undefined) {
    this.recEditorEl = ref?.nativeElement;
    this.tryInitRecEditor();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;

    if (this.initialData) {
      this.form.patchValue({
        title: this.initialData.title ?? '',
        assessment_area: this.initialData.assessment_area ?? '',
        owasp_category: this.initialData.owasp_category ?? '',
        cwe_id: this.initialData.cwe_id ?? '',
        severity: this.initialData.severity ?? 'medium',
        status: this.initialData.status ?? 'open',
        asset_id: this.initialData.asset_id ?? '',
        description_md: this.initialData.description_md ?? '',
        recommendation_md: this.initialData.recommendation_md ?? '',
      });
      this.form.markAsPristine();
    }

    this.mdReady = true;
    this.tryInitDescEditor();
    this.tryInitRecEditor();

    this.classificationsService.cweEntries$.subscribe(data => {
      this.cweCatalog = data;
      const currentCwe = this.form.get('cwe_id')?.value;
      if (currentCwe) {
        const entry = data.find(c => c.code === currentCwe);
        if (entry) this.cweSearch = `${entry.code} — ${entry.name}`;
      }
    });

    this.form.valueChanges.subscribe(() => {
      this.dirtyChange.emit(this.form.dirty);
    });
  }

  ngOnDestroy(): void {
    this.descImagesDispose?.();
    this.recImagesDispose?.();
    void (this.descCrepe as any)?.destroy?.();
    void (this.recCrepe as any)?.destroy?.();
  }

  /* --- Description editor init --- */
  private tryInitDescEditor(): void {
    if (this.descEditorInited || !this.viewReady || !this.descEditorEl || !this.mdReady) return;
    this.descEditorInited = true;

    this.descCrepe = new Crepe({
      root: this.descEditorEl,
      defaultValue: this.form.get('description_md')?.value ?? '',
      featureConfigs: {
        'image-block': {
          blockOnUpload: async (file: File) => {
            return await this.zone.run(() => this.uploadImageToApi(file));
          },
        },
      },
    });

    this.descReady = this.descCrepe.create();

    this.descImagesDispose = wireMilkdownImages({
      zone: this.zone,
      ready: this.descReady,
      getCrepe: () => this.descCrepe,
      uploadImage: (file) => this.uploadImageToApi(file),
      markDirty: () => { this.form.markAsDirty(); this.dirtyChange.emit(true); },
      notifyError: (msg) => this.notify.error(msg),
    });
  }

  /* --- Recommendation editor init --- */
  private tryInitRecEditor(): void {
    if (this.recEditorInited || !this.viewReady || !this.recEditorEl || !this.mdReady) return;
    this.recEditorInited = true;

    this.recCrepe = new Crepe({
      root: this.recEditorEl,
      defaultValue: this.form.get('recommendation_md')?.value ?? '',
      featureConfigs: {
        'image-block': {
          blockOnUpload: async (file: File) => {
            return await this.zone.run(() => this.uploadImageToApi(file));
          },
        },
      },
    });

    this.recReady = this.recCrepe.create();

    this.recImagesDispose = wireMilkdownImages({
      zone: this.zone,
      ready: this.recReady,
      getCrepe: () => this.recCrepe,
      uploadImage: (file) => this.uploadImageToApi(file),
      markDirty: () => { this.form.markAsDirty(); this.dirtyChange.emit(true); },
      notifyError: (msg) => this.notify.error(msg),
    });
  }

  private async uploadImageToApi(file: File): Promise<string> {
    const limit = this.profileService.currentSubscription()?.limits?.max_images_per_finding ?? 0;
    if (limit > 0) {
      const descMd = await this.readDescriptionMarkdown();
      const recMd = await this.readRecommendationMarkdown();
      const current = countImageTokens(descMd, recMd);
      if (current >= limit) {
        this.notify.error(`Image limit reached (${current}/${limit}). Upgrade your plan to add more.`);
        throw new Error('Image limit reached');
      }
    }

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

  private async readDescriptionMarkdown(): Promise<string> {
    if (!this.descCrepe) return this.form.get('description_md')?.value ?? '';
    await this.descReady;
    return this.descCrepe.editor.action(getMarkdown());
  }

  private async readRecommendationMarkdown(): Promise<string> {
    if (!this.recCrepe) return this.form.get('recommendation_md')?.value ?? '';
    await this.recReady;
    return this.recCrepe.editor.action(getMarkdown());
  }

  /* --- CWE dropdown --- */

  onCweInput(event: Event): void {
    this.cweSearch = (event.target as HTMLInputElement).value;
    this.cweDropdownOpen = true;
    this.cweHighlightIndex = -1;
    const q = this.cweSearch.toLowerCase();
    this.cweFiltered = this.cweCatalog.filter(c =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    ).slice(0, 15);
  }

  onCweKeydown(event: KeyboardEvent): void {
    if (!this.cweDropdownOpen || this.cweFiltered.length === 0) {
      if (event.key === 'Escape') { this.cweDropdownOpen = false; }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.cweHighlightIndex = Math.min(this.cweHighlightIndex + 1, this.cweFiltered.length - 1);
        this.scrollCweHighlightIntoView(event.target as HTMLElement);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.cweHighlightIndex = Math.max(this.cweHighlightIndex - 1, 0);
        this.scrollCweHighlightIntoView(event.target as HTMLElement);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.cweHighlightIndex >= 0 && this.cweHighlightIndex < this.cweFiltered.length) {
          this.selectCwe(this.cweFiltered[this.cweHighlightIndex]);
        }
        break;
      case 'Escape':
        this.cweDropdownOpen = false;
        break;
    }
  }

  private scrollCweHighlightIntoView(inputEl: HTMLElement): void {
    requestAnimationFrame(() => {
      const list = inputEl.closest('.bc-tzDropdown')?.querySelector('.bc-tzList');
      const items = list?.querySelectorAll('.bc-tzItem');
      const item = items?.[this.cweHighlightIndex];
      item?.scrollIntoView({ block: 'nearest' });
    });
  }

  selectCwe(entry: ClassificationEntry): void {
    this.form.patchValue({ cwe_id: entry.code });
    this.cweSearch = `${entry.code} — ${entry.name}`;
    this.cweDropdownOpen = false;
    this.cweHighlightIndex = -1;
  }

  clearCwe(): void {
    this.form.patchValue({ cwe_id: '' });
    this.cweSearch = '';
    this.cweDropdownOpen = false;
    this.cweHighlightIndex = -1;
  }

  /* --- Save / submit --- */

  onSubmit(): void {
    if (this.mode === 'edit' && this.isDraft) {
      void this.doSave(true);
    } else {
      void this.doSave(false);
    }
  }

  saveAsDraft(): void {
    void this.doSave(true);
  }

  publish(): void {
    void this.doSave(false);
  }

  private async doSave(asDraft: boolean): Promise<void> {
    if (!asDraft) {
      this.form.markAllAsTouched();
      if (this.form.invalid) return;
    } else {
      const titleCtrl = this.form.get('title');
      titleCtrl?.markAsTouched();
      if (!titleCtrl?.value || titleCtrl.value.length < 6) {
        titleCtrl?.setErrors({ required: true });
        return;
      }
    }

    try {
      const descMd = await this.readDescriptionMarkdown();
      const recMd = await this.readRecommendationMarkdown();
      this.form.patchValue(
        { description_md: descMd, recommendation_md: recMd },
        { emitEvent: false },
      );

      const v = this.form.getRawValue();
      this.submitted.emit({
        title: v.title!,
        assessment_area: v.assessment_area || '',
        owasp_category: v.owasp_category || '',
        cwe_id: v.cwe_id || '',
        severity: v.severity!,
        status: v.status!,
        asset_id: v.asset_id || '',
        description_md: v.description_md || '',
        recommendation_md: v.recommendation_md || '',
        is_draft: asDraft,
      });
    } catch (e: any) {
      this.notify.error(e?.message || 'Editor not ready.');
    }
  }

  cancel(): void {
    this.cancelled.emit();
  }

  isInvalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}

const ATTACHMENT_TOKEN_RE = /\/api\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/content\//gi;

function countImageTokens(descriptionMd: string, recommendationMd: string): number {
  const combined = (descriptionMd || '') + (recommendationMd || '');
  const tokens = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = ATTACHMENT_TOKEN_RE.exec(combined)) !== null) {
    tokens.add(match[1].toLowerCase());
  }
  ATTACHMENT_TOKEN_RE.lastIndex = 0;
  return tokens.size;
}
