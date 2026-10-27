// E2E (descartável) do link público de UMA COLUNA (§121): dono compartilha pelo menu da coluna, copia o link, anônimo e convidada logada abrem (veem só a coluna), voltar, criar atividade, duplicar coluna não herda o link. Mesmos pré-requisitos de crm-drag-cenarios.mjs.
import { chromium } from 'playwright-core';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://localhost:5173'; const SH = process.env.SHOTS || '/tmp';
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const login = async (ctx, user) => { const p = await ctx.newPage(); await p.goto(BASE + '/'); await p.evaluate(async (u) => { await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'sbx-local-pass' }) }); }, user); return p; };
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);
const card = (t) => ({ id: uid('card'), title: t, desc: '', status: 'nao-iniciada', priority: '', dueDate: '', tags: [], checklist: [], completed: false, comments: [], history: [], deleted: false, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const col = (name, cards) => ({ id: uid('col'), name, color: '', hideCompleted: false, cards });
const page = (name, cols) => ({ id: uid('board'), name, visibility: 'private', shareToken: '', log: [], viewPrefs: { view: 'kanban', sortMode: 'manual' }, columns: cols });
const out = [];
const octx = await browser.newContext({ viewport: { width: 1500, height: 850 }, permissions: ['clipboard-read', 'clipboard-write'] });
const op = await login(octx, 'sbx_admin');
const backup = await op.evaluate(async () => (await (await fetch('/api/personal-board', { credentials: 'include' })).json()).board);
const setBoard = (b) => op.evaluate(async ({ b }) => { const g = await (await fetch('/api/personal-board', { credentials: 'include' })).json(); await fetch('/api/personal-board', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: typeof b === 'function' ? b(g.board) : { ...g.board, boards: b }, baseUpdatedAt: g.updatedAt, mergeable: true }) }); }, { b });
const ownCols = () => op.evaluate(async () => (await (await fetch('/api/personal-board', { credentials: 'include' })).json()).board.boards.map((p) => ({ pagina: p.name, vis: p.visibility, colunas: p.columns.map((c) => `${c.name}[${c.visibility || '-'}${c.shareToken ? ',link' : ''}${c.backTo ? ',voltar' : ''}]:${c.cards.map((k) => k.title).join('|')}`) })));
const header = (p, name) => p.locator(`xpath=//input[@value="${name}"]/ancestor::div[.//button[@aria-label="Mais ações"]][1]`).first();
try {
  await setBoard([page('OPERAÇÕES', [col('Rafael', [card('SEGREDO do Rafael')]), col('Amanda', [card('GARCIA MONTEIRO'), card('SIMEPAR | estudar cases')]), col('Outra pessoa', [card('Confidencial da Outra')])]), page('Daily', [col('Daily', [card('Pauta da daily')])])]);
  await op.goto(BASE + '/gestao-atividades'); await op.waitForSelector('input[value="Amanda"]');
  // 1) menu da coluna → Compartilhar coluna
  await header(op, 'Amanda').getByRole('button', { name: 'Mais ações' }).click();
  await op.getByText('Compartilhar coluna', { exact: true }).click();
  await op.getByText('Público por link — qualquer pessoa').click();
  await op.waitForSelector('#board-back-select');
  const opcoes = await op.locator('#board-back-select option').allInnerTexts();
  await op.locator('#board-back-select').selectOption({ label: 'Página inteira: Daily (todas as colunas) — passa a ser público' }); await op.waitForTimeout(700);
  await op.screenshot({ path: SH + '/c1-modal-coluna.png' });
  const link = await op.locator('input[readonly]').inputValue(); await op.keyboard.press('Escape'); await op.waitForTimeout(300);
  out.push({ passo: 'dono compartilha a coluna Amanda', opcoesDoVoltar: opcoes, link, estado: await ownCols() });
  // 2) copiar link pelo menu
  await header(op, 'Amanda').getByRole('button', { name: 'Mais ações' }).click(); await op.getByText('Copiar link da coluna').click(); await op.waitForTimeout(300);
  out.push({ passo: 'Copiar link da coluna', clipboardIgualAoLink: (await op.evaluate(() => navigator.clipboard.readText())) === link });
  // 3) anônimo
  const actx = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const ap = await actx.newPage();
  await ap.goto(link); await ap.waitForSelector('text=GARCIA MONTEIRO');
  const txt = await ap.locator('body').innerText();
  out.push({ passo: 'anônimo abre o link da coluna', veAmanda: txt.includes('GARCIA MONTEIRO') && txt.includes('SIMEPAR'), veSegredoDoRafael: txt.includes('SEGREDO'), veOutra: txt.includes('Confidencial'), veDaily: txt.includes('Pauta da daily'), temNovaColuna: txt.includes('Nova coluna'), voltar: txt.includes('Voltar para Daily'), somenteLeitura: txt.includes('Somente visualização'), colunasNaTela: await ap.locator('input[value="Amanda"]').count() });
  await ap.screenshot({ path: SH + '/c2-publico-coluna.png' });
  await ap.getByText('Voltar para Daily').click(); await ap.waitForSelector('text=Pauta da daily');
  out.push({ passo: 'anônimo volta', url: ap.url().replace(BASE, ''), vePauta: true }); await actx.close();
  // 4) convidada logada cria atividade na coluna
  const gctx = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const gp = await login(gctx, 'sbx_eduarda');
  await gp.goto(link); await gp.waitForSelector('text=GARCIA MONTEIRO');
  const gtxt = await gp.locator('body').innerText();
  out.push({ passo: 'convidada logada', podeCriar: gtxt.includes('Nova atividade'), temNovaColuna: gtxt.includes('Nova coluna'), menuDoCabecalhoDaColuna: await gp.locator('xpath=//input[@value="Amanda"]/ancestor::div[.//button[@aria-label="Adicionar atividade em Amanda"]][1]').first().getByRole('button', { name: 'Mais ações' }).count(), nomeDaColunaEditavel: (await gp.locator('input[value="Amanda"]').first().getAttribute('readonly')) === null });
  await gp.getByText('Nova atividade').last().click(); await gp.locator('input[placeholder^="Digite o nome da atividade"]').fill('Atividade criada pela Amanda'); await gp.keyboard.press('Enter'); await gp.waitForTimeout(2000);
  const est = await ownCols(); out.push({ passo: 'a atividade da Amanda caiu na coluna dela no quadro do dono', operacoes: est[0].colunas });
  await gctx.close();
  // 5) duplicar a coluna não herda o link
  await op.reload(); await op.waitForSelector('input[value="Amanda"]');
  await header(op, 'Amanda').getByRole('button', { name: 'Mais ações' }).click(); await op.getByText('Duplicar coluna').click(); await op.waitForTimeout(1200);
  const est2 = await ownCols(); out.push({ passo: 'duplicar a coluna', colunas: est2[0].colunas.map((c) => c.split(':')[0]) });
} finally { await setBoard(() => backup).catch(() => {}); await op.evaluate(async ({ b }) => { const g = await (await fetch('/api/personal-board', { credentials: 'include' })).json(); await fetch('/api/personal-board', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: b, baseUpdatedAt: g.updatedAt, mergeable: true }) }); }, { b: backup }); }
for (const o of out) console.log(JSON.stringify(o));
await browser.close();
