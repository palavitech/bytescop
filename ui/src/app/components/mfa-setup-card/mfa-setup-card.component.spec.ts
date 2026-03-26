import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { MfaSetupCardComponent } from './mfa-setup-card.component';

describe('MfaSetupCardComponent', () => {
  let component: MfaSetupCardComponent;
  let fixture: ComponentFixture<MfaSetupCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MfaSetupCardComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(MfaSetupCardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- showCodeInput getter branch coverage ---

  it('showCodeInput returns true when requireDownload is false', () => {
    component.requireDownload = false;
    component.backupCodes = ['CODE1', 'CODE2'];
    component.codesDownloaded = false;

    expect(component.showCodeInput).toBe(true);
  });

  it('showCodeInput returns true when requireDownload is true but backupCodes is empty', () => {
    component.requireDownload = true;
    component.backupCodes = [];
    component.codesDownloaded = false;

    expect(component.showCodeInput).toBe(true);
  });

  it('showCodeInput returns true when requireDownload is true, codes exist, and codes downloaded', () => {
    component.requireDownload = true;
    component.backupCodes = ['CODE1', 'CODE2'];
    component.codesDownloaded = true;

    expect(component.showCodeInput).toBe(true);
  });

  it('showCodeInput returns false when requireDownload is true, codes exist, and codes not downloaded', () => {
    component.requireDownload = true;
    component.backupCodes = ['CODE1', 'CODE2'];
    component.codesDownloaded = false;

    expect(component.showCodeInput).toBe(false);
  });

  // --- onConfirm branch coverage ---

  it('onConfirm() emits confirm when code meets minimum length', () => {
    spyOn(component.confirm, 'emit');
    component.codeMinLength = 6;
    component.code = '123456';

    component.onConfirm();

    expect(component.confirm.emit).toHaveBeenCalledWith('123456');
  });

  it('onConfirm() emits confirm when code exceeds minimum length', () => {
    spyOn(component.confirm, 'emit');
    component.codeMinLength = 6;
    component.code = '1234567';

    component.onConfirm();

    expect(component.confirm.emit).toHaveBeenCalledWith('1234567');
  });

  it('onConfirm() does not emit when code is shorter than minimum length', () => {
    spyOn(component.confirm, 'emit');
    component.codeMinLength = 6;
    component.code = '123';

    component.onConfirm();

    expect(component.confirm.emit).not.toHaveBeenCalled();
  });

  it('onConfirm() does not emit when code is empty', () => {
    spyOn(component.confirm, 'emit');
    component.codeMinLength = 6;
    component.code = '';

    component.onConfirm();

    expect(component.confirm.emit).not.toHaveBeenCalled();
  });

  // --- onCancel ---

  it('onCancel() emits cancel event', () => {
    spyOn(component.cancel, 'emit');

    component.onCancel();

    expect(component.cancel.emit).toHaveBeenCalled();
  });

  // --- onDownload ---

  it('onDownload() sets codesDownloaded to true and emits download', () => {
    spyOn(component.download, 'emit');
    component.codesDownloaded = false;

    component.onDownload();

    expect(component.codesDownloaded).toBe(true);
    expect(component.download.emit).toHaveBeenCalled();
  });
});
