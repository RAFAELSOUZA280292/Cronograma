// Teste descartável (HTTP real, Postgres local) do "Voltar ao quadro anterior" da página pública (2026-10-27, §120). Restaura o quadro ao final.
import assert from 'node:assert/strict';
const URL = process.env.BASE || 'http://localhost:3001';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const strongTok = () => [...Array(48)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''); // o servidor só aceita token NOVO de 48 hex (A9)
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
function session() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(URL + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let data = null; try { data = await r.json(); } catch { /* */ }
    return { status: r.status, data };
  };
}
const owner = session(); const guest = session(); const anon = session();
await owner('POST', '/api/auth/login', { username: 'sbx_admin', password: 'sbx-local-pass' });
await guest('POST', '/api/auth/login', { username: 'sbx_eduarda', password: 'sbx-local-pass' });
const initial = (await owner('GET', '/api/personal-board')).data; const backup = clone(initial.board);
const page = (name, extra = {}) => ({ id: uid('board'), name, visibility: 'private', shareToken: '', log: [], columns: [{ id: uid('col'), name: 'A fazer', cards: [] }], ...extra });
const save = async (board) => { const cur = (await owner('GET', '/api/personal-board')).data; return owner('PATCH', '/api/personal-board', { board, baseUpdatedAt: cur.updatedAt, mergeable: true }); };
try {
  const B = page('Daily anterior'); const A = page('Amanda', { visibility: 'public', shareToken: strongTok(), backBoardId: B.id });
  let r = await save({ ...initial.board, boards: [B, A] }); ok(r.status === 200, 'semente');
  // 1) destino privado: nunca é exposto
  let g = await anon('GET', `/api/public-board/${A.shareToken}`);
  ok(g.status === 200 && g.data.back === null, 'destino PRIVADO → sem botão de voltar (não vaza página privada)');
  // 2) destino público: aparece com token e nome
  B.visibility = 'public'; B.shareToken = strongTok(); await save({ ...initial.board, boards: [B, A] });
  g = await anon('GET', `/api/public-board/${A.shareToken}`);
  ok(g.data.back && g.data.back.token === B.shareToken && g.data.back.name === 'Daily anterior', 'destino público → back com token e nome');
  ok(g.data.canEdit === false, 'anônimo só lê');
  // 3) o destino abre normalmente e não tem "voltar"
  const gb = await anon('GET', `/api/public-board/${B.shareToken}`); ok(gb.status === 200 && gb.data.back === null, 'quadro de destino abre e não tem voltar');
  // 4) apontar para si mesmo ou para página que não existe → null
  const A2 = { ...A, backBoardId: A.id }; await save({ ...initial.board, boards: [B, A2] });
  ok((await anon('GET', `/api/public-board/${A.shareToken}`)).data.back === null, 'apontar para si mesmo → null');
  const A3 = { ...A, backBoardId: 'board_que_nao_existe' }; await save({ ...initial.board, boards: [B, A3] });
  ok((await anon('GET', `/api/public-board/${A.shareToken}`)).data.back === null, 'destino apagado → null (sem erro)');
  await save({ ...initial.board, boards: [B, A] });
  // 5) convidado logado edita pelo link: NÃO consegue mudar nem remover o botão de voltar
  g = await guest('GET', `/api/public-board/${A.shareToken}`); ok(g.data.canEdit === true && g.data.back, 'convidado logado edita e vê o voltar');
  let edited = clone(g.data.board); edited.backBoardId = 'outro'; edited.columns[0].cards.push({ id: uid('card'), title: 'do convidado', checklist: [], tags: [], history: [] });
  r = await guest('PATCH', `/api/public-board/${A.shareToken}`, { board: edited, baseUpdatedAt: g.data.updatedAt, mergeable: true }); ok(r.status === 200, 'convidado grava');
  let after = (await owner('GET', '/api/personal-board')).data.board.boards.find((b) => b.id === A.id);
  ok(after.backBoardId === B.id && after.columns[0].cards.some((c) => c.title === 'do convidado'), 'cartão do convidado gravado e botão de voltar INTACTO');
  g = await guest('GET', `/api/public-board/${A.shareToken}`); delete (edited = clone(g.data.board)).backBoardId;
  r = await guest('PATCH', `/api/public-board/${A.shareToken}`, { board: edited, baseUpdatedAt: g.data.updatedAt, mergeable: true });
  after = (await owner('GET', '/api/personal-board')).data.board.boards.find((b) => b.id === A.id); ok(after.backBoardId === B.id, 'convidado não consegue remover o voltar');
  // 6) dono remove o voltar (somente ele)
  const A4 = clone(after); delete A4.backBoardId; await save({ ...initial.board, boards: [B, A4] });
  ok((await anon('GET', `/api/public-board/${A.shareToken}`)).data.back === null, 'dono remove → some');
  // 7) destino volta a ser privado → botão some
  await save({ ...initial.board, boards: [B, { ...A, backBoardId: B.id }] }); const Bp = { ...B, visibility: 'private' }; await save({ ...initial.board, boards: [Bp, { ...A, backBoardId: B.id }] });
  ok((await anon('GET', `/api/public-board/${A.shareToken}`)).data.back === null, 'destino volta a privado → botão some');
  console.log(`board-back-http: ${n} checagens OK`);
} finally {
  const cur = (await owner('GET', '/api/personal-board')).data; await owner('PATCH', '/api/personal-board', { board: backup, baseUpdatedAt: cur.updatedAt, mergeable: true });
}
