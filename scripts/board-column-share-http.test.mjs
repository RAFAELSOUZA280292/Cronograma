// Teste descartável (HTTP real, Postgres local) do link público de UMA COLUNA (2026-10-27, §121). Restaura o quadro ao final.
import assert from 'node:assert/strict';
const URL = process.env.BASE || 'http://localhost:3001';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
function session() { let cookie = ''; return async (method, path, body) => { const r = await fetch(URL + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; let data = null; try { data = await r.json(); } catch { /* */ } return { status: r.status, data }; }; }
const owner = session(); const guest = session(); const anon = session();
await owner('POST', '/api/auth/login', { username: 'sbx_admin', password: 'sbx-local-pass' });
await guest('POST', '/api/auth/login', { username: 'sbx_eduarda', password: 'sbx-local-pass' });
const initial = (await owner('GET', '/api/personal-board')).data; const backup = clone(initial.board);
const card = (title, extra = {}) => ({ id: uid('card'), title, desc: '', status: 'nao-iniciada', checklist: [], tags: [], history: [], deleted: false, ...extra });
const col = (name, cards, extra = {}) => ({ id: uid('col'), name, cards, ...extra });
const save = async (b) => { const cur = (await owner('GET', '/api/personal-board')).data; return owner('PATCH', '/api/personal-board', { board: b, baseUpdatedAt: cur.updatedAt, mergeable: true }); };
const getOwn = async () => (await owner('GET', '/api/personal-board')).data.board;
try {
  const cRafael = col('Rafael', [card('SEGREDO do Rafael')]);
  const cAmanda = col('Amanda', [card('Garcia Monteiro'), card('Simepar')], { visibility: 'public', shareToken: 'tok_col_' + uid('t') });
  const cOutra = col('Outra pessoa', [card('Confidencial da Outra')], { visibility: 'private' });
  const fixLog = (l) => l.map((e) => (e.col === 'COL_AMANDA' ? { ...e, col: cAmanda.id } : e.col === 'COL_RAFAEL' ? { ...e, col: cRafael.id } : e));
  const page = { id: uid('board'), name: 'OPERAÇÕES', visibility: 'private', shareToken: '', log: [{ ts: '2026-10-01T10:00:00Z', action: 'log antigo do dono', user: 'Rafael' }, { ts: '2026-10-02T10:00:00Z', action: 'Tarefa criada: "Garcia Monteiro"', user: 'Rafael', col: 'COL_AMANDA' }, { ts: '2026-10-03T10:00:00Z', action: 'HISTORICO SECRETO DA COLUNA RAFAEL', user: 'Rafael', col: 'COL_RAFAEL' }], viewPrefs: { view: 'kanban', sortMode: 'manual' }, columns: [cRafael, cAmanda, cOutra] };
  page.log = fixLog(page.log);
  const other = { id: uid('board'), name: 'Daily', visibility: 'private', shareToken: '', log: [], columns: [col('Daily', [card('x')])] };
  let r = await save({ ...initial.board, boards: [page, other] }); ok(r.status === 200, 'semente');
  const T = cAmanda.shareToken;
  // 1) só a coluna sai; nada do resto
  let g = await anon('GET', `/api/public-board/${T}`);
  const raw = JSON.stringify(g.data);
  ok(g.status === 200 && g.data.board.columns.length === 1 && g.data.board.columns[0].name === 'Amanda' && g.data.board.name === 'Amanda' && g.data.board.kind === 'column', 'link da coluna devolve só a coluna');
  ok(!raw.includes('SEGREDO') && !raw.includes('Confidencial') && !raw.includes('log antigo') && !raw.includes('Daily') && !raw.includes('HISTORICO SECRETO'), 'nenhum dado de outras colunas/páginas/log vaza');
  ok(g.data.board.log.length === 1 && g.data.board.log[0].action.includes('Garcia Monteiro'), 'o histórico da PRÓPRIA coluna aparece (e só ele)');
  ok(g.data.canEdit === false && g.data.back === null, 'anônimo só lê; sem voltar por enquanto');
  // 2) coluna privada ou sem link → 404
  const cPriv = { ...cAmanda, visibility: 'private' }; await save({ ...initial.board, boards: [{ ...page, columns: [cRafael, cPriv, cOutra] }, other] });
  ok((await anon('GET', `/api/public-board/${T}`)).status === 404, 'coluna privada → 404');
  await save({ ...initial.board, boards: [page, other] });
  // 3) voltar: página pública / coluna pública / destino privado → nulo
  const withBack = (ref) => save({ ...initial.board, boards: [{ ...page, columns: [cRafael, { ...cAmanda, backTo: ref }, cOutra] }, other] });
  await withBack('p:' + other.id); ok((await anon('GET', `/api/public-board/${T}`)).data.back === null, 'voltar → página PRIVADA: nulo');
  const otherPub = { ...other, visibility: 'public', shareToken: 'tok_p_' + uid('t') };
  await save({ ...initial.board, boards: [{ ...page, columns: [cRafael, { ...cAmanda, backTo: 'p:' + other.id }, cOutra] }, otherPub] });
  let b = (await anon('GET', `/api/public-board/${T}`)).data.back; ok(b && b.token === otherPub.shareToken && b.name === 'Daily', 'voltar → página pública');
  const cOutraPub = { ...cOutra, visibility: 'public', shareToken: 'tok_c2_' + uid('t') };
  await save({ ...initial.board, boards: [{ ...page, columns: [cRafael, { ...cAmanda, backTo: 'c:' + cOutra.id }, cOutraPub] }, otherPub] });
  b = (await anon('GET', `/api/public-board/${T}`)).data.back; ok(b && b.token === cOutraPub.shareToken && b.name === 'Outra pessoa', 'voltar → coluna pública');
  await save({ ...initial.board, boards: [{ ...page, columns: [cRafael, { ...cAmanda, backTo: 'c:' + cAmanda.id }, cOutra] }, otherPub] });
  ok((await anon('GET', `/api/public-board/${T}`)).data.back === null, 'voltar para si mesma: nulo');
  await save({ ...initial.board, boards: [{ ...page, columns: [cRafael, { ...cAmanda, backTo: 'p:' + other.id }, cOutra] }, otherPub] });
  // 4) convidada logada edita: só os cartões da coluna mudam
  g = await guest('GET', `/api/public-board/${T}`); ok(g.data.canEdit === true && g.data.back, 'convidada logada pode editar e vê o voltar');
  const edited = clone(g.data.board); edited.columns[0].cards[0].title = 'Garcia Monteiro (editado pela Amanda)'; const novo = card('Nova da Amanda'); edited.columns[0].cards.push(novo);
  edited.log = [{ ts: '2026-10-27T15:00:00Z', action: 'Tarefa criada: "Nova da Amanda"', user: 'Eduarda' }];
  r = await guest('PATCH', `/api/public-board/${T}`, { board: edited, baseUpdatedAt: g.data.updatedAt, mergeable: true });
  ok(r.status === 200 && r.data.board.columns.length === 1, 'convidada grava');
  let own = await getOwn(); let pg = own.boards.find((x) => x.id === page.id);
  ok(pg.columns.map((c) => c.name).join() === 'Rafael,Amanda,Outra pessoa' && pg.columns[0].cards.length === 1 && pg.columns[2].cards.length === 1, 'as outras colunas ficaram intactas');
  ok(pg.columns[1].cards.map((k) => k.title).join() === 'Garcia Monteiro (editado pela Amanda),Simepar,Nova da Amanda', 'cartões da coluna atualizados');
  ok(pg.log[0].action.includes('Nova da Amanda') && pg.log.some((e) => e.action === 'log antigo do dono'), 'histórico da página recebe só a entrada nova e preserva o antigo');
  ok(pg.log[0].col === cAmanda.id && pg.log[0].user === 'Eduarda Costa', 'entrada carimbada com a coluna e com o NOME DA SESSÃO (o navegador disse "Eduarda")');
  const spoof = clone((await guest('GET', `/api/public-board/${T}`)).data); const sp = clone(spoof.board); sp.log = [...sp.log, { ts: '2026-10-27T16:00:00Z', action: 'Fingindo ser o Rafael', user: 'Rafael Souza' }];
  await guest('PATCH', `/api/public-board/${T}`, { board: sp, baseUpdatedAt: spoof.updatedAt, mergeable: true });
  pg = (await getOwn()).boards.find((x) => x.id === page.id); const fe = pg.log.find((e) => e.action === 'Fingindo ser o Rafael');
  ok(fe && fe.user === 'Eduarda Costa' && fe.col === cAmanda.id, 'quem escreveu é sempre o usuário da sessão — não dá para assinar como outra pessoa');
  const vv = (await anon('GET', `/api/public-board/${T}`)).data.board.log; ok(vv.some((e) => e.action.includes('Nova da Amanda')) && vv.length === 3, 'o histórico da coluna é o mesmo para quem abre depois (dono + colaboradora)');
  // repetir o mesmo log não duplica
  g = await guest('GET', `/api/public-board/${T}`); const again = clone(g.data.board); again.log = edited.log;
  await guest('PATCH', `/api/public-board/${T}`, { board: again, baseUpdatedAt: g.data.updatedAt, mergeable: true });
  own = await getOwn(); pg = own.boards.find((x) => x.id === page.id); ok(pg.log.filter((e) => e.action.includes('Nova da Amanda')).length === 1, 'entrada de histórico repetida não duplica');
  // 5) abusos
  g = await guest('GET', `/api/public-board/${T}`);
  const evil1 = clone(g.data.board); evil1.columns.push(col('Invasora', [card('x')]));
  r = await guest('PATCH', `/api/public-board/${T}`, { board: evil1, baseUpdatedAt: g.data.updatedAt, mergeable: true }); ok(r.status === 400, 'mandar uma 2ª coluna → 400');
  const evil2 = clone(g.data.board); evil2.columns[0].id = cRafael.id;
  r = await guest('PATCH', `/api/public-board/${T}`, { board: evil2, baseUpdatedAt: g.data.updatedAt, mergeable: true }); ok(r.status === 400, 'trocar o id da coluna (tentar escrever na do Rafael) → 400');
  const evil3 = clone(g.data.board); evil3.id = other.id;
  r = await guest('PATCH', `/api/public-board/${T}`, { board: evil3, baseUpdatedAt: g.data.updatedAt, mergeable: true }); ok(r.status === 400, 'id de página diferente → 400');
  const evil4 = clone(g.data.board); Object.assign(evil4.columns[0], { name: 'HACKEADA', shareToken: 'tok_hack', visibility: 'private', backTo: 'p:nada', color: 'red' }); evil4.columns[0].cards.push({ ...card('clone do segredo'), id: cRafael.cards[0].id }); evil4.columns[0].cards.push({ ...card('dup'), id: novo.id });
  r = await guest('PATCH', `/api/public-board/${T}`, { board: evil4, baseUpdatedAt: g.data.updatedAt, mergeable: true }); ok(r.status === 200, 'campos de estrutura são ignorados (200)');
  own = await getOwn(); pg = own.boards.find((x) => x.id === page.id); const ca = pg.columns[1];
  ok(ca.name === 'Amanda' && ca.shareToken === T && ca.visibility === 'public' && ca.backTo === 'p:' + other.id && !ca.color, 'nome, link, visibilidade, voltar e cor intocados');
  ok(pg.columns[0].cards.length === 1 && pg.columns[0].cards[0].title === 'SEGREDO do Rafael', 'cartão com id de outra coluna NÃO sobrescreve nem duplica');
  ok(ca.cards.filter((k) => k.id === novo.id).length === 1, 'id repetido dentro da coluna é descartado');
  // 6) conflito: convidada com versão antiga recebe 409 com a coluna virtual
  const stale = (await guest('GET', `/api/public-board/${T}`)).data;
  const mine = await getOwn(); const mp = mine.boards.find((x) => x.id === page.id); mp.columns[0].cards.push(card('dono mexeu')); await save({ ...mine });
  const e2 = clone(stale.board); e2.columns[0].cards.push(card('da convidada, versão antiga'));
  r = await guest('PATCH', `/api/public-board/${T}`, { board: e2, baseUpdatedAt: stale.updatedAt, mergeable: true });
  ok(r.status === 409 && r.data.board.columns.length === 1 && !JSON.stringify(r.data).includes('dono mexeu'), '409 devolve só a coluna (sem vazar o resto)');
  // 7) coluna duplicada pela tela não herda link — (regra do cliente); servidor: token repetido pega o primeiro, nunca o resto
  // 8) página inteira pública continua funcionando como antes
  const pubPage = { ...page, visibility: 'public', shareToken: 'tok_page_' + uid('t') }; await save({ ...initial.board, boards: [pubPage, otherPub] });
  g = await anon('GET', `/api/public-board/${pubPage.shareToken}`); ok(g.status === 200 && g.data.board.columns.length === 3 && !g.data.board.kind, 'link de página inteira segue entregando a página toda');
  console.log(`board-column-share-http: ${n} checagens OK`);
} finally {
  const cur = (await owner('GET', '/api/personal-board')).data; await owner('PATCH', '/api/personal-board', { board: backup, baseUpdatedAt: cur.updatedAt, mergeable: true });
}
