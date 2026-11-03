// Teste HTTP das Tarefas no painel da Caixa (§150): cria UM cartão no quadro da própria pessoa, com trava, cópia de segurança e link
// para o e-mail; uma aba do quadro aberta com a versão antiga (PATCH com baseUpdatedAt velho, sem mergeable) NÃO apaga o cartão novo;
// quem não tem Gestão de Atividades leva 403. Contra servidor e Postgres LOCAIS, usuários temporários.
//   BASE=http://localhost:3001 DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/board-side-http.test.mjs
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';

const BASE = process.env.BASE || 'http://localhost:3001';
const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
const ORG = 'sandbox-edu';
const PASS = crypto.randomBytes(12).toString('base64url');
const RUN = crypto.randomBytes(3).toString('hex');
const U = { me: `oibs_me_${RUN}`, no: `oibs_no_${RUN}` };
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };
const pool = new pg.Pool({ connectionString: DB });
async function cleanup() {
  await pool.query(`DELETE FROM personal_board_versions WHERE user_id LIKE 'oibs_%'`);
  await pool.query(`DELETE FROM personal_card_events WHERE user_id LIKE 'oibs_%'`).catch(() => {});
  await pool.query(`DELETE FROM personal_boards WHERE user_id LIKE 'oibs_%'`);
  await pool.query(`DELETE FROM users WHERE id LIKE 'oibs_%'`);
}
await cleanup();
try {
  const hash = await bcrypt.hash(PASS, 10);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,personal_access) VALUES ($1,$1,$2,'Teste Painel','pricetax',$3,true)`, [U.me, hash, ORG]);
  await pool.query(`INSERT INTO users (id,username,password_hash,name,role,org_id,personal_access) VALUES ($1,$1,$2,'Sem quadro','pricetax',$3,false)`, [U.no, hash, ORG]);
  const login = async (u) => { const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: PASS }) }); return (r.headers.get('set-cookie') || '').split(';')[0]; };
  const call = async (ck, method, path, body) => { const r = await fetch(`${BASE}${path}`, { method, headers: { Cookie: ck, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); let json = null; try { json = await r.json(); } catch { /* sem corpo */ } return { status: r.status, json }; };
  const me = await login(U.me); const no = await login(U.no);
  ok('login', !!me && !!no);

  // A tela abre o quadro (cria o quadro padrão) e guarda o carimbo — é a "aba antiga".
  const tab = await call(me, 'GET', '/api/personal-board');
  ok('quadro abre', tab.status === 200 && tab.json.board && tab.json.board.boards.length >= 1, tab.status);
  const oldBoard = tab.json.board; const oldStamp = tab.json.updatedAt;

  const side = await call(me, 'GET', '/api/board-side');
  ok('painel lê páginas e colunas', side.status === 200 && side.json.pages[0].columns.length >= 1 && Array.isArray(side.json.due), side.json);
  const col = side.json.pages[0].columns[1] || side.json.pages[0].columns[0];

  const mk = await call(me, 'POST', '/api/board-side/cards', { title: 'Responder o Felipe', note: 'Confirmar presença', dueDate: '2026-11-03', pageId: side.json.pages[0].id, columnId: col.id, threadId: '19a4b2c3d4e5', subject: 'Convite: Everton / Felipe', from: { name: 'Felipe', email: 'felipe@pricetax.com.br' } });
  ok('cria o cartão (201) na coluna escolhida', mk.status === 201 && mk.json.card.column === col.name, mk);
  const db1 = (await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [U.me])).rows[0].data;
  const card = db1.boards[0].columns.find((c) => c.id === col.id).cards.find((k) => k.title === 'Responder o Felipe');
  ok('cartão com prazo, link do e-mail e histórico', card && card.dueDate === '2026-11-03' && /href="http:\/\/localhost:3001\/email#conversa=19a4b2c3d4e5"/.test(card.desc) && card.descFormat === 'html' && card.mailThreadId === '19a4b2c3d4e5' && /e-mail/.test(card.history[0].action), card);
  ok('cópia de segurança antes de gravar', (await pool.query('SELECT count(*)::int n FROM personal_board_versions WHERE user_id=$1', [U.me])).rows[0].n >= 1);

  // Aba antiga grava o quadro inteiro (sem saber do cartão novo): o cartão NÃO pode sumir.
  const stale = await call(me, 'PATCH', '/api/personal-board', { board: oldBoard, baseUpdatedAt: oldStamp });
  const db2 = (await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [U.me])).rows[0].data;
  const still = db2.boards.some((b) => b.columns.some((c) => c.cards.some((k) => k.id === card.id)));
  ok('aba antiga do quadro gravando por cima NÃO apaga o cartão do e-mail', stale.status === 200 && still, stale.status);

  const due = await call(me, 'GET', '/api/board-side');
  ok('aparece em "Hoje e atrasadas" quando vence hoje ou antes', due.json.due.some((t) => t.id === card.id) === (due.json.today >= '2026-11-03'));
  ok('sem título dá 400', (await call(me, 'POST', '/api/board-side/cards', { title: '  ' })).status === 400);
  ok('prazo inválido dá 400', (await call(me, 'POST', '/api/board-side/cards', { title: 'x', dueDate: '2026-02-31' })).status === 400);
  ok('conversa com id estranho dá 400', (await call(me, 'POST', '/api/board-side/cards', { title: 'x', threadId: '../../x' })).status === 400);
  ok('sem Gestão de Atividades: 403 para ler e para criar', (await call(no, 'GET', '/api/board-side')).status === 403 && (await call(no, 'POST', '/api/board-side/cards', { title: 'x' })).status === 403);
  ok('sem login: 401', (await fetch(`${BASE}/api/board-side`)).status === 401);
} finally {
  await cleanup();
  await pool.end();
}
console.log(failed ? `\n${failed} falha(s).` : '\nTarefas do painel do e-mail: tudo certo.');
process.exit(failed ? 1 : 0);
