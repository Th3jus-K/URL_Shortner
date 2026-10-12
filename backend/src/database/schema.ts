export const SCHEMA_SQL = `
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
`;
