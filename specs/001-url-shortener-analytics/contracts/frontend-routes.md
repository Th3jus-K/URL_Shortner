# Frontend Contract: Routes, States and Navigation

Served by Vite at `http://localhost:5173`. The browser only calls relative `/api/...` URLs, which Vite
proxies to `http://localhost:8000`. See [openapi.yaml](openapi.yaml) for payloads.

## Routes

| Route | Page | Purpose |
|---|---|---|
| `/` | Landing | Shorten a URL, copy the result, open analytics |
| `/stats/:shortCode` | Analytics | Show link analytics with manual refresh |

Any other path shows a simple "page not found" view with a link back to `/`.

## Link rules

- The short URL displayed and copied is exactly `short_url` from the API (built from `PUBLIC_BASE_URL`; points at NestJS on port 8000).
- "View Analytics" navigates in-app to `/stats/<short_code>` with a router link, so it always uses the frontend's own origin (e.g. `http://localhost:5173/stats/Ab3xY9z`) and never `:8000`.
- The Analytics page shows the short URL as text and must not link it to `/stats/...` on the backend.

## Landing page (`/`)

Elements: application name, one-line description, URL input, **Shorten URL** button, result area (short URL, **Copy Link**, **View Analytics**, expiration info), toast area.

| State | Trigger | Behaviour |
|---|---|---|
| Idle | initial | Result area hidden |
| Empty input | submit with blank/whitespace value | Inline error "Please enter a URL"; no request sent |
| Loading | request in flight | Loading indicator; Shorten button disabled |
| Success (new) | HTTP 201 | Show short URL, "Expires in …" and absolute local expiry; no reuse note |
| Success (reused) | HTTP 200 / `reused: true` | Same as success plus note that the existing link was reused and its expiry renewed; shows renewed expiry |
| Invalid URL | HTTP 422 | Inline error with the server `detail`; any previous result is cleared |
| Network failure | fetch rejects / proxy 5xx without JSON | Inline "Could not reach the server…" message; form stays usable |
| Unexpected error | HTTP 500 | Inline generic error; form stays usable |
| Copy success | clipboard write resolves | Success toast; no page reload |
| Copy failure | clipboard unavailable/rejected | Failure toast; short URL remains visible and selectable |

## Analytics page (`/stats/:shortCode`)

Shows: short URL, original URL, total clicks, created / expires / last-clicked (`—` or "Never" when null), click-activity chart with 24 hourly bars and per-bar counts, **Refresh** button.

| State | Trigger | Behaviour |
|---|---|---|
| Loading | initial load or Refresh | Loading indicator; Refresh disabled |
| Loaded | HTTP 200 | Stats and 24-bucket chart (all-zero chart when no clicks) |
| Not found | HTTP 404 | "Short link not found" message with link to `/` |
| Expired | HTTP 410 | "This shortened URL has expired" message with link to `/` |
| Network failure | fetch rejects | Error message with the Refresh button still available |

- Data loads once on mount and again only when Refresh is pressed; there is no polling or timer.
- Chart bar labels use the visitor's local hour; the hour label for each bucket is derived from the UTC `hour` value.

## Time display

- All displayed timestamps are the API's UTC values converted to the browser's local timezone.
- "Expires in: N hours M minutes" is computed once when the result renders from `expires_at` minus the current time (no live countdown); if non-positive it reads "Expired".
