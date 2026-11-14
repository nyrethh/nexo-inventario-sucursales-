import { getDatabase } from './database.js';
import { authenticate, authRoute, json, fail } from './auth.js';
import inventory from './inventory.js';
export async function handle(request, dependencies = {}) {
    try {
        const configured = dependencies.appUrl || process.env.APP_URL;
        if (!configured) fail('Configura APP_URL en las variables del servidor.', 503);
        const origin = new URL(configured).origin;
        if (process.env.VERCEL && !origin.startsWith('https://')) fail('APP_URL debe utilizar HTTPS en producción.', 503);
        const url = new URL(request.url);
        const route = url.searchParams.get('route') || url.pathname.replace(/^\/api\//, '');
        if (!['state', 'login', 'logout', 'password', 'import', 'product', 'product-status', 'user', 'user-status', 'event', 'serials'].includes(route)) fail('Ruta no encontrada.', 404);
        if (!['GET', 'POST'].includes(request.method)) fail('Método no permitido.', 405);
        if ((route === 'state') !== (request.method === 'GET')) fail('Método no permitido.', 405);
        let body;
        if (request.method === 'POST') {
            if (request.headers.get('Origin') !== origin) fail('Solicitud de otro sitio rechazada.', 403);
            if (!request.headers.get('content-type')?.startsWith('application/json')) fail('Usa JSON para enviar datos.', 415);
            if (Number(request.headers.get('content-length')) > 16384) fail('Solicitud demasiado grande.', 413);
            const text = await request.text();
            if (Buffer.byteLength(text) > 16384) fail('Solicitud demasiado grande.', 413);
            try { body = JSON.parse(text) } catch { fail('JSON inválido.') }
            if (!body || Array.isArray(body) || typeof body !== 'object') fail('Datos inválidos.');
        }
        const db = dependencies.db || getDatabase();
        if (['login', 'logout', 'password'].includes(route)) return await authRoute(route, request, db, body, origin.startsWith('https:'));
        const user = await authenticate(request, db);
        const apiRequest = new Request(origin + '/api/' + route, { method: request.method, headers: request.headers, body: body ? JSON.stringify(body) : undefined });
        return await inventory.fetch(apiRequest, { DB: db, user });
    } catch (e) {
        if (!e.status) console.error('Error de servidor:', e.code || e.name);
        return json({ error: e.status ? e.message : 'No se pudo conectar con la base de datos. Revisa la configuración del servidor.' }, e.status || 503);
    }
}
