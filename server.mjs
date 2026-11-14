import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function insideRoot(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Resolve a URL without accepting encoded traversal, hidden files, or null bytes. */
export function resolveAssetPath(requestUrl, root = ROOT) {
  let pathname;
  try {
    pathname = decodeURIComponent(String(requestUrl).split(/[?#]/, 1)[0]);
  } catch {
    throw new TypeError('Malformed URL');
  }
  if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\')) {
    throw new TypeError('Invalid asset path');
  }
  if (pathname.split('/').some(segment => segment.startsWith('.'))) {
    throw new TypeError('Hidden files and traversal are not permitted');
  }
  const candidate = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
  if (!insideRoot(root, candidate)) throw new TypeError('Invalid asset path');
  return candidate;
}

/** Local development server. Static assets only; no data leaves the browser. */
export function createStaticServer(root = ROOT) {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-cache');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed');
      return;
    }
    let candidate;
    try {
      candidate = resolveAssetPath(request.url, root);
    } catch {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid path');
      return;
    }
    try {
      // Check resolved paths too: a symlink under dist must not expose another directory.
      const [realRoot, actualPath] = await Promise.all([realpath(root), realpath(candidate)]);
      if (!insideRoot(realRoot, actualPath) || !(await stat(actualPath)).isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      const body = await readFile(actualPath);
      response.writeHead(200, {
        'Content-Type': MIME[extname(actualPath)] || 'application/octet-stream',
        'Content-Length': body.byteLength,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const status = ['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code) ? 404 : 500;
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(status === 404 ? 'Not found' : 'Unable to serve asset');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('PORT must be an integer from 1 to 65535');
  }
  const server = createStaticServer();
  server.on('error', error => {
    console.error(`Hollow Signal could not start: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => console.log(`Hollow Signal: http://${host}:${port}`));
}
