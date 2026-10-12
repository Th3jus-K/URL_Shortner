import Database from 'better-sqlite3';
import * as path from 'node:path';

// Test-only helpers: they touch the throwaway e2e database, never product code or data/shortener.db.
const DB_PATH = path.join(__dirname, '..', '.tmp', 'e2e.db');

function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000');
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export interface LinkRow {
  id: number;
  original_url: string;
  short_code: string;
  created_at: string;
  last_submitted_at: string;
  expires_at: string;
  total_clicks: number;
  last_clicked_at: string | null;
}

export function forceExpire(shortCode: string): void {
  const info = withDb((db) =>
    db.prepare("UPDATE links SET expires_at = '2000-01-01T00:00:00Z' WHERE short_code = ?").run(shortCode),
  );
  if (info.changes !== 1) throw new Error(`forceExpire: no link with code ${shortCode}`);
}

export function getLink(shortCode: string): LinkRow | undefined {
  return withDb((db) => db.prepare('SELECT * FROM links WHERE short_code = ?').get(shortCode) as LinkRow | undefined);
}

export function countLinksForUrl(url: string): number {
  return withDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM links WHERE original_url = ?').get(url) as { n: number }).n);
}

export function countClickEvents(shortCode: string): number {
  return withDb(
    (db) =>
      (
        db
          .prepare('SELECT COUNT(*) AS n FROM click_events WHERE link_id = (SELECT id FROM links WHERE short_code = ?)')
          .get(shortCode) as { n: number }
      ).n,
  );
}
