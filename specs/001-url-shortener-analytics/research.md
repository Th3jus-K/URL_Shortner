# Phase 0 Research: URL Shortener with Analytics

The stack, endpoints, schema, ports and rules are fixed by the constitution and the root `plan.md`, so
there were no open stack choices. This document records the remaining technical decisions and the
clarifications they resolve.

## R1. Time source and timestamp format

- **Decision**: Inject a `Clock` provider (`now(): Date`). Each operation reads the clock once and reuses that value for every column it writes. Persist and return timestamps as UTC ISO-8601 with second precision, `YYYY-MM-DDTHH:mm:ssZ` (matches the examples in plan.md).
- **Rationale**: Fixed-width UTC strings sort lexicographically in chronological order, so `expires_at > ?` comparisons and `substr(clicked_at, 1, 13)` hour grouping work in plain SQL. One clock value per operation satisfies NFR-02 ("consistent timestamp"). An injectable clock lets tests prove expiry, renewal and "never shortens" without waiting 24 hours.
- **Alternatives considered**: Millisecond precision (rejected: diverges from the documented format, no benefit); epoch integers (rejected: constitution requires one consistent UTC string format shown in the API); `Date.now()` called inline (rejected: untestable, risks inconsistent timestamps within one operation).

## R2. Active/expired evaluation

- **Decision**: A link is active iff `expires_at > now` (expired iff `now >= expires_at`), evaluated in SQL/service using the single transaction timestamp.
- **Rationale**: Exactly matches FR-012 including the boundary instant.
- **Alternatives considered**: Computing expiry in application code after fetching all rows for a URL (rejected: extra data, more race surface).

## R3. Shorten transaction and renewal safety

- **Decision**: Use better-sqlite3's `db.transaction(fn).immediate()` (issues `BEGIN IMMEDIATE`). Inside: (1) `SELECT` the active row for the trimmed URL; (2) if found, `UPDATE links SET expires_at = MAX(expires_at, :newExpiry), last_submitted_at = :now WHERE id = :id AND expires_at > :now`; (3) otherwise generate a code and `INSERT`; (4) re-`SELECT` the row for the response. If the guarded UPDATE changes 0 rows, fall through to the insert path (the link expired between lookup and update).
- **Rationale**: `BEGIN IMMEDIATE` takes the write lock before the lookup, so concurrent submissions serialize and the second sees the first's row (NFR-01). `MAX(...)` plus the `expires_at > now` guard means a renewal can never shorten an expiry or revive an expired link (NFR-02). better-sqlite3 is synchronous, so the transaction body never yields to other requests in the same process; `busy_timeout` plus `IMMEDIATE` handles contention from other connections/processes.
- **Alternatives considered**: `INSERT ... ON CONFLICT` upsert (rejected: `original_url` must not be UNIQUE and history rows must remain); app-level mutex (rejected: does not protect against a second process and duplicates what SQLite provides); deferred `BEGIN` (rejected: read-then-write lock upgrade can fail with `SQLITE_BUSY`).

## R4. Short-code generation and collision handling

- **Decision**: 62-character alphabet `[A-Za-z0-9]`, 7 characters, each drawn with `crypto.randomInt(62)` (no modulo bias). Insert inside the shorten transaction; on a `SQLITE_CONSTRAINT_UNIQUE` error for `short_code`, generate a new code and retry (cap at 5 attempts, then fail with 500). Expired records stay in the table, so their codes can never be re-issued.
- **Rationale**: Meets FR-007; the UNIQUE index is the authoritative collision check, covering expired and active rows alike. A constraint failure on a single statement does not abort a SQLite transaction, so retrying in place is safe.
- **Alternatives considered**: `crypto.randomBytes` with `%` (rejected: bias); check-then-insert (rejected: redundant given the UNIQUE index); base62 of an auto-increment id (rejected: guessable, not "cryptographically secure source").
- **Note**: SQLite TEXT comparison is case-sensitive by default (BINARY collation), so `Ab3xY9z` and `ab3xy9z` are distinct codes, as intended.

## R5. Click recording

- **Decision**: One `db.transaction(...).immediate()`: `SELECT` link by code → if none return NOT_FOUND → if `now >= expires_at` return EXPIRED → `INSERT INTO click_events(link_id, clicked_at)` → `UPDATE links SET total_clicks = total_clicks + 1, last_clicked_at = :now WHERE id = :id`. Return the original URL; the controller issues the 302.
- **Rationale**: Atomic increment plus event insert in one transaction (NFR-03) with the expiry decision made against the same snapshot as the write. 404/410 paths perform no writes.
- **Alternatives considered**: Read outside the transaction then write (rejected: link could expire between steps); incrementing in application memory (rejected: loses counts across restarts/processes).

## R6. Redirect caching

- **Decision**: Respond `302` via Express `res.redirect` (which percent-encodes non-ASCII characters in `Location`) with `Cache-Control: no-store`.
- **Rationale**: Browsers must hit the server each visit or repeat visits would not be counted (FR-019). Express's 302 is not normally cached, but the header removes any ambiguity.
- **Alternatives considered**: 301 (rejected: permanent, cacheable, breaks counting and expiry).

## R7. URL validation (422)

- **Decision**: DTO field `url` with a `@Transform` that trims strings, then validators: required/non-empty string, `@MaxLength(2048)` (applied after trim), and a custom constraint that (a) matches `^https?://[^/?#\\]` case-insensitively on the raw string, (b) contains no whitespace or control characters (non-ASCII is allowed and stored verbatim), and (c) parses with WHATWG `new URL()` and requires `protocol` ∈ {`http:`, `https:`} and non-empty `hostname`. The stored value is the trimmed original string, **not** the parsed/normalized form. `ValidationPipe({ transform: true, whitelist: true, errorHttpStatusCode: 422 })` with an `exceptionFactory` returning an `UnprocessableEntityException` whose message is the first constraint message.
- **Rationale**: Rejects `javascript:`, `ftp:`, empty and hostless values (FR-006). The regex guard is needed because the WHATWG parser is lenient (`http:///path` parses with hostname `path`, `http:example.com` is accepted) and BR-06 forbids silently rewriting URLs. 2048 accepted / 2049 rejected after trimming (Edge Cases). Missing or non-string `url` also yields 422.
- **Alternatives considered**: `@IsUrl` from class-validator (rejected: accepts schemeless/other protocols by default and its options are harder to align with the exact rules); regex-only validation (rejected: error-prone for hostnames).
- **Known framework behaviour**: A syntactically malformed JSON body is rejected by Express's body parser with 400 before validation runs; this is outside the documented contract and is surfaced as `{"detail": "Malformed request body"}` by the exception filter.

## R8. Error body shape and no internal leakage

- **Decision**: A global exception filter maps `HttpException` to `{ "detail": "<message>" }` using the exception's status, and any other error to `500 { "detail": "Internal server error" }` after logging server-side. Redirect/analytics use `NotFoundException` ("Short URL not found") and `GoneException` ("This shortened URL has expired"). Swagger documents these responses.
- **Rationale**: Gives the required 410 body exactly and one consistent shape for every error (FR-017, FR-032); SQLite errors never reach clients.
- **Alternatives considered**: Nest's default `{statusCode, message, error}` (rejected: contradicts the 410 body contract); per-controller try/catch (rejected: duplicated and leak-prone).

## R9. Short-code format validation

- **Decision**: `^[A-Za-z0-9]{7}$` checked in the service/controller before any DB call; a non-matching code is treated as unknown (404) for both `/r/:code` and analytics.
- **Rationale**: FR-020 and the edge case "invalid format is rejected as not found without touching stored data".
- **Alternatives considered**: 400/422 for bad format (rejected: spec says not found).

## R10. SQLite connection management

- **Decision**: A single `better-sqlite3` connection opened in `DatabaseService` (creating the parent directory of `DATABASE_PATH` if needed), with `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`, schema created via `CREATE ... IF NOT EXISTS`. Closed in `onModuleDestroy`. Transaction functions are fully synchronous and never span an `await`.
- **Rationale**: better-sqlite3 is synchronous and single-threaded per process, so one connection cannot interleave statements from concurrent requests, which satisfies "do not share unsafe connection objects". WAL lets reads proceed during writes; the busy timeout covers other processes. No migration tool is needed for two tables.
- **Alternatives considered**: Connection per request (rejected: needless overhead, repeated pragma setup); worker threads (rejected: out of scope complexity).
- **Testing consequence**: Concurrency tests (SC-005/SC-006) fire many parallel HTTP requests at the Nest app, and additionally open a second connection to the same file to verify cross-connection serialization via `BEGIN IMMEDIATE` + busy timeout.

## R11. Analytics hourly buckets

- **Decision**: `windowStart = floor_to_hour(now) − 23h`. Query `SELECT substr(clicked_at, 1, 13) AS hour, COUNT(*) AS clicks FROM click_events WHERE link_id = ? AND clicked_at >= ? GROUP BY hour`, then build 24 ascending buckets `{hour: "YYYY-MM-DDTHH:00:00Z", clicks}` zero-filled in code. Served from `links` for totals and timestamps; the endpoint performs no writes.
- **Rationale**: Uses the `(link_id, clicked_at)` index, always yields exactly 24 buckets (FR-022), and total clicks come from `links.total_clicks`, which spans renewals because the same `link_id` is kept (FR-023).
- **Alternatives considered**: `strftime` in SQL (rejected: unnecessary given the fixed format); returning only non-empty hours as in the abbreviated plan example (rejected: contradicts the 24-bucket requirement).

## R12. Configuration

- **Decision**: Read `PUBLIC_BASE_URL` (default `http://localhost:9010`) and `DATABASE_PATH` (default `../data/shortener.db`, resolved relative to `backend/`) from `process.env`, with `backend/.env.example` documenting them; strip any trailing `/` from the base URL when building `${base}/r/${code}`. Port 9010 is fixed in `main.ts`. No config library is added.
- **Rationale**: Two settings do not justify `@nestjs/config`; fewer dependencies per constitution I.
- **Alternatives considered**: `@nestjs/config` (rejected: extra dependency for two variables).

## R13. Frontend approach

- **Decision**: Vite + React JSX + React Router (`/` and `/stats/:shortCode`). Local component state with a small `idle | loading | success | error` status per request. `services/api.js` wraps `fetch`, maps non-2xx JSON `{detail}` and thrown network errors to typed errors (`invalid`, `notFound`, `expired`, `network`, `unknown`). "View Analytics" uses a `<Link to={'/stats/' + code}>`, so the origin is always the frontend's. Dates use `Intl.DateTimeFormat`/`toLocaleString` in the browser's timezone. "Expires in" text is computed once from `expires_at` at render time (no intervals). Chart is a flex/CSS bar chart with 24 bars and visible counts. Copy uses `navigator.clipboard.writeText` with try/catch → toast; if the API is unavailable, the failure toast is shown and the short URL stays selectable. Responsive via a single-column CSS layout with media queries.
- **Rationale**: Meets FR-025–FR-030 with zero extra runtime dependencies.
- **Alternatives considered**: Charting library (rejected: constitution); `document.execCommand('copy')` fallback (rejected: deprecated; spec only requires graceful failure).

## R14. Test layers

- **Decision**: Three layers, each with a distinct job.
  - **Unit** (fast, no I/O beyond a temp DB where needed): backend Jest tests for the code generator, time helpers, URL validator and service rules with a fake `Clock`; frontend Vitest tests for `api.js` error mapping and time utilities.
  - **Integration**: backend Jest tests build the real Nest app via `Test.createTestingModule` (real `ValidationPipe`, filter, repository) on a **temp SQLite file** and drive it with Supertest. They cover the full API contract (201/200/422, 302/404/410, analytics 404/410, `/health`), `Cache-Control: no-store`, renewal and expiry with a fake clock, 50 concurrent identical shortens → one code/one row, 100 concurrent redirects → `total_clicks` = 100, a second connection to the same file contending for the write lock, data surviving closing and re-creating the app on the same file, and no partial rows after a forced failure. Frontend Vitest + React Testing Library/jsdom tests render the real router and pages with a stubbed `fetch` and assert every UI state in [contracts/frontend-routes.md](contracts/frontend-routes.md) (empty, invalid, loading, new, reused, network failure, 500, not found, expired, copy success/failure, refresh without polling).
  - **End-to-end**: Playwright against the real running system — see R17.
- **Rationale**: Covers the constitution's mandated areas (NFR-01–03, TTL renewal, expiry/recreation, error statuses) at the cheapest layer that can prove each, and adds the owner-requested integration and end-to-end layers. Temp files rather than `:memory:` are used wherever WAL or multiple connections matter.
- **Alternatives considered**: Mocking the database (rejected: would not exercise transaction semantics); MSW for frontend integration (rejected: extra dependency; a `fetch` stub is enough); contract validation against `openapi.yaml` with a schema validator (rejected: new dependency; integration tests assert response shapes directly).

## R15. Expiry in manual / end-to-end validation

- **Decision**: Unit and integration tests expire links by advancing the fake clock. End-to-end tests (real processes, so no fake clock) and the manual 15-step flow force expiry by setting `expires_at` to a past timestamp directly in the SQLite file — in e2e through `e2e/support/db.ts`, manually through the one-line Node script in [quickstart.md](quickstart.md).
- **Rationale**: The TTL is fixed at 24 hours by the constitution, so no TTL override setting is introduced; direct DB edit is a test-only action that adds no product code.
- **Alternatives considered**: Env-configurable TTL (rejected: new configuration surface contradicting "fixed 24 h"); an admin/debug endpoint (rejected: unauthenticated write endpoint, security risk).

## R16. Tooling notes

- better-sqlite3 is a native module; Node 22 prebuilt binaries are normally downloaded on install, otherwise a C/C++ toolchain and Python are needed.
- Swagger is configured with `SwaggerModule.setup('docs', app, document)`; API versions of NestJS/Swagger are pinned to the latest compatible majors at install time.
- `.gitignore` gains `data/`, `node_modules/`, `e2e/.tmp/`, `e2e/test-results/` and `e2e/playwright-report/`.

## R17. End-to-end tests (Playwright)

- **Decision**: A separate dev-only package `e2e/` using `@playwright/test` with Chromium. `playwright.config.ts` uses `webServer` to start the NestJS backend (`PORT` 9010, `DATABASE_PATH=e2e/.tmp/e2e.db`, `PUBLIC_BASE_URL=http://localhost:9010`) and the Vite dev server (9011, proxy to 9010) and waits on `/health` and `/`; `reuseExistingServer` is false so tests never run against a developer's own data. `reset-db.js`, run by the backend webServer command before the server starts (a globalSetup would run after the servers, too late), deletes the e2e database (and its `-wal`/`-shm` files) first. Two projects: desktop (1280×800) and mobile (375×667). Specs:
  - `definition-of-done.spec.ts` — the 15 steps of plan.md §18 in one serial test: shorten, copy, visit the short URL (via Playwright's request API, asserting 302 and `Location` without following), open analytics via **View Analytics** and assert the URL is on `localhost:9011`, resubmit → same code and `reused` note, analytics preserved after Refresh, force expiry via `support/db.ts`, assert 410 and the expired page, resubmit → different code, zero clicks, old code still 410.
  - `validation-and-errors.spec.ts` — empty, `javascript:`, `ftp:`, hostless and 2049-character input show inline errors and create no row; unknown code and expired code on the analytics page; network failure by aborting the `/api/shorten` route.
  - `copy.spec.ts` — clipboard-read/write granted: success toast and clipboard content equals the short URL without a reload; clipboard denied: failure toast and the URL stays selectable.
  - `analytics.spec.ts` — exactly 24 bars, current-hour bar holds recent clicks, Refresh updates counts with no background requests between refreshes, times rendered in the browser context's `timezoneId` (set to a non-UTC zone), never-clicked link shows zero/none.
  - `responsive.spec.ts` — both pages have no horizontal overflow at 375 px and 1280 px and key controls are visible and usable.
- **Rationale**: Only a real browser can verify clipboard behaviour, browser-local timezone display, the frontend (9011) vs backend (9010) origins of links and routes, the Vite proxy, and responsive layout (SC-010, SC-011, FR-026, FR-029, FR-030). A throwaway DB plus direct row edits makes expiry deterministic without product changes.
- **Alternatives considered**: Cypress (rejected: heavier, no added capability); Vitest/jsdom only (rejected: cannot check clipboard, timezone, layout or real proxying); a backend-only script for the 15 steps (rejected: skips the UI half of the Definition of Done).
- **Notes**: Tests in `definition-of-done.spec.ts` are `serial`; other specs use unique URLs per test so they can share one database. Ports 9011 and 9010 must be free. Browsers are installed once with `npx playwright install chromium`. Playwright is a dev-only dependency documented in the plan's Complexity Tracking; the runtime stack is unchanged.

**Result**: All Technical Context fields are resolved; no `NEEDS CLARIFICATION` remain.
