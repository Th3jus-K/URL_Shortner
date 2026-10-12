# Quickstart: Validate the URL Shortener

A run-and-verify guide. It contains no implementation code; implementation tasks are in `tasks.md`.
Payloads and routes: [contracts/openapi.yaml](contracts/openapi.yaml), [contracts/frontend-routes.md](contracts/frontend-routes.md).
Schema: [data-model.md](data-model.md).

## Prerequisites

- Node.js 22+ and npm
- `curl` (and optionally `jq`)
- Ports 9011 and 9010 free

## Setup

```bash
# Backend
cd backend
cp .env.example .env        # PUBLIC_BASE_URL=http://localhost:9010, DATABASE_PATH=../data/shortener.db
npm install

# Frontend
cd ../frontend
npm install
```

## Run (two processes)

```bash
# Terminal 1
cd backend && npm run start:dev      # http://localhost:9010  (Swagger: /docs, health: /health)

# Terminal 2
cd frontend && npm run dev           # http://localhost:9011
```

Expected: `curl -s http://localhost:9010/health` returns `{"status":"ok"}`; `http://localhost:9010/docs` shows the API documentation.

## Automated checks

```bash
# Unit + integration (no servers needed; integration uses a temp SQLite file)
cd backend  && npm test                  # all backend tests
cd backend  && npm run test:unit         # unit only
cd backend  && npm run test:integration  # integration only (API, concurrency, persistence)
cd frontend && npm test                  # Vitest: unit + integration (stubbed fetch)

# End-to-end (starts both servers itself on 9010/9011 with a throwaway database)
cd e2e && npm install && npx playwright install chromium   # first time only
cd e2e && npm test
```

Stop any running dev servers first: the e2e run needs ports 9011 and 9010 and refuses to reuse existing servers.

Expected: all pass. Together the layers must cover: 201/200/422 on shorten, 302/404/410 on redirect, 404/410 on analytics, TTL renewal never shortening expiry, new code after expiry, 50 concurrent identical submissions → one code and one row, 100 concurrent visits → `total_clicks` = 100, exactly 24 buckets, persistence across restart, and the 15-step flow below in a real browser (`e2e/tests/definition-of-done.spec.ts`).

## Manual end-to-end flow (Definition of Done, 15 steps)

The same flow is automated in the e2e suite; walk it by hand once to see it for yourself.

Use the browser at `http://localhost:9011` unless a `curl` is shown.

| # | Action | Expected result |
|---|---|---|
| 1 | Open `/` | Landing page with name, description, input, Shorten button |
| 2 | Submit `https://example.com/article` | Loading indicator, then result |
| 3 | Read result | Short URL `http://localhost:9010/r/<7 chars>`, "Expires in 23 hours 59 minutes"-style text, `reused` not indicated |
| 4 | Click **Copy Link** | Success toast; page does not reload; clipboard holds the short URL |
| 5 | Open the short URL (e.g. `curl -sI http://localhost:9010/r/<code>`) | `302` with `Location: https://example.com/article`; repeat 3 times |
| 6 | Click **View Analytics** | Browser goes to `http://localhost:9011/stats/<code>` (not `:9010`) |
| 7 | Read analytics | Total clicks = number of visits; created/expires/last-clicked in local time; 24 hourly bars with the current hour holding the visits |
| 8 | Back on `/`, submit the same URL again | Result shows the **same** code, "reused" note, later expiry (HTTP 200) |
| 9 | Compare expiry | New expiry ≈ now + 24 h; `created_at` unchanged |
| 10 | Open analytics, press **Refresh** | Same total clicks as before the resubmission (analytics preserved) |
| 11 | Force expiry (see below) | — |
| 12 | `curl -si http://localhost:9010/r/<code>` | `410` with body `{"detail":"This shortened URL has expired"}`; analytics page shows the expired message; click count unchanged |
| 13 | Submit the original URL again on `/` | `201`, `reused: false` |
| 14 | Compare codes | A **different** short code than step 3 |
| 15 | Open analytics for the new code | Total clicks 0, last clicked empty, all 24 buckets 0; old code still returns 410 |

### Forcing expiry (step 11)

The TTL is fixed at 24 hours, so expire a link by editing its row directly (validation only, no app change).
Run from `backend/` with the app stopped or running (WAL allows it), substituting the code:

```bash
node -e "const D=require('better-sqlite3');const d=new D(process.env.DATABASE_PATH||'../data/shortener.db');console.log(d.prepare(\"UPDATE links SET expires_at='2000-01-01T00:00:00Z' WHERE short_code=?\").run(process.argv[1]))" <code>
```

Expected: `{ changes: 1, ... }`.

## Error and edge-case spot checks

```bash
curl -si -X POST localhost:9010/api/shorten -H 'content-type: application/json' -d '{"url":""}'                  # 422
curl -si -X POST localhost:9010/api/shorten -H 'content-type: application/json' -d '{"url":"javascript:alert(1)"}' # 422
curl -si -X POST localhost:9010/api/shorten -H 'content-type: application/json' -d '{"url":"ftp://example.com/x"}' # 422
curl -si localhost:9010/r/ZZZZZZZ                  # 404 unknown code
curl -si localhost:9010/r/bad                      # 404 malformed code
curl -si localhost:9010/api/links/ZZZZZZZ/analytics # 404
```

Also verify: a URL of 2048 characters is accepted and 2049 rejected; whitespace around a URL is trimmed
and matches an existing active link; `?a=1&b=2` and `?b=2&a=1` produce different codes; stopping and
restarting the backend keeps all links and counts.

## Responsive check

In browser dev tools, view `/` and `/stats/<code>` at ~375 px (phone) and ~1280 px (desktop): no horizontal
scrolling, controls remain usable (SC-011).

## Measured (2026-10-12, local, Node 26.5)

`curl -w '%{time_total}'` against the running backend, 5 requests each after the first (SQLite file, WAL):

| Operation | Target | Measured (first / typical) |
|---|---|---|
| `POST /api/shorten` (new / renewal) | < 500 ms | 33 ms / 2.5 ms |
| `GET /r/<code>` (302 + click recorded) | < 200 ms | 5.8 ms / 2.2 ms |
| `GET /api/links/<code>/analytics` | < 500 ms | 2.4 ms / 1.7 ms |

All three are far inside the targets.

## Done when

All automated tests (unit, integration, end-to-end) pass, the 15-step table passes, and the spot checks return the listed statuses.
