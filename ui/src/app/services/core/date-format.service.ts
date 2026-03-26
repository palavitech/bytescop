import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { UserProfileService } from './profile/user-profile.service';

export type DateFormatKey =
  | 'MMM d, yyyy'
  | 'dd MMM yyyy'
  | 'dd/MM/yyyy'
  | 'MM/dd/yyyy'
  | 'yyyy-MM-dd'
  | 'EEE, MMM d, yyyy';

const DEFAULT_FORMAT: DateFormatKey = 'MMM d, yyyy';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDateOnly(d: Date, fmt: DateFormatKey): string {
  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  const dow = d.getDay();

  switch (fmt) {
    case 'MMM d, yyyy':
      return `${MONTHS_SHORT[month]} ${day}, ${year}`;
    case 'dd MMM yyyy':
      return `${pad2(day)} ${MONTHS_SHORT[month]} ${year}`;
    case 'dd/MM/yyyy':
      return `${pad2(day)}/${pad2(month + 1)}/${year}`;
    case 'MM/dd/yyyy':
      return `${pad2(month + 1)}/${pad2(day)}/${year}`;
    case 'yyyy-MM-dd':
      return `${year}-${pad2(month + 1)}-${pad2(day)}`;
    case 'EEE, MMM d, yyyy':
      return `${DAYS_SHORT[dow]}, ${MONTHS_SHORT[month]} ${day}, ${year}`;
    default:
      return `${MONTHS_SHORT[month]} ${day}, ${year}`;
  }
}

function formatTime(d: Date): string {
  let hours = d.getHours();
  const minutes = pad2(d.getMinutes());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

@Injectable({ providedIn: 'root' })
export class DateFormatService {
  private readonly userProfile = inject(UserProfileService);
  private readonly _format$ = new BehaviorSubject<DateFormatKey>(DEFAULT_FORMAT);
  private initialized = false;

  readonly format$ = this._format$.asObservable();

  get currentFormat(): DateFormatKey {
    return this._format$.value;
  }

  /**
   * Subscribe to the profile and update date format whenever it changes.
   * Called once from AppComponent.ngOnInit(). Safe to call multiple times.
   */
  load(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.userProfile.profile$.pipe(
      filter(p => p !== null),
    ).subscribe(profile => {
      const fmt = profile.dateFormat as DateFormatKey | null;
      this._format$.next(fmt ?? DEFAULT_FORMAT);
    });
  }

  setFormat(fmt: DateFormatKey): void {
    this._format$.next(fmt);
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return formatDateOnly(d, this._format$.value);
  }

  formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${formatDateOnly(d, this._format$.value)}, ${formatTime(d)}`;
  }
}
