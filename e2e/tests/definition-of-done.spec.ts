import { expect, test } from '@playwright/test';
import { countClickEvents, forceExpire, getLink } from '../support/db';
import { BACKEND, BACKEND_HOST, FRONTEND, uniqueUrl, visit } from '../support/helpers';

test.describe.configure({ mode: 'serial' });
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('the 15-step Definition of Done flow', async ({ page, request }, testInfo) => {
  const url = uniqueUrl(testInfo, 'article');
  const shortUrlLocator = page.locator('.short-url');

  // 1. Open the landing page.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /url shortener/i })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /url/i })).toBeVisible();

  // 2-3. Shorten and read the result.
  await page.getByRole('textbox', { name: /url/i }).fill(url);
  await page.getByRole('button', { name: 'Shorten URL' }).click();
  await expect(shortUrlLocator).toBeVisible();
  const shortUrl = (await shortUrlLocator.textContent())!.trim();
  const match = shortUrl.match(new RegExp(`^http://${BACKEND_HOST}/r/([A-Za-z0-9]{7})$`));
  expect(match).not.toBeNull();
  const code = match![1];
  await expect(page.getByText(/expires in 2[34] hours/i)).toBeVisible();
  await expect(page.getByText(/reused/i)).toHaveCount(0);

  // 4. Copy.
  await page.getByRole('button', { name: 'Copy Link' }).click();
  await expect(page.getByRole('status')).toContainText(/copied/i);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shortUrl);

  // 5. Visit the short URL three times without following redirects.
  for (let i = 0; i < 3; i++) {
    const res = await visit(request, code);
    expect(res.status()).toBe(302);
    expect(res.headers()['location']).toBe(url);
  }

  // 6. View Analytics lands on the frontend origin.
  await page.getByRole('link', { name: 'View Analytics' }).click();
  await expect(page).toHaveURL(`${FRONTEND}/stats/${code}`);

  // 7. Totals and chart.
  await expect(page.getByTestId('total-clicks')).toHaveText('3');
  await expect(page.getByTestId('chart-bar')).toHaveCount(24);
  await expect(page.getByTestId('chart-bar').last().getByTestId('bar-count')).toHaveText('3');
  const createdBefore = getLink(code)!.created_at;
  const expiresBefore = getLink(code)!.expires_at;

  // 8-9. Resubmit the same URL: same code, reuse note, later expiry, created_at unchanged.
  await page.waitForTimeout(1100); // timestamps have one-second precision
  await page.goto('/');
  await page.getByRole('textbox', { name: /url/i }).fill(url);
  await page.getByRole('button', { name: 'Shorten URL' }).click();
  await expect(shortUrlLocator).toHaveText(shortUrl);
  await expect(page.getByText(/existing link was reused and its expiry renewed/i)).toBeVisible();
  const renewed = getLink(code)!;
  expect(renewed.expires_at > expiresBefore).toBe(true);
  expect(renewed.created_at).toBe(createdBefore);

  // 10. Analytics preserved after Refresh.
  await page.getByRole('link', { name: 'View Analytics' }).click();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByTestId('total-clicks')).toHaveText('3');

  // 11-12. Force expiry: 410 with the exact body, expired page, click count unchanged.
  forceExpire(code);
  const gone = await visit(request, code);
  expect(gone.status()).toBe(410);
  expect(await gone.json()).toEqual({ detail: 'This shortened URL has expired' });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText('This shortened URL has expired')).toBeVisible();
  expect(getLink(code)!.total_clicks).toBe(3);
  expect(countClickEvents(code)).toBe(3);

  // 13-14. Resubmit: 201-style new link with a different code.
  const created = page.waitForResponse((r) => r.url().endsWith('/api/shorten') && r.request().method() === 'POST');
  await page.goto('/');
  await page.getByRole('textbox', { name: /url/i }).fill(url);
  await page.getByRole('button', { name: 'Shorten URL' }).click();
  expect((await created).status()).toBe(201);
  await expect(shortUrlLocator).toBeVisible();
  const newCode = (await shortUrlLocator.textContent())!.trim().split('/r/')[1];
  expect(newCode).toMatch(/^[A-Za-z0-9]{7}$/);
  expect(newCode).not.toBe(code);
  await expect(page.getByText(/reused/i)).toHaveCount(0);

  // 15. The new code starts empty; the old one stays 410.
  await page.getByRole('link', { name: 'View Analytics' }).click();
  await expect(page).toHaveURL(`${FRONTEND}/stats/${newCode}`);
  await expect(page.getByTestId('total-clicks')).toHaveText('0');
  await expect(page.getByTestId('last-clicked-at')).toHaveText('Never');
  const bars = page.getByTestId('chart-bar');
  await expect(bars).toHaveCount(24);
  for (const text of await bars.getByTestId('bar-count').allTextContents()) expect(text).toBe('0');
  expect((await visit(request, code)).status()).toBe(410);
  expect((await request.get(`${BACKEND}/api/links/${code}/analytics`)).status()).toBe(410);
});
