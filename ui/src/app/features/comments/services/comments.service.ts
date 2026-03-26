import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Comment, CommentCreate } from '../models/comment.model';

@Injectable({ providedIn: 'root' })
export class CommentsService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = (environment.apiUrl || '').replace(/\/$/, '');

  private buildUrl(targetType: string, targetId: string): string {
    return `${this.apiBase}/api/${targetType}s/${targetId}/comments`;
  }

  list(targetType: string, targetId: string): Observable<Comment[]> {
    return this.http.get<Comment[]>(`${this.buildUrl(targetType, targetId)}/`);
  }

  create(targetType: string, targetId: string, data: CommentCreate): Observable<Comment> {
    return this.http.post<Comment>(`${this.buildUrl(targetType, targetId)}/`, data);
  }

  reply(targetType: string, targetId: string, commentId: string, data: CommentCreate): Observable<Comment> {
    return this.http.post<Comment>(
      `${this.buildUrl(targetType, targetId)}/${commentId}/reply/`, data,
    );
  }

  update(targetType: string, targetId: string, commentId: string, data: CommentCreate): Observable<Comment> {
    return this.http.patch<Comment>(
      `${this.buildUrl(targetType, targetId)}/${commentId}/`, data,
    );
  }

  delete(targetType: string, targetId: string, commentId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.buildUrl(targetType, targetId)}/${commentId}/`,
    );
  }
}
