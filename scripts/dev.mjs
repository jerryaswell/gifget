#!/usr/bin/env node
/**
 * A development server, so the page can be worked on without a build step:
 * src/ and public/ are served as they are, and any change to either reloads
 * the open page.
 *
 * Usage: node scripts/dev.mjs [--dist] [--port 3000] [--no-reload]
 *   --dist  serve the built dist/ instead, to check the real output
 */
import http from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const useDist = args.includes('--dist');

const portFlag = args.findIndex((a) => a === '--port' || a.startsWith('--port='));
const port = Number(
  portFlag === -1
    ? (process.env.PORT ?? (useDist ? 4173 : 3000))
    : (args[portFlag].split('=')[1] ?? args[portFlag + 1])
);

const roots = useDist
  ? [path.join(root, 'dist')]
  : [path.join(root, 'src'), path.join(root, 'public')];
const liveReload = !useDist && !args.includes('--no-reload');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
};

const RELOAD_SNIPPET = `<script>
  new EventSource('/__reload').onmessage = () => location.reload();
</script>
`;

/** Resolve a URL path to a file inside one of the served roots, or null. */
async function resolve(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const rel = clean.endsWith('/') ? path.join(clean, 'index.html') : clean;
  for (const base of roots) {
    const file = path.join(base, rel);
    if (!file.startsWith(base)) continue;
    try {
      const info = await stat(file);
      if (info.isDirectory()) {
        const index = path.join(file, 'index.html');
        if ((await stat(index).catch(() => null))?.isFile()) return index;
        continue;
      }
      return file;
    } catch {
      /* try the next root */
    }
  }
  return null;
}

const clients = new Set();

const server = http.createServer(async (req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;

  if (liveReload && urlPath === '/__reload') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('retry: 500\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const file = await resolve(urlPath);
  const ext = path.extname(file ?? urlPath);

  if (!file) {
    const notFound = await resolve('/404.html');
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(notFound ? await readFile(notFound) : 'Not found\n');
    return;
  }

  let body = await readFile(file);
  if (liveReload && ext === '.html') {
    body = Buffer.from(String(body).replace('</body>', '  ' + RELOAD_SNIPPET + '  </body>'));
  }
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(body);
});

if (liveReload) {
  let pending;
  for (const base of roots) {
    watch(base, { recursive: true }, () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        for (const client of clients) client.write('data: change\n\n');
      }, 40);
    });
  }
}

server.listen(port, () => {
  console.log(
    (useDist ? 'serving dist/ ' : 'serving src/ + public/ ') + 'on http://localhost:' + port
  );
});
