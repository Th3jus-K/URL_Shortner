import { beforeAll, describe, expect, it } from 'vitest';
import { formatExpiresIn, formatHourLabel, formatLocalDateTime } from '../../src/utils/time.js';

beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata'; // UTC+05:30, never equal to UTC
});

describe('formatLocalDateTime', () => {
  it('renders a UTC string in the process timezone', () => {
    const text = formatLocalDateTime('2026-10-12T10:00:00Z');
    expect(text).toMatch(/3:30/); // 10:00 UTC == 15:30 IST
    expect(text).not.toMatch(/10:00/);
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(formatLocalDateTime(null)).toBe('');
    expect(formatLocalDateTime('nope')).toBe('');
  });
});

describe('formatExpiresIn', () => {
  const expires = '2026-10-13T10:00:00Z';
  const at = (iso) => new Date(iso).getTime();

  it('formats 23 hours 59 minutes', () => {
    expect(formatExpiresIn(expires, at('2026-10-12T10:00:30Z'))).toBe('23 hours 59 minutes');
  });

  it('uses singular units', () => {
    expect(formatExpiresIn(expires, at('2026-10-13T08:59:00Z'))).toBe('1 hour 1 minute');
  });

  it('reads Expired at exactly zero and when negative', () => {
    expect(formatExpiresIn(expires, at(expires))).toBe('Expired');
    expect(formatExpiresIn(expires, at('2026-10-13T11:00:00Z'))).toBe('Expired');
  });
});

describe('formatHourLabel', () => {
  it('derives the local hour from the UTC hour', () => {
    // 10:00 UTC -> 15:30 IST: the label is for the local clock reading of that instant.
    const label = formatHourLabel('2026-10-12T10:00:00Z');
    expect(label).toMatch(/3/);
    expect(label).not.toMatch(/^10/);
  });
});
