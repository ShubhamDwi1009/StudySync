const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../server');

async function startTestApp() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studysync-'));
  const dbPath = path.join(tempDir, 'studysync.test.db');
  const app = createApp({ dbPath });

  await new Promise((resolve) => {
    app.server.listen(0, '127.0.0.1', resolve);
  });

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    app,
    baseUrl,
    async cleanup() {
      await app.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

test('bootstrap returns seeded StudySync data', async (t) => {
  const fixture = await startTestApp();
  t.after(async () => {
    await fixture.cleanup();
  });

  const response = await fetch(`${fixture.baseUrl}/api/bootstrap`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.ok(payload.meta.appName === 'StudySync');
  assert.ok(payload.subjects.length >= 4);
  assert.equal(payload.planner.length, 7);
  assert.ok(payload.stats.totalSessions >= 1);
  assert.ok(payload.focusTimer);
});

test('focus timer auto-saves a session when it completes', async (t) => {
  const fixture = await startTestApp();
  t.after(async () => {
    await fixture.cleanup();
  });

  const before = await fetch(`${fixture.baseUrl}/api/bootstrap`).then((res) => res.json());

  await fetch(`${fixture.baseUrl}/api/focus-timer/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ durationSec: 600 })
  });

  fixture.app.db.prepare(`
    UPDATE focus_timer
    SET started_at = ?, elapsed_sec = 0
    WHERE id = 1
  `).run(new Date(Date.now() - 11 * 60 * 1000).toISOString());

  const timerResponse = await fetch(`${fixture.baseUrl}/api/focus-timer`);
  const timerPayload = await timerResponse.json();
  const after = await fetch(`${fixture.baseUrl}/api/bootstrap`).then((res) => res.json());

  assert.equal(timerPayload.status, 'completed');
  assert.ok(after.stats.totalSessions === before.stats.totalSessions + 1);
  assert.ok(after.sessions.some((session) => session.source === 'focus'));
});
