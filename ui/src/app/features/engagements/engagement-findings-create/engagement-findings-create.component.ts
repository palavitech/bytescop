import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, inject, NgZone, OnDestroy, ViewChild, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, finalize, map, shareReplay, switchMap, take } from 'rxjs/operators';
import { BehaviorSubject, Observable, of, firstValueFrom } from 'rxjs';

import { EngagementsService } from '../services/engagements.service';
import { Engagement, MalwareSample } from '../models/engagement.model';
import { SowService } from '../services/sow.service';
import { Asset } from '../../assets/models/asset.model';
import { FindingsService } from '../services/findings.service';
import { FindingSeverity, FindingStatus } from '../models/finding.model';
import { SowStatus } from '../models/sow.model';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { PermissionService } from '../../../services/core/auth/permission.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { FindingsSummary } from '../models/engagement.model';
import { ClassificationEntry } from '../models/classification-data';
import { ClassificationsService } from '../services/classifications.service';
import { ClassificationCardComponent } from '../components/classification-card/classification-card.component';

import { Crepe } from '@milkdown/crepe';
import { getMarkdown } from '@milkdown/utils';
import { environment } from '../../../../environments/environment';
import { wireMilkdownImages, MilkdownImagesDisposer } from './milkdown-images';
import { DirtyFormComponent, beforeUnloadGuard } from '../../../services/core/guards/dirty-form.guard';
import { FindingSectionMalwareComponent, MalwareFindingPayload } from './sections/finding-section-malware.component';

@Component({
  selector: 'app-engagement-findings-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ClassificationCardComponent, FindingSectionMalwareComponent],
  templateUrl: './engagement-findings-create.component.html',
  styleUrl: './engagement-findings-create.component.css',
})
export class EngagementFindingsCreateComponent implements AfterViewInit, OnDestroy, DirtyFormComponent {
  private readonly zone = inject(NgZone);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly engagementsService = inject(EngagementsService);
  private readonly sowService = inject(SowService);
  private readonly findingsService = inject(FindingsService);
  private readonly notify = inject(NotificationService);
  private readonly location = inject(Location);
  private readonly permissionService = inject(PermissionService);
  private readonly classificationsService = inject(ClassificationsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly profileService = inject(UserProfileService);

  busy = false;
  showHelp = false;
  imageUploading = false;
  private saved = false;

  isDirty(): boolean { return !this.saved && this.form.dirty; }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent): void { beforeUnloadGuard(this, e); }

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

  readonly severities: { value: FindingSeverity; label: string }[] = [
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
    { value: 'info', label: 'Info' },
  ];

  readonly statuses: { value: FindingStatus; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'triage', label: 'Triage' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'fixed', label: 'Fixed' },
    { value: 'false_positive', label: 'False Positive' },
  ];

  readonly assessmentAreas$ = this.classificationsService.assessmentAreas$;
  readonly owaspCategories$ = this.classificationsService.owaspCategories$;
  cweCatalog: ClassificationEntry[] = [];
  cweFiltered: ClassificationEntry[] = [];
  cweSearch = '';
  cweDropdownOpen = false;
  cweHighlightIndex = -1;

  private readonly engagementId$ = this.route.paramMap.pipe(
    map(p => p.get('id') || ''),
    shareReplay(1),
  );

  readonly engagement$: Observable<Engagement | null> = this.engagementId$.pipe(
    switchMap(id => id ? this.engagementsService.getById(id) : of(null)),
    shareReplay(1),
  );

  readonly scopeAssets$: Observable<Asset[]> = this.engagementId$.pipe(
    switchMap(id => id ? this.sowService.listScope(id) : of([] as Asset[])),
    shareReplay(1),
  );

  readonly sowStatus$ = new BehaviorSubject<SowStatus | null>(null);
  sowLoaded = false;
  canApproveSow = false;

  // -- Engagement type branching --
  isMalwareFlow = false;
  readonly samples$: Observable<MalwareSample[]> = this.engagementId$.pipe(
    switchMap(id => id ? this.engagementsService.listSamples(id) : of([] as MalwareSample[])),
    shareReplay(1),
  );

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

  ngAfterViewInit(): void {
    this.viewReady = true;

    // Determine engagement type for section branching
    this.engagement$.pipe(take(1)).subscribe(eng => {
      this.isMalwareFlow = eng?.engagement_type === 'malware_analysis';
      this.cdr.markForCheck();
    });

    this.tryInitDescEditor();
    this.tryInitRecEditor();

    this.classificationsService.cweEntries$.subscribe(data => {
      this.cweCatalog = data;
    });

    this.engagementId$.pipe(
      take(1),
      switchMap(id => id ? this.sowService.get(id).pipe(catchError(() => of(null))) : of(null)),
    ).subscribe(sow => {
      this.sowStatus$.next(sow?.status ?? null);
      this.sowLoaded = true;
      this.canApproveSow = this.permissionService.has('sow.update');
    });
  }

  ngOnDestroy(): void {
    this.descImagesDispose?.();
    this.recImagesDispose?.();
    void (this.descCrepe as any)?.destroy?.();
    void (this.recCrepe as any)?.destroy?.();
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  /* --- Description editor init --- */
  private tryInitDescEditor(): void {
    if (this.descEditorInited || !this.viewReady || !this.descEditorEl) return;
    this.descEditorInited = true;

    this.descCrepe = new Crepe({
      root: this.descEditorEl,
      defaultValue: this.form.get('description_md')?.value ?? '',
      featureConfigs: {
        'image-block': {
          blockOnUpload: async (file: File) => {
            console.log('[blockOnUpload] desc editor triggered', file?.name, file?.size);
            try {
              const url = await this.zone.run(() => this.uploadImageToApi(file));
              console.log('[blockOnUpload] desc editor got URL', url);
              return url;
            } catch (err) {
              console.error('[blockOnUpload] desc editor error', err);
              throw err;
            }
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
      markDirty: () => this.form.markAsDirty(),
      notifyError: (msg) => this.notify.error(msg),
    });
  }

  /* --- Recommendation editor init --- */
  private tryInitRecEditor(): void {
    if (this.recEditorInited || !this.viewReady || !this.recEditorEl) return;
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
      markDirty: () => this.form.markAsDirty(),
      notifyError: (msg) => this.notify.error(msg),
    });
  }

  private async uploadImageToApi(file: File): Promise<string> {
    const engagementId = this.route.snapshot.paramMap.get('id');
    if (!engagementId) throw new Error('Engagement ID missing for image upload');

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
      const res = await firstValueFrom(this.findingsService.uploadImage(engagementId, file));
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

  private sumFindings(s: FindingsSummary | null): number {
    if (!s) return 0;
    return (s.critical ?? 0) + (s.high ?? 0) + (s.medium ?? 0) + (s.low ?? 0) + (s.info ?? 0);
  }

  save(engagementId: string, asDraft = false): void {
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

    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_findings_per_engagement ?? 0;
    if (limit > 0) {
      this.engagement$.pipe(take(1)).subscribe(eng => {
        const current = this.sumFindings(eng?.findings_summary ?? null);
        if (current >= limit) {
          this.notify.error(`Findings limit reached (${current}/${limit}). Upgrade your plan to add more.`);
          return;
        }
        this.doSave(engagementId, asDraft);
      });
      return;
    }

    this.doSave(engagementId, asDraft);
  }

  private doSave(engagementId: string, asDraft: boolean): void {
    this.busy = true;

    void this.zone.run(async () => {
      try {
        const descMd = await this.readDescriptionMarkdown();
        const recMd = await this.readRecommendationMarkdown();
        this.form.patchValue(
          { description_md: descMd, recommendation_md: recMd },
          { emitEvent: false },
        );

        const v = this.form.getRawValue();

        this.findingsService
          .create(engagementId, {
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
          })
          .pipe(
            finalize(() => { this.busy = false; this.cdr.markForCheck(); }),
            take(1),
          )
          .subscribe({
            next: () => {
              this.saved = true;
              this.form.markAsPristine();
              this.router.navigate(['/engagements', engagementId, 'findings']);
            },
            error: (e) => {
              if (e?.status !== 402) {
                this.notify.error(e?.error?.message || e?.error?.detail || 'Create failed.');
              }
            },
          });
      } catch (e: any) {
        this.busy = false;
        this.notify.error(e?.message || 'Editor not ready.');
      }
    });
  }

  onMalwareFindingSubmitted(payload: MalwareFindingPayload): void {
    const engagementId = this.route.snapshot.paramMap.get('id');
    if (!engagementId) return;

    this.busy = true;
    this.cdr.markForCheck();

    this.findingsService
      .create(engagementId, {
        title: payload.title,
        sample_id: payload.sample_id,
        description_md: payload.description_md,
        is_draft: payload.is_draft,
      })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.saved = true;
          this.router.navigate(['/engagements', engagementId, 'findings']);
        },
        error: (e) => {
          this.busy = false;
          this.cdr.markForCheck();
          if (e?.status !== 402) {
            this.notify.error(e?.error?.message || e?.error?.detail || 'Create failed.');
          }
        },
      });
  }

  onMalwareDirtyChange(dirty: boolean): void {
    if (dirty) this.form.markAsDirty();
  }

  cancel(): void {
    const engagementId = this.route.snapshot.paramMap.get('id');
    if (engagementId) {
      this.router.navigate(['/engagements', engagementId, 'findings']);
    } else {
      this.router.navigate(['/engagements']);
    }
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
