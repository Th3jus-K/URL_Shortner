---

description: "Task list for URL Shortener with Analytics"
---

# Tasks: URL Shortener with Analytics

**Input**: Design documents from `/specs/001-url-shortener-analytics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, contracts/frontend-routes.md, quickstart.md; project constitution at `.specify/memory/constitution.md`

**Tests**: INCLUDED. The constitution mandates automated tests for concurrency (NFR-01–03), TTL renewal, expiry/recreation and error statuses, and SC-012 requires unit + integration + browser end-to-end layers. Within each story, test tasks come first and MUST fail before the implementation tasks are done.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md (Setup, Foundational and Polish tasks carry no story label)
- Every task names the exact file(s) it creates or edits

## Path Conventions

Web application with three sibling packages at the repository root (see plan.md "Project Structure"):
`backend/` (NestJS + TypeScript), `frontend/` (Vite + React JSX), `e2e/` (Playwright, dev-only).
Runtime data lives in `data/` (git-ignored). Backend tests: `backend/test/unit`, `backend/test/integration`.
Frontend tests: `frontend/tests/unit`, `frontend/tests/integration`. E2E specs: `e2e/tests`.

**Cross-cutting rules every task must honour** (constitution): fixed stack only, no ORM, no state library, no chart library;
parameterized SQL only; no IPs/headers/PII stored or read; timestamps are UTC `YYYY-MM-DDTHH:mm:ssZ`; error bodies are
`{"detail": "<message>"}` with no internals; validation failures are HTTP **422** (not 400).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and tooling for the three packages

- [X] T001 Create `backend/package.json`, `backend/tsconfig.json` and `backend/nest-cli.json`: Node 22+, deps `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/swagger`, `class-validator`, `class-transformer`, `better-sqlite3`, `reflect-metadata`, `rxjs`; dev deps `typescript`, `@nestjs/cli`, `@nestjs/testing`, `jest`, `ts-jest`, `supertest`, `@types/*`; scripts `start:dev` (port 9010), `build`, `test`, `test:unit`, `test:integration`; `start:dev`/`start` load `backend/.env` through Node's built-in `--env-file-if-exists=.env` flag (e.g. `nest start --watch --exec "node --env-file-if-exists=.env"`) so copying `.env.example` to `.env` actually takes effect, with no dotenv dependency. No ORM, no `@nestjs/config`.
- [X] T002 [P] Create Jest configuration for `backend/` in `backend/jest.config.ts` (ts-jest; two projects/roots: `test/unit` and `test/integration`; integration timeout ≥ 30 s so the concurrency tests fit)
- [X] T003 [P] Create `frontend/package.json`, `frontend/index.html` and `frontend/vite.config.js`: deps `react`, `react-dom`, `react-router-dom`; dev deps `vite`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`; dev server port **9011** with proxy `/api` → `http://localhost:9010`; scripts `dev`, `build`, `test`. No state library, no chart library.
- [X] T004 [P] Create Vitest config `frontend/vitest.config.js` (jsdom environment, setup file) and `frontend/tests/setup.js` (jest-dom matchers, cleanup, `fetch` stub reset between tests)
- [X] T005 [P] Create `e2e/package.json` and `e2e/tsconfig.json`: dev-only deps `@playwright/test`, `better-sqlite3`, `typescript`, `@types/node`, `@types/better-sqlite3`; script `test` = `playwright test`; document `npx playwright install chromium` in a comment/script `postinstall` note
- [X] T006 [P] Create `backend/.env.example` (`PUBLIC_BASE_URL=http://localhost:9010`, `DATABASE_PATH=../data/shortener.db`) and add `data/`, `node_modules/`, `dist/`, `e2e/.tmp/`, `e2e/test-results/`, `e2e/playwright-report/` to the repo-root `.gitignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend platform, frontend shell and e2e harness that EVERY user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Backend platform

- [X] T007 [P] Implement `backend/src/config/app-config.ts`: read `PUBLIC_BASE_URL` (default `http://localhost:9010`, strip trailing `/`) and `DATABASE_PATH` (default `../data/shortener.db`, resolved relative to `backend/`) from `process.env` **at call time, never cached at import time** (so each test app can set its own `DATABASE_PATH`/`PUBLIC_BASE_URL`); an absolute `DATABASE_PATH` is used as-is; export a `buildShortUrl(code)` helper returning `${base}/r/${code}`
- [X] T008 [P] Implement `backend/src/common/clock.ts`: `Clock` interface `{ now(): Date }`, injection token `CLOCK`, `SystemClock`, and a `FakeClock` (settable/advanceable) exported for tests
- [X] T009 [P] Implement `backend/src/common/time.ts`: `toUtcString(date)` → `YYYY-MM-DDTHH:mm:ssZ` (second precision, no millis), `addHours(date, n)`, `floorToHour(date)`
- [X] T010 [P] Implement `backend/src/common/short-code.ts`: `SHORT_CODE_PATTERN = /^[A-Za-z0-9]{7}$/`, `generateShortCode()` using alphabet `A-Za-z0-9` (62 chars) and `crypto.randomInt(62)` per character (no modulo bias), and `CODE_GENERATOR` injection token
- [X] T011 [P] Implement `backend/src/common/http-exception.filter.ts`: global filter mapping any `HttpException` to `{ "detail": "<message>" }` with its status; any other error → log server-side, respond `500 { "detail": "Internal server error" }`; malformed JSON body (Express body-parser 400) → `{ "detail": "Malformed request body" }`
- [X] T012 [P] Unit test `backend/test/unit/time.spec.ts`: `toUtcString` format has no milliseconds and ends in `Z`; `addHours` crosses day boundary; `floorToHour` zeroes minutes/seconds; string order equals chronological order
- [X] T013 [P] Unit test `backend/test/unit/short-code.spec.ts`: 7 chars, all in `[A-Za-z0-9]`, 10 000 generated codes match `SHORT_CODE_PATTERN`, pattern rejects length 6/8, non-alphanumerics and `ab-defg`
- [X] T014 Implement `backend/src/database/schema.ts` exporting the DDL **verbatim** from data-model.md: `links` (`id INTEGER PRIMARY KEY`, `original_url TEXT NOT NULL`, `short_code TEXT NOT NULL UNIQUE`, `created_at TEXT NOT NULL`, `last_submitted_at TEXT NOT NULL`, `expires_at TEXT NOT NULL`, `total_clicks INTEGER NOT NULL DEFAULT 0`, `last_clicked_at TEXT` nullable; NO unique constraint on `original_url`), `click_events` (`id INTEGER PRIMARY KEY`, `link_id INTEGER NOT NULL REFERENCES links(id)`, `clicked_at TEXT NOT NULL`), and indexes `idx_links_original_url_expires (original_url, expires_at)` and `idx_click_events_link_clicked (link_id, clicked_at)`, all with `IF NOT EXISTS`
- [X] T015 Implement `backend/src/database/database.service.ts` and `backend/src/database/database.module.ts` (global): open one `better-sqlite3` connection at the configured path (create the parent directory if missing), apply `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`, run the schema DDL, expose the connection, close it in `onModuleDestroy`. Depends on T007, T014.
- [X] T016 Implement `backend/src/common/common.module.ts` (global) providing `CLOCK` → `SystemClock` and `CODE_GENERATOR` → `generateShortCode` so tests can override both. Depends on T008, T010.
- [X] T017 [P] Implement `backend/src/health/health.controller.ts`: `GET /health` → `200 {"status":"ok"}` with Swagger decorators
- [X] T018 Implement `backend/src/app.module.ts` importing `CommonModule`, `DatabaseModule` and the health controller (feature modules are added by story tasks). Depends on T015, T016, T017.
- [X] T019 Implement `backend/src/app.setup.ts` exporting `configureApp(app)` used by both `main.ts` and tests: global `ValidationPipe({ transform: true, whitelist: true, errorHttpStatusCode: 422, exceptionFactory })` where `exceptionFactory` returns `UnprocessableEntityException` carrying the first constraint message; global exception filter (T011); Swagger via `SwaggerModule.setup('docs', app, document)`; `app.enableShutdownHooks()`. Depends on T011.
- [X] T020 Implement `backend/src/main.ts`: create the Nest app from `AppModule`, call `configureApp`, listen on **port 9010**. Depends on T018, T019.
- [X] T021 Create backend test harness `backend/test/support/test-app.ts`: `createTestApp({ clock?, codeGenerator?, overrides? })` builds the real `AppModule` via `Test.createTestingModule` with overrides for `CLOCK`/`CODE_GENERATOR` plus an optional `overrides` list of `{ provide, useValue | useClass }` so tests can inject failing providers (e.g. a `LinksRepository` subclass that throws after `insertClickEvent`), a fresh temp SQLite file (`DATABASE_PATH` per app), calls `configureApp`, returns `{ app, http (supertest), dbPath, close() }`; plus `openSecondConnection(dbPath)` (for read assertions), `spawnContender(dbPath, { holdMs, sql? })` — a **child process** (`node:child_process`) with its own better-sqlite3 connection that runs `BEGIN IMMEDIATE`, holds the write lock for `holdMs`, optionally writes, then commits (a second connection in the same thread cannot truly contend because better-sqlite3 is synchronous) — and temp-file cleanup helpers. Depends on T018, T019.

### Frontend shell

- [X] T022 [P] Implement `frontend/src/utils/time.js`: `formatLocalDateTime(utcString)` using `Intl.DateTimeFormat`/`toLocaleString` in the browser timezone, `formatExpiresIn(expiresAtUtc, nowMs)` → "N hours M minutes" or "Expired" when non-positive (computed once, no timers), `formatHourLabel(utcHourString)` → local hour label
- [X] T023 [P] Implement `frontend/src/services/api.js`: `shortenUrl(url)` → `POST /api/shorten` and `getAnalytics(code)` → `GET /api/links/:code/analytics` using relative URLs and `fetch`; return parsed JSON plus HTTP status (so 201 vs 200 is observable); map failures to typed errors `invalid` (422, carries server `detail`), `notFound` (404), `expired` (410), `network` (fetch rejects or non-JSON proxy 5xx), `unknown` (500/other)
- [X] T024 [P] Implement `frontend/src/components/Toast.jsx`: accessible (`role="status"`) transient notification with `success`/`error` variants and auto-dismiss, controlled by props (no state library)
- [X] T025 [P] Create `frontend/src/styles.css`: responsive single-column layout base (CSS variables, form controls, buttons, inline error style, toast, `max-width` container, `overflow-x` safe at 375 px), media queries for ≥ 768 px; page-specific rules are appended by story tasks
- [X] T026 Implement `frontend/src/main.jsx` (React root, `BrowserRouter`, imports `styles.css`) and `frontend/src/App.jsx` with `<Routes>` containing only the catch-all "Page not found" view with a link back to `/` (story tasks register `/` and `/stats/:shortCode`)
- [X] T027 [P] Unit test `frontend/tests/unit/api.test.js`: stub `fetch`; 201 and 200 bodies returned with status; 422 → `invalid` with `detail`; 404 → `notFound`; 410 → `expired`; rejected fetch and non-JSON 502 → `network`; 500 → `unknown`
- [X] T028 [P] Unit test `frontend/tests/unit/time.test.js`: UTC string renders in the process timezone (set `TZ` to a non-UTC zone), `formatExpiresIn` for 23h59m, exactly 0 and negative values, hour label derived from the UTC hour

### End-to-end harness

- [X] T029 [P] Create `e2e/playwright.config.ts`: Chromium only; projects `desktop` (1280×800) and `mobile` (375×667); `webServer` entries start the backend (port 9010 (fixed in `main.ts`), `DATABASE_PATH=<repo>/e2e/.tmp/e2e.db`, `PUBLIC_BASE_URL=http://localhost:9010`) and the Vite dev server (9011), waiting on `http://localhost:9010/health` and `http://localhost:9011/`, with `reuseExistingServer: false`; `workers: 1` and `fullyParallel: false` because both projects share one throwaway database; the backend `webServer` command runs T030's `reset-db.js` before `npm run start` (Playwright starts webServers before `globalSetup`, so a globalSetup reset would delete a database the backend already has open); browser context `timezoneId` set to a non-UTC zone (e.g. `Asia/Kolkata`)
- [X] T030 [P] Create `e2e/reset-db.js`: delete `e2e/.tmp/e2e.db`, `e2e.db-wal` and `e2e.db-shm` before the run (create `e2e/.tmp/` if missing)
- [X] T031 [P] Create `e2e/support/db.ts`: test-only helpers using `better-sqlite3` on `e2e/.tmp/e2e.db`: `forceExpire(shortCode)` (sets `expires_at='2000-01-01T00:00:00Z'`), `getLink(shortCode)`, `countLinksForUrl(url)`, `countClickEvents(shortCode)`

**Checkpoint**: Foundation ready — backend boots on 9010 with `/health` and `/docs`, frontend boots on 9011 with the not-found route, test harnesses exist. User stories can now begin.

---

## Phase 3: User Story 1 - Shorten a URL and share it (Priority: P1) 🎯 MVP

**Goal**: A visitor pastes a URL on the landing page and gets a copyable 7-character short link with its expiration time; invalid input and network failures are handled clearly.

**Independent Test**: `POST /api/shorten` with a valid URL returns 201 with a 7-char code and `expires_at` = now + 24 h; in the browser the landing page shows the result, Copy puts it on the clipboard with a success toast, and invalid inputs show inline errors with no row created.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [X] T032 [P] [US1] Unit test `backend/test/unit/shorten-url.dto.spec.ts`: validates the DTO via `class-validator`/`class-transformer` — accepts `http://` and `https://` URLs, a URL of exactly 2048 characters and a non-ASCII URL such as `http://example.com/café` (value kept verbatim); trims surrounding whitespace; rejects empty, whitespace-only, missing and non-string `url`, a URL with an internal space (`http://example.com/a b`), a URL with an embedded `\r\n`, tab or other control character, `javascript:alert(1)`, `ftp://example.com/x`, `http:///path`, `http:example.com`, `https://`, and a 2049-character URL (after trim)
- [X] T033 [P] [US1] Unit test `backend/test/unit/links.service.shorten.spec.ts`: with `FakeClock` and a temp DB, `shorten` of a new URL creates one row with `created_at == last_submitted_at`, `expires_at = now + 24h`, `total_clicks = 0`, returns `reused: false`; stored `original_url` is the trimmed string verbatim; a `CODE_GENERATOR` stub that first returns an already-used code then a fresh one results in the fresh code (UNIQUE-collision retry); five consecutive collisions → error (surfaces as 500)
- [X] T034 [P] [US1] Integration test `backend/test/integration/shorten.integration.spec.ts` (real app via `createTestApp`, Supertest): 201 body matches `ShortenResponse` (`short_code` matches `^[A-Za-z0-9]{7}$`, `short_url` = `PUBLIC_BASE_URL/r/<code>`, UTC timestamps, `reused:false`); 422 for each invalid input case with body `{"detail": <string>}` and zero rows in `links`; 2048-char URL → 201, 2049 → 422; internal space / embedded line break → 422 with zero rows; `http://example.com/café` → 201 with `original_url` stored verbatim; whitespace-trimmed storage; response/stored `original_url` not normalized; malformed JSON body → `{"detail":"Malformed request body"}`; forced repository failure → 500 `{"detail":"Internal server error"}` with no SQL/stack text and no partial row; data persists after closing and re-creating the app on the same DB file; `GET /health` → `{"status":"ok"}`
- [X] T035 [P] [US1] Integration test `frontend/tests/integration/LandingPage.test.jsx` (RTL + real router, stubbed `fetch`): shows app name, description, input and **Shorten URL** button; empty/whitespace submit → "Please enter a URL" and no request sent; loading indicator and disabled button while in flight; 201 → short URL, "Expires in …" and absolute local expiry, no reuse note; 422 → inline server `detail` and previous result cleared; rejected fetch → "Could not reach the server…" and form still usable; 500 → generic inline error; **Copy Link** success → success toast, no reload; clipboard rejection/unavailable → failure toast with the URL still visible; **View Analytics** is a router link to `/stats/<code>`
- [X] T036 [P] [US1] E2E `e2e/tests/validation-and-errors.spec.ts`: in a real browser, empty, `javascript:`, `ftp:`, hostless and 2049-character inputs each show an inline error and leave zero rows (assert via `support/db.ts`); aborting the `/api/shorten` route shows the network-failure message and the form remains usable
- [X] T037 [P] [US1] E2E `e2e/tests/copy.spec.ts`: with clipboard read/write permission granted, Copy shows the success toast, clipboard text equals the displayed short URL and the page did not reload; with permission denied, the failure toast shows and the short URL remains visible and selectable

### Implementation for User Story 1

- [X] T038 [P] [US1] Implement `backend/src/links/dto/shorten-url.dto.ts`: field `url` with `@Transform` trimming strings; validators `required/non-empty string`, `@MaxLength(2048)` applied after trim, and a custom constraint that (a) matches `^https?://[^/?#\\]` case-insensitively on the raw string, (b) contains no whitespace or control characters (checked on the trimmed value with `/[\s\x00-\x1f\x7f]/`; non-ASCII characters are allowed), and (c) parses with WHATWG `new URL()` requiring `protocol` ∈ {`http:`,`https:`} and non-empty `hostname`; message `url must be a valid http or https URL`; the stored value stays the trimmed original string, never the parsed form; Swagger `@ApiProperty` per `ShortenRequest`
- [X] T039 [US1] Implement `backend/src/links/links.repository.ts` (parameterized `better-sqlite3` prepared statements only): `insertLink({originalUrl, shortCode, createdAt, lastSubmittedAt, expiresAt})` returning the new id and `findById(id)`; map rows to a typed `LinkRow`; later stories append more methods. Depends on T015.
- [X] T040 [US1] Implement `shorten` (new-link path) in `backend/src/links/links.service.ts`: inject `DatabaseService`, repository, `CLOCK`, `CODE_GENERATOR`; run inside `db.transaction(fn).immediate()` capturing `now` once; generate code, insert, on `SQLITE_CONSTRAINT_UNIQUE` for `short_code` regenerate and retry up to 5 attempts then throw; re-read the row by id and return `{short_code, short_url, original_url, created_at, expires_at, reused:false}` with timestamps via `toUtcString`; the transaction body never awaits. Depends on T039, T007, T008, T009, T010.
- [X] T041 [US1] Implement `backend/src/links/links.controller.ts`: `POST /api/shorten` taking `ShortenUrlDto`, returns HTTP **201** with the service result; Swagger decorators for 201/422/500 matching openapi.yaml. Depends on T038, T040.
- [X] T042 [US1] Implement `backend/src/links/links.module.ts` (controller, service, repository) and import it in `backend/src/app.module.ts`. Depends on T041.
- [X] T043 [US1] Implement `frontend/src/pages/LandingPage.jsx` per `contracts/frontend-routes.md`: app name, one-line description, URL input, **Shorten URL** button, `idle|loading|success|error` local state; empty-input check (no request) with "Please enter a URL"; loading indicator + disabled button; result area showing `short_url` exactly as returned, "Expires in …" (via `formatExpiresIn`) and absolute local expiry (via `formatLocalDateTime`); **Copy Link** using `navigator.clipboard.writeText` in try/catch → `Toast` success/failure without reload; **View Analytics** as `<Link to={'/stats/' + code}>`; inline errors for `invalid` (server `detail`, clears previous result), `network` ("Could not reach the server…") and `unknown`. Depends on T023, T022, T024.
- [X] T044 [US1] Register the `/` route for `LandingPage` in `frontend/src/App.jsx` and append landing-page styles (form row, result card, copy/analytics buttons) to `frontend/src/styles.css`, keeping no horizontal overflow at 375 px. Depends on T043.

**Checkpoint**: User Story 1 is fully functional and testable independently (MVP shorten + copy).

---

## Phase 4: User Story 2 - Visit a short link and be redirected (Priority: P1)

**Goal**: Opening a short link redirects (302) to the original URL and records exactly one click atomically; unknown/malformed → 404; expired → 410; nothing is recorded on failures; expiry is never extended.

**Independent Test**: Create a link, `curl -i /r/<code>` returns 302 with `Location` and `Cache-Control: no-store` and `total_clicks` becomes 1; 100 concurrent visits yield exactly 100.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [X] T045 [P] [US2] Integration test `backend/test/integration/redirect.integration.spec.ts` (real app, FakeClock): active link → 302 with `Location` = stored URL (for a non-ASCII URL such as `http://example.com/café`, its percent-encoded form with existing `%XX` sequences left intact) and `Cache-Control: no-store`, one `click_events` row and `total_clicks` 1, `last_clicked_at` equals the event's `clicked_at`; unknown code and malformed codes (`bad`, 8 chars, `abc-123`) → 404 `{"detail":"Short URL not found"}` with zero writes; expired link (including `now == expires_at` boundary) → 410 `{"detail":"This shortened URL has expired"}`, no redirect, no click; repeat visits each add a click; redirect does not change `expires_at`; **100 concurrent GETs** on one link → `total_clicks == 100` and exactly 100 `click_events` rows (SC-006); a **contender child process** (`spawnContender`, holding `BEGIN IMMEDIATE` for ~300 ms) while redirects are issued: requests wait on the busy timeout, none fail, and counts are exact afterwards (this, not the in-process 100-GET burst alone, is what proves busy timeout + `BEGIN IMMEDIATE`, because better-sqlite3 is synchronous); forced failure after the event insert rolls back both writes (no orphan event, count unchanged); `click_events` has only `id`, `link_id`, `clicked_at` columns (no PII)
- [X] T046 [P] [US2] Unit test `backend/test/unit/links.service.click.spec.ts`: `recordClick` with `FakeClock` returns `{status:'ok', originalUrl}`, `{status:'not_found'}` for unknown/malformed codes **without touching the DB** (spy on repository), `{status:'expired'}` at `now >= expires_at`; `last_clicked_at` uses the same single `now` as the event

### Implementation for User Story 2

- [X] T047 [US2] Extend `backend/src/links/links.repository.ts` with `findByCode(code)`, `insertClickEvent(linkId, clickedAt)` and `incrementClicks(linkId, now)` (`UPDATE links SET total_clicks = total_clicks + 1, last_clicked_at = :now WHERE id = :id`), all parameterized. Depends on T039.
- [X] T048 [US2] Implement `recordClick(code)` in `backend/src/links/links.service.ts`: if `!SHORT_CODE_PATTERN.test(code)` return `not_found` before any DB access; otherwise one `db.transaction(...).immediate()` with a single `now`: find by code → `not_found`; `now >= expires_at` → `expired` (no writes); insert event + atomic increment; return the original URL. Depends on T047, T040.
- [X] T049 [US2] Implement `backend/src/links/redirect.controller.ts`: `GET /r/:code` → on `ok` respond **302** via Express `res.redirect(302, url)` (encodeurl semantics: non-ASCII characters are percent-encoded and existing `%XX` left untouched, so setting the header cannot throw for a validated URL) with `Cache-Control: no-store`; `not_found` → `NotFoundException("Short URL not found")`; `expired` → `GoneException("This shortened URL has expired")`; Swagger decorators for 302/404/410/500. Register in `backend/src/links/links.module.ts`. Depends on T048, T042.

**Checkpoint**: User Stories 1 and 2 both work independently (shorten → visit → click counted).

---

## Phase 5: User Story 3 - View link analytics (Priority: P2)

**Goal**: Anyone with a short code sees original/short URL, total clicks, created/expires/last-clicked (local time) and an exactly-24-bucket hourly chart at `/stats/:shortCode`, with manual Refresh and no polling; unknown → not-found state, expired → expired state; analytics never extend expiry.

**Independent Test**: Create a link, click it N times, `GET /api/links/<code>/analytics` returns `total_clicks == N` and 24 ascending zero-filled buckets; the page `/stats/<code>` renders the same and Refresh reloads.

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [X] T050 [P] [US3] Unit test `backend/test/unit/analytics-buckets.spec.ts`: bucket builder given `now` returns exactly 24 ascending entries from `floorToHour(now) − 23h` to `floorToHour(now)` formatted `YYYY-MM-DDTHH:00:00Z`, zero-filled, correct across a day/month boundary; clicks older than the window are excluded
- [X] T051 [P] [US3] Integration test `backend/test/integration/analytics.integration.spec.ts` (real app, FakeClock): response shape matches `AnalyticsResponse`; `clicks_by_hour` always has exactly 24 entries; clicks spread over several hours land in the right buckets and the sum of buckets ≤ `total_clicks`; never-clicked link → `total_clicks 0`, `last_clicked_at null`, all buckets 0; unknown and malformed codes → 404, expired → 410 with exact detail bodies; analytics requests never change `expires_at` and perform no writes; `total_clicks` includes clicks before a renewal (same `link_id`)
- [X] T052 [P] [US3] Integration test `frontend/tests/integration/AnalyticsPage.test.jsx` (RTL + real router at `/stats/Ab3xY9z`, stubbed `fetch`): loading state with Refresh disabled; loaded state shows short URL (as text, not a backend link), original URL, total clicks, created/expires/last-clicked in local time, "Never" when null; 404 → "Short link not found" with link to `/`; 410 → "This shortened URL has expired" with link to `/`; network failure → error with Refresh still available; exactly one fetch on mount and exactly one more per Refresh click (no timers/polling, use fake timers to assert)
- [X] T053 [P] [US3] Integration test `frontend/tests/integration/ClickChart.test.jsx`: renders exactly 24 bars with visible per-bar counts and local-hour labels derived from UTC `hour`; all-zero data renders 24 zero bars; bar height scales to the max count
- [X] T054 [P] [US3] E2E `e2e/tests/analytics.spec.ts`: after creating a link and visiting it via the request API, the analytics page shows exactly 24 bars with the current hour holding the clicks; Refresh updates counts after more visits and no background requests occur between refreshes; times render in the browser context's non-UTC `timezoneId`; a never-clicked link shows 0 and "Never"; unknown code and (via `support/db.ts` `forceExpire`) expired code show their messages

### Implementation for User Story 3

- [X] T055 [US3] Add `buildHourBuckets(now, rows)` to `backend/src/common/time.ts` (zero-fill to exactly 24 ascending UTC buckets, `hour` formatted `YYYY-MM-DDTHH:00:00Z`). Depends on T009.
- [X] T056 [US3] Extend `backend/src/links/links.repository.ts` with `clicksGroupedByHour(linkId, windowStart)` running `SELECT substr(clicked_at, 1, 13) AS hour, COUNT(*) AS clicks FROM click_events WHERE link_id = ? AND clicked_at >= ? GROUP BY hour` (parameterized). Depends on T047.
- [X] T057 [US3] Implement `getAnalytics(code)` in `backend/src/links/links.service.ts`: validate code format first (→ not found, no DB access); read-only (no write, no transaction needed beyond a consistent single `now`); `expired` when `now >= expires_at`; `windowStart = floorToHour(now) − 23h`; return `short_code, original_url, short_url, created_at, expires_at, total_clicks, last_clicked_at, clicks_by_hour` (24 buckets via `buildHourBuckets`). Depends on T055, T056, T048.
- [X] T058 [US3] Add `GET /api/links/:code/analytics` to `backend/src/links/links.controller.ts` (404 `NotFoundException("Short URL not found")`, 410 `GoneException("This shortened URL has expired")`, Swagger decorators for 200/404/410/500). Depends on T057, T041.
- [X] T059 [P] [US3] Implement `frontend/src/components/ClickChart.jsx`: pure CSS/flex bar chart of the 24 buckets with per-bar count and local-hour label (via `formatHourLabel`), bar height proportional to the max (all-zero allowed); no chart library
- [X] T060 [US3] Implement `frontend/src/pages/AnalyticsPage.jsx` per `contracts/frontend-routes.md`: read `:shortCode` from the router; load once on mount via `getAnalytics`, again only when **Refresh** is pressed (disabled while loading); no timers; render short URL as plain text, original URL, total clicks, created/expires/last-clicked (local time, "Never" when null) and `ClickChart`; states for loading, loaded, `notFound`, `expired` (each with link back to `/`) and `network` error with Refresh available. Depends on T023, T022, T059.
- [X] T061 [US3] Register the `/stats/:shortCode` route in `frontend/src/App.jsx` and append analytics-page and chart styles to `frontend/src/styles.css` (24 bars readable at 375 px without horizontal page scroll). Depends on T060.

**Checkpoint**: User Stories 1, 2 and 3 all work independently.

---

## Phase 6: User Story 4 - Resubmitting a URL renews its link (Priority: P2)

**Goal**: Submitting a URL that already has an active link returns the same code (HTTP 200, `reused: true`), keeps `created_at`, resets `expires_at` to now + 24 h (never shortening it), preserves analytics, and creates no new row — even under 50 concurrent identical submissions.

**Independent Test**: Shorten a URL, click it, shorten it again: same code, 200, later expiry, `created_at` unchanged, click count unchanged, one row.

### Tests for User Story 4 ⚠️ (write first, ensure they FAIL)

- [X] T062 [P] [US4] Unit test `backend/test/unit/links.service.renew.spec.ts` (FakeClock + temp DB): resubmitting an active URL returns same code with `reused:true`, `created_at` unchanged, `expires_at = now + 24h`, `last_submitted_at = now`; surrounding whitespace is trimmed so `" https://a.com "` matches `https://a.com`; `?a=1&b=2` vs `?b=2&a=1` are different links (no normalization); a stored `expires_at` later than `now + 24h` is **not shortened** (`MAX`); a lookup-then-expire race (guarded UPDATE changes 0 rows) falls through to insert of a new code instead of reviving the expired row
- [X] T063 [P] [US4] Integration test `backend/test/integration/renewal.integration.spec.ts` (real app): second POST of the same URL → 200 with same `short_code`, `reused:true`, later `expires_at`, `created_at` unchanged, exactly one row for the URL; clicks made before renewal are included in `total_clicks` afterwards (SC-003); **50 concurrent identical POSTs of a new URL** → exactly one row, all responses share one code, exactly one 201 and the rest 200 (SC-005); concurrent renewals of an already-active URL leave one row, same code, analytics unchanged and `expires_at` never decreasing; a contender **child process** (`spawnContender`) holding the write lock while submissions arrive neither breaks the one-active-record invariant nor causes failed requests (they wait on the busy timeout)
- [X] T064 [P] [US4] Integration test `frontend/tests/integration/LandingPage.reused.test.jsx`: a 200/`reused:true` response shows the note that the existing link was reused and its expiry renewed, with the renewed expiry displayed; a 201 response shows no such note

### Implementation for User Story 4

- [X] T065 [US4] Extend `backend/src/links/links.repository.ts` with `findActiveByUrl(originalUrl, now)` (`WHERE original_url = ? AND expires_at > ?`, most recent first) and `renewLink(id, newExpiresAt, now)` (`UPDATE links SET expires_at = MAX(expires_at, :newExpiry), last_submitted_at = :now WHERE id = :id AND expires_at > :now`, returning `changes`). Depends on T047.
- [X] T066 [US4] Extend `shorten` in `backend/src/links/links.service.ts`: inside the existing `BEGIN IMMEDIATE` transaction, first `findActiveByUrl`; if found call `renewLink`; if it changed 1 row, re-read and return `reused:true` (same `short_code`, original `created_at`); if it changed 0 rows fall through to the insert path. Depends on T065, T040.
- [X] T067 [US4] Update `backend/src/links/links.controller.ts` `POST /api/shorten` to return **200** when `reused` is true and **201** otherwise (e.g. `@Res({ passthrough: true })` setting `res.status`), and add the 200 example to the Swagger decorators. Depends on T066, T041.
- [X] T068 [US4] Update `frontend/src/pages/LandingPage.jsx` to show the reuse note and the renewed expiry when `reused` is true (distinct from the new-link success state). Depends on T043.

**Checkpoint**: User Stories 1–4 work independently; renewal is safe under concurrency.

---

## Phase 7: User Story 5 - Expired URL gets a brand-new link (Priority: P3)

**Goal**: After a link expires it never works again; resubmitting the same URL issues a different code with a fresh 24 h lifetime and zero analytics; the old row stays as inactive history; the landing page stays usable after any result or error. Completes the 15-step Definition of Done.

**Independent Test**: Expire a link (advance fake clock / edit row), confirm its code returns 410, resubmit the URL and confirm 201 with a different code and zero clicks; old code still 410.

### Tests for User Story 5 ⚠️ (write first, ensure they FAIL)

- [X] T069 [P] [US5] Integration test `backend/test/integration/expiry-recreation.integration.spec.ts` (real app, FakeClock): advance the clock past 24 h → resubmitting returns 201, `reused:false`, a **different** code, `total_clicks 0`, empty analytics; old row remains in `links` (two rows for the URL, only one active); old code still returns 410 on `/r/<old>` and analytics and is never reactivated; boundary `now == expires_at` counts as expired and a new link is created; a `CODE_GENERATOR` stub returning an **expired** link's code first is rejected by the UNIQUE index and a different code is issued (codes never reused); 24 h of repeated renewals keeps the same code beyond 24 h of wall time (link active > 24 h displays correctly in analytics)
- [X] T070 [P] [US5] Integration test `frontend/tests/integration/LandingPage.resubmit.test.jsx`: after a success, an error, a network failure and a reused result, the input remains editable and a further submission works; a new submission clears stale errors/results/toasts before showing its outcome
- [X] T071 [P] [US5] E2E `e2e/tests/definition-of-done.spec.ts` (serial): the full 15-step flow from the root plan.md §18 / quickstart.md — open `/`; shorten a **per-project, per-run unique** URL (e.g. `https://example.com/article?run=${testInfo.project.name}-${Date.now()}`; with no normalization each is a distinct link, so the desktop and mobile projects sharing one database never collide); verify short URL on `localhost:9010/r/<7 chars>` and expiry text; Copy → success toast, clipboard equals short URL; visit the short URL 3× via Playwright's request API with redirects disabled (assert 302 + `Location`); click **View Analytics** and assert the page URL is on `localhost:9011/stats/<code>`; assert total clicks 3 and 24 bars; resubmit → same code and reused note and later expiry; Refresh → clicks still 3; `forceExpire(code)`; assert `/r/<code>` → 410 with exact body and the analytics page shows the expired message with click count unchanged in DB; resubmit → 201, different code; analytics for the new code → 0 clicks, "Never", 24 zero bars; old code still 410

### Implementation for User Story 5

- [X] T072 [US5] Update `frontend/src/pages/LandingPage.jsx` so every new submission resets prior result, inline error and toast state before the request, and the input/button are never left disabled after success, error or network failure (FR-028, US5 scenario 3). Depends on T068.
- [X] T073 [US5] Verify and, if needed, fix `backend/src/links/links.service.ts` / `links.repository.ts` so the active-record lookup is strictly `expires_at > :now` (boundary-expired links are never renewed), the UNIQUE-retry loop covers expired-row codes, and no code path updates or deletes an expired row; make T069 pass. Depends on T066.

**Checkpoint**: All five user stories are independently functional; the 15-step Definition of Done passes in a real browser.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Responsive verification, contract/docs conformance, constitution alignment and final validation

- [X] T074 [P] E2E `e2e/tests/responsive.spec.ts`: at 375 px and 1280 px, `/` and `/stats/<code>` have no horizontal overflow (`document.documentElement.scrollWidth <= clientWidth`) and the input, **Shorten URL**, **Copy Link**, **View Analytics** and **Refresh** controls are visible and usable (SC-011)
- [X] T075 [P] Verify Swagger at `http://localhost:9010/docs` documents `/api/shorten` (201/200/422/500), `/r/{shortCode}` (302/404/410/500), `/api/links/{shortCode}/analytics` (200/404/410/500) and `/health` consistently with `specs/001-url-shortener-analytics/contracts/openapi.yaml`; fix decorators in `backend/src/links/*.ts` and `backend/src/health/health.controller.ts` where they differ
- [X] T076 [P] Security/privacy audit of `backend/src/`: confirm all SQL uses bound parameters (no string interpolation of user input), no code reads `req.ip`, `req.headers`, user-agent or cookies, no outbound HTTP to destination URLs, and error responses never include stack traces or SQLite messages; fix any finding
- [X] T077 [P] Sync `specs/001-url-shortener-analytics/plan.md` with constitution v1.1.0 (the dev-only test-tooling amendment was ratified 2026-10-12): drop the Complexity Tracking row and its "recommended follow-up" paragraph, and change the Constitution Check row "PASS with justified addition" to plain PASS
- [X] T078 Measure performance targets locally (shorten < 500 ms, redirect < 200 ms, analytics < 500 ms) with `curl -w '%{time_total}'` against the running backend and record the results in `specs/001-url-shortener-analytics/quickstart.md` under a short "Measured" note
- [X] T079 Run the full automated suites and fix failures: `cd backend && npm test`, `cd frontend && npm test`, then (with dev servers stopped) `cd e2e && npm install && npx playwright install chromium && npm test`; all unit, integration and e2e tests must pass (SC-012)
- [X] T080 Run the `quickstart.md` validation end to end: setup, two-process run, `/health` and `/docs`, the 15-step manual table, the "Error and edge-case spot checks" (including 2048/2049 length, whitespace trim, query-order difference and restart persistence) and the responsive check; record any deviation as a fix, not a spec change

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phases 3–7)**: Depend on Foundational completion
  - US1 and US2 (both P1) are the MVP; US2's tests create links through the US1 endpoint, so implement US1's backend (T038–T042) before running US2's tests
  - US3 needs links to exist (US1) and clicks (US2) to be meaningful
  - US4 extends the US1 `shorten` code path; US5 exercises US1 + US2 + US4 together (DoD flow)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no other story dependency
- **US2 (P1)**: After Foundational; uses `shorten` from US1 to seed data (shared files `links.repository.ts`/`links.service.ts` are extended sequentially)
- **US3 (P2)**: After Foundational; seeds data via US1/US2; extends repository/service/controller files
- **US4 (P2)**: Extends US1's `shorten`; independently testable once US1 exists
- **US5 (P3)**: Verifies US1+US4 lifecycle and the full DoD flow (needs US2 and US3 UI/API for the 15-step e2e)

### Within Each User Story

- Tests first and failing, then implementation
- DTO/repository → service → controller → module registration; frontend: page → route + styles
- Tasks that edit the same file (`links.repository.ts`, `links.service.ts`, `links.controller.ts`, `LandingPage.jsx`, `App.jsx`, `styles.css`) are sequential, never `[P]`

### Parallel Opportunities

- Setup: T002–T006 in parallel after T001 (T002 needs the package from T001 only for running)
- Foundational: T007–T013 in parallel; T017 and T022–T025, T027–T031 in parallel with the backend chain; frontend and e2e harness tracks are independent of the backend track
- Within each story, all `[P]` test tasks can be written together; backend and frontend implementation tracks run in parallel (e.g. US1: T038/T039 with T043)
- Different stories can be staffed in parallel after Foundational, coordinating on the shared `links.*` files

---

## Parallel Example: User Story 1

```bash
# Write all US1 tests together (they touch different files):
Task: "Unit test backend/test/unit/shorten-url.dto.spec.ts"                       # T032
Task: "Unit test backend/test/unit/links.service.shorten.spec.ts"                 # T033
Task: "Integration test backend/test/integration/shorten.integration.spec.ts"     # T034
Task: "Integration test frontend/tests/integration/LandingPage.test.jsx"          # T035
Task: "E2E e2e/tests/validation-and-errors.spec.ts"                               # T036
Task: "E2E e2e/tests/copy.spec.ts"                                                # T037

# Then backend and frontend implementation tracks in parallel:
Task: "backend/src/links/dto/shorten-url.dto.ts" (T038) → repository (T039) → service (T040) → controller (T041) → module (T042)
Task: "frontend/src/pages/LandingPage.jsx" (T043) → route + styles (T044)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (shorten + copy)
4. Complete Phase 4: User Story 2 (redirect + click counting)
5. **STOP and VALIDATE**: shorten a URL, open it, confirm 302 and a counted click, including the 100-concurrent-visit test
6. Demo locally (no production deployment is approved — rate limiting/abuse controls are out of scope)

### Incremental Delivery

1. Setup + Foundational → platform ready
2. US1 → test independently (shorten/copy) → **MVP part 1**
3. US2 → test independently (redirect/clicks) → **MVP complete**
4. US3 → analytics page and API
5. US4 → renewal and concurrency safety
6. US5 → expiry lifecycle + full 15-step Definition of Done in a real browser
7. Polish → responsive checks, docs conformance, audit, final validation

### Parallel Team Strategy

After Setup + Foundational: Developer A takes the backend chain of US1→US2→US3→US4 (shared `links.*` files), Developer B takes the frontend pages (LandingPage, AnalyticsPage, ClickChart) against stubbed `fetch`, Developer C owns the Playwright specs and harness. Merge at the US5 DoD spec.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- `[Story]` labels map tasks to spec.md user stories for traceability
- Commit after each task or logical group; stop at any checkpoint to validate the story
- Constitution gate: re-check Principle I (no out-of-scope features/dependencies), III (single `BEGIN IMMEDIATE` per state change, one `now`), V (422 not 400, `{detail}` bodies) before merging each story
- `backend/src/app.setup.ts` (T019) is a small addition to the plan's file layout so `main.ts` and the test harness share one configuration; it adds no dependency
