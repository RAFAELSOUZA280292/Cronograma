// Teste HTTP das visões salvas e dos painéis por função do CRM (§98), contra o SANDBOX local (organização sandbox-edu, dados do PipeRun).
// Usuários temporários (oivtmp_*) com um perfil de CRM cada; três negócios mudam de dono durante o teste e voltam ao dono original no fim.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/views-dashboards.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const ORG = 'sandbox-edu';
const PASS = crypto.randomBytes(12).toString('base64url');
const RUN = crypto.randomBytes(3).toString('hex');
const U = { g: `oivtmp_g_${RUN}`, g2: `oivtmp_g2_${RUN}`, v: `oivtmp_v_${RUN}`, f: `oivtmp_f_${RUN}`, w: `oivtmp_w_${RUN}`, c: `oivtmp_c_${RUN}` };
const ROLE = { g: 'gestor', g2: 'gestor', v: 'vendedor', f: 'financeiro', w: 'visualizacao', c: 'vendedor' };
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
const hash = await bcrypt.hash(PASS, 10);
const { rows: orgOk } = await pool.query('SELECT 1 FROM organizations WHERE id=$1', [ORG]);
if (!orgOk[0]) { console.error('Sem o sandbox local: rode scripts/sandbox-eduarda.mjs antes.'); process.exit(2); }

let moved = [];
async function cleanup() {
  for (const m of moved) await pool.query('UPDATE crm_deals SET owner_id=$2 WHERE id=$1', [m.id, m.owner]);
  moved = [];
  await pool.query(`DELETE FROM crm_view_defaults WHERE user_id LIKE 'oivtmp_%'`).catch(() => {});
  await pool.query(`DELETE FROM crm_saved_views WHERE user_id LIKE 'oivtmp_%'`).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id LIKE 'oivtmp_%'`);
}
await cleanup();
for (const [k, id] of Object.entries(U)) await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,crm_role) VALUES ($1,$1,$2,$1,$3,$4,$5)`, [id, hash, k === 'c' ? 'cliente' : 'pricetax', ORG, ROLE[k]]);
const sess = {};
for (const [k, id] of Object.entries(U)) { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: id, password: PASS }) }); sess[k] = (r.headers.get('set-cookie') || '').split(';')[0]; }
const call = async (ck, method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { ...(ck ? { Cookie: ck } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch { /* sem corpo */ } return { status: r.status, json }; };

try {
  ok('login dos usuários temporários', Object.values(sess).every(Boolean));

  // ---- painéis por função
  const caps = {}; for (const k of ['g', 'v', 'f', 'w']) caps[k] = (await call(sess[k], 'GET', '/api/crm/me')).json.capabilities;
  ok('perfil define os painéis e o primeiro é o padrão', caps.g.lenses[0] === 'team' && caps.v.lenses[0] === 'mine' && caps.f.lenses[0] === 'revenue' && caps.w.lenses[0] === 'team', Object.fromEntries(Object.entries(caps).map(([k, c]) => [k, c.lenses])));
  ok('vendedor não tem Time nem Receita; financeiro não tem Meu dia', !caps.v.lenses.includes('team') && !caps.v.lenses.includes('revenue') && !caps.f.lenses.includes('mine'));
  ok('vendedor pedindo o painel Time → 403 (ranking dos colegas não é dele)', (await call(sess.v, 'GET', '/api/crm/overview?lens=team')).status === 403);
  ok('financeiro pedindo Meu dia → 403; painel inventado → 400', (await call(sess.f, 'GET', '/api/crm/overview?lens=mine')).status === 403 && (await call(sess.g, 'GET', '/api/crm/overview?lens=xyz')).status === 400);
  ok('cliente não entra no CRM (403)', (await call(sess.c, 'GET', '/api/crm/overview?lens=accounts')).status === 403);
  ok('sem painel informado continua devolvendo o resumo antigo (compatível)', (await call(sess.g, 'GET', '/api/crm/overview')).json.deals.openCount > 0);

  // três negócios abertos passam a ser do vendedor temporário (um sem passo, restaurados no fim)
  const { rows: pick } = await pool.query(`SELECT id, owner_id, value FROM crm_deals WHERE org_id=$1 AND status='open' AND deleted_at IS NULL ORDER BY value DESC, id LIMIT 3`, [ORG]);
  moved = pick.map((r) => ({ id: r.id, owner: r.owner_id }));
  for (const r of pick) await pool.query('UPDATE crm_deals SET owner_id=$2 WHERE id=$1', [r.id, U.v]);
  const expValue = pick.reduce((n, r) => n + Number(r.value), 0);

  const mine = await call(sess.v, 'GET', '/api/crm/overview?lens=mine');
  ok('Meu dia: só os negócios do próprio usuário (3 abertos, valor somado)', mine.status === 200 && mine.json.lens === 'mine' && mine.json.deals.openCount === 3 && Math.abs(mine.json.deals.openValue - expValue) < 0.01, mine.json.deals && { n: mine.json.deals.openCount, v: mine.json.deals.openValue, exp: expValue });
  const stages = mine.json.deals.byStage.reduce((n, s) => n + s.count, 0);
  ok('Meu dia: "onde estão meus negócios" fecha com o total', stages === 3, stages);
  ok('Meu dia: listas não trazem negócio de outra pessoa', [...mine.json.deals.noNextStep, ...mine.json.deals.late, ...mine.json.deals.stalled, ...mine.json.deals.closingSoon].every((d) => pick.some((p) => p.id === d.id)));
  const mineG = await call(sess.g, 'GET', '/api/crm/overview?lens=mine');
  ok('Meu dia de quem não tem negócio vem zerado (nada de outra pessoa)', mineG.json.deals.openCount === 0 && mineG.json.deals.byStage.length === 0 && mineG.json.activities.mineToday === 0);

  const team = await call(sess.g, 'GET', '/api/crm/overview?lens=team');
  const row = team.json.owners.find((o) => o.ownerId === U.v);
  const sumOpen = team.json.owners.reduce((n, o) => n + o.openCount, 0);
  ok('Time: uma linha por responsável com os 3 do vendedor', team.status === 200 && !!row && row.openCount === 3 && Math.abs(row.openValue - expValue) < 0.01, row);
  ok('Time: a soma das linhas bate com o total em aberto', sumOpen === team.json.deals.openCount, { sumOpen, total: team.json.deals.openCount });
  ok('Time: aparece a linha "Sem responsável" quando há negócio sem dono', team.json.deals.unownedCount === 0 || team.json.owners.some((o) => !o.ownerId && o.openCount === team.json.deals.unownedCount));
  ok('Time: motivos de perda vêm com rótulo', team.json.lostReasons.every((r) => r.label && r.count > 0));
  ok('visualização também lê o Time', (await call(sess.w, 'GET', '/api/crm/overview?lens=team')).status === 200);

  const rev = await call(sess.f, 'GET', '/api/crm/overview?lens=revenue');
  const fSum = rev.json.forecast.reduce((n, b) => n + b.count, 0);
  ok('Receita: previsão cobre TODOS os negócios abertos (vencida + meses + depois + sem data)', rev.status === 200 && fSum === rev.json.deals.openCount, { fSum, open: rev.json.deals.openCount });
  ok('Receita: valor da previsão fecha com o total em aberto', Math.abs(rev.json.forecast.reduce((n, b) => n + b.value, 0) - rev.json.deals.openValue) < 0.05);
  ok('Receita: 6 meses à frente em ordem, e MRR numérico', rev.json.forecast.filter((b) => /^\w{3}\/\d{2}$/.test(b.label)).length === 6 && typeof rev.json.mrr.wonMrr === 'number');
  ok('Receita: maior peso vem em ordem decrescente de valor ponderado', rev.json.topWeighted.every((d, i, a) => i === 0 || a[i - 1].weightedValue >= d.weightedValue));

  const acc = await call(sess.v, 'GET', '/api/crm/overview?lens=accounts');
  ok('Contas: o vendedor lê o painel de contas', acc.status === 200 && acc.json.lens === 'accounts' && acc.json.totalCompanies > 0);

  // ---- visões salvas
  const cfg = { view: 'list', pipelineId: '', q: 'prop', type: 'new', ownerId: 'me', source: '', tag: '', attention: 'nonext', listStatus: 'open', lixo: 'x' };
  const c1 = await call(sess.v, 'POST', '/api/crm/views', { scope: 'deals', name: '  Sem   passo  ', config: cfg });
  ok('vendedor salva visão pessoal; nome limpo e campo desconhecido descartado', c1.status === 201 && c1.json.view.name === 'Sem passo' && !('lixo' in c1.json.view.config) && c1.json.view.config.ownerId === 'me' && c1.json.view.mine && !c1.json.view.shared, c1.json);
  ok('config hostil é saneada (dono, funil e atenção inválidos viram vazio)', (await call(sess.v, 'POST', '/api/crm/views', { name: 'Hostil', config: { ownerId: "x'; DROP", pipelineId: 'abc', attention: 'zzz', listStatus: 'zzz', view: 'zzz', q: 'a'.repeat(500) } })).json.view.config.q.length === 100);
  const h = (await call(sess.v, 'GET', '/api/crm/views')).json.views.find((x) => x.name === 'Hostil').config;
  ok('…valores inválidos viram os padrões', h.ownerId === '' && h.pipelineId === '' && h.attention === '' && h.listStatus === 'open' && h.view === 'board', h);
  const own = await call(sess.v, 'POST', '/api/crm/views', { name: 'De outra pessoa', config: { ownerId: U.g, view: 'list' } });
  ok('visão filtrada por OUTRA pessoa guarda o id dela (ids de usuário não são UUID)', own.status === 201 && own.json.view.config.ownerId === U.g, own.json.view && own.json.view.config);
  ok('nome repetido do mesmo usuário → 409', (await call(sess.v, 'POST', '/api/crm/views', { name: 'sem passo', config: cfg })).status === 409);
  ok('sem nome → 400', (await call(sess.v, 'POST', '/api/crm/views', { name: '  ', config: cfg })).status === 400);
  ok('vendedor NÃO compartilha com o time (403)', (await call(sess.v, 'POST', '/api/crm/views', { name: 'Para todos', shared: true, config: cfg })).status === 403);
  ok('visão pessoal não aparece para outra pessoa', !(await call(sess.g, 'GET', '/api/crm/views')).json.views.some((x) => x.name === 'Sem passo'));
  const mineId = c1.json.view.id;
  ok('outra pessoa não edita nem exclui visão pessoal alheia (404: nem enxerga)', (await call(sess.g, 'PATCH', `/api/crm/views/${mineId}`, { name: 'Roubada' })).status === 404 && (await call(sess.g, 'DELETE', `/api/crm/views/${mineId}`)).status === 404);

  const s1 = await call(sess.g, 'POST', '/api/crm/views', { name: 'Propostas do time', shared: true, config: { ...cfg, ownerId: 'me' } });
  ok('gestor compartilha visão com o time', s1.status === 201 && s1.json.view.shared === true, s1.json);
  const vseen = (await call(sess.v, 'GET', '/api/crm/views')).json.views;
  ok('o vendedor vê a visão compartilhada (com o nome de quem criou) e não é dono dela', vseen.some((x) => x.id === s1.json.view.id && x.shared && !x.mine && x.ownerName));
  ok('vendedor não edita nem exclui visão do time (403)', (await call(sess.v, 'PATCH', `/api/crm/views/${s1.json.view.id}`, { name: 'x' })).status === 403 && (await call(sess.v, 'DELETE', `/api/crm/views/${s1.json.view.id}`)).status === 403);
  ok('outro gestor edita a visão do time', (await call(sess.g2, 'PATCH', `/api/crm/views/${s1.json.view.id}`, { name: 'Propostas do time v2' })).json.view.name === 'Propostas do time v2');
  ok('outro gestor não a deixa "só para si" (só quem criou)', (await call(sess.g2, 'PATCH', `/api/crm/views/${s1.json.view.id}`, { shared: false })).status === 403);
  ok('nome repetido entre visões do time → 409', (await call(sess.g, 'POST', '/api/crm/views', { name: 'propostas do time v2', shared: true, config: cfg })).status === 409);
  const up = await call(sess.v, 'PATCH', `/api/crm/views/${mineId}`, { config: { ...cfg, attention: 'late' } });
  ok('dono atualiza os filtros da própria visão', up.status === 200 && up.json.view.config.attention === 'late');

  // padrão ao abrir
  ok('padrão para visão inexistente/inválida → 404/400', (await call(sess.v, 'PUT', '/api/crm/views-default', { scope: 'deals', ref: crypto.randomUUID() })).status === 404 && (await call(sess.v, 'PUT', '/api/crm/views-default', { scope: 'x', ref: 'all' })).status === 400);
  ok('vendedor define a visão do time como padrão e o servidor devolve', (await call(sess.v, 'PUT', '/api/crm/views-default', { scope: 'deals', ref: s1.json.view.id })).status === 200 && (await call(sess.v, 'GET', '/api/crm/views')).json.defaults.deals === s1.json.view.id);
  ok('padrão embutido "mine" e painel inicial (overview) são aceitos', (await call(sess.v, 'PUT', '/api/crm/views-default', { scope: 'overview', ref: 'accounts' })).status === 200 && (await call(sess.v, 'GET', '/api/crm/views')).json.defaults.overview === 'accounts');
  ok('painel inicial inválido → 400', (await call(sess.v, 'PUT', '/api/crm/views-default', { scope: 'overview', ref: 'inventado' })).status === 400);
  ok('o padrão é por pessoa (o gestor não herda)', (await call(sess.g, 'GET', '/api/crm/views')).json.defaults.deals === undefined);
  // excluir visão do time derruba o padrão de quem a usava
  ok('gestor exclui a visão do time', (await call(sess.g, 'DELETE', `/api/crm/views/${s1.json.view.id}`)).status === 200);
  const after = (await call(sess.v, 'GET', '/api/crm/views')).json;
  ok('…ela some para o vendedor e o padrão dele volta a "nenhum"', !after.views.some((x) => x.id === s1.json.view.id) && after.defaults.deals === undefined);
  ok('dono exclui a própria visão; lista não a traz mais', (await call(sess.v, 'DELETE', `/api/crm/views/${mineId}`)).status === 200 && !(await call(sess.v, 'GET', '/api/crm/views')).json.views.some((x) => x.id === mineId));
  const reuse = await call(sess.v, 'POST', '/api/crm/views', { name: 'Sem passo', config: cfg });
  ok('o nome de uma visão excluída pode ser usado de novo', reuse.status === 201);
  const lim = []; for (let i = 0; i < 40; i++) lim.push((await call(sess.w, 'POST', '/api/crm/views', { name: `V${i}`, config: cfg })).status);
  ok('limite de 30 visões por pessoa (400 depois)', lim.filter((s) => s === 201).length === 30 && lim.slice(30).every((s) => s === 400), lim.join(','));
  ok('visão de "visualização" (só leitura) é preferência pessoal e funciona', lim[0] === 201);
  ok('sem login → 401', (await call('', 'GET', '/api/crm/views')).status === 401);
} finally {
  await cleanup();
  const { rows } = await pool.query(`SELECT count(*)::int n FROM crm_deals WHERE org_id=$1 AND owner_id LIKE 'oivtmp_%'`, [ORG]);
  ok('limpeza: nenhum negócio ficou com usuário de teste', rows[0].n === 0, rows[0]);
  await pool.end();
}
console.log(failed ? `\n${failed} FALHA(S)` : '\ntodos os testes de visões e painéis ok');
process.exit(failed ? 1 : 0);
