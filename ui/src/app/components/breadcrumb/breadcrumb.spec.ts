import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { BreadcrumbComponent } from './breadcrumb';

@Component({ standalone: true, template: '' })
class DummyComponent {}

describe('BreadcrumbComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BreadcrumbComponent],
      providers: [
        provideRouter([
          {
            path: 'projects',
            component: DummyComponent,
            data: { breadcrumb: 'Projects' },
            children: [
              {
                path: 'my-task',
                component: DummyComponent,
                data: { breadcrumb: 'My Task' }
              }
            ]
          },
          {
            path: 'no-label',
            component: DummyComponent
          },
          {
            path: 'auto-title',
            component: DummyComponent,
            data: {}
          }
        ])
      ]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(BreadcrumbComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('crumbs starts as empty array when no child routes', () => {
    const fixture = TestBed.createComponent(BreadcrumbComponent);
    expect(fixture.componentInstance.crumbs).toEqual([]);
  });

  it('builds crumbs from route data after navigation', async () => {
    const fixture = TestBed.createComponent(BreadcrumbComponent);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/projects/my-task');
    fixture.detectChanges();

    const crumbs = fixture.componentInstance.crumbs;
    expect(crumbs.length).toBe(2);
    expect(crumbs[0].label).toBe('Projects');
    expect(crumbs[0].url).toBe('/projects');
    expect(crumbs[1].label).toBe('My Task');
    expect(crumbs[1].url).toBe('/projects/my-task');
  });

  it('builds single crumb for a top-level route', async () => {
    const fixture = TestBed.createComponent(BreadcrumbComponent);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/projects');
    fixture.detectChanges();

    const crumbs = fixture.componentInstance.crumbs;
    expect(crumbs.length).toBe(1);
    expect(crumbs[0].label).toBe('Projects');
  });

  it('uses titleize fallback when no breadcrumb data', async () => {
    const fixture = TestBed.createComponent(BreadcrumbComponent);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/auto-title');
    fixture.detectChanges();

    const crumbs = fixture.componentInstance.crumbs;
    expect(crumbs.length).toBe(1);
    expect(crumbs[0].label).toBe('Auto Title');
  });

  it('titleize converts slug to Title Case', () => {
    const fixture = TestBed.createComponent(BreadcrumbComponent);
    const component = fixture.componentInstance as any;
    expect(component.titleize('hello-world')).toBe('Hello World');
    expect(component.titleize('some_thing')).toBe('Some Thing');
    expect(component.titleize('')).toBe('');
  });

  it('uses titleize for route with no breadcrumb data key', async () => {
    const fixture = TestBed.createComponent(BreadcrumbComponent);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/no-label');
    fixture.detectChanges();

    const crumbs = fixture.componentInstance.crumbs;
    expect(crumbs.length).toBe(1);
    expect(crumbs[0].label).toBe('No Label');
  });
});
