// Teste descartável (HTTP real, Postgres local) do "fantasma" do quadro pessoal (2026-10-27, §117): duas abas do mesmo usuário.
// Uso: servidor local no :3001 com o usuário sbx_admin. Restaura o quadro ao final.
import assert from 'node:assert/strict';
import { mergeBoards, mergePage } from '../src/personal/boardMerge.js';

const URL = process.env.BASE || 'http://localhost:3001';
let cookie = '';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
async function call(method, path, body) {
  const r = await fetch(URL + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  let data = null; try { data = await r.json(); } catch { /* */ }
  return { status: r.status, data };
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const allCards = (board) => board.boards.flatMap((b) => b.columns.flatMap((c) => c.cards.map((k) => k.id)));

await call('POST', '/api/auth/login', { username: 'sbx_admin', password: 'sbx-local-pass' });
const initial = (await call('GET', '/api/personal-board')).data;
const backup = clone(initial.board);
try {
  // Estado de partida: duas páginas, como "Price Tags Clack" e "26 de outubro".
  const seed = clone(initial.board);
  seed.boards = [
    { id: uid('board'), name: 'Price Tags Clack', visibility: 'private', shareToken: '', log: [], columns: [{ id: uid('col'), name: 'A fazer', cards: [] }] },
    { id: uid('board'), name: '26 de outubro', visibility: 'public', shareToken: 'tok_' + uid('t'), log: [], columns: [{ id: uid('col'), name: 'A fazer', cards: [] }] },
  ];
  let r = await call('PATCH', '/api/personal-board', { board: seed });
  ok(r.status === 200, 'semente gravada');
  let base = clone(seed); let baseVersion = r.data.updatedAt;
  const card = (id, title) => ({ id, title, desc: '', status: 'nao-iniciada', checklist: [], tags: [], history: [], deleted: false });

  // ---- A) O fantasma, como era (painel antigo, sem `mergeable`): a aba desatualizada apaga o que a outra acabou de gravar.
  const tab2 = clone(base); tab2.boards[1].columns[0].cards.push(card('nova', 'Tarefa nova'));
  r = await call('PATCH', '/api/personal-board', { board: tab2, baseUpdatedAt: baseVersion });
  ok(r.status === 200, 'aba 2 grava');
  const tab1 = clone(base); tab1.boards[0].columns[0].cards.push(card('na-aba-1', 'Editado na aba 1'));
  r = await call('PATCH', '/api/personal-board', { board: tab1, baseUpdatedAt: baseVersion });
  ok(r.status === 200, 'painel antigo continua sendo aceito');
  let now = (await call('GET', '/api/personal-board')).data.board;
  ok(!allCards(now).includes('nova'), 'REPRODUZIDO: painel antigo apagou a tarefa da outra aba');

  // ---- B) Corrigido: mesma situação com o painel novo (`mergeable`).
  r = await call('PATCH', '/api/personal-board', { board: seed }); base = clone(seed); baseVersion = r.data.updatedAt;
  const t2 = clone(base); t2.boards[1].columns[0].cards.push(card('nova', 'Tarefa nova'));
  r = await call('PATCH', '/api/personal-board', { board: t2, baseUpdatedAt: baseVersion, mergeable: true });
  ok(r.status === 200 && r.data.updatedAt !== baseVersion, 'aba 2 grava com a versão certa');
  const t1 = clone(base); t1.boards[0].columns[0].cards.push(card('na-aba-1', 'Editado na aba 1'));
  r = await call('PATCH', '/api/personal-board', { board: t1, baseUpdatedAt: baseVersion, mergeable: true });
  ok(r.status === 409 && r.data.conflict && allCards(r.data.board).includes('nova'), 'aba desatualizada recebe 409 com o quadro atual, sem sobrescrever');
  now = (await call('GET', '/api/personal-board')).data.board;
  ok(allCards(now).includes('nova') && !allCards(now).includes('na-aba-1'), 'nada foi gravado no 409');
  const merged = mergeBoards(base, t1, r.data.board);
  r = await call('PATCH', '/api/personal-board', { board: merged, baseUpdatedAt: r.data.updatedAt, mergeable: true });
  ok(r.status === 200, 'reenvio fundido aceito');
  now = (await call('GET', '/api/personal-board')).data.board;
  ok(allCards(now).includes('nova') && allCards(now).includes('na-aba-1'), 'as duas tarefas existem depois da fusão');
  ok((await call('GET', '/api/personal-board/version')).data.updatedAt === r.data.updatedAt, 'versão consistente (comparação em milissegundos)');

  // ---- C) Mesma versão, sem conflito: grava normalmente.
  const same = clone(now); same.boards[0].columns[0].cards[0].title = 'editado';
  r = await call('PATCH', '/api/personal-board', { board: same, baseUpdatedAt: (await call('GET', '/api/personal-board')).data.updatedAt, mergeable: true });
  ok(r.status === 200, 'sem conflito grava');

  // ---- D) Quadro compartilhado (página pública): o dono grava no quadro dele; quem edita pelo link está desatualizado.
  const cur = (await call('GET', '/api/personal-board')).data;
  const page = cur.board.boards[1];
  const token = page.shareToken;
  const pub = (await call('GET', `/api/public-board/${token}`)).data;
  ok(pub.updatedAt === cur.updatedAt, 'GET público devolve a versão');
  const pubBase = clone(pub.board);
  const ownerSide = clone(cur.board); ownerSide.boards[1].columns[0].cards.push(card('do-dono', 'Do dono'));
  r = await call('PATCH', '/api/personal-board', { board: ownerSide, baseUpdatedAt: cur.updatedAt, mergeable: true });
  ok(r.status === 200, 'dono grava');
  const viaLink = clone(pubBase); viaLink.columns[0].cards.push(card('pelo-link', 'Pelo link'));
  r = await call('PATCH', `/api/public-board/${token}`, { board: viaLink, baseUpdatedAt: pub.updatedAt, mergeable: true });
  ok(r.status === 409 && r.data.board.columns[0].cards.some((k) => k.id === 'do-dono'), 'edição pelo link desatualizada recebe 409');
  const mp = mergePage(pubBase, viaLink, r.data.board);
  r = await call('PATCH', `/api/public-board/${token}`, { board: mp, baseUpdatedAt: r.data.updatedAt, mergeable: true });
  ok(r.status === 200 && r.data.updatedAt, 'reenvio fundido aceito (público)');
  now = (await call('GET', '/api/personal-board')).data.board;
  ok(allCards(now).includes('do-dono') && allCards(now).includes('pelo-link'), 'quadro do dono tem as duas');
  r = await call('PATCH', `/api/public-board/${token}`, { board: { ...mp, id: 'outro' }, mergeable: true });
  ok(r.status === 400, 'id de página diferente continua rejeitado');
  console.log(`board-conflict-http: ${n} checagens OK`);
} finally {
  const v = (await call('GET', '/api/personal-board')).data;
  await call('PATCH', '/api/personal-board', { board: backup });
  void v;
}
