// Teste HTTP real da Central de Inteligência Operacional: controle de acesso, isolamento por organização, sanitização da
// captura e mascaramento de IP. Precisa do servidor local rodando contra o Postgres local (nunca contra produção): o script
// cria 4 usuários temporários (oitmp_*, senha aleatória), usa e apaga no fim.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/ops-intel-http.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const PASS = crypto.randomBytes(12).toString('base64url');
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: este teste só roda contra banco local.'); process.exit(2); }
const OI_USERS = { master: 'oitmp_master', master2: 'oitmp_master2', staff: 'oitmp_staff', cli: 'oitmp_cli' };

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra ? ` -> ${extra}` : ''}`); } };

async function login(username) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: PASS }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return { status: r.status, cookie };
}
const call = async (cookie, method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, json };
};

const pool = new pg.Pool({ connectionString: DB });
const { rows: [org] } = await pool.query(`SELECT org_id FROM users WHERE role='master' AND org_id IS NOT NULL AND org_id NOT LIKE 'eval-%' LIMIT 1`);
const ORG_A = org.org_id; const ORG_B = 'eval-org-oitmp';
const hash = await bcrypt.hash(PASS, 10);
const mk = (id, name, role, orgId) => pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id) VALUES ($1,$1,$2,$3,$4,$5)`, [id, hash, name, role, orgId]);
async function cleanup() {
  await pool.query(`DELETE FROM user_usage_events WHERE user_id LIKE 'oitmp_%'`);
  await pool.query(`DELETE FROM user_access_events WHERE user_id LIKE 'oitmp_%'`);
  await pool.query(`DELETE FROM users WHERE id LIKE 'oitmp_%'`);
  await pool.query(`DELETE FROM organizations WHERE id=$1`, [ORG_B]);
}
await cleanup();
await pool.query(`INSERT INTO organizations (id, slug, name) VALUES ($1,'oitmp','OITMP') ON CONFLICT (id) DO NOTHING`, [ORG_B]);
await mk('oitmp_master', 'Master Teste OI', 'master', ORG_A);
await mk('oitmp_master2', 'Master Outra Org', 'master', ORG_B);
await mk('oitmp_staff', 'Staff Teste OI', 'pricetax', ORG_A);
await mk('oitmp_cli', 'Cliente Teste OI', 'cliente', ORG_A);
const sessions = {};
for (const [k, u] of Object.entries(OI_USERS)) sessions[k] = (await login(u)).cookie;
ok('login dos 4 usuários temporários', Object.values(sessions).every(Boolean));

// 1. Controle de acesso por perfil
for (const path of ['/api/ops-intel/overview', '/api/ops-intel/map', '/api/ops-intel/alerts', '/api/ops-intel/policy', `/api/ops-intel/users/${OI_USERS.staff}`]) {
  ok(`sem login → 401 em ${path}`, (await call('', 'GET', path)).status === 401);
  ok(`pricetax → 403 em ${path}`, (await call(sessions.staff, 'GET', path)).status === 403);
  ok(`cliente → 403 em ${path}`, (await call(sessions.cli, 'GET', path)).status === 403);
}

// 2. Isolamento por organização
const ov = await call(sessions.master, 'GET', '/api/ops-intel/overview');
ok('master vê a visão geral', ov.status === 200 && Array.isArray(ov.json.ranking));
const ids = ov.json.ranking.map((r) => r.userId);
ok('master vê pessoas da própria org', ids.includes(OI_USERS.staff) && ids.includes(OI_USERS.cli));
ok('master NÃO vê pessoas de outra org', !ids.includes(OI_USERS.master2) && !ids.includes('eval-user-renata'));
const ov2 = await call(sessions.master2, 'GET', '/api/ops-intel/overview');
const ids2 = ov2.json.ranking.map((r) => r.userId);
ok('master da outra org só vê a própria org', ids2.includes(OI_USERS.master2) && !ids2.includes(OI_USERS.staff));
ok('detalhe de pessoa de outra org → 404', (await call(sessions.master2, 'GET', `/api/ops-intel/users/${OI_USERS.staff}`)).status === 404);
ok('filtro userId de outra org não vaza', (await call(sessions.master2, 'GET', `/api/ops-intel/overview?userId=${OI_USERS.staff}`)).json.ranking.length === 0);
const mp2 = await call(sessions.master2, 'GET', `/api/ops-intel/map?userId=${OI_USERS.staff}`);
ok('mapa não vaza acessos de outra org', mp2.status === 200 && mp2.json.events.length === 0 && mp2.json.points.length === 0);

// 3. Captura: só equipe é medida; entrada é sanitizada
await pool.query(`DELETE FROM user_usage_events WHERE user_id LIKE 'oitmp_%'`);
const now = new Date().toISOString();
const good = { sessionId: 'sess_abcdef123', slices: [{ module: 'company', view: 'resumo', projectId: 'proj-abc123', connectedS: 60, activeS: 45, at: now }], actions: [{ action: 'export_pdf', module: 'company', projectId: 'proj-abc123' }] };
const r1 = await call(sessions.staff, 'POST', '/api/activity/usage', good);
ok('pricetax: fatia + ação gravadas', r1.status === 200 && r1.json.stored === 2, JSON.stringify(r1.json));
const r2 = await call(sessions.cli, 'POST', '/api/activity/usage', good);
ok('cliente: nada é gravado', r2.status === 200 && r2.json.stored === 0);
ok('sem login → 401 na captura', (await call('', 'POST', '/api/activity/usage', good)).status === 401);
const bad = { slices: [
  { module: 'company', view: 'resumo', projectId: 'p1', connectedS: 9999, activeS: 99999, at: now },
  { module: 'Texto Livre com espaço <script>', view: 'x', projectId: 'p1', connectedS: 30, activeS: 10 },
  { module: 'company', view: 'x', projectId: 'p1; DROP TABLE users', connectedS: 30, activeS: 10 },
  { module: 'company', view: 'x', projectId: 'p1', connectedS: -5, activeS: 1 },
  { module: 'company', view: 'x', projectId: 'p1', connectedS: 'abc', activeS: 1 },
  { module: 'company', view: 'x', projectId: 'p1', connectedS: 0, activeS: 0 },
  null, 'lixo', 42,
], actions: [{ action: 'senha_digitada', module: 'company' }, { action: 'export_pdf', module: '../etc' }, { action: 'search', module: 'crm', text: 'conteúdo não deve ser gravado' }] };
const r3 = await call(sessions.staff, 'POST', '/api/activity/usage', bad);
ok('entrada inválida: só 1 fatia (limitada) + 1 ação válida', r3.status === 200 && r3.json.stored === 2, JSON.stringify(r3.json));
const rows = (await pool.query(`SELECT kind, module, connected_s, active_s, action FROM user_usage_events WHERE user_id=$1 ORDER BY id`, [OI_USERS.staff])).rows;
const clipped = rows.find((r) => r.kind === 'slice' && r.connected_s === 120);
ok('fatia gigante cortada em 120 s e ativo ≤ conectado', !!clipped && clipped.active_s === 120);
ok('nenhuma linha de módulo/ação inválida entrou', rows.every((r) => /^[a-z0-9_:-]*$/.test(r.module)) && !rows.some((r) => r.action === 'senha_digitada'));
ok('nada de cliente gravado no banco', (await pool.query(`SELECT count(*)::int AS n FROM user_usage_events WHERE user_id=$1`, [OI_USERS.cli])).rows[0].n === 0);
const colNames = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='user_usage_events'`)).rows.map((r) => r.column_name);
ok('tabela de uso não tem coluna de conteúdo/IP/texto', !colNames.some((c) => /text|content|ip|body|query|password/.test(c)), colNames.join(','));
const many = [];
for (let i = 0; i < 25; i += 1) many.push((await call(sessions.master, 'POST', '/api/activity/usage', { slices: [{ module: 'ops', view: '', projectId: '', connectedS: 10, activeS: 5 }] })).json.stored);
ok('limite de envios: depois de 20/min para de gravar', many.slice(0, 20).every((n) => n === 1) && many.slice(20).every((n) => n === 0), many.join(','));

// 4. Os números medidos aparecem na API e batem com o que foi gravado
const ov3 = await call(sessions.master, 'GET', '/api/ops-intel/overview');
const staffRow = ov3.json.ranking.find((r) => r.userId === OI_USERS.staff);
ok('overview soma o tempo medido da pessoa (60+120=180 s conectado, 45+120=165 s ativo)', staffRow && staffRow.realActiveS === 165 && staffRow.realConnectedS === 180, JSON.stringify(staffRow));
ok('índice de atividade = ativo ÷ conectado (92%)', staffRow && staffRow.activityIndex === 92, staffRow && staffRow.activityIndex);
ok('pessoa não medida (cliente) não ganha tempo medido', ov3.json.ranking.find((r) => r.userId === OI_USERS.cli).realActiveS === 0);
ok('operações = 2 ações gravadas', staffRow && staffRow.operations === 2, staffRow && staffRow.operations);
const det = await call(sessions.master, 'GET', `/api/ops-intel/users/${OI_USERS.staff}`);
ok('detalhe da pessoa responde com linha do tempo e dias', det.status === 200 && Array.isArray(det.json.timeline) && det.json.days.some((d) => d.basis === 'real'));
ok('detalhe do cliente marca "não medido"', (await call(sessions.master, 'GET', `/api/ops-intel/users/${OI_USERS.cli}`)).json.tracked === false);

// 5. Privacidade: IP mascarado na API, sem senha em nada
await pool.query(`INSERT INTO user_access_events (user_id, kind, at, ip, city, region, country, user_agent) VALUES ($1,'login',now(),'203.0.113.77','Curitiba','Paraná','Brasil','Mozilla/5.0 (Macintosh) Chrome/120')`, [OI_USERS.staff]);
const mp = await call(sessions.master, 'GET', '/api/ops-intel/map');
ok('mapa responde com aviso de aproximação', mp.status === 200 && /aproximada/i.test(mp.json.accuracy));
ok('IP completo nunca sai na API do mapa', !JSON.stringify(mp.json).includes('203.0.113.77'));
ok('evento aparece com IP mascarado', mp.json.events.some((e) => e.city === 'Curitiba' && /\*|x|•/i.test(e.ip || '')), JSON.stringify(mp.json.events.find((e) => e.city === 'Curitiba')));
const pol = await call(sessions.cli, 'GET', '/api/activity/policy');
ok('transparência: qualquer logado lê a política', pol.status === 200 && pol.json.policy && pol.json.policy.notCollected.length > 0);
ok('política diz que senha não é coletada', pol.json.policy.notCollected.some((x) => /senha/i.test(x)));

await pool.query(`DELETE FROM ip_geo_cache WHERE ip='203.0.113.77'`);
await cleanup();
await pool.end();
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes HTTP ok');
process.exit(failed ? 1 : 0);
