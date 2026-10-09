import test from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS } from '../../src/lib/effects.js';
import { PRESETS, applyPreset } from '../../src/lib/presets.js';
import { BASE, LIMITS, fromQuery, normalize, toQuery } from '../../src/lib/settings.js';

test('nothing in, a complete default out', () => {
  const s = normalize({});
  assert.equal(s.word, 'zomnbio');
  for (const key of Object.keys(BASE)) assert.ok(key in s, key);
});

test('numbers are clamped and rounded, junk falls back', () => {
  const s = normalize({ width: 9999, height: -4, frames: '12.6', delay: 'soon', colors: '' });
  assert.equal(s.width, LIMITS.width[1]);
  assert.equal(s.height, LIMITS.height[0]);
  assert.equal(s.frames, 13);
  assert.equal(s.delay, BASE.delay);
  assert.equal(s.colors, BASE.colors);
});

test('unknown choices fall back, unknown effects are dropped', () => {
  const s = normalize({
    style: 'comic-sans',
    animation: 'teleport',
    font: 'wingdings',
    effects: 'grain,lasers,wave',
  });
  assert.equal(s.style, BASE.style);
  assert.equal(s.animation, BASE.animation);
  assert.equal(s.font, BASE.font);
  assert.deepEqual(s.effects, ['wave', 'grain']);
});

test('effects always come out in the order they run, once each', () => {
  const s = normalize({ effects: ['grain', 'decay', 'wave', 'grain'] });
  const order = EFFECTS.map((e) => e.id);
  assert.deepEqual(s.effects, ['wave', 'decay', 'grain']);
  assert.deepEqual(
    [...s.effects].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    s.effects
  );
});

test('colours must be #rrggbb', () => {
  const s = normalize({ face: 'red', accent: '#ABCDEF', ground: '#12345' });
  assert.equal(s.face, BASE.face);
  assert.equal(s.accent, '#abcdef');
  assert.equal(s.ground, BASE.ground);
});

test('the word is cut to length', () => {
  assert.equal(normalize({ word: 'x'.repeat(100) }).word.length, LIMITS.word);
});

test('settings survive the URL hash', () => {
  const s = normalize({
    word: 'void net & co',
    effects: ['wave', 'decay'],
    face: '#ff00aa',
    seed: 77,
  });
  assert.deepEqual(normalize(fromQuery(toQuery(s))), s);
});

test('an empty effects list in the hash means none, not the default', () => {
  const s = normalize(fromQuery('effects='), normalize({ effects: ['decay'] }));
  assert.deepEqual(s.effects, []);
});

test('every preset is valid as written, and keeps the word and seed', () => {
  for (const p of PRESETS) {
    const s = applyPreset(p, { word: 'hello', seed: 5 });
    assert.equal(s.word, 'hello');
    assert.equal(s.seed, 5);
    for (const [key, value] of Object.entries(p.settings)) {
      assert.deepEqual(s[key], value, p.id + '.' + key + ' was not kept as written');
    }
  }
});
