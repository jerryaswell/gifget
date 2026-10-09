import { EFFECTS, effectById } from './lib/effects.js';
import { LIMITS, render, toGif } from './lib/pipeline.js';

const wordEl = document.getElementById('word');
const picksEl = document.getElementById('picks');
const noteEl = document.getElementById('note');
const colorsEl = document.getElementById('colors');
const delayEl = document.getElementById('delay');
const crunchEl = document.getElementById('crunch');
const seedEl = document.getElementById('seed');
const zoomEl = document.getElementById('zoom');
const rerollEl = document.getElementById('reroll');
const wallEl = document.getElementById('wall');
const downloadEl = document.getElementById('download');
const stage = document.getElementById('stage');
const preview = document.getElementById('preview');
const statusEl = document.getElementById('status');

const FONT = '"DejaVu Sans Mono", ui-monospace, Menlo, Consolas, monospace';

let effect = EFFECTS.find((e) => e.id === 'borked');
let wall = false;
let gifUrl = null;
let tileUrl = null;
let tileKey = '';

/* ---------- the word, as pixels ---------- */

/**
 * A text(px) for one canvas width: the word in bold monospace as a white
 * sprite, shrunk if it would not fit across the canvas. Mono and bold reads as
 * terminal or early web without shipping a bitmap font.
 */
function textFor(word, canvasW) {
  const cache = new Map();
  const scratch = document.createElement('canvas').getContext('2d');
  return (px) => {
    if (cache.has(px)) return cache.get(px);
    let size = Math.max(6, Math.round(px));
    scratch.font = 'bold ' + size + 'px ' + FONT;
    const fits = (canvasW * 0.88) / Math.max(1, scratch.measureText(word).width);
    if (fits < 1) size = Math.max(6, Math.floor(size * fits));
    const font = 'bold ' + size + 'px ' + FONT;
    scratch.font = font;
    const w = Math.max(1, Math.ceil(scratch.measureText(word).width) + 4);
    const h = Math.ceil(size * 1.3);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(word, 2, h / 2);
    const { data } = ctx.getImageData(0, 0, w, h);
    // hard edges: anti-aliased fringes would only turn into stray palette entries
    for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 110 ? 255 : 0;
    const sprite = { w, h, data };
    cache.set(px, sprite);
    return sprite;
  };
}

/* ---------- settings: the form, and the URL hash that mirrors it ---------- */

const clampInput = (el, [lo, hi], fallback) => {
  const v = Math.round(Number(el.value));
  return Number.isFinite(v) && el.value !== '' ? Math.min(hi, Math.max(lo, v)) : fallback;
};

function settings() {
  return {
    word: wordEl.value.slice(0, LIMITS.word),
    effect: effect.id,
    colors: clampInput(colorsEl, LIMITS.colors, effect.colors),
    delay: clampInput(delayEl, LIMITS.delay, effect.delay),
    crunch: clampInput(crunchEl, LIMITS.crunch, 2),
    seed: clampInput(seedEl, [1, 999999], 1),
  };
}

function writeHash(s) {
  const params = new URLSearchParams(Object.entries(s).map(([k, v]) => [k, String(v)]));
  history.replaceState(null, '', '#' + params);
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const picked = effectById(params.get('effect'));
  if (picked) effect = picked;
  if (params.has('word')) wordEl.value = params.get('word').slice(0, LIMITS.word);
  colorsEl.value = params.get('colors') ?? effect.colors;
  delayEl.value = params.get('delay') ?? effect.delay;
  if (params.has('crunch')) crunchEl.value = params.get('crunch');
  if (params.has('seed')) seedEl.value = params.get('seed');
}

/* ---------- the effect picker ---------- */

function buildPicks() {
  picksEl.innerHTML = '';
  for (const e of EFFECTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e.name;
    b.dataset.effect = e.id;
    b.addEventListener('click', () => {
      effect = e;
      // each look has its own palette and pace; start from those
      colorsEl.value = e.colors;
      delayEl.value = e.delay;
      markPicks();
      schedule();
    });
    picksEl.append(b);
  }
  markPicks();
}

function markPicks() {
  for (const b of picksEl.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.effect === effect.id));
  }
  noteEl.textContent = effect.note;
}

/* ---------- drawing ---------- */

const slug = (word) =>
  word
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'gifget';

function gifBlob(e, s) {
  const result = render(e, s, textFor(s.word, e.size[0]));
  const bytes = toGif(result);
  return {
    result,
    url: URL.createObjectURL(new Blob([bytes], { type: 'image/gif' })),
    size: bytes.length,
  };
}

function wallpaper(s) {
  const key = s.seed + ':' + s.crunch;
  if (key !== tileKey) {
    if (tileUrl) URL.revokeObjectURL(tileUrl);
    const tile = effectById('tile');
    tileUrl = gifBlob(tile, { ...s, colors: tile.colors, delay: tile.delay }).url;
    tileKey = key;
  }
  return tileUrl;
}

function draw() {
  const s = settings();
  writeHash(s);
  const started = performance.now();
  const { result, url, size } = gifBlob(effect, s);
  if (gifUrl) URL.revokeObjectURL(gifUrl);
  gifUrl = url;

  const zoom = Number(zoomEl.value) || 2;
  preview.src = url;
  preview.width = result.width * zoom;
  preview.height = result.height * zoom;
  preview.alt = effect.tiles
    ? 'An animated seamless tile in the ' + effect.name + ' look'
    : 'The word “' + s.word + '” as an animated GIF in the ' + effect.name + ' look';

  // a tile shows itself repeating; anything else can sit on the tile
  const behind = effect.tiles ? url : wall ? wallpaper(s) : null;
  stage.style.backgroundImage = behind ? 'url("' + behind + '")' : '';
  stage.style.backgroundSize = behind ? 128 * zoom + 'px' : '';

  downloadEl.href = url;
  downloadEl.download = (effect.tiles ? 'tile' : slug(s.word)) + '_' + effect.id + '.gif';
  downloadEl.removeAttribute('aria-disabled');

  const colours = Math.max(...result.frames.map((f) => f.palette.length));
  statusEl.textContent = [
    result.width + '×' + result.height,
    result.frames.length + ' frames at ' + result.delay + ' ms',
    'up to ' + colours + ' colours',
    (size / 1024).toFixed(1) + ' kB',
    'drawn in ' + Math.round(performance.now() - started) + ' ms',
  ].join(' · ');
}

let pending = 0;
function schedule() {
  clearTimeout(pending);
  statusEl.textContent = 'Drawing…';
  downloadEl.setAttribute('aria-disabled', 'true');
  pending = setTimeout(draw, 120);
}

/* ---------- wiring ---------- */

for (const el of [wordEl, colorsEl, delayEl, crunchEl, seedEl, zoomEl]) {
  el.addEventListener('input', schedule);
}

rerollEl.addEventListener('click', () => {
  seedEl.value = 1 + Math.floor(Math.random() * 999999);
  schedule();
});

wallEl.addEventListener('click', () => {
  wall = !wall;
  wallEl.setAttribute('aria-pressed', String(wall));
  schedule();
});

readHash();
buildPicks();
draw();
