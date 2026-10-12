import { FakeClock } from '../../src/common/clock';
import { LinksRepository } from '../../src/links/links.repository';
import { LinksService } from '../../src/links/links.service';
import { TestApp, cleanupTempFiles, createTestApp, openSecondConnection } from '../support/test-app';

describe('LinksService.shorten (renewal)', () => {
  let t: TestApp;
  let clock: FakeClock;
  let service: LinksService;

  beforeEach(async () => {
    clock = new FakeClock('2026-10-12T10:00:00Z');
    t = await createTestApp({ clock });
    service = t.app.get(LinksService);
  });

  afterEach(async () => {
    await t.close();
    cleanupTempFiles();
  });

  const rows = () => {
    const db = openSecondConnection(t.dbPath);
    const all = db.prepare('SELECT * FROM links ORDER BY id').all() as Record<string, unknown>[];
    db.close();
    return all;
  };

  it('returns the same code with reused:true, keeps created_at and renews expiry', () => {
    const first = service.shorten('https://example.com/a');
    clock.set('2026-10-12T18:00:00Z');
    const again = service.shorten('https://example.com/a');

    expect(again).toMatchObject({
      short_code: first.short_code,
      reused: true,
      created_at: '2026-10-12T10:00:00Z',
      expires_at: '2026-10-13T18:00:00Z',
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ last_submitted_at: '2026-10-12T18:00:00Z', expires_at: '2026-10-13T18:00:00Z' });
  });

  it('trims surrounding whitespace so it matches the stored URL', () => {
    const first = service.shorten('https://a.com');
    expect(service.shorten(' https://a.com ').short_code).toBe(first.short_code);
    expect(rows()).toHaveLength(1);
  });

  it('treats URLs differing only in query order as different links', () => {
    const a = service.shorten('https://example.com/p?a=1&b=2');
    const b = service.shorten('https://example.com/p?b=2&a=1');
    expect(a.short_code).not.toBe(b.short_code);
    expect(rows()).toHaveLength(2);
  });

  it('never shortens an existing expiration', () => {
    const first = service.shorten('https://example.com/a');
    const db = openSecondConnection(t.dbPath);
    db.prepare('UPDATE links SET expires_at = ?').run('2026-10-20T00:00:00Z');
    db.close();

    const again = service.shorten('https://example.com/a');
    expect(again.short_code).toBe(first.short_code);
    expect(again.expires_at).toBe('2026-10-20T00:00:00Z');
  });

  it('does not revive a link that expires between lookup and update', () => {
    const first = service.shorten('https://example.com/a');
    clock.set('2026-10-13T10:00:00Z'); // exactly expired
    const stale = t.app.get(LinksRepository).findById(1)!;
    jest.spyOn(t.app.get(LinksRepository), 'findActiveByUrl').mockReturnValue(stale);

    const result = service.shorten('https://example.com/a');
    expect(result.reused).toBe(false);
    expect(result.short_code).not.toBe(first.short_code);
    const all = rows();
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ short_code: first.short_code, expires_at: '2026-10-13T10:00:00Z' });
  });
});
