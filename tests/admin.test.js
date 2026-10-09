import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminSource = readFileSync(join(__dirname, '..', 'bot', 'handlers', 'admin.js'), 'utf8');
const routerSource = readFileSync(join(__dirname, '..', 'bot', 'router.js'), 'utf8');
const telegramSource = readFileSync(join(__dirname, '..', 'lib', 'telegram.js'), 'utf8');
const schemaSource = readFileSync(join(__dirname, '..', 'database-schema.sql'), 'utf8');

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

test('broadcast action and message are routed through the admin state machine', () => {
  assert.match(adminSource, /admin_broadcast/);
  assert.match(adminSource, /from\(['"]telegram_users['"]\)/);
  assert.match(adminSource, /sendChatAction\(recipientChatId, 'typing'\)/);
  assert.match(adminSource, /copyMessage\(recipientChatId, sourceChatId, sourceMessageId\)/);
  assert.match(routerSource, /BotState\.WAITING_BROADCAST_MESSAGE/);
  assert.match(routerSource, /handleBroadcastMessage\(message\)/);
  assert.match(adminSource, /BotState\.WAITING_BROADCAST_CONFIRM/);
});

test('private users are persisted for broadcasts', () => {
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS telegram_users/);
  assert.match(routerSource, /saveTelegramUser\(message\.from, message\.chat\)/);
  assert.match(routerSource, /saveTelegramUser\(callbackQuery\.from, callbackQuery\.message\?\.chat\)/);
});

test('broadcast copying preserves Telegram message contents', () => {
  assert.match(telegramSource, /\/copyMessage/);
  assert.match(telegramSource, /from_chat_id: fromChatId/);
  assert.match(telegramSource, /message_id: messageId/);
});