import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AvatarResponse, ProfileResponse } from '../models/profile.model';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/me/profile`;

  getProfile(): Observable<ProfileResponse> {
    return this.http.get<ProfileResponse>(`${this.baseUrl}/`);
  }

  updateProfile(data: { first_name?: string; last_name?: string; phone?: string; timezone?: string }): Observable<ProfileResponse> {
    return this.http.patch<ProfileResponse>(`${this.baseUrl}/`, data);
  }

  /**
   * Upload avatar via multipart POST.
   */
  uploadAvatar(file: File): Observable<AvatarResponse> {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.http.post<AvatarResponse>(`${this.baseUrl}/avatar/`, formData);
  }

  deleteAvatar(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/avatar/`);
  }
}
