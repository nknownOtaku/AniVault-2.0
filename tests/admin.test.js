import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminSource = readFileSync(join(__dirname, '..', 'bot', 'handlers', 'admin.js'), 'utf8');
const routerSource = readFileSync(join(__dirname, '..', 'bot', 'router.js'), 'utf8');

test('database clear requires the exact confirmation phrase', () => {
  assert.match(adminSource, /const CLEAR_DATABASE_PHRASE = 'CLEAR DATABASE';/);
  assert.match(adminSource, /confirmation !== CLEAR_DATABASE_PHRASE/);
});

test('database clear preserves the admin session table', () => {
  assert.doesNotMatch(adminSource, /from\(['"]admin_sessions['"]\)\.delete/);
  assert.match(adminSource, /clearAdminState\(userId, chatId\)/);
});

test('database clear confirmation is routed through the state machine', () => {
  assert.match(routerSource, /BotState\.WAITING_DATABASE_CLEAR_CONFIRM/);
  assert.match(routerSource, /handleDatabaseClearConfirmation\(message\)/);
});