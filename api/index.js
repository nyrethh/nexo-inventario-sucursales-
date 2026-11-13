import { handle } from '../lib/http.js';
export default function handler(req, res) {
    return handleNodeRequest(req, res);
}

export async function handleNodeRequest(req, res, appUrl = process.env.APP_URL) {
    try {
        const origin = new URL(appUrl || 'http://localhost:3000').origin;
        const url = new URL(req.url, origin);
        if (req.query?.route) url.searchParams.set('route', Array.isArray(req.query.route) ? req.query.route.join('/') : req.query.route);
        const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
        let body;
        if (!['GET', 'HEAD'].includes(req.method)) {
            if (req.body !== undefined) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            else { const chunks = []; let bytes = 0; for await (const c of req) { bytes += c.length; if (bytes > 16384) { res.statusCode = 413; res.end('{"error":"Solicitud demasiado grande."}'); return } chunks.push(c) } body = Buffer.concat(chunks).toString('utf8') }
        }
        const response = await handle(new Request(url, { method: req.method, headers, body }), { appUrl: origin });
        res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end('{"error":"No se pudo procesar la solicitud."}') }
}
