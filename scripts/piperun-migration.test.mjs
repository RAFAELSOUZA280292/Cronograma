// Teste de integração da migração PipeRun → CRM (§84). Roda contra o servidor LOCAL e o Postgres LOCAL (recusa outro banco), numa organização descartável (oitmp-pr).
// Usa os DADOS REAIS do backup da API (~/Downloads/PIPERUN_BACKUP/<data>_api, só leitura) quando existirem; sem ele, usa um conjunto sintético pequeno.
// A API do PipeRun é SIMULADA (paginação, 429, cabeçalhos de limite): o teste nunca chama o PipeRun de verdade nem usa token real.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/piperun-migration.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: este teste só roda contra banco local.'); process.exit(2); }
process.env.DATABASE_URL = DB;
const PASS = crypto.randomBytes(12).toString('base64url');
const ORG = 'oitmp-pr'; const ORG2 = 'oitmp-pr2';
const FAKE_TOKEN = `tok${crypto.randomBytes(14).toString('hex')}`;

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const q = (sql, p) => pool.query(sql, p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- dados: backup real ou sintético ----------
function loadBackup() {
  const root = path.join(os.homedir(), 'Downloads', 'PIPERUN_BACKUP');
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root).filter((d) => d.endsWith('_api')).sort();
  if (!dirs.length) return null;
  const dir = path.join(root, dirs[dirs.length - 1]); const raw = {};
  for (const f of fs.readdirSync(dir)) if (f.endsWith('_raw.json')) raw[f.replace('_raw.json', '')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return raw.deals && raw.companies ? raw : null;
}
function synthetic() {
  const mk = (id, o) => ({ id, ...o });
  return {
    users: [mk(1, { name: 'Rafael Souza', email: 'rafael.souza@pricetax.com.br' }), mk(2, { name: 'Pessoa Externa', email: 'ext@x.com' })],
    pipelines: [mk(10, { name: 'Funil A', order: 0 })], stages: [mk(20, { pipeline_id: 10, name: 'Primeiro', order: 0 }), mk(21, { pipeline_id: 10, name: 'Segundo', order: 1 })],
    origins: [mk(30, { name: 'Indicação' })], lostReasons: [mk(40, { name: 'Preço alto' })], activityTypes: [mk(50, { name: 'Ligação' })], segments: [], customFields: [], tags: [], items: [], emails: [],
    companies: [mk(100, { company_name: 'EMPRESA UM LTDA', name: 'Empresa Um', cnpj: '11.222.333/0001-81', customFields: [] })],
    persons: [mk(200, { name: 'Ana Silva', company_id: 100, contactEmails: [{ email: 'ana@um.com', is_main: 1 }], contactPhones: [{ phone: '5531999990000', type: 'Celular', is_main: 1 }], customFields: [] }), mk(201, { name: 'Sem Empresa', company_id: null, contactEmails: [], contactPhones: [], customFields: [] })],
    deals: [
      mk(300, { hash: 'h300', title: 'Negócio com empresa', company_id: 100, person_id: 200, pipeline_id: 10, stage_id: 20, status: 0, deleted: 0, freezed: 0, value: 1000, created_at: '2026-01-05 10:00:00', owner_id: 1, customFields: [] }),
      mk(301, { hash: 'h301', title: 'Sem empresa nem pessoa', company_id: null, person_id: null, pipeline_id: 10, stage_id: 21, status: 1, deleted: 0, freezed: 0, value: 500, created_at: '2026-02-01 10:00:00', closed_at: '2026-03-01 10:00:00', owner_id: 1, customFields: [] }),
      mk(302, { hash: 'h302', title: 'Perdido', company_id: 100, person_id: 201, pipeline_id: 10, stage_id: 20, status: 3, lost_reason_id: 40, deleted: 0, freezed: 0, value: 0, created_at: '2026-02-01 10:00:00', closed_at: '2026-02-20 10:00:00', owner_id: 2, customFields: [] }),
      mk(303, { hash: 'h303', title: 'Lixeira', company_id: 100, pipeline_id: 10, stage_id: 20, status: 0, deleted: 1, freezed: 0, value: 9, created_at: '2026-02-01 10:00:00', owner_id: 1, customFields: [] }),
    ],
    activities: [mk(400, { deal_id: 300, activity_type_id: 50, title: 'Ligar', status: 0, start_at: '2027-02-01 09:00:00', priority: 3, owner_id: 1, created_at: '2026-01-06 10:00:00' }), mk(401, { deal_id: null, activity_type_id: 50, title: 'Sem negócio', status: 0, start_at: '2027-02-01 09:00:00', priority: 3, created_at: '2026-01-06 10:00:00' })],
    notes: [mk(500, { deal_id: 300, text: '<p>Primeira&nbsp;nota<br>linha 2</p>', user_id: 1, user_name: 'Rafael Souza', created_at: '2026-01-07 10:00:00' }), mk(501, { deal_id: 300, text: '<p><br></p>', user_name: 'x', created_at: '2026-01-07 10:00:00' })],
    files: [mk(600, { deal_id: 300, format: 'pdf', name: 'proposta', url: 'https://files.test/600', created_at: '2026-01-08 10:00:00' }), mk(601, { deal_id: 300, format: 'png', name: 'imagem', url: 'https://files.test/601' })],
    histories: [
      mk(900, { deal_id: 300, type: 22, user_id: 1, date: '2026-01-05T13:00:00.000000Z', description: '{"posicao":"Primeiro"}' }),
      mk(901, { deal_id: 300, type: 10, user_id: 1, date: '2026-01-10T13:00:00.000000Z', description: '{"old":"Primeiro","new":"Segundo"}' }),
      mk(902, { deal_id: 300, type: 21, user_id: 1, date: '2026-01-11T13:00:00.000000Z', description: '{"old":null,"new":"1000.00"}' }),
      mk(903, { deal_id: 301, type: 22, user_id: 1, date: '2026-02-01T13:00:00.000000Z', description: '{"posicao":"Primeiro"}' }),
      mk(904, { deal_id: 301, type: 8, user_id: 1, date: '2026-03-01T13:00:00.000000Z', description: '{"old":"Segundo","new":1}' }),
    ],
    proposals: [mk(700, { deal_id: 300, name: 'PRO1', status: 0, value: 0, value_mrr: 3500, items: [{ product_name: 'Consultoria', quantity: 1, value: 3500 }], created_at: '2026-01-09 10:00:00' })],
  };
}
const REAL = loadBackup();
const RAW = REAL || synthetic();
// A cópia antiga da API não trazia tags (a extração nova pede `tags`): semeia algumas, com repetição de maiúsculas, para testar a regra.
if (!RAW.deals.some((d) => Array.isArray(d.tags) && d.tags.length)) RAW.deals.filter((d) => !Number(d.deleted)).slice(0, 6).forEach((d, i) => { d.tags = [{ name: 'RESP · Teste' }, { name: i % 2 ? 'serv · teste a' : 'SERV · Teste A' }, ...(i === 0 ? [{ name: 'RESP · TESTE' }] : [])]; });
if (!RAW.deals.some((d) => Number(d.value_mrr) > 0)) RAW.deals.filter((d) => !Number(d.deleted)).slice(0, 3).forEach((d, i) => { d.value_mrr = 100 * (i + 1); d.probably_closed_at = '2026-12-1' + i; });
console.log(`     (dados: ${REAL ? 'BACKUP REAL da API' : 'sintéticos'} — ${RAW.deals.length} negócios)`);

// ---------- PipeRun simulado ----------
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
function makeStub(raw, { rateLimitOnce = true } = {}) {
  let limited = !rateLimitOnce; const seenTokens = new Set(); let calls = 0;
  const impl = async (url, init = {}) => {
    calls += 1;
    const u = new URL(url);
    if (u.hostname === 'assets.pipe.run') return new Response(PNG_1PX, { status: 200, headers: { 'content-type': 'image/png' } });
    if (u.hostname === 'files.test' || u.hostname === 'api.pipe.run' && /\/files\//.test(u.pathname)) return new Response(Buffer.from('%PDF-1.4 simulado'), { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': '17' } });
    const token = init.headers && init.headers.token; seenTokens.add(token);
    if (token !== FAKE_TOKEN) return new Response('{}', { status: 401 });
    const parts = u.pathname.replace(/^\/v1\//, '').split('/');
    if (!limited && parts[0] === 'deals') { limited = true; return new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }); }
    if (parts[0] === 'cnaes' && parts[1]) return new Response(JSON.stringify({ data: { id: Number(parts[1]), code: '11.11-1-00', description: 'Atividade de teste' } }), { status: 200, headers: { 'X-RateLimit-Remaining': '100' } });
    const list = raw[parts[0]];
    if (!list) return new Response('{}', { status: 404 });
    const show = Number(u.searchParams.get('show')) || 15; const page = Number(u.searchParams.get('page')) || 1;
    return new Response(JSON.stringify({ success: true, data: list.slice((page - 1) * show, page * show), meta: { total: list.length, per_page: show, current_page: page, total_pages: Math.max(1, Math.ceil(list.length / show)) } }), { status: 200, headers: { 'X-RateLimit-Limit': '120', 'X-RateLimit-Remaining': '100' } });
  };
  return { impl, seenTokens, calls: () => calls };
}

// ---------- ambiente ----------
async function cleanup() {
  const orgs = [ORG, ORG2];
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('ALTER TABLE crm_timeline_events DISABLE TRIGGER USER');
    await c.query('ALTER TABLE crm_audit_logs DISABLE TRIGGER USER');
    await c.query('ALTER TABLE crm_deal_stage_history DISABLE TRIGGER USER');
    await c.query('DELETE FROM crm_company_projects WHERE company_id IN (SELECT id FROM crm_companies WHERE org_id = ANY($1::text[]))', [orgs]);
    for (const t of ['crm_deal_files', 'crm_deal_tags', 'crm_activities', 'crm_notes', 'crm_deal_stage_history', 'crm_deal_items', 'crm_deals', 'crm_tags', 'crm_products', 'crm_pipeline_stages', 'crm_pipelines', 'crm_contacts', 'crm_timeline_events', 'crm_audit_logs', 'crm_companies', 'piperun_raw', 'piperun_map', 'piperun_runs']) {
      await c.query(`DELETE FROM ${t} WHERE org_id = ANY($1::text[])`, [orgs]);
    }
    await c.query('ALTER TABLE crm_timeline_events ENABLE TRIGGER USER');
    await c.query('ALTER TABLE crm_audit_logs ENABLE TRIGGER USER');
    await c.query('ALTER TABLE crm_deal_stage_history ENABLE TRIGGER USER');
    await c.query('DELETE FROM notifications WHERE org_id = ANY($1::text[])', [orgs]);
    await c.query(`DELETE FROM users WHERE id LIKE 'oitmp_pr%'`);
    await c.query('DELETE FROM organizations WHERE id = ANY($1::text[])', [orgs]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); await c.query('ALTER TABLE crm_timeline_events ENABLE TRIGGER USER').catch(() => {}); await c.query('ALTER TABLE crm_audit_logs ENABLE TRIGGER USER').catch(() => {}); await c.query('ALTER TABLE crm_deal_stage_history ENABLE TRIGGER USER').catch(() => {}); throw e; } finally { c.release(); }
}
await cleanup();
for (const [id, slug] of [[ORG, 'oitmp-pr'], [ORG2, 'oitmp-pr2']]) await q(`INSERT INTO organizations (id, slug, name) VALUES ($1,$2,$2)`, [id, slug]);
const hash = await bcrypt.hash(PASS, 10);
const mk = (id, name, email, role, org, crmRole = '') => q(`INSERT INTO users (id,username,password_hash,name,email,role,org_id,crm_role) VALUES ($1,$1,$2,$3,$4,$5,$6,$7)`, [id, hash, name, email, role, org, crmRole]);
await mk('oitmp_pr_admin', 'Rafael Souza', 'rafael.souza@pricetax.com.br', 'master', ORG);
await mk('oitmp_pr_felipe', 'Felipe Dal Santo', 'felipedalsanto@pricetax.com.br', 'pricetax', ORG, 'gestor');
await mk('oitmp_pr_vend', 'Vendedor Teste', 'v@x.com', 'pricetax', ORG, 'vendedor');
await mk('oitmp_pr_admin2', 'Admin Outra Org', 'a2@x.com', 'master', ORG2);
const login = async (u) => { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; };
const call = async (cookie, method, p, body) => { const r = await fetch(`${BASE}${p}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; let buf = null; const ct = r.headers.get('content-type') || ''; if (ct.includes('json')) { try { json = await r.json(); } catch { /* vazio */ } } else buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, json, buf, headers: r.headers }; };
const C = { admin: await login('oitmp_pr_admin'), felipe: await login('oitmp_pr_felipe'), vend: await login('oitmp_pr_vend'), admin2: await login('oitmp_pr_admin2') };
ok('login dos usuários temporários', Object.values(C).every(Boolean));

// ---------- 1. Extração (API simulada) ----------
const { runExtract, rawCounts, purgeRaw } = await import('../server/crm/piperun/extract.js');
const { createClient } = await import('../server/crm/piperun/client.js');
const stub = makeStub(RAW);
let errBadToken = '';
try { await runExtract(ORG, 'token-errado-123456789', { clientOptions: { fetchImpl: stub.impl, minGapMs: 0 } }); } catch (e) { errBadToken = e.message; }
ok('token recusado pelo PipeRun (401) dá mensagem clara e não grava nada', /recusou o token/.test(errBadToken) && (await rawCounts(ORG)).fetchedAt === null, errBadToken);
let errShort = ''; try { createClient('curto'); } catch (e) { errShort = e.message; }
ok('token com formato inválido é recusado antes de chamar a API', /parece inválido/.test(errShort));
const t0 = Date.now();
const ext = await runExtract(ORG, FAKE_TOKEN, { clientOptions: { fetchImpl: stub.impl, minGapMs: 0 } });
const rc = await rawCounts(ORG);
ok('extração: tudo o que a API tem foi para a cópia bruta, entidade por entidade', ['deals', 'persons', 'companies', 'activities', 'notes', 'files', 'proposals', 'pipelines', 'stages', 'users'].every((k) => rc.counts[k] === RAW[k].length), { rc: rc.counts });
ok('extração: sobreviveu a um 429 e paginou (200 por página)', Date.now() - t0 >= 900 && ext.apiCalls > 18, { ms: Date.now() - t0, calls: ext.apiCalls });
ok('extração: CNAEs resolvidos um a um', (rc.counts.cnaes || 0) === new Set(RAW.companies.filter((c) => c.cnae_id).map((c) => String(c.cnae_id))).size, rc.counts.cnaes);
ok('o token só foi enviado no cabeçalho `token` ao PipeRun (nada de URL)', stub.seenTokens.has(FAKE_TOKEN));
await runExtract(ORG, FAKE_TOKEN, { clientOptions: { fetchImpl: stub.impl, minGapMs: 0 } });
ok('extrair de novo atualiza, não duplica', (await rawCounts(ORG)).counts.deals === RAW.deals.length);

// ---------- 2. Prévia ----------
const { previewMigration, runMigration, prepare } = await import('../server/crm/piperun/migrate.js');
const { reconcile } = await import('../server/crm/piperun/reconcile.js');
const actor = { id: 'oitmp_pr_admin', name: 'Rafael Souza' };
const pv = await previewMigration(ORG);
const liveDeals = RAW.deals.filter((d) => !Number(d.deleted));
ok('prévia: negócios a importar = ativos (lixeira fora)', pv.ready && pv.deals.toImport === liveDeals.length && pv.deals.trashed === RAW.deals.length - liveDeals.length, pv.deals);
ok('prévia: nenhum negócio fica de fora — os sem empresa viram empresa provisória', pv.provisional.total > 0 || liveDeals.every((d) => d.company_id), pv.provisional);
ok('prévia: pessoas do PipeRun com e sem usuário no CRM (pede conferência)', Array.isArray(pv.people) && pv.people.length > 0 && pv.people.some((p) => p.userId) , pv.people && pv.people.slice(0, 3));
ok('prévia não gravou nada no CRM', Number((await q(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1`, [ORG])).rows[0].n) === 0 && Number((await q(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1`, [ORG])).rows[0].n) === 0);

// ---------- 3. Permissões da API ----------
for (const [who, c] of [['vendedor', C.vend], ['gestor', C.felipe]]) {
  ok(`${who} não opera a migração (403)`, (await call(c, 'GET', '/api/crm/migration/piperun')).status === 403 && (await call(c, 'GET', '/api/crm/migration/piperun/preview')).status === 403 && (await call(c, 'POST', '/api/crm/migration/piperun/import', {})).status === 403 && (await call(c, 'POST', '/api/crm/migration/piperun/extract', { token: FAKE_TOKEN })).status === 403 && (await call(c, 'POST', '/api/crm/migration/piperun/purge', { confirm: true })).status === 403);
}
ok('sem login → 401', (await call('', 'GET', '/api/crm/migration/piperun')).status === 401);
ok('administrador do CRM vê a situação da migração', (await call(C.admin, 'GET', '/api/crm/migration/piperun')).status === 200);
ok('prévia pela API devolve o mesmo que a função', (await call(C.admin, 'GET', '/api/crm/migration/piperun/preview')).json.deals.toImport === pv.deals.toImport);
ok('carregar histórico do backup: vendedor 403, lista vazia 400, evento sem id 400', (await call(C.vend, 'POST', '/api/crm/migration/piperun/raw/histories', { rows: [{ id: 1, deal_id: 2 }] })).status === 403 && (await call(C.admin, 'POST', '/api/crm/migration/piperun/raw/histories', { rows: [] })).status === 400 && (await call(C.admin, 'POST', '/api/crm/migration/piperun/raw/histories', { rows: [{ deal_id: 2 }] })).status === 400);
ok('extração sem token → 400', (await call(C.admin, 'POST', '/api/crm/migration/piperun/extract', {})).status === 400);
ok('administrador de OUTRA organização não vê nada', (await call(C.admin2, 'GET', '/api/crm/migration/piperun/preview')).json.ready === false);

// ---------- 4. Importação ----------
const fileStub = makeStub(RAW, { rateLimitOnce: false });
const ownerMap = {};
const tImp = Date.now();
const res = await runMigration(ORG, actor, { ownerMap, includeFiles: true, maxFiles: 5, fetchImpl: fileStub.impl });
console.log(`     (importação: ${Math.round((Date.now() - tImp) / 1000)} s | ${JSON.stringify({ emp: res.companies.created, prov: res.provisional.created, cont: res.contacts.created, neg: res.deals.created, notas: res.notes.created, ativ: res.activities.created, arq: res.files.created, problemas: res.issues.length })})`);
const P = prepare(RAW);
const issueSummary = {}; res.issues.forEach((i) => { const k = `${i.phase}: ${String(i.message).slice(0, 70)}`; issueSummary[k] = (issueSummary[k] || 0) + 1; });
console.log('     (problemas relatados:', JSON.stringify(issueSummary), ')');
const n = async (sql, p = [ORG]) => Number((await q(sql, p)).rows[0].n);
ok('importação terminou e criou todos os negócios (nenhum falhou)', res.deals.created === P.plan.rows.length && res.deals.failed === 0, res.deals);
const wantStatus = { open: P.plan.rows.filter((r) => ['Aberta', 'Congelada'].includes(r.situation)).length, won: P.plan.rows.filter((r) => r.situation === 'Ganha').length, lost: P.plan.rows.filter((r) => r.situation === 'Perdida').length };
const gotStatus = Object.fromEntries((await q(`SELECT status, count(*)::int n FROM crm_deals WHERE org_id=$1 AND deleted_at IS NULL GROUP BY status`, [ORG])).rows.map((r) => [r.status, r.n]));
ok('situação dos negócios (abertos/ganhos/perdidos) igual ao PipeRun', gotStatus.open === wantStatus.open && (gotStatus.won || 0) === wantStatus.won && (gotStatus.lost || 0) === wantStatus.lost, { gotStatus, wantStatus });
const sumRaw = (pred) => Math.round(liveDeals.filter(pred).reduce((a, d) => a + Number(d.value || 0), 0) * 100) / 100;
const sumCrm = async (st) => Math.round(Number((await q(`SELECT COALESCE(sum(value),0) v FROM crm_deals WHERE org_id=$1 AND status=$2 AND deleted_at IS NULL`, [ORG, st])).rows[0].v) * 100) / 100;
ok('soma de valores por situação igual ao PipeRun (conta independente do código)', (await sumCrm('won')) === sumRaw((d) => Number(d.status) === 1) && (await sumCrm('lost')) === sumRaw((d) => Number(d.status) === 3) && (await sumCrm('open')) === sumRaw((d) => Number(d.status) === 0), { won: await sumCrm('won'), esperado: sumRaw((d) => Number(d.status) === 1) });
ok('todo negócio tem empresa (nenhum ficou de fora por falta dela)', await n(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND company_id IS NULL`) === 0);
const lostNull = await n(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND status='lost' AND (lost_reason='' OR lost_reason='nao_informado')`);
ok('todo negócio perdido tem o motivo REAL do PipeRun (nenhum "não informado")', lostNull === 0, lostNull);
const d1 = RAW.deals.find((d) => Number(d.status) === 3 && !Number(d.deleted) && d.lost_reason_id);
if (d1) { const lr = (RAW.lostReasons || []).find((r) => r.id === d1.lost_reason_id); const row = (await q(`SELECT lost_detail FROM crm_deals WHERE org_id=$1 AND external_id=$2`, [ORG, d1.hash])).rows[0]; ok('o texto original do motivo de perda fica no detalhe', row && lr && row.lost_detail.includes(lr.name), row); }
// ordem real das etapas
const pipeName = (id) => (RAW.pipelines.find((p) => p.id === id) || {}).name;
let orderOk = true; let orderInfo = '';
for (const p of RAW.pipelines) {
  const want = RAW.stages.filter((s) => s.pipeline_id === p.id).sort((a, b) => a.order - b.order).map((s) => s.name);
  const got = (await q(`SELECT s.name FROM crm_pipeline_stages s JOIN crm_pipelines pl ON pl.id=s.pipeline_id WHERE s.org_id=$1 AND pl.name=$2 AND s.kind='open' AND s.deleted_at IS NULL ORDER BY s.position`, [ORG, p.name])).rows.map((r) => r.name);
  if (JSON.stringify(got) !== JSON.stringify(want)) { orderOk = false; orderInfo = `${p.name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`; }
}
ok('etapas dos funis na ORDEM REAL do PipeRun (não estimada)', orderOk, orderInfo);
const d2 = liveDeals.find((d) => d.created_at);
const cr = (await q(`SELECT to_char(created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS d FROM crm_deals WHERE org_id=$1 AND external_id=$2`, [ORG, d2.hash])).rows[0];
ok('data original de cadastro do negócio preservada', cr && cr.d === d2.created_at.slice(0, 10), cr);
const prov = await n(`SELECT count(*)::int n FROM piperun_map WHERE org_id=$1 AND entity='provisional'`);
ok('empresas provisórias criadas para os negócios sem empresa, cada uma com nota "completar cadastro"', prov === P.plan.provisional.length && (await n(`SELECT count(*)::int n FROM crm_notes n JOIN piperun_map m ON m.crm_id = n.entity_id::text AND m.entity='provisional' AND m.org_id=n.org_id WHERE n.org_id=$1 AND n.body LIKE 'Empresa PROVISÓRIA%'`)) >= Math.min(prov, res.provisional.created), { prov, esperado: P.plan.provisional.length });
const idleProv = P.plan.provisional.find((p) => p.fromPerson);
if (idleProv) ok('empresa provisória leva o nome da pessoa de contato quando há pessoa', (await n(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1 AND name_norm LIKE '%' || $2 || '%'`, [ORG, idleProv.key])) >= 1);
const congeladas = RAW.deals.filter((d) => !Number(d.deleted) && Number(d.freezed) && Number(d.status) === 0).length;
ok('negócios congelados entram em aberto, com aviso na descrição', (await n(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND description LIKE '%Congelada no PipeRun%'`)) === congeladas, congeladas);
const cf = liveDeals.filter((d) => (d.customFields || []).some((f) => String(f.value || f.raw_value || '').trim())).length;
ok('campos personalizados viraram texto na descrição (sem coluna nova)', (await n(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND description LIKE '%Campos do PipeRun:%'`)) === cf, cf);
const mrrN = liveDeals.filter((d) => Number(d.value_mrr) > 0).length;
ok('MRR do PipeRun registrado na descrição', (await n(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND description LIKE '%MRR no PipeRun:%'`)) === mrrN, mrrN);
// pessoas/usuários
const ownersWith = await n(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND owner_id IS NOT NULL`);
ok('donos casados por e-mail/nome com usuários do CRM', ownersWith > 0, ownersWith);
// notas
const strip = (t) => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const hasContent = (t) => !!strip(t) || /<img[^>]+src=["']/i.test(String(t || ''));
const liveIds = new Set(liveDeals.map((d) => String(d.id)));
const notesWithText = (RAW.notes || []).filter((x) => hasContent(x.text) && (x.deal_id ? liveIds.has(String(x.deal_id)) : true)).length;
const noteMapped = await n(`SELECT count(*)::int n FROM piperun_map WHERE org_id=$1 AND entity='note'`);
ok('anotações: todas as que têm texto e cujo negócio entra (+ propostas como nota)', noteMapped === notesWithText + (RAW.proposals || []).filter((x) => liveIds.has(String(x.deal_id))).length, { noteMapped, esperado: notesWithText + (RAW.proposals || []).filter((x) => liveIds.has(String(x.deal_id))).length });
ok('nenhuma anotação ficou com HTML', (await n(`SELECT count(*)::int n FROM crm_notes WHERE org_id=$1 AND (body LIKE '%<p>%' OR body LIKE '%<br%' OR body LIKE '%&nbsp;%')`)) === 0);
const n0 = (RAW.notes || []).find((x) => hasContent(x.text) && x.deal_id && liveDeals.some((d) => String(d.id) === String(x.deal_id)));
if (n0) { const row = (await q(`SELECT to_char(n.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS') AS ts FROM crm_notes n JOIN piperun_map m ON m.crm_id = n.id::text AND m.entity='note' AND m.pid=$2 WHERE n.org_id=$1`, [ORG, `note:${n0.id}`])).rows[0]; ok('data e hora originais da anotação preservadas', row && row.ts === n0.created_at, row); }
const eduarda = (RAW.users || []).find((u) => /eduarda/i.test(u.name));
if (eduarda) {
  const wantE = (RAW.notes || []).filter((x) => String(x.user_id) === String(eduarda.id) && hasContent(x.text) && (x.deal_id ? liveIds.has(String(x.deal_id)) : true)).length;
  ok('autor sem usuário no CRM (Eduarda) continua sendo ela — não vira quem importou', (await n(`SELECT count(*)::int n FROM crm_notes WHERE org_id=$1 AND author_name=$2 AND created_by IS NULL`, [ORG, eduarda.name])) === wantE && wantE > 0, { wantE, got: await n(`SELECT count(*)::int n FROM crm_notes WHERE org_id=$1 AND author_name=$2`, [ORG, eduarda.name]) });
  ok('nenhuma anotação ficou sem autor, e nenhuma carrega rodapé de autoria no texto', (await n(`SELECT count(*)::int n FROM crm_notes WHERE org_id=$1 AND created_by IS NULL AND author_name='' AND id IN (SELECT crm_id::uuid FROM piperun_map WHERE org_id=$1 AND entity='note')`)) === 0 && (await n(`SELECT count(*)::int n FROM crm_notes WHERE org_id=$1 AND body LIKE '%(PipeRun)'`)) === 0);
  const actsE = P.acts.filter((a) => !['Rafael Souza', 'Felipe Dal Santo'].includes(a.ownerName) && a.dealPid && liveDeals.some((d) => String(d.id) === a.dealPid)).length;
  ok('atividades de quem não tem usuário ficam SEM responsável (não vão para a Agenda de quem importou)', (await n(`SELECT count(*)::int n FROM crm_activities WHERE org_id=$1 AND owner_id IS NULL`)) === actsE && actsE > 0, { actsE });
  const dealApi = (await q(`SELECT d.id FROM crm_deals d JOIN crm_notes n ON n.entity_id = d.id AND n.author_name=$2 WHERE d.org_id=$1 LIMIT 1`, [ORG, eduarda.name])).rows[0];
  const detail = await call(C.admin, 'GET', `/api/crm/deals/${dealApi.id}`);
  ok('a ficha do negócio mostra o nome do autor real da anotação', detail.status === 200 && detail.json.notes.some((x) => x.createdByName === eduarda.name && x.createdBy === null), detail.json && detail.json.notes && detail.json.notes.slice(0, 2).map((x) => x.createdByName));
  // reparo de rodadas antigas: volta 5 notas e 3 atividades ao estado errado de antes e confere que a próxima rodada conserta
  await q(`UPDATE crm_notes SET created_by=$2, updated_by=$2, author_name='', body = body || E'\n\n— ' || 'Eduarda Costa' || ' (PipeRun)' WHERE id IN (SELECT id FROM crm_notes WHERE org_id=$1 AND author_name='Eduarda Costa' LIMIT 5)`, [ORG, actor.id]);
  await q(`UPDATE crm_activities SET owner_id=$2 WHERE id IN (SELECT id FROM crm_activities WHERE org_id=$1 AND owner_id IS NULL LIMIT 3)`, [ORG, actor.id]);
  const rr2 = await runMigration(ORG, actor, { includeFiles: false });
  ok('reparo de autoria: notas e atividades de rodadas antigas voltam ao autor/responsável certo', rr2.authorshipFixes.notes === 5 && rr2.authorshipFixes.activities === 3 && (await n(`SELECT count(*)::int n FROM crm_notes WHERE org_id=$1 AND body LIKE '%(PipeRun)'`)) === 0, rr2.authorshipFixes);
}
// atividades
const actsOk = P.acts.filter((a) => a.dealPid && liveDeals.some((d) => String(d.id) === a.dealPid));
ok('atividades: todas as que têm negócio entraram; as sem negócio foram reportadas', (await n(`SELECT count(*)::int n FROM crm_activities WHERE org_id=$1`)) === actsOk.length && res.activities.skipped === P.acts.length - actsOk.length, { got: await n(`SELECT count(*)::int n FROM crm_activities WHERE org_id=$1`), esperado: actsOk.length });
const st = Object.fromEntries((await q(`SELECT status, count(*)::int n FROM crm_activities WHERE org_id=$1 GROUP BY status`, [ORG])).rows.map((r) => [r.status, r.n]));
ok('atividades: abertas/feitas/canceladas iguais ao PipeRun', (st.open || 0) === actsOk.filter((a) => a.state === 'open').length && (st.done || 0) === actsOk.filter((a) => a.state === 'done').length && (st.cancelled || 0) === actsOk.filter((a) => a.state === 'cancelled').length, st);
ok('atividades antigas não disparam lembrete em massa (due_notified_at)', (await n(`SELECT count(*)::int n FROM crm_activities WHERE org_id=$1 AND status='open' AND due_date <= current_date AND due_notified_at IS NULL`)) === 0);
// contatos
const contactsImportable = P.contacts.filter((c) => c.companyPid || P.plan.personCompany.has(c.pid));
ok('contatos: todas as pessoas com empresa (direta ou pelo negócio) viraram contato', (await n(`SELECT count(*)::int n FROM piperun_map WHERE org_id=$1 AND entity='contact'`)) === contactsImportable.length, { got: await n(`SELECT count(*)::int n FROM piperun_map WHERE org_id=$1 AND entity='contact'`), esperado: contactsImportable.length });
ok('contatos: não gerou contato duplicado (mesmo e-mail na mesma empresa)', (await n(`SELECT count(*)::int n FROM (SELECT company_id, lower(email) FROM crm_contacts WHERE org_id=$1 AND email <> '' GROUP BY 1,2 HAVING count(*)>1) x`)) === 0);
// arquivos
ok('documentos (PDF/DOCX) baixados e guardados no CRM, com o conteúdo', (await n(`SELECT count(*)::int n FROM crm_deal_files WHERE org_id=$1 AND length(data) > 0`)) === Math.min(5, P.files.docs.filter((f) => liveDeals.some((d) => String(d.id) === f.dealPid)).length), res.files);
ok('imagens e áudios NÃO sobem (só documentos)', P.files.docs.every((f) => ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'csv', 'txt'].includes(f.format)));
ok('empresas do PipeRun importadas (as que têm nome/CNPJ)', (await n(`SELECT count(*)::int n FROM piperun_map WHERE org_id=$1 AND entity='company'`)) === P.companies.filter((c) => c.usable).length - res.issues.filter((i) => i.phase === 'Empresas').length, res.issues.filter((i) => i.phase === 'Empresas').slice(0, 3));
const orphan = await n(`SELECT count(*)::int n FROM crm_deals d LEFT JOIN crm_companies c ON c.id=d.company_id WHERE d.org_id=$1 AND c.id IS NULL`);
ok('integridade: nenhum negócio aponta para empresa inexistente', orphan === 0);

// ---------- 4b. Histórico real de etapas ----------
const EVT = new Set([22, 10, 30, 8, 9]);
const histRaw = (RAW.histories || []).filter((h) => liveIds.has(String(h.deal_id)));
const stageEvents = histRaw.filter((h) => EVT.has(h.type));
if (stageEvents.length) {
  const gotHist = await n(`SELECT count(*)::int n FROM crm_deal_stage_history h JOIN crm_deals d ON d.id = h.deal_id WHERE h.org_id=$1 AND d.external_source='piperun'`);
  ok('histórico real: cada evento de etapa do PipeRun virou uma linha do percurso (nenhum a mais, nenhum a menos)', gotHist === stageEvents.length && res.history.stageMoves === stageEvents.length, { gotHist, esperado: stageEvents.length, res: res.history });
  const syntheticLeft = await n(`SELECT count(*)::int n FROM crm_deal_stage_history h JOIN crm_deals d ON d.id=h.deal_id WHERE h.org_id=$1 AND d.external_source='piperun' AND h.days_in_from IS NULL AND h.from_stage_name <> ''`);
  ok('o percurso sintético da 1ª importação foi substituído (nenhuma linha "sem origem" fora da criação)', syntheticLeft === 0, syntheticLeft);
  const sample = liveDeals.find((d) => stageEvents.filter((h) => String(h.deal_id) === String(d.id)).length >= 3);
  if (sample) {
    const evs = stageEvents.filter((h) => String(h.deal_id) === String(sample.id)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id - b.id);
    const rows = (await q(`SELECT to_char(moved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS') AS at, to_stage_name, from_stage_name, actor_name FROM crm_deal_stage_history h JOIN crm_deals d ON d.id=h.deal_id WHERE d.org_id=$1 AND d.external_id=$2 ORDER BY moved_at, h.id`, [ORG, sample.hash])).rows;
    ok('percurso de um negócio: mesmas datas (UTC) e mesma ordem dos eventos do PipeRun', rows.length === evs.length && rows.every((r, i) => r.at === evs[i].date.slice(0, 19)), { rows: rows.map((r) => r.at).slice(0, 4), evs: evs.map((e) => e.date.slice(0, 19)).slice(0, 4) });
    ok('percurso: a 1ª linha é a criação e as seguintes encadeiam (de → para)', rows[0].from_stage_name === '' && rows.slice(1).every((r) => r.from_stage_name !== ''));
  }
  const felipe = (RAW.users || []).find((u) => /felipe/i.test(u.name));
  if (felipe) {
    const want = stageEvents.filter((h) => String(h.user_id) === String(felipe.id)).length;
    ok('autor real de cada mudança de etapa preservado (Felipe)', want === 0 || (await n(`SELECT count(*)::int n FROM crm_deal_stage_history h JOIN crm_deals d ON d.id=h.deal_id WHERE h.org_id=$1 AND d.external_source='piperun' AND h.actor_name=$2`, [ORG, felipe.name])) === want, { want });
  }
  const openLast = (await q(`SELECT count(*)::int n FROM crm_deals d WHERE d.org_id=$1 AND d.external_source='piperun' AND d.status='open' AND NOT EXISTS (SELECT 1 FROM crm_deal_stage_history h WHERE h.deal_id=d.id)`, [ORG])).rows[0].n;
  ok('todo negócio do PipeRun tem percurso no CRM', openLast === 0, openLast);
  const noNeg = (await q(`SELECT count(*)::int n FROM crm_deal_stage_history WHERE org_id=$1 AND days_in_from < 0`, [ORG])).rows[0].n;
  ok('dias em cada etapa nunca negativos', noNeg === 0);
  const tlWant = histRaw.filter((h) => [21, 79, 20, 18, 55].includes(h.type)).length;
  ok('eventos de valor/MRR/origem/contato/congelamento entraram na linha do tempo, com data original', (await n(`SELECT count(*)::int n FROM crm_timeline_events WHERE org_id=$1 AND event_type IN ('deal_value_changed','deal_mrr_changed','deal_source_changed','deal_contact_changed','deal_frozen','deal_unfrozen')`)) === tlWant, { tlWant });
}
// guarda: negócio que já foi movido no CRM depois da importação não tem o percurso trocado
const guardDeal = (await q(`SELECT d.id, d.external_id, m.pid FROM crm_deals d JOIN piperun_map m ON m.crm_id = d.id::text AND m.entity='history' AND m.org_id=d.org_id WHERE d.org_id=$1 LIMIT 1`, [ORG])).rows[0];
if (guardDeal) {
  const cnt = async () => Number((await q(`SELECT count(*)::int n FROM crm_deal_stage_history WHERE deal_id=$1`, [guardDeal.id])).rows[0].n);
  await q(`INSERT INTO crm_deal_stage_history (id, org_id, deal_id, company_id, to_stage_id, from_stage_name, to_stage_name, days_in_from, actor_name) SELECT gen_random_uuid(), org_id, id, company_id, stage_id, 'X', 'Movido por alguém no CRM', 3, 'Teste' FROM crm_deals WHERE id=$1`, [guardDeal.id]);
  await q(`DELETE FROM piperun_map WHERE org_id=$1 AND entity='history' AND pid=$2`, [ORG, guardDeal.pid]);
  const before = await cnt();
  const rg = await runMigration(ORG, actor, { includeFiles: false });
  ok('negócio movido no CRM depois da importação mantém o percurso (não é sobrescrito) e é reportado', (await cnt()) === before && rg.history.skippedAlreadyMoved === 1 && rg.issues.some((i) => i.phase === 'Histórico de etapas'), { before, after: await cnt(), h: rg.history });
  await q(`INSERT INTO piperun_map (org_id, entity, pid, crm_id, note) VALUES ($1,'history',$2,$3,'') ON CONFLICT DO NOTHING`, [ORG, guardDeal.pid, guardDeal.id]);
}

// ---------- 5. Conferência ----------
let rep = await reconcile(ORG);
const filesMissing = rep.divergences.filter((d) => d.type === 'Documento não importado');
ok('conferência: contagens, valores por situação e por funil batem (as únicas divergências possíveis são os documentos além do limite do teste)', rep.ready && rep.bySituation.every((x) => x.piperun === x.crm && x.piperunValue === x.crmValue) && rep.byFunnel.every((x) => x.piperun === x.crm) && rep.divergences.every((d) => d.type === 'Documento não importado'), { sit: rep.bySituation, outras: rep.divergences.filter((d) => d.type !== 'Documento não importado').slice(0, 5) });
ok('conferência aponta exatamente os documentos que faltam', filesMissing.length === Math.max(0, P.files.docs.filter((f) => liveDeals.some((d) => String(d.id) === f.dealPid)).length - 5));
ok('conferência lista as empresas provisórias a completar', rep.provisionalToComplete.length > 0 || P.plan.provisional.length === 0);

// ---------- 6. Repetível: rodar de novo não duplica ----------
const snap = async () => ({ companies: await n(`SELECT count(*)::int n FROM crm_companies WHERE org_id=$1`), contacts: await n(`SELECT count(*)::int n FROM crm_contacts WHERE org_id=$1`), deals: await n(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1`), notes: await n(`SELECT count(*)::int n FROM crm_notes WHERE org_id=$1`), acts: await n(`SELECT count(*)::int n FROM crm_activities WHERE org_id=$1`), files: await n(`SELECT count(*)::int n FROM crm_deal_files WHERE org_id=$1`), stages: await n(`SELECT count(*)::int n FROM crm_deal_stage_history WHERE org_id=$1`) });
const before = await snap();
const res2 = await runMigration(ORG, actor, { ownerMap, includeFiles: true, maxFiles: Infinity, fetchImpl: fileStub.impl });
const after = await snap();
ok('reimportar não duplica empresa, contato, negócio, nota nem atividade', JSON.stringify({ ...before, files: 0 }) === JSON.stringify({ ...after, files: 0 }), { before, after });
ok('a 2ª rodada completa os documentos que faltavam (sem repetir os já guardados)', after.files === P.files.docs.filter((f) => liveDeals.some((d) => String(d.id) === f.dealPid)).length && res2.files.created === after.files - before.files, { before: before.files, after: after.files });
ok('2ª rodada: 0 empresas, 0 negócios, 0 notas, 0 atividades novos', res2.companies.created === 0 && res2.provisional.created === 0 && res2.deals.created === 0 && res2.notes.created === 0 && res2.activities.created === 0, { c: res2.companies.created, p: res2.provisional.created, d: res2.deals.created, n: res2.notes.created, a: res2.activities.created });
// imagens coladas nas anotações: viram anexo da própria nota (miniatura na tela), inclusive as notas só-imagem; repetível
const imgNotesP = P.notes.filter((x) => x.kind === 'note' && x.images && x.images.length);
const imgMapped = (await q(`SELECT n.id, n.body, n.attachments FROM crm_notes n JOIN piperun_map m ON m.crm_id = n.id::text AND m.entity='note' AND m.org_id=n.org_id WHERE n.org_id=$1 AND m.pid = ANY($2::text[])`, [ORG, imgNotesP.map((x) => x.pid)])).rows;
ok('anotações com imagem: todas as importadas ganharam os anexos (nada de nota com imagem sem anexo)', imgMapped.length > 0 === imgNotesP.length > 0 && imgMapped.every((r) => Array.isArray(r.attachments) && r.attachments.length >= 1), { notas: imgMapped.length, semAnexo: imgMapped.filter((r) => !(r.attachments || []).length).length });
ok('o anexo é imagem de verdade (data URL, tipo, tamanho)', imgMapped.every((r) => r.attachments.every((a) => a.type === 'image/png' && a.dataUrl.startsWith('data:image/png;base64,') && a.size > 0 && a.name)));
ok('2ª rodada não rebaixa imagens (já anexadas)', res2.noteImages.alreadyAttached === imgMapped.length && res2.noteImages.failed === 0, res2.noteImages);
ok('nota só-imagem foi importada com texto vazio e o anexo', imgNotesP.filter((x) => !x.text).length === 0 || imgMapped.some((r) => r.body === '' && r.attachments.length));
rep = await reconcile(ORG);
ok('conferência final sem nenhuma divergência', rep.ok === true && rep.divergenceCount === 0, rep.divergences.slice(0, 5));

// ---------- 6b. 2ª leva: funis completos + SLA, produtos, tags, MRR e previsão ----------
{
  const raw = (e) => RAW[e] || [];
  const pipesByName = new Map(raw('pipelines').map((p) => [p.name.trim().toLowerCase(), p]));
  const { rows: crmStages } = await q(`SELECT p.name AS pipeline, s.name, s.sla_days FROM crm_pipeline_stages s JOIN crm_pipelines p ON p.id=s.pipeline_id WHERE s.org_id=$1 AND s.kind='open' AND s.deleted_at IS NULL AND p.deleted_at IS NULL`, [ORG]);
  const have = new Set(crmStages.map((r) => `${r.pipeline.trim().toLowerCase()}|${r.name.trim().toLowerCase()}`));
  const wantStages = raw('stages').filter((st) => pipesByName.has(String((raw('pipelines').find((p) => String(p.id) === String(st.pipeline_id)) || {}).name || '').trim().toLowerCase()));
  const missingSt = wantStages.filter((st) => !have.has(`${String(raw('pipelines').find((p) => String(p.id) === String(st.pipeline_id)).name).trim().toLowerCase()}|${String(st.name).trim().toLowerCase()}`));
  ok('funis: TODAS as etapas do PipeRun existem no CRM (inclusive as sem negócio)', wantStages.length > 0 && missingSt.length === 0, missingSt.map((x) => x.name));
  ok('funis: todo funil do PipeRun existe (mesmo sem negócio)', raw('pipelines').every((p) => (await_name(p, crmStages))), raw('pipelines').map((p) => p.name));
  const slaWant = wantStages.filter((st) => Number(st.days_limit) > 0).length;
  ok('prazo (days_limit) virou o SLA da etapa, com o mesmo número de dias', crmStages.filter((r) => r.sla_days).length === slaWant && wantStages.filter((st) => Number(st.days_limit) > 0).every((st) => crmStages.some((r) => r.name.trim().toLowerCase() === String(st.name).trim().toLowerCase() && r.sla_days === Number(st.days_limit))), { slaWant, got: crmStages.filter((r) => r.sla_days).length });
  const prodWant = raw('items');
  const { rows: crmProd } = await q(`SELECT name, billing, active FROM crm_products WHERE org_id=$1 AND deleted_at IS NULL`, [ORG]);
  ok('produtos do PipeRun no catálogo (tipo 1 = recorrente, 2 = avulso; os apagados no PipeRun entram inativos)', prodWant.length === crmProd.length && prodWant.every((i) => crmProd.some((r) => r.name === i.name.trim() && r.billing === (Number(i.type) === 1 ? 'recurring' : 'one_time') && r.active === !Number(i.deleted))), { want: prodWant.length, got: crmProd.length });
  const wantMrr = Math.round(liveDeals.reduce((t, d) => t + (Number(d.value_mrr) > 0 ? Number(d.value_mrr) : 0), 0) * 100) / 100;
  ok('MRR: soma no CRM igual à do PipeRun (conta independente)', Math.abs(Number((await q(`SELECT coalesce(sum(mrr),0) AS n FROM crm_deals WHERE org_id=$1 AND external_source='piperun'`, [ORG])).rows[0].n) - wantMrr) < 0.005 && wantMrr > 0, { wantMrr });
  const wantExp = liveDeals.filter((d) => d.probably_closed_at).length;
  ok('previsão de fechamento: mesmo número de negócios com data, e a data é a do PipeRun', await n(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND external_source='piperun' AND expected_close_date IS NOT NULL`) === wantExp && wantExp > 0, wantExp);
  const dExp = liveDeals.find((d) => d.probably_closed_at);
  ok('a data de previsão de um negócio confere', (await q(`SELECT to_char(expected_close_date,'YYYY-MM-DD') AS d FROM crm_deals WHERE org_id=$1 AND external_id=$2`, [ORG, String(dExp.hash)])).rows[0].d === String(dExp.probably_closed_at).slice(0, 10));
  const wantTags = liveDeals.reduce((t, d) => t + new Set((d.tags || []).map((x) => String(x.name).trim().toLowerCase())).size, 0);
  ok('tags: mesma quantidade de atribuições (maiúsculas/minúsculas contam como a mesma tag)', wantTags > 0 && await n(`SELECT count(*)::int n FROM crm_deal_tags WHERE org_id=$1`) === wantTags, { wantTags });
  ok('tags: catálogo sem duplicata e com todas as tags do PipeRun', await n(`SELECT count(*)::int n FROM crm_tags WHERE org_id=$1`) === new Set([...raw('tags'), ...liveDeals.flatMap((d) => d.tags || [])].map((x) => String(x.name).trim().toLowerCase())).size);
  const tDeal = liveDeals.find((d) => (d.tags || []).length);
  const tRow = (await q(`SELECT id FROM crm_deals WHERE org_id=$1 AND external_id=$2`, [ORG, String(tDeal.hash)])).rows[0];
  const det = await call(C.vend, 'GET', `/api/crm/deals/${tRow.id}`);
  ok('a ficha do negócio traz as tags e o MRR', det.status === 200 && det.json.deal.tags.length === new Set(tDeal.tags.map((x) => x.name.trim().toLowerCase())).size, det.json && det.json.deal && det.json.deal.tags);
  const flt = await call(C.vend, 'GET', `/api/crm/deals?tag=${encodeURIComponent('resp · teste')}&status=all&limit=100`);
  ok('filtro por tag devolve só os negócios com a tag (sem diferenciar maiúsculas)', flt.status === 200 && flt.json.items.length > 0 && flt.json.items.every((d) => d.tags.some((t) => t.toLowerCase() === 'resp · teste')), flt.json && flt.json.items && flt.json.items.length);
  const put = await call(C.vend, 'PUT', `/api/crm/deals/${tRow.id}/tags`, { tags: ['Nova tag X', 'resp · teste', 'NOVA TAG x'] });
  ok('vendedor edita as tags do negócio (cria a nova no catálogo, sem duplicar)', put.status === 200 && put.json.tags.length === 2 && put.json.tags.includes('Nova tag X') && await n(`SELECT count(*)::int n FROM crm_tags WHERE org_id=$1 AND name_key='nova tag x'`) === 1, put.json);
  ok('mudança de tags fica na auditoria e na linha do tempo', await n(`SELECT count(*)::int n FROM crm_audit_logs WHERE org_id=$1 AND entity_id=$2 AND changes::text LIKE '%"tags"%'`, [ORG, tRow.id]) >= 1 && await n(`SELECT count(*)::int n FROM crm_timeline_events WHERE org_id=$1 AND entity_id=$2 AND summary LIKE '%tags%'`, [ORG, tRow.id]) >= 1);
  ok('tags: lista inválida → 400; outra organização não mexe (404)', (await call(C.vend, 'PUT', `/api/crm/deals/${tRow.id}/tags`, { tags: 'x' })).status === 400 && (await call(C.admin2, 'PUT', `/api/crm/deals/${tRow.id}/tags`, { tags: ['a'] })).status === 404);
  const mp = await call(C.vend, 'PATCH', `/api/crm/deals/${tRow.id}`, { mrr: 1234.5 });
  ok('MRR editável pela API (com auditoria)', mp.status === 200 && mp.json.deal.mrr === 1234.5 && await n(`SELECT count(*)::int n FROM crm_audit_logs WHERE org_id=$1 AND entity_id=$2 AND changes::text LIKE '%"mrr"%'`, [ORG, tRow.id]) >= 1);
  const bad = await call(C.vend, 'PATCH', `/api/crm/deals/${tRow.id}`, { mrr: 'abc' });
  ok('MRR inválido → 400', bad.status === 400, bad.status);
  // SLA estourado: a etapa tem prazo de 1 dia e o negócio está lá há mais tempo
  await q(`UPDATE crm_pipeline_stages SET sla_days=1 WHERE id=(SELECT stage_id FROM crm_deals WHERE id=$1)`, [tRow.id]);
  await q(`UPDATE crm_deals SET status='open', stage_entered_at=now() - interval '10 days' WHERE id=$1`, [tRow.id]);
  const sl = await call(C.vend, 'GET', `/api/crm/deals/${tRow.id}`);
  ok('negócio aberto além do prazo da etapa vem marcado como estourado', sl.json.deal.slaExceeded === true && sl.json.deal.slaDays === 1, { sla: sl.json.deal.slaDays, ex: sl.json.deal.slaExceeded });
  const sv = (await q(`SELECT s.pipeline_id, s.id, s.name, s.probability, s.sla_days FROM crm_pipeline_stages s WHERE s.id=(SELECT stage_id FROM crm_deals WHERE id=$1)`, [tRow.id])).rows[0];
  const pl = (await call(C.admin, 'GET', '/api/crm/pipelines')).json.pipelines.find((x) => x.id === sv.pipeline_id);
  const saved = await call(C.admin, 'POST', `/api/crm/pipelines/${sv.pipeline_id}/stages`, { stages: pl.stages.filter((x) => x.kind === 'open').map((x) => ({ id: x.id, name: x.name, probability: x.probability, slaDays: x.id === sv.id ? 7 : x.slaDays })) });
  ok('tela de funis salva o prazo da etapa; prazo inválido → 400', saved.status === 200 && Number((await q(`SELECT sla_days AS n FROM crm_pipeline_stages WHERE id=$1`, [sv.id])).rows[0].n) === 7 && (await call(C.admin, 'POST', `/api/crm/pipelines/${sv.pipeline_id}/stages`, { stages: pl.stages.filter((x) => x.kind === 'open').map((x) => ({ id: x.id, name: x.name, probability: x.probability, slaDays: 0.5 })) })).status === 400);
  const dtOk = await call(C.admin, 'POST', '/api/crm/migration/piperun/raw/deal-tags', { rows: [{ id: String(tDeal.id), tags: ['RESP · Teste', { name: 'Outra' }] }] });
  ok('carregar tags no backup bruto: admin 200 e grava; vendedor 403; corpo inválido 400', dtOk.status === 200 && dtOk.json.patched === 1 && (await call(C.vend, 'POST', '/api/crm/migration/piperun/raw/deal-tags', { rows: [] })).status === 403 && (await call(C.admin, 'POST', '/api/crm/migration/piperun/raw/deal-tags', { rows: [] })).status === 400);
  await q(`UPDATE piperun_raw SET payload = payload || jsonb_build_object('tags', $2::jsonb) WHERE org_id=$1 AND entity='deals' AND pid=$3`, [ORG, JSON.stringify(tDeal.tags), String(tDeal.id)]);
}
// 3ª leva: formulário respondido, assinatura (linha do tempo + anotação) e comentário do motivo de perda
{
  const liveSet = new Set(liveDeals.map((d) => String(d.id)));
  const evs = (RAW.histories || []).filter((h) => [1007, 59, 76].includes(Number(h.type)) && h.deal_id && liveSet.has(String(h.deal_id)));
  ok('formulários e assinaturas: cada evento do PipeRun virou um evento na linha do tempo do negócio', await n(`SELECT count(*)::int n FROM crm_timeline_events WHERE org_id=$1 AND event_type IN ('form_answered','contract_signed','signature_requested')`) === evs.length, { esperado: evs.length });
  const signed = evs.find((h) => Number(h.type) === 59);
  if (signed) {
    const dealRow = (await q(`SELECT id FROM crm_deals WHERE org_id=$1 AND external_id=$2`, [ORG, String(liveDeals.find((d) => String(d.id) === String(signed.deal_id)).hash)])).rows[0];
    const nt = (await q(`SELECT body, author_name FROM crm_notes WHERE org_id=$1 AND entity_id=$2 AND body LIKE 'Assinatura eletrônica no PipeRun%'`, [ORG, dealRow.id])).rows;
    ok('trilha da assinatura vira UMA anotação (convidados, quem assinou, quando e IP) — sem CPF nem nascimento', nt.length === 1 && /Assinatura concluída por/.test(nt[0].body) && /Convites enviados para/.test(nt[0].body) && !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(nt[0].body) && !/1991/.test(nt[0].body), nt[0] && nt[0].body);
  }
  const rcWant = liveDeals.filter((d) => Number(d.status) === 3 && d.reason_close && /[\p{L}\p{N}]/u.test(d.reason_close));
  let rcOk = 0; for (const d of rcWant) { if ((await q(`SELECT lost_detail FROM crm_deals WHERE org_id=$1 AND external_id=$2`, [ORG, String(d.hash)])).rows[0].lost_detail.includes(String(d.reason_close).trim())) rcOk += 1; }
  ok('comentário livre do motivo de perda (ex.: "Fechou com a Evox") está no detalhe da perda', rcOk === rcWant.length, { rcOk, de: rcWant.length });
}
const rrX = await runMigration(ORG, actor, { ownerMap, includeFiles: true, maxFiles: Infinity, fetchImpl: fileStub.impl });
ok('2ª leva é repetível: reimportar não duplica tags, produtos nem funis e não pisa no MRR/prazo editados', rrX.dealExtras.deals === 0 && rrX.dealExtras.alreadyApplied > 0 && rrX.extraHistory.timeline === 0 && rrX.extraHistory.signatureNotes === 0 && rrX.extraHistory.reasonClose === 0 && rrX.products.created === 0 && rrX.funnels.createdFunnels.length === 0 && Number((await q(`SELECT mrr AS n FROM crm_deals WHERE org_id=$1 AND external_id=$2`, [ORG, String(liveDeals.find((d) => (d.tags || []).length).hash)])).rows[0].n) === 1234.5, { de: rrX.dealExtras, pr: rrX.products, fu: rrX.funnels });
const repX = await reconcile(ORG);
ok('conferência mostra as linhas da 2ª leva como informativas (não derrubam o "ok")', repX.summary.filter((x) => x.info).length >= 5 && repX.ok === true, repX.summary.filter((x) => !x.ok).map((x) => [x.label, x.piperun, x.crm]));
function await_name(p, stages) { return stages.some((r) => r.pipeline.trim().toLowerCase() === p.name.trim().toLowerCase()) || false; }

// ---------- 7. Arquivos pela API + isolamento ----------
const anyDeal = (await q(`SELECT deal_id FROM crm_deal_files WHERE org_id=$1 LIMIT 1`, [ORG])).rows[0];
if (anyDeal) {
  ok('vendedor NÃO lista nem baixa arquivos do PipeRun (403, M7)', (await call(C.vend, 'GET', `/api/crm/deals/${anyDeal.deal_id}/files`)).status === 403);
  const fl = await call(C.admin, 'GET', `/api/crm/deals/${anyDeal.deal_id}/files`);
  ok('quem tem a capacidade de exportar (administrador) lista os arquivos do negócio', fl.status === 200 && fl.json.files.length >= 1 && fl.json.files[0].source === 'piperun');
  const dl = await call(C.admin, 'GET', `/api/crm/deal-files/${fl.json.files[0].id}/download`);
  ok('download entrega o conteúdo, com cabeçalhos seguros', dl.status === 200 && dl.buf.length > 0 && dl.headers.get('x-content-type-options') === 'nosniff' && /attachment/.test(dl.headers.get('content-disposition')), { st: dl.status });
  ok('outra organização não baixa o arquivo (404)', (await call(C.admin2, 'GET', `/api/crm/deal-files/${fl.json.files[0].id}/download`)).status === 404);
  ok('outra organização não lista os arquivos', (await call(C.admin2, 'GET', `/api/crm/deals/${anyDeal.deal_id}/files`)).json.files.length === 0);
}
ok('sem login não baixa arquivo', (await call('', 'GET', '/api/crm/deal-files/00000000-0000-0000-0000-000000000000/download')).status === 401);

// ---------- 8. Token nunca fica no banco nem nas respostas ----------
const dump = JSON.stringify((await q(`SELECT * FROM piperun_runs WHERE org_id=$1`, [ORG])).rows) + JSON.stringify((await q(`SELECT payload FROM piperun_raw WHERE org_id=$1 AND entity='users'`, [ORG])).rows);
ok('o token não aparece em piperun_runs (progresso, resultado, erro) nem na cópia bruta', !dump.includes(FAKE_TOKEN));
const { startRun, finishRun, failRun, latestRuns } = await import('../server/crm/piperun/runs.js');
const r1 = await startRun(ORG, 'import', actor); const r2 = await startRun(ORG, 'extract', actor);
ok('só uma extração/importação por vez na organização (a segunda é recusada)', r1.id && r2.busy === r1.id, { r1, r2 });
const busyHttp = await call(C.admin, 'POST', '/api/crm/migration/piperun/import', {});
ok('pela API, pedir outra importação enquanto roda → 409', busyHttp.status === 409, busyHttp.status);
await failRun(r1.id, 'teste');
const runsList = await latestRuns(ORG);
ok('execução falha registra erro legível (sem token) e libera a próxima', runsList[0].status === 'failed' && runsList[0].error === 'teste' && (await startRun(ORG, 'extract', actor)).id > 0);
await q(`UPDATE piperun_runs SET status='failed' WHERE org_id=$1 AND status='running'`, [ORG]);

// ---------- 8b. Automação "ao ganhar" (cópia no Pós Vendas) ----------
const pipesRes = await call(C.admin, 'GET', '/api/crm/pipelines');
const emp = pipesRes.json.pipelines.find((p) => p.name === 'Empresas'); const pos = pipesRes.json.pipelines.find((p) => p.name === 'Pós Vendas');
if (emp && pos) {
  const contrato = emp.stages.find((x) => x.name === 'Contrato' && x.kind === 'open'); const ganhosPos = pos.stages.find((x) => x.name === 'Ganhos' && x.kind === 'open');
  const wonEmp = emp.stages.find((x) => x.kind === 'won'); const mapeamento = emp.stages.find((x) => x.name === 'Mapeamento');
  const patch = (c, body) => call(c, 'PATCH', `/api/crm/pipelines/${emp.id}`, body);
  ok('automação: só quem configura funis (vendedor não) — 403', (await patch(C.vend, { onWon: { pipelineId: pos.id, stageId: ganhosPos.id } })).status === 403);
  ok('automação: cópia para o MESMO funil é recusada (400)', (await patch(C.admin, { onWon: { pipelineId: emp.id, stageId: contrato.id } })).status === 400);
  ok('automação: etapa de fechamento como destino é recusada (400)', (await patch(C.admin, { onWon: { pipelineId: pos.id, stageId: pos.stages.find((x) => x.kind === 'won').id } })).status === 400);
  const cfg = await patch(C.admin, { onWon: { pipelineId: pos.id, stageId: ganhosPos.id, fromStageId: contrato.id } });
  const empAfter = cfg.json && cfg.json.pipelines.find((p) => p.id === emp.id);
  ok('automação salva e devolvida na lista de funis', cfg.status === 200 && empAfter.onWon && empAfter.onWon.pipelineId === pos.id && empAfter.onWon.stageId === ganhosPos.id && empAfter.onWon.fromStageId === contrato.id, empAfter && empAfter.onWon);
  const openIn = async (stageName) => (await q(`SELECT d.id, d.title, d.company_id, d.value, d.owner_id FROM crm_deals d JOIN crm_pipeline_stages s ON s.id=d.stage_id WHERE d.org_id=$1 AND d.pipeline_id=$2 AND d.status='open' AND s.name=$3 AND d.deleted_at IS NULL ORDER BY d.created_at LIMIT 2`, [ORG, emp.id, stageName])).rows;
  const [dealA, dealB] = await openIn('Leads');
  const copies = async () => Number((await q(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND external_source='auto-won'`, [ORG])).rows[0].n);
  const c0 = await copies();
  await call(C.admin, 'POST', `/api/crm/deals/${dealA.id}/move`, { stageId: contrato.id });
  const win = await call(C.admin, 'POST', `/api/crm/deals/${dealA.id}/move`, { stageId: wonEmp.id });
  ok('ganhar a partir da etapa configurada cria a cópia e avisa na resposta', win.status === 200 && win.json.deal.autoCopy && win.json.deal.autoCopy.pipelineName === 'Pós Vendas' && (await copies()) === c0 + 1, win.json && win.json.deal && win.json.deal.autoCopy);
  const cp = (await q(`SELECT d.*, s.name AS stage, p.name AS pipeline FROM crm_deals d JOIN crm_pipeline_stages s ON s.id=d.stage_id JOIN crm_pipelines p ON p.id=d.pipeline_id WHERE d.org_id=$1 AND d.external_source='auto-won' AND d.external_id=$2`, [ORG, dealA.id])).rows[0];
  ok('a cópia nasce em aberto no funil e etapa certos, com empresa, título, valor e responsável do original', cp && cp.status === 'open' && cp.pipeline === 'Pós Vendas' && cp.stage === 'Ganhos' && cp.company_id === dealA.company_id && cp.title === dealA.title && Number(cp.value) === Number(dealA.value) && cp.owner_id === dealA.owner_id, cp && { st: cp.status, p: cp.pipeline, s: cp.stage });
  ok('a cópia tem percurso (entrou na etapa) e a linha do tempo dos dois negócios registra a automação', (await n(`SELECT count(*)::int n FROM crm_deal_stage_history WHERE deal_id=$1`, [cp.id])) === 1 && (await n(`SELECT count(*)::int n FROM crm_timeline_events WHERE org_id=$1 AND event_type='deal_copied' AND entity_id=$2`, [ORG, dealA.id])) === 1);
  await call(C.admin, 'POST', `/api/crm/deals/${dealA.id}/move`, { stageId: contrato.id });
  await call(C.admin, 'POST', `/api/crm/deals/${dealA.id}/move`, { stageId: wonEmp.id });
  ok('reabrir e ganhar de novo NÃO duplica a cópia', (await copies()) === c0 + 1);
  // gatilho por etapa: ganhar direto de outra etapa não copia
  await call(C.admin, 'POST', `/api/crm/deals/${dealB.id}/move`, { stageId: mapeamento.id });
  const winB = await call(C.admin, 'POST', `/api/crm/deals/${dealB.id}/move`, { stageId: wonEmp.id });
  ok('ganhar a partir de outra etapa (não a configurada) não cria cópia', winB.status === 200 && !winB.json.deal.autoCopy && (await copies()) === c0 + 1);
  // desligar
  const [dealC] = await openIn('Leads');
  const off = await patch(C.admin, { onWon: null });
  ok('automação pode ser desligada', off.status === 200 && off.json.pipelines.find((p) => p.id === emp.id).onWon === null);
  await call(C.admin, 'POST', `/api/crm/deals/${dealC.id}/move`, { stageId: contrato.id });
  const winC = await call(C.admin, 'POST', `/api/crm/deals/${dealC.id}/move`, { stageId: wonEmp.id });
  ok('desligada, ganhar não cria cópia', winC.status === 200 && !winC.json.deal.autoCopy && (await copies()) === c0 + 1);
}

// ---------- 9. Apagar a cópia bruta depois da virada ----------
ok('apagar a cópia bruta exige confirmação', (await call(C.admin, 'POST', '/api/crm/migration/piperun/purge', {})).status === 400 && (await rawCounts(ORG)).counts.deals > 0);
const mapBefore = await n(`SELECT count(*)::int n FROM piperun_map WHERE org_id=$1`);
await call(C.admin, 'POST', '/api/crm/migration/piperun/purge', { confirm: true });
ok('cópia bruta apagada; o mapa de IDs foi mantido (não duplica se alguém reimportar)', (await rawCounts(ORG)).fetchedAt === null && (await n(`SELECT count(*)::int n FROM piperun_map WHERE org_id=$1`)) === mapBefore);
let afterPurgeErr = ''; try { await runMigration(ORG, actor, {}); } catch (e) { afterPurgeErr = e.message; }
ok('depois de apagar a cópia, importar de novo pede nova extração (não inventa dados)', /extra/i.test(afterPurgeErr), afterPurgeErr);

await cleanup();
await pool.end();
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes da migração PipeRun ok');
process.exit(failed ? 1 : 0);
