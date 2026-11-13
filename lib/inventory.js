import SEED from '../seed.json' with {type: 'json'};
import { hashPassword } from './security.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) };
const movementPermissions = ['venta', 'compra', 'traslado'];
export default {
    async fetch(request, env) {
        try {
            const url = new URL(request.url);
            const db = env.DB; const user = env.user; const email = user.email;
            const admin = user.role === 'admin';
            const all = async (q, ...v) => (await db.prepare(q).bind(...v).all()).results;
            if (url.pathname === '/api/state' && request.method === 'GET') {
                return json({
                    user,
                    locations: await all('SELECT * FROM locations'),
                    products: await all('SELECT * FROM products' + (admin ? '' : ' WHERE active=1') + ' ORDER BY code'),
                    stock: await all('SELECT s.* FROM stock s JOIN products p USING(code)' + (admin ? '' : ' WHERE s.location=? AND p.active=1'), ...(admin ? [] : [user.location])),
                    events: await all('SELECT e.*,p.name AS product_name FROM events e JOIN products p USING(code)' + (admin ? '' : ' WHERE e.origin=? OR e.destination=?') + ' ORDER BY e.date DESC,e.id DESC', ...(admin ? [] : [user.location, user.location])),
                    users: admin ? await all('SELECT email,name,role,location,active,permissions FROM users ORDER BY role,email') : [],
                    imported: !!await db.prepare("SELECT id FROM imports WHERE id='excel-v1'").first()
                });
            }
            if (request.method !== 'POST') fail('Ruta no encontrada.', 404);
            if (Number(request.headers.get('content-length')) > 50000) fail('Solicitud demasiado grande.', 413);
            const b = await request.json();
            const text = (v, max = 160) => typeof v === 'string' ? v.trim().slice(0, max) : '';
            if (url.pathname === '/api/import') {
                if (!admin) fail('Solo el administrador puede importar.', 403);
                const stmts = [db.prepare('INSERT INTO imports VALUES (?,?)').bind('excel-v1', new Date().toISOString())];
                for (const p of SEED.products) stmts.push(db.prepare('INSERT INTO products (code,name,minimum) VALUES (?,?,?)').bind(p.code, p.name, p.minimum));
                for (const e of SEED.events) stmts.push(db.prepare('INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES(?,?,?,?,?,?,?,?,?)').bind(e.id, e.date, e.kind, e.code, e.quantity, e.origin, e.destination, e.supplier, 'Importación Excel'));
                await db.batch(stmts); return json({ ok: true });
            }
            if (url.pathname === '/api/product') {
                if (!admin) fail('Solo el administrador puede gestionar productos.', 403);
                const code = text(b.code, 40).toUpperCase(), name = text(b.name), minimum = Number(b.minimum);
                if (!/^[A-Z0-9_-]+$/.test(code) || !name || !Number.isInteger(minimum) || minimum < 0) fail('Revisa el código, nombre y stock mínimo.');
                if (b.mode === 'edit') {
                    const result = await db.prepare('UPDATE products SET name=?,minimum=? WHERE code=?').bind(name, minimum, code).run();
                    if (!result.rowCount && !result.affectedRows) fail('Producto no encontrado.', 404);
                } else {
                    await db.prepare('INSERT INTO products(code,name,minimum) VALUES(?,?,?)').bind(code, name, minimum).run();
                }
                return json({ ok: true });
            }
            if (url.pathname === '/api/product-status') {
                if (!admin) fail('Solo el administrador puede ocultar o reactivar productos.', 403);
                if (typeof b.active !== 'boolean') fail('Selecciona un estado válido.');
                const result = await db.prepare('UPDATE products SET active=? WHERE code=?').bind(b.active ? 1 : 0, text(b.code, 40).toUpperCase()).run();
                if (!result.rowCount && !result.affectedRows) fail('Producto no encontrado.', 404);
                return json({ ok: true });
            }
            if (url.pathname === '/api/user') {
                if (!admin) fail('Solo el administrador puede gestionar usuarios.', 403);
                const mail = text(b.email).toLowerCase(), name = text(b.name);
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) || !name) fail('Escribe un nombre y correo válidos.');
                const original = b.mode === 'edit' ? text(b.originalEmail).toLowerCase() : mail;
                const existing = await db.prepare('SELECT email,role,permissions FROM users WHERE email=?').bind(original).first();
                if (b.mode === 'edit' && !existing) fail('Usuario no encontrado.', 404);
                if (b.mode === 'create' && existing) fail('Ese correo ya está registrado.', 409);
                const role = b.role ?? existing?.role ?? 'operador';
                if (!['admin', 'operador'].includes(role)) fail('Selecciona un rol válido.');
                if (original === email && role !== 'admin') fail('No puedes quitarte el rol de administrador.');
                const location = role === 'admin' ? null : text(b.location);
                if (role === 'operador' && !await db.prepare('SELECT id FROM locations WHERE id=?').bind(location).first()) fail('Selecciona la ubicación del operador.');
                const selected = b.permissions ?? existing?.permissions ?? movementPermissions;
                if (!Array.isArray(selected) || selected.some(permission => !movementPermissions.includes(permission))) fail('Selecciona permisos válidos.');
                const permissions = role === 'admin' ? [] : [...new Set(selected)];
                const hash = b.password ? await hashPassword(b.password) : null;
                if (!existing && !hash) fail('Escribe una contraseña de al menos 12 caracteres para el nuevo usuario.');
                const actorIsAdmin = "EXISTS (SELECT 1 FROM users acting WHERE acting.email=? AND acting.role='admin' AND acting.active=1)";
                const statements = [db.prepare('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE')];
                if (existing && (hash || mail !== original)) {
                    statements.push(db.prepare('DELETE FROM sessions WHERE email=? AND ' + actorIsAdmin).bind(original, email));
                }
                statements.push(existing
                    ? db.prepare('UPDATE users SET email=?,name=?,role=?,location=?,permissions=?,password_hash=COALESCE(?,password_hash) WHERE email=? AND ' + actorIsAdmin + ' RETURNING email').bind(mail, name, role, location, permissions, hash, original, email)
                    : db.prepare('INSERT INTO users(email,name,role,location,permissions,password_hash) SELECT ?,?,?,?,?,? WHERE ' + actorIsAdmin + ' RETURNING email').bind(mail, name, role, location, permissions, hash, email));
                const saved = (await db.batch(statements)).at(-1);
                if (!saved.rows.length) fail('No se pudo guardar el usuario con tus permisos actuales.', 403);
                return json({ ok: true });
            }
            if (url.pathname === '/api/user-status') {
                if (!admin) fail('Acceso restringido.', 403);
                if (typeof b.active !== 'boolean') fail('Selecciona un estado válido.');
                const target = text(b.email).toLowerCase();
                if (target === email) fail('No puedes desactivar tu propia cuenta.');
                const actorIsAdmin = "EXISTS (SELECT 1 FROM users acting WHERE acting.email=? AND acting.role='admin' AND acting.active=1)";
                const [, saved] = await db.batch([
                    db.prepare('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE'),
                    db.prepare('UPDATE users SET active=? WHERE email=? AND ' + actorIsAdmin + ' RETURNING email').bind(b.active ? 1 : 0, target, email),
                    db.prepare('DELETE FROM sessions WHERE email=? AND ' + actorIsAdmin).bind(target, email)
                ]);
                if (!saved.rows.length) fail('Usuario no encontrado o sin permisos para modificarlo.', 404);
                return json({ ok: true });
            }
            if (url.pathname === '/api/event') {
                const kind = b.kind, quantity = Number(b.quantity), code = text(b.code, 40), origin = kind === 'compra' ? null : text(b.origin), destination = kind === 'venta' ? null : text(b.destination), supplier = text(b.supplier), note = text(b.note, 400);
                if (!movementPermissions.includes(kind) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000000) fail('La cantidad debe ser un entero positivo.');
                if (!admin && !user.permissions.includes(kind)) fail('No tienes permiso para registrar este movimiento.', 403);
                if (!admin && ((kind === 'compra' && destination !== user.location) || (kind !== 'compra' && origin !== user.location))) fail('Solo puedes registrar movimientos desde tu ubicación.', 403);
                if (kind === 'compra' && !supplier) fail('Indica el proveedor.');
                for (const loc of [origin, destination].filter(Boolean)) if (!await db.prepare('SELECT id FROM locations WHERE id=?').bind(loc).first()) fail('Ubicación inválida.');
                if (kind === 'traslado' && origin === destination) fail('Origen y destino deben ser diferentes.');
                if (kind !== 'compra' && !origin || kind !== 'venta' && !destination) fail('Selecciona las ubicaciones.');
                const id = text(b.id, 80); if (!/^[\w-]{16,80}$/.test(id)) fail('Identificador inválido.');
                const existing = await db.prepare('SELECT actor FROM events WHERE id=?').bind(id).first();
                if (existing) { if (existing.actor !== email) fail('Identificador en uso.', 409); return json({ ok: true }); }
                const result = await db.prepare(`INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,note,actor)
                    SELECT ?,?,?,p.code,?,?,?,?,?,? FROM products p WHERE p.code=? AND p.active=1 FOR SHARE
                    RETURNING id`).bind(id, new Date().toISOString(), kind, quantity, origin, destination, supplier, note, email, code).run();
                if (!result.rows.length) fail('Selecciona un producto activo.');
                return json({ ok: true });
            }
            fail('Ruta no encontrada.', 404);
        } catch (e) { const m = String(e.message); return json({ error: (e.code === '23514' || m.includes('CHECK constraint')) ? 'Stock insuficiente o movimiento inválido. No se guardó ningún cambio.' : (e.code === '23505' || m.includes('UNIQUE constraint')) ? 'Este registro ya existe.' : e.status ? m : 'No se pudo guardar. Intenta nuevamente.' }, e.status || 400); }
    }
};
