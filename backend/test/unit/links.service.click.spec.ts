import { FakeClock } from '../../src/common/clock';
import { LinksRepository } from '../../src/links/links.repository';
import { LinksService } from '../../src/links/links.service';
import { TestApp, cleanupTempFiles, createTestApp, openSecondConnection } from '../support/test-app';

describe('LinksService.recordClick', () => {
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

  it('returns ok with the original URL and records the click with one timestamp', () => {
    const { short_code } = service.shorten('https://example.com/a');
    clock.set('2026-10-12T11:15:30Z');

    expect(service.recordClick(short_code)).toEqual({ status: 'ok', originalUrl: 'https://example.com/a' });

    const db = openSecondConnection(t.dbPath);
    const link = db.prepare('SELECT total_clicks, last_clicked_at FROM links').get();
    const event = db.prepare('SELECT clicked_at FROM click_events').get() as { clicked_at: string };
    db.close();
    expect(link).toEqual({ total_clicks: 1, last_clicked_at: '2026-10-12T11:15:30Z' });
    expect(event.clicked_at).toBe('2026-10-12T11:15:30Z');
  });

  it('returns not_found for unknown or malformed codes; malformed codes never touch the DB', () => {
    const repo = t.app.get(LinksRepository);
    const spy = jest.spyOn(repo, 'findByCode');

    expect(service.recordClick('bad')).toEqual({ status: 'not_found' });
    expect(service.recordClick('abc-1234')).toEqual({ status: 'not_found' });
    expect(service.recordClick('Abcdefgh')).toEqual({ status: 'not_found' });
    expect(spy).not.toHaveBeenCalled();

    expect(service.recordClick('ZZZZZZZ')).toEqual({ status: 'not_found' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns expired when now >= expires_at and writes nothing', () => {
    const { short_code } = service.shorten('https://example.com/a');
    clock.set('2026-10-13T10:00:00Z'); // exactly expires_at

    expect(service.recordClick(short_code)).toEqual({ status: 'expired' });

    const db = openSecondConnection(t.dbPath);
    expect(db.prepare('SELECT COUNT(*) AS n FROM click_events').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT total_clicks FROM links').get()).toEqual({ total_clicks: 0 });
    db.close();
  });
});
