/**
 * Reusable unsaved-changes guard.
 *
 * Usage:
 * 1. Component implements `DirtyFormComponent` (just add `isDirty(): boolean`)
 * 2. Component adds `@HostListener('window:beforeunload', ['$event'])`
 *    wired to `beforeUnloadGuard(e)` for browser close/refresh protection
 * 3. Route adds `canDeactivate: [canDeactivateDirty]`
 *
 * Example:
 *   export class MyEditComponent implements DirtyFormComponent {
 *     form = this.fb.group({ ... });
 *     private saved = false;
 *
 *     isDirty(): boolean { return !this.saved && this.form.dirty; }
 *
 *     @HostListener('window:beforeunload', ['$event'])
 *     onBeforeUnload(e: BeforeUnloadEvent) { beforeUnloadGuard(this, e); }
 *   }
 *
 *   // In routes:
 *   { path: 'edit', component: MyEditComponent, canDeactivate: [canDeactivateDirty] }
 */

import { CanDeactivateFn } from '@angular/router';

/** Interface for components with unsaved-changes tracking. */
export interface DirtyFormComponent {
  isDirty(): boolean;
}

/**
 * Angular route guard — prompts the user if the component reports dirty state.
 * Uses native `confirm()` for maximum browser compatibility.
 */
export const canDeactivateDirty: CanDeactivateFn<DirtyFormComponent> = (component) => {
  if (component.isDirty()) {
    return confirm('You have unsaved changes. Are you sure you want to leave?');
  }
  return true;
};

/**
 * Call from a @HostListener('window:beforeunload') to protect against
 * browser close, refresh, or address bar navigation.
 */
export function beforeUnloadGuard(component: DirtyFormComponent, event: BeforeUnloadEvent): void {
  if (component.isDirty()) {
    event.preventDefault();
  }
}
