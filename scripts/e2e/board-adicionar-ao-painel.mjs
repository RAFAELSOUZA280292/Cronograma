// E2E (descartável) de "adicionar o quadro compartilhado ao meu painel" (§122): funcionária abre o link da coluna, adiciona ao painel dela, dono e ela trabalham ao mesmo tempo (tempo até a outra tela ver), auditoria e desligar o compartilhamento. Mesmos pré-requisitos de crm-drag-cenarios.mjs.
import { chromium } from 'playwright-core';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://localhost:5173'; const SH = process.env.SHOTS || '/tmp';
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const login = async (ctx, user) => { const p = await ctx.newPage(); await p.goto(BASE + '/'); await p.evaluate(async (u) => { await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'sbx-local-pass' }) }); }, user); return p; };
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);
const card = (t) => ({ id: uid('card'), title: t, desc: '', status: 'nao-iniciada', priority: '', dueDate: '', tags: [], checklist: [], completed: false, comments: [], history: [], deleted: false, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const col = (name, cards, extra = {}) => ({ id: uid('col'), name, color: '', hideCompleted: false, cards, ...extra });
const getBoard = (p) => p.evaluate(async () => (await (await fetch('/api/personal-board', { credentials: 'include' })).json()).board);
const putBoard = (p, fn) => p.evaluate(async (src) => { const f = new Function('b', `return (${src})(b)`); const g = await (await fetch('/api/personal-board', { credentials: 'include' })).json(); await fetch('/api/personal-board', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: f(g.board), baseUpdatedAt: g.updatedAt, mergeable: true }) }); }, fn.toString());
const out = [];
const octx = await browser.newContext({ viewport: { width: 1500, height: 850 } }); const op = await login(octx, 'sbx_admin');
const gctx = await browser.newContext({ viewport: { width: 1500, height: 850 } }); const gp = await login(gctx, 'sbx_eduarda');
const ownerBackup = await getBoard(op); const guestBackup = await getBoard(gp);
const TOKEN = 'tok_col_' + uid('t'); const cAmanda = col('Amanda', [card('GARCIA MONTEIRO'), card('SIMEPAR')], { visibility: 'public', shareToken: TOKEN });
const cRafael = col('Rafael', [card('SEGREDO do Rafael')]);
const page = { id: uid('board'), name: 'OPERAÇÕES', visibility: 'private', shareToken: '', log: [], viewPrefs: { view: 'kanban', sortMode: 'manual' }, columns: [cRafael, cAmanda] };
const waitText = async (p, t, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await p.locator('body').innerText()).includes(t)) return Date.now() - t0; await p.waitForTimeout(500); } return null; };
const addCard = async (p, title, scope) => { await (scope || p).getByText('Nova atividade').last().click(); await p.locator('input[placeholder^="Digite o nome da atividade"]').fill(title); await p.keyboard.press('Enter'); };
const setOwner = (pg) => op.evaluate(async (pgJson) => { const g = await (await fetch('/api/personal-board', { credentials: 'include' })).json(); await fetch('/api/personal-board', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: { ...g.board, boards: [pgJson] }, baseUpdatedAt: g.updatedAt, mergeable: true }) }); }, pg);
const setGuest = (fn) => gp.evaluate(async (linked) => { const g = await (await fetch('/api/personal-board', { credentials: 'include' })).json(); await fetch('/api/personal-board', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: { ...g.board, linkedBoards: linked }, baseUpdatedAt: g.updatedAt, mergeable: true }) }); }, fn);
try {
  await setOwner(page); await setGuest([]);
  await op.goto(BASE + '/gestao-atividades'); await op.waitForSelector('input[value="Amanda"]');
  // 1) funcionária abre o link e adiciona ao painel dela
  await gp.goto(`${BASE}/quadro/${TOKEN}`); await gp.waitForSelector('text=GARCIA MONTEIRO');
  const botao = gp.getByRole('button', { name: /Adicionar ao meu quadro/ });
  out.push({ passo: 'funcionária abre o link da coluna', botaoAdicionar: await botao.count() });
  await botao.click(); await gp.waitForURL(BASE + '/'); await gp.waitForSelector('text=GARCIA MONTEIRO', { timeout: 20000 });
  const abas = await gp.locator('div[title^="Quadro compartilhado"]').allInnerTexts();
  const gb = await getBoard(gp);
  out.push({ passo: 'depois de adicionar', abasCompartilhadas: abas, linkedBoards: (gb.linkedBoards || []).map((l) => ({ name: l.name, owner: l.ownerName })), veSoAColuna: !(await gp.locator('body').innerText()).includes('SEGREDO'), noPainelDelaSemMenuDeEstrutura: (await gp.getByText('Nova coluna').count()) === 0 });
  await gp.screenshot({ path: SH + '/d1-painel-da-funcionaria.png' });
  // 2) ela cria uma atividade (no painel dela) → o dono vê no dele
  await addCard(gp, 'Atividade criada pela funcionária');
  const tDono = await waitText(op, 'Atividade criada pela funcionária', 40000);
  out.push({ passo: 'ela cria → dono vê no quadro dele (sem recarregar)', segundos: tDono === null ? null : Math.round(tDono / 100) / 10 });
  // 3) o dono cria uma → ela vê no painel dela
  await addCard(op, 'Atividade criada pelo dono');
  const tEla = await waitText(gp, 'Atividade criada pelo dono', 40000);
  out.push({ passo: 'dono cria → ela vê no painel dela (sem recarregar)', segundos: tEla === null ? null : Math.round(tEla / 100) / 10 });
  await gp.screenshot({ path: SH + '/d2-painel-da-funcionaria-depois.png' });
  // 4) auditoria
  await op.waitForTimeout(2500);
  const ob = await getBoard(op); const pg = ob.boards[0]; const amanda = pg.columns[1];
  out.push({ passo: 'auditoria', cartoesDaColuna: amanda.cartoes || amanda.cards.map((c) => c.title), historicoDaPagina: pg.log.slice(0, 6).map((e) => `${e.user} · ${e.action}${e.col === amanda.id ? ' [coluna Amanda]' : ''}`), historicoDosCartoes: amanda.cards.filter((c) => /funcionária|dono/.test(c.title)).map((c) => `${c.title}: ${(c.history || []).map((h) => h.user + ' — ' + h.action).join('; ')}`) });
  // 5) dono para de compartilhar → aviso na aba dela
  const cur = await getBoard(op); await setOwner({ ...cur.boards[0], columns: cur.boards[0].columns.map((c) => (c.id === amanda.id ? { ...c, visibility: 'private' } : c)) });
  await gp.reload(); await gp.waitForTimeout(2500); await gp.locator('div[title^="Quadro compartilhado"]').first().click(); await gp.waitForTimeout(2500); await gp.screenshot({ path: SH + '/d3-compartilhamento-desligado.png' });
  out.push({ passo: 'dono desliga o compartilhamento', avisoNaAbaDela: (await gp.locator('body').innerText()).includes('não está mais compartilhado') });
} finally {
  await op.evaluate(async (b) => { const g = await (await fetch('/api/personal-board', { credentials: 'include' })).json(); await fetch('/api/personal-board', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: b, baseUpdatedAt: g.updatedAt, mergeable: true }) }); }, ownerBackup);
  await gp.evaluate(async (b) => { const g = await (await fetch('/api/personal-board', { credentials: 'include' })).json(); await fetch('/api/personal-board', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: b, baseUpdatedAt: g.updatedAt, mergeable: true }) }); }, guestBackup);
}
for (const o of out) console.log(JSON.stringify(o));
await browser.close();
