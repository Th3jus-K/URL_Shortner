import { expect, test } from '@playwright/test';
import { BACKEND_HOST, shortenInUi, uniqueUrl } from '../support/helpers';

test.describe('copy link', () => {
  test.describe('with clipboard permission', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('copies the short URL, shows a success toast and does not reload', async ({ page }, testInfo) => {
      await shortenInUi(page, uniqueUrl(testInfo, 'copy-ok'));
      const shortUrl = (await page.locator('.short-url').textContent())!.trim();
      expect(shortUrl).toMatch(new RegExp(`^http://${BACKEND_HOST}/r/[A-Za-z0-9]{7}$`));

      await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
      await page.getByRole('button', { name: 'Copy Link' }).click();

      await expect(page.getByRole('status')).toContainText(/copied/i);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shortUrl);
      expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    });
  });

  test.describe('without clipboard permission', () => {
    test.use({ permissions: [] });

    test('shows a failure toast and keeps the short URL visible and selectable', async ({ page }, testInfo) => {
      await page.addInitScript(() => {
        // Headless Chromium leaves the permission undecided; make the denial explicit.
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
        });
      });
      await shortenInUi(page, uniqueUrl(testInfo, 'copy-denied'));
      const shortUrl = page.locator('.short-url');
      await page.getByRole('button', { name: 'Copy Link' }).click();

      await expect(page.getByRole('status')).toContainText(/could not copy/i);
      await expect(shortUrl).toBeVisible();
      expect(await shortUrl.evaluate((el) => getComputedStyle(el).userSelect)).not.toBe('none');
    });
  });
});
