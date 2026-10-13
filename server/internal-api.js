// All-in-one internal server (no Vercel, no nginx). Plain node:http, zero new deps.
// Port PORT (default 8080), bound to 127.0.0.1, served under funnel path /hrm:
//   /internal-health      -> {ok:true}
//   /hrm/api/*            -> Vercel-style handler in ../api/index.js (prefix stripped)
//   /hrm/rest/*,/hrm/auth/* -> reverse proxy to Kong 127.0.0.1:8000 (path kept)
//   /hrm/*                -> static SPA from WEB_DIR with index.html fallback
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import handler from '../api/index.js';

const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = 15 * 1024 * 1024;
const KONG_HOST = '127.0.0.1';
const KONG_PORT = 8000;
const WEB_DIR = process.env.WEB_DIR || path.resolve(process.cwd(), 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function parseQuery(url) {
  const q = {};
  const i = url.indexOf('?');
  if (i === -1) return q;
  for (const [k, v] of new URLSearchParams(url.slice(i + 1))) {
    if (k in q) q[k] = Array.isArray(q[k]) ? [...q[k], v] : [q[k], v];
    else q[k] = v;
  }
  return q;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(undefined);
      const raw = Buffer.concat(chunks).toString('utf8');
      const ct = String(req.headers['content-type'] || '');
      if (ct.includes('application/json')) {
        try {
          resolve(raw ? JSON.parse(raw) : undefined);
        } catch {
          resolve(undefined);
        }
        return;
      }
      resolve(raw);
    });
    req.on('error', reject);
  });
}

function makeRes(nodeRes) {
  const headers = {};
  let statusCode = 200;
  let sent = false;
  const applyHeaders = () => {
    for (const [k, v] of Object.entries(headers)) nodeRes.setHeader(k, v);
  };
  const finish = (code, chunk, contentType) => {
    if (sent) return;
    sent = true;
    nodeRes.statusCode = code;
    if (contentType) nodeRes.setHeader('Content-Type', contentType);
    applyHeaders();
    nodeRes.end(chunk ?? '');
  };
  const sendBody = (code, body) => {
    if (body === undefined || body === null) return finish(code, '');
    if (Buffer.isBuffer(body)) return finish(code, body, 'application/octet-stream');
    if (typeof body === 'string') return finish(code, body);
    return finish(code, JSON.stringify(body), 'application/json');
  };
  return {
    setHeader: (k, v) => {
      headers[String(k).toLowerCase()] = v;
    },
    getHeader: (k) => headers[String(k).toLowerCase()],
    status: (code) => {
      statusCode = code;
      return {
        json: (obj) => sendBody(statusCode, obj),
        send: (b) => sendBody(statusCode, b),
        end: (b) => sendBody(statusCode, b),
      };
    },
    json: (obj) => sendBody(statusCode, obj),
    send: function (b) {
      return sendBody(statusCode, b);
    },
    end: (b) => sendBody(statusCode, b),
  };
}

function serveStatic(pathname, nodeRes) {
  // pathname starts with /hrm/ ; strip prefix, block traversal
  let decoded;
  try {
    decoded = decodeURIComponent(pathname.slice('/hrm/'.length).split('?')[0]);
  } catch {
    nodeRes.statusCode = 400;
    nodeRes.setHeader('Content-Type', 'text/plain');
    nodeRes.end('bad request');
    return;
  }
  let rel = decoded;
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(WEB_DIR, rel));
  if (!file.startsWith(path.normalize(WEB_DIR))) {
    nodeRes.statusCode = 403;
    nodeRes.end('forbidden');
    return;
  }
  const sendFile = (f, code = 200) => {
    fs.readFile(f, (err, data) => {
      if (err) {
        nodeRes.statusCode = 404;
        nodeRes.setHeader('Content-Type', 'text/plain');
        nodeRes.end('not found');
        return;
      }
      nodeRes.statusCode = code;
      nodeRes.setHeader('Content-Type', MIME[path.extname(f).toLowerCase()] || 'application/octet-stream');
      // Never cache the HTML shell (it references hashed assets); browsers
      // otherwise keep running stale bundles after deploys. Hashed assets
      // under /assets/* are safe to cache.
      if (path.extname(f).toLowerCase() === '.html') {
        nodeRes.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        nodeRes.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      nodeRes.end(data);
    });
  };
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) return sendFile(path.join(file, 'index.html'));
    if (err) {
      // SPA fallback for client-side routes
      if (path.extname(file)) {
        nodeRes.statusCode = 404;
        nodeRes.setHeader('Content-Type', 'text/plain');
        nodeRes.end('not found');
        return;
      }
      return sendFile(path.join(WEB_DIR, 'index.html'));
    }
    sendFile(file);
  });
}

function proxyKong(nodeReq, nodeRes, pathname) {
  const opts = {
    host: KONG_HOST,
    port: KONG_PORT,
    path: pathname,
    method: nodeReq.method,
    headers: { ...nodeReq.headers, 'x-forwarded-proto': 'https' },
  };
  const up = http.request(opts, (upRes) => {
    nodeRes.writeHead(upRes.statusCode || 502, upRes.headers);
    upRes.pipe(nodeRes);
  });
  up.on('error', () => {
    nodeRes.statusCode = 502;
    nodeRes.setHeader('Content-Type', 'application/json');
    nodeRes.end(JSON.stringify({ error: 'upstream unavailable' }));
  });
  nodeReq.pipe(up);
}

const server = http.createServer(async (nodeReq, nodeRes) => {
  const rawUrl = nodeReq.url || '/';
  const pathname = rawUrl.split('?')[0];
  if (rawUrl === '/internal-health' || rawUrl.startsWith('/internal-health?')) {
    nodeRes.statusCode = 200;
    nodeRes.setHeader('Content-Type', 'application/json');
    nodeRes.end(JSON.stringify({ ok: true }));
    return;
  }
  if (nodeReq.method === 'OPTIONS') {
    nodeRes.statusCode = 204;
    nodeRes.setHeader('Access-Control-Allow-Credentials', 'true');
    nodeRes.setHeader('Access-Control-Allow-Origin', nodeReq.headers.origin || '');
    nodeRes.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    nodeRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    nodeRes.end();
    return;
  }
  try {
    // Funnel --set-path STRIPS the /hrm prefix before proxying, while direct
    // :8080 access keeps it. Normalize so both work: optional leading /hrm.
    const qs = rawUrl.slice(pathname.length);
    const norm =
      pathname === '/hrm' || pathname.startsWith('/hrm/') ? pathname.slice(4) || '/' : pathname;
    if (norm === '/api/' || norm.startsWith('/api/')) {
      const stripped = norm + qs;
      const body = await readBody(nodeReq);
      const req = {
        url: stripped,
        method: nodeReq.method || 'GET',
        headers: nodeReq.headers,
        body,
        query: parseQuery(stripped),
      };
      await handler(req, makeRes(nodeRes));
      return;
    }
    if (norm === '/rest' || norm.startsWith('/rest/') || norm === '/auth' || norm.startsWith('/auth/')) {
      proxyKong(nodeReq, nodeRes, '/hrm' + norm + qs);
      return;
    }
    if (norm === '/' || norm.startsWith('/')) {
      serveStatic(norm === '/' ? '/hrm/' : '/hrm' + norm, nodeRes);
      return;
    }
    nodeRes.statusCode = 404;
    nodeRes.setHeader('Content-Type', 'text/plain');
    nodeRes.end('not found');
  } catch (err) {
    console.error('internal-api error:', err);
    if (!nodeRes.headersSent) {
      nodeRes.statusCode = 500;
      nodeRes.setHeader('Content-Type', 'application/json');
    }
    try {
      nodeRes.end(JSON.stringify({ error: 'Internal server error' }));
    } catch {
      /* socket already gone */
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`internal-api listening on 127.0.0.1:${PORT}`);
});

// Optional direct-TLS listener for the dedicated DuckDNS hostname
// (router forwards WAN 443 -> this port; non-root so 8443, not 443).
const TLS_PORT = Number(process.env.TLS_PORT || 0);
if (TLS_PORT && process.env.TLS_CERT && process.env.TLS_KEY) {
  const tlsServer = https.createServer(
    {
      cert: fs.readFileSync(process.env.TLS_CERT),
      key: fs.readFileSync(process.env.TLS_KEY),
    },
    (nodeReq, nodeRes) => server.emit('request', nodeReq, nodeRes)
  );
  tlsServer.listen(TLS_PORT, '0.0.0.0', () => {
    console.log(`internal-api TLS listening on 0.0.0.0:${TLS_PORT}`);
  });
}
