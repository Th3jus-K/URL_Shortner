import { isAbsolute, resolve } from 'node:path';

const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:9010';
const DEFAULT_DATABASE_PATH = '../data/shortener.db';

/** Read at call time (never cached) so each test app can set its own env. */
export function getPublicBaseUrl(): string {
  const raw = process.env.PUBLIC_BASE_URL?.trim() || DEFAULT_PUBLIC_BASE_URL;
  return raw.replace(/\/+$/, '');
}

/** Absolute paths are used as-is; relative ones resolve against `backend/`. */
export function getDatabasePath(): string {
  const raw = process.env.DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
  return isAbsolute(raw) ? raw : resolve(__dirname, '..', '..', raw);
}

export function buildShortUrl(code: string): string {
  return `${getPublicBaseUrl()}/r/${code}`;
}
