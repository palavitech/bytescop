import { test, expect } from '../fixtures/test-fixtures';

test.describe('Audit log visualization', () => {
  test('charts render without cropped legends', async ({ page }) => {
    // Navigate to audit log
    await page.goto('/admin/audit');
    await page.waitForSelector('.bc-h1');

    // Click Visualize button
    await page.locator('.bc-iconBtn', { hasText: /visualize/i }).click();

    // Wait for charts to load (summaryLoading goes false → canvases appear)
    await page.waitForSelector('.bc-summaryChart canvas', { timeout: 15_000 });

    // Give Chart.js a moment to finish rendering animations
    await page.waitForTimeout(1000);

    // Screenshot the full visualization panel
    const vizPanel = page.locator('.bc-summaryGrid');
    await vizPanel.screenshot({ path: 'e2e/audit-viz-panel.png' });

    // Screenshot each individual chart for inspection
    const charts = page.locator('.bc-summaryChart');
    const count = await charts.count();
    expect(count).toBe(6);

    for (let i = 0; i < count; i++) {
      await charts.nth(i).screenshot({ path: `e2e/audit-chart-${i}.png` });
    }

    // Verify each canvas has non-zero dimensions (Chart.js rendered)
    for (let i = 0; i < count; i++) {
      const canvas = charts.nth(i).locator('canvas');
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(50);
      expect(box!.height).toBeGreaterThan(50);
    }

    // Check that chart containers aren't clipping legends:
    // each .bc-summaryChart has overflow:hidden, so if the canvas + legend
    // exceeds the container height, content gets clipped.
    // Verify the canvas doesn't overflow its container.
    for (let i = 0; i < count; i++) {
      const container = charts.nth(i);
      const canvas = container.locator('canvas');

      const containerBox = await container.boundingBox();
      const canvasBox = await canvas.boundingBox();

      expect(containerBox).not.toBeNull();
      expect(canvasBox).not.toBeNull();

      // Canvas bottom edge should not exceed container bottom edge
      const containerBottom = containerBox!.y + containerBox!.height;
      const canvasBottom = canvasBox!.y + canvasBox!.height;
      expect(canvasBottom).toBeLessThanOrEqual(
        containerBottom + 1, // 1px tolerance for rounding
      );
    }
  });
});
