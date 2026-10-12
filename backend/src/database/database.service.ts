import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getDatabasePath } from '../config/app-config';
import { SCHEMA_SQL } from './schema';

/**
 * Owns the single better-sqlite3 connection. The driver is synchronous, so one connection cannot
 * interleave statements from concurrent requests; cross-process contention is handled by
 * `BEGIN IMMEDIATE` plus the busy timeout.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: Database.Database;

  constructor() {
    const path = getDatabasePath();
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA_SQL);
  }

  onModuleDestroy(): void {
    if (this.db.open) this.db.close();
  }
}
