import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MentionMember } from '../models/comment.model';

@Injectable({ providedIn: 'root' })
export class MentionMembersService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = (environment.apiUrl || '').replace(/\/$/, '');

  list(): Observable<MentionMember[]> {
    return this.http.get<MentionMember[]>(
      `${this.apiBase}/api/authorization/members/ref/`,
    );
  }
}
