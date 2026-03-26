import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';

import { UserFormComponent } from './user-form.component';

describe('UserFormComponent OnPush', () => {
  let fixture: ComponentFixture<UserFormComponent>;
  let component: UserFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserFormComponent, ReactiveFormsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  it('should create component in OnPush mode', () => {
    fixture = TestBed.createComponent(UserFormComponent);
    component = fixture.componentInstance;
    component.mode = 'create';
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });
});
