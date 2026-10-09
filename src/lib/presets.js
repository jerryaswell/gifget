/**
 * Starting points: the looks of the original zomnbio pipeline, written as
 * settings. A preset is only a shortcut. Picking one fills in the form, and
 * every control stays free to change afterwards. Picking a preset keeps the
 * word and the seed.
 */
import { BASE, normalize } from './settings.js';

export const PRESETS = [
  {
    id: 'spin',
    name: 'Green spin',
    settings: {
      animation: 'spin',
      face: '#33ff33',
      ground: '#000000',
      width: 240,
      height: 120,
      size: 32,
      delay: 60,
      colors: 8,
    },
  },
  {
    id: 'card',
    name: 'Card turn',
    settings: {
      animation: 'card',
      face: '#4dff6a',
      ground: '#000000',
      width: 280,
      height: 120,
      frames: 30,
      delay: 50,
    },
  },
  {
    id: 'horror',
    name: 'Horror card',
    settings: {
      animation: 'card',
      face: '#8a8f2a',
      ground: '#0b0a04',
      width: 280,
      height: 120,
      frames: 30,
      delay: 110,
      colors: 10,
    },
  },
  {
    id: 'deep3d',
    name: 'Deep 3D',
    settings: {
      style: 'extrude',
      animation: 'rock',
      face: '#ffd23f',
      accent: '#c2410c',
      ground: '#04040c',
      width: 320,
      height: 160,
      size: 40,
      delay: 70,
      colors: 16,
    },
  },
  {
    id: 'chrome',
    name: 'Cyan chrome',
    settings: {
      style: 'chrome',
      effects: ['glint'],
      face: '#5ff6ff',
      accent: '#3a6f8f',
      ground: '#020611',
      width: 320,
      height: 140,
      frames: 20,
      colors: 16,
    },
  },
  {
    id: 'glitch',
    name: 'VHS glitch',
    settings: {
      animation: 'sway',
      effects: ['flicker', 'split', 'slice', 'scanlines', 'grain'],
      face: '#39ff14',
      accent: '#b0001a',
      ground: '#030303',
      frames: 20,
      colors: 14,
    },
  },
  {
    id: 'aberration',
    name: 'Heavy RGB split',
    settings: {
      animation: 'sway',
      effects: ['flicker', 'split', 'slice', 'scanlines', 'grain'],
      strength: 3,
      face: '#39ff14',
      accent: '#b0001a',
      ground: '#030303',
      frames: 20,
      colors: 16,
    },
  },
  {
    id: 'neon',
    name: 'Liquid neon',
    settings: {
      style: 'shadow',
      effects: ['wave'],
      face: '#ff2bd6',
      accent: '#7a1fff',
      ground: '#08010d',
      delay: 60,
    },
  },
  {
    id: 'slime',
    name: 'Melting slime',
    settings: {
      style: 'slime',
      effects: ['melt'],
      strength: 2,
      face: '#7dff3a',
      ground: '#020802',
      height: 160,
      size: 36,
      colors: 14,
    },
  },
  {
    id: 'borked',
    name: 'Borked',
    settings: {
      style: 'shadow',
      effects: ['decay'],
      strength: 2,
      face: '#c9a66b',
      accent: '#6b1d12',
      ground: '#050201',
      delay: 90,
    },
  },
  {
    id: 'tile',
    name: 'Borked tile',
    settings: {
      output: 'tile',
      effects: ['decay'],
      face: '#c9a66b',
      accent: '#6b1d12',
      ground: '#1c0f08',
      width: 128,
      height: 128,
      frames: 16,
      delay: 120,
      colors: 10,
    },
  },
  {
    id: 'bitmap',
    name: 'Bitmap marquee',
    settings: {
      font: 'bitmap',
      animation: 'marquee',
      effects: ['scanlines'],
      face: '#ffb000',
      ground: '#100800',
      width: 240,
      height: 60,
      size: 50,
      frames: 40,
      delay: 50,
      colors: 6,
    },
  },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id);

/** The preset's settings, keeping the word and seed already chosen. */
export const applyPreset = (preset, { word, seed }) =>
  normalize({ ...BASE, ...preset.settings, word, seed });
