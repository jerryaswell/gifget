/**
 * Animations: how the styled word moves through one loop. Each one maps how
 * far round the loop a frame is (t, from 0 up to 1) to a placement:
 *
 *   dx, dy      offset from the centre, in pixels
 *   sx, sy      scale; a negative sx shows the mirrored back face
 *   angle       rotation, in radians
 *   brightness  multiplier on the word's colours
 *
 * Every motion returns to where it started at t = 1, so the loop has no seam.
 * Add an animation by adding an entry here; the page builds its picker from
 * this list.
 */
const TAU = Math.PI * 2;

/** The Y-axis card turn: foreshortened, mirrored round the back, dimmed edge-on. */
function turn(theta, floor) {
  const c = Math.cos(theta);
  const edge = Math.abs(c);
  return {
    sx: Math.max(0.04, edge) * (c < 0 ? -1 : 1),
    sy: 1 - 0.12 * (1 - edge),
    brightness: floor + (1 - floor) * edge,
  };
}

export const ANIMATIONS = [
  {
    id: 'still',
    name: 'Still',
    note: 'No motion: any movement comes from the effects.',
    at: () => ({}),
  },
  {
    id: 'spin',
    name: '2D spin',
    note: 'A full turn in the plane, like a turntable.',
    at: (t) => ({ angle: TAU * t }),
  },
  {
    id: 'card',
    name: 'Y-axis card',
    note: 'A full turn about the vertical axis, back face mirrored.',
    at: (t) => turn(TAU * t, 0.35),
  },
  {
    id: 'rock',
    name: 'Rock',
    note: 'A partial turn back and forth, so an extrusion shows its depth.',
    at: (t) => turn(0.7 * Math.sin(TAU * t), 0.6),
  },
  {
    id: 'swing',
    name: 'Swing',
    note: 'A pendulum tilt either side.',
    at: (t) => ({ angle: 0.22 * Math.sin(TAU * t) }),
  },
  {
    id: 'bob',
    name: 'Bob',
    note: 'Floating up and down.',
    at: (t, { h }) => ({ dy: Math.round(h * 0.08 * Math.sin(TAU * t)) }),
  },
  {
    id: 'sway',
    name: 'Sway',
    note: 'A small sideways drift, like an unsteady signal.',
    at: (t) => ({ dx: Math.round(2 * Math.sin(TAU * t)) }),
  },
  {
    id: 'pulse',
    name: 'Pulse',
    note: 'Growing and shrinking.',
    at: (t) => {
      const s = 1 + 0.14 * Math.sin(TAU * t);
      return { sx: s, sy: s };
    },
  },
  {
    id: 'bounce',
    name: 'Bounce',
    note: 'Dropping onto the floor and squashing.',
    at: (t, { h }) => {
      const up = Math.abs(Math.sin(Math.PI * t));
      const squash = up < 0.15 ? 1 - (0.15 - up) * 1.6 : 1;
      return { dy: Math.round(h * 0.2 * (0.5 - up)), sy: squash, sx: 2 - squash };
    },
  },
  {
    id: 'marquee',
    name: 'Marquee',
    note: 'Scrolling across from right to left, off one edge and on at the other.',
    at: (t, { w, spriteW }) => ({ dx: Math.round(((w + spriteW) / 2) * (1 - 2 * t)) }),
  },
  {
    id: 'shake',
    name: 'Shake',
    note: 'Jittering in place.',
    at: (t, { rng }) => ({ dx: rng.int(-2, 2), dy: rng.int(-2, 2) }),
  },
];

export const animationById = (id) => ANIMATIONS.find((a) => a.id === id);
