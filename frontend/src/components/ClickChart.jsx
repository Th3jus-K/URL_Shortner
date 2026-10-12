import { formatHourLabel } from '../utils/time.js';

/** Plain CSS bar chart of the 24 hourly buckets; heights are relative to the busiest hour. */
export default function ClickChart({ data }) {
  const max = Math.max(0, ...data.map((b) => b.clicks));
  return (
    <ol className="chart" aria-label="Clicks per hour, last 24 hours">
      {data.map((bucket) => {
        const percent = max === 0 ? 0 : (bucket.clicks / max) * 100;
        return (
          <li key={bucket.hour} className="chart-bar" data-testid="chart-bar">
            <span className="bar-count" data-testid="bar-count">
              {bucket.clicks}
            </span>
            <span className="bar-track">
              <span className="bar-fill" data-testid="bar-fill" style={{ height: `${percent}%` }} />
            </span>
            <span className="bar-label" data-testid="bar-label">
              {formatHourLabel(bucket.hour)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
