import { expect, test, Page } from '@playwright/test';
import { shortenInUi, uniqueUrl } from '../support/helpers';

const SIZES = [
  { name: 'phone', width: 375, height: 667 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

for (const size of SIZES) {
  test(`landing and analytics pages fit at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('textbox', { name: /url/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Shorten URL' })).toBeVisible();

    // A deliberately long URL must not push the layout wider than the screen.
    await shortenInUi(page, uniqueUrl(testInfo, 'responsive/' + 'segment-'.repeat(20)));
    const copy = page.getByRole('button', { name: 'Copy Link' });
    const analyticsLink = page.getByRole('link', { name: 'View Analytics' });
    await expect(copy).toBeVisible();
    await expect(analyticsLink).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await analyticsLink.click();
    await expect(page.getByTestId('chart-bar')).toHaveCount(24);
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    await expectNoHorizontalOverflow(page);
  });
}
