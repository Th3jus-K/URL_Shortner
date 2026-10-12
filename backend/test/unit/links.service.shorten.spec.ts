import { FakeClock } from '../../src/common/clock';
import { LinksService } from '../../src/links/links.service';
import { TestApp, cleanupTempFiles, createTestApp, openSecondConnection } from '../support/test-app';

describe('LinksService.shorten (new link)', () => {
  let t: TestApp;
  const clock = new FakeClock('2026-10-12T10:00:00Z');

  afterEach(async () => {
    await t?.close();
    cleanupTempFiles();
  });

  it('creates one row with a 24h TTL and zero clicks', async () => {
    t = await createTestApp({ clock });
    const result = t.app.get(LinksService).shorten('  https://example.com/a  ');

    expect(result.reused).toBe(false);
    expect(result.original_url).toBe('https://example.com/a');
    expect(result.created_at).toBe('2026-10-12T10:00:00Z');
    expect(result.expires_at).toBe('2026-10-13T10:00:00Z');

    const db = openSecondConnection(t.dbPath);
    const rows = db.prepare('SELECT * FROM links').all() as Record<string, unknown>[];
    db.close();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      original_url: 'https://example.com/a',
      created_at: '2026-10-12T10:00:00Z',
      last_submitted_at: '2026-10-12T10:00:00Z',
      expires_at: '2026-10-13T10:00:00Z',
      total_clicks: 0,
      last_clicked_at: null,
    });
  });

  it('retries on a short_code UNIQUE collision', async () => {
    const codes = ['AAAAAAA', 'AAAAAAA', 'BBBBBBB'];
    const generator = jest.fn(() => codes.shift() ?? 'ZZZZZZZ');
    t = await createTestApp({ clock, codeGenerator: generator });
    const service = t.app.get(LinksService);

    expect(service.shorten('https://example.com/one').short_code).toBe('AAAAAAA');
    const second = service.shorten('https://example.com/two');
    expect(second.short_code).toBe('BBBBBBB');
    expect(generator).toHaveBeenCalledTimes(3);
  });

  it('gives up after five consecutive collisions without leaving a row', async () => {
    const generator = jest.fn(() => 'AAAAAAA');
    t = await createTestApp({ clock, codeGenerator: generator });
    const service = t.app.get(LinksService);
    service.shorten('https://example.com/one');
    generator.mockClear();

    expect(() => service.shorten('https://example.com/two')).toThrow();
    expect(generator).toHaveBeenCalledTimes(5);
    const db = openSecondConnection(t.dbPath);
    expect(db.prepare('SELECT COUNT(*) AS n FROM links').get()).toEqual({ n: 1 });
    db.close();
  });
});
