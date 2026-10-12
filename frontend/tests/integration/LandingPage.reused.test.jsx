import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App.jsx';

const base = {
  short_code: 'Ab3xY9z',
  short_url: 'http://localhost:9010/r/Ab3xY9z',
  original_url: 'https://example.com/article',
  created_at: '2026-10-12T10:00:00Z',
  expires_at: '2099-10-13T18:00:00Z',
};

async function submitWith(status, body) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status, json: () => Promise.resolve(body) })),
  );
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
  await user.type(screen.getByRole('textbox', { name: /url/i }), 'https://example.com/article');
  await user.click(screen.getByRole('button', { name: /shorten url/i }));
}

describe('LandingPage reused links', () => {
  it('shows the reuse note and the renewed expiry for HTTP 200 / reused:true', async () => {
    await submitWith(200, { ...base, reused: true });
    expect(await screen.findByText(base.short_url)).toBeInTheDocument();
    expect(screen.getByText(/existing link was reused and its expiry renewed/i)).toBeInTheDocument();
    expect(screen.getByText(/expires in/i)).toBeInTheDocument();
    expect(screen.getByText(/expires at/i)).toBeInTheDocument();
  });

  it('shows no reuse note for HTTP 201', async () => {
    await submitWith(201, { ...base, reused: false });
    expect(await screen.findByText(base.short_url)).toBeInTheDocument();
    expect(screen.queryByText(/reused/i)).not.toBeInTheDocument();
  });
});
