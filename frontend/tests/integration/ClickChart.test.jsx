import { render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import ClickChart from '../../src/components/ClickChart.jsx';

beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata';
});

function buckets(counts) {
  const start = Date.parse('2026-10-11T14:00:00Z');
  return counts.map((clicks, i) => ({
    hour: new Date(start + i * 3_600_000).toISOString().replace('.000Z', 'Z'),
    clicks,
  }));
}

describe('ClickChart', () => {
  it('renders exactly 24 bars with counts and local-hour labels', () => {
    const counts = Array.from({ length: 24 }, (_, i) => (i === 23 ? 7 : 0));
    render(<ClickChart data={buckets(counts)} />);
    const bars = screen.getAllByTestId('chart-bar');
    expect(bars).toHaveLength(24);
    expect(within(bars[23]).getByText('7')).toBeInTheDocument();
    // 14:00 UTC is 19:30 IST: the label is the local clock hour, never the UTC hour "2 PM".
    expect(within(bars[0]).getByTestId('bar-label').textContent).toMatch(/7/);
    expect(within(bars[0]).getByTestId('bar-label').textContent).not.toMatch(/^2\b/);
  });

  it('renders 24 zero bars for all-zero data', () => {
    render(<ClickChart data={buckets(Array(24).fill(0))} />);
    const bars = screen.getAllByTestId('chart-bar');
    expect(bars).toHaveLength(24);
    bars.forEach((bar) => {
      expect(within(bar).getByTestId('bar-count')).toHaveTextContent('0');
      expect(within(bar).getByTestId('bar-fill').style.height).toBe('0%');
    });
  });

  it('scales bar height to the maximum count', () => {
    const counts = Array(24).fill(0);
    counts[3] = 10;
    counts[4] = 5;
    render(<ClickChart data={buckets(counts)} />);
    const bars = screen.getAllByTestId('chart-bar');
    expect(within(bars[3]).getByTestId('bar-fill').style.height).toBe('100%');
    expect(within(bars[4]).getByTestId('bar-fill').style.height).toBe('50%');
    expect(within(bars[0]).getByTestId('bar-fill').style.height).toBe('0%');
  });
});
