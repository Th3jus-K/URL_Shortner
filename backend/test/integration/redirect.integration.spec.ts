import { Injectable } from '@nestjs/common';
import { FakeClock } from '../../src/common/clock';
import { LinksRepository } from '../../src/links/links.repository';
import { TestApp, cleanupTempFiles, createTestApp, openSecondConnection, spawnContender } from '../support/test-app';

describe('GET /r/:code', () => {
  let t: TestApp;
  let clock: FakeClock;

  const shorten = async (url: string): Promise<string> =>
    (await t.http.post('/api/shorten').send({ url }).expect(201)).body.short_code;

  const read = <T>(sql: string, ...params: unknown[]): T => {
    const db = openSecondConnection(t.dbPath);
    try {
      return db.prepare(sql).get(...params) as T;
    } finally {
      db.close();
    }
  };

  beforeEach(async () => {
    clock = new FakeClock('2026-10-12T10:00:00Z');
    t = await createTestApp({ clock });
  });

  afterEach(async () => {
    await t.close();
    cleanupTempFiles();
  });

  it('redirects with 302, Location, no-store and records exactly one click', async () => {
    const code = await shorten('https://example.com/article?a=1');
    clock.set('2026-10-12T12:00:00Z');

    const res = await t.http.get(`/r/${code}`).expect(302);
    expect(res.headers.location).toBe('https://example.com/article?a=1');
    expect(res.headers['cache-control']).toBe('no-store');

    expect(read('SELECT COUNT(*) AS n FROM click_events')).toEqual({ n: 1 });
    expect(read('SELECT total_clicks, last_clicked_at FROM links')).toEqual({
      total_clicks: 1,
      last_clicked_at: '2026-10-12T12:00:00Z',
    });
    expect(read('SELECT clicked_at FROM click_events')).toEqual({ clicked_at: '2026-10-12T12:00:00Z' });
  });

  it('percent-encodes a non-ASCII Location and leaves existing %XX sequences intact', async () => {
    const code = await shorten('http://example.com/café?q=%C3%A9');
    const res = await t.http.get(`/r/${code}`).expect(302);
    expect(res.headers.location).toBe('http://example.com/caf%C3%A9?q=%C3%A9');
  });

  it.each(['ZZZZZZZ', 'bad', 'abcdefgh', 'abc-123'])('answers 404 for unknown/malformed code %s with no writes', async (code) => {
    const res = await t.http.get(`/r/${code}`).expect(404);
    expect(res.body).toEqual({ detail: 'Short URL not found' });
    expect(read('SELECT COUNT(*) AS n FROM click_events')).toEqual({ n: 0 });
  });

  it('treats an undecodable code (/r/%FF) as unknown', async () => {
    const res = await t.http.get('/r/%FF').expect(404);
    expect(res.body).toEqual({ detail: 'Short URL not found' });
  });

  it('answers 410 once expired (including the exact boundary) with no click', async () => {
    const code = await shorten('https://example.com/a');
    clock.set('2026-10-13T09:59:59Z');
    await t.http.get(`/r/${code}`).expect(302);

    clock.set('2026-10-13T10:00:00Z');
    const res = await t.http.get(`/r/${code}`).expect(410);
    expect(res.body).toEqual({ detail: 'This shortened URL has expired' });
    expect(res.headers.location).toBeUndefined();
    expect(read('SELECT COUNT(*) AS n FROM click_events')).toEqual({ n: 1 });
    expect(read('SELECT total_clicks FROM links')).toEqual({ total_clicks: 1 });
  });

  it('counts every repeat visit and never extends expiry', async () => {
    const code = await shorten('https://example.com/a');
    const before = read<{ expires_at: string }>('SELECT expires_at FROM links').expires_at;
    clock.set('2026-10-12T20:00:00Z');
    for (let i = 0; i < 3; i++) await t.http.get(`/r/${code}`).expect(302);
    expect(read('SELECT total_clicks FROM links')).toEqual({ total_clicks: 3 });
    expect(read<{ expires_at: string }>('SELECT expires_at FROM links').expires_at).toBe(before);
  });

  it('100 concurrent visits yield exactly 100 clicks (SC-006)', async () => {
    const code = await shorten('https://example.com/busy');
    const responses = await Promise.all(Array.from({ length: 100 }, () => t.http.get(`/r/${code}`)));
    expect(responses.every((r) => r.status === 302)).toBe(true);
    expect(read('SELECT total_clicks FROM links')).toEqual({ total_clicks: 100 });
    expect(read('SELECT COUNT(*) AS n FROM click_events')).toEqual({ n: 100 });
  });

  it('waits on the busy timeout while another process holds the write lock, losing no clicks', async () => {
    const code = await shorten('https://example.com/contended');
    const contender = spawnContender(t.dbPath, { holdMs: 300 });
    await contender.ready;

    const started = Date.now();
    const responses = await Promise.all(Array.from({ length: 10 }, () => t.http.get(`/r/${code}`)));
    await contender.done;

    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(302));
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(read('SELECT total_clicks FROM links')).toEqual({ total_clicks: 10 });
    expect(read('SELECT COUNT(*) AS n FROM click_events')).toEqual({ n: 10 });
  });

  it('click_events holds only id, link_id and clicked_at', () => {
    const columns = openSecondConnection(t.dbPath);
    const names = (columns.prepare("SELECT name FROM pragma_table_info('click_events')").all() as { name: string }[]).map(
      (c) => c.name,
    );
    columns.close();
    expect(names).toEqual(['id', 'link_id', 'clicked_at']);
  });
});

describe('GET /r/:code rollback', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.close();
    cleanupTempFiles();
  });

  it('rolls back the click event when the counter update fails', async () => {
    @Injectable()
    class FailingIncrement extends LinksRepository {
      override incrementClicks(): never {
        throw new Error('SQLITE_FULL');
      }
    }
    t = await createTestApp({
      clock: new FakeClock('2026-10-12T10:00:00Z'),
      overrides: [{ provide: LinksRepository, useClass: FailingIncrement }],
    });
    const code = (await t.http.post('/api/shorten').send({ url: 'https://example.com/a' }).expect(201)).body.short_code;

    const res = await t.http.get(`/r/${code}`).expect(500);
    expect(res.body).toEqual({ detail: 'Internal server error' });

    const db = openSecondConnection(t.dbPath);
    expect(db.prepare('SELECT COUNT(*) AS n FROM click_events').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT total_clicks FROM links').get()).toEqual({ total_clicks: 0 });
    db.close();
  });
});
