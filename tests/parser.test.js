import assert from 'node:assert/strict';
import test from 'node:test';

import { parseFilename, normalizeQuality, getResolution } from '../lib/parser.js';
import { generateToken, generateId } from '../lib/tokens.js';

// ---------------------------------------------------------------------------
// Filename parsing - the happy paths from the spec (sections 29, 65)
// ---------------------------------------------------------------------------

test('parses a standard [Sxx-Exx] sub file', () => {
  const parsed = parseFilename('[S01-E05] Jujutsu Kaisen [1080p] [Sub].mkv');

  assert.equal(parsed.valid, true);
  assert.equal(parsed.season, 1);
  assert.equal(parsed.episode, 5);
  assert.equal(parsed.quality, '1080p');
  assert.equal(parsed.resolution, '1920x1080');
  assert.equal(parsed.languageType, 'sub');
  assert.equal(parsed.extension, 'mkv');
  assert.deepEqual(parsed.errors, []);
});

test('parses a dub mp4 file', () => {
  const parsed = parseFilename('[S01-E06] Jujutsu Kaisen [720p] [Dub].mp4');

  assert.equal(parsed.valid, true);
  assert.equal(parsed.episode, 6);
  assert.equal(parsed.quality, '720p');
  assert.equal(parsed.languageType, 'dub');
  assert.equal(parsed.extension, 'mp4');
});

test('parses the S01E05 shorthand without brackets', () => {
  const parsed = parseFilename('Jujutsu Kaisen S01E05 1080p Sub.mkv');

  assert.equal(parsed.valid, true);
  assert.equal(parsed.season, 1);
  assert.equal(parsed.episode, 5);
  assert.equal(parsed.quality, '1080p');
  assert.equal(parsed.languageType, 'sub');
});

test('parses a bare 1080p token outside brackets', () => {
  const parsed = parseFilename('Jujutsu.Kaisen.S02E03.1080p.WEB-DL.mkv');

  assert.equal(parsed.season, 2);
  assert.equal(parsed.episode, 3);
  assert.equal(parsed.quality, '1080p');
});

// ---------------------------------------------------------------------------
// Unparseable files must be reported, never silently accepted (section 32)
// ---------------------------------------------------------------------------

test('flags an unparseable filename and lists every missing field', () => {
  const parsed = parseFilename('random-video.mkv');

  assert.equal(parsed.valid, false);
  assert.equal(parsed.extension, 'mkv');
  assert.ok(parsed.errors.includes('Season'));
  assert.ok(parsed.errors.includes('Episode'));
  assert.ok(parsed.errors.includes('Quality'));
  assert.ok(parsed.errors.includes('Language'));
});

// ---------------------------------------------------------------------------
// Quality normalisation (section 30)
// ---------------------------------------------------------------------------

test('normalises resolution aliases to the canonical form', () => {
  assert.equal(normalizeQuality('1080'), '1080p');
  assert.equal(normalizeQuality('1080P'), '1080p');
  assert.equal(normalizeQuality('FHD'), '1080p');
  assert.equal(normalizeQuality('FullHD'), '1080p');

  assert.equal(normalizeQuality('720'), '720p');
  assert.equal(normalizeQuality('720p'), '720p');
  assert.equal(normalizeQuality('HD'), '720p');

  assert.equal(normalizeQuality('480'), '480p');
  assert.equal(normalizeQuality('SD'), '480p');
});

test('keeps HDRIP intact regardless of case or separators', () => {
  // Regression: a naive `replace('P', '')` stripped the P from HDRIP.
  assert.equal(normalizeQuality('HDRIP'), 'HDRIP');
  assert.equal(normalizeQuality('Hdrip'), 'HDRIP');
  assert.equal(normalizeQuality('hdrip'), 'HDRIP');
  assert.equal(normalizeQuality('HD-RIP'), 'HDRIP');
  assert.equal(normalizeQuality('HD RIP'), 'HDRIP');
});

test('normalises 4K/UHD aliases', () => {
  assert.equal(normalizeQuality('2160'), '2160p');
  assert.equal(normalizeQuality('4K'), '2160p');
  assert.equal(normalizeQuality('UHD'), '2160p');
});

test('returns null for empty quality input', () => {
  assert.equal(normalizeQuality(null), null);
  assert.equal(normalizeQuality(''), null);
});

test('maps qualities to resolutions', () => {
  assert.equal(getResolution('2160p'), '3840x2160');
  assert.equal(getResolution('1080p'), '1920x1080');
  assert.equal(getResolution('720p'), '1280x720');
  assert.equal(getResolution('480p'), '854x480');
  assert.equal(getResolution('HDRIP'), null);
});

// ---------------------------------------------------------------------------
// Tokens and IDs (sections 15, 40)
// ---------------------------------------------------------------------------

test('generates 30-character alphanumeric tokens', () => {
  const token = generateToken();
  assert.equal(token.length, 30);
  assert.match(token, /^[A-Za-z0-9]{30}$/);
});

test('generates distinct tokens across many calls', () => {
  const tokens = new Set();
  for (let i = 0; i < 500; i++) {
    tokens.add(generateToken());
  }
  assert.equal(tokens.size, 500);
});

test('generates prefixed internal IDs', () => {
  const id = generateId('ANM');
  assert.match(id, /^ANM_[A-Z0-9]{6}$/);

  // An ID is not a secret, but it must still not repeat.
  const ids = new Set();
  for (let i = 0; i < 500; i++) {
    ids.add(generateId('FIL'));
  }
  assert.equal(ids.size, 500);
});
