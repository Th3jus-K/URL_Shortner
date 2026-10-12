import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App.jsx';

const created = {
  short_code: 'Ab3xY9z',
  short_url: 'http://localhost:9010/r/Ab3xY9z',
  original_url: 'https://example.com/article',
  created_at: '2026-10-12T10:00:00Z',
  expires_at: '2099-10-13T10:00:00Z',
  reused: false,
};

const jsonResponse = (status, body) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

function setup(fetchImpl) {
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
  return { user, fetchMock };
}

const input = () => screen.getByRole('textbox', { name: /url/i });
const submit = (user) => user.click(screen.getByRole('button', { name: /shorten url/i }));

describe('LandingPage', () => {
  it('shows the app name, description, input and button', () => {
    setup(() => jsonResponse(201, created));
    expect(screen.getByRole('heading', { name: /url shortener/i })).toBeInTheDocument();
    expect(screen.getByText(/shorten|share/i, { selector: 'p' })).toBeInTheDocument();
    expect(input()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /shorten url/i })).toBeInTheDocument();
  });

  it('rejects empty and whitespace input without sending a request', async () => {
    const { user, fetchMock } = setup(() => jsonResponse(201, created));
    await submit(user);
    expect(screen.getByText('Please enter a URL')).toBeInTheDocument();
    await user.type(input(), '   ');
    await submit(user);
    expect(screen.getByText('Please enter a URL')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a loading indicator and disables the button while in flight', async () => {
    let resolve;
    const { user } = setup(() => new Promise((r) => (resolve = r)));
    await user.type(input(), 'https://example.com/article');
    await submit(user);
    expect(screen.getByRole('button', { name: /shorten url|shortening/i })).toBeDisabled();
    expect(screen.getByText(/shortening/i)).toBeInTheDocument();
    resolve({ ok: true, status: 201, json: () => Promise.resolve(created) });
    await screen.findByText(created.short_url);
    expect(screen.getByRole('button', { name: /shorten url/i })).toBeEnabled();
  });

  it('shows the result for a 201: short URL, expires-in text, absolute expiry, no reuse note', async () => {
    const { user, fetchMock } = setup(() => jsonResponse(201, created));
    await user.type(input(), '  https://example.com/article  ');
    await submit(user);
    expect(await screen.findByText(created.short_url)).toBeInTheDocument();
    expect(screen.getByText(/expires in/i)).toBeInTheDocument();
    expect(screen.getByText(/expires at/i)).toBeInTheDocument();
    expect(screen.queryByText(/already|renewed|reused/i)).not.toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ url: 'https://example.com/article' });
  });

  it('shows the server detail for a 422 and clears the previous result', async () => {
    let call = 0;
    const { user } = setup(() =>
      ++call === 1 ? jsonResponse(201, created) : jsonResponse(422, { detail: 'url must be a valid http or https URL' }),
    );
    await user.type(input(), 'https://example.com/article');
    await submit(user);
    await screen.findByText(created.short_url);
    await user.clear(input());
    await user.type(input(), 'ftp://nope');
    await submit(user);
    expect(await screen.findByText('url must be a valid http or https URL')).toBeInTheDocument();
    expect(screen.queryByText(created.short_url)).not.toBeInTheDocument();
  });

  it('shows a network failure message and keeps the form usable', async () => {
    const { user } = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    await user.type(input(), 'https://example.com/article');
    await submit(user);
    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
    expect(input()).toBeEnabled();
    expect(screen.getByRole('button', { name: /shorten url/i })).toBeEnabled();
  });

  it('shows a generic inline error for a 500', async () => {
    const { user } = setup(() => jsonResponse(500, { detail: 'Internal server error' }));
    await user.type(input(), 'https://example.com/article');
    await submit(user);
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('copies the short URL and shows a success toast without reloading', async () => {
    const { user } = setup(() => jsonResponse(201, created));
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.type(input(), 'https://example.com/article');
    await submit(user);
    await screen.findByText(created.short_url);
    await user.click(screen.getByRole('button', { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(created.short_url);
    expect(await screen.findByRole('status')).toHaveTextContent(/copied/i);
    expect(screen.getByText(created.short_url)).toBeInTheDocument();
  });

  it('shows a failure toast when the clipboard rejects, keeping the URL visible', async () => {
    const { user } = setup(() => jsonResponse(201, created));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    await user.type(input(), 'https://example.com/article');
    await submit(user);
    await screen.findByText(created.short_url);
    await user.click(screen.getByRole('button', { name: /copy link/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/could not copy/i);
    expect(screen.getByText(created.short_url)).toBeInTheDocument();
  });

  it('shows a failure toast when the clipboard API is unavailable', async () => {
    const { user } = setup(() => jsonResponse(201, created));
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await user.type(input(), 'https://example.com/article');
    await submit(user);
    await screen.findByText(created.short_url);
    await user.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/could not copy/i));
  });

  it('View Analytics is a router link to /stats/<code>', async () => {
    const { user } = setup(() => jsonResponse(201, created));
    await user.type(input(), 'https://example.com/article');
    await submit(user);
    const link = await screen.findByRole('link', { name: /view analytics/i });
    expect(link).toHaveAttribute('href', '/stats/Ab3xY9z');
  });
});
