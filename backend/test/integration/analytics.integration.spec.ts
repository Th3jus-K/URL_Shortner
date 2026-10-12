import { FakeClock } from '../../src/common/clock';
import { TEST_PUBLIC_BASE_URL, TestApp, cleanupTempFiles, createTestApp, openSecondConnection } from '../support/test-app';

describe('GET /api/links/:code/analytics', () => {
  let t: TestApp;
  let clock: FakeClock;

  const shorten = async (url = 'https://example.com/a') => (await t.http.post('/api/shorten').send({ url }).expect(201)).body;
  const visit = (code: string) => t.http.get(`/r/${code}`).expect(302);
  const snapshot = () => {
    const db = openSecondConnection(t.dbPath);
    const state = {
      links: db.prepare('SELECT * FROM links ORDER BY id').all(),
      events: db.prepare('SELECT COUNT(*) AS n FROM click_events').get(),
    };
    db.close();
    return state;
  };

  beforeEach(async () => {
    clock = new FakeClock('2026-10-12T10:00:00Z');
    t = await createTestApp({ clock });
  });

  afterEach(async () => {
    await t.close();
    cleanupTempFiles();
  });

  it('matches the AnalyticsResponse shape with exactly 24 buckets', async () => {
    const link = await shorten();
    const res = await t.http.get(`/api/links/${link.short_code}/analytics`).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['clicks_by_hour', 'created_at', 'expires_at', 'last_clicked_at', 'original_url', 'short_code', 'short_url', 'total_clicks'].sort(),
    );
    expect(res.body).toMatchObject({
      short_code: link.short_code,
      short_url: `${TEST_PUBLIC_BASE_URL}/r/${link.short_code}`,
      original_url: 'https://example.com/a',
      created_at: '2026-10-12T10:00:00Z',
      expires_at: '2026-10-13T10:00:00Z',
    });
    expect(res.body.clicks_by_hour).toHaveLength(24);
  });

  it('never-clicked link: total 0, last_clicked_at null, all buckets 0', async () => {
    const link = await shorten();
    const res = await t.http.get(`/api/links/${link.short_code}/analytics`).expect(200);
    expect(res.body.total_clicks).toBe(0);
    expect(res.body.last_clicked_at).toBeNull();
    expect(res.body.clicks_by_hour.every((b: { clicks: number }) => b.clicks === 0)).toBe(true);
  });

  it('places clicks in the right hourly buckets', async () => {
    const link = await shorten();
    clock.set('2026-10-12T10:10:00Z');
    await visit(link.short_code);
    clock.set('2026-10-12T11:30:00Z');
    await visit(link.short_code);
    await visit(link.short_code);
    clock.set('2026-10-12T12:05:00Z');
    await visit(link.short_code);
    clock.set('2026-10-12T12:20:00Z');

    const res = await t.http.get(`/api/links/${link.short_code}/analytics`).expect(200);
    const byHour = Object.fromEntries(res.body.clicks_by_hour.map((b: { hour: string; clicks: number }) => [b.hour, b.clicks]));
    expect(res.body.clicks_by_hour[0].hour).toBe('2026-10-11T13:00:00Z');
    expect(res.body.clicks_by_hour[23].hour).toBe('2026-10-12T12:00:00Z');
    expect(byHour['2026-10-12T10:00:00Z']).toBe(1);
    expect(byHour['2026-10-12T11:00:00Z']).toBe(2);
    expect(byHour['2026-10-12T12:00:00Z']).toBe(1);
    expect(res.body.total_clicks).toBe(4);
    expect(res.body.last_clicked_at).toBe('2026-10-12T12:05:00Z');
    const sum = res.body.clicks_by_hour.reduce((s: number, b: { clicks: number }) => s + b.clicks, 0);
    expect(sum).toBeLessThanOrEqual(res.body.total_clicks);
  });

  it.each(['ZZZZZZZ', 'bad', 'abc-1234'])('answers 404 for unknown/malformed code %s', async (code) => {
    const res = await t.http.get(`/api/links/${code}/analytics`).expect(404);
    expect(res.body).toEqual({ detail: 'Short URL not found' });
  });

  it('answers 410 for an expired link', async () => {
    const link = await shorten();
    clock.set('2026-10-13T10:00:00Z');
    const res = await t.http.get(`/api/links/${link.short_code}/analytics`).expect(410);
    expect(res.body).toEqual({ detail: 'This shortened URL has expired' });
  });

  it('performs no writes and never changes expires_at', async () => {
    const link = await shorten();
    await visit(link.short_code);
    clock.set('2026-10-12T20:00:00Z');
    const before = snapshot();
    await t.http.get(`/api/links/${link.short_code}/analytics`).expect(200);
    await t.http.get(`/api/links/ZZZZZZZ/analytics`).expect(404);
    expect(snapshot()).toEqual(before);
  });
});
