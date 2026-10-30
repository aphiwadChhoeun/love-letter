import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    const filePath = resolve(join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, '')));
    if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      return send(res, 404, 'Not found');
    }

    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    send(res, 500, 'Server error');
  }
});

const basePort = Number(process.env.PORT) || 5173;
let port = basePort;

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && port < basePort + 20) {
    port += 1;
    server.listen(port, '127.0.0.1');
    return;
  }
  console.error(error);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log('');
  console.log('  ♥  Love Letter — the court is open.');
  console.log(`     http://127.0.0.1:${port}`);
  console.log('');
  console.log('     Press Ctrl+C to close the court.');
  console.log('');
});
