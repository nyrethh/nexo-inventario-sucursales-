import pg from 'pg';
import { hashPassword } from '../lib/security.js';

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const email = process.env.NEXO_ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.NEXO_ADMIN_NAME?.trim();
const password = process.env.NEXO_ADMIN_PASSWORD;
delete process.env.NEXO_ADMIN_PASSWORD;

async function provisionAdmin() {
    if (!connectionString) throw new Error('Configura DATABASE_URL en .env.local.');
    if (!email || !name || !password) {
        throw new Error('Configura NEXO_ADMIN_EMAIL, NEXO_ADMIN_NAME y NEXO_ADMIN_PASSWORD o abre Crear-Administrador.cmd.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160 || name.length > 160) {
        throw new Error('El nombre o correo no es válido.');
    }

    const passwordHash = await hashPassword(password);
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    try {
        await client.connect();
        await client.query('BEGIN');
        const result = await client.query(`INSERT INTO users(email, name, role, active, password_hash)
            VALUES ($1, $2, 'admin', 1, $3)
            ON CONFLICT (email) DO UPDATE
            SET name = excluded.name, password_hash = excluded.password_hash, active = 1
            WHERE users.role = 'admin'
            RETURNING email`, [email, name, passwordHash]);
        if (!result.rowCount) throw new Error('Ese correo ya pertenece a un operador.');
        await client.query('DELETE FROM sessions WHERE email = $1', [email]);
        await client.query('COMMIT');
        console.log('Administrador preparado. Ya puedes iniciar sesión.');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        await client.end();
    }
}

try {
    await provisionAdmin();
} catch (error) {
    console.error('No se pudo configurar el administrador:', error.code || error.message);
    process.exitCode = 1;
}
