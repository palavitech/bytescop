import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface BackgroundJob {
  id: string;
  job_type: string;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  result: Record<string, unknown>;
  error_message: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AnalysisStep {
  name: string;
  label: string;
  status: 'pending' | 'in_progress' | 'done';
}

export interface AnalysisProgress {
  steps: AnalysisStep[];
  findings_created: number;
  current_step: number;
  total_steps: number;
}

@Injectable({ providedIn: 'root' })
export class JobsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/jobs`;

  getJob(jobId: string): Observable<BackgroundJob> {
    return this.http.get<BackgroundJob>(`${this.baseUrl}/${jobId}/`);
  }
}
