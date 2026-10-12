import { describe, expect, it, vi } from 'vitest';
import { getAnalytics, shortenUrl } from '../../src/services/api.js';

const jsonResponse = (status, body) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

const failure = (promise) => promise.then(() => null, (e) => e);

describe('api.js', () => {
  it('returns the 201 body with its status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(201, { short_code: 'Ab3xY9z', reused: false })));
    await expect(shortenUrl('https://example.com')).resolves.toEqual({
      status: 201,
      data: { short_code: 'Ab3xY9z', reused: false },
    });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/shorten');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ url: 'https://example.com' });
  });

  it('returns the 200 (reused) body with its status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(200, { reused: true })));
    await expect(shortenUrl('https://example.com')).resolves.toEqual({ status: 200, data: { reused: true } });
  });

  it('maps 422 to invalid and carries the server detail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(422, { detail: 'url must be a valid http or https URL' })));
    const error = await failure(shortenUrl('x'));
    expect(error.kind).toBe('invalid');
    expect(error.detail).toBe('url must be a valid http or https URL');
  });

  it('maps 404 to notFound and 410 to expired', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(404, { detail: 'Short URL not found' })));
    expect((await failure(getAnalytics('Ab3xY9z'))).kind).toBe('notFound');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(410, { detail: 'This shortened URL has expired' })));
    expect((await failure(getAnalytics('Ab3xY9z'))).kind).toBe('expired');
  });

  it('maps a rejected fetch to network', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect((await failure(shortenUrl('https://example.com'))).kind).toBe('network');
  });

  it('maps a non-JSON 502 from the proxy to network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError('bad')) })),
    );
    expect((await failure(shortenUrl('https://example.com'))).kind).toBe('network');
  });

  it('maps 500 to unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(500, { detail: 'Internal server error' })));
    const error = await failure(shortenUrl('https://example.com'));
    expect(error.kind).toBe('unknown');
    expect(error.status).toBe(500);
  });

  it('requests analytics by encoded code', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(200, {})));
    await getAnalytics('Ab3xY9z');
    expect(fetch.mock.calls[0][0]).toBe('/api/links/Ab3xY9z/analytics');
  });
});
