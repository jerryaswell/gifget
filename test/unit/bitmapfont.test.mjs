import test from 'node:test';
import assert from 'node:assert/strict';
import { bitmapText, glyph } from '../../src/lib/bitmapfont.js';

const solid = (img, x, y) => img.data[(y * img.w + x) * 4 + 3] === 255;

test('every glyph is five columns by seven rows', () => {
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !?.,:-_'/+=*#&@$") {
    const rows = glyph(ch);
    assert.equal(rows.length, 7, ch);
    for (const row of rows) assert.match(row, /^[01]{5}$/, ch);
  }
});

test('lowercase is drawn as uppercase, the unknown as a question mark', () => {
  assert.deepEqual(glyph('a'), glyph('A'));
  assert.deepEqual(glyph('é'), glyph('?'));
});

test('a letter comes out as its pattern, scaled by whole pixels', () => {
  const img = bitmapText('T', 14); // scale 2, padding 2
  assert.equal(img.h, 7 * 2 + 4);
  assert.equal(img.w, 5 * 2 + 4);
  for (let x = 0; x < 5; x++) assert.ok(solid(img, 2 + x * 2, 2), 'the bar of the T');
  assert.ok(solid(img, 2 + 2 * 2, 2 + 6 * 2), 'the foot of the stem');
  assert.ok(!solid(img, 2, 2 + 6 * 2), 'nothing beside the stem');
});

test('a long word scales down to fit, never below one pixel', () => {
  const wide = bitmapText('ABCDEFGHIJ', 70, 120);
  assert.ok(wide.w <= 120 + 4);
  const tiny = bitmapText('ABCDEFGHIJ', 70, 10);
  assert.equal(tiny.h, 7 + 2);
});
