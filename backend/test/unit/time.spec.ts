import { addHours, buildHourBuckets, floorToHour, toUtcString } from '../../src/common/time';

describe('time helpers', () => {
  it('toUtcString has second precision, no milliseconds and ends in Z', () => {
    expect(toUtcString(new Date('2026-10-12T10:00:00.789Z'))).toBe('2026-10-12T10:00:00Z');
    expect(toUtcString(new Date('2026-10-12T10:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('addHours crosses a day boundary', () => {
    expect(toUtcString(addHours(new Date('2026-10-12T22:30:00Z'), 24))).toBe('2026-10-13T22:30:00Z');
    expect(toUtcString(addHours(new Date('2026-10-31T23:00:00Z'), 2))).toBe('2026-11-01T01:00:00Z');
  });

  it('floorToHour zeroes minutes and seconds', () => {
    expect(toUtcString(floorToHour(new Date('2026-10-12T10:59:59.999Z')))).toBe('2026-10-12T10:00:00Z');
  });

  it('string order equals chronological order', () => {
    const dates = ['2026-10-12T09:59:59Z', '2026-10-12T10:00:00Z', '2026-11-01T00:00:00Z', '2027-01-01T00:00:00Z'];
    const shuffled = [dates[2], dates[0], dates[3], dates[1]].map((d) => toUtcString(new Date(d)));
    expect([...shuffled].sort()).toEqual(dates);
  });

  it('buildHourBuckets is covered in analytics-buckets.spec.ts', () => {
    expect(buildHourBuckets(new Date('2026-10-12T10:30:00Z'), [])).toHaveLength(24);
  });
});
