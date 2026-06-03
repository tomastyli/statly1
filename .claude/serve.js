// Minimal static file server for local preview (no deps).
// Supports Cloudflare-Pages-style clean URLs: /portfolio -> portfolio.html
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4602;
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.xml':'application/xml', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };

function resolveFile(p) {
  if (p === '/') return path.join(ROOT, 'index.html');
  let file = path.join(ROOT, p);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  // clean URL fallback: /portfolio -> portfolio.html
  if (fs.existsSync(file + '.html')) return file + '.html';
  return file;
}

http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = resolveFile(p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
