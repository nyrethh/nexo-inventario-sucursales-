import SEED from '../seed.json' with {type: 'json'};
import { hashPassword } from './security.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) };

const movementPermissions = ['venta', 'compra', 'traslado'];

const assignablePermissions = [...movementPermissions, 'inventario', 'historial_ventas', 'reportes'];

export default {
    async fetch(request, env) {
        try {
            const url = new URL(request.url);
            const db = env.DB; const user = env.user; const email = user.email;
            const admin = user.role === 'admin';
            const branchPolicyReady = !!await db.prepare("SELECT version FROM schema_migrations WHERE version='004'").first();
            if (!admin && !branchPolicyReady && ['Sucursal 1', 'Sucursal 2'].includes(user.location)) {
                user.permissions = ['venta'];
            }
            const all = async (q, ...v) => (await db.prepare(q).bind(...v).all()).results;
            const serialTracking = !!await db.prepare("SELECT version FROM schema_migrations WHERE version='003'").first();
            const serialCorrectionEnabled = !!await db.prepare("SELECT version FROM schema_migrations WHERE version='005'").first();
            if (url.pathname === '/api/state' && request.method === 'GET') {
                const locations = await all('SELECT * FROM locations' + (admin ? '' : ' WHERE id=?'), ...(admin ? [] : [user.location]));
                const permittedKinds = ['venta'];
                if (user.permissions.includes('compra')) permittedKinds.push('compra');
                if (user.permissions.includes('reportes')) permittedKinds.push('compra', 'traslado');
                const currentSerials = serialCorrectionEnabled
                    ? ",CASE WHEN EXISTS(SELECT 1 FROM event_units eu WHERE eu.event_id=e.id) THEN ARRAY(SELECT u.serial FROM event_units eu JOIN motorcycle_units u ON u.id=eu.unit_id WHERE eu.event_id=e.id ORDER BY u.id) ELSE e.serials END AS current_serials"
                    : '';
                const events = await all('SELECT e.*,p.name AS product_name' + currentSerials + ' FROM events e JOIN products p USING(code)' + (admin ? '' : ' WHERE (e.origin=? OR e.destination=?) AND e.kind=ANY(?)') + ' ORDER BY e.date DESC,e.id DESC', ...(admin ? [] : [user.location, user.location, [...new Set(permittedKinds)]]));
                if (!admin) {
                    for (const event of events) {
                        event.origin = event.origin === user.location ? user.location : null;
                        event.destination = event.destination === user.location ? user.location : null;
                        event.actor = '';
                        if (event.kind === 'traslado') {
                            event.note = '';
                            event.supplier = '';
                        }
                    }
                }
                return json({
                    user,
                    serialTracking,
                    serialCorrectionEnabled: admin && serialCorrectionEnabled,
                    serialUnits: admin && serialCorrectionEnabled ? await all('SELECT u.*,p.name AS product_name FROM motorcycle_units u JOIN products p USING(code) ORDER BY u.id DESC') : [],
                    serialCorrections: admin && serialCorrectionEnabled ? await all('SELECT * FROM serial_corrections ORDER BY corrected_at DESC,id DESC LIMIT 200') : [],
                    locations,
                    products: await all('SELECT p.* FROM products p' + (admin ? '' : ` WHERE p.active=1 AND (
                        EXISTS(SELECT 1 FROM stock s WHERE s.code=p.code AND s.location=? AND s.quantity>0)
                        OR EXISTS(SELECT 1 FROM events e WHERE e.code=p.code AND (e.origin=? OR e.destination=?)))`) + ' ORDER BY p.code', ...(admin ? [] : [user.location, user.location, user.location])),
                    stock: await all('SELECT s.* FROM stock s JOIN products p USING(code)' + (admin ? '' : ` WHERE s.location=? AND p.active=1 AND (s.quantity>0 OR EXISTS(
                        SELECT 1 FROM events e WHERE e.code=s.code AND (e.origin=? OR e.destination=?)))`), ...(admin ? [] : [user.location, user.location, user.location])),
                    events,
                    units: serialTracking ? await all('SELECT u.* FROM motorcycle_units u JOIN products p USING(code) WHERE NOT u.sold' + (admin ? '' : ' AND u.location=? AND p.active=1') + ' ORDER BY u.code,u.id', ...(admin ? [] : [user.location])) : [],
                    users: admin ? await all('SELECT email,name,role,location,active,permissions FROM users ORDER BY role,email') : [],
                    imported: !!await db.prepare("SELECT id FROM imports WHERE id='excel-v1'").first()
                });
            }
            if (request.method !== 'POST') fail('Ruta no encontrada.', 404);
            if (Number(request.headers.get('content-length')) > 50000) fail('Solicitud demasiado grande.', 413);
            const b = await request.json();
            const text = (v, max = 160) => typeof v === 'string' ? v.trim().slice(0, max) : '';
            if (url.pathname === '/api/serial-correction') {
                if (!admin) fail('Solo el administrador puede corregir seriales.', 403);
                if (!serialCorrectionEnabled) fail('Activa la corrección de seriales con sql/07-correccion-seriales.sql.', 503);
                const id = text(b.id, 80);
                const unitId = text(b.unitId, 20);
                const previous = normalizeSerials([b.previousSerial])[0];
                const replacement = normalizeSerials([b.newSerial])[0];
                const reason = text(b.reason, 400);
                if (!/^[\w-]{16,80}$/.test(id) || !/^[1-9][0-9]{0,18}$/.test(unitId) || reason.length < 3) fail('Revisa la moto y escribe el motivo de la corrección.');
                await db.prepare('SELECT correct_motorcycle_serial(?,?,?,?,?,?)').bind(id, unitId, previous, replacement, reason, email).run();
                return json({ ok: true });
            }
            if (url.pathname === '/api/import') {
                if (!admin) fail('Solo el administrador puede importar.', 403);
                const stmts = [db.prepare('INSERT INTO imports VALUES (?,?)').bind('excel-v1', new Date().toISOString())];
                for (const p of SEED.products) stmts.push(db.prepare('INSERT INTO products (code,name,minimum) VALUES (?,?,?)').bind(p.code, p.name, p.minimum));
                for (const e of SEED.events) stmts.push(db.prepare('INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,actor) VALUES(?,?,?,?,?,?,?,?,?)').bind(e.id, e.date, e.kind, e.code, e.quantity, e.origin, e.destination, e.supplier, 'Importación Excel'));
                if (serialTracking) stmts.push(db.prepare('SELECT initialize_pending_units()'));
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
                const selected = b.permissions ?? existing?.permissions ?? ['venta'];
                if (!Array.isArray(selected) || selected.some(permission => !assignablePermissions.includes(permission))) fail('Selecciona permisos válidos.');
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
                if (!serialTracking) fail('El control de seriales está pendiente de activar. Contacta al administrador.', 503);
                const kind = b.kind, quantity = Number(b.quantity), code = text(b.code, 40), origin = kind === 'compra' ? null : text(b.origin), destination = kind === 'venta' ? null : text(b.destination), supplier = text(b.supplier), note = text(b.note, 400);
                if (!movementPermissions.includes(kind) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 100) fail('Registra de 1 a 100 motos por movimiento.');
                if (!admin && kind === 'traslado') fail('Los traslados entre ubicaciones los registra el administrador.', 403);
                if (!admin && !user.permissions.includes(kind)) fail('No tienes permiso para registrar este movimiento.', 403);
                if (!admin && ((kind === 'compra' && destination !== user.location) || (kind !== 'compra' && origin !== user.location))) fail('Solo puedes registrar movimientos desde tu ubicación.', 403);
                if (kind === 'compra' && !supplier) fail('Indica el proveedor.');
                for (const loc of [origin, destination].filter(Boolean)) if (!await db.prepare('SELECT id FROM locations WHERE id=?').bind(loc).first()) fail('Ubicación inválida.');
                if (kind === 'traslado' && origin === destination) fail('Origen y destino deben ser diferentes.');
                if (kind !== 'compra' && !origin || kind !== 'venta' && !destination) fail('Selecciona las ubicaciones.');
                const id = text(b.id, 80); if (!/^[\w-]{16,80}$/.test(id)) fail('Identificador inválido.');
                const existing = await db.prepare('SELECT actor FROM events WHERE id=?').bind(id).first();
                if (existing) { if (existing.actor !== email) fail('Identificador en uso.', 409); return json({ ok: true }); }
                const serials = normalizeSerials(b.serials);
                if (serials.length !== quantity) fail('Debes indicar un serial distinto por cada moto.');
                const result = await db.prepare(`INSERT INTO events(id,date,kind,code,quantity,origin,destination,supplier,note,actor,serials)
                    SELECT ?,?,?,p.code,?,?,?,?,?,?,? FROM products p WHERE p.code=? AND p.active=1 FOR SHARE
                    RETURNING id`).bind(id, new Date().toISOString(), kind, quantity, origin, destination, supplier, note, email, serials, code).run();
                if (!result.rows.length) fail('Selecciona un producto activo.');
                return json({ ok: true });
            }
            if (url.pathname === '/api/serials') {
                if (!serialTracking) fail('El control de seriales está pendiente de activar. Contacta al administrador.', 503);
                const location = text(b.location);
                if (!admin && (location !== user.location || !user.permissions.includes('compra'))) fail('No tienes permiso para identificar estas motos.', 403);
                const code = text(b.code, 40);
                if (!await db.prepare('SELECT code FROM products WHERE code=? AND active=1').bind(code).first()) fail('Selecciona un producto activo.');
                await db.prepare('SELECT identify_pending_units(?,?,?)').bind(code, location, normalizeSerials(b.serials)).run();
                return json({ ok: true });
            }
            fail('Ruta no encontrada.', 404);
        } catch (e) { const m = String(e.message); return json({ error: e.code === '42501' ? 'No tienes permiso para realizar esta operación.' : e.code === 'P0001' ? m : (e.code === '23514' || m.includes('CHECK constraint')) ? 'Stock insuficiente o movimiento inválido. No se guardó ningún cambio.' : (e.code === '23505' || m.includes('UNIQUE constraint')) ? 'El código o serial ya existe. Revisa que no esté duplicado.' : e.status ? m : 'No se pudo guardar. Intenta nuevamente.' }, e.code === '42501' ? 403 : e.status || 400); }
    }
};

function normalizeSerials(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 100) fail('Indica de 1 a 100 seriales.');
    const serials = values.map(value => typeof value === 'string' ? value.trim().toUpperCase() : '');
    if (serials.some(value => !value || value.length > 80 || /[\x00-\x1f]/.test(value)) || new Set(serials).size !== serials.length) {
        fail('Cada moto debe tener un serial válido y distinto, de hasta 80 caracteres.');
    }
    return serials;
}
