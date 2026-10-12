import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import Toast from '../components/Toast.jsx';
import { shortenUrl } from '../services/api.js';
import { formatExpiresIn, formatLocalDateTime } from '../utils/time.js';

function errorMessage(error) {
  switch (error.kind) {
    case 'invalid':
      return error.detail || 'That does not look like a valid URL.';
    case 'network':
      return 'Could not reach the server. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function LandingPage() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const dismissToast = useCallback(() => setToast(null), []);

  async function handleSubmit(event) {
    event.preventDefault();

    // Every new submission starts from a clean slate.
    setToast(null);
    setResult(null);
    setError('');

    if (url.trim() === '') {
      setStatus('error');
      setError('Please enter a URL');
      return;
    }

    setStatus('loading');
    try {
      const { data } = await shortenUrl(url.trim());
      setResult({ ...data, nowMs: Date.now() });
      setStatus('success');
    } catch (e) {
      setError(errorMessage(e));
      setStatus('error');
    }
  }

  async function handleCopy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(result.short_url);
      setToast({ message: 'Link copied to clipboard', variant: 'success', id: Date.now() });
    } catch {
      setToast({ message: 'Could not copy the link. Select it and copy manually.', variant: 'error', id: Date.now() });
    }
  }

  const loading = status === 'loading';

  return (
    <main className="page">
      <h1>URL Shortener with Analytics</h1>
      <p className="muted">Paste a long link to get a short one you can share, then see how often it is used.</p>

      <form className="shorten-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="url-input" className="visually-hidden">
          URL to shorten
        </label>
        <div className="form-row">
          <input
            id="url-input"
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="https://example.com/a/very/long/link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" disabled={loading}>
            Shorten URL
          </button>
        </div>
        {loading && <p className="loading">Shortening…</p>}
        {status === 'error' && error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>

      {status === 'success' && result && (
        <section className="result-card" aria-label="Shortened link">
          <h2>Your short link</h2>
          <p className="short-url">{result.short_url}</p>
          {result.reused && (
            <p className="note">
              This URL already had an active link, so the existing link was reused and its expiry renewed.
            </p>
          )}
          <p>
            Expires in {formatExpiresIn(result.expires_at, result.nowMs)}
            <span className="muted"> · Expires at {formatLocalDateTime(result.expires_at)}</span>
          </p>
          <div className="actions">
            <button type="button" className="secondary" onClick={handleCopy}>
              Copy Link
            </button>
            <Link className="button secondary" to={`/stats/${result.short_code}`}>
              View Analytics
            </Link>
          </div>
        </section>
      )}

      {toast && <Toast key={toast.id} message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </main>
  );
}
