import { expect, test } from '@playwright/test';
import { countLinksForUrl } from '../support/db';
import { shortenInUi, uniqueUrl } from '../support/helpers';

test.describe('validation and error handling', () => {
  test('empty input shows an inline error and sends nothing', async ({ page }) => {
    let posted = false;
    page.on('request', (r) => {
      if (r.url().includes('/api/shorten')) posted = true;
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Shorten URL' }).click();
    await expect(page.getByText('Please enter a URL')).toBeVisible();
    expect(posted).toBe(false);
  });

  test('invalid inputs show an inline error and create no row', async ({ page }, testInfo) => {
    const marker = `${testInfo.project.name}-${Date.now()}`;
    const longUrl = `http://example.com/${marker}/`.padEnd(2049, 'a');
    expect(longUrl).toHaveLength(2049);
    const cases = [
      `javascript:alert('${marker}')`,
      `ftp://example.com/${marker}`,
      `http:///${marker}`,
      `https://`,
      longUrl,
    ];

    for (const url of cases) {
      await shortenInUi(page, url);
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.locator('.short-url')).toHaveCount(0);
      expect(countLinksForUrl(url)).toBe(0);
    }
  });

  test('a network failure shows the failure message and the form stays usable', async ({ page }, testInfo) => {
    await page.route('**/api/shorten', (route) => route.abort('connectionfailed'));
    await shortenInUi(page, uniqueUrl(testInfo, 'offline'));
    await expect(page.getByText(/could not reach the server/i)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /url/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Shorten URL' })).toBeEnabled();
  });
});
