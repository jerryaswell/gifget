# gifget

Old-school, low-resolution animated GIFs of a word: a spinning banner, a card turning in 3D,
fourteen-layer extruded type, VHS glitch, liquid neon, melting slime, a decayed file that has been
copied too many times, and a seamless tile in the same decayed style for the page behind it.
Type a word, pick a look, download a real GIF89a. Everything is drawn and encoded in the
browser. Nothing is uploaded.

[![Deploy](https://github.com/jerryaswell/gifget/actions/workflows/deploy.yml/badge.svg)](https://github.com/jerryaswell/gifget/actions/workflows/deploy.yml)
[![CI](https://github.com/jerryaswell/gifget/actions/workflows/ci.yml/badge.svg)](https://github.com/jerryaswell/gifget/actions/workflows/ci.yml)

## How a GIF gets made

This is the zomnbio GIF pipeline ported to the browser. The Python/Pillow original drew frames
and let Pillow write the GIF. Here the frames are drawn into plain RGBA buffers and the GIF is
written by the page's own encoder, so the page has no runtime dependencies.

Every look follows the same skeleton (`src/lib/pipeline.js`):

1. **Draw** each frame of the loop at full size (`src/lib/effects.js`).
2. **Crunch** it: shrink by the pixel-crunch factor with nearest-neighbour, then grow it back. This
   gives the hard, stepped edges of early web art.
3. **Quantize** it last (median cut, `src/lib/quantize.js`), so the palette comes from the final
   look. That is eight to twenty colours by default.
4. **Encode** it (`src/lib/gif.js`): `GIF89a`, a global colour table, the `NETSCAPE2.0` loop
   extension, then for each frame a graphic-control block (delay, disposal 2), an image
   descriptor, a local colour table when the frame's palette differs, and LZW data. The file ends
   with the `0x3B` trailer. Frames are never optimised against each other, so corruption drawn
   into a frame stays in it.

All randomness comes from a seeded generator, so a seed always redraws the same GIF. The settings
are kept in the URL hash, so a link brings back exactly the same GIF.

The rules from the original pipeline still hold, and the unit tests enforce them: low resolution
(nothing larger than 340×180), a small palette, a dark ground (bright and flat pixels are crushed
back to near-black in the decayed looks), and a loop that runs forever. The tile's tears and
corruption use modulo arithmetic, so its edges always match up.

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
npm run test:unit  # encoder, quantizer, raster ops, every effect, the build, via node --test
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
src/main.js        the DOM: the word on a canvas, the controls, preview and download
src/lib/           everything that doesn't need a DOM, testable in Node
  random.js        the seeded random source
  raster.js        RGBA buffers: draw, tear, displace, posterize, crush, pixelate
  effects.js       the looks
  quantize.js      median cut down to n colours
  gif.js           the GIF89a / LZW encoder
  pipeline.js      draw → crunch → quantize → encode
public/            copied into the site as-is (favicon, 404, robots.txt)
scripts/build.mjs  the build
scripts/dev.mjs    the development server
test/unit/         node --test suites
test/e2e/          Playwright suites
```

The build bundles `src/main.js` and `src/styles.css` with esbuild and inlines both into
`index.html`. The published page is a single self-contained file that you can also save and open
offline.

## Adding a look

Add an object to `EFFECTS` in `src/lib/effects.js` with an `id`, `name`, `note`, `size`, `frames`,
`delay`, `colors` and a `frame(i, ctx)` that returns an opaque raster. The pipeline does the
crunching, quantizing and encoding for you. A new look automatically gets a picker button, and the
unit tests check it for size, palette, dark ground and determinism. If it must tile, use wrapped
coordinates for every shift. Check several frames by eye before calling it done.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which lints, tests, builds, and publishes
`dist/` to GitHub Pages. Every other branch and every pull request runs `.github/workflows/ci.yml`,
which does everything except publish.

The repository needs Pages pointed at the workflow once, under **Settings → Pages → Build and
deployment → Source: GitHub Actions**.

Asset paths are relative, so the site works at `jerryaswell.github.io/gifget/` and at a domain
root. To use a custom domain, add a `CNAME` file containing the bare hostname to `public/`, then
set the domain under **Settings → Pages → Custom domain**.
