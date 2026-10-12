import { Injectable } from '@nestjs/common';
import { FakeClock } from '../../src/common/clock';
import { LinksRepository } from '../../src/links/links.repository';
import {
  TEST_PUBLIC_BASE_URL,
  TestApp,
  cleanupTempFiles,
  createTestApp,
  openSecondConnection,
} from '../support/test-app';

const countLinks = (dbPath: string): number => {
  const db = openSecondConnection(dbPath);
  const n = (db.prepare('SELECT COUNT(*) AS n FROM links').get() as { n: number }).n;
  db.close();
  return n;
};

const longUrl = (length: number) => 'http://example.com/' + 'a'.repeat(length - 'http://example.com/'.length);

describe('POST /api/shorten', () => {
  let t: TestApp;
  const clock = new FakeClock('2026-10-12T10:00:00Z');

  beforeEach(async () => {
    t = await createTestApp({ clock });
  });

  afterEach(async () => {
    await t.close();
    cleanupTempFiles();
  });

  it('creates a link: 201 with the ShortenResponse shape', async () => {
    const res = await t.http.post('/api/shorten').send({ url: 'https://example.com/article' }).expect(201);
    expect(res.body.short_code).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(res.body).toEqual({
      short_code: res.body.short_code,
      short_url: `${TEST_PUBLIC_BASE_URL}/r/${res.body.short_code}`,
      original_url: 'https://example.com/article',
      created_at: '2026-10-12T10:00:00Z',
      expires_at: '2026-10-13T10:00:00Z',
      reused: false,
    });
  });

  it.each([
    ['empty', { url: '' }],
    ['whitespace-only', { url: '   ' }],
    ['missing', {}],
    ['non-string', { url: 42 }],
    ['javascript scheme', { url: 'javascript:alert(1)' }],
    ['ftp scheme', { url: 'ftp://example.com/x' }],
    ['hostless', { url: 'http:///path' }],
    ['scheme only', { url: 'https://' }],
    ['internal space', { url: 'http://example.com/a b' }],
    ['embedded line break', { url: 'http://example.com/a\r\nb' }],
    ['2049 chars', { url: longUrl(2049) }],
  ])('returns 422 {detail} and stores nothing for %s', async (_name, body) => {
    const res = await t.http.post('/api/shorten').send(body).expect(422);
    expect(typeof res.body.detail).toBe('string');
    expect(Object.keys(res.body)).toEqual(['detail']);
    expect(countLinks(t.dbPath)).toBe(0);
  });

  it('accepts exactly 2048 characters', async () => {
    await t.http.post('/api/shorten').send({ url: longUrl(2048) }).expect(201);
  });

  it('stores a non-ASCII URL verbatim', async () => {
    const res = await t.http.post('/api/shorten').send({ url: 'http://example.com/café' }).expect(201);
    expect(res.body.original_url).toBe('http://example.com/café');
    const db = openSecondConnection(t.dbPath);
    expect(db.prepare('SELECT original_url FROM links').get()).toEqual({ original_url: 'http://example.com/café' });
    db.close();
  });

  it('trims whitespace and does not otherwise normalize the URL', async () => {
    const res = await t.http.post('/api/shorten').send({ url: '  HTTPS://Example.COM:443/A/../b?z=1&a=2#x  ' }).expect(201);
    expect(res.body.original_url).toBe('HTTPS://Example.COM:443/A/../b?z=1&a=2#x');
  });

  it('answers malformed JSON with {"detail":"Malformed request body"}', async () => {
    const res = await t.http
      .post('/api/shorten')
      .set('Content-Type', 'application/json')
      .send('{"url": ')
      .expect(400);
    expect(res.body).toEqual({ detail: 'Malformed request body' });
  });

  it('GET /health returns {"status":"ok"}', async () => {
    const res = await t.http.get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('serves Swagger UI at /docs', async () => {
    await t.http.get('/docs').redirects(1).expect(200);
  });

  it('persists data after the app is closed and re-created on the same file', async () => {
    const first = await t.http.post('/api/shorten').send({ url: 'https://example.com/persist' }).expect(201);
    const dbPath = t.dbPath;
    await t.close();

    t = await createTestApp({ clock, dbPath });
    const db = openSecondConnection(dbPath);
    expect(db.prepare('SELECT short_code, original_url FROM links').all()).toEqual([
      { short_code: first.body.short_code, original_url: 'https://example.com/persist' },
    ]);
    db.close();
    await t.http.get('/health').expect(200);
  });
});

describe('POST /api/shorten failure handling', () => {
  let t: TestApp;

  afterEach(async () => {
    await t.close();
    cleanupTempFiles();
  });

  it('returns a generic 500 and leaves no partial row when the repository fails mid-transaction', async () => {
    @Injectable()
    class FailingRepository extends LinksRepository {
      override findById(): never {
        throw new Error('SQLITE_IOERR: disk I/O error at /secret/path');
      }
    }
    t = await createTestApp({
      clock: new FakeClock('2026-10-12T10:00:00Z'),
      overrides: [{ provide: LinksRepository, useClass: FailingRepository }],
    });

    const res = await t.http.post('/api/shorten').send({ url: 'https://example.com/boom' }).expect(500);
    expect(res.body).toEqual({ detail: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toMatch(/sqlite|secret|stack|at /i);
    expect(countLinks(t.dbPath)).toBe(0);
  });
});
