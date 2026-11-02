// Teste de mesa da descoberta da API de conectividade (2026-11-02, §129), contra servidor PRÓPRIO (porta 3013) e Postgres LOCAL:
// gera chaves de leitura e de escrita para usuários temporários, percorre o catálogo que GET /api/connect anuncia e confere que cada rota
// existe e responde JSON (com as chaves do exemplo), que gravar com chave de leitura dá 403 em TODAS as rotas de gravação, que a chave de
// Operações não vê o CRM, que nada de outra organização aparece, e que 401/404/405/429, CORS e o OpenAPI estão como o guia promete.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/connect-discovery.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const ORG = 'sandbox-edu';
const RUN = crypto.randomBytes(3).toString('hex');
const PASS = crypto.randomBytes(12).toString('base64url');
const U = { adm: `ocd_adm_${RUN}`, ops: `ocd_ops_${RUN}` };
const PID = `ocd-proj-${RUN}`; const PID_OTHER = `ocd-other-${RUN}`;
const APP_PORT = Number(process.env.APP_PORT || 3013); const BASE = `http://localhost:${APP_PORT}`;
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e).slice(0, 600)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(APP_PORT), DATABASE_URL: DB, JWT_SECRET: 'teste-local', ANTHROPIC_API_KEY: '', VOYAGE_API_KEY: '', NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'] });
let appLog = ''; app.stdout.on('data', (d) => { appLog += d; }); app.stderr.on('data', (d) => { appLog += d; });
process.on('exit', () => { try { app.kill('SIGTERM'); } catch { /* já encerrou */ } });

async function cleanup() {
  await pool.query(`DELETE FROM projects WHERE id = ANY($1)`, [[PID, PID_OTHER]]);
  await pool.query(`DELETE FROM api_token_actions WHERE user_id LIKE 'ocd_%'`).catch(() => {});
  await pool.query(`DELETE FROM api_tokens WHERE user_id LIKE 'ocd_%'`);
  await pool.query(`DELETE FROM personal_card_events WHERE user_id LIKE 'ocd_%'`).catch(() => {});
  await pool.query(`DELETE FROM personal_board_versions WHERE user_id LIKE 'ocd_%'`).catch(() => {});
  await pool.query(`DELETE FROM personal_boards WHERE user_id LIKE 'ocd_%'`).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id LIKE 'ocd_%'`);
}

const call = async (headers, method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...headers, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const type = r.headers.get('content-type') || '';
  let json = null; let text = '';
  if (type.includes('json')) { try { json = await r.json(); } catch { /* corpo vazio */ } } else text = Buffer.from(await r.arrayBuffer()).toString('latin1').slice(0, 200);
  return { status: r.status, json, text, type, headers: r.headers };
};
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const fill = (path, ids) => path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(ids[k] || `x-${k}`));
const isRouteMissing = (r) => r.status === 404 && r.json && /Rota não existe/.test(r.json.message || '');

try {
  for (let i = 0; i < 80; i += 1) { try { if ((await fetch(`${BASE}/api/connect/openapi.json`)).ok) break; } catch { /* subindo */ } await sleep(500); if (i === 79) throw new Error(`servidor não subiu:\n${appLog.slice(-800)}`); }
  await sleep(1500);
  await cleanup();
  const OTHER_ORG = (await pool.query('SELECT id FROM organizations WHERE id <> $1 ORDER BY id LIMIT 1', [ORG])).rows[0].id;
  const hash = await bcrypt.hash(PASS, 10);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access,personal_access,work_role) VALUES ($1,$1,$2,'Admin Descoberta','master',$3,true,true,true,'socio')`, [U.adm, hash, ORG]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,companies_access,all_companies_access,personal_access,work_role) VALUES ($1,$1,$2,'Operações Descoberta','pricetax',$3,true,true,true,'operacoes')`, [U.ops, hash, ORG]);
  const meeting = { id: `mtg-${RUN}`, date: '2026-10-28', title: 'Reunião de teste', summary: 'Resumo', decisions: 'Nada', participants: ['Rafael'], actionItems: [{ id: `mai-${RUN}`, title: 'Enviar planilha', responsible: 'Cliente' }] };
  const data = (name) => ({ company: { name, nomeFantasia: name, cnpj: '' }, team: [], phases: [{ id: 'ph-1', name: 'Fase 1' }], activities: [{ id: `act-${RUN}`, title: 'Atividade', phase: 'ph-1', status: 'nao-iniciado', subactivities: [{ id: `sub-${RUN}`, title: 'Passo', done: false }] }], meetings: [meeting] });
  await pool.query(`INSERT INTO projects (id, org_id, data) VALUES ($1,$2,$3),($4,$5,$6)`, [PID, ORG, JSON.stringify(data(`Descoberta ${RUN}`)), PID_OTHER, OTHER_ORG, JSON.stringify(data(`OutraOrg ${RUN}`))]);

  const login = async (u) => { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; };
  const ck = { adm: await login(U.adm), ops: await login(U.ops) };
  const mint = async (who, scope, name) => (await call({ Cookie: ck[who] }, 'POST', '/api/connect/tokens', { name, scope, days: 30 })).json;
  const R = await mint('adm', 'read_all', 'Leitura teste'); const W = await mint('adm', 'write_all', 'Escrita teste'); const O = await mint('ops', 'read_all', 'Operações teste');
  const L = await mint('adm', 'read_all', 'Limite teste');
  ok('chaves geradas (leitura, escrita, Operações)', !!(R && R.token && W && W.token && O && O.token && L && L.token));

  // ---- sem chave e cabeçalhos errados
  const anon = await call({}, 'GET', '/api/connect');
  ok('sem chave: 401 em JSON com como autenticar, docs e openapi', anon.status === 401 && anon.json.error === 'unauthorized' && /Bearer/.test(anon.json.howToAuthenticate.header) && /openapi\.json$/.test(anon.json.howToAuthenticate.openapi), anon.json);
  ok('sem "Bearer": a mensagem diz que faltou a palavra Bearer', /Faltou a palavra Bearer/.test((await call({ Authorization: R.token }, 'GET', '/api/connect')).json.message));
  ok('X-Api-Key: a mensagem manda usar Authorization', /X-Api-Key/.test((await call({ 'X-Api-Key': R.token }, 'GET', '/api/connect')).json.message));
  ok('chave na URL: recusada e avisa que vazou', /Não ponha a chave na URL/.test((await call({}, 'GET', `/api/connect/me?token=${R.token}`)).json.message));
  ok('"bearer" minúsculo também vale', (await call({ Authorization: `bearer ${R.token}` }, 'GET', '/api/connect/me')).status === 200);
  ok('chave inventada: 401', (await call(bearer('pxk_inventada'), 'GET', '/api/connect')).status === 401);

  // ---- descoberta
  const dR = await call(bearer(R.token), 'GET', '/api/connect');
  const dSlash = await call(bearer(R.token), 'GET', '/api/connect/');
  ok('GET /api/connect e /api/connect/ com chave: 200', dR.status === 200 && dSlash.status === 200, dR.json);
  const d = dR.json || {};
  ok('descoberta diz quem é: apelido, usuário, permissão e organização', d.token && d.token.name === 'Leitura teste' && d.token.canWrite === false && d.user.name === 'Admin Descoberta' && d.organization && d.organization.id === ORG, { token: d.token, user: d.user, org: d.organization });
  ok('descoberta abre com o índice curto (uma linha por ação)', Array.isArray(d.index) && d.index.length === (d.resources || []).flatMap((g) => g.actions).length && Object.keys(d).indexOf('index') < Object.keys(d).indexOf('resources'));
  ok('busca de empresa ignora acento', (await call(bearer(R.token), 'GET', `/api/connect/companies?q=${encodeURIComponent('DESCOBERTA ' + RUN)}`)).json.total === 1);
  ok('descoberta traz links do OpenAPI e do guia e as regras', d.openapi === `${BASE}/api/connect/openapi.json` && d.docs === `${BASE}/api/connect/docs` && Array.isArray(d.rules) && d.rules.length > 3);
  const actionsR = (d.resources || []).flatMap((g) => g.actions);
  ok('chave de leitura: nenhuma ação que grava é anunciada', actionsR.length > 10 && actionsR.every((a) => !a.writes), actionsR.filter((a) => a.writes).map((a) => a.id));
  ok('cada ação traz método, caminho, parâmetros, exemplo de resposta e curl com a URL base', actionsR.every((a) => a.method && a.path && Array.isArray(a.params) && a.responseExample !== undefined && a.curl.includes(BASE)));
  const dW = (await call(bearer(W.token), 'GET', '/api/connect')).json;
  const actionsW = dW.resources.flatMap((g) => g.actions);
  ok('chave de escrita: canWrite e as gravações anunciadas com corpo de exemplo', dW.token.canWrite === true && actionsW.filter((a) => a.writes).length >= 15 && actionsW.filter((a) => a.writes && a.body).every((a) => a.body.example));
  const dO = (await call(bearer(O.token), 'GET', '/api/connect')).json;
  ok('chave de Operações: nenhuma rota do CRM na descoberta e o motivo dito', !JSON.stringify(dO.resources).includes('/api/connect/crm') && dO.notAvailableToThisKey.some((x) => /CRM/.test(x)), dO.notAvailableToThisKey);
  ok('chave de Operações: CRM direto dá 403', (await call(bearer(O.token), 'GET', '/api/connect/crm/deals')).status === 403);
  const oOpen = (await call(bearer(O.token), 'GET', '/api/connect/openapi.json')).json;
  ok('OpenAPI da chave de Operações sem CRM', !Object.keys(oOpen.paths).some((p) => p.includes('/crm')) && /filtrada/.test(oOpen.info.description));

  // ---- percorre o catálogo da chave de escrita (lê tudo que ela lê) e confere que cada GET responde de verdade
  const ids = { id: PID, meetingId: meeting.id };
  const crmLists = { 'crm.deals.list': 'deals', 'crm.companies.list': 'companies', 'crm.contacts.list': 'contacts' };
  const crmIds = {};
  for (const [aid, k] of Object.entries(crmLists)) { const r = await call(bearer(W.token), 'GET', `/api/connect/crm/${k}?limit=1`); crmIds[k] = r.json && r.json.items && r.json.items[0] ? r.json.items[0].id : crypto.randomUUID(); ok(`${aid} pagina (limit=1 devolve no máximo 1 e traz total)`, r.status === 200 && r.json.items.length <= 1 && typeof r.json.total === 'number', r.json); }
  const idsFor = (a) => {
    if (a.path.includes('/crm/deals/')) return { id: crmIds.deals };
    if (a.path.includes('/crm/companies/')) return { id: crmIds.companies };
    if (a.path.includes('/crm/contacts/')) return { id: crmIds.contacts };
    return ids;
  };
  const mismatch = [];
  for (const a of actionsW.filter((x) => x.method === 'GET')) {
    const q = a.params.filter((x) => x.in === 'query' && x.required).map((x) => `${x.name}=te`).join('&');
    const r = await call(bearer(W.token), 'GET', `${fill(a.path, idsFor(a))}${q ? `?${q}` : ''}`);
    const good = !isRouteMissing(r) && (r.status === 200 || r.status === 404) && (a.id === 'crm.deals.export' ? /spreadsheet/.test(r.type) : !!r.json);
    ok(`GET anunciado responde: ${a.id} (${r.status})`, good, r.json || r.text);
    if (r.status === 200 && r.json && a.responseExample && typeof a.responseExample === 'object') {
      const miss = Object.keys(a.responseExample).filter((k) => !(k in r.json));
      if (miss.length) mismatch.push(`${a.id}: ${miss.join(',')} (veio ${Object.keys(r.json).join(',')})`);
    }
  }
  ok('exemplos de resposta do catálogo batem com as chaves reais', mismatch.length === 0, mismatch);

  // ---- toda gravação com chave de leitura dá 403 (nada é gravado)
  const writes = actionsW.filter((a) => a.writes);
  const not403 = [];
  for (const a of writes) {
    const r = await call(bearer(R.token), a.method, fill(a.path, idsFor(a)), a.body ? a.body.example : {});
    if (r.status !== 403 || !r.json || r.json.error !== 'forbidden') not403.push(`${a.method} ${a.path} -> ${r.status}`);
  }
  ok(`gravar com chave de leitura dá 403 em todas as ${writes.length} rotas de gravação`, not403.length === 0, not403);

  // ---- gravações reais e prévias com a chave de escrita (só no que é do teste)
  const cr = await call(bearer(W.token), 'POST', '/api/connect/activities', { title: `Teste descoberta ${RUN}`, ref: `ocd-${RUN}` });
  const cr2 = await call(bearer(W.token), 'POST', '/api/connect/activities', { title: `Teste descoberta ${RUN}`, ref: `ocd-${RUN}` });
  ok('activities.create grava e a mesma ref não duplica', cr.status === 201 && cr2.status === 200 && cr2.json.created === false && cr2.json.activity.id === cr.json.activity.id, [cr.json, cr2.json]);
  const bp = await call(bearer(W.token), 'POST', '/api/connect/board/plan', { operations: [{ op: 'update_card', card: cr.json.activity.id, set: { priority: 'alta' } }] });
  ok('board.plan sem apply devolve a prévia com digest', bp.status === 200 && bp.json.preview === true && !!bp.json.digest, bp.json);
  const pl = await call(bearer(W.token), 'POST', `/api/connect/companies/${PID}/plan`, { ops: [{ op: 'sub.set', activity: { id: `act-${RUN}` }, sub: { id: `sub-${RUN}` }, set: { done: true } }] });
  ok('companies.plan sem dryRun:false só mostra (nada gravado)', pl.status === 200 && pl.json.dryRun === true, pl.json);
  const me = await call(bearer(W.token), 'PATCH', `/api/connect/companies/${PID}/meetings/${meeting.id}`, { dryRun: true, title: 'Reunião de teste (corrigida)' });
  ok('meetings.edit com dryRun responde a prévia', me.status === 200 && me.json.dryRun === true, me.json);
  const still = (await pool.query('SELECT data FROM projects WHERE id=$1', [PID])).rows[0].data;
  ok('as prévias não gravaram nada', still.meetings[0].title === 'Reunião de teste' && still.activities[0].subactivities[0].done === false);

  // ---- outra organização nunca aparece
  const cl = await call(bearer(W.token), 'GET', '/api/connect/companies');
  ok('lista de empresas só da organização do dono', cl.json.companies.some((c) => c.id === PID) && !cl.json.companies.some((c) => c.id === PID_OTHER));
  ok('empresa de outra organização: 404', (await call(bearer(W.token), 'GET', `/api/connect/companies/${PID_OTHER}`)).status === 404);

  // ---- erros orientados, CORS e limite
  const nf = await call(bearer(R.token), 'GET', '/api/connect/empresas');
  ok('rota inventada: 404 em JSON que manda olhar GET /api/connect', nf.status === 404 && nf.json.error === 'not_found' && /GET \/api\/connect/.test(nf.json.message), nf.json);
  const na = await call(bearer(R.token), 'DELETE', '/api/connect/companies');
  ok('método errado: 405 com os métodos aceitos', na.status === 405 && na.json.error === 'method_not_allowed' && na.json.allowed.includes('GET /api/connect/companies') && na.headers.get('allow') === 'GET', na.json);
  const bad = await call(bearer(W.token), 'POST', '/api/connect/activities', { title: 'x', dueDate: '31/12/2026' });
  ok('dado inválido: 400 com error e message que diz o campo', bad.status === 400 && bad.json.error === 'bad_request' && /dueDate/.test(bad.json.message), bad.json);
  const pre = await fetch(`${BASE}/api/connect/companies`, { method: 'OPTIONS', headers: { Origin: 'https://app.base44.com', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  ok('CORS: preflight 204 com Authorization liberado e sem credenciais', pre.status === 204 && pre.headers.get('access-control-allow-origin') === '*' && /Authorization/i.test(pre.headers.get('access-control-allow-headers') || '') && !pre.headers.get('access-control-allow-credentials'));
  ok('CORS: gestão de chaves (cookie) fica de fora', !(await fetch(`${BASE}/api/connect/tokens`, { headers: { Origin: 'https://x.example' } })).headers.get('access-control-allow-origin'));
  const openAnon = await call({}, 'GET', '/api/connect/openapi.json');
  ok('OpenAPI público é 3.1 e sem dado de cliente', openAnon.status === 200 && openAnon.json.openapi === '3.1.0' && !JSON.stringify(openAnon.json).includes(RUN));
  const docs = await fetch(`${BASE}/api/connect/docs`, { headers: bearer(R.token) });
  const md = await docs.text();
  ok('guia legível em markdown, filtrado para a chave', docs.status === 200 && /markdown/.test(docs.headers.get('content-type')) && md.includes('Leitura teste') && !md.includes('(grava)'));
  let last = null;
  for (let i = 0; i < 125; i += 1) last = await call(bearer(L.token), 'GET', '/api/connect/me');
  ok('limite por minuto: 429 em JSON com Retry-After', last.status === 429 && last.json.error === 'rate_limited' && last.headers.get('retry-after') === '60', last.status);
} catch (e) {
  failed += 1; console.log('FAIL exceção', e && e.stack);
} finally {
  await cleanup().catch((e) => console.log('limpeza:', e.message));
  await pool.end();
  app.kill('SIGTERM');
}
console.log(failed ? `\n${failed} falha(s)` : '\ntudo ok');
process.exit(failed ? 1 : 0);
