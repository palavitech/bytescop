import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { ClassificationCardComponent } from './classification-card.component';
import { ClassificationsService } from '../../services/classifications.service';
import { ClassificationEntry } from '../../models/classification-data';

const MOCK_AREA: ClassificationEntry = { code: 'app_sec', name: 'Application Security', description: 'App sec' };
const MOCK_OWASP: ClassificationEntry = { code: 'A01', name: 'Broken Access Control', description: 'BAC' };
const MOCK_CWE: ClassificationEntry = { code: 'CWE-79', name: 'Cross-site Scripting', description: 'XSS' };

describe('ClassificationCardComponent', () => {
  let component: ClassificationCardComponent;
  let fixture: ComponentFixture<ClassificationCardComponent>;

  const areaMap = new Map<string, ClassificationEntry>([['app_sec', MOCK_AREA]]);
  const owaspMap = new Map<string, ClassificationEntry>([['A01', MOCK_OWASP]]);
  const cweMap = new Map<string, ClassificationEntry>([['CWE-79', MOCK_CWE]]);

  const mockClassificationsService = {
    assessmentAreaMap$: of(areaMap),
    owaspMap$: of(owaspMap),
    cweMap$: of(cweMap),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClassificationCardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ClassificationsService, useValue: mockClassificationsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ClassificationCardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // --- hasAny ---

  it('hasAny returns false when no inputs set', () => {
    fixture.detectChanges();
    expect(component.hasAny).toBe(false);
  });

  it('hasAny returns true when assessmentArea set', () => {
    component.assessmentArea = 'app_sec';
    fixture.detectChanges();
    expect(component.hasAny).toBe(true);
  });

  it('hasAny returns true when owaspCategory set', () => {
    component.owaspCategory = 'A01';
    fixture.detectChanges();
    expect(component.hasAny).toBe(true);
  });

  it('hasAny returns true when cweId set', () => {
    component.cweId = 'CWE-79';
    fixture.detectChanges();
    expect(component.hasAny).toBe(true);
  });

  it('hasAny returns true when all three set', () => {
    component.assessmentArea = 'app_sec';
    component.owaspCategory = 'A01';
    component.cweId = 'CWE-79';
    fixture.detectChanges();
    expect(component.hasAny).toBe(true);
  });

  // --- areaEntry ---

  it('areaEntry returns entry when map has matching code', () => {
    component.assessmentArea = 'app_sec';
    fixture.detectChanges();
    expect(component.areaEntry).toEqual(MOCK_AREA);
  });

  it('areaEntry returns null when code not in map', () => {
    component.assessmentArea = 'nonexistent';
    fixture.detectChanges();
    expect(component.areaEntry).toBeNull();
  });

  it('areaEntry returns null when assessmentArea is empty', () => {
    component.assessmentArea = '';
    fixture.detectChanges();
    expect(component.areaEntry).toBeNull();
  });

  // --- owaspEntry ---

  it('owaspEntry returns entry when map has matching code', () => {
    component.owaspCategory = 'A01';
    fixture.detectChanges();
    expect(component.owaspEntry).toEqual(MOCK_OWASP);
  });

  it('owaspEntry returns null when code not in map', () => {
    component.owaspCategory = 'A99';
    fixture.detectChanges();
    expect(component.owaspEntry).toBeNull();
  });

  // --- cweEntry ---

  it('cweEntry returns entry when cweId matches', () => {
    component.cweId = 'CWE-79';
    fixture.detectChanges();
    expect(component.cweEntry).toEqual(MOCK_CWE);
  });

  it('cweEntry returns null when cweId is empty', () => {
    component.cweId = '';
    fixture.detectChanges();
    expect(component.cweEntry).toBeNull();
  });

  it('cweEntry returns null when cweId not in map', () => {
    component.cweId = 'CWE-999';
    fixture.detectChanges();
    expect(component.cweEntry).toBeNull();
  });

  // --- bare mode ---

  it('bare defaults to false', () => {
    expect(component.bare).toBe(false);
  });

  it('bare can be set to true', () => {
    component.bare = true;
    fixture.detectChanges();
    expect(component.bare).toBe(true);
  });

  it('renders card wrapper when bare=false and hasAny', () => {
    component.assessmentArea = 'app_sec';
    component.bare = false;
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.bc-classCard');
    expect(card).toBeTruthy();
  });

  it('does not render card wrapper when bare=true', () => {
    component.assessmentArea = 'app_sec';
    component.bare = true;
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.bc-classCard');
    expect(card).toBeFalsy();
  });

  it('renders title section when bare=false', () => {
    component.assessmentArea = 'app_sec';
    component.bare = false;
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.bc-classCardTitle');
    expect(title).toBeTruthy();
  });

  it('does not render title section when bare=true', () => {
    component.assessmentArea = 'app_sec';
    component.bare = true;
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.bc-classCardTitle');
    expect(title).toBeFalsy();
  });

  // --- maps not loaded (empty maps) ---

  describe('with empty maps', () => {
    beforeEach(async () => {
      await TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ClassificationCardComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: ClassificationsService,
            useValue: {
              assessmentAreaMap$: of(new Map()),
              owaspMap$: of(new Map()),
              cweMap$: of(new Map()),
            },
          },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(ClassificationCardComponent);
      component = fixture.componentInstance;
    });

    it('areaEntry returns null when map is empty', () => {
      component.assessmentArea = 'app_sec';
      fixture.detectChanges();
      expect(component.areaEntry).toBeNull();
    });

    it('owaspEntry returns null when map is empty', () => {
      component.owaspCategory = 'A01';
      fixture.detectChanges();
      expect(component.owaspEntry).toBeNull();
    });

    it('cweEntry returns null when map is empty and cweId set', () => {
      component.cweId = 'CWE-79';
      fixture.detectChanges();
      expect(component.cweEntry).toBeNull();
    });
  });

  // --- template rendering ---

  it('renders nothing when hasAny is false', () => {
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector('.bc-classCard');
    expect(container).toBeFalsy();
  });

  it('renders assessment area item when entry exists', () => {
    component.assessmentArea = 'app_sec';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.bc-classItem');
    expect(items.length).toBeGreaterThan(0);
    const label = items[0].querySelector('.bc-classItemLabel');
    expect(label?.textContent).toContain('Assessment Area');
  });

  it('renders CWE loading state when cweId set but no entry', () => {
    component.cweId = 'CWE-999';
    fixture.detectChanges();
    const desc = fixture.nativeElement.querySelector('.bc-sub');
    expect(desc?.textContent).toContain('Loading description');
  });
});
