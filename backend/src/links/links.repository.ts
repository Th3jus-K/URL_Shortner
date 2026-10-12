import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

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

export interface NewLink {
  originalUrl: string;
  shortCode: string;
  createdAt: string;
  lastSubmittedAt: string;
  expiresAt: string;
}

/** Parameterized SQL only. Every statement is synchronous. */
@Injectable()
export class LinksRepository {
  constructor(private readonly database: DatabaseService) {}

  insertLink(link: NewLink): number {
    const info = this.database.db
      .prepare(
        `INSERT INTO links (original_url, short_code, created_at, last_submitted_at, expires_at)
         VALUES (@originalUrl, @shortCode, @createdAt, @lastSubmittedAt, @expiresAt)`,
      )
      .run(link);
    return Number(info.lastInsertRowid);
  }

  findById(id: number): LinkRow | undefined {
    return this.database.db.prepare('SELECT * FROM links WHERE id = ?').get(id) as LinkRow | undefined;
  }

  findByCode(shortCode: string): LinkRow | undefined {
    return this.database.db.prepare('SELECT * FROM links WHERE short_code = ?').get(shortCode) as
      | LinkRow
      | undefined;
  }

  insertClickEvent(linkId: number, clickedAt: string): void {
    this.database.db.prepare('INSERT INTO click_events (link_id, clicked_at) VALUES (?, ?)').run(linkId, clickedAt);
  }

  incrementClicks(linkId: number, now: string): void {
    this.database.db
      .prepare('UPDATE links SET total_clicks = total_clicks + 1, last_clicked_at = ? WHERE id = ?')
      .run(now, linkId);
  }

  /** `windowStart` is a full UTC timestamp; `hour` is the 13-char prefix `YYYY-MM-DDTHH`. */
  clicksGroupedByHour(linkId: number, windowStart: string): { hour: string; clicks: number }[] {
    return this.database.db
      .prepare(
        `SELECT substr(clicked_at, 1, 13) AS hour, COUNT(*) AS clicks
         FROM click_events WHERE link_id = ? AND clicked_at >= ? GROUP BY hour`,
      )
      .all(linkId, windowStart) as { hour: string; clicks: number }[];
  }

  /** The active row for a URL: `expires_at > now`, most recent first. */
  findActiveByUrl(originalUrl: string, now: string): LinkRow | undefined {
    return this.database.db
      .prepare('SELECT * FROM links WHERE original_url = ? AND expires_at > ? ORDER BY id DESC LIMIT 1')
      .get(originalUrl, now) as LinkRow | undefined;
  }

  /**
   * Never shortens an expiry (`MAX`) and never revives an expired row (`expires_at > now` guard).
   * Returns the number of rows changed (0 when the link is no longer active).
   */
  renewLink(id: number, newExpiresAt: string, now: string): number {
    return this.database.db
      .prepare(
        `UPDATE links SET expires_at = MAX(expires_at, @newExpiresAt), last_submitted_at = @now
         WHERE id = @id AND expires_at > @now`,
      )
      .run({ id, newExpiresAt, now }).changes;
  }
}
