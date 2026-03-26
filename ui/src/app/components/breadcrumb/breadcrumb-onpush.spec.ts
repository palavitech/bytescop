import { TestBed } from '@angular/core/testing';
import { Component, ChangeDetectorRef } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { BreadcrumbComponent } from './breadcrumb';

@Component({ standalone: true, template: '' })
class DummyComponent {}

describe('BreadcrumbComponent OnPush', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BreadcrumbComponent],
      providers: [
        provideRouter([
          { path: 'foo', component: DummyComponent, data: { breadcrumb: 'Foo' } },
        ]),
      ],
    }).compileComponents();
  });

  it('should call markForCheck after NavigationEnd', async () => {
    const fixture = TestBed.createComponent(BreadcrumbComponent);
    fixture.detectChanges();

    const markSpy = spyOn((fixture.componentInstance as any).cdr, 'markForCheck');

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/foo');

    expect(markSpy).toHaveBeenCalled();
  });
});
