# Data Model: URL Shortener with Analytics

Storage: one SQLite file, `data/shortener.db` (path from `DATABASE_PATH`). Pragmas applied on every
connection: `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`.

All timestamps are UTC text in the single format `YYYY-MM-DDTHH:mm:ssZ` (e.g. `2026-10-12T10:00:00Z`).
This format is fixed-width, so string comparison equals chronological comparison.

## Entity: Link (`links`)

One row per issued short code. The same `original_url` may appear in many rows over time (history), but at
most one is active at any moment.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY (autoincrement rowid) | Internal; referenced by `click_events.link_id` |
| `original_url` | TEXT | NOT NULL | Trimmed submitted string, stored verbatim; **no** UNIQUE constraint |
| `short_code` | TEXT | NOT NULL, UNIQUE | 7 chars `[A-Za-z0-9]`; never reused, including after expiry |
| `created_at` | TEXT | NOT NULL | Set once on insert; unchanged by renewals |
| `last_submitted_at` | TEXT | NOT NULL | Set on insert; updated on every renewal |
| `expires_at` | TEXT | NOT NULL | `created_at + 24h` initially; reset to `now + 24h` on renewal |
| `total_clicks` | INTEGER | NOT NULL DEFAULT 0 | Incremented atomically per successful redirect |
| `last_clicked_at` | TEXT | NULL | NULL until the first click |

Indexes:

| Index | Columns | Purpose |
|---|---|---|
| (implicit from UNIQUE) | `short_code` | Redirect/analytics lookup; global code uniqueness |
| `idx_links_original_url_expires` | `original_url, expires_at` | Active-record lookup when shortening |

### Derived state

- **Active**: `expires_at > now`. **Expired**: `now >= expires_at`. Not stored; always computed from the transaction's single `now`.
- **Invariant**: for any `original_url`, at most one row has `expires_at > now`. Maintained by the `BEGIN IMMEDIATE` shorten transaction (lookup + renew/insert in one critical section), not by a database constraint (a partial unique index cannot reference "now").

### Validation rules (enforced before persistence)

- `original_url`: trimmed; non-empty; ≤ 2048 characters; scheme `http`/`https` with a non-empty hostname; no other normalization.
- `short_code` (when read from a request path): matches `^[A-Za-z0-9]{7}$`, otherwise treated as unknown.

### State transitions

```text
                 submit URL (no active row)
   (none) ───────────────────────────────────▶  ACTIVE  (new row, new code, 24h TTL, 0 clicks)
                                                 │  ▲
        submit same URL while active             │  │ renew: expires_at = MAX(expires_at, now+24h),
        (HTTP 200, reused=true)  ◀───────────────┘  │ last_submitted_at = now; code/created_at/analytics kept
                                                    │
                  now >= expires_at (time passes)   ▼
                                                 EXPIRED  (terminal for this row; never reactivated)
                                                    │
                      submit same URL again         ▼
                                    new ACTIVE row with a different code, 0 clicks (old row stays as history)
```

Redirects and analytics reads never change `expires_at`.

## Entity: Click Event (`click_events`)

One row per successful redirect. Holds no visitor information.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY | |
| `link_id` | INTEGER | NOT NULL, FOREIGN KEY → `links(id)` | Foreign keys enforced |
| `clicked_at` | TEXT | NOT NULL | Same timestamp written to `links.last_clicked_at` in the same transaction |

Index: `idx_click_events_link_clicked` on `(link_id, clicked_at)` — serves the 24-hour bucket query.

Relationship: `links (1) ── (N) click_events`. Renewals keep the same `links.id`, so click history and
`total_clicks` persist across renewals; an expired-then-recreated URL gets a new `links.id` and starts at zero.

## Schema DDL (reference)

```sql
CREATE TABLE IF NOT EXISTS links (
  id                INTEGER PRIMARY KEY,
  original_url      TEXT    NOT NULL,
  short_code        TEXT    NOT NULL UNIQUE,
  created_at        TEXT    NOT NULL,
  last_submitted_at TEXT    NOT NULL,
  expires_at        TEXT    NOT NULL,
  total_clicks      INTEGER NOT NULL DEFAULT 0,
  last_clicked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_links_original_url_expires ON links (original_url, expires_at);

CREATE TABLE IF NOT EXISTS click_events (
  id         INTEGER PRIMARY KEY,
  link_id    INTEGER NOT NULL REFERENCES links(id),
  clicked_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_click_events_link_clicked ON click_events (link_id, clicked_at);
```

## Transient (non-persisted) shapes

These appear only in API responses; see [contracts/openapi.yaml](contracts/openapi.yaml).

- **Shorten result**: `short_code`, `short_url` (`PUBLIC_BASE_URL` + `/r/` + code), `original_url`, `created_at`, `expires_at`, `reused`.
- **Analytics view**: link fields above plus `total_clicks`, `last_clicked_at` (nullable) and `clicks_by_hour`: exactly 24 `{hour, clicks}` entries, ascending, hours as `YYYY-MM-DDTHH:00:00Z`, zero-filled.

## Failure behaviour

Every state change is a single transaction; on any error it rolls back, leaving no partial link or click
row (FR-015). Data persists in the SQLite file across restarts. Expired rows are never deleted.
