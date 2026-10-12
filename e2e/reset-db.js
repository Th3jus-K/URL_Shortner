// Deletes the throwaway e2e database. Run by the backend webServer command *before* the server starts:
// Playwright starts webServers before globalSetup, so a globalSetup reset would delete a file the
// backend already has open.
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '.tmp');
fs.mkdirSync(dir, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(path.join(dir, `e2e.db${suffix}`), { force: true });
}
