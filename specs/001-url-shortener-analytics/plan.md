# Implementation Plan: URL Shortener with Analytics

**Branch**: `001-url-shortener-analytics` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-url-shortener-analytics/spec.md`; detailed requirements source: [../../plan.md](../../plan.md)

## Summary

Build an anonymous URL shortener with per-link click analytics. A NestJS API (port 8000) owns all business
logic and talks directly to one SQLite file through better-sqlite3 (no ORM). A React + Vite SPA (port 5173)
provides the landing page and the `/stats/:shortCode` analytics page and reaches the API through a Vite
`/api` proxy. The technical core is correctness under concurrency: shortening runs in a single
`BEGIN IMMEDIATE` transaction (find active record → renew or insert), and every redirect inserts a click
event and applies an atomic `total_clicks + 1` in one transaction. Link lifecycle (24 h TTL, renewal on
resubmission, new code after expiry) is enforced in one service, with time supplied by an injectable clock
so expiry and renewal are testable without waiting 24 hours. Decisions are in [research.md](research.md).

## Technical Context

**Language/Version**: Node.js 22+; TypeScript (backend); JavaScript/JSX (frontend)

**Primary Dependencies**: Backend: NestJS (Express adapter), class-validator, class-transformer, better-sqlite3, Node `crypto`, @nestjs/swagger. Frontend: React, Vite, React Router (Fetch API for HTTP, no state library, no chart library)

**Storage**: SQLite, single file `data/shortener.db` (WAL mode, busy timeout, foreign keys on); tables `links` and `click_events` — see [data-model.md](data-model.md)

**Testing**: Three layers. Unit: Jest (backend), Vitest (frontend). Integration: Jest + @nestjs/testing + Supertest against a real temp SQLite file (backend); Vitest + React Testing Library/jsdom with a stubbed `fetch` against the real router and pages (frontend). End-to-end: Playwright (Chromium) driving the real Vite + NestJS processes on a throwaway database — see [research.md](research.md) R14, R17

**Target Platform**: Local development on Linux/macOS/Windows; two processes (Vite dev server, NestJS)

**Project Type**: Web application (frontend + backend)

**Performance Goals**: shorten < 500 ms, redirect < 200 ms, analytics < 500 ms locally (targets, not SLAs); correctness at ≥ 50 concurrent identical submissions and ≥ 100 concurrent visits

**Constraints**: Fixed stack (constitution I); no auth/caching/workers; no PII or IPs; timestamps UTC `YYYY-MM-DDTHH:mm:ssZ`; 422 (not 400) for invalid URLs; error bodies `{"detail": ...}` with no internals; no production deployment approval

**Scale/Scope**: One-day local MVP; 2 frontend pages, 4 backend endpoints (+ `/docs`), 2 tables

No `NEEDS CLARIFICATION` items remain; all were resolved in [research.md](research.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / constraint | Status | How the design complies |
|---|---|---|
| I. Fixed stack, no ORM/state library, no out-of-scope features | PASS | Only the listed packages; direct better-sqlite3 SQL; React local state; hand-built CSS chart. React Testing Library/jsdom are dev-only test helpers for the mandated Vitest, not runtime stack. |
| II. Public, anonymous, privacy-preserving | PASS | No auth/session code; `click_events` stores only `link_id` + `clicked_at`; nothing reads request IPs/headers; destination never fetched. |
| III. Transactional integrity and concurrency safety | PASS | `shorten` and `recordClick` each run in one `db.transaction(...).immediate()`; one consistent `now` per transaction; renewal re-checks active and uses `MAX(expires_at, new)`; atomic `total_clicks + 1`; WAL + `busy_timeout` + `foreign_keys`; single synchronous connection closed on shutdown; UNIQUE-collision retry. |
| IV. Lifecycle rules authoritative | PASS | Active = `expires_at > now`; renew keeps `created_at`; expired ⇒ new row/new code; no UNIQUE on `original_url`; trimmed-string comparison only; 7-char codes via `crypto.randomInt`. |
| V. Contract-faithful API and errors | PASS | Contract in [contracts/openapi.yaml](contracts/openapi.yaml): 201/200/422, 302/404/410, analytics 404/410, `/health`, `/docs`; global filter emits `{detail}`; ValidationPipe configured for 422; 24 UTC buckets; frontend renders local time. |
| Stack/ports/config/schema constraints | PASS | Ports 5173/8000, Vite `/api` proxy, `PUBLIC_BASE_URL`, `DATABASE_PATH`, required indexes, parameterized SQL, code-format validation before lookup. |
| Quality gates (tests, responsive UI, DoD) | PASS | Unit, integration and end-to-end layers cover NFR-01–03, TTL, expiry, statuses, and the 15-step flow (automated in Playwright, also walkable manually in [quickstart.md](quickstart.md)). |
| Testing stack named in constitution (Jest, Supertest, Vitest) | PASS with justified addition | Playwright (+ better-sqlite3 for DB set-up in tests) is a dev-only dependency added by the owner's request for end-to-end tests; see Complexity Tracking. No runtime dependency is added. |

**Post-design re-check (after Phase 1)**: PASS — no violations introduced; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-url-shortener-analytics/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── openapi.yaml     # Backend HTTP contract
│   └── frontend-routes.md  # Frontend routes, states, and UI contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── package.json
├── tsconfig.json
├── nest-cli.json
├── .env.example                 # PUBLIC_BASE_URL, DATABASE_PATH
├── src/
│   ├── main.ts                  # bootstrap: port 8000, ValidationPipe(422), exception filter, Swagger /docs
│   ├── app.module.ts
│   ├── config/app-config.ts     # reads PUBLIC_BASE_URL, DATABASE_PATH (defaults per plan.md §13)
│   ├── common/
│   │   ├── clock.ts             # injectable Clock (now(): Date)
│   │   ├── time.ts              # toUtcString(), addHours(), hour-floor helpers
│   │   ├── short-code.ts        # generateShortCode(), SHORT_CODE_PATTERN
│   │   └── http-exception.filter.ts   # {detail} bodies, 500 without internals
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── database.service.ts  # open connection, pragmas, schema bootstrap, close on destroy
│   │   └── schema.ts            # CREATE TABLE/INDEX IF NOT EXISTS statements
│   ├── links/
│   │   ├── links.module.ts
│   │   ├── links.controller.ts  # POST /api/shorten, GET /api/links/:code/analytics
│   │   ├── redirect.controller.ts   # GET /r/:code
│   │   ├── links.service.ts     # shorten (renew/create), recordClick, getAnalytics
│   │   ├── links.repository.ts  # parameterized SQL only
│   │   └── dto/shorten-url.dto.ts   # trim + URL rules (class-validator)
│   └── health/health.controller.ts  # GET /health
└── test/
    ├── unit/                    # short-code, time, URL validation, service rules (fake clock)
    └── integration/             # Nest app + real temp SQLite file: Supertest API flows, errors,
                                 # concurrency (50 shorten / 100 redirect), second-connection
                                 # contention, restart persistence, rollback on failure

frontend/
├── package.json
├── vite.config.js               # port 5173, proxy /api → http://localhost:8000
├── index.html
├── src/
│   ├── main.jsx                 # React Router setup
│   ├── App.jsx
│   ├── pages/
│   │   ├── LandingPage.jsx      # form, result, copy, View Analytics, expiry info
│   │   └── AnalyticsPage.jsx    # stats, hourly chart, Refresh, not-found/expired states
│   ├── components/
│   │   ├── ClickChart.jsx       # CSS bar chart, 24 buckets
│   │   └── Toast.jsx            # copy success/failure notification
│   ├── services/api.js          # fetch wrappers, error normalization
│   ├── utils/time.js            # local-time formatting, "expires in" text
│   └── styles.css               # responsive layout
└── tests/
    ├── unit/                    # api.js error mapping, time utils
    └── integration/             # pages + router + ClickChart with stubbed fetch: every UI state

e2e/
├── package.json                 # @playwright/test, better-sqlite3 (dev-only); `npm test`
├── playwright.config.ts         # starts backend (8000) + frontend (5173) via webServer, temp DB,
│                                # Chromium projects: desktop 1280px, mobile 375px
├── global-setup.ts              # deletes the throwaway e2e database before the run
├── support/db.ts                # test-only helper: force expiry / read rows in the e2e database
└── tests/
    ├── definition-of-done.spec.ts   # the 15-step flow from plan.md §18
    ├── validation-and-errors.spec.ts # empty/invalid/over-long input, 404, 410, network failure
    ├── copy.spec.ts                 # clipboard success, and failure with permission denied
    ├── analytics.spec.ts            # 24 buckets, refresh, local timezone display, empty state
    └── responsive.spec.ts           # no horizontal scroll at 375px and 1280px

data/                            # shortener.db created at runtime (git-ignored);
                                 # e2e uses e2e/.tmp/e2e.db instead (git-ignored)
```

**Structure Decision**: Web-application layout with two sibling packages, `backend/` (NestJS) and
`frontend/` (Vite React), a third dev-only package `e2e/` (Playwright) that treats the running app as a black box, plus a runtime-created `data/` directory at the repo root so the plan's default
`DATABASE_PATH=../data/shortener.db` resolves from `backend/`. No shared package and no root workspace
tooling — the two application processes are started independently, matching the "two development processes" constraint. `e2e/` is never imported by the application and is excluded from any production build.

## Key Design Decisions (detail in research.md)

1. **Time**: one `Clock` provider; each operation captures `now` once. Timestamps stored/returned as `YYYY-MM-DDTHH:mm:ssZ` so string comparison equals chronological comparison.
2. **Shorten transaction** (`BEGIN IMMEDIATE`): lookup active by `(original_url, expires_at > now)` → renew with `MAX(expires_at, now+24h)` guarded by `expires_at > now`, else insert with a fresh code (retry on UNIQUE violation). Re-read the row for the response.
3. **Click transaction** (`BEGIN IMMEDIATE`): look up code, check expiry, insert event, atomic increment + `last_clicked_at`; 404/410 paths write nothing.
4. **Analytics**: single grouped query over `click_events` for the 24-hour window, zero-filled in code to exactly 24 ascending UTC buckets; read-only.
5. **Errors**: global exception filter → `{ "detail": string }`; ValidationPipe `errorHttpStatusCode: 422`; invalid short-code format → 404 before any DB access.
6. **Redirects** send `Cache-Control: no-store` so repeat visits always reach the server and are counted.
7. **Test layers**: unit tests prove rules in isolation; integration tests prove the assembled service (real SQLite, real validation pipe/filter, concurrency, persistence); end-to-end tests prove the real browser experience (clipboard, local timezone, 5173-vs-8000 origins, responsive layout) and the 15-step Definition of Done. The e2e run uses its own database file and forces expiry by writing `expires_at` in that file (no product code or TTL setting for tests).
8. **Frontend**: relative `/api` calls through the Vite proxy; short URL comes from the API (`PUBLIC_BASE_URL`); View Analytics uses a React Router `<Link>` (own origin); no polling, no timers.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Extra dev-only test dependency: Playwright (and better-sqlite3 inside `e2e/` to force expiry in the throwaway DB) beyond the Jest/Supertest/Vitest list in the constitution | Owner requested end-to-end tests. Clipboard, browser-local timezone, the frontend-vs-backend origin of links, and phone-width layout (SC-011) can only be verified in a real browser | jsdom-only "e2e" cannot exercise the clipboard, real timezone, real proxying or layout, leaving those requirements manual; Cypress offers no extra capability here and is heavier |

Approved by the project owner when answering the clarification of 2026-10-12. Runtime stack is unchanged
(no new production dependency, no new service). Recommended follow-up: a MINOR constitution amendment
adding Playwright to the testing list so the stack text and plan agree.
