import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const data = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(data);
  } catch { response.writeHead(404).end(); }
}).listen(Number(process.argv[2] || process.env.PORT || 4173), '127.0.0.1', () => console.log(`Open http://127.0.0.1:${process.argv[2] || process.env.PORT || 4173}`));
