<!--
Sync Impact Report (temporary; remove before committing)
Version change: 1.0.0 -> 1.1.0
Modified principles:
  - I. Simplicity and a Fixed Stack: clarified that "only" governs the runtime stack; dev-only
    test tooling is permitted solely as defined in "Development Workflow and Quality Gates".
Modified sections:
  - Development Workflow and Quality Gates: Testing bullet expanded (React Testing Library/jsdom for
    frontend integration tests; Playwright end-to-end package with its own dev-only constraints);
    Definition of Done now also requires the 15-step flow to pass as an automated real-browser test.
Added sections: none
Removed sections: none
Follow-up TODOs (not done by this command):
  - tasks.md: T077 (propose this amendment) is now satisfied; remove or mark done, and move
    Playwright dev-only tooling off the "deviation" list in plan.md Complexity Tracking.
  - plan.md Constitution Check: change "PASS with justified addition" to plain PASS.
Migration note: no existing code is affected (implementation has not started).
-->
# URL Shortener with Analytics Constitution

## Core Principles

### I. Simplicity and a Fixed Stack (NON-NEGOTIABLE)
The application's runtime stack MUST be React, Vite, NestJS (Express adapter) and SQLite only.
Dev-only test tooling is not part of the runtime stack and is permitted only as listed under
"Development Workflow and Quality Gates". Redis, BullMQ, Kafka, Docker orchestration, microservices, authentication, background workers,
scheduled jobs, external analytics services and distributed caching MUST NOT be introduced. No ORM
and no frontend state-management library (e.g. Redux) is allowed; SQLite is accessed directly via
better-sqlite3 and React local state is sufficient. Features listed as out of scope in plan.md
(custom codes, QR codes, rate limiting, link editing/deletion, geo/device/unique-visitor analytics,
WebSockets, etc.) MUST NOT be built without a constitution amendment.
Rationale: this is a one-day MVP; every added moving part is cost without MVP value.

### II. Public, Anonymous and Privacy-Preserving
All features are publicly accessible with no login, signup, user accounts or sessions. Analytics for
a valid short code are viewable by anyone. The system MUST NOT store IP addresses, browser
fingerprints or any other personal information, and MUST NOT attempt unique-visitor detection.
Repeated visits count as separate clicks. The backend MUST NOT fetch destination URLs.
Rationale: anonymity and minimal data collection are product requirements, not defaults.

### III. Transactional Integrity and Concurrency Safety
All database state changes MUST be atomic; no incomplete records may remain after a failed
operation. URL shortening MUST run in a single `BEGIN IMMEDIATE` transaction that performs the
active-record lookup and the renew/insert, so concurrent submissions of the same URL return the same
short code and a single active record. Renewals MUST use one consistent timestamp, MUST verify the
record is still active when applied, and MUST NOT shorten an existing expiration. Click recording
MUST insert the click event and apply the atomic `total_clicks = total_clicks + 1` update in one
transaction, so no counts are lost. SQLite MUST run with WAL mode, a busy timeout and foreign keys
enabled; transactions MUST be short; connections MUST be closed properly and MUST NOT be shared
unsafely across concurrent requests. Short-code collisions MUST be detected and retried.
Rationale: correctness under concurrency is the central technical risk of this design.

### IV. Link Lifecycle Rules Are Authoritative
A given original URL has at most one active short code. Every new link receives a 24-hour TTL
(`expires_at = now + 24h`, UTC). Submitting a still-active URL MUST return the existing short code,
keep `created_at`, reset `expires_at` to now + 24h, update `last_submitted_at`, preserve all
analytics and create no new record (HTTP 200, `reused: true`). Only shortening submissions renew
TTL; redirects and analytics requests MUST NOT. A link is expired when `current_time >= expires_at`.
Expired codes are never reactivated or reused: resubmitting an expired URL creates a new record with
a new code and zero analytics, and old records remain stored but inactive. URLs are compared as
trimmed stored strings, validated as HTTP/HTTPS, and MUST NOT be otherwise normalized.
`original_url` MUST NOT carry a global UNIQUE constraint. Short codes are 7 alphanumeric characters
generated with Node.js crypto, globally unique and never reused.
Rationale: these rules (plan.md BR-01–BR-06, FR-03, FR-06) define the product's behavior.

### V. Contract-Faithful API and Error Handling
Endpoints, status codes and response bodies MUST match plan.md: `POST /api/shorten` (201 new, 200
renewed, 422 invalid URL — NestJS validation MUST be configured to return 422, not 400),
`GET /r/{code}` (302; 404 unknown; 410 expired, body `{"detail": "This shortened URL has
expired"}`), `GET /api/links/{code}/analytics` (404 unknown, 410 expired), `GET /health`, and
Swagger at `/docs`. Exception handling MUST preserve these statuses and bodies. Responses MUST NOT
expose internal exceptions or database details. Analytics MUST return exactly 24 UTC hourly buckets
(current hour plus preceding 23), with zeros for empty hours, and total clicks since creation across
TTL renewals. Only successful redirects count as clicks. Timestamps MUST use one consistent UTC
format and the frontend MUST display them in the browser's local timezone.
Rationale: a stable, documented contract lets frontend, tests and docs stay in agreement.

## Technology and Security Constraints

- Backend: Node.js 22+, TypeScript, NestJS, class-validator/class-transformer, better-sqlite3,
  Node.js crypto, @nestjs/swagger. Frontend: React, Vite, JavaScript (JSX), CSS, Fetch API, React
  Router. Database: one SQLite file at `data/shortener.db`.
- Architecture: browser → React/Vite (port 5173) → NestJS (port 8000) → SQLite. The frontend MUST
  NEVER access SQLite directly. Vite MUST proxy `/api` to NestJS in development.
- Short URLs MUST be built from `PUBLIC_BASE_URL` and point at NestJS, not Vite. Analytics
  navigation links MUST use the frontend's own origin (e.g. `http://localhost:5173/stats/Ab3xY9z`).
  Configuration comes from `PUBLIC_BASE_URL` and `DATABASE_PATH`.
- Schema: `links` and `click_events` tables as specified in plan.md, with indexes UNIQUE(short_code),
  (original_url, expires_at) and (link_id, clicked_at).
- Input validation: URL required, non-empty, at most 2048 characters, HTTP/HTTPS only with a valid
  hostname; `javascript:` and other schemes MUST be rejected. Short-code format MUST be validated
  before lookup.
- SQL MUST be parameterized; string concatenation of user input into SQL is prohibited.
- Performance targets (local MVP, not SLAs): shortening < 500 ms, redirect < 200 ms, analytics
  < 500 ms.
- Rate limiting and abuse detection are out of scope for the MVP, therefore public production
  deployment is NOT approved without additional security controls, which require an amendment.

## Development Workflow and Quality Gates

- Testing: Jest with @nestjs/testing and Supertest for backend unit and API tests; Vitest for
  frontend unit tests, with React Testing Library, jsdom, user-event and jest-dom allowed for
  frontend integration tests; Playwright (Chromium) for browser end-to-end tests. Concurrency
  rules (NFR-01–NFR-03), TTL renewal, expiry/recreation and error statuses MUST be covered by
  automated tests. Tests for a behavior SHOULD be written before or with the implementation, never
  after merge.
- Dev-only test tooling: Playwright and its helpers (TypeScript, better-sqlite3 for test set-up)
  MUST live in a separate `e2e/` package, MUST NOT be imported by application code or included in
  any build, and MUST run against a throwaway database, never `data/shortener.db`. Test helpers
  that change data (for example forcing expiry) MUST NOT be added to product code or exposed as
  endpoints. Any other test or build dependency still requires a justified, approved deviation.
- Frontend: the landing page and analytics page MUST be responsive, show loading states, and handle
  empty input, invalid URLs, network failures, reused URLs, missing and expired analytics, and copy
  failures. Copy MUST give a success notification without reloading. Charts use simple React/CSS; no
  charting library. The analytics page has a manual Refresh button; no polling.
- Definition of Done: the 15-step end-to-end user flow in plan.md §18 passes, including preserved
  analytics after renewal and a brand-new code after expiry, and the same flow passes as an
  automated real-browser test.
- Every spec, plan and task set MUST be checked against this constitution before implementation.
- Development runs as two processes (Vite and NestJS); a production build integration is optional.

## Governance

This constitution supersedes other practices and ad-hoc decisions for this project; plan.md is the
detailed requirements source and MUST be kept consistent with it. Conflicts are resolved by
amending one of the two documents, never by silently ignoring either.

- Amendments: proposed in writing with rationale, reviewed and approved by the project owner,
  recorded by updating this file, and accompanied by a migration note if existing code is affected.
- Versioning: semantic. MAJOR for backward-incompatible principle removals or redefinitions; MINOR
  for new principles/sections or materially expanded guidance; PATCH for clarifications and wording.
- Compliance: every PR and review MUST verify compliance with these principles. Any deviation, such
  as added complexity or a new dependency, MUST be justified in writing and approved before merge.
- Runtime guidance: use plan.md until a README or agent guidance file is added.

**Version**: 1.1.0 | **Ratified**: 2026-10-12 | **Last Amended**: 2026-10-12
