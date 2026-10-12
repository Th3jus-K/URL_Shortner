# Feature Specification: URL Shortener with Analytics

**Feature Branch**: `001-url-shortener-analytics`

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "use the plan.md." (source: [plan.md](../../plan.md))

## Clarifications

### Session 2026-10-12

- Q: Which tool should run the end-to-end tests that drive the running app through a browser? → A: Automated real-browser testing (not jsdom-only); the specific tool and its justification are recorded in plan.md.
- Q: What happens when a submitted URL contains whitespace or control characters inside it, or non-ASCII characters? → A: Whitespace/control characters anywhere inside the URL are rejected (422); non-ASCII characters are accepted, stored exactly as submitted, and sent percent-encoded in the redirect.
- Q: What counts as a "valid hostname"? → A: The URL must start with `http://` or `https://` followed directly by a non-empty host that the standard URL parser accepts (`localhost` and IP addresses are valid); no further hostname rules.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shorten a URL and share it (Priority: P1)

Anyone, without creating an account, opens the landing page, pastes a long web address, and receives a short link they can copy and share. The result shows when the short link expires.

**Why this priority**: This is the core value of the product. Without it nothing else exists.

**Independent Test**: Open the landing page, submit a valid URL, and confirm a short link with an expiration time is displayed and can be copied to the clipboard.

**Acceptance Scenarios**:

1. **Given** the landing page is open, **When** the visitor submits a valid HTTP/HTTPS URL, **Then** a short link made of 7 letters/digits is shown together with its expiration time (24 hours from now).
2. **Given** a short link is displayed, **When** the visitor clicks Copy, **Then** the short link is placed on the clipboard, a success notification appears, and the page does not reload.
3. **Given** the visitor submits an empty value, a non-HTTP/HTTPS address (e.g. a `javascript:` address), an address without a valid hostname, an address containing whitespace or control characters inside it, or an address over 2048 characters, **When** the submission is made, **Then** it is rejected with a clear inline error and no short link is created.
4. **Given** the service is unreachable, **When** the visitor submits a URL, **Then** a clear network-failure message is shown and the page remains usable.
5. **Given** a submission is in progress, **When** the visitor waits for the result, **Then** a loading indicator is shown.

---

### User Story 2 - Visit a short link and be redirected (Priority: P1)

A person who receives a short link opens it and is taken to the original destination. Each successful visit is counted as a click.

**Why this priority**: Redirection is the purpose of a shortened link, and clicks feed the analytics.

**Independent Test**: Create a short link, open it, and confirm the browser lands on the original URL and the click count increases by one.

**Acceptance Scenarios**:

1. **Given** an active short link, **When** someone opens it, **Then** they are redirected to the original URL and one click is recorded.
2. **Given** a short link that does not exist, **When** someone opens it, **Then** a "not found" response is returned and no click is recorded.
3. **Given** a short link whose expiration time has passed, **When** someone opens it, **Then** an "expired" response with the message "This shortened URL has expired" is returned, no redirect occurs, and no click is recorded.
4. **Given** the same person opens an active short link several times, **When** each visit succeeds, **Then** each visit counts as a separate click.
5. **Given** an active short link, **When** it is opened, **Then** its expiration time is not extended.

---

### User Story 3 - View link analytics (Priority: P2)

Anyone who knows a short code can open an analytics page showing the original URL, the short URL, total clicks, created / expires / last-clicked times, and an hourly click chart for the last 24 hours. A Refresh button reloads the numbers.

**Why this priority**: Analytics is the second half of the product's promise, but the product is useful for shortening and redirecting without it.

**Independent Test**: Create a link, click it several times, open the analytics page for its code, and confirm totals, timestamps and hourly activity match what was done.

**Acceptance Scenarios**:

1. **Given** an active short link with clicks, **When** the analytics page is opened, **Then** it shows original URL, short URL, total clicks, created time, expiration time, last-clicked time, and click activity per hour.
2. **Given** the analytics view, **When** it is displayed, **Then** the hourly activity covers exactly 24 hourly buckets (the current UTC hour plus the preceding 23), with zero for hours without clicks.
3. **Given** the analytics page is open, **When** the visitor clicks Refresh, **Then** the latest figures are loaded without any automatic polling.
4. **Given** an unknown short code, **When** the analytics page is opened, **Then** a clear "not found" message is shown.
5. **Given** an expired short code, **When** the analytics page is opened, **Then** a clear "expired" message is shown.
6. **Given** any analytics request, **When** it is processed, **Then** the link's expiration time is not extended.
7. **Given** times are shown on the page, **When** displayed, **Then** they appear in the visitor's local timezone.
8. **Given** a short link has never been clicked, **When** analytics are viewed, **Then** total clicks is zero, last-clicked is shown as empty/none, and all hourly buckets are zero.

---

### User Story 4 - Resubmitting a URL renews its link (Priority: P2)

When someone submits a URL that already has an active short link, they get the same short code back, and the expiration is reset to 24 hours from now. Existing analytics are preserved and no duplicate link is created.

**Why this priority**: It defines the link lifecycle and avoids duplicate links, but depends on the basic shortening flow.

**Independent Test**: Submit a URL, click the link, submit the same URL again, and confirm the same code is returned with a later expiration and the click count unchanged.

**Acceptance Scenarios**:

1. **Given** an active short link for a URL, **When** the same URL (identical after trimming surrounding whitespace) is submitted again, **Then** the same short code is returned, the original creation time is kept, the expiration becomes now + 24 hours, and the response and page indicate the link was reused.
2. **Given** a renewed link, **When** its analytics are viewed, **Then** total clicks include clicks made before the renewal.
3. **Given** a URL that differs only in query-parameter order or representation, **When** it is submitted, **Then** it is treated as a different URL (no normalization).
4. **Given** two people submit the same new URL at the same moment, **When** both complete, **Then** both receive the same short code and only one active link exists.
5. **Given** several simultaneous renewals of the same active URL, **When** they complete, **Then** the short code, single active record and analytics are unchanged and the expiration is never shortened.

---

### User Story 5 - Expired URL gets a brand-new link (Priority: P3)

After a link expires it stops working permanently. If someone submits the same original URL again, a completely new short code is issued with a fresh 24-hour lifetime and zero analytics.

**Why this priority**: Completes the lifecycle; it only matters after a link has expired.

**Independent Test**: Let a link expire, confirm its code no longer redirects, resubmit the URL, and confirm a different code with zero clicks is returned.

**Acceptance Scenarios**:

1. **Given** an expired short link, **When** the original URL is submitted again, **Then** a new, different short code is created with a 24-hour lifetime and zero clicks.
2. **Given** the old code of an expired link, **When** it is opened after the new link was created, **Then** it still reports "expired" and is never reactivated or reissued.
3. **Given** the landing page, **When** the visitor submits a URL, **Then** the application remains usable for further submissions after any error or result.

---

### Edge Cases

- A URL with leading/trailing whitespace is trimmed before validation and comparison; no other normalization is applied.
- A URL of exactly 2048 characters is accepted; 2049 characters is rejected.
- A URL containing whitespace or control characters (e.g. a space or line break) anywhere inside it is rejected as invalid input; a URL containing non-ASCII characters (e.g. `http://example.com/café`) is accepted, stored exactly as submitted, and sent percent-encoded when redirecting.
- A short code with an invalid format (wrong length or non-alphanumeric characters) is rejected as not found without touching stored data.
- A link is considered expired at the exact moment current time equals its expiration time.
- Two concurrent clicks on the same link must both be counted (no lost counts).
- A short code that collides with an existing code (including codes of expired links) must never be issued; a different code is generated.
- A failed operation must leave no partial or incomplete records.
- Clipboard access fails: the visitor sees a copy-failure message and can still select the link manually.
- Empty analytics (no clicks) and links that stay active for more than 24 hours through repeated renewals are displayed correctly.
- Visitors reach the analytics page through the web app's own address, not the redirect service's address.

## Requirements *(mandatory)*

### Functional Requirements

**Access and privacy**

- **FR-001**: System MUST be fully usable without login, signup, accounts or sessions.
- **FR-002**: System MUST NOT collect IP addresses, browser fingerprints or other personal information, and MUST NOT attempt unique-visitor detection.
- **FR-003**: System MUST NOT fetch or contact the destination URL.

**URL submission and validation**

- **FR-004**: System MUST accept a submitted URL and return a shortened URL.
- **FR-005**: System MUST trim leading and trailing whitespace from a submitted URL before validation and comparison, and MUST NOT otherwise normalize it.
- **FR-006**: System MUST accept only HTTP and HTTPS URLs with a valid hostname (the URL starts with `http://` or `https://` directly followed by a non-empty host accepted by the standard URL parser; `localhost` and IP addresses are valid, `http:///path` and `http:example.com` are not), a non-empty value, no whitespace or control characters inside the URL (after trimming), and a maximum length of 2048 characters; all others MUST be rejected with an "invalid input" (HTTP 422) response and a clear message.

**Link creation and lifecycle**

- **FR-007**: Each newly created short link MUST have a unique 7-character code of letters and digits, generated with a cryptographically secure source, never duplicated and never reused (including codes of expired links).
- **FR-008**: Each new link MUST expire 24 hours after creation (UTC) and the response MUST report HTTP 201 with the short code, short URL, original URL, creation time, expiration time and `reused: false`.
- **FR-009**: A given original URL MUST have at most one active short link at a time.
- **FR-010**: When an active link exists for the submitted URL, system MUST return the existing code, keep the original creation time, reset the expiration to now + 24 hours, record the submission time, preserve all analytics, create no new link record, and respond with HTTP 200 and `reused: true`, including the renewed expiration.
- **FR-011**: When the previous link for the submitted URL has expired, system MUST create a new link with a new code, a new 24-hour lifetime and zero analytics; the old record MUST remain stored but inactive and MUST NOT be reactivated.
- **FR-012**: A link MUST be considered expired when the current time is greater than or equal to its expiration time.
- **FR-013**: Only shortening submissions MAY renew a link's lifetime; redirects and analytics requests MUST NOT.
- **FR-014**: Simultaneous submissions of the same URL MUST yield the same short code and a single active link; simultaneous renewals MUST NOT shorten an expiration or alter the code or analytics.
- **FR-015**: Failed operations MUST NOT leave incomplete records, and data MUST survive application restarts.

**Redirect and click tracking**

- **FR-016**: Opening an active short link MUST redirect the visitor (HTTP 302) to the original URL (any non-ASCII characters sent percent-encoded).
- **FR-017**: Opening an unknown short link MUST return HTTP 404; opening an expired one MUST return HTTP 410 with the body `{"detail": "This shortened URL has expired"}`.
- **FR-018**: Every successful redirect MUST record exactly one click (increment the total, update the last-clicked time and store a click event); failed or expired visits MUST NOT count.
- **FR-019**: Repeated visits MUST each count separately, and concurrent visits MUST NOT lose counts.
- **FR-020**: Short-code format MUST be validated before lookup.

**Analytics**

- **FR-021**: System MUST provide, for any valid short code and without authentication, total clicks, last-clicked time, creation time, expiration time, original URL, short URL and hourly click activity.
- **FR-022**: Hourly activity MUST contain exactly 24 UTC hourly buckets (current hour plus the preceding 23), with zero for hours without clicks.
- **FR-023**: Total clicks MUST cover all clicks since the link's creation, including those before any renewals.
- **FR-024**: Analytics for unknown codes MUST return HTTP 404 and for expired codes HTTP 410.

**Web interface**

- **FR-025**: Landing page MUST show the application name, a short description, a URL input, a "Shorten URL" button, a result area with the short link, a Copy button, a View Analytics button, and expiration information; it MUST be responsive.
- **FR-026**: Copy MUST place the short URL on the clipboard, show a success notification, and not reload the page; a copy failure MUST be reported.
- **FR-027**: Analytics page (at `/stats/:shortCode`) MUST show original URL, short URL, total clicks, created, expires and last-clicked times, and a simple click-activity chart, with a manual Refresh button and no automatic polling.
- **FR-028**: The interface MUST handle and clearly present: empty input, invalid URLs, loading, successful shortening, reused links, network failures, missing analytics, expired analytics and copy failures.
- **FR-029**: Dates MUST be displayed in the visitor's local timezone; timestamps exchanged with the service MUST use one consistent UTC format.
- **FR-030**: Short links MUST point to the redirect service address (configurable base address), while the View Analytics navigation MUST use the web app's own address.

**Operational**

- **FR-031**: System MUST expose a health check and interactive API documentation.
- **FR-032**: Errors MUST use clear messages and MUST NOT expose internal exceptions or storage details; unexpected failures MUST return HTTP 500.

### Key Entities

- **Link**: A shortened URL record. Attributes: original URL, unique short code, creation time, last-submitted time, expiration time, total clicks, last-clicked time. The same original URL may have many historical Links but at most one active at a time.
- **Click Event**: One successful redirect of a Link, with its timestamp only (no visitor information). Each Link has many Click Events.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can paste a URL and obtain a copyable short link in under 30 seconds with no sign-up.
- **SC-002**: Shortening normally completes in under 500 ms, redirects in under 200 ms, and analytics load in under 500 ms in a local environment.
- **SC-003**: 100% of submissions of an already-active URL return the original short code with an extended expiration and unchanged analytics.
- **SC-004**: 100% of submissions of an expired URL produce a code never issued before, with zero clicks.
- **SC-005**: Under at least 50 simultaneous submissions of the same new URL, exactly one link is created and all requesters receive the same code.
- **SC-006**: Under at least 100 simultaneous visits to one active link, the reported total clicks equals the number of successful redirects exactly.
- **SC-007**: 100% of invalid inputs (empty, wrong scheme, no hostname, internal whitespace/control characters, over 2048 characters) are rejected with a clear message and create no link.
- **SC-008**: An expired or unknown short link never redirects.
- **SC-009**: The analytics view always shows exactly 24 hourly buckets, and its figures match the actual number and timing of recorded clicks.
- **SC-010**: A tester can complete the full 15-step end-to-end flow in plan.md §18 (shorten, copy, visit, view analytics, resubmit with preserved analytics, expire, resubmit with new code) without error, and the same flow passes as an automated real-browser test.
- **SC-012**: The automated test suite includes unit tests, integration tests (the whole service against a real database, including concurrency) and browser-driven end-to-end tests, and all pass before the feature is considered done.
- **SC-011**: Both pages remain fully usable on phone-width and desktop-width screens.

## Assumptions

- This is a one-day local MVP; performance figures are targets, not service guarantees.
- Rate limiting, abuse/phishing detection and other production security controls are out of scope, so public production deployment is not approved without further work.
- Expired records are never physically deleted and no background cleanup occurs.
- The stack, architecture, data schema, ports and configuration are fixed by the project constitution and plan.md (React/Vite frontend, NestJS backend, SQLite storage, two development processes); they are planning inputs rather than part of this specification.
- Out of scope: login/signup, custom codes or domains, QR codes, link editing or deletion, geographic/device/unique-visitor analytics, caching, scheduled jobs, WebSockets, real-time analytics, link previews, advanced dashboards and external analytics providers.
- Any visitor who knows a short code can view its analytics (public by design).
- Automated end-to-end tests run in a real browser against a throwaway database so they never touch development data.
- Visitors use a modern browser with clipboard support; copy failure is handled gracefully when unavailable.
