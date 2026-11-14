import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

test('El menú y el alta de operador usan ventas como permiso predeterminado', () => {
    const modal = { addEventListener() {} };
    const context = createContext({
        document: { querySelector: () => modal, addEventListener() {} },
        matchMedia: () => ({matches:false,addEventListener(){}})
    });
    // Carga las funciones del cliente sin efectuar la petición inicial de sesión.
    const source = readFileSync(new URL('../public/app.js',import.meta.url),'utf8')
        .replace(/\nload\(\);\s*$/, '');
    runInContext(source,context);
    runInContext("S={user:{email:'s1@example.com',role:'operador',permissions:['venta']},locations:[{id:'Sucursal 1',name:'Sucursal 1'}],serialTracking:true}",context);
    const visible = JSON.parse(runInContext('JSON.stringify(navs.filter(item=>canView(item[0])).map(item=>item[0]))',context));
    assert.deepEqual(visible,['dashboard','products']);
    assert.equal(runInContext("mayRegister('venta')",context),true);
    assert.equal(runInContext("mayRegister('compra')",context),false);
    assert.equal(runInContext("mayRegister('traslado')",context),false);
    const html = runInContext('userFields()',context);
    assert.match(html,/value="venta" checked/);
    assert.doesNotMatch(html,/value="compra" checked/);
    runInContext("S.products=[{code:'MOT001',name:'GN 150',active:1}]",context);
    const entry=runInContext("movementFields('compra')",context);
    assert.match(entry,/id="product-search"/);
    assert.match(entry,/input name="code" type="hidden"/);
    assert.doesNotMatch(entry,/select name="code"/);
    const sale=runInContext("movementFields('venta')",context);
    assert.match(sale,/id="product-search"/);
    assert.match(sale,/input name="code" type="hidden"/);
    assert.doesNotMatch(sale,/select name="code"/);
    assert.match(sale,/Cantidad seleccionada/);
    assert.match(runInContext("movementFields('traslado')",context),/select name="code"/);
    runInContext("S.user.permissions=['venta','compra','inventario','historial_ventas','reportes']",context);
    assert.equal(runInContext("canView('purchases')&&canView('inventory')&&canView('sales')&&canView('reports')",context),true);
    assert.equal(runInContext("canView('users')||canView('transfers')",context),false);
    assert.equal(runInContext("canView('serials')",context),false);
    runInContext("S.user.role='admin'",context);
    assert.equal(runInContext('navs.every(item=>canView(item[0]))',context),true);
});
