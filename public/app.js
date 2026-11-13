let S = null, page = 'dashboard', query = '', filter = '', from = '', to = '', formId = null; const $ = s => document.querySelector(s), L = id => S.locations.find(l => l.id === id)?.name || id || '—', P = code => S.products.find(p => p.code === code)?.name || code; const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); const admin = () => S?.user.role === 'admin'; const num = n => Number(n).toLocaleString('es-VE'); const date = d => new Date(d).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Caracas' }); const typeNames = { compra: 'Entrada', venta: 'Venta', traslado: 'Traslado' }; const navs = [['dashboard', '◫', 'Vista general'], ['inventory', '▦', 'Inventario'], ['sales', '↗', 'Ventas'], ['purchases', '↓', 'Entradas / compras'], ['transfers', '⇄', 'Traslados'], ['reports', '▤', 'Reportes'], ['products', '◇', 'Productos'], ['users', '♙', 'Usuarios']];
const movementActions = [
    ['venta', 'Registrar ventas'],
    ['compra', 'Registrar entradas'],
    ['traslado', 'Registrar traslados']
];
const mayRegister = kind => admin() || S?.user.permissions?.includes(kind);
let catalogStatus = 'active';

async function api(path, data) { const r = await fetch('/api/' + path, { method: data ? 'POST' : 'GET', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined }); const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error || 'No se pudo conectar.'), { status: r.status }); return j }
async function load() {
    try {
        S = await api('state');
        render();
    } catch (error) {
        if (error.status === 401) {
            showLogin();
            return;
        }
        $('#app').innerHTML = '<div class="login"><div class="login-card"><div class="brand"><b>n</b> nexo</div><h1>No se pudo abrir el sistema</h1><p>' + esc(error.message) + '</p><button class="button" onclick="load()">Reintentar</button></div></div>';
    }
}

function showLogin(message = '') { S = null; $('#app').innerHTML = `<div class="login"><div class="login-card"><div class="brand"><b>n</b> nexo</div><h1>Tu inventario, conectado.</h1><p>Inicia sesión con el usuario de tu ubicación.</p><form id="loginform" style="display:grid;gap:18px;margin-top:25px"><label>Correo electrónico<input type="email" name="email" required autocomplete="username" maxlength="160"></label><label>Contraseña<input type="password" name="password" required autocomplete="current-password" maxlength="256"></label><div class="error" id="loginerror" role="alert" style="display:${message ? 'block' : 'none'}">${esc(message)}</div><button class="button" type="submit" style="margin-top:0">Iniciar sesión →</button></form><p style="font-size:11px;margin-top:20px">¿Olvidaste tu contraseña? Solicita al administrador que la restablezca.</p></div></div>`; $('#loginform').onsubmit = async e => { e.preventDefault(); const b = e.target.querySelector('button'), error = $('#loginerror'); b.disabled = true; error.style.display = 'none'; try { await api('login', Object.fromEntries(new FormData(e.target))); page = 'dashboard'; await load() } catch (err) { error.textContent = err.message; error.style.display = 'block' } finally { b.disabled = false } } }
async function logout() { try { await api('logout', {}); setMenu(false); showLogin() } catch (e) { toast(e.message) } }
function openPassword() { const m = $('#modal'); m.innerHTML = `<button class="close" aria-label="Cerrar" onclick="$('#modal').close()">×</button><h2>Cambiar contraseña</h2><p>Usa al menos 12 caracteres. Al guardar se cerrarán tus sesiones.</p><form id="passwordform" style="display:grid;gap:18px"><label>Contraseña actual<input name="currentPassword" type="password" autocomplete="current-password" required maxlength="256"></label><label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="256"></label><div class="error" role="alert" id="passworderror"></div><button class="button" type="submit">Guardar contraseña</button></form>`; $('#passwordform').onsubmit = async e => { e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true; try { await api('password', Object.fromEntries(new FormData(e.target))); m.close(); showLogin('Contraseña actualizada. Inicia sesión nuevamente.') } catch (err) { $('#passworderror').textContent = err.message; $('#passworderror').style.display = 'block' } finally { b.disabled = false } }; m.showModal() }
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; setTimeout(() => e.hidden = true, 4000) }
const mobileLayout = matchMedia('(max-width: 900px)');
function setMenu(open, returnFocus = false) {
    const toggle = $('#menu-toggle');
    if (!toggle) return;
    const isOpen = mobileLayout.matches && open;
    document.body.classList.toggle('menu-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    $('#app-sidebar').inert = mobileLayout.matches && !isOpen;
    $('#app-main').inert = isOpen;
    if (isOpen) $('#menu-close').focus();
    else if (returnFocus && mobileLayout.matches) toggle.focus();
}
mobileLayout.addEventListener('change', () => setMenu(false));
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('menu-open') && !$('#modal').open) {
        setMenu(false, true);
    }
});
function go(destination) {
    const mobile = mobileLayout.matches;
    page = destination;
    query = filter = from = to = '';
    catalogStatus = 'active';
    setMenu(false);
    render();
    if (mobile) $('#content h1')?.focus();
}
function stock(code, loc) {
    const codes = new Set(code ? [code] : S.products.filter(product => product.active).map(product => product.code));
    return S.stock.filter(row => codes.has(row.code) && (!loc || row.location === loc))
        .reduce((total, row) => total + row.quantity, 0);
}
function localDay(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d)) }
function visibleEvents(kind) { return S.events.filter(e => (!kind || e.kind === kind) && (!filter || e.origin === filter || e.destination === filter) && (!from || localDay(e.date) >= from) && (!to || localDay(e.date) <= to) && (!query || (e.code + ' ' + (e.product_name || P(e.code)) + ' ' + e.supplier).toLowerCase().includes(query.toLowerCase()))) }
function relevantProducts(includeHidden = false) {
    return S.products.filter(product => (includeHidden || product.active)
        && (product.code + ' ' + product.name).toLowerCase().includes(query.toLowerCase()));
}
function dashboardMovementAction() {
    const next = movementActions.find(([kind]) => mayRegister(kind));
    return next ? btn('+ ' + next[1], `openForm('${next[0]}')`) : '';
}
function render() {
    if (!S) return;
    const title = navs.find(item => item[0] === page)?.[2] || '';
    const initial = esc(S.user.name.slice(0, 1).toUpperCase());
    const sections = navs.filter(item => admin() || item[0] !== 'users');
    $('#app').innerHTML = `
        <div class="mobile-shade" aria-hidden="true" onclick="setMenu(false, true)"></div>
        <aside id="app-sidebar" aria-label="Navegación de Nexo">
          <div class="sidebar-header">
            <div class="brand"><b>n</b><div>nexo<small>INVENTARIO CONECTADO</small></div></div>
            <button id="menu-close" class="menu-close" type="button" aria-label="Cerrar menú" onclick="setMenu(false, true)">×</button>
          </div>
          <div class="nav-label">ESPACIO DE TRABAJO</div>
          <nav aria-label="Secciones">${sections.map(([id, icon, label]) => `
            <button type="button" ${page === id ? 'class="active" aria-current="page"' : ''} onclick="go('${id}')">
              <span class="nav-icon" aria-hidden="true">${icon}</span>${label}
            </button>`).join('')}</nav>
          <div class="side-bottom">
            <div class="userbox"><span class="avatar">${initial}</span><div>${esc(S.user.name)}<small>${admin() ? 'Administrador' : esc(L(S.user.location))}</small></div></div>
            <button class="inline-link sidebar-action" type="button" onclick="setMenu(false); openPassword()">Cambiar contraseña</button>
            <button class="inline-link sidebar-action" type="button" onclick="logout()">Cerrar sesión</button>
          </div>
        </aside>
        <main id="app-main">
          <header>
            <button id="menu-toggle" class="menu" type="button" aria-label="Abrir menú" aria-expanded="false" aria-controls="app-sidebar" onclick="setMenu(true)"><span aria-hidden="true"></span></button>
            <div class="breadcrumb"><span class="breadcrumb-parent">Mi negocio / </span><strong>${title}</strong></div>
            <div class="header-right"><button class="inline-link" type="button" onclick="load()">↻ Actualizar</button><span class="avatar">${initial}</span></div>
          </header>
          <div id="content"></div>
          <p class="footnote">Nexo · Inventario multisucursal / Horario de Caracas</p>
        </main>`;
    setMenu(false);
    content();
}
function heading(title, subtitle, action = '') { return `<div class="heading"><div><h1 tabindex="-1">${title}</h1><p>${subtitle}</p></div>${action}</div>` }
function btn(label, action, secondary = false) { return `<button class="button ${secondary ? 'secondary' : ''}" onclick="${action}">${label}</button>` }
function locationSelect(id = 'filter', all = true) { return `<select aria-label="Ubicación" id="${id}" onchange="filter=this.value;content()">${all ? '<option value="">Todas las ubicaciones</option>' : ''}${S.locations.filter(l => admin() || l.id === S.user.location).map(l => `<option value="${esc(l.id)}" ${filter === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>` }
function toolbar(dates = false) { return `<div class="toolbar"><input class="search" aria-label="Buscar producto" placeholder="⌕  Buscar por nombre o código…" value="${esc(query)}" oninput="query=this.value;updateRows()">${locationSelect()}${dates ? `<label>Desde<input type="date" value="${from}" onchange="from=this.value;content()"></label><label>Hasta<input type="date" value="${to}" onchange="to=this.value;content()"></label>` : ''}<button class="button secondary" onclick="exportCSV()">↓ Exportar CSV</button></div>` }
function eventTable(events, compact = false) { return `<div class="table-wrap"><table><thead><tr><th>Producto</th><th>Movimiento</th>${compact ? '' : '<th>Origen → destino</th><th>Proveedor</th>'}<th>Cantidad</th><th>Fecha</th></tr></thead><tbody>${events.map(e => `<tr><td><strong>${esc((e.product_name || P(e.code)))}</strong><small>${esc(e.code)}</small></td><td><span class="badge ${e.kind === 'venta' ? 'warn' : ''}">${typeNames[e.kind]}</span></td>${compact ? '' : `<td>${esc(L(e.origin))} → ${esc(L(e.destination))}</td><td>${esc(e.supplier || '—')}</td>`}<td><strong>${num(e.quantity)}</strong> <small>unidades</small></td><td>${date(e.date)}</td></tr>`).join('') || `<tr><td colspan="6" class="empty">No hay movimientos para este filtro.</td></tr>`}</tbody></table></div>` }
function labelTableCells(scope) {
    for (const table of scope.querySelectorAll('table:not([data-mobile-ready])')) {
        const headings = Array.from(table.tHead?.rows[0]?.cells || [], cell => cell.textContent.trim());
        for (const group of table.tBodies) {
            for (const row of group.rows) {
                if (row.cells.length !== headings.length) continue;
                Array.from(row.cells).forEach((cell, index) => { cell.dataset.label = headings[index]; });
            }
        }
        table.dataset.mobileReady = '';
    }
}
function content() {
    renderContent();
    labelTableCells($('#content'));
}
function renderContent() {
    const c = $('#content'); if (page === 'dashboard') { const total = stock(), sales = S.events.filter(e => e.kind === 'venta').reduce((a, e) => a + e.quantity, 0), low = S.products.filter(p => p.active && stock(p.code) <= p.minimum).length, locs = S.locations.filter(l => admin() || l.id === S.user.location), max = Math.max(1, ...locs.map(l => stock(null, l.id))), sold = locs.map(l => S.events.filter(e => e.kind === 'venta' && e.origin === l.id).reduce((a, e) => a + e.quantity, 0)), sum = sold.reduce((a, b) => a + b, 0); let start = 0; const colors = ['#205c46', '#86a987', '#c4d9a5']; const gradient = sold.map((v, i) => { let s = start; start += sum ? v / sum * 100 : 0; return colors[i] + ' ' + s + '% ' + start + '%' }).join(','); c.innerHTML = heading('Vista general', 'Todo tu inventario. Una sola mirada.', dashboardMovementAction()) + (!S.imported && admin() ? `<div class="notice"><div><strong>Tu Excel está listo para importar</strong><p>11 productos · 3 compras · 5 traslados · 9 ventas. Se importará una sola vez.</p></div>${btn('Importar datos del Excel', "importData(this)")}</div>` : '') + `<div class="stats">${[['Existencias totales', total, 'Unidades disponibles', '▦'], ['Unidades vendidas', sales, 'Acumulado de movimientos', '↗'], ['Productos registrados', S.products.filter(p => p.active).length, 'Catálogo de productos', '◇'], ['Stock bajo o agotado', low, 'Productos bajo el mínimo global', '!']].map((x, i) => `<div class="stat ${i === 0 ? 'featured' : ''}"><div class="stat-top">${x[0]}<span class="stat-icon">${x[3]}</span></div><div class="stat-number">${num(x[1])}</div><div class="stat-note">${x[2]}</div></div>`).join('')}</div><div class="grid"><section class="panel"><div class="panel-head"><div><h2>Existencias por ubicación</h2><div class="caption">Distribución actual del inventario</div></div><span class="badge">Unidades</span></div><div class="bars">${locs.map(l => `<div class="bar-group"><strong>${stock(null, l.id)}</strong><div class="bar" style="height:${stock(null, l.id) / max * 145}px"></div></div>`).join('')}</div><div class="bar-labels">${locs.map(l => `<span>${esc(l.name)}</span>`).join('')}</div></section><section class="panel"><div class="panel-head"><div><h2>Ventas por ubicación</h2><div class="caption">Unidades vendidas · acumulado</div></div></div><div class="donut-wrap"><div class="donut" role="img" aria-label="${locs.map((l, i) => l.name + ': ' + sold[i]).join(', ')}" style="background:${sum ? 'conic-gradient(' + gradient + ')' : '#edf1e7'}"><div class="donut-hole"><strong>${num(sum)}</strong><span>unidades vendidas</span></div></div><div class="legend">${locs.map((l, i) => `<div class="legend-row"><i class="dot" style="background:${colors[i]}"></i>${esc(l.name)}<strong>${sold[i]}</strong></div>`).join('')}</div></div></section></div><section class="panel" style="margin-top:24px"><div class="panel-head"><div><h2>Últimos movimientos</h2><div class="caption">El pulso de tu negocio</div></div><button class="inline-link" onclick="go('reports')">Ver historial →</button></div>${eventTable(S.events.slice(0, 5), true)}</section>`; return }
    if (['sales', 'purchases', 'transfers'].includes(page)) { const kind = { sales: 'venta', purchases: 'compra', transfers: 'traslado' }[page]; c.innerHTML = heading({ sales: 'Ventas', purchases: 'Entradas y compras', transfers: 'Traslados entre ubicaciones' }[page], { sales: 'Cada venta actualiza las existencias de su ubicación.', purchases: 'Registra mercancía recibida y su proveedor.', transfers: 'Mueve inventario con origen, destino y cantidad.' }[page], mayRegister(kind) ? btn('+ ' + { sales: 'Registrar venta', purchases: 'Registrar entrada', transfers: 'Nuevo traslado' }[page], `openForm('${kind}')`) : '') + `<section class="panel">${toolbar(true)}<div id="rows"></div></section>`; updateRows(); return }
    if (page === 'inventory') { c.innerHTML = heading('Inventario', 'Existencias disponibles por producto y ubicación.', mayRegister('compra') ? btn('+ Añadir inventario', "openForm('compra')") : '') + `<section class="panel">${toolbar()}<div id="rows"></div></section>`; updateRows(); return }
    if (page === 'products') {
        c.innerHTML = heading('Productos', 'Consulta y actualiza el catálogo.', admin() ? btn('+ Nuevo producto', "openForm('product')") : '') +
            `<section class="panel"><div class="toolbar">
                <input class="search" placeholder="Buscar producto…" aria-label="Buscar producto" value="${esc(query)}" oninput="query=this.value;updateRows()">
                ${admin() ? `<select aria-label="Estado del producto" onchange="catalogStatus=this.value;updateRows()">
                    <option value="active" ${catalogStatus === 'active' ? 'selected' : ''}>Visibles</option>
                    <option value="hidden" ${catalogStatus === 'hidden' ? 'selected' : ''}>Ocultos</option>
                    <option value="all" ${catalogStatus === 'all' ? 'selected' : ''}>Todos</option>
                </select>` : ''}
            </div><div id="rows"></div></section>`;
        updateRows();
        return;
    }
    if (page === 'reports') { c.innerHTML = heading('Reportes', 'Resumen de ventas, existencias e historial de operaciones.') + `<section class="panel">${toolbar(true)}<div id="rows"></div></section>`; updateRows(); return }
    if (page === 'users' && admin()) c.innerHTML = usersPage();
}
function usersPage() {
    const rows = S.users.map(user => {
        const isAdmin = user.role === 'admin';
        const permissions = isAdmin ? 'Acceso completo' : movementActions
            .filter(([action]) => user.permissions.includes(action)).map(([, label]) => label).join(', ') || 'Solo consulta';
        const status = user.active ? 'Activo' : 'Inactivo';
        return `<tr>
            <td><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small></td>
            <td>${isAdmin ? 'Administrador' : 'Operador'}</td>
            <td>${isAdmin ? 'Todas' : esc(L(user.location))}</td>
            <td class="permission-cell">${esc(permissions)}</td>
            <td><span class="badge ${user.active ? '' : 'red'}">${status}</span></td>
            <td><div class="row-actions">
                <button class="inline-link" data-key="${esc(user.email)}" onclick="openForm('user',this.dataset.key)">Editar</button>
                ${user.email !== S.user.email ? statusButton('user', user.email, user.active) : ''}
            </div></td>
        </tr>`;
    }).join('');
    return heading('Usuarios y accesos', 'Asigna el rol y las acciones de cada cuenta.', btn('+ Crear usuario', "openForm('user')")) +
        `<section class="panel"><div class="table-wrap"><table>
            <thead><tr><th>Usuario</th><th>Rol</th><th>Ubicación</th><th>Permisos</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>${rows}</tbody></table></div></section>`;
}
function productsTable() {
    const products = relevantProducts(admin()).filter(product =>
        catalogStatus === 'all' || !!product.active === (catalogStatus === 'active'));
    const rows = products.map(product => `<tr>
        <td><strong>${esc(product.name)}</strong><small>${esc(product.code)}</small></td>
        <td>${product.minimum}</td><td>${stock(product.code)}</td>
        ${admin() ? `<td><span class="badge ${product.active ? '' : 'red'}">${product.active ? 'Visible' : 'Oculto'}</span></td>
        <td><div class="row-actions">
            <button class="inline-link" data-key="${esc(product.code)}" onclick="openForm('product',this.dataset.key)">Editar</button>
            ${statusButton('product', product.code, product.active)}
        </div></td>` : ''}
    </tr>`).join('');
    return `<div class="table-wrap"><table>
        <thead><tr><th>Producto</th><th>Mínimo de referencia</th><th>Existencias</th>${admin() ? '<th>Estado</th><th>Acciones</th>' : ''}</tr></thead>
        <tbody>${rows || '<tr><td class="empty">No se encontraron productos.</td></tr>'}</tbody></table></div>`;
}
function statusButton(kind, key, active) {
    const label = kind === 'product' ? (active ? 'Ocultar' : 'Mostrar') : (active ? 'Desactivar' : 'Reactivar');
    return `<button class="inline-link" data-key="${esc(key)}" data-active="${active ? 0 : 1}" onclick="changeStatus('${kind}',this)">${label}</button>`;
}
function inventoryTable() { const locs = S.locations.filter(l => (admin() || l.id === S.user.location) && (!filter || filter === l.id)); return `<div class="table-wrap"><table><thead><tr><th>Producto</th>${locs.map(l => '<th>' + esc(l.name) + '</th>').join('')}<th>Total</th><th>Estado</th></tr></thead><tbody>${relevantProducts().map(p => { const total = locs.reduce((a, l) => a + stock(p.code, l.id), 0); return `<tr><td><div class="cell-product"><span class="product-mark">◇</span><div><strong>${esc(p.name)}</strong><small>${esc(p.code)}</small></div></div></td>${locs.map(l => `<td>${stock(p.code, l.id)}</td>`).join('')}<td><strong>${total}</strong></td><td><span class="badge ${total === 0 ? 'red' : total <= p.minimum ? 'warn' : ''}">${total === 0 ? 'Agotado' : total <= p.minimum ? 'Stock bajo' : 'Disponible'}</span></td></tr>` }).join('') || '<tr><td class="empty">No se encontraron productos.</td></tr>'}</tbody></table></div>` }
function updateRows() {
    renderRows();
    const rows = $('#rows');
    if (rows) labelTableCells(rows);
}
function renderRows() { const r = $('#rows'); if (!r) return; if (page === 'inventory') r.innerHTML = inventoryTable(); else if (page === 'products') r.innerHTML = productsTable(); else if (page === 'reports') { const ev = visibleEvents(), sold = ev.filter(e => e.kind === 'venta').reduce((a, e) => a + e.quantity, 0); r.innerHTML = `<div class="notice"><p><strong>${sold}</strong> unidades vendidas en el período · <strong>${ev.length}</strong> movimientos · <strong>${stock(null, filter)}</strong> unidades disponibles actualmente</p></div><h2 style="margin-bottom:16px">Resumen de ventas por producto</h2><div class="table-wrap"><table><thead><tr><th>Producto</th><th>Unidades vendidas</th></tr></thead><tbody>${relevantProducts().map(p => ({ p, q: ev.filter(e => e.kind === 'venta' && e.code === p.code).reduce((a, e) => a + e.quantity, 0) })).filter(x => x.q).map(x => `<tr><td>${esc(x.p.name)}</td><td>${x.q}</td></tr>`).join('') || '<tr><td class="empty">Sin ventas en el período.</td></tr>'}</tbody></table></div><h2 style="margin:24px 0 16px">Resumen de existencias actuales</h2>${inventoryTable()}<h2 style="margin:24px 0 16px">Historial de movimientos</h2>${eventTable(ev)}`; } else r.innerHTML = eventTable(visibleEvents({ sales: 'venta', purchases: 'compra', transfers: 'traslado' }[page])) }
function options(locs, value) { return locs.map(l => `<option value="${esc(l.id)}" ${value === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('') }
function openForm(kind, key) {
    formId = crypto.randomUUID();
    const modal = $('#modal');
    let fields = '', title = '', sub = '';
    if (kind === 'product') {
        const product = S.products.find(item => item.code === key);
        title = product ? 'Editar producto' : 'Nuevo producto';
        fields = `
            <input type="hidden" name="mode" value="${product ? 'edit' : 'create'}">
            <label>Código<input name="code" value="${esc(product?.code)}" ${product ? 'readonly' : ''} required maxlength="40" pattern="[A-Za-z0-9_\\-]+" placeholder="MOT012"></label>
            <label>Nombre del producto<input name="name" value="${esc(product?.name)}" required maxlength="160"></label>
            <label>Stock mínimo global<input name="minimum" type="number" min="0" step="1" value="${product?.minimum ?? 2}" required></label>`;
    } else if (kind === 'user') {
        const user = S.users.find(item => item.email === key);
        title = user ? 'Editar usuario' : 'Crear usuario';
        sub = user ? 'Deja la contraseña vacía para conservar la actual.' : 'Elige el rol, la ubicación y los permisos de la cuenta.';
        fields = userFields(user); } else { title = { venta: 'Registrar venta', compra: 'Registrar entrada', traslado: 'Nuevo traslado' }[kind]; sub = { venta: 'Se descontará la cantidad del inventario disponible.', compra: 'La mercancía se sumará a la ubicación seleccionada.', traslado: 'La salida y la entrada se registran juntas.' }[kind]; const own = S.locations.filter(l => admin() || l.id === S.user.location); fields = `<input type="hidden" name="kind" value="${kind}"><label class="full">Producto<select name="code" required onchange="showAvailable()"><option value="">Selecciona un producto</option>${S.products.filter(p => p.active).map(p => `<option value="${esc(p.code)}">${esc(p.code + ' · ' + p.name)}</option>`).join('')}</select></label>${kind !== 'compra' ? `<label>Origen<select name="origin" onchange="showAvailable()">${options(own)}</select></label>` : ''}${kind !== 'venta' ? `<label>Destino<select name="destination">${options(kind === 'compra' ? own : S.locations, kind === 'traslado' ? 'Sucursal 1' : undefined)}</select></label>` : ''}<label>Cantidad<input name="quantity" type="number" min="1" max="1000000" step="1" required placeholder="0"></label>${kind === 'compra' ? '<label>Proveedor<input name="supplier" required maxlength="160" placeholder="Nombre del proveedor"></label>' : ''}<div class="full caption" id="available"></div><label class="full">Observaciones <span style="color:#8e9986">(opcional)</span><textarea name="note" rows="2" maxlength="400" placeholder="Referencia o detalle del movimiento"></textarea></label>` } modal.innerHTML = `<button class="close" aria-label="Cerrar" onclick="$('#modal').close()">×</button><h2>${title}</h2><p>${sub}</p><form id="entryform"><div class="form-grid">${fields}</div><div class="error" role="alert" id="formerror"></div><div class="form-footer"><button type="button" class="button secondary" onclick="$('#modal').close()">Cancelar</button><button class="button" type="submit">Guardar ${kind === 'product' ? 'producto' : kind === 'user' ? 'usuario' : 'movimiento'}</button></div></form>`; $('#entryform').onsubmit = e => submit(e, kind); if (kind === 'user') updateRoleFields(); modal.showModal(); showAvailable() }
function userFields(user) {
    const self = user?.email === S.user.email;
    const role = user?.role ?? 'operador';
    return `
        <input type="hidden" name="mode" value="${user ? 'edit' : 'create'}">
        <input type="hidden" name="originalEmail" value="${esc(user?.email)}">
        <label>Nombre<input name="name" value="${esc(user?.name)}" required maxlength="160"></label>
        <label>Correo de acceso<input name="email" type="email" value="${esc(user?.email)}" required maxlength="160"></label>
        <label>Contraseña<input name="password" type="password" minlength="12" maxlength="256" autocomplete="new-password" ${user ? '' : 'required'}></label>
        <label>Rol<select name="role" onchange="updateRoleFields()">
            ${self ? '' : `<option value="operador" ${role === 'operador' ? 'selected' : ''}>Operador</option>`}
            <option value="admin" ${role === 'admin' ? 'selected' : ''}>Administrador</option>
        </select></label>
        <label id="operator-location" class="full">Ubicación<select name="location">${options(S.locations,user?.location)}</select></label>
        <fieldset id="operator-actions" class="full permission-options">
            <legend>Acciones permitidas</legend>
            ${movementActions.map(([value, label]) => `<label><input type="checkbox" name="permissions" value="${value}" ${user?.permissions.includes(value) ? 'checked' : ''}>${label}</label>`).join('')}
            <p>Sin acciones seleccionadas, la cuenta puede consultar su ubicación.</p>
        </fieldset>
        <p id="admin-actions" class="full caption">El administrador tiene acceso a todas las ubicaciones y puede gestionar usuarios y productos.</p>`;
}
function updateRoleFields() {
    const isAdmin = $('#entryform').elements.role.value === 'admin';
    $('#operator-location').hidden = isAdmin;
    $('#operator-location select').disabled = isAdmin;
    $('#operator-actions').hidden = isAdmin;
    $('#operator-actions').disabled = isAdmin;
    $('#admin-actions').hidden = !isAdmin;
}
function showAvailable() { const f = $('#entryform'), el = $('#available'); if (!el || !f.elements.code.value) return; const loc = f.elements.origin?.value; el.textContent = loc ? 'Disponible en origen: ' + stock(f.elements.code.value, loc) + ' unidades.' : '' }
async function submit(e, kind) { e.preventDefault(); const f = e.target, button = f.querySelector('[type=submit]'), error = $('#formerror'); button.disabled = true; error.style.display = 'none'; try { const data = new FormData(f); const body = Object.fromEntries(data); if (kind === 'user') body.permissions = data.getAll('permissions'); body.id = formId; await api(['product', 'user'].includes(kind) ? kind : 'event', body); $('#modal').close(); await load(); toast('Registro guardado correctamente.') } catch (err) { error.textContent = err.message; error.style.display = 'block' } finally { button.disabled = false } }
async function importData(b) { b.disabled = true; try { await api('import', {}); await load(); toast('Excel importado. Existencias: 11 unidades.') } catch (e) { toast(e.message); b.disabled = false } }
async function changeStatus(kind, button) {
    button.disabled = true;
    const key = kind === 'product' ? 'code' : 'email';
    try {
        await api(kind + '-status', { [key]: button.dataset.key, active: button.dataset.active === '1' });
        await load();
        toast('Estado actualizado.');
    } catch (error) {
        toast(error.message);
        button.disabled = false;
    }
}
function exportCSV() { let rows; if (['inventory', 'products'].includes(page)) { const locs = S.locations.filter(l => (admin() || l.id === S.user.location) && (!filter || l.id === filter)); rows = [['Código', 'Producto', ...locs.map(l => l.name), 'Total'], ...relevantProducts().map(p => [p.code, p.name, ...locs.map(l => stock(p.code, l.id)), locs.reduce((a, l) => a + stock(p.code, l.id), 0)])] } else { rows = [['Fecha', 'Tipo', 'Código', 'Producto', 'Cantidad', 'Origen', 'Destino', 'Proveedor', 'Observaciones', 'Usuario'], ...visibleEvents({ sales: 'venta', purchases: 'compra', transfers: 'traslado' }[page]).map(e => [e.date, typeNames[e.kind], e.code, (e.product_name || P(e.code)), e.quantity, L(e.origin), L(e.destination), e.supplier, e.note, e.actor])] } const csv = '\uFEFF' + rows.map(row => row.map(v => '"' + String(v ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"').join(';')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'nexo-' + page + '-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
load();
