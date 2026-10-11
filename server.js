#!/usr/bin/env node
// Tiny zero-dependency dev server: serves the dashboard and proxies
// /espn/* -> https://site.api.espn.com/* (fallback if direct browser
// requests to ESPN are blocked).
//
//   node server.js          -> http://localhost:8080
//   PORT=3000 node server.js

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function proxy(req, res) {
  const target = 'https://site.api.espn.com' + req.url.slice('/espn'.length);
  https
    .get(target, { headers: { 'User-Agent': 'football-dashboard', Accept: 'application/json' } }, (up) => {
      res.writeHead(up.statusCode || 502, {
        'Content-Type': up.headers['content-type'] || 'application/json',
        'Cache-Control': 'no-store',
      });
      up.pipe(res);
    })
    .on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(ROOT + path.sep) || path.basename(file) === 'server.js') {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

http
  .createServer((req, res) => (req.url.startsWith('/espn/') ? proxy(req, res) : serveStatic(req, res)))
  .listen(PORT, () => console.log(`Football dashboard running at http://localhost:${PORT}`));
