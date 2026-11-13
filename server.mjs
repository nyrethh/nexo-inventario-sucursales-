import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { handleNodeRequest } from './api/index.js';

const port = Number(process.env.PORT || 3000);
const localUrl = `http://localhost:${port}`;
const loopbackHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);

const assets = {
    '/': ['index.html', 'text/html'],
    '/index.html': ['index.html', 'text/html'],
    '/app.js': ['app.js', 'text/javascript'],
    '/styles.css': ['styles.css', 'text/css']
};
const files = new Map(['index.html', 'app.js', 'styles.css'].map(file =>
    [file, readFileSync(new URL(`./public/${file}`, import.meta.url))]
));
const revision = createHash('sha256');
for (const content of files.values()) revision.update(content);
for (const path of ['server.mjs', 'api/index.js', 'lib/http.js', 'lib/auth.js', 'lib/inventory.js', 'lib/security.js', 'lib/database.js']) {
    revision.update(readFileSync(new URL(path, import.meta.url)));
}
const buildId = revision.digest('hex');

async function isNexoAlreadyRunning() {
    try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
            redirect: 'error',
            signal: AbortSignal.timeout(2000)
        });
        await response.body?.cancel();
        return response.ok && response.headers.get('X-Nexo-Revision') === buildId;
    } catch {
        return false;
    }
}

const server = createServer((request, response) => {
    const host = request.headers.host?.toLowerCase();
    if (!loopbackHosts.has(host)) {
        response.writeHead(400).end('Abre Nexo desde ' + localUrl);
        return;
    }
    const origin = `http://${host}`;
    if (request.url.startsWith('/api/')) return handleNodeRequest(request, response, origin);
    const pathname = new URL(request.url, origin).pathname;
    const asset = assets[pathname];
    if (!asset) {
        response.statusCode = 404;
        response.end('No encontrado');
        return;
    }
    const [file, type] = asset;
    response.setHeader('Content-Type', type + '; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Nexo-Revision', buildId);
    response.end(files.get(file));
});

server.once('error', async error => {
    if (error.code === 'EADDRINUSE') {
        if (await isNexoAlreadyRunning()) {
            console.log(`Nexo ya está en ejecución. Abre ${localUrl}`);
            return;
        }
        console.error(`El puerto ${port} está ocupado por otra instancia. Ciérrala y vuelve a ejecutar npm run dev.`);
    } else {
        console.error('No se pudo iniciar Nexo:', error.message);
    }
    process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => console.log(`Nexo: ${localUrl}`));
