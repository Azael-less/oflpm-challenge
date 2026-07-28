const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

const leaderboardHandler = require('./api/leaderboard');
const docsDir = path.join(rootDir, 'docs');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function createResponse(res) {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      const body = JSON.stringify(payload);
      this.headers['Content-Type'] = 'application/json; charset=utf-8';
      this.headers['Content-Length'] = Buffer.byteLength(body).toString();
      res.writeHead(this.statusCode, this.headers);
      res.end(body);
      return this;
    },
    end(body) {
      const bodyText = typeof body === 'string' ? body : body == null ? '' : String(body);
      this.headers['Content-Length'] = Buffer.byteLength(bodyText).toString();
      res.writeHead(this.statusCode, this.headers);
      res.end(bodyText);
      return this;
    },
  };
}

function serveFile(req, res, baseDir, pathname) {
  let requestedPath = decodeURIComponent(pathname);

  if (requestedPath === '/') {
    requestedPath = '/index.html';
  }

  const filePath = path.join(baseDir, requestedPath.replace(/^\/+/, ''));
  const relativePath = path.relative(baseDir, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  serveFile(req, res, docsDir, url.pathname);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  if (url.pathname.startsWith('/api/icons/')) {
    serveFile(req, res, rootDir, url.pathname);
    return;
  }

  if (url.pathname === '/api/leaderboard' || url.pathname === '/api/leaderboard/') {
    const response = createResponse(res);
    const reqWithContext = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: Object.fromEntries(url.searchParams.entries()),
    };

    try {
      await leaderboardHandler(reqWithContext, response);
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
    return;
  }

  serveStatic(req, res);
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Servidor listo en http://127.0.0.1:${port}`);
});
