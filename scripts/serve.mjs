// Petit serveur local : npm start puis http://localhost:5173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = Number(process.env.PORT) || 5173;

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\])+/, '');
  const file = join(web, path || 'index.html');
  if (!file.startsWith(web)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': (TYPES[extname(file)] || 'application/octet-stream') + '; charset=utf-8' }).end(body);
  } catch {
    res.writeHead(404).end('404');
  }
}).listen(port, () => console.log(`Site : http://localhost:${port}`));
