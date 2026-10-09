import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBotText, toSmallCaps } from '../lib/telegram.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('small caps preserve sensitive values inside code blocks', () => {
  const token = 'a8Kd92LmP0xQ7wNz3RtY5UvBc1HsEf';
  const formatted = formatBotText(`Season Token: <code>${token}</code>`);

  assert.match(formatted, new RegExp(`<code>${token}</code>`));
  assert.equal(toSmallCaps('<code>ANM_9E85OA</code>'), '<code>ANM_9E85OA</code>');
});

test('normal visible bot text still uses small caps', () => {
  assert.equal(toSmallCaps('Welcome'), 'ᴡᴇʟᴄᴏᴍᴇ');
});

test('temporary file delivery schedules deletion and replies with controls', () => {
  const deliverySource = readFileSync(join(__dirname, '..', 'lib', 'file-delivery.js'), 'utf8');
  const cronSource = readFileSync(join(__dirname, '..', 'app', 'api', 'cron', 'delete-expired', 'route.js'), 'utf8');
  const schemaSource = readFileSync(join(__dirname, '..', 'database-schema.sql'), 'utf8');
  const scheduleFailureBlock = deliverySource.split('if (scheduleError) {')[1].split('\n  }')[0];

  assert.match(deliverySource, /scheduled_message_deletions/);
  assert.match(deliverySource, /reply_parameters: \{ message_id: fileMessageId \}/);
  assert.match(deliverySource, /\?start=\$\{encodeURIComponent\(token\)\}/);
  assert.match(deliverySource, /user_close_delivery_/);
  assert.doesNotMatch(scheduleFailureBlock, /deleteMessage/);
  assert.match(scheduleFailureBlock, /file will remain available/);
  assert.doesNotMatch(deliverySource, /preserveFormatting/);
  assert.doesNotMatch(cronSource, /preserveFormatting/);
  assert.match(cronSource, /Previous Message was Deleted/);
  assert.match(cronSource, /deleteMessage\(task\.telegram_chat_id, task\.file_message_id\)/);
  assert.match(schemaSource, /CREATE EXTENSION IF NOT EXISTS pg_cron/);
  assert.match(schemaSource, /cron\.schedule\(/);
});