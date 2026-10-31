// Prepara o banco do teste de fluxos (Onda 4, E2): cria o banco `cronograma_e2e` no Postgres LOCAL se ainda não existir. Recusa qualquer banco que não seja local.
import pg from 'pg';
const url = process.env.E2E_DATABASE_URL || 'postgres://localhost:5432/cronograma_e2e';
if (!/^postgres(ql)?:\/\/(?:[^@/]*@)?(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) { console.error('E2E_DATABASE_URL precisa ser um Postgres local.'); process.exit(2); }
const name = new URL(url).pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name)) { console.error('Nome de banco inválido.'); process.exit(2); }
const admin = new pg.Client({ connectionString: url.replace(/\/[^/]*$/, '/postgres') });
await admin.connect();
const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
if (!rows.length) { await admin.query(`CREATE DATABASE ${name}`); console.log(`banco ${name} criado`); } else console.log(`banco ${name} já existe`);
await admin.end();
