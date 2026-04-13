import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { ProjectsService } from '../services/projects.service';
import { Project, ProjectStatus, PROJECT_STATUS_LABELS } from '../models/project.model';
import { NotificationService } from '../../../services/core/notify/notification.service';

@Component({
  selector: 'app-projects-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-edit.component.html',
})
export class ProjectsEditComponent implements OnInit {
  private readonly projectsService = inject(ProjectsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  readonly loading$ = new BehaviorSubject(true);
  readonly saving$ = new BehaviorSubject(false);
  readonly serverError$ = new BehaviorSubject<string | null>(null);
  readonly project$ = new BehaviorSubject<Project | null>(null);

  form!: FormGroup;

  readonly statusOptions: { value: ProjectStatus; label: string }[] = [
    { value: 'active', label: PROJECT_STATUS_LABELS.active },
    { value: 'on_hold', label: PROJECT_STATUS_LABELS.on_hold },
    { value: 'completed', label: PROJECT_STATUS_LABELS.completed },
  ];

  ngOnInit(): void {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      description: [''],
      status: ['active'],
      start_date: [''],
      end_date: [''],
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading$.next(false);
      return;
    }

    this.projectsService.getById(id).subscribe({
      next: project => {
        this.project$.next(project);
        this.form.patchValue({
          name: project.name,
          description: project.description,
          status: project.status,
          start_date: project.start_date ?? '',
          end_date: project.end_date ?? '',
        });
        this.loading$.next(false);
      },
      error: () => {
        this.loading$.next(false);
        this.notify.error('Failed to load project.');
      },
    });
  }

  goBack(): void {
    this.location.back();
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const project = this.project$.value;
    if (!project) return;

    this.saving$.next(true);
    this.serverError$.next(null);

    const data = this.form.value;
    this.projectsService.update(project.id, {
      name: data.name,
      description: data.description,
      status: data.status,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
    }).subscribe({
      next: () => {
        this.saving$.next(false);
        this.notify.success('Project updated.');
        this.router.navigate(['/projects', project.id]);
      },
      error: err => {
        this.saving$.next(false);
        const detail = err?.error?.detail || 'Failed to update project.';
        this.serverError$.next(detail);
      },
    });
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl && ctrl.invalid && ctrl.touched);
  }
}
