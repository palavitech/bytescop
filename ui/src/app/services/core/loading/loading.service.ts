import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
    private active = 0;
    private showTimer: any = null;
    private hideTimer: any = null;

    private readonly loadingSubject = new BehaviorSubject<boolean>(false);
    readonly isLoading$: Observable<boolean> = this.loadingSubject.asObservable();

    start(): void {
        this.active += 1;
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        if (this.loadingSubject.value) return;

        if (this.showTimer) clearTimeout(this.showTimer);
        this.showTimer = setTimeout(() => {
            if (this.active > 0) this.loadingSubject.next(true);
        }, 150);
    }

    stop(): void {
        this.active = Math.max(0, this.active - 1);
        if (this.active > 0) return;

        if (this.showTimer) {
            clearTimeout(this.showTimer);
            this.showTimer = null;
        }

        if (this.hideTimer) clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => {
            this.loadingSubject.next(false);
        }, 180);
    }
}
