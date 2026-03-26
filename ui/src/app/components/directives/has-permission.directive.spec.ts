import { Component } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HasPermissionDirective } from './has-permission.directive';
import { PermissionService, AuthorizationPayload } from '../../services/core/auth/permission.service';

@Component({
  standalone: true,
  imports: [HasPermissionDirective],
  template: `
    <span *bcHasPermission="'client.view'" id="single">Visible</span>
    <span *bcHasPermission="['user.view', 'group.view']" id="multi">Admin</span>
  `,
})
class TestHostComponent {}

@Component({
  standalone: true,
  imports: [HasPermissionDirective],
  template: `
    <span *bcHasPermission="'client.view'; else fallback" id="guarded">Allowed</span>
    <ng-template #fallback><span id="fallback">No Access</span></ng-template>
  `,
})
class TestHostWithElseComponent {}

describe('HasPermissionDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let permissions: PermissionService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [TestHostComponent, TestHostWithElseComponent],
    });
    permissions = TestBed.inject(PermissionService);
    fixture = TestBed.createComponent(TestHostComponent);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('hides element when user lacks permission', () => {
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: [],
      groups: [],
    });
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('#single');
    expect(el).toBeNull();
  });

  it('shows element when user has the permission', () => {
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: ['client.view'],
      groups: [],
    });
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('#single');
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('Visible');
  });

  it('shows element when user has any of array permissions', () => {
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: ['group.view'],
      groups: [],
    });
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('#multi');
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('Admin');
  });

  it('hides element when user has none of array permissions', () => {
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: ['client.view'],
      groups: [],
    });
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('#multi');
    expect(el).toBeNull();
  });

  it('shows all elements for root user', () => {
    permissions.setFromAuthResponse({
      is_root: true,
      permissions: [],
      groups: [],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#single')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#multi')).not.toBeNull();
  });

  it('reacts to permission changes', () => {
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: [],
      groups: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#single')).toBeNull();

    permissions.setFromAuthResponse({
      is_root: false,
      permissions: ['client.view'],
      groups: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#single')).not.toBeNull();

    permissions.clear();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#single')).toBeNull();
  });

  it('cleans up subscription on destroy', () => {
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: ['client.view'],
      groups: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#single')).not.toBeNull();

    // Destroying the fixture should not throw
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('does not double-render when permission stays true', () => {
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: ['client.view'],
      groups: [],
    });
    fixture.detectChanges();

    // Re-emit the same permissions
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: ['client.view', 'extra.perm'],
      groups: [],
    });
    fixture.detectChanges();

    const els = fixture.nativeElement.querySelectorAll('#single');
    expect(els.length).toBe(1);
  });
});
