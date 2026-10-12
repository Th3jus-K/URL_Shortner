import { FakeClock } from '../../src/common/clock';
import { TestApp, cleanupTempFiles, createTestApp, openSecondConnection, spawnContender } from '../support/test-app';

describe('renewal via POST /api/shorten', () => {
  let t: TestApp;
  let clock: FakeClock;
  const URL = 'https://example.com/renewable';

  const rowsFor = (url: string) => {
    const db = openSecondConnection(t.dbPath);
    const all = db.prepare('SELECT * FROM links WHERE original_url = ? ORDER BY id').all(url) as {
      short_code: string;
      expires_at: string;
      created_at: string;
      total_clicks: number;
    }[];
    db.close();
    return all;
  };

  beforeEach(async () => {
    clock = new FakeClock('2026-10-12T10:00:00Z');
    t = await createTestApp({ clock });
  });

  afterEach(async () => {
    await t.close();
    cleanupTempFiles();
  });

  it('answers 200 with the same code, reused:true, later expiry and unchanged created_at', async () => {
    const first = (await t.http.post('/api/shorten').send({ url: URL }).expect(201)).body;
    clock.set('2026-10-12T18:00:00Z');
    const second = (await t.http.post('/api/shorten').send({ url: URL }).expect(200)).body;

    expect(second).toEqual({
      ...first,
      expires_at: '2026-10-13T18:00:00Z',
      reused: true,
    });
    expect(second.created_at).toBe('2026-10-12T10:00:00Z');
    expect(rowsFor(URL)).toHaveLength(1);
  });

  it('keeps clicks made before the renewal in total_clicks (SC-003)', async () => {
    const first = (await t.http.post('/api/shorten').send({ url: URL }).expect(201)).body;
    for (let i = 0; i < 3; i++) await t.http.get(`/r/${first.short_code}`).expect(302);
    clock.set('2026-10-12T20:00:00Z');
    await t.http.post('/api/shorten').send({ url: URL }).expect(200);

    const analytics = (await t.http.get(`/api/links/${first.short_code}/analytics`).expect(200)).body;
    expect(analytics.total_clicks).toBe(3);
    expect(analytics.expires_at).toBe('2026-10-13T20:00:00Z');
  });

  it('50 concurrent identical submissions of a new URL create one row, one 201 and 49 200s (SC-005)', async () => {
    const responses = await Promise.all(
      Array.from({ length: 50 }, () => t.http.post('/api/shorten').send({ url: 'https://example.com/race' })),
    );
    const codes = new Set(responses.map((r) => r.body.short_code));
    expect(codes.size).toBe(1);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(49);
    expect(rowsFor('https://example.com/race')).toHaveLength(1);
  });

  it('concurrent renewals of an active URL keep one row, the same code and never lower expires_at', async () => {
    const first = (await t.http.post('/api/shorten').send({ url: URL }).expect(201)).body;
    for (let i = 0; i < 2; i++) await t.http.get(`/r/${first.short_code}`).expect(302);
    clock.set('2026-10-12T12:00:00Z');

    const responses = await Promise.all(Array.from({ length: 30 }, () => t.http.post('/api/shorten').send({ url: URL })));
    expect(responses.every((r) => r.status === 200 && r.body.short_code === first.short_code)).toBe(true);
    const rows = rowsFor(URL);
    expect(rows).toHaveLength(1);
    expect(rows[0].expires_at).toBe('2026-10-13T12:00:00Z');
    expect(rows[0].total_clicks).toBe(2);
    expect(responses.every((r) => r.body.expires_at >= first.expires_at)).toBe(true);
  });

  it('waits on the busy timeout while another process holds the write lock', async () => {
    const contender = spawnContender(t.dbPath, { holdMs: 300 });
    await contender.ready;

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => t.http.post('/api/shorten').send({ url: 'https://example.com/contended' })),
    );
    await contender.done;

    expect(responses.every((r) => r.status === 201 || r.status === 200)).toBe(true);
    expect(new Set(responses.map((r) => r.body.short_code)).size).toBe(1);
    expect(rowsFor('https://example.com/contended')).toHaveLength(1);
  });
});
