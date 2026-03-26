import { canDeactivateDirty, beforeUnloadGuard, DirtyFormComponent } from './dirty-form.guard';

describe('dirty-form.guard', () => {
  // --- canDeactivateDirty ---

  describe('canDeactivateDirty', () => {
    it('should return true when component is not dirty', () => {
      const component: DirtyFormComponent = { isDirty: () => false };
      const result = (canDeactivateDirty as Function)(component, {} as any, {} as any, {} as any);
      expect(result).toBe(true);
    });

    it('should call confirm when component is dirty', () => {
      const component: DirtyFormComponent = { isDirty: () => true };
      spyOn(window, 'confirm').and.returnValue(true);
      const result = (canDeactivateDirty as Function)(component, {} as any, {} as any, {} as any);
      expect(window.confirm).toHaveBeenCalledWith('You have unsaved changes. Are you sure you want to leave?');
      expect(result).toBe(true);
    });

    it('should return false when user cancels confirm dialog', () => {
      const component: DirtyFormComponent = { isDirty: () => true };
      spyOn(window, 'confirm').and.returnValue(false);
      const result = (canDeactivateDirty as Function)(component, {} as any, {} as any, {} as any);
      expect(result).toBe(false);
    });
  });

  // --- beforeUnloadGuard ---

  describe('beforeUnloadGuard', () => {
    it('should call preventDefault when component is dirty', () => {
      const component: DirtyFormComponent = { isDirty: () => true };
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      spyOn(event, 'preventDefault');
      beforeUnloadGuard(component, event);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should not call preventDefault when component is not dirty', () => {
      const component: DirtyFormComponent = { isDirty: () => false };
      const event = new Event('beforeunload') as BeforeUnloadEvent;
      spyOn(event, 'preventDefault');
      beforeUnloadGuard(component, event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});
