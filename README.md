# gifget

Type a word and build an old-school, low-resolution animated GIF from it. Choose how the letters
are built, how they move, and any mix of effects. Then set the colours, lettering, canvas size,
frame count, timing, palette size and pixel crunch, and download a real GIF89a. You can also
start from one of the presets (the looks of the original zomnbio pipeline) and change anything
from there. Everything is drawn and encoded in the browser. Nothing is uploaded.

[![Deploy](https://github.com/jerryaswell/gifget/actions/workflows/deploy.yml/badge.svg)](https://github.com/jerryaswell/gifget/actions/workflows/deploy.yml)
[![CI](https://github.com/jerryaswell/gifget/actions/workflows/ci.yml/badge.svg)](https://github.com/jerryaswell/gifget/actions/workflows/ci.yml)

## What you can control

| Setting           | Choices                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Word              | anything up to 24 characters                                                                                                   |
| Output            | wordmark, or a seamless tile to sit behind one                                                                                 |
| Style             | flat, drop shadow, outline, deep 3D (14-layer extrusion), shallow 3D, chrome, slime                                            |
| Animation         | still, 2D spin, Y-axis card turn, rock, swing, bob, sway, pulse, bounce, marquee, shake                                        |
| Effects (any mix) | colour flicker, liquid wave, melt with drips, glint, RGB split, sliced rows, decay, scanlines, grain, plus an intensity of 1–3 |
| Colours           | face, accent (shadow, sides, outline) and ground; palette size 2–32                                                            |
| Lettering         | bitmap 5×7, monospace, sans-serif, serif, condensed, script; bold or regular; text size 15–90% of the height                   |
| Canvas and timing | 32–400 × 32–240 px, 1–60 frames, 20–1000 ms a frame, pixel crunch 1–4×, seed                                                   |

Every setting is kept in the URL hash, so a link brings back exactly the same GIF.

## How a GIF gets made

This is the zomnbio GIF pipeline ported to the browser. The Python/Pillow original drew frames
and let Pillow write the GIF. Here the frames are drawn into plain RGBA buffers and the GIF is
written by the page's own encoder, so the page has no runtime dependencies.

For each frame (`src/lib/pipeline.js`):

1. **Build** the word in the chosen **style** (`src/lib/styles.js`). This happens once, from the
   word drawn as a white sprite.
2. **Place** it on the ground as the **animation** says for this point in the loop
   (`src/lib/animations.js`): offset, scale, mirror, rotation, brightness.
3. Run each chosen **effect** over the frame, always in the same order, distortions first and
   grain last (`src/lib/effects.js`).
4. **Crunch** it: shrink by the pixel-crunch factor with nearest-neighbour, then grow it back.
   This gives the hard, stepped edges of early web art.
5. **Quantize** it last (median cut, `src/lib/quantize.js`), so the palette comes from the final
   look.
6. **Encode** all the frames (`src/lib/gif.js`): `GIF89a`, a global colour table, the
   `NETSCAPE2.0` loop extension, then for each frame a graphic-control block (delay, disposal 2),
   an image descriptor, a local colour table when the frame's palette differs, and LZW data. The
   file ends with the `0x3B` trailer. Frames are never optimised against each other, so
   corruption drawn into a frame stays in it.

A tile skips steps 1 and 2. Its base is a field of 4px blocks in shades of the three colours, and
it only accepts the effects that wrap at the edges.

All randomness comes from a seeded generator, so a seed always redraws the same GIF. Drawing
happens in a Web Worker, so a large GIF with every effect on doesn't freeze the page.

The original pipeline's rules still hold for every preset, and the unit tests enforce them: low
resolution, a small palette, a dark ground, and a loop that runs forever. Decay crushes anything
bright back to near-black on a dark ground, so a decayed frame never flashes white.

## Working on it

Node 24 (the version in `.nvmrc` is what CI uses).

```sh
npm install
npm run dev        # http://localhost:3000, reloads on save
npm run build      # writes dist/
npm run preview    # serves the built dist/ on http://localhost:4173
npm run check      # lint, formatting, unit tests, build — what CI runs
```

Tests:

```sh
npm run test:unit  # encoder, quantizer, raster ops, settings, every style/animation/effect/preset, the build
npm run test:e2e   # the built page driven in Chromium, via Playwright
npm run test:a11y  # just the axe-core audit, part of test:e2e
npm test           # both
```

The unit tests read every GIF back with a separate decoder (`test/unit/decode.mjs`). The browser
tests decode it again with Chromium's own `ImageDecoder`. The browser suite includes an axe-core
audit held to WCAG 2.2 A and AA.

`npm run test:e2e` builds the site and serves `dist/` itself. First run needs a browser:
`npx playwright install chromium`, or set `CHROMIUM_PATH` to a Chromium you already have.

## Layout

```
src/index.html     the page, linking styles.css and main.js
src/styles.css     all of the styling
src/main.js        the DOM: the controls, the word as a sprite, preview and download
src/worker.js      draws and encodes off the main thread
src/lib/           everything that doesn't need a DOM, testable in Node
  settings.js      every option, its limits, and normalize() for untrusted input
  presets.js       starting points, as settings
  styles.js        how the letters are built
  animations.js    how they move
  effects.js       what happens to each frame
  bitmapfont.js    the 5×7 bitmap font
  random.js        the seeded random source
  raster.js        RGBA buffers: draw, tear, displace, posterize, crush, pixelate
  quantize.js      median cut down to n colours
  gif.js           the GIF89a / LZW encoder
  pipeline.js      style → place → effects → crunch → quantize → encode
public/            copied into the site as-is (favicon, 404, robots.txt)
scripts/build.mjs  the build
scripts/dev.mjs    the development server
test/unit/         node --test suites
test/e2e/          Playwright suites
```

The build bundles `src/main.js`, `src/worker.js` and `src/styles.css` with esbuild and inlines all
three into `index.html`. The worker goes in as inert text, and the page starts it from a Blob URL. The published page is a single self-contained file that you can also save and open
offline.

## Adding a style, animation, effect, font or preset

Each one is an entry in a list, and the page builds its controls from those lists. Adding one
means adding the entry, with nothing to wire up:

- **Style:** add `{ id, name, note, make(sprite, { face, accent, ground }) }` to `STYLES` in
  `src/lib/styles.js`. It returns a coloured sprite.
- **Animation:** add `{ id, name, note, at(t, { w, h, rng, spriteW }) }` to `ANIMATIONS` in
  `src/lib/animations.js`. It returns a placement, and must come back to where it started at
  `t = 1`.
- **Effect:** add `{ id, name, note, tile, apply(img, ctx) }` to `EFFECTS` in
  `src/lib/effects.js`, at the point in the order where it should run. Set `tile: true` only if it
  honours `ctx.wrap`.
- **Font:** add `{ id, name, css }` to `FONTS` in `src/lib/settings.js`.
- **Preset:** add `{ id, name, settings }` to `PRESETS` in `src/lib/presets.js`, naming only what
  differs from `BASE`.

The unit tests pick up a new entry automatically. Every style is drawn with every animation,
every effect is run alone and with all the others at each intensity, and every preset is checked
for size, palette, dark ground and determinism. Check several frames by eye before calling it
done.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which lints, tests, builds, and publishes
`dist/` to GitHub Pages. Every other branch and every pull request runs `.github/workflows/ci.yml`,
which does everything except publish.

The repository needs Pages pointed at the workflow once, under **Settings → Pages → Build and
deployment → Source: GitHub Actions**.

Asset paths are relative, so the site works at `jerryaswell.github.io/gifget/` and at a domain
root. To use a custom domain, add a `CNAME` file containing the bare hostname to `public/`, then
set the domain under **Settings → Pages → Custom domain**.
