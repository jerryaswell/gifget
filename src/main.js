import { ANIMATIONS } from './lib/animations.js';
import { bitmapText } from './lib/bitmapfont.js';
import { EFFECTS } from './lib/effects.js';
import { render, toGif } from './lib/pipeline.js';
import { PRESETS, applyPreset, presetById } from './lib/presets.js';
import { BASE, FONTS, LIMITS, OUTPUTS, fromQuery, normalize, toQuery } from './lib/settings.js';
import { STYLES } from './lib/styles.js';

const $ = (id) => document.getElementById(id);

const wordEl = $('word');
const form = $('controls');
const stage = $('stage');
const preview = $('preview');
const statusEl = $('status');
const downloadEl = $('download');
const wallEl = $('wall');
const zoomEl = $('zoom');

/** The form controls that map one-to-one onto a setting of the same name. */
const FIELDS = ['style', 'animation', 'strength', 'face', 'accent', 'ground', 'colors', 'font'];
const MORE = ['weight', 'size', 'width', 'height', 'frames', 'delay', 'crunch', 'seed'];

/* ---------- building the controls from the registries ---------- */

function options(select, list) {
  select.replaceChildren(
    ...list.map(({ id, name }) =>
      Object.assign(document.createElement('option'), { value: id, textContent: name })
    )
  );
}

function buildControls() {
  options($('style'), STYLES);
  options($('animation'), ANIMATIONS);
  options($('font'), FONTS);

  $('outputs').replaceChildren(
    ...OUTPUTS.map(({ id, name }) => {
      const label = document.createElement('label');
      const input = Object.assign(document.createElement('input'), {
        type: 'radio',
        name: 'output',
        value: id,
      });
      label.append(input, ' ' + name);
      return label;
    })
  );

  $('effects').replaceChildren(
    ...EFFECTS.map(({ id, name, note }) => {
      const label = document.createElement('label');
      label.className = 'check';
      const input = Object.assign(document.createElement('input'), {
        type: 'checkbox',
        name: 'effect',
        value: id,
      });
      const noteEl = Object.assign(document.createElement('span'), {
        className: 'note',
        id: 'effect-note-' + id,
        textContent: note,
      });
      input.setAttribute('aria-describedby', noteEl.id);
      const text = Object.assign(document.createElement('span'), { textContent: name });
      label.append(input, text, noteEl);
      return label;
    })
  );

  $('presets').replaceChildren(
    ...PRESETS.map(({ id, name }) => {
      const b = Object.assign(document.createElement('button'), {
        type: 'button',
        textContent: name,
      });
      b.dataset.preset = id;
      return b;
    })
  );
}

/* ---------- the form and the settings it holds ---------- */

function readForm() {
  const raw = { word: wordEl.value };
  for (const id of [...FIELDS, ...MORE]) raw[id] = $(id).value;
  raw.output = form.querySelector('input[name="output"]:checked')?.value;
  raw.effects = [...form.querySelectorAll('input[name="effect"]:checked')].map((i) => i.value);
  return normalize(raw);
}

function writeForm(s) {
  wordEl.value = s.word;
  for (const id of [...FIELDS, ...MORE]) $(id).value = s[id];
  for (const r of form.querySelectorAll('input[name="output"]')) r.checked = r.value === s.output;
  for (const c of form.querySelectorAll('input[name="effect"]'))
    c.checked = s.effects.includes(c.value);
  reflect(s);
}

/** Notes, readouts and what a tile has no use for. */
function reflect(s) {
  const tile = s.output === 'tile';
  $('output-note').textContent = OUTPUTS.find((o) => o.id === s.output).note;
  $('style-note').textContent = STYLES.find((x) => x.id === s.style).note;
  $('animation-note').textContent = ANIMATIONS.find((x) => x.id === s.animation).note;
  $('strength-out').textContent = ['', 'subtle', 'medium', 'heavy'][s.strength];
  $('size-out').textContent = s.size + '%';
  // a tile has no word, so nothing to style, animate or letter
  $('look').disabled = tile;
  $('lettering').disabled = tile;
  wordEl.disabled = tile;
  $('weight').disabled = tile || s.font === 'bitmap';
  for (const c of form.querySelectorAll('input[name="effect"]')) {
    c.disabled = tile && !EFFECTS.find((e) => e.id === c.value).tile;
  }
}

/* ---------- the word, as pixels ---------- */

/**
 * The word as a white sprite, about px high and no wider than maxW: from the
 * bitmap font, or from a system font on a canvas with the anti-aliasing cut
 * off, since soft edges would only become stray palette entries.
 */
function wordSprite(s) {
  const px = (s.height * s.size) / 100;
  const maxW = s.width * 0.88;
  if (s.output === 'tile') return { w: 1, h: 1, data: new Uint8ClampedArray(4) };
  if (s.font === 'bitmap') return bitmapText(s.word, px, maxW);

  const family = FONTS.find((f) => f.id === s.font).css;
  const ctx = document.createElement('canvas').getContext('2d');
  let size = Math.max(6, Math.round(px));
  ctx.font = s.weight + ' ' + size + 'px ' + family;
  const fits = maxW / Math.max(1, ctx.measureText(s.word).width);
  if (fits < 1) size = Math.max(6, Math.floor(size * fits));
  const font = s.weight + ' ' + size + 'px ' + family;
  ctx.font = font;
  const w = Math.max(1, Math.ceil(ctx.measureText(s.word).width) + 4);
  const h = Math.ceil(size * 1.3);
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const c = canvas.getContext('2d');
  c.font = font;
  c.textBaseline = 'middle';
  c.fillStyle = '#fff';
  c.fillText(s.word, 2, h / 2);
  const { data } = c.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] >= 110 ? 255 : 0;
  return { w, h, data };
}

/* ---------- drawing, off the main thread when it can be ---------- */

let worker = null;
let busy = false;
let asked = 0;
let abandon = null;

function spawn() {
  // the build inlines the worker into the page; in development it is its own module
  const inlined = document.getElementById('worker-src');
  const w = inlined
    ? new Worker(URL.createObjectURL(new Blob([inlined.textContent], { type: 'text/javascript' })))
    : new Worker('./worker.js', { type: 'module' });
  return w;
}

/** Make a GIF; resolves with { bytes, info }, or null if a newer request took over. */
function make(settings, sprite) {
  const id = ++asked;
  return new Promise((resolve, reject) => {
    const local = () => {
      try {
        const r = render(settings, () => sprite);
        const bytes = toGif(r);
        resolve({
          bytes,
          info: {
            settings: r.settings,
            width: r.width,
            height: r.height,
            frames: r.frames.length,
            delay: r.delay,
            colours: Math.max(...r.frames.map((f) => f.palette.length)),
          },
        });
      } catch (err) {
        reject(err);
      }
    };
    try {
      // a worker still busy on a stale request is abandoned, not waited for
      if (busy && worker) {
        worker.terminate();
        worker = null;
        abandon?.();
      }
      worker ??= spawn();
    } catch {
      local();
      return;
    }
    busy = true;
    abandon = () => resolve(null);
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      busy = false;
      if (id !== asked) return resolve(null);
      if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      busy = false;
      worker = null;
      local();
    };
    worker.postMessage({ id, settings, sprite });
  });
}

let gifUrl = null;
let wallUrl = null;
let wallKey = '';
let lastTile = null;
let wall = false;

const slug = (word) =>
  word
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'gifget';

/** What sits behind a wordmark: the last tile made here, or one in the wordmark's colours. */
async function wallpaper(s) {
  const tile = lastTile ?? applyPreset(presetById('tile'), { word: s.word, seed: s.seed });
  const settings = lastTile ? tile : { ...tile, face: s.face, accent: s.accent, ground: s.ground };
  const key = toQuery(settings);
  if (key !== wallKey) {
    const made = await make(normalize(settings), wordSprite(settings));
    if (!made) return null;
    if (wallUrl) URL.revokeObjectURL(wallUrl);
    wallUrl = URL.createObjectURL(new Blob([made.bytes], { type: 'image/gif' }));
    wallKey = key;
  }
  return { url: wallUrl, size: normalize(settings).width };
}

/** Bumped by every change, so a draw that finishes after a newer change is dropped. */
let generation = 0;

async function draw() {
  const mine = generation;
  const s = readForm();
  reflect(s);
  history.replaceState(null, '', '#' + toQuery(s));
  const started = performance.now();
  let made;
  try {
    made = await make(s, wordSprite(s));
  } catch (err) {
    statusEl.textContent = 'Could not draw this one: ' + err.message;
    return;
  }
  if (!made || mine !== generation) return;
  const { bytes, info } = made;
  if (gifUrl) URL.revokeObjectURL(gifUrl);
  gifUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
  const tile = s.output === 'tile';
  if (tile) lastTile = s;

  const zoom = Number(zoomEl.value) || 2;
  preview.src = gifUrl;
  preview.width = info.width * zoom;
  preview.height = info.height * zoom;
  preview.alt = tile
    ? 'An animated seamless tile'
    : 'The word “' + s.word + '” as an animated GIF: ' + describe(s);

  const behind = tile ? { url: gifUrl, size: info.width } : wall ? await wallpaper(s) : null;
  if (mine !== generation) return;
  stage.style.backgroundImage = behind ? 'url("' + behind.url + '")' : '';
  stage.style.backgroundSize = behind ? behind.size * zoom + 'px' : '';

  downloadEl.href = gifUrl;
  downloadEl.download = (tile ? 'tile' : slug(s.word)) + '-' + s.seed + '.gif';
  downloadEl.removeAttribute('aria-disabled');
  statusEl.textContent = [
    info.width + '×' + info.height,
    info.frames + (info.frames === 1 ? ' frame' : ' frames at ' + info.delay + ' ms'),
    'up to ' + info.colours + ' colours',
    (bytes.length / 1024).toFixed(1) + ' kB',
    'drawn in ' + Math.round(performance.now() - started) + ' ms',
  ].join(' · ');
}

const describe = (s) =>
  [
    STYLES.find((x) => x.id === s.style).name.toLowerCase(),
    ANIMATIONS.find((x) => x.id === s.animation).name.toLowerCase(),
    ...s.effects.map((id) => EFFECTS.find((e) => e.id === id).name.toLowerCase()),
  ].join(', ');

let pending = 0;
function schedule() {
  generation++;
  clearTimeout(pending);
  statusEl.textContent = 'Drawing…';
  downloadEl.setAttribute('aria-disabled', 'true');
  pending = setTimeout(draw, 150);
}

/* ---------- wiring ---------- */

buildControls();
writeForm(
  normalize(
    fromQuery(location.hash.slice(1)),
    normalize({ ...BASE, ...presetById('borked').settings })
  )
);

form.addEventListener('input', () => {
  reflect(readForm());
  schedule();
});
form.addEventListener('submit', (e) => e.preventDefault());
wordEl.addEventListener('input', schedule);
zoomEl.addEventListener('input', schedule);

$('presets').addEventListener('click', (e) => {
  const id = e.target.closest('button')?.dataset.preset;
  if (!id) return;
  const current = readForm();
  writeForm(applyPreset(presetById(id), current));
  schedule();
});

$('reroll').addEventListener('click', () => {
  $('seed').value = 1 + Math.floor(Math.random() * (LIMITS.seed[1] - 1));
  schedule();
});

wallEl.addEventListener('click', () => {
  wall = !wall;
  wallEl.setAttribute('aria-pressed', String(wall));
  schedule();
});

draw();
