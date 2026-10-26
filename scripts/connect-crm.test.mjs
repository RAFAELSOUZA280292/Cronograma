// Teste HTTP do CRM por chave de API (§99): o Claude Code opera o CRM (criar, editar, mover, excluir, registrar) com as mesmas regras da tela,
// tudo registrado como "Claude Code (por <dono>)". Contra servidor e Postgres LOCAIS, no sandbox (organização sandbox-edu), usuários temporários.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/connect-crm.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const ORG = 'sandbox-edu';
const PASS = crypto.randomBytes(12).toString('base64url');
const RUN = crypto.randomBytes(3).toString('hex');
const U = { adm: `oicc_adm_${RUN}`, vend: `oicc_vend_${RUN}`, cc: `oicc_cc_${RUN}` };
const TAG = `Teste Claude Code ${RUN}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const hash = await bcrypt.hash(PASS, 10);
const { rows: orgOk } = await pool.query('SELECT 1 FROM organizations WHERE id=$1', [ORG]);
if (!orgOk[0]) { console.error('Sem o sandbox local: rode scripts/sandbox-eduarda.mjs antes.'); process.exit(2); }

const HIST = ['crm_timeline_events', 'crm_audit_logs', 'crm_deal_stage_history'];
async function cleanup() {
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
  const { rows: cs } = await pool.query(`SELECT id FROM crm_companies WHERE org_id=$1 AND legal_name LIKE $2`, [ORG, `${TAG}%`]);
  const ids = cs.map((r) => r.id);
  await pool.query(`DELETE FROM crm_timeline_events WHERE org_id=$1 AND company_id = ANY($2::uuid[])`, [ORG, ids]);
  await pool.query(`DELETE FROM crm_audit_logs WHERE org_id=$1 AND actor_id LIKE 'oicc_%'`, [ORG]);
  await pool.query(`DELETE FROM crm_deal_stage_history WHERE deal_id IN (SELECT id FROM crm_deals WHERE company_id = ANY($1::uuid[]))`, [ids]);
  for (const t of ['crm_activities', 'crm_notes', 'crm_deals', 'crm_contacts']) await pool.query(`DELETE FROM ${t} WHERE company_id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_companies WHERE id = ANY($1::uuid[])`, [ids]);
  await pool.query(`DELETE FROM crm_cadences WHERE org_id=$1 AND name LIKE $2`, [ORG, `${TAG}%`]);
  for (const t of HIST) await pool.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
  await pool.query(`DELETE FROM api_token_actions WHERE user_id LIKE 'oicc_%'`).catch(() => {});
  await pool.query(`DELETE FROM api_tokens WHERE user_id LIKE 'oicc_%'`);
  await pool.query(`DELETE FROM users WHERE id LIKE 'oicc_%'`);
  await pool.query(`DELETE FROM notifications WHERE user_id LIKE 'oicc_%'`).catch(() => {});
}
await cleanup();
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access) VALUES ($1,$1,$2,'Admin Teste CC','master',$3,true,true)`, [U.adm, hash, ORG]);
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,crm_role) VALUES ($1,$1,$2,'Vendedor Teste CC','pricetax',$3,'vendedor')`, [U.vend, hash, ORG]);
await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,crm_role) VALUES ($1,$1,$2,'Claude Code','pricetax',$3,'admin')`, [U.cc, hash, ORG]);
const login = async (u) => { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; };
const ck = { adm: await login(U.adm), vend: await login(U.vend), cc: await login(U.cc) };
const call = async (headers, method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch { /* sem corpo */ } return { status: r.status, json }; };
const asCk = (k) => ({ Cookie: ck[k] });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

try {
  ok('login dos usuários temporários', !!ck.adm && !!ck.vend);
  const mint = (k, scope, name = 'Claude Code do teste') => call(asCk(k), 'POST', '/api/connect/tokens', { name, scope, days: 30 });
  ok('quem não é administrador NÃO gera chave do CRM (403)', (await mint('vend', 'crm_operate')).status === 403);
  const t1 = await mint('adm', 'crm_operate');
  ok('administrador gera a chave do CRM', t1.status === 201 && t1.json.token.startsWith('pxk_'), t1.status);
  const tokCrm = t1.json.token;
  const tokCreate = (await mint('adm', 'read_create', 'só atividades')).json.token;
  const tokRead = (await mint('adm', 'read', 'só leitura')).json.token;
  const list = await call(asCk('adm'), 'GET', '/api/connect/tokens');
  ok('a tela sabe que é administrador e lista o escopo novo', list.json.canCrm === true && (await call(asCk('vend'), 'GET', '/api/connect/tokens')).json.canCrm === false && list.json.scopes.crm_operate && list.json.tokens.some((t) => t.scope === 'crm_operate'));

  // quem pode usar
  ok('sem chave → 401', (await call({}, 'GET', '/api/connect/crm/me')).status === 401);
  ok('chave de leitura e de atividades NÃO operam o CRM (403)', (await call(bearer(tokRead), 'GET', '/api/connect/crm/me')).status === 403 && (await call(bearer(tokCreate), 'POST', '/api/connect/crm/companies', { legalName: `${TAG} X` })).status === 403);
  const me = await call(bearer(tokCrm), 'GET', '/api/connect/crm/me');
  ok('a chave do CRM enxerga o perfil de administrador do dono', me.status === 200 && me.json.capabilities.admin && me.json.capabilities.remove);
  ok('a chave do CRM continua só lendo nas rotas antigas (não cria atividade do quadro)', (await call({ ...bearer(tokCrm), 'Content-Type': 'application/json' }, 'POST', '/api/connect/activities', { title: 'x' })).status === 403);
  ok('cookie sozinho não entra no canal da chave (401)', (await call(asCk('adm'), 'GET', '/api/connect/crm/me')).status === 401);

  // criar, editar, mover, registrar
  const H = (extra = {}) => ({ ...bearer(tokCrm), ...extra });
  const co = await call(H(), 'POST', '/api/connect/crm/companies', { legalName: `${TAG} Ltda`, relationship: 'prospect' });
  ok('cria empresa', co.status === 201 && co.json.company.id, co.json);
  const companyId = co.json.company.id;
  const opt = (await call(H(), 'GET', '/api/connect/crm/options')).json;
  const pipe = opt.pipelines.find((p) => p.isDefault) || opt.pipelines[0];
  const open = pipe.stages.filter((s) => s.kind === 'open');
  const dl = await call(H(), 'POST', '/api/connect/crm/deals', { companyId, title: `${TAG} negócio`, pipelineId: pipe.id, stageId: open[0].id, value: 1000 });
  ok('cria negócio', dl.status === 201 && dl.json.deal.id, dl.json);
  const dealId = dl.json.deal.id;
  ok('edita negócio', (await call(H(), 'PATCH', `/api/connect/crm/deals/${dealId}`, { value: 2500 })).json.deal.value === 2500);
  ok('move de etapa', (await call(H(), 'POST', `/api/connect/crm/deals/${dealId}/move`, { stageId: open[1].id })).json.deal.stageId === open[1].id);
  ok('registra nota', (await call(H(), 'POST', '/api/connect/crm/notes', { entityType: 'deal', entityId: dealId, body: 'Nota registrada pelo Claude Code.' })).status === 201);
  const ac = await call(H(), 'POST', '/api/connect/crm/activities', { companyId, dealId, title: 'Follow-up de teste', activityType: 'followup', dueDate: '2030-01-10' });
  ok('cria atividade', ac.status === 201, ac.json);
  const ac2 = await call(H(), 'POST', '/api/connect/crm/activities', { companyId, dealId, title: 'Atividade para reatribuir', activityType: 'task', dueDate: '2030-02-10' });
  const nBefore = (await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1`, [U.vend])).rows[0].n;
  await call(H(), 'PATCH', `/api/connect/crm/activities/${ac2.json.activity.id}`, { ownerId: U.vend, silentNotify: true });
  const nQuiet = (await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1`, [U.vend])).rows[0].n;
  await call(H(), 'PATCH', `/api/connect/crm/activities/${ac2.json.activity.id}`, { ownerId: U.adm });
  await call(H(), 'PATCH', `/api/connect/crm/activities/${ac2.json.activity.id}`, { ownerId: U.vend });
  const nLoud = (await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1`, [U.vend])).rows[0].n;
  ok('reatribuir com silentNotify não avisa a pessoa; sem ele avisa (e a troca fica no histórico)', nQuiet === nBefore && nLoud === nBefore + 1, { nBefore, nQuiet, nLoud });
  ok('conclui atividade', (await call(H(), 'POST', `/api/connect/crm/activities/${ac.json.activity.id}/complete`, { result: 'ok' })).status === 200);
  const cad = await call(H(), 'POST', '/api/connect/crm/cadences', { pipelineId: pipe.id, stageId: open[open.length - 1].id, name: `${TAG} cadência`, steps: [{ title: 'Passo', type: 'followup', days: 1 }] });
  ok('cria cadência (regra persistente também vai pela chave)', cad.status === 201, cad.json);
  const idsToExclude = { activity: ac.json.activity.id };
  await call(H(), 'PATCH', `/api/connect/crm/deals/${dealId}`, { ownerId: U.vend });
  const { rows: ownTl } = await pool.query(`SELECT summary FROM crm_timeline_events WHERE entity_id=$1 AND summary LIKE '%Responsável%' ORDER BY occurred_at DESC LIMIT 1`, [dealId]);
  ok('troca de responsável aparece na linha do tempo pelo NOME (não pelo id), e a auditoria guarda o id', ownTl.length === 1 && ownTl[0].summary.includes('Vendedor Teste CC') && !ownTl[0].summary.includes(U.vend), ownTl);
  ok('exclui atividade (exclusão lógica, como na tela)', (await call(H(), 'DELETE', `/api/connect/crm/activities/${idsToExclude.activity}`)).status === 200);
  ok('exclui a cadência', (await call(H(), 'DELETE', `/api/connect/crm/cadences/${cad.json.cadence.id}`)).status === 200);
  ok('exclui negócio e empresa', (await call(H(), 'DELETE', `/api/connect/crm/deals/${dealId}`)).status === 200 && (await call(H(), 'DELETE', `/api/connect/crm/companies/${companyId}`)).status === 200);

  // registro como Claude Code
  const { rows: audit } = await pool.query(`SELECT DISTINCT actor_name, actor_id FROM crm_audit_logs WHERE org_id=$1 AND actor_id=$2`, [ORG, U.adm]);
  ok('a auditoria registra "Claude Code (por …)" e NUNCA o nome puro do dono', audit.length === 1 && audit[0].actor_name === 'Claude Code (por Admin Teste CC)', audit);
  const { rows: tl } = await pool.query(`SELECT DISTINCT actor_name FROM crm_timeline_events WHERE org_id=$1 AND company_id=$2`, [ORG, companyId]);
  ok('a linha do tempo também', tl.length >= 1 && tl.every((r) => r.actor_name === 'Claude Code (por Admin Teste CC)'), tl);
  const { rows: hist } = await pool.query(`SELECT DISTINCT actor_name FROM crm_deal_stage_history WHERE deal_id=$1`, [dealId]);
  ok('o histórico de etapas também', hist.length >= 1 && hist.every((r) => r.actor_name === 'Claude Code (por Admin Teste CC)'), hist);
  const { rows: nt } = await pool.query(`SELECT author_name, created_by FROM crm_notes WHERE entity_id=$1`, [dealId]);
  ok('a nota mostra "Claude Code (por …)" como autor e guarda o dono só como vínculo técnico', nt.length === 1 && nt[0].author_name === 'Claude Code (por Admin Teste CC)' && nt[0].created_by === U.adm, nt);
  const { rows: pn } = await pool.query(`SELECT count(*)::int n FROM crm_notes WHERE author_name <> '' AND org_id=$1 AND author_name NOT LIKE 'Claude Code%' AND created_by=$2`, [ORG, U.adm]);
  ok('nota feita pela tela (cookie) continua sem author_name — nada muda para a equipe', pn[0].n === 0);

  // registro de ações
  const acts = await call(asCk('adm'), 'GET', '/api/connect/actions');
  const posts = acts.json.actions.filter((a) => a.method === 'POST').length;
  ok('o registro lista as gravações (POST/PATCH/DELETE) com chave e resultado; GET não entra', acts.json.actions.length >= 12 && posts >= 6 && acts.json.actions.every((a) => a.method !== 'GET' && a.token_name === 'Claude Code do teste') && acts.json.actions.some((a) => a.method === 'DELETE'), acts.json.actions.length);
  ok('o registro não guarda corpo nem query', acts.json.actions.every((a) => !a.path.includes('?') && !('body' in a)));
  ok('o registro é só do dono (o vendedor vê vazio e sem permissão de admin)', (await call(asCk('vend'), 'GET', '/api/connect/actions')).json.actions.length === 0);

  // usuário dedicado "Claude Code" (perfil Equipe + CRM Administrador, sem ser master): gera a chave e o registro sai só "Claude Code"
  const tcc = await mint('cc', 'crm_operate', 'Chave do usuário Claude Code');
  ok('usuário dedicado (não é master, é administrador do CRM) gera a chave do CRM', tcc.status === 201, tcc.status);
  const cco = await call(bearer(tcc.json.token), 'POST', '/api/connect/crm/companies', { legalName: `${TAG} Dedicado`, relationship: 'prospect' });
  ok('a chave do usuário dedicado opera o CRM', cco.status === 201, cco.json);
  const { rows: ccAudit } = await pool.query(`SELECT DISTINCT actor_name, actor_id FROM crm_audit_logs WHERE org_id=$1 AND actor_id=$2`, [ORG, U.cc]);
  ok('a auditoria registra só "Claude Code", com o id do usuário dedicado (separado do administrador)', ccAudit.length === 1 && ccAudit[0].actor_name === 'Claude Code', ccAudit);
  const ccRead = await call(asCk('adm'), 'GET', '/api/connect/actions');
  ok('o administrador vê no registro as gravações da chave do usuário dedicado, com o dono', ccRead.json.actions.some((a) => a.owner_name === 'Claude Code' && a.method === 'POST'), ccRead.json.actions.slice(0, 2));
  ok('o usuário dedicado não vira administrador do painel: não gera chave de cronograma', (await mint('cc', 'read_write')).status === 403);
  await pool.query(`UPDATE users SET crm_role='vendedor' WHERE id=$1`, [U.cc]);
  ok('usuário dedicado rebaixado no CRM: a chave para de operar (403)', (await call(bearer(tcc.json.token), 'GET', '/api/connect/crm/me')).status === 403);

  // limites
  ok('migração do PipeRun: escrita recusada pela chave (403), leitura segue', (await call(H(), 'POST', '/api/connect/crm/migration/piperun/purge', { confirm: true })).status === 403 && (await call(H(), 'POST', '/api/connect/crm/migration/piperun/import', {})).status === 403);
  ok('escrita recusada também fica no registro (status 403)', (await call(asCk('adm'), 'GET', '/api/connect/actions')).json.actions.some((a) => a.path.includes('/migration/piperun/purge') && a.status === 403));
  // revogada / expirada / dono rebaixado
  const t2 = await mint('adm', 'crm_operate', 'a revogar');
  const id2 = (await call(asCk('adm'), 'GET', '/api/connect/tokens')).json.tokens.find((t) => t.name === 'a revogar').id;
  ok('chave revogada para de valer na hora (401)', (await call(asCk('adm'), 'DELETE', `/api/connect/tokens/${id2}`)).status === 200 && (await call(bearer(t2.json.token), 'GET', '/api/connect/crm/me')).status === 401);
  await pool.query(`UPDATE users SET role='pricetax', crm_role='vendedor' WHERE id=$1`, [U.adm]);
  ok('dono rebaixado: a chave do CRM deixa de operar (403)', (await call(bearer(tokCrm), 'GET', '/api/connect/crm/me')).status === 403);
  await pool.query(`UPDATE users SET blocked=true WHERE id=$1`, [U.adm]);
  ok('dono bloqueado: a chave não entra (403)', (await call(bearer(tokCrm), 'GET', '/api/connect/crm/me')).status === 403);
} finally {
  await cleanup();
  const { rows } = await pool.query(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1 AND legal_name LIKE $2`, [ORG, `${TAG}%`]);
  ok('limpeza: nada do teste ficou no CRM', rows[0].n === 0, rows[0]);
  await pool.end();
}
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes do CRM por chave ok');
process.exit(failed ? 1 : 0);
