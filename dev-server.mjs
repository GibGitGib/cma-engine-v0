// Local dev server for CMA Engine
// Serves public/index.html + handles /api/cma using the local code
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root (for RENTCAST_API_KEY etc.)
try {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    for (const line of envText.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
      if (m && !m[1].startsWith('#')) {
        const [, k, v] = m;
        if (!process.env[k]) process.env[k] = v;
      }
    }
    console.log('Loaded .env');
  }
} catch (e) {
  console.warn('.env load failed:', e.message);
}

import cmaModule from './api/cma.js';
const handler = cmaModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  // API endpoint
  if (req.url.startsWith('/api/cma')) {
    const url = new URL(req.url, 'http://localhost');
    const address = url.searchParams.get('address');

    const fakeRes = {
      setHeader: (k, v) => res.setHeader(k, v),
      status: (code) => ({
        end: () => res.end(),
        json: (j) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(j));
        },
      }),
      json: (j) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(j));
      },
      end: () => res.end(),
    };
    fakeRes.statusCode = 200;

    try {
      await handler({ method: 'GET', query: { address } }, fakeRes);
    } catch (e) {
      console.error('API error:', e);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Static files
  let pathName = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(PUBLIC, pathName);

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const content = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
  };
  res.setHeader('Content-Type', mimeTypes[ext] || 'text/plain');
  res.end(content);
});

server.listen(3333, () => {
  console.log('CMA Engine local server: http://localhost:3333');
});