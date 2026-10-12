const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** API timestamps are UTC `YYYY-MM-DDTHH:mm:ssZ`; show them in the browser's timezone. */
export function formatLocalDateTime(utcString) {
  if (!utcString) return '';
  const date = new Date(utcString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function plural(n, unit) {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** Computed once from the given instant (no live countdown). */
export function formatExpiresIn(expiresAtUtc, nowMs = Date.now()) {
  const diff = new Date(expiresAtUtc).getTime() - nowMs;
  if (!(diff > 0)) return 'Expired';
  const hours = Math.floor(diff / HOUR_MS);
  const minutes = Math.floor((diff % HOUR_MS) / MINUTE_MS);
  return `${plural(hours, 'hour')} ${plural(minutes, 'minute')}`;
}

/** Local hour label for a bucket whose `hour` is a UTC `YYYY-MM-DDTHH:00:00Z` string. */
export function formatHourLabel(utcHourString) {
  const date = new Date(utcHourString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric' });
}
