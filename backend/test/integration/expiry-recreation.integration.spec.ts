import { FakeClock } from '../../src/common/clock';
import { TestApp, cleanupTempFiles, createTestApp, openSecondConnection } from '../support/test-app';

describe('expiry and recreation', () => {
  let t: TestApp;
  let clock: FakeClock;
  const URL = 'https://example.com/lifecycle';

  const shorten = (url = URL) => t.http.post('/api/shorten').send({ url });
  const linkRows = (url = URL) => {
    const db = openSecondConnection(t.dbPath);
    const rows = db.prepare('SELECT * FROM links WHERE original_url = ? ORDER BY id').all(url) as {
      short_code: string;
      expires_at: string;
    }[];
    db.close();
    return rows;
  };

  afterEach(async () => {
    await t.close();
    cleanupTempFiles();
  });

  describe('with a fake clock', () => {
    beforeEach(async () => {
      clock = new FakeClock('2026-10-12T10:00:00Z');
      t = await createTestApp({ clock });
    });

    it('creates a brand-new link with a different code and zero analytics after 24 h', async () => {
      const old = (await shorten().expect(201)).body;
      await t.http.get(`/r/${old.short_code}`).expect(302);
      await t.http.get(`/r/${old.short_code}`).expect(302);

      clock.advanceHours(24.5);
      const fresh = (await shorten().expect(201)).body;

      expect(fresh.reused).toBe(false);
      expect(fresh.short_code).not.toBe(old.short_code);
      const analytics = (await t.http.get(`/api/links/${fresh.short_code}/analytics`).expect(200)).body;
      expect(analytics.total_clicks).toBe(0);
      expect(analytics.last_clicked_at).toBeNull();
      expect(analytics.clicks_by_hour.every((b: { clicks: number }) => b.clicks === 0)).toBe(true);
    });

    it('keeps the old row as inactive history and never reactivates its code', async () => {
      const old = (await shorten().expect(201)).body;
      clock.advanceHours(25);
      const fresh = (await shorten().expect(201)).body;

      const rows = linkRows();
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.expires_at > '2026-10-13T11:00:00Z')).toHaveLength(1);
      expect(rows[0]).toMatchObject({ short_code: old.short_code, expires_at: '2026-10-13T10:00:00Z' });

      const body = { detail: 'This shortened URL has expired' };
      expect((await t.http.get(`/r/${old.short_code}`).expect(410)).body).toEqual(body);
      expect((await t.http.get(`/api/links/${old.short_code}/analytics`).expect(410)).body).toEqual(body);
      await t.http.get(`/r/${fresh.short_code}`).expect(302);
    });

    it('treats now == expires_at as expired and creates a new link', async () => {
      const old = (await shorten().expect(201)).body;
      clock.set(old.expires_at);
      const fresh = (await shorten().expect(201)).body;
      expect(fresh.short_code).not.toBe(old.short_code);
      expect(linkRows()).toHaveLength(2);
    });

    it('stays active past 24 h of wall time while renewals continue', async () => {
      const first = (await shorten().expect(201)).body;
      for (let i = 0; i < 6; i++) {
        clock.advanceHours(8); // 48 h in total, renewed every 8 h
        const again = (await shorten().expect(200)).body;
        expect(again.short_code).toBe(first.short_code);
      }
      expect(linkRows()).toHaveLength(1);
      const analytics = (await t.http.get(`/api/links/${first.short_code}/analytics`).expect(200)).body;
      expect(analytics.created_at).toBe('2026-10-12T10:00:00Z');
      expect(analytics.expires_at).toBe('2026-10-15T10:00:00Z'); // last renewal at +48 h, plus 24 h
      expect(analytics.clicks_by_hour).toHaveLength(24);
    });
  });

  it('never reissues the code of an expired link (UNIQUE index covers expired rows)', async () => {
    clock = new FakeClock('2026-10-12T10:00:00Z');
    const codes = ['AAAAAAA', 'AAAAAAA', 'BBBBBBB'];
    t = await createTestApp({ clock, codeGenerator: () => codes.shift() ?? 'CCCCCCC' });

    const old = (await shorten().expect(201)).body;
    expect(old.short_code).toBe('AAAAAAA');
    clock.advanceHours(30);

    const fresh = (await shorten().expect(201)).body;
    expect(fresh.short_code).toBe('BBBBBBB');
    expect(linkRows().map((r) => r.short_code)).toEqual(['AAAAAAA', 'BBBBBBB']);
  });
});
