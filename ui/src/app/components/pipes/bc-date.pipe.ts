import { Pipe, PipeTransform, inject } from '@angular/core';
import { DateFormatService } from '../../services/core/date-format.service';

@Pipe({ name: 'bcDate', standalone: true, pure: false })
export class BcDatePipe implements PipeTransform {
  private readonly dateFormat = inject(DateFormatService);

  transform(value: string | null | undefined, mode: 'date' | 'datetime' = 'date'): string {
    return mode === 'datetime'
      ? this.dateFormat.formatDateTime(value)
      : this.dateFormat.formatDate(value);
  }
}
