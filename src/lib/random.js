/**
 * A seeded random source (mulberry32), so the same seed always draws the same
 * GIF. Every effect takes its randomness from here and never from Math.random,
 * which is what makes "reroll" and "keep this one" both possible.
 */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // whole numbers only, even from fractional bounds such as w / 4
  next.int = (lo, hi) => {
    const a = Math.ceil(lo);
    return a + Math.floor(next() * (Math.floor(hi) - a + 1));
  };
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  return next;
}
