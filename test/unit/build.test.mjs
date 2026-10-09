import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = path.join(root, 'dist');

execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });

const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const exists = (file) =>
  access(path.join(dist, file)).then(
    () => true,
    () => false
  );

test('the stylesheet and the script are inlined, not linked', async () => {
  assert.ok(!html.includes('styles.css'), 'no stylesheet left to fetch');
  assert.ok(!html.includes('main.js'), 'no script left to fetch');
  assert.match(html, /<style>[\s\S]*--ink:[\s\S]*<\/style>/, 'the stylesheet is in the page');
  assert.match(html, /<script>[\s\S]*<\/script>/, 'the script is in the page');
});

test('the whole module graph is bundled, not just the entry point', () => {
  assert.ok(html.includes('Liquid wave'), 'the effect list came along');
  assert.ok(html.includes('Bitmap marquee'), 'and the presets');
  assert.ok(html.includes('NETSCAPE2.0'), 'and the encoder with it');
  assert.ok(!html.includes('import '), 'nothing left to resolve at runtime');
});

test('the drawing worker is inlined too, as inert text', () => {
  assert.match(
    html,
    /<script type="text\/plain" id="worker-src">[\s\S]*postMessage[\s\S]*<\/script>/
  );
});

test('the markup the script needs is there', () => {
  for (const id of [
    'word',
    'presets',
    'controls',
    'outputs',
    'look',
    'style',
    'animation',
    'effects',
    'strength',
    'face',
    'accent',
    'ground',
    'colors',
    'lettering',
    'font',
    'weight',
    'size',
    'width',
    'height',
    'frames',
    'delay',
    'crunch',
    'seed',
    'reroll',
    'stage',
    'preview',
    'status',
    'download',
    'wall',
    'zoom',
  ]) {
    assert.ok(html.includes('id="' + id + '"'), 'missing #' + id);
  }
});

test('assets are referenced relatively, so the site works under a subpath', () => {
  assert.doesNotMatch(html, /(?:href|src)="\//, 'no root-relative URLs');
  assert.ok(html.includes('href="./favicon.svg"'));
});

test('everything in public/ is published', async () => {
  for (const file of ['404.html', 'favicon.svg', 'robots.txt', '.nojekyll']) {
    assert.ok(await exists(file), 'missing dist/' + file);
  }
});

test('the page describes itself for a browser tab and a link preview', () => {
  assert.match(html, /<title>gifget<\/title>/);
  assert.match(html, /<meta\s+name="description"/);
  assert.match(html, /<meta\s+property="og:title"/);
  assert.match(html, /<html lang="en">/);
});
