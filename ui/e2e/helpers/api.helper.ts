import { type APIRequestContext } from '@playwright/test';

const apiBase = process.env['E2E_API_URL'] || 'http://localhost:8000';

/**
 * Direct API helper for test setup/teardown.
 * Uses Playwright's APIRequestContext for authenticated API calls.
 */
export class ApiHelper {
  constructor(
    private request: APIRequestContext,
    private token: string,
    private tenantSlug: string
  ) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'X-Tenant-Slug': this.tenantSlug,
      'Content-Type': 'application/json',
    };
  }

  /** Delete a client/organization by ID */
  async deleteClient(id: string): Promise<void> {
    await this.request.delete(`${apiBase}/api/clients/${id}/`, {
      headers: this.headers(),
    });
  }

  /** List clients (for finding test data to clean up) */
  async listClients(): Promise<{ id: string; name: string }[]> {
    const res = await this.request.get(`${apiBase}/api/clients/`, {
      headers: this.headers(),
    });
    const data = await res.json();
    return data.results || data;
  }
}
