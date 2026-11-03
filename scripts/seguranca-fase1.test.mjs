// Teste HTTP da varredura de segurança de 02/11/2026 (§145): cliente não gera nem usa chave pxk_; chave de base suspensa para;
// link iCal com IP digitado direto recusado (e só equipe); link de agendamento some para dono vencido; cabeçalhos (sem X-Powered-By,
// CSP só relatório). Contra servidor e Postgres LOCAIS, usuários e base temporários.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/seguranca-fase1.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const ORG = 'sandbox-edu';
const ORG_S = `oisf1-${crypto.randomBytes(3).toString('hex')}`;
const PASS = crypto.randomBytes(12).toString('base64url');
const RUN = crypto.randomBytes(3).toString('hex');
const U = { staff: `oisf_staff_${RUN}`, cli: `oisf_cli_${RUN}`, sus: `oisf_sus_${RUN}`, old: `oisf_old_${RUN}` };
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const hash = await bcrypt.hash(PASS, 10);
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
async function cleanup() {
  await pool.query(`DELETE FROM api_tokens WHERE user_id LIKE 'oisf_%'`);
  await pool.query(`DELETE FROM personal_boards WHERE user_id LIKE 'oisf_%'`).catch(() => {});
  await pool.query(`DELETE FROM user_accounts WHERE user_id LIKE 'oisf_%'`).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id LIKE 'oisf_%'`);
  await pool.query(`DELETE FROM organizations WHERE id LIKE 'oisf1-%'`);
}
const mintDb = async (user, scope) => {
  const t = `pxk_${crypto.randomBytes(32).toString('base64url')}`;
  await pool.query(`INSERT INTO api_tokens (id, user_id, name, scope, token_hash, expires_at) VALUES ($1,$2,'teste',$3,$4, now() + interval '5 days')`, [`tok_oisf_${crypto.randomBytes(4).toString('hex')}`, user, scope, sha(t)]);
  return t;
};
await cleanup();
try {
  await pool.query(`INSERT INTO organizations (id, slug, name, status) VALUES ($1,$1,'OISF SUSPENSA','suspended')`, [ORG_S]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access) VALUES ($1,$1,$2,'Equipe Teste F1','pricetax',$3,true)`, [U.staff, hash, ORG]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access) VALUES ($1,$1,$2,'Cliente Teste F1','cliente',$3,true)`, [U.cli, hash, ORG]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access) VALUES ($1,$1,$2,'Base suspensa F1','pricetax',$3,true)`, [U.sus, hash, ORG_S]);
  const bookTok = crypto.randomBytes(18).toString('base64url');
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,expires_at,preferences) VALUES ($1,$1,$2,'Vencido F1','pricetax',$3,'2020-01-01',$4)`,
    [U.old, hash, ORG, JSON.stringify({ agendaBooking: { enabled: true, token: bookTok, settings: {} } })]);

  const login = async (u) => { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; };
  const call = async (headers, method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch { /* sem corpo */ } return { status: r.status, json, headers: r.headers }; };
  const ck = { staff: await login(U.staff), cli: await login(U.cli) };
  ok('login dos usuários temporários', !!ck.staff && !!ck.cli);

  // ---- chave de API
  const cliMint = await call({ Cookie: ck.cli }, 'POST', '/api/connect/tokens', { name: 'x', scope: 'transcripts', days: 30 });
  ok('cliente NÃO gera chave (403), nem a de transcrições', cliMint.status === 403, cliMint);
  ok('cliente NÃO gera nem a chave só de leitura', (await call({ Cookie: ck.cli }, 'POST', '/api/connect/tokens', { name: 'x', scope: 'read', days: 30 })).status === 403);
  const stMint = await call({ Cookie: ck.staff }, 'POST', '/api/connect/tokens', { name: 'x', scope: 'read_all', days: 30 });
  ok('equipe continua gerando chave (201)', stMint.status === 201, stMint.status);
  ok('chave da equipe funciona (200)', (await call({ Authorization: `Bearer ${stMint.json.token}` }, 'GET', '/api/connect/me')).status === 200);
  const cliOld = await mintDb(U.cli, 'transcripts');
  ok('chave antiga de cliente para de valer (403)', (await call({ Authorization: `Bearer ${cliOld}` }, 'GET', '/api/connect/me')).status === 403);
  const susTok = await mintDb(U.sus, 'read_all');
  ok('chave de base suspensa para de valer (403)', (await call({ Authorization: `Bearer ${susTok}` }, 'GET', '/api/connect/me')).status === 403);

  // ---- iCal
  const ip = await call({ Cookie: ck.staff }, 'POST', '/api/agenda/accounts/ical', { url: 'https://10.0.0.1/a.ics', label: 'x' });
  ok('iCal com IP interno digitado direto recusado (400)', ip.status === 400, ip);
  const ip6 = await call({ Cookie: ck.staff }, 'POST', '/api/agenda/accounts/ical', { url: 'https://[::ffff:7f00:1]/a.ics', label: 'x' });
  ok('iCal com IPv6 que embrulha 127.0.0.1 recusado (400)', ip6.status === 400, ip6);
  ok('cliente não adiciona agenda iCal (403)', (await call({ Cookie: ck.cli }, 'POST', '/api/agenda/accounts/ical', { url: 'https://calendar.google.com/x.ics' })).status === 403);

  // ---- link de agendamento
  ok('link de agendamento de dono com acesso vencido some (404)', (await call({}, 'GET', `/api/public-booking/${bookTok}`)).status === 404);

  // ---- cabeçalhos
  const home = await fetch(`${BASE}/`);
  ok('sem X-Powered-By', !home.headers.get('x-powered-by'));
  ok('CSP em modo só relatório na página', /default-src 'self'/.test(home.headers.get('content-security-policy-report-only') || '') && !home.headers.get('content-security-policy'));
  ok('Permissions-Policy presente', /camera=\(\)/.test(home.headers.get('permissions-policy') || ''));
  const rep = await fetch(`${BASE}/api/csp-report`, { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'https://exemplo.com/x.js', 'document-uri': `${BASE}/quadro/segredo` } }) });
  ok('relatório de CSP aceito (204)', rep.status === 204);
} finally {
  await cleanup();
  await pool.end();
}
console.log(failed ? `\n${failed} falha(s).` : '\nSegurança Fase 1: tudo certo.');
process.exit(failed ? 1 : 0);
