#!/usr/bin/env node
/**
 * Build the site into dist/.
 *
 * The page ships as a single self-contained file: the stylesheet and the module
 * graph under src/lib are bundled and inlined into index.html, so the whole
 * thing is one request and one file you can also just save and open. Everything
 * in public/ is copied across untouched.
 *
 * Usage: node scripts/build.mjs [--debug]
 *   --debug  skip minification, so the output stays readable
 */
import { rm, mkdir, readFile, writeFile, cp, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = path.join(root, 'src');
const publicDir = path.join(root, 'public');
const dist = path.join(root, 'dist');

const minify = !process.argv.includes('--debug');

const STYLESHEET = /<link\b[^>]*href="\.\/styles\.css"[^>]*>/;
const SCRIPT = /<script\b[^>]*src="\.\/main\.js"[^>]*>\s*<\/script>/;

/** Bundle one entry point and hand back the text, without writing it out. */
async function bundle(entry, loader) {
  const result = await esbuild.build({
    entryPoints: [path.join(src, entry)],
    bundle: true,
    write: false,
    minify,
    legalComments: 'none',
    target: ['es2020'],
    format: loader === 'js' ? 'iife' : undefined,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text.trim();
}

/** Every file under dir, as paths relative to it. */
async function walk(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full, base)));
    else files.push(path.relative(base, full));
  }
  return files;
}

const kb = (bytes) => (bytes / 1024).toFixed(1).padStart(6) + ' kB';

async function build() {
  const started = Date.now();
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  const [css, js, template] = await Promise.all([
    bundle('styles.css', 'css'),
    bundle('main.js', 'js'),
    readFile(path.join(src, 'index.html'), 'utf8'),
  ]);

  if (!STYLESHEET.test(template))
    throw new Error('src/index.html: no <link> to ./styles.css to inline');
  if (!SCRIPT.test(template))
    throw new Error('src/index.html: no <script> for ./main.js to inline');

  const html = template
    .replace(STYLESHEET, () => '<style>\n' + css + '\n    </style>')
    .replace(SCRIPT, () => '<script>\n' + js + '\n    </script>');

  await writeFile(path.join(dist, 'index.html'), html);
  await cp(publicDir, dist, { recursive: true });

  const files = (await walk(dist)).sort();
  const sizes = await Promise.all(files.map((f) => stat(path.join(dist, f))));
  console.log('dist/' + (minify ? '' : '  (debug, unminified)'));
  files.forEach((f, i) => console.log('  ' + kb(sizes[i].size) + '  ' + f));
  console.log('built in ' + (Date.now() - started) + ' ms');
}

build().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
