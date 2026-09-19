import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBotText, toSmallCaps } from '../lib/telegram.js';

test('small caps preserve sensitive values inside code blocks', () => {
  const token = 'a8Kd92LmP0xQ7wNz3RtY5UvBc1HsEf';
  const formatted = formatBotText(`Season Token: <code>${token}</code>`);

  assert.match(formatted, new RegExp(`<code>${token}</code>`));
  assert.equal(toSmallCaps('<code>ANM_9E85OA</code>'), '<code>ANM_9E85OA</code>');
});

test('normal visible bot text still uses small caps', () => {
  assert.equal(toSmallCaps('Welcome'), 'ᴡᴇʟᴄᴏᴍᴇ');
});