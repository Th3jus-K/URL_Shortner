import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App.jsx';

const buckets = Array.from({ length: 24 }, (_, i) => ({
  hour: new Date(Date.parse('2026-10-11T14:00:00Z') + i * 3_600_000).toISOString().replace('.000Z', 'Z'),
  clicks: i === 23 ? 3 : 0,
}));

const analytics = {
  short_code: 'Ab3xY9z',
  original_url: 'https://example.com/article',
  short_url: 'http://localhost:9010/r/Ab3xY9z',
  created_at: '2026-10-12T10:00:00Z',
  expires_at: '2026-10-13T10:00:00Z',
  total_clicks: 3,
  last_clicked_at: '2026-10-12T13:30:00Z',
  clicks_by_hour: buckets,
};

const jsonResponse = (status, body) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

function setup(fetchImpl) {
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal('fetch', fetchMock);
  render(
    <MemoryRouter initialEntries={['/stats/Ab3xY9z']}>
      <App />
    </MemoryRouter>,
  );
  return { fetchMock, user: userEvent.setup() };
}

describe('AnalyticsPage', () => {
  it('shows a loading state with Refresh disabled, then the loaded stats', async () => {
    let resolve;
    setup(() => new Promise((r) => (resolve = r)));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();

    resolve({ ok: true, status: 200, json: () => Promise.resolve(analytics) });
    expect(await screen.findByText('https://example.com/article')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeEnabled();
  });

  it('shows the short URL as plain text (not a link), the original URL, totals and times', async () => {
    setup(() => jsonResponse(200, analytics));
    expect(await screen.findByText('http://localhost:9010/r/Ab3xY9z')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /localhost:9010/ })).not.toBeInTheDocument();
    expect(screen.getByText('https://example.com/article')).toBeInTheDocument();
    expect(screen.getByTestId('total-clicks')).toHaveTextContent('3');
    expect(screen.getByTestId('created-at')).not.toBeEmptyDOMElement();
    expect(screen.getByTestId('expires-at')).not.toBeEmptyDOMElement();
    expect(screen.getByTestId('last-clicked-at')).not.toHaveTextContent('Never');
    expect(screen.getAllByTestId('chart-bar')).toHaveLength(24);
  });

  it('shows "Never" when the link has not been clicked', async () => {
    setup(() => jsonResponse(200, { ...analytics, total_clicks: 0, last_clicked_at: null }));
    await screen.findByTestId('total-clicks');
    expect(screen.getByTestId('last-clicked-at')).toHaveTextContent('Never');
  });

  it('shows the not-found state with a link back to /', async () => {
    setup(() => jsonResponse(404, { detail: 'Short URL not found' }));
    expect(await screen.findByText('Short link not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back|home|shorten/i })).toHaveAttribute('href', '/');
  });

  it('shows the expired state with a link back to /', async () => {
    setup(() => jsonResponse(410, { detail: 'This shortened URL has expired' }));
    expect(await screen.findByText('This shortened URL has expired')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back|home|shorten/i })).toHaveAttribute('href', '/');
  });

  it('shows a network error while Refresh stays available', async () => {
    setup(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeEnabled();
  });

  it('fetches exactly once on mount and never polls', async () => {
    const { fetchMock } = setup(() => jsonResponse(200, analytics));
    await screen.findByTestId('total-clicks');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/links/Ab3xY9z/analytics');

    vi.useFakeTimers();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches once more per Refresh click', async () => {
    let total = 3;
    const { fetchMock, user } = setup(() => jsonResponse(200, { ...analytics, total_clicks: total }));
    await screen.findByTestId('total-clicks');

    total = 5;
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(screen.getByTestId('total-clicks')).toHaveTextContent('5'));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});
