import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Session-state regression tests.
 *
 * These guard the bug that made the "Add Season" button appear dead. The root
 * cause was `getAdminState()` using `.limit(1).maybeSingle()`: PostgREST's
 * single-row helpers error when a query matches more than one row, and
 * duplicate `admin_sessions` rows are possible on databases created before the
 * unique index existed. The helper then returned null, which `setAdminState`
 * read as "no session" and responded to by inserting yet another row - so the
 * state the next step depended on was never found.
 *
 * `lib/session.js` imports a live Supabase client at module load, so these
 * tests assert the query *shape* (the part that actually changed) rather than
 * driving the module against a fake server. That keeps the tests dependency-free
 * and still fails if someone reintroduces the unsafe call.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const sessionSource = readFileSync(join(__dirname, '..', 'lib', 'session.js'), 'utf8');

/**
 * Strip line and block comments so assertions test the CODE, not the prose.
 * Without this, an explanatory comment mentioning `.maybeSingle()` would make
 * the regression test fail on a correct implementation.
 * @param {string} source
 * @returns {string}
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const getAdminStateBody = stripComments(
  sessionSource.slice(
    sessionSource.indexOf('export async function getAdminState'),
    sessionSource.indexOf('export async function setAdminState')
  )
);

const setAdminStateBody = stripComments(
  sessionSource.slice(sessionSource.indexOf('export async function setAdminState'))
);

test('getAdminState does not use maybeSingle (duplicate-row safe)', () => {
  assert.ok(
    !/\.maybeSingle\(\)/.test(getAdminStateBody),
    'getAdminState must not call .maybeSingle() - it errors on duplicate rows'
  );

  assert.ok(
    /\.limit\(1\)/.test(getAdminStateBody),
    'getAdminState should bound the result with .limit(1)'
  );
});

test('getAdminState orders by updated_at so the newest session wins', () => {
  assert.match(
    getAdminStateBody,
    /\.order\('updated_at',\s*\{\s*ascending:\s*false\s*\}\)/,
    'getAdminState must order by updated_at descending to pick the newest row'
  );
});

test('getAdminState tolerates an array result', () => {
  assert.ok(
    /Array\.isArray\(data\)/.test(getAdminStateBody),
    'getAdminState must handle both array and object responses'
  );
});

test('setAdminState handles an array response from update/insert', () => {
  assert.ok(
    /Array\.isArray\(updated\)/.test(setAdminStateBody),
    'update path must not assume a single object comes back'
  );

  assert.ok(
    /Array\.isArray\(inserted\)/.test(setAdminStateBody),
    'insert path must not assume a single object comes back'
  );
});

test('setAdminState recovers from a unique-violation race', () => {
  // 23505 = unique_violation in PostgreSQL.
  assert.ok(
    /23505/.test(setAdminStateBody),
    'a concurrent insert must be recovered from instead of failing the user action'
  );
});

test('season callbacks use the Telegram message payload for edits', () => {
  const seasonSource = readFileSync(join(__dirname, '..', 'bot', 'handlers', 'season.js'), 'utf8');
  assert.match(
    seasonSource,
    /const messageId = callbackQuery\.message\.message_id;/,
    'season button handlers must read message_id from callbackQuery.message'
  );
  assert.doesNotMatch(
    seasonSource,
    /const messageId = callbackQuery\.message_id;/,
    'season handlers must not read message_id from the callback root'
  );
});