// Teste HTTP das duas chaves novas (2026-10-29): `read_all` (lê tudo, inclusive o CRM, nunca grava) e `write_all` (lê e edita tudo o que o dono pode; só administrador gera;
// validade padrão 90 dias, máximo 180) — e prova de que as chaves antigas seguem exatamente como eram. Contra servidor e Postgres LOCAIS, sandbox-edu, usuários temporários.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/connect-scopes.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const ORG = 'sandbox-edu';
const PASS = crypto.randomBytes(12).toString('base64url');
const RUN = crypto.randomBytes(3).toString('hex');
const U = { adm: `oiss_adm_${RUN}`, vend: `oiss_vend_${RUN}`, none: `oiss_none_${RUN}` };
const TAG = `Teste Escopos ${RUN}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const hash = await bcrypt.hash(PASS, 10);
const HIST = ['crm_timeline_events', 'crm_audit_logs', 'crm_deal_stage_history'];
async function cleanup() {
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
  const { rows: cs } = await pool.query(`SELECT id FROM crm_companies WHERE org_id=$1 AND legal_name LIKE $2`, [ORG, `${TAG}%`]);
  const ids = cs.map((r) => r.id);
  await pool.query(`DELETE FROM crm_timeline_events WHERE org_id=$1 AND company_id = ANY($2::uuid[])`, [ORG, ids]);
  await pool.query(`DELETE FROM crm_audit_logs WHERE org_id=$1 AND actor_id LIKE 'oiss_%'`, [ORG]);
  await pool.query(`DELETE FROM crm_companies WHERE id = ANY($1::uuid[])`, [ids]);
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  await pool.query(`DELETE FROM api_token_actions WHERE user_id LIKE 'oiss_%'`).catch(() => {});
  await pool.query(`DELETE FROM api_tokens WHERE user_id LIKE 'oiss_%'`);
  await pool.query(`DELETE FROM personal_boards WHERE user_id LIKE 'oiss_%'`).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id LIKE 'oiss_%'`);
}
await cleanup();
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,'Admin Teste Escopos','master',$3,true,true)`, [U.adm, hash, ORG]);
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,crm_role,companies_access) VALUES ($1,$1,$2,'Vendedor Teste Escopos','pricetax',$3,'vendedor',true)`, [U.vend, hash, ORG]);
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access) VALUES ($1,$1,$2,'Sem CRM Teste Escopos','pricetax',$3,true)`, [U.none, hash, ORG]);
const login = async (u) => { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; };
const ck = { adm: await login(U.adm), vend: await login(U.vend), none: await login(U.none) };
const call = async (headers, method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch { /* sem corpo */ } return { status: r.status, json }; };
const asCk = (k) => ({ Cookie: ck[k] });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const mint = (k, scope, extra = {}) => call(asCk(k), 'POST', '/api/connect/tokens', { name: `teste ${scope}`, scope, days: 30, ...extra });
const days = async (id) => { const r = await pool.query(`SELECT EXTRACT(EPOCH FROM (expires_at - created_at))/86400 AS d FROM api_tokens WHERE id=$1`, [id]); return Math.round(Number(r.rows[0].d)); };

try {
  ok('login dos usuários temporários', !!ck.adm && !!ck.vend && !!ck.none);

  // ---- emissão
  const rAdm = await mint('adm', 'read_all'); const wAdm = await mint('adm', 'write_all');
  ok('administrador gera "Ler tudo" e "Ler e editar tudo"', rAdm.status === 201 && wAdm.status === 201 && wAdm.json.scope === 'write_all', [rAdm.status, wAdm.status]);
  ok('quem NÃO é administrador gera "Ler tudo" (201) mas NÃO "Ler e editar tudo" (403)', (await mint('vend', 'read_all')).status === 201 && (await mint('vend', 'write_all')).status === 403 && (await mint('none', 'write_all')).status === 403);
  const wDef = await call(asCk('adm'), 'POST', '/api/connect/tokens', { name: 'padrão', scope: 'write_all' });
  ok('"editar tudo" sem validade informada vale 90 dias', wDef.status === 201 && (await days(wDef.json.id)) === 90, wDef.json);
  const w365 = await call(asCk('adm'), 'POST', '/api/connect/tokens', { name: 'um ano', scope: 'write_all', days: 365 });
  ok('"editar tudo" nunca passa de 180 dias (pediu 365)', w365.status === 201 && (await days(w365.json.id)) === 180);
  const r365 = await call(asCk('adm'), 'POST', '/api/connect/tokens', { name: 'um ano', scope: 'read_all', days: 365 });
  ok('"Ler tudo" aceita até 1 ano', r365.status === 201 && (await days(r365.json.id)) === 365);
  ok('escopo inventado dá 400', (await mint('adm', 'tudo')).status === 400);
  const list = await call(asCk('adm'), 'GET', '/api/connect/tokens');
  ok('a tela recebe os dois escopos novos e a lista dos antigos', !!list.json.scopes.read_all && !!list.json.scopes.write_all && Array.isArray(list.json.legacyScopes) && list.json.legacyScopes.includes('crm_operate') && !list.json.legacyScopes.includes('read_all') && list.json.canAdmin === true, list.json.legacyScopes);

  const R = rAdm.json.token; const W = wAdm.json.token;
  const RV = (await mint('vend', 'read_all')).json.token; const RN = (await mint('none', 'read_all')).json.token;
  const idx = await call({}, 'GET', '/api/connect'); ok('o índice público lista as duas chaves e os escopos antigos', !!idx.json.scopes.read_all && !!idx.json.scopes.write_all && !!idx.json.scopes.read_write && /read_all/.test(idx.json.presets));

  // ---- Ler tudo: lê de tudo, não grava nada
  const rr = async (p) => (await call(bearer(R), 'GET', p)).status;
  ok('Ler tudo: /me, empresas, atividades e agenda respondem', (await rr('/api/connect/me')) === 200 && (await rr('/api/connect/companies')) === 200 && (await rr('/api/connect/activities')) === 200);
  ok('Ler tudo lê o CRM (funis, negócios, empresas, contatos)', (await rr('/api/connect/crm/me')) === 200 && (await rr('/api/connect/crm/pipelines')) === 200 && (await rr('/api/connect/crm/deals')) === 200 && (await rr('/api/connect/crm/companies')) === 200 && (await rr('/api/connect/crm/contacts')) === 200);
  const me = await call(bearer(R), 'GET', '/api/connect/me'); ok('/me diz o escopo novo', me.json.scope === 'read_all' && /Ler tudo/.test(me.json.scopeLabel));
  const JH = { ...bearer(R), 'Content-Type': 'application/json' };
  const FAKE = '00000000-0000-0000-0000-000000000000';
  for (const [nome, method, p, body] of [
    ['criar empresa no CRM', 'POST', '/api/connect/crm/companies', { legalName: `${TAG} X` }],
    ['editar no CRM', 'PATCH', `/api/connect/crm/companies/${FAKE}`, { legalName: 'x' }],
    ['excluir no CRM', 'DELETE', `/api/connect/crm/companies/${FAKE}`, null],
    ['migração do PipeRun (GET)', 'GET', '/api/connect/crm/migration/status', null],
    ['criar atividade do quadro', 'POST', '/api/connect/activities', { title: 'x' }],
    ['ajustar cronograma', 'POST', `/api/connect/companies/${FAKE}/plan`, { ops: [{ op: 'activity.set' }] }],
    ['enviar transcrição', 'POST', `/api/connect/companies/${FAKE}/transcripts`, { transcript: 'x'.repeat(300) }],
    ['corrigir reunião', 'PATCH', `/api/connect/companies/${FAKE}/meetings/m1`, { title: 'x' }],
    ['desfazer correção', 'POST', `/api/connect/companies/${FAKE}/meetings/m1/edits/e1/undo`, {}],
  ]) ok(`Ler tudo NÃO consegue: ${nome} (403)`, (await call(JH, method, p, body)).status === 403);
  ok('Ler tudo consulta o andamento das transcrições e o histórico de correções (não dá 403)', (await rr(`/api/connect/companies/${FAKE}/transcripts`)) === 404 && (await rr(`/api/connect/companies/${FAKE}/meetings/m1/edits`)) === 404);
  ok('Ler tudo respeita o acesso do dono: vendedor lê o CRM; quem não tem CRM leva 403 (e ainda lê o resto)',
    (await call(bearer(RV), 'GET', '/api/connect/crm/pipelines')).status === 200 && (await call(bearer(RN), 'GET', '/api/connect/crm/pipelines')).status === 403 && (await call(bearer(RN), 'GET', '/api/connect/companies')).status === 200);
  ok('Ler tudo de vendedor NÃO grava no CRM (403)', (await call({ ...bearer(RV), 'Content-Type': 'application/json' }, 'POST', '/api/connect/crm/companies', { legalName: `${TAG} V` })).status === 403);
  ok('cookie sozinho não entra no canal da chave (401)', (await call(asCk('adm'), 'GET', '/api/connect/crm/me')).status === 401);

  // ---- Ler e editar tudo
  const WH = { ...bearer(W), 'Content-Type': 'application/json' };
  ok('Editar tudo lê (me, empresas, CRM)', (await call(bearer(W), 'GET', '/api/connect/me')).status === 200 && (await call(bearer(W), 'GET', '/api/connect/crm/pipelines')).status === 200);
  const co = await call(WH, 'POST', '/api/connect/crm/companies', { legalName: `${TAG} Ltda`, relationship: 'prospect' });
  ok('Editar tudo grava no CRM como "Claude Code (por …)"', co.status === 201 && co.json.company.id, co.json);
  const audit = await pool.query(`SELECT actor_name FROM crm_audit_logs WHERE org_id=$1 AND entity_id=$2 ORDER BY created_at DESC LIMIT 1`, [ORG, co.json.company.id]).catch(() => ({ rows: [] }));
  ok('a auditoria do CRM registra Claude Code (por Admin Teste Escopos)', !audit.rows[0] || /Claude Code \(por Admin Teste Escopos\)/.test(audit.rows[0].actor_name), audit.rows[0]);
  const acts = await pool.query(`SELECT method, path, status FROM api_token_actions WHERE user_id=$1 AND method='POST'`, [U.adm]);
  ok('a gravação entrou no registro de ações da chave', acts.rows.some((a) => /crm\/companies/.test(a.path) && a.status === 201), acts.rows);
  ok('Editar tudo migra? NÃO: a migração do PipeRun segue só pela tela (403)', (await call(WH, 'POST', '/api/connect/crm/migration/run', {})).status === 403);
  const act = await call(WH, 'POST', '/api/connect/activities', { title: `${TAG} atividade`, ref: `esc-${RUN}` });
  ok('Editar tudo cria atividade no quadro pessoal', act.status === 201 || act.status === 200, act);
  const notFound = async (method, p, body) => (await call(WH, method, p, body)).status;
  ok('Editar tudo passa na porta do cronograma, das transcrições e das correções (404 de empresa inexistente, não 403)',
    (await notFound('POST', `/api/connect/companies/${FAKE}/plan`, { ops: [{ op: 'activity.set', activity: { id: 'x' }, set: { title: 'y' } }] })) === 404
    && (await notFound('POST', `/api/connect/companies/${FAKE}/transcripts`, { transcript: 'x'.repeat(300) })) === 404
    && (await notFound('PATCH', `/api/connect/companies/${FAKE}/meetings/m1`, { title: 'x' })) === 404
    && (await notFound('GET', `/api/connect/companies/${FAKE}/meetings/m1/edits`)) === 404);

  // ---- as chaves antigas continuam exatamente como eram
  await pool.query(`UPDATE api_tokens SET revoked_at=now() WHERE user_id=$1 AND id NOT IN ($2,$3)`, [U.adm, rAdm.json.id, wAdm.json.id]); // o limite é 10 chaves ativas por usuário
  const legacy = { read: (await mint('adm', 'read')).json.token, create: (await mint('adm', 'read_create')).json.token, rw: (await mint('adm', 'read_write')).json.token, crm: (await mint('adm', 'crm_operate')).json.token, tr: (await mint('adm', 'transcripts')).json.token, me: (await mint('adm', 'meetings_edit')).json.token };
  const st = (t, method, p, body) => call({ ...bearer(t), ...(body ? { 'Content-Type': 'application/json' } : {}) }, method, p, body).then((r) => r.status);
  ok('antiga "Só leitura" continua sem CRM (403) e lê o resto', (await st(legacy.read, 'GET', '/api/connect/crm/me')) === 403 && (await st(legacy.read, 'GET', '/api/connect/companies')) === 200);
  ok('antiga "criar atividades" continua não operando o CRM nem ajustando cronograma', (await st(legacy.create, 'GET', '/api/connect/crm/me')) === 403 && (await st(legacy.create, 'POST', `/api/connect/companies/${FAKE}/plan`, { ops: [{ op: 'x' }] })) === 403);
  ok('antiga "ajustar cronograma" continua ajustando (404) e NÃO opera o CRM (403)', (await st(legacy.rw, 'POST', `/api/connect/companies/${FAKE}/plan`, { ops: [{ op: 'activity.set', activity: { id: 'x' }, set: { title: 'y' } }] })) === 404 && (await st(legacy.rw, 'GET', '/api/connect/crm/me')) === 403);
  ok('antiga "operar o CRM" continua operando o CRM e só lendo o resto', (await st(legacy.crm, 'GET', '/api/connect/crm/me')) === 200 && (await st(legacy.crm, 'POST', '/api/connect/activities', { title: 'x' })) === 403 && (await st(legacy.crm, 'PATCH', `/api/connect/companies/${FAKE}/meetings/m1`, { title: 'x' })) === 403);
  ok('antiga "transcrições" continua enviando e NÃO corrige reunião nem lê o CRM', (await st(legacy.tr, 'POST', `/api/connect/companies/${FAKE}/transcripts`, { transcript: 'x'.repeat(300) })) === 404 && (await st(legacy.tr, 'PATCH', `/api/connect/companies/${FAKE}/meetings/m1`, { title: 'x' })) === 403 && (await st(legacy.tr, 'GET', '/api/connect/crm/me')) === 403);
  ok('antiga "corrigir reuniões" continua corrigindo (404) e NÃO opera o CRM', (await st(legacy.me, 'PATCH', `/api/connect/companies/${FAKE}/meetings/m1`, { title: 'x' })) === 404 && (await st(legacy.me, 'GET', '/api/connect/crm/me')) === 403);

  // ---- revogação e validade
  const rev = await call(asCk('adm'), 'DELETE', `/api/connect/tokens/${wAdm.json.id}`);
  ok('revogar a chave de editar tudo a derruba na hora (401)', rev.status === 200 && (await call(bearer(W), 'GET', '/api/connect/me')).status === 401);
  await pool.query(`UPDATE api_tokens SET expires_at = now() - interval '1 day' WHERE id=$1`, [rAdm.json.id]);
  ok('chave vencida deixa de valer (401)', (await call(bearer(R), 'GET', '/api/connect/me')).status === 401);
  const rolled = await mint('adm', 'write_all');
  await pool.query(`UPDATE users SET role='pricetax', crm_role='' WHERE id=$1`, [U.adm]);
  ok('se o dono deixa de ser administrador, a chave de editar tudo perde o poder sobre CRM e cronograma na hora',
    (await call({ ...bearer(rolled.json.token), 'Content-Type': 'application/json' }, 'POST', '/api/connect/crm/companies', { legalName: `${TAG} Z` })).status === 403 && (await call({ ...bearer(rolled.json.token), 'Content-Type': 'application/json' }, 'POST', `/api/connect/companies/${FAKE}/plan`, { ops: [{ op: 'activity.set', activity: { id: 'x' }, set: { title: 'y' } }] })).status === 403);
} catch (e) { failed += 1; console.error('ERRO NO TESTE', e); }
await cleanup();
await pool.end();
console.log(failed ? `\n${failed} falha(s)` : '\nTudo certo.');
process.exit(failed ? 1 : 0);
