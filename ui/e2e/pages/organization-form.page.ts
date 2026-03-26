import { type Page, type Locator } from '@playwright/test';

export class OrganizationFormPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly websiteInput: Locator;
  readonly statusSelect: Locator;
  readonly notesTextarea: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly errorBanner: Locator;
  readonly fieldErrors: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('.bc-h1');
    this.nameInput = page.locator('#orgName');
    this.websiteInput = page.locator('#orgWebsite');
    this.statusSelect = page.locator('#orgStatus');
    this.notesTextarea = page.locator('#orgNotes');
    this.submitButton = page.locator('button.btn-success');
    this.cancelButton = page.locator('button.btn-outline-light');
    this.errorBanner = page.locator('.alert-danger');
    this.fieldErrors = page.locator('.bc-fieldError');
  }

  async fillForm(data: {
    name: string;
    website?: string;
    status?: string;
    notes?: string;
  }) {
    await this.nameInput.fill(data.name);
    if (data.website) await this.websiteInput.fill(data.website);
    if (data.status) await this.statusSelect.selectOption(data.status);
    if (data.notes) await this.notesTextarea.fill(data.notes);
  }

  async submit() {
    await this.submitButton.click();
  }

  async cancel() {
    await this.cancelButton.click();
  }
}
