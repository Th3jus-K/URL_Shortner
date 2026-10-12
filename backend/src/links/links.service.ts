import { Inject, Injectable } from '@nestjs/common';
import { buildShortUrl } from '../config/app-config';
import { CLOCK, Clock } from '../common/clock';
import { CODE_GENERATOR, CodeGenerator, SHORT_CODE_PATTERN } from '../common/short-code';
import { HourBucket, addHours, buildHourBuckets, floorToHour, toUtcString } from '../common/time';
import { DatabaseService } from '../database/database.service';
import { LinkRow, LinksRepository } from './links.repository';

export const TTL_HOURS = 24;
const MAX_CODE_ATTEMPTS = 5;

export interface ShortenResult {
  short_code: string;
  short_url: string;
  original_url: string;
  created_at: string;
  expires_at: string;
  reused: boolean;
}

export type ClickResult =
  | { status: 'ok'; originalUrl: string }
  | { status: 'not_found' }
  | { status: 'expired' };

export interface AnalyticsResult {
  short_code: string;
  original_url: string;
  short_url: string;
  created_at: string;
  expires_at: string;
  total_clicks: number;
  last_clicked_at: string | null;
  clicks_by_hour: HourBucket[];
}

export type AnalyticsOutcome =
  | { status: 'ok'; analytics: AnalyticsResult }
  | { status: 'not_found' }
  | { status: 'expired' };

function isShortCodeCollision(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  return e?.code === 'SQLITE_CONSTRAINT_UNIQUE' && /links\.short_code/.test(e.message ?? '');
}

@Injectable()
export class LinksService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: LinksRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CODE_GENERATOR) private readonly generateCode: CodeGenerator,
  ) {}

  /** `url` has been validated by the DTO; it is trimmed again here so the service is safe on its own. */
  shorten(url: string): ShortenResult {
    const originalUrl = url.trim();
    const run = this.database.db.transaction((): ShortenResult => {
      const now = this.clock.now();
      const nowText = toUtcString(now);

      const active = this.repository.findActiveByUrl(originalUrl, nowText);
      if (active) {
        const changed = this.repository.renewLink(active.id, toUtcString(addHours(now, TTL_HOURS)), nowText);
        if (changed === 1) {
          const renewed = this.repository.findById(active.id);
          if (!renewed) throw new Error('renewed link not found');
          return this.toShortenResult(renewed, true);
        }
        // The guarded update matched nothing: the link expired meanwhile. Never revive it.
      }

      const link = this.insertWithFreshCode(originalUrl, now);
      return this.toShortenResult(link, false);
    });
    return run.immediate();
  }

  /** One `BEGIN IMMEDIATE` transaction: expiry decision, click event and counter share one `now`. */
  recordClick(code: string): ClickResult {
    if (!SHORT_CODE_PATTERN.test(code)) return { status: 'not_found' };

    const run = this.database.db.transaction((): ClickResult => {
      const nowText = toUtcString(this.clock.now());
      const link = this.repository.findByCode(code);
      if (!link) return { status: 'not_found' };
      if (nowText >= link.expires_at) return { status: 'expired' };
      this.repository.insertClickEvent(link.id, nowText);
      this.repository.incrementClicks(link.id, nowText);
      return { status: 'ok', originalUrl: link.original_url };
    });
    return run.immediate();
  }

  /** Read-only: no writes, never renews expiry. */
  getAnalytics(code: string): AnalyticsOutcome {
    if (!SHORT_CODE_PATTERN.test(code)) return { status: 'not_found' };

    const now = this.clock.now();
    const nowText = toUtcString(now);
    const link = this.repository.findByCode(code);
    if (!link) return { status: 'not_found' };
    if (nowText >= link.expires_at) return { status: 'expired' };

    const windowStart = toUtcString(addHours(floorToHour(now), -23));
    const rows = this.repository.clicksGroupedByHour(link.id, windowStart);
    return {
      status: 'ok',
      analytics: {
        short_code: link.short_code,
        original_url: link.original_url,
        short_url: buildShortUrl(link.short_code),
        created_at: link.created_at,
        expires_at: link.expires_at,
        total_clicks: link.total_clicks,
        last_clicked_at: link.last_clicked_at,
        clicks_by_hour: buildHourBuckets(now, rows),
      },
    };
  }

  private insertWithFreshCode(originalUrl: string, now: Date): LinkRow {
    const nowText = toUtcString(now);
    const expiresAt = toUtcString(addHours(now, TTL_HOURS));
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      try {
        const id = this.repository.insertLink({
          originalUrl,
          shortCode: this.generateCode(),
          createdAt: nowText,
          lastSubmittedAt: nowText,
          expiresAt,
        });
        const row = this.repository.findById(id);
        if (!row) throw new Error('inserted link not found');
        return row;
      } catch (error) {
        if (!isShortCodeCollision(error)) throw error;
      }
    }
    throw new Error('could not allocate a unique short code');
  }

  private toShortenResult(link: LinkRow, reused: boolean): ShortenResult {
    return {
      short_code: link.short_code,
      short_url: buildShortUrl(link.short_code),
      original_url: link.original_url,
      created_at: link.created_at,
      expires_at: link.expires_at,
      reused,
    };
  }
}
