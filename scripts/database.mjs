import pg from 'pg';
import { readFileSync } from 'node:fs';
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Configura DATABASE_URL en .env.local.');
const client = new pg.Client({ connectionString });
try {
    await client.connect();
    const exists = await client.query("SELECT to_regclass('public.schema_migrations') AS name");
    if (!exists.rows[0].name) { await client.query(readFileSync(new URL('../sql/01-esquema.sql', import.meta.url), 'utf8')); console.log('Esquema instalado.'); }
    else if (!(await client.query("SELECT 1 FROM schema_migrations WHERE version='001'")).rowCount) throw new Error('La versión de la base no coincide con este proyecto.');
    else console.log('El esquema ya está instalado.');
    if (!(await client.query("SELECT 1 FROM schema_migrations WHERE version='002'")).rowCount) {
        await client.query(readFileSync(new URL('../sql/03-gestion-y-permisos.sql', import.meta.url), 'utf8'));
        console.log('Gestión y permisos actualizados.');
    }
    if (!process.argv.includes('--schema-only')) {
        if (!(await client.query("SELECT 1 FROM imports WHERE id='excel-v1'")).rowCount) { await client.query(readFileSync(new URL('../sql/02-datos-excel.sql', import.meta.url), 'utf8')); console.log('Excel importado: 11 productos, 17 movimientos.'); }
        else console.log('El Excel ya fue importado; no se duplicaron datos.');
    }
    if (!(await client.query("SELECT 1 FROM schema_migrations WHERE version='003'")).rowCount) {
        await client.query(readFileSync(new URL('../sql/05-seriales-y-sucursales.sql', import.meta.url),'utf8'));
        console.log('Control individual por serial activado.');
    }
    if (!(await client.query("SELECT 1 FROM schema_migrations WHERE version='004'")).rowCount) {
        await client.query(readFileSync(new URL('../sql/06-acceso-predeterminado-sucursales.sql', import.meta.url),'utf8'));
        console.log('Perfil de sucursal actualizado.');
    }
    if (!(await client.query("SELECT 1 FROM schema_migrations WHERE version='005'")).rowCount) {
        await client.query(readFileSync(new URL('../sql/07-correccion-seriales.sql', import.meta.url),'utf8'));
        console.log('Corrección de seriales activada.');
    }
    console.log('Base de datos preparada.');
} catch (e) { console.error('No se pudo preparar la base:', e.code || e.message); process.exitCode = 1 } finally { await client.end() }
