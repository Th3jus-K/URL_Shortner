const HOUR_MS = 3_600_000;

/** `YYYY-MM-DDTHH:mm:ssZ` (second precision, UTC). Fixed width, so string order == time order. */
export function toUtcString(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

export function floorToHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

export interface HourBucket {
  hour: string;
  clicks: number;
}

/**
 * Exactly 24 ascending UTC buckets: the hour containing `now` and the 23 before it.
 * `rows[].hour` is the 13-char prefix `YYYY-MM-DDTHH` of `clicked_at`.
 */
export function buildHourBuckets(
  now: Date,
  rows: ReadonlyArray<{ hour: string; clicks: number }>,
): HourBucket[] {
  const counts = new Map(rows.map((r) => [r.hour, r.clicks]));
  const last = floorToHour(now);
  const buckets: HourBucket[] = [];
  for (let i = 23; i >= 0; i--) {
    const hourStart = toUtcString(addHours(last, -i)).slice(0, 13);
    buckets.push({ hour: `${hourStart}:00:00Z`, clicks: counts.get(hourStart) ?? 0 });
  }
  return buckets;
}
