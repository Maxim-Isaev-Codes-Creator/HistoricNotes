import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicFiles = new Set([
  'index.html', 'styles.css', 'ink.css', 'app.js', 'scene.js', 'pages.js', 'pen.js', 'sound.js',
  'storage.js', 'security.js', 'editor.js', 'settings.js', 'sw.js',
  'manifest.json', 'icon.svg', 'vendor/three.module.js',
  'vendor/three.core.js', 'vendor/RoundedBoxGeometry.js',
]);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const headers = {
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end(); return; }
  let file;
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    file = pathname === '/' ? 'index.html' : pathname.slice(1);
  } catch { response.writeHead(400, headers).end(); return; }
  if (!publicFiles.has(file)) { response.writeHead(404, headers).end(); return; }
  try {
    const data = await readFile(path.join(root, ...file.split('/')));
    const nextHeaders = { ...headers, 'Content-Type': types[path.extname(file)] || 'application/octet-stream' };
    if (file === 'index.html') {
      const importMap = data.toString('utf8').match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
      const hash = importMap ? ` 'sha256-${createHash('sha256').update(importMap).digest('base64')}'` : '';
      nextHeaders['Content-Security-Policy'] = `default-src 'none'; script-src 'self'${hash}; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
    }
    response.writeHead(200, nextHeaders).end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404, headers).end(); }
}).listen(Number(process.argv[2] || process.env.PORT || 4173), '127.0.0.1', () => console.log(`Open http://127.0.0.1:${process.argv[2] || process.env.PORT || 4173}`));
