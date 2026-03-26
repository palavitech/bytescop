import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { DateFormatService, DateFormatKey } from './date-format.service';
import { UserProfileService } from './profile/user-profile.service';
import { UserProfile } from './profile/user-profile.types';

describe('DateFormatService', () => {
  let service: DateFormatService;
  let profileSubject: BehaviorSubject<UserProfile | null>;

  beforeEach(() => {
    profileSubject = new BehaviorSubject<UserProfile | null>(null);

    const userProfileSpy = {
      profile$: profileSubject.asObservable(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: UserProfileService, useValue: userProfileSpy },
      ],
    });
    service = TestBed.inject(DateFormatService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- Default format ---

  it('currentFormat defaults to "MMM d, yyyy"', () => {
    expect(service.currentFormat).toBe('MMM d, yyyy');
  });

  it('format$ emits default format initially', () => {
    let fmt: DateFormatKey | undefined;
    service.format$.subscribe(f => fmt = f);
    expect(fmt).toBe('MMM d, yyyy');
  });

  // --- setFormat ---

  it('setFormat() updates currentFormat', () => {
    service.setFormat('yyyy-MM-dd');
    expect(service.currentFormat).toBe('yyyy-MM-dd');
  });

  // --- load() ---

  it('load() reads dateFormat from profile and updates format', () => {
    service.load();

    const profile = {
      dateFormat: 'dd/MM/yyyy',
    } as UserProfile;
    profileSubject.next(profile);

    expect(service.currentFormat).toBe('dd/MM/yyyy');
  });

  it('load() uses default when profile dateFormat is null', () => {
    service.load();

    const profile = {
      dateFormat: null,
    } as UserProfile;
    profileSubject.next(profile);

    expect(service.currentFormat).toBe('MMM d, yyyy');
  });

  it('load() ignores null profile emissions', () => {
    service.load();
    profileSubject.next(null);

    expect(service.currentFormat).toBe('MMM d, yyyy');
  });

  it('load() only subscribes once (idempotent)', () => {
    service.load();

    const profile = { dateFormat: 'yyyy-MM-dd' } as UserProfile;
    profileSubject.next(profile);
    expect(service.currentFormat).toBe('yyyy-MM-dd');

    // Call load again — should not re-subscribe
    service.load();

    // Change format, should still react (single subscription still active)
    const profile2 = { dateFormat: 'dd MMM yyyy' } as UserProfile;
    profileSubject.next(profile2);
    expect(service.currentFormat).toBe('dd MMM yyyy');
  });

  it('load() updates when profile changes', () => {
    service.load();

    profileSubject.next({ dateFormat: 'yyyy-MM-dd' } as UserProfile);
    expect(service.currentFormat).toBe('yyyy-MM-dd');

    profileSubject.next({ dateFormat: 'MM/dd/yyyy' } as UserProfile);
    expect(service.currentFormat).toBe('MM/dd/yyyy');
  });

  // --- formatDate ---

  it('formatDate() returns dash for null', () => {
    expect(service.formatDate(null)).toBe('\u2014');
  });

  it('formatDate() returns dash for undefined', () => {
    expect(service.formatDate(undefined)).toBe('\u2014');
  });

  it('formatDate() returns dash for empty string', () => {
    expect(service.formatDate('')).toBe('\u2014');
  });

  it('formatDate() returns dash for invalid date', () => {
    expect(service.formatDate('not-a-date')).toBe('\u2014');
  });

  it('formatDate() formats with default "MMM d, yyyy"', () => {
    // Use a date we know: Jan 15, 2026
    const result = service.formatDate('2026-01-15T00:00:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('2026');
  });

  it('formatDate() formats with "dd MMM yyyy"', () => {
    service.setFormat('dd MMM yyyy');
    const result = service.formatDate('2026-03-05T00:00:00Z');
    expect(result).toMatch(/^\d{2} \w{3} \d{4}$/);
  });

  it('formatDate() formats with "dd/MM/yyyy"', () => {
    service.setFormat('dd/MM/yyyy');
    const result = service.formatDate('2026-03-05T00:00:00Z');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('formatDate() formats with "MM/dd/yyyy"', () => {
    service.setFormat('MM/dd/yyyy');
    const result = service.formatDate('2026-03-05T00:00:00Z');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('formatDate() formats with "yyyy-MM-dd"', () => {
    service.setFormat('yyyy-MM-dd');
    const result = service.formatDate('2026-03-05T00:00:00Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('formatDate() formats with "EEE, MMM d, yyyy"', () => {
    service.setFormat('EEE, MMM d, yyyy');
    const result = service.formatDate('2026-03-05T00:00:00Z');
    // Should start with a 3-letter day abbreviation
    expect(result).toMatch(/^\w{3}, \w{3} \d+, \d{4}$/);
  });

  // --- formatDateTime ---

  it('formatDateTime() returns dash for null', () => {
    expect(service.formatDateTime(null)).toBe('\u2014');
  });

  it('formatDateTime() returns dash for undefined', () => {
    expect(service.formatDateTime(undefined)).toBe('\u2014');
  });

  it('formatDateTime() returns dash for empty string', () => {
    expect(service.formatDateTime('')).toBe('\u2014');
  });

  it('formatDateTime() returns dash for invalid date', () => {
    expect(service.formatDateTime('bad-date')).toBe('\u2014');
  });

  it('formatDateTime() includes date and time with AM/PM', () => {
    const result = service.formatDateTime('2026-01-15T14:30:00Z');
    // Should contain date and time portion with AM or PM
    expect(result).toMatch(/\d{4}/);
    expect(result).toMatch(/(AM|PM)/);
  });

  it('formatDateTime() shows 12 for noon', () => {
    // Create a date at noon in local timezone
    const d = new Date(2026, 0, 15, 12, 0);
    const result = service.formatDateTime(d.toISOString());
    expect(result).toContain('12:00 PM');
  });

  it('formatDateTime() shows 12 for midnight', () => {
    const d = new Date(2026, 0, 15, 0, 5);
    const result = service.formatDateTime(d.toISOString());
    expect(result).toContain('12:05 AM');
  });

  it('formatDate() uses default format for unknown format key', () => {
    service.setFormat('UNKNOWN' as DateFormatKey);
    const result = service.formatDate('2026-01-15T00:00:00Z');
    // Default fallback: MMM d, yyyy
    expect(result).toContain('Jan');
    expect(result).toContain('2026');
  });

  it('pad2 pads single-digit numbers', () => {
    service.setFormat('dd/MM/yyyy');
    // Jan 5 should produce 05/01/2026
    const result = service.formatDate('2026-01-05T00:00:00Z');
    expect(result).toMatch(/^05\/01\/2026$/);
  });
});
