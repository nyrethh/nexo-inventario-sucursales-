import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createDatabase } from '../lib/database.js';
import { handle } from '../lib/http.js';
import { hashPassword } from '../lib/security.js';

test('Seriales, aislamiento de sucursal y conservación del inventario anterior', async () => {
    const pg = new PGlite();
    const sql = file => readFileSync(new URL('../sql/' + file, import.meta.url), 'utf8');
    try {
        await pg.exec(sql('01-esquema.sql'));
        await pg.exec(sql('02-datos-excel.sql'));
        const originalStock = (await pg.query('SELECT * FROM stock ORDER BY code,location')).rows;
        const db = createDatabase(pg, callback => pg.transaction(callback));
        const password = 'Seriales-seguros-2026';
        await pg.query("INSERT INTO users(email,name,role,password_hash) VALUES('admin@example.com','Admin','admin',$1)", [await hashPassword(password)]);
        const appUrl = 'https://nexo.example.com';
        const call = async (route, body, cookie = '') => {
            const response = await handle(new Request(appUrl + '/api/' + route, {
                method: body ? 'POST' : 'GET', headers: { Origin: appUrl, 'Content-Type': 'application/json', Cookie: cookie },
                body: body ? JSON.stringify(body) : undefined
            }), { db, appUrl });
            return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
        };
        const admin = (await call('login', { email: 'admin@example.com', password })).cookie;
        assert.equal((await call('state', null, admin)).data.serialTracking, false);
        assert.equal((await call('event', {}, admin)).status, 503);
        await pg.exec(sql('05-seriales-y-sucursales.sql'));
        assert.deepEqual((await pg.query('SELECT * FROM stock ORDER BY code,location')).rows, originalStock);
        assert.equal((await pg.query('SELECT count(*)::int AS n FROM motorcycle_units')).rows[0].n, 11);
        assert.equal((await call('state', null, admin)).data.serialTracking, true);
        // Ocultar un modelo no debe impedir identificar las motos que ya existen.
        assert.equal((await call('product-status', { code: 'MOT001', active: false }, admin)).status, 200);
        const identifiedHidden = await call('serials', { code: 'MOT001', location: 'Sucursal 2', serials: ['X9K2'] }, admin);
        assert.equal(identifiedHidden.status, 200, JSON.stringify(identifiedHidden.data));
        assert.deepEqual((await pg.query('SELECT * FROM stock ORDER BY code,location')).rows, originalStock);
        assert.equal((await pg.query("SELECT location FROM motorcycle_units WHERE serial='X9K2'")).rows[0].location, 'Sucursal 2');
        assert.equal((await call('event', { id: crypto.randomUUID(), kind: 'venta', code: 'MOT001', quantity: 1, origin: 'Sucursal 2', serials: ['X9K2'] }, admin)).status, 400);
        assert.equal((await call('serials', { code: 'NO-EXISTE', location: 'Sucursal 2', serials: ['INEXISTENTE'] }, admin)).status, 400);
        assert.equal((await call('product-status', { code: 'MOT001', active: true }, admin)).status, 200);
        assert.equal((await call('user', { email: 's1@example.com', name: 'S1', role: 'operador', location: 'Sucursal 1', permissions: ['venta', 'compra', 'traslado'], password }, admin)).status, 200);
        const branch = (await call('login', { email: 's1@example.com', password })).cookie;
        const state = (await call('state', null, branch)).data;
        assert.deepEqual(state.locations.map(item => item.id), ['Sucursal 1']);
        assert.ok(state.stock.every(item => item.location === 'Sucursal 1'));
        assert.ok(state.units.every(item => item.location === 'Sucursal 1'));
        assert.ok(state.events.every(item => (!item.origin || item.origin === 'Sucursal 1') && (!item.destination || item.destination === 'Sucursal 1')));
        assert.ok(!JSON.stringify(state).includes('Sucursal 2'));
        assert.ok(!JSON.stringify(state).includes('Deposito Principal'));
        assert.equal((await call('serials', { code: 'MOT001', location: 'Sucursal 2', serials: ['NOT-YOURS'] }, branch)).status, 403);
        assert.equal((await call('serials', { code: 'MOT001', location: 'Sucursal 1', serials: ['OLD-001'] }, branch)).status, 200);
        assert.equal((await call('serials', { code: 'MOT001', location: 'Sucursal 1', serials: ['EXTRA'] }, branch)).status, 400);
        const entry = { id: crypto.randomUUID(), kind: 'compra', code: 'MOT006', quantity: 4, destination: 'Sucursal 1', supplier: 'Proveedor' };
        assert.equal((await call('event', entry, branch)).status, 400);
        assert.equal((await call('event', { ...entry, serials: ['A', 'B', 'C'] }, branch)).status, 400);
        assert.equal((await call('event', { ...entry, serials: ['A', 'A', 'C', 'D'] }, branch)).status, 400);
        assert.equal((await call('event', { ...entry, serials: ['a', 'b', 'c', 'd'] }, branch)).status, 200);
        assert.equal((await call('event', { ...entry, serials: ['A', 'B', 'C', 'D'] }, branch)).status, 200);
        const afterEntry = (await call('state', null, admin)).data;
        assert.equal(afterEntry.stock.filter(item => item.code === 'MOT006').reduce((sum, item) => sum + item.quantity, 0), 10);
        assert.equal((await call('event', { ...entry, id: crypto.randomUUID(), quantity: 1, serials: ['A'] }, branch)).status, 400);
        assert.equal((await call('state', null, admin)).data.events.length, 18);
        const transfer = { id: crypto.randomUUID(), kind: 'traslado', code: 'MOT006', quantity: 1, origin: 'Sucursal 1', destination: 'Sucursal 2', serials: ['A'] };
        assert.equal((await call('event', transfer, branch)).status, 403);
        assert.equal((await call('event', transfer, admin)).status, 200);
        assert.equal((await call('event', { id: crypto.randomUUID(), kind: 'venta', code: 'MOT006', quantity: 1, origin: 'Sucursal 1', serials: ['A'] }, branch)).status, 400);
        const sale = { id: crypto.randomUUID(), kind: 'venta', code: 'MOT006', quantity: 1, origin: 'Sucursal 1', serials: ['B'] };
        const competing = await Promise.all([call('event', sale, branch), call('event', { ...sale, id: crypto.randomUUID() }, branch)]);
        assert.deepEqual(competing.map(item => item.status).sort(), [200, 400]);
        assert.equal((await pg.query("SELECT sold FROM motorcycle_units WHERE serial='B'")).rows[0].sold, true);
        assert.equal((await pg.query("SELECT location FROM motorcycle_units WHERE serial='A'")).rows[0].location, 'Sucursal 2');
        assert.equal((await call('event', { ...entry, id: crypto.randomUUID(), quantity: 1, serials: ['B'] }, admin)).status, 400);
        const finalState = (await call('state', null, branch)).data;
        assert.ok(!JSON.stringify(finalState).includes('Sucursal 2'));
        assert.ok(finalState.events.filter(item => item.kind === 'traslado').every(item => item.note === '' && item.actor === ''));
        await pg.query("DELETE FROM schema_migrations WHERE version='004'");
        assert.deepEqual((await call('state', null, branch)).data.user.permissions,['venta']);
        assert.equal((await call('event', {...entry,id:crypto.randomUUID()}, branch)).status,403);
        await pg.exec(sql('06-acceso-predeterminado-sucursales.sql'));
        assert.deepEqual((await pg.query("SELECT permissions FROM users WHERE email='s1@example.com'")).rows[0].permissions,['venta']);
        assert.equal((await call('user', {mode:'edit',originalEmail:'s1@example.com',email:'s1@example.com',name:'S1',role:'operador',location:'Sucursal 1',permissions:['venta','compra','reportes']},admin)).status,200);
        assert.ok((await call('state',null,branch)).data.events.some(item=>item.kind==='compra'));
        await pg.exec(sql('06-acceso-predeterminado-sucursales.sql'));
        assert.deepEqual((await pg.query("SELECT permissions FROM users WHERE email='s1@example.com'")).rows[0].permissions,['venta','compra','reportes']);
        await pg.query('BEGIN');
        await assert.rejects(()=>pg.query('SELECT 1/0'),error=>error.code==='22012');
        await assert.rejects(()=>pg.query('SELECT 1'),error=>error.code==='25P02');
        await pg.query('ROLLBACK');
        await pg.exec(sql('06-acceso-predeterminado-sucursales.sql'));
        assert.equal((await call('state',null,admin)).data.user.role,'admin');
    } finally {
        await pg.close();
    }
});
