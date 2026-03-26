import { TestBed } from '@angular/core/testing';
import { BcDatePipe } from './bc-date.pipe';
import { DateFormatService } from '../../services/core/date-format.service';

describe('BcDatePipe', () => {
  let pipe: BcDatePipe;
  let dateFormatService: jasmine.SpyObj<DateFormatService>;

  beforeEach(() => {
    dateFormatService = jasmine.createSpyObj('DateFormatService', ['formatDate', 'formatDateTime']);
    dateFormatService.formatDate.and.returnValue('Jan 1, 2026');
    dateFormatService.formatDateTime.and.returnValue('Jan 1, 2026, 10:30 AM');

    TestBed.configureTestingModule({
      providers: [
        BcDatePipe,
        { provide: DateFormatService, useValue: dateFormatService },
      ],
    });

    pipe = TestBed.inject(BcDatePipe);
  });

  it('should be created', () => {
    expect(pipe).toBeTruthy();
  });

  // --- default mode (date) ---

  it('calls formatDate by default when mode is not specified', () => {
    const result = pipe.transform('2026-01-01T00:00:00Z');
    expect(dateFormatService.formatDate).toHaveBeenCalledWith('2026-01-01T00:00:00Z');
    expect(result).toBe('Jan 1, 2026');
  });

  it('calls formatDate when mode is "date"', () => {
    const result = pipe.transform('2026-01-01T00:00:00Z', 'date');
    expect(dateFormatService.formatDate).toHaveBeenCalledWith('2026-01-01T00:00:00Z');
    expect(result).toBe('Jan 1, 2026');
  });

  // --- datetime mode ---

  it('calls formatDateTime when mode is "datetime"', () => {
    const result = pipe.transform('2026-01-01T10:30:00Z', 'datetime');
    expect(dateFormatService.formatDateTime).toHaveBeenCalledWith('2026-01-01T10:30:00Z');
    expect(result).toBe('Jan 1, 2026, 10:30 AM');
  });

  // --- null / undefined input ---

  it('passes null to formatDate when value is null', () => {
    pipe.transform(null);
    expect(dateFormatService.formatDate).toHaveBeenCalledWith(null);
  });

  it('passes undefined to formatDate when value is undefined', () => {
    pipe.transform(undefined);
    expect(dateFormatService.formatDate).toHaveBeenCalledWith(undefined);
  });

  it('passes null to formatDateTime when value is null and mode is datetime', () => {
    pipe.transform(null, 'datetime');
    expect(dateFormatService.formatDateTime).toHaveBeenCalledWith(null);
  });
});
