import { buildHourBuckets } from '../../src/common/time';

describe('buildHourBuckets', () => {
  it('returns exactly 24 ascending zero-filled buckets ending at the current hour', () => {
    const buckets = buildHourBuckets(new Date('2026-10-12T13:45:10Z'), []);
    expect(buckets).toHaveLength(24);
    expect(buckets[0]).toEqual({ hour: '2026-10-11T14:00:00Z', clicks: 0 });
    expect(buckets[23]).toEqual({ hour: '2026-10-12T13:00:00Z', clicks: 0 });
    const hours = buckets.map((b) => b.hour);
    expect([...hours].sort()).toEqual(hours);
    expect(new Set(hours).size).toBe(24);
    expect(buckets.every((b) => /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/.test(b.hour))).toBe(true);
  });

  it('places counts in the matching buckets', () => {
    const buckets = buildHourBuckets(new Date('2026-10-12T13:45:10Z'), [
      { hour: '2026-10-12T13', clicks: 4 },
      { hour: '2026-10-12T00', clicks: 2 },
      { hour: '2026-10-11T14', clicks: 1 },
    ]);
    expect(buckets[23].clicks).toBe(4);
    expect(buckets.find((b) => b.hour === '2026-10-12T00:00:00Z')?.clicks).toBe(2);
    expect(buckets[0].clicks).toBe(1);
  });

  it('excludes clicks older than the window', () => {
    const buckets = buildHourBuckets(new Date('2026-10-12T13:45:10Z'), [{ hour: '2026-10-11T13', clicks: 9 }]);
    expect(buckets.reduce((sum, b) => sum + b.clicks, 0)).toBe(0);
  });

  it('is correct across a month and year boundary', () => {
    const buckets = buildHourBuckets(new Date('2027-01-01T02:30:00Z'), []);
    expect(buckets[0].hour).toBe('2026-12-31T03:00:00Z');
    expect(buckets[23].hour).toBe('2027-01-01T02:00:00Z');
  });
});
