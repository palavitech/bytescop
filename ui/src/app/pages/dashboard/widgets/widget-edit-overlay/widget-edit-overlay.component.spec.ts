import { TestBed, ComponentFixture } from '@angular/core/testing';
import { WidgetEditOverlayComponent } from './widget-edit-overlay.component';

describe('WidgetEditOverlayComponent', () => {
  let component: WidgetEditOverlayComponent;
  let fixture: ComponentFixture<WidgetEditOverlayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetEditOverlayComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WidgetEditOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits remove event', () => {
    spyOn(component.remove, 'emit');
    component.remove.emit();
    expect(component.remove.emit).toHaveBeenCalled();
  });
});
