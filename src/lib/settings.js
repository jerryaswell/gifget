/**
 * Everything that decides a GIF, in one object, and the one place that says
 * what a valid value is. The page's form, the URL hash and the presets all go
 * through normalize(), so the pipeline only ever sees settings it can draw.
 */
import { ANIMATIONS } from './animations.js';
import { EFFECTS } from './effects.js';
import { STYLES } from './styles.js';

export const OUTPUTS = [
  { id: 'mark', name: 'Wordmark', note: 'The word, styled and animated.' },
  { id: 'tile', name: 'Seamless tile', note: 'Wallpaper whose edges meet, for behind a wordmark.' },
];

export const FONTS = [
  {
    id: 'mono',
    name: 'Monospace',
    css: '"DejaVu Sans Mono", ui-monospace, Menlo, Consolas, monospace',
  },
  { id: 'bitmap', name: 'Bitmap 5×7', css: null },
  { id: 'sans', name: 'Sans-serif', css: 'Verdana, "DejaVu Sans", Arial, sans-serif' },
  { id: 'serif', name: 'Serif', css: 'Georgia, "DejaVu Serif", "Times New Roman", serif' },
  {
    id: 'impact',
    name: 'Condensed',
    css: 'Impact, "Arial Narrow", "DejaVu Sans Condensed", sans-serif-condensed, sans-serif',
  },
  { id: 'cursive', name: 'Script', css: '"Comic Sans MS", "Brush Script MT", cursive' },
];

export const WEIGHTS = ['bold', 'normal'];

export const LIMITS = {
  word: 24,
  width: [32, 400],
  height: [32, 240],
  frames: [1, 60],
  delay: [20, 1000],
  colors: [2, 32],
  crunch: [1, 4],
  seed: [1, 999999],
  size: [15, 90],
  strength: [1, 3],
};

/** What a preset starts from; a preset only names what it changes. */
export const BASE = {
  output: 'mark',
  style: 'flat',
  animation: 'still',
  effects: [],
  strength: 1,
  face: '#39ff14',
  accent: '#b0001a',
  ground: '#050201',
  font: 'mono',
  weight: 'bold',
  size: 42,
  width: 300,
  height: 130,
  frames: 24,
  delay: 80,
  colors: 12,
  crunch: 2,
};

const COLOR = /^#[0-9a-f]{6}$/i;

const oneOf = (value, list, fallback) => (list.some((x) => x.id === value) ? value : fallback);

function number(value, [lo, hi], fallback) {
  const n = Math.round(Number(value));
  return value === '' || value == null || !Number.isFinite(n)
    ? fallback
    : Math.min(hi, Math.max(lo, n));
}

/** Any partial or untrusted settings in, complete and valid settings out. */
export function normalize(raw = {}, fallback = { ...BASE, word: 'zomnbio', seed: 1 }) {
  const picked = Array.isArray(raw.effects)
    ? raw.effects
    : typeof raw.effects === 'string'
      ? raw.effects.split(',')
      : fallback.effects;
  const s = {
    word: String(raw.word ?? fallback.word).slice(0, LIMITS.word),
    output: oneOf(raw.output, OUTPUTS, fallback.output),
    style: oneOf(raw.style, STYLES, fallback.style),
    animation: oneOf(raw.animation, ANIMATIONS, fallback.animation),
    // canonical order, no repeats, nothing unknown
    effects: EFFECTS.map((e) => e.id).filter((id) => picked.includes(id)),
    strength: number(raw.strength, LIMITS.strength, fallback.strength),
    face: COLOR.test(raw.face) ? raw.face.toLowerCase() : fallback.face,
    accent: COLOR.test(raw.accent) ? raw.accent.toLowerCase() : fallback.accent,
    ground: COLOR.test(raw.ground) ? raw.ground.toLowerCase() : fallback.ground,
    font: oneOf(raw.font, FONTS, fallback.font),
    weight: WEIGHTS.includes(raw.weight) ? raw.weight : fallback.weight,
    size: number(raw.size, LIMITS.size, fallback.size),
    width: number(raw.width, LIMITS.width, fallback.width),
    height: number(raw.height, LIMITS.height, fallback.height),
    frames: number(raw.frames, LIMITS.frames, fallback.frames),
    delay: number(raw.delay, LIMITS.delay, fallback.delay),
    colors: number(raw.colors, LIMITS.colors, fallback.colors),
    crunch: number(raw.crunch, LIMITS.crunch, fallback.crunch),
    seed: number(raw.seed, LIMITS.seed, fallback.seed),
  };
  if (s.output === 'tile') {
    // a tile is built from 4px blocks, and its effects need whole blocks to wrap on
    s.width -= s.width % 4;
    s.height -= s.height % 4;
    s.effects = s.effects.filter((id) => EFFECTS.find((e) => e.id === id).tile);
  }
  return s;
}

/** Settings as a query string, for the URL hash. */
export const toQuery = (s) =>
  new URLSearchParams(
    Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])
  ).toString();

/** A query string back to raw settings, for normalize() to check. */
export const fromQuery = (query) => Object.fromEntries(new URLSearchParams(query));
