import type { APIRequestContext, Page, TestInfo } from '@playwright/test';

// Defaults match the fixed development ports; the env overrides exist only so the suite can be
// pointed at servers started on other ports when 9011/9010 are occupied by unrelated processes.
export const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:9010';
export const FRONTEND = process.env.E2E_FRONTEND_URL ?? 'http://localhost:9011';
export const BACKEND_HOST = new URL(BACKEND).host;

/** Unique per project and per call, so desktop and mobile runs never share a link. */
export function uniqueUrl(testInfo: TestInfo, label = 'article'): string {
  return `https://example.com/${label}?run=${testInfo.project.name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export async function shortenViaApi(request: APIRequestContext, url: string) {
  const res = await request.post(`${BACKEND}/api/shorten`, { data: { url } });
  return { status: res.status(), body: await res.json() };
}

export async function visit(request: APIRequestContext, code: string) {
  return request.get(`${BACKEND}/r/${code}`, { maxRedirects: 0 });
}

export async function shortenInUi(page: Page, url: string) {
  await page.goto('/');
  await page.getByRole('textbox', { name: /url/i }).fill(url);
  await page.getByRole('button', { name: 'Shorten URL' }).click();
}
