// serve.mjs - Zero-dependency static server for the tree-d app.
//
// Usage:  node tools/serve.mjs [port]     (default port 8137)
// Or use serve-start.cmd / serve-stop.cmd in the repo root.
//
// Exists because VS Code Live Server serves the workspace root of whichever
// window grabbed port 5500 first - with several projects open, tree-d ends up
// served by (or shadowed by) another project's server. This one always serves
// THIS repo, on a port nothing else uses.

import { createServer } from 'node:http';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { extname, join, normalize, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = normalize(join(HERE, '..'));
const PORT = Number(process.argv[2]) || 8137;
const PID_FILE = join(HERE, '.serve.pid');

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
    try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const file = normalize(join(ROOT, urlPath === '/' ? '/index.html' : urlPath));
        const rel = relative(ROOT, file);
        if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403); res.end(); return; }
        const body = await readFile(file);
        res.writeHead(200, {
            'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store', // always serve fresh files while iterating
        });
        res.end(body);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use - tree-d server probably already running.`);
        console.error('Stop it with serve-stop.cmd, or pass another port: node tools/serve.mjs 8138');
        process.exit(1);
    }
    throw err;
});

server.listen(PORT, async () => {
    await writeFile(PID_FILE, String(process.pid));
    console.log(`tree-d served from ${ROOT}`);
    console.log(`open http://127.0.0.1:${PORT}/index.html   (pid ${process.pid})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
        await unlink(PID_FILE).catch(() => {});
        process.exit(0);
    });
}
