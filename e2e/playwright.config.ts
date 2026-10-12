import { defineConfig, devices } from '@playwright/test';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const e2eDb = path.join(__dirname, '.tmp', 'e2e.db');
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://localhost:9011';

export default defineConfig({
  testDir: './tests',
  // Both projects share one throwaway database, so run strictly one test at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: frontendUrl,
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 } } },
  ],
  webServer: [
    {
      // Port 9010 is fixed in backend/src/main.ts.
      command: `node ${JSON.stringify(path.join(__dirname, 'reset-db.js'))} && npm run start`,
      cwd: path.join(repoRoot, 'backend'),
      url: 'http://localhost:9010/health',
      env: { DATABASE_PATH: e2eDb, PUBLIC_BASE_URL: 'http://localhost:9010' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      cwd: path.join(repoRoot, 'frontend'),
      url: 'http://localhost:9011/',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
