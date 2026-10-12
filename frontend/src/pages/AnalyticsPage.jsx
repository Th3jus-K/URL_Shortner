import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ClickChart from '../components/ClickChart.jsx';
import { getAnalytics } from '../services/api.js';
import { formatLocalDateTime } from '../utils/time.js';

export default function AnalyticsPage() {
  const { shortCode } = useParams();
  const [state, setState] = useState({ status: 'loading', data: null });
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setState({ status: 'loading', data: null });
    let next;
    try {
      const { data } = await getAnalytics(shortCode);
      next = { status: 'loaded', data };
    } catch (e) {
      const status = e.kind === 'notFound' ? 'notFound' : e.kind === 'expired' ? 'expired' : 'error';
      next = { status, data: null };
    }
    if (requestId === latestRequest.current) setState(next);
  }, [shortCode]);

  // Once on mount (and when the code changes); afterwards only via the Refresh button. No polling.
  useEffect(() => {
    load();
    return () => {
      latestRequest.current++;
    };
  }, [load]);

  const { status, data } = state;
  const loading = status === 'loading';

  return (
    <main className="page">
      <h1>Link analytics</h1>

      <div className="toolbar">
        {status !== 'notFound' && status !== 'expired' ? <Link to="/">Shorten another URL</Link> : <span />}
        <button type="button" className="secondary" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading && <p className="loading">Loading analytics…</p>}

      {status === 'notFound' && (
        <section className="state-card">
          <h2>Short link not found</h2>
          <p>We could not find a link for this code.</p>
          <Link to="/">Back to the URL shortener</Link>
        </section>
      )}

      {status === 'expired' && (
        <section className="state-card">
          <h2>This shortened URL has expired</h2>
          <p>Expired links no longer redirect or show analytics.</p>
          <Link to="/">Back to the URL shortener</Link>
        </section>
      )}

      {status === 'error' && (
        <p className="inline-error" role="alert">
          Could not reach the server. Press Refresh to try again.
        </p>
      )}

      {status === 'loaded' && data && (
        <>
          <dl className="stats">
            <div>
              <dt>Short URL</dt>
              <dd>{data.short_url}</dd>
            </div>
            <div>
              <dt>Original URL</dt>
              <dd>{data.original_url}</dd>
            </div>
            <div>
              <dt>Total clicks</dt>
              <dd data-testid="total-clicks">{data.total_clicks}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd data-testid="created-at">{formatLocalDateTime(data.created_at)}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd data-testid="expires-at">{formatLocalDateTime(data.expires_at)}</dd>
            </div>
            <div>
              <dt>Last clicked</dt>
              <dd data-testid="last-clicked-at">
                {data.last_clicked_at ? formatLocalDateTime(data.last_clicked_at) : 'Never'}
              </dd>
            </div>
          </dl>

          <h2>Clicks in the last 24 hours</h2>
          <ClickChart data={data.clicks_by_hour} />
        </>
      )}
    </main>
  );
}
