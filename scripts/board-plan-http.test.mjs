// Teste HTTP real da organização do quadro por API (GET /api/connect/board e POST /api/connect/board/plan). Precisa do servidor local rodando
// contra o Postgres local (nunca produção); cria usuários temporários (bptmp_*), usa e apaga no fim.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/board-plan-http.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const PASS = crypto.randomBytes(12).toString('base64url');
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: este teste só roda contra banco local.'); process.exit(2); }
const RUN = crypto.randomBytes(3).toString('hex');
const U = { master: `bptmp_master_${RUN}`, staff: `bptmp_staff_${RUN}` };

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra ? ` -> ${extra}` : ''}`); } };
const login = async (username) => {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: PASS }) });
  return (r.headers.get('set-cookie') || '').split(';')[0];
};
const call = async (auth, method, path, body) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(auth.startsWith('pxk_') ? { Authorization: `Bearer ${auth}` } : auth ? { Cookie: auth } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, json };
};

const pool = new pg.Pool({ connectionString: DB });
const { rows: [org] } = await pool.query(`SELECT org_id FROM users WHERE role='master' AND org_id IS NOT NULL AND org_id NOT LIKE 'eval-%' LIMIT 1`);
const hash = await bcrypt.hash(PASS, 10);
const cleanup = async () => {
  await pool.query(`DELETE FROM api_token_actions WHERE user_id LIKE 'bptmp_%'`);
  await pool.query(`DELETE FROM api_tokens WHERE user_id LIKE 'bptmp_%'`);
  await pool.query(`DELETE FROM personal_card_events WHERE user_id LIKE 'bptmp_%'`);
  await pool.query(`DELETE FROM personal_board_versions WHERE user_id LIKE 'bptmp_%'`);
  await pool.query(`DELETE FROM personal_boards WHERE user_id LIKE 'bptmp_%'`);
  await pool.query(`DELETE FROM users WHERE id LIKE 'bptmp_%'`);
};
await cleanup();
for (const [role, id] of [['master', U.master], ['pricetax', U.staff]]) await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id) VALUES ($1,$1,$2,$3,$4,$5)`, [id, hash, `Teste ${role}`, role, org.org_id]);
const mk = (id, title, o = {}) => ({ id, title, desc: '', status: 'nao-iniciada', priority: '', dueDate: '', tags: [], checklist: [], responsibleIds: [], completed: false, comments: [], history: [], deleted: false, archived: false, ...o });
const seed = { boards: [{ id: 'p1', name: 'EQUIPE', visibility: 'private', responsibles: [{ id: 'r1', name: 'Felipe' }], columns: [{ id: 'c1', name: 'TO_DO', cards: [mk('k1', 'ROMANHA', { checklist: [{ id: 'i1', text: 'Planilha', done: false }] }), mk('k2', 'ROMANHA – planilha', { checklist: [{ id: 'i2', text: 'Enviar', done: false }] }), mk('k3', 'KUHN')] }, { id: 'c2', name: 'MAIARA', cards: [] }] }] };
await pool.query(`INSERT INTO personal_boards (user_id, data, updated_at) VALUES ($1,$2,now())`, [U.master, JSON.stringify(seed)]);

const cookie = await login(U.master); const staffCookie = await login(U.staff);
ok('login dos usuários temporários', !!cookie && !!staffCookie);
const mkToken = async (scope) => (await call(cookie, 'POST', '/api/connect/tokens', { name: `bptmp ${scope}`, scope, days: 30 })).json;
const tAll = (await mkToken('write_all')).token; const tRead = (await mkToken('read_all')).token; const tCrm = (await mkToken('crm_operate')).token;
ok('chaves criadas (write_all, read_all, crm_operate)', !!tAll && !!tRead && !!tCrm);

// leitura com ids
const rd = await call(tRead, 'GET', '/api/connect/board?checklist=1');
ok('read_all lê o quadro com ids, responsáveis e passos', rd.status === 200 && rd.json.pages[0].columns[0].cards[0].id === 'k1' && rd.json.pages[0].columns[0].cards[0].items.length === 1 && !!rd.json.updatedAt);
ok('sem chave → 401', (await call('', 'GET', '/api/connect/board')).status === 401);

// quem pode organizar
const ops = [
  { op: 'create_column', page: 'EQUIPE', name: 'AGUARDANDO', after: 'MAIARA' },
  { op: 'merge_cards', into: 'k1', from: ['k2'] },
  { op: 'update_card', card: 'k1', set: { title: '[ROMANHA] Planilha de preço com CBS', dueDate: '2026-11-09', status: 'em-andamento', addTags: ['romanha'], responsibles: ['Maiara'] } },
  { op: 'move_card', card: 'k1', column: 'MAIARA' },
  { op: 'create_card', page: 'EQUIPE', column: 'MAIARA', title: '[CLAC] Reapurar com CBS', ref: `clac-${RUN}`, tags: ['clac'], responsibles: ['Maiara'], checklist: [{ text: 'Reapurar', dueDate: '2026-11-05' }] },
  { op: 'trash_card', card: 'k3', reason: 'duplicado' },
];
for (const [nome, t] of [['read_all', tRead], ['crm_operate', tCrm]]) {
  const r = await call(t, 'POST', '/api/connect/board/plan', { operations: ops });
  ok(`chave ${nome} NÃO organiza o quadro → 403`, r.status === 403, JSON.stringify(r.json));
}
ok('cookie de sessão não vale na rota de chave → 401', (await call(cookie, 'POST', '/api/connect/board/plan', { operations: ops })).status === 401);
ok('lote vazio → 400', (await call(tAll, 'POST', '/api/connect/board/plan', { operations: [] })).status === 400);
ok('lote grande demais → 400', (await call(tAll, 'POST', '/api/connect/board/plan', { operations: Array.from({ length: 301 }, () => ({ op: 'create_column', name: 'x' })) })).status === 400);

// prévia não grava
const before = (await pool.query(`SELECT updated_at, data FROM personal_boards WHERE user_id=$1`, [U.master])).rows[0];
const pv = await call(tAll, 'POST', '/api/connect/board/plan', { operations: ops });
ok('prévia devolve digest, contagem e mudanças por cartão', pv.status === 200 && pv.json.preview === true && !!pv.json.digest && pv.json.errors.length === 0 && pv.json.changed === 6 && pv.json.changes.length === 6, JSON.stringify(pv.json).slice(0, 300));
const afterPv = (await pool.query(`SELECT updated_at FROM personal_boards WHERE user_id=$1`, [U.master])).rows[0];
ok('prévia NÃO grava nada', afterPv.updated_at.getTime() === before.updated_at.getTime());
ok('prévia não cria cópia em Versões', (await pool.query(`SELECT count(*)::int AS n FROM personal_board_versions WHERE user_id=$1`, [U.master])).rows[0].n === 0);

// gravar exige confirmação e digest
ok('apply sem confirm → 400', (await call(tAll, 'POST', '/api/connect/board/plan', { operations: ops, apply: true, digest: pv.json.digest })).status === 400);
ok('apply com digest errado → 409', (await call(tAll, 'POST', '/api/connect/board/plan', { operations: ops, apply: true, confirm: true, digest: 'x' })).status === 409);
const badOps = [...ops, { op: 'move_card', card: 'nao-existe', column: 'MAIARA' }];
const bp = await call(tAll, 'POST', '/api/connect/board/plan', { operations: badOps });
ok('prévia aponta o erro com o índice', bp.json.errors.length === 1 && bp.json.errors[0].index === 6);
const ba = await call(tAll, 'POST', '/api/connect/board/plan', { operations: badOps, apply: true, confirm: true, digest: bp.json.digest });
ok('lote com erro → 422 e nada é gravado (tudo ou nada)', ba.status === 422 && (await pool.query(`SELECT updated_at FROM personal_boards WHERE user_id=$1`, [U.master])).rows[0].updated_at.getTime() === before.updated_at.getTime());

// gravação
const ap = await call(tAll, 'POST', '/api/connect/board/plan', { operations: ops, apply: true, confirm: true, digest: pv.json.digest });
ok('apply com digest da prévia grava', ap.status === 200 && ap.json.applied === true && ap.json.changed === 6, JSON.stringify(ap.json).slice(0, 300));
const saved = (await pool.query(`SELECT data, updated_at FROM personal_boards WHERE user_id=$1`, [U.master])).rows[0].data;
const cards = saved.boards[0].columns.flatMap((c) => c.cards.map((k) => ({ ...k, col: c.name })));
const k1 = cards.find((k) => k.id === 'k1');
ok('cartão movido, renomeado, com prazo, status, etiqueta e responsável cadastrado', k1.col === 'MAIARA' && k1.title.startsWith('[ROMANHA]') && k1.dueDate === '2026-11-09' && k1.status === 'em-andamento' && k1.tags.includes('romanha') && saved.boards[0].responsibles.some((r) => r.name === 'Maiara' && k1.responsibleIds.includes(r.id)));
ok('junção trouxe o passo do duplicado e mandou o original à Lixeira', k1.checklist.length === 2 && cards.find((k) => k.id === 'k2').deleted === true && cards.find((k) => k.id === 'k3').deleted === true);
ok('coluna nova criada na posição pedida', saved.boards[0].columns.map((c) => c.name).join('|') === 'TO_DO|MAIARA|AGUARDANDO');
ok('cartão novo da API, com ref e createdVia', cards.some((k) => k.apiRef === `clac-${RUN}` && k.createdVia === 'api' && k.col === 'MAIARA'));
ok('histórico do cartão registra a chave', /Organizado pela API \(chave "bptmp write_all"\)/.test(k1.history[0].action));
const ver = (await pool.query(`SELECT reason, data FROM personal_board_versions WHERE user_id=$1`, [U.master])).rows;
ok('cópia do quadro ANTES da mudança ficou em Versões', ver.length === 1 && /antes de organização via API/.test(ver[0].reason) && ver[0].data.boards[0].columns[0].cards.length === 3);
ok('gravação registrada em api_token_actions', (await pool.query(`SELECT count(*)::int AS n FROM api_token_actions WHERE user_id=$1 AND path LIKE '/api/connect/board/plan%'`, [U.master])).rows[0].n === 1);

// repetir é seguro e o quadro mudou
const again = await call(tAll, 'POST', '/api/connect/board/plan', { operations: ops });
ok('repetir o mesmo lote não duplica nada (cartão com ref e coluna já existem)', again.json.errors.length > 0 || again.json.changed < 6);
ok('digest antigo não vale depois que o quadro mudou → 409', (await call(tAll, 'POST', '/api/connect/board/plan', { operations: ops, apply: true, confirm: true, digest: pv.json.digest })).status === 409);

// o painel (cookie) com a versão antiga é recusado e não apaga a organização
const stale = await call(cookie, 'PATCH', '/api/personal-board', { board: seed, mergeable: true, baseUpdatedAt: before.updated_at.toISOString() });
ok('o painel com versão antiga recebe 409 (não sobrescreve a organização)', stale.status === 409, JSON.stringify(stale.json).slice(0, 120));
const stillOrg = (await pool.query(`SELECT data FROM personal_boards WHERE user_id=$1`, [U.master])).rows[0].data;
ok('quadro continua organizado depois da tentativa antiga', stillOrg.boards[0].columns.some((c) => c.name === 'AGUARDANDO'));

await cleanup(); await pool.end();
if (failed) { console.log(`\n${failed} FALHA(S)`); process.exit(1); }
console.log('\ntodos os testes HTTP ok');
