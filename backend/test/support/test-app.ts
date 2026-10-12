import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { CLOCK, Clock } from '../../src/common/clock';
import { CODE_GENERATOR, CodeGenerator } from '../../src/common/short-code';

export { FakeClock } from '../../src/common/clock';

export interface ProviderOverride {
  provide: unknown;
  useValue?: unknown;
  useClass?: new (...args: never[]) => unknown;
}

export interface TestAppOptions {
  clock?: Clock;
  codeGenerator?: CodeGenerator;
  overrides?: ProviderOverride[];
  /** Reuse an existing database file (for restart-persistence tests). */
  dbPath?: string;
}

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  dbPath: string;
  /** Closes the app (and its connection); removes the temp directory unless the DB was supplied. */
  close(): Promise<void>;
}

export const TEST_PUBLIC_BASE_URL = 'http://localhost:9010';

const tempDirs: string[] = [];

export function makeTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shortener-test-'));
  tempDirs.push(dir);
  return join(dir, 'test.db');
}

export function cleanupTempFiles(): void {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const dbPath = options.dbPath ?? makeTempDbPath();
  process.env.DATABASE_PATH = dbPath;
  process.env.PUBLIC_BASE_URL = TEST_PUBLIC_BASE_URL;

  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.clock) builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  if (options.codeGenerator) builder = builder.overrideProvider(CODE_GENERATOR).useValue(options.codeGenerator);
  for (const o of options.overrides ?? []) {
    const override = builder.overrideProvider(o.provide);
    builder = o.useClass ? override.useClass(o.useClass) : override.useValue(o.useValue);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.listen(0);

  return {
    app,
    http: request(app.getHttpServer()),
    dbPath,
    close: () => app.close(),
  };
}

/** Independent connection for read assertions. Caller closes it. */
export function openSecondConnection(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  return db;
}

export interface Contender {
  /** Resolves once the child holds the write lock. */
  ready: Promise<void>;
  /** Resolves after the child committed and exited. */
  done: Promise<void>;
}

const CONTENDER_SCRIPT = `
const Database = require(process.argv[1]);
const db = new Database(process.argv[2]);
db.pragma('busy_timeout = 5000');
db.exec('BEGIN IMMEDIATE');
if (process.argv[4]) db.exec(process.argv[4]);
process.stdout.write('LOCKED\\n');
setTimeout(() => { db.exec('COMMIT'); db.close(); }, Number(process.argv[3]));
`;

/**
 * A child process with its own connection that holds `BEGIN IMMEDIATE` for `holdMs`. A second
 * connection in the test's own thread cannot truly contend: better-sqlite3 is synchronous.
 */
export function spawnContender(dbPath: string, opts: { holdMs: number; sql?: string }): Contender {
  const child = spawn(
    process.execPath,
    ['-e', CONTENDER_SCRIPT, require.resolve('better-sqlite3'), dbPath, String(opts.holdMs), opts.sql ?? ''],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('LOCKED')) resolve();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`contender exited with code ${code}`));
    });
  });
  const done = new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`contender exited with code ${code}`))));
  });
  // Avoid unhandled-rejection noise if a test never awaits one of them.
  ready.catch(() => undefined);
  done.catch(() => undefined);
  return { ready, done };
}
