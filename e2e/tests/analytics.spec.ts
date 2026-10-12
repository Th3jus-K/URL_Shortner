import { expect, test } from '@playwright/test';
import { forceExpire } from '../support/db';
import { BACKEND, shortenViaApi, uniqueUrl, visit } from '../support/helpers';

test.describe('analytics page', () => {
  test('shows 24 bars with the current hour holding the clicks; Refresh updates with no background requests', async ({
    page,
    request,
  }, testInfo) => {
    const { body } = await shortenViaApi(request, uniqueUrl(testInfo, 'analytics'));
    for (let i = 0; i < 3; i++) expect((await visit(request, body.short_code)).status()).toBe(302);

    const analyticsRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/links/')) analyticsRequests.push(r.url());
    });

    await page.goto(`/stats/${body.short_code}`);
    const bars = page.getByTestId('chart-bar');
    await expect(bars).toHaveCount(24);
    await expect(page.getByTestId('total-clicks')).toHaveText('3');
    await expect(bars.last().getByTestId('bar-count')).toHaveText('3');

    // No polling: nothing further after the initial load.
    await page.waitForTimeout(1500);
    expect(analyticsRequests).toHaveLength(1);

    for (let i = 0; i < 2; i++) await visit(request, body.short_code);
    await page.waitForTimeout(500);
    expect(analyticsRequests).toHaveLength(1);
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByTestId('total-clicks')).toHaveText('5');
    await expect(bars.last().getByTestId('bar-count')).toHaveText('5');
    expect(analyticsRequests).toHaveLength(2);
  });

  test('renders times in the browser timezone, not UTC', async ({ page, request }, testInfo) => {
    const { body } = await shortenViaApi(request, uniqueUrl(testInfo, 'tz'));
    await visit(request, body.short_code);
    await page.goto(`/stats/${body.short_code}`);
    await expect(page.getByTestId('total-clicks')).toHaveText('1');

    const format = (utc: string, timeZone: string) =>
      new Date(utc).toLocaleString('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' });
    const expected = format(body.created_at, 'Asia/Kolkata');
    await expect(page.getByTestId('created-at')).toHaveText(expected);
    const utcText = format(body.created_at, 'UTC');
    if (utcText !== expected) await expect(page.getByTestId('created-at')).not.toHaveText(utcText);
  });

  test('a never-clicked link shows 0 clicks and "Never"', async ({ page, request }, testInfo) => {
    const { body } = await shortenViaApi(request, uniqueUrl(testInfo, 'never'));
    await page.goto(`/stats/${body.short_code}`);
    await expect(page.getByTestId('total-clicks')).toHaveText('0');
    await expect(page.getByTestId('last-clicked-at')).toHaveText('Never');
    await expect(page.getByTestId('chart-bar')).toHaveCount(24);
  });

  test('unknown and expired codes show their messages', async ({ page, request }, testInfo) => {
    await page.goto('/stats/ZZZZZZZ');
    await expect(page.getByText('Short link not found')).toBeVisible();

    const { body } = await shortenViaApi(request, uniqueUrl(testInfo, 'expiring'));
    forceExpire(body.short_code);
    await page.goto(`/stats/${body.short_code}`);
    await expect(page.getByText('This shortened URL has expired')).toBeVisible();
    expect((await request.get(`${BACKEND}/api/links/${body.short_code}/analytics`)).status()).toBe(410);
  });
});
