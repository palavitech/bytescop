import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, ActivatedRoute, provideRouter } from '@angular/router';
import { Location } from '@angular/common';

import { EngagementTypeSelectComponent } from './engagement-type-select.component';
import { ENGAGEMENT_TYPE_META } from '../models/engagement.model';

describe('EngagementTypeSelectComponent', () => {
  let component: EngagementTypeSelectComponent;
  let fixture: ComponentFixture<EngagementTypeSelectComponent>;
  let router: Router;
  let locationSpy: jasmine.SpyObj<Location>;

  beforeEach(async () => {
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    await TestBed.configureTestingModule({
      imports: [EngagementTypeSelectComponent],
      providers: [
        provideRouter([]),
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams: { client: 'c1' } },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EngagementTypeSelectComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('types contains all engagement type meta entries', () => {
    expect(component.types).toEqual(ENGAGEMENT_TYPE_META);
    expect(component.types.length).toBeGreaterThan(0);
  });

  it('goBack() calls location.back()', () => {
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  it('selectType() navigates to wizard with type and preserves existing queryParams', () => {
    const webAppType = ENGAGEMENT_TYPE_META[0]; // web_app_pentest
    component.selectType(webAppType);
    expect(router.navigate).toHaveBeenCalledWith(
      ['/engagements/create/wizard'],
      { queryParams: { client: 'c1', type: webAppType.key } },
    );
  });

  it('selectType() navigates with malware_analysis type', () => {
    const malwareType = ENGAGEMENT_TYPE_META.find(t => t.key === 'malware_analysis')!;
    component.selectType(malwareType);
    expect(router.navigate).toHaveBeenCalledWith(
      ['/engagements/create/wizard'],
      { queryParams: { client: 'c1', type: 'malware_analysis' } },
    );
  });
});
