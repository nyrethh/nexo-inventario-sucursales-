import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import pg from 'pg';

async function query(url, sql) {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
    try {
        await client.connect();
        return (await client.query(sql)).rows;
    } finally {
        await client.end();
    }
}

async function inspect(url) {
    const [schema] = await query(url, "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS installed");
    if (!schema.installed) return null;
    const [summary] = await query(url, `SELECT current_database() AS database,
        (SELECT count(*) FROM products)::int AS products,
        (SELECT count(*) FROM events)::int AS movements,
        EXISTS (SELECT 1 FROM users WHERE role='admin' AND active=1) AS admin`);
    return summary;
}

async function chooseDatabase() {
    let muted = false;
    const output = new Writable({
        write(chunk, encoding, done) {
            if (!muted) process.stdout.write(chunk);
            done();
        }
    });
    output.isTTY = process.stdout.isTTY;
    const prompt = createInterface({ input: process.stdin, output, terminal: true });
    try {
        console.log('Nexo · Conexión a PostgreSQL 17 (localhost:5432)');
        const user = (await prompt.question('Usuario de PostgreSQL [postgres]: ')).trim() || 'postgres';
        process.stdout.write('Contraseña de PostgreSQL (no se muestra): ');
        muted = true;
        const password = await prompt.question('');
        muted = false;
        process.stdout.write('\n');
        const base = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:5432/`;
        const connection = database => base + encodeURIComponent(database) + '?sslmode=disable';
        const databases = await query(connection('postgres'), `SELECT datname FROM pg_database
            WHERE datallowconn AND NOT datistemplate AND has_database_privilege(datname, 'CONNECT')
            ORDER BY datname`);
        const matches = [];
        for (const { datname } of databases) {
            const url = connection(datname);
            const summary = await inspect(url).catch(() => null);
            if (summary) matches.push({ url, summary });
        }
        if (!matches.length) throw new Error('No se encontró la base con el SQL de Nexo en PostgreSQL local.');
        if (matches.length === 1) return matches[0];
        matches.forEach(({ summary }, index) => console.log(`${index + 1}. ${summary.database}`));
        const choice = Number(await prompt.question('Número de la base de Nexo: '));
        const match = matches[choice - 1];
        if (!match) throw new Error('Selecciona un número de la lista.');
        return match;
    } finally {
        prompt.close();
    }
}

try {
    let summary;
    const configured = process.env.DATABASE_URL;
    if (configured && new URL(configured).hostname.toLowerCase() !== 'host') {
        summary = await inspect(configured);
        if (!summary) throw new Error('La base configurada no contiene las tablas de Nexo.');
    } else {
        const match = await chooseDatabase();
        summary = match.summary;
        const path = new URL('../.env.local', import.meta.url);
        const previous = await readFile(path, 'utf8').catch(error => {
            if (error.code === 'ENOENT') return '';
            throw error;
        });
        const settings = previous.split(/\r?\n/).filter(line => !/^\s*(?:DATABASE_URL(?:_UNPOOLED)?|APP_URL)\s*=/.test(line)).join('\n').trim();
        await writeFile(path, `${settings ? settings + '\n' : ''}DATABASE_URL=${match.url}\nAPP_URL=http://localhost:3000\n`, 'utf8');
        process.env.DATABASE_URL = match.url;
        delete process.env.DATABASE_URL_UNPOOLED;
    }
    process.env.APP_URL = 'http://localhost:3000';
    process.env.PORT = '3000';
    console.log(`Base: ${summary.database}. Productos: ${summary.products}. Movimientos: ${summary.movements}.`);
    if (!summary.admin) {
        console.log('Asigna el administrador en pgAdmin con sql/04-administrador-inicial.sql.');
    }
    console.log('Mantén esta ventana abierta mientras uses Nexo.');
    await import('../server.mjs');
} catch (error) {
    const messages = {
        '28P01': 'PostgreSQL rechazó el usuario o la contraseña. Comprueba los datos que usas en pgAdmin.',
        ECONNREFUSED: 'PostgreSQL no responde en localhost:5432.'
    };
    console.error(messages[error.code] || error.message);
    process.exitCode = 1;
}
