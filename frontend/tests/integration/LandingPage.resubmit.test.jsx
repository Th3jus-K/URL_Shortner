import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App.jsx';

const link = (code, reused = false) => ({
  short_code: code,
  short_url: `http://localhost:9010/r/${code}`,
  original_url: 'https://example.com/article',
  created_at: '2026-10-12T10:00:00Z',
  expires_at: '2099-10-13T10:00:00Z',
  reused,
});

const ok = (status, body) => Promise.resolve({ ok: true, status, json: () => Promise.resolve(body) });
const fail = (status, body) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(body) });

function setup(responses) {
  const queue = [...responses];
  vi.stubGlobal('fetch', vi.fn(() => queue.shift()()));
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
  const input = () => screen.getByRole('textbox', { name: /url/i });
  const submit = async (text) => {
    await user.clear(input());
    await user.type(input(), text);
    await user.click(screen.getByRole('button', { name: /shorten url/i }));
  };
  return { user, input, submit };
}

describe('LandingPage resubmission', () => {
  it('stays usable after success, 422, network failure, 500 and a reused result', async () => {
    const { input, submit } = setup([
      () => ok(201, link('AAAAAAA')),
      () => fail(422, { detail: 'url must be a valid http or https URL' }),
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => fail(500, { detail: 'Internal server error' }),
      () => ok(200, link('AAAAAAA', true)),
    ]);

    await submit('https://example.com/article');
    expect(await screen.findByText('http://localhost:9010/r/AAAAAAA')).toBeInTheDocument();
    expect(input()).toBeEnabled();

    await submit('ftp://bad');
    expect(await screen.findByText('url must be a valid http or https URL')).toBeInTheDocument();
    expect(input()).toBeEnabled();

    await submit('https://example.com/article');
    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
    expect(input()).toBeEnabled();

    await submit('https://example.com/article');
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(input()).toBeEnabled();

    await submit('https://example.com/article');
    expect(await screen.findByText(/reused/i)).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(input()).toBeEnabled();
    expect(screen.getByRole('button', { name: /shorten url/i })).toBeEnabled();
  });

  it('clears stale results, errors and toasts when a new submission starts', async () => {
    let resolveSecond;
    const { user, submit } = setup([
      () => ok(201, link('AAAAAAA')),
      () => new Promise((r) => (resolveSecond = r)),
    ]);
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

    await submit('https://example.com/one');
    await screen.findByText('http://localhost:9010/r/AAAAAAA');
    await user.click(screen.getByRole('button', { name: /copy link/i }));
    expect(await screen.findByRole('status')).toBeInTheDocument();

    await submit('https://example.com/two');
    expect(screen.queryByText('http://localhost:9010/r/AAAAAAA')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    resolveSecond({ ok: true, status: 201, json: () => Promise.resolve(link('BBBBBBB')) });
    expect(await screen.findByText('http://localhost:9010/r/BBBBBBB')).toBeInTheDocument();
  });
});
