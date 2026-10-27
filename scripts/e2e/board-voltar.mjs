// E2E (descartável) do "Voltar ao quadro anterior" no quadro público: dono escolhe o voltar no Compartilhar, copia o link, anônimo e convidada logada abrem e voltam. Mesmos pré-requisitos de crm-drag-cenarios.mjs (playwright-core fora do projeto).
import { chromium } from 'playwright-core';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://localhost:5173'; const SH = process.env.SHOTS || '/tmp';
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const login = async (ctx, user) => { const p = await ctx.newPage(); await p.goto(BASE + '/'); await p.evaluate(async (u) => { await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: 'sbx-local-pass' }) }); }, user); return p; };
const out = [];
// ---- dono
const octx = await browser.newContext({ viewport: { width: 1366, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
const op = await login(octx, 'sbx_admin');
const backup = await op.evaluate(async () => (await (await fetch('/api/personal-board', { credentials: 'include' })).json()).board);
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);
const mk = (name) => ({ id: uid('board'), name, visibility: 'private', shareToken: '', log: [], viewPrefs: { view: 'kanban', sortMode: 'manual' }, columns: [{ id: uid('col'), name: 'A fazer', color: '', hideCompleted: false, cards: [{ id: uid('card'), title: 'Tarefa de ' + name, desc: '', status: 'nao-iniciada', priority: '', dueDate: '', tags: [], checklist: [], completed: false, comments: [], history: [], deleted: false, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }] });
try {
  await op.evaluate(async ({ b }) => { const g = await (await fetch('/api/personal-board', { credentials: 'include' })).json(); await fetch('/api/personal-board', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: { ...g.board, boards: b }, baseUpdatedAt: g.updatedAt, mergeable: true }) }); }, { b: [mk('Quadro anterior'), mk('Amanda')] });
  await op.goto(BASE + '/gestao-atividades'); await op.waitForSelector('input[value="Amanda"]');
  await op.locator('input[value="Amanda"]').click();
  await op.getByRole('button', { name: /Compartilhar/ }).first().click();
  await op.getByText('Público por link — qualquer pessoa').click();
  await op.waitForSelector('#board-back-select');
  const opts = await op.locator('#board-back-select option').allInnerTexts();
  out.push({ passo: 'modal mostra as opções de voltar', opcoes: opts });
  await op.locator('#board-back-select').selectOption({ label: 'Quadro anterior — passa a ser público' });
  await op.waitForTimeout(800);
  await op.screenshot({ path: SH + '/1-modal.png' });
  const link = await op.locator('input[readonly]').inputValue();
  await op.keyboard.press('Escape'); await op.waitForTimeout(300);
  const apiPages = await op.evaluate(async () => (await (await fetch('/api/personal-board', { credentials: 'include' })).json()).board.boards.map((b) => ({ n: b.name, v: b.visibility, tok: !!b.shareToken, back: b.backBoardId ? 'sim' : '' })));
  out.push({ passo: 'depois de escolher', paginas: apiPages, link });
  // botão Copiar link de um clique
  await op.getByRole('button', { name: /Copiar link/ }).first().click(); await op.waitForTimeout(400);
  out.push({ passo: 'Copiar link (1 clique)', clipboard: await op.evaluate(() => navigator.clipboard.readText()) });
  // ---- visitante anônimo
  const actx = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const ap = await actx.newPage();
  await ap.goto(link); await ap.waitForSelector('text=Voltar para Quadro anterior');
  const anonBefore = { tarefaVisivel: await ap.getByText('Tarefa de Amanda').count() > 0, voltar: await ap.getByText('Voltar para Quadro anterior').count() > 0, somenteLeitura: await ap.getByText(/Somente visualização/).count() > 0 };
  await ap.screenshot({ path: SH + '/2-publico-amanda.png' });
  await ap.getByText('Voltar para Quadro anterior').click(); await ap.waitForSelector('text=Tarefa de Quadro anterior');
  out.push({ passo: 'anônimo abre o link e volta', naPaginaDaAmanda: anonBefore, depoisDeVoltar: { url: ap.url().replace(BASE, ''), tarefaDoAnterior: await ap.getByText('Tarefa de Quadro anterior').count() > 0, temVoltarAqui: await ap.getByText(/Voltar para/).count() > 0 } });
  await ap.screenshot({ path: SH + '/3-publico-anterior.png' }); await actx.close();
  // ---- convidada logada (Eduarda) — pode colaborar e também volta
  const gctx = await browser.newContext({ viewport: { width: 1366, height: 800 } }); const gp = await login(gctx, 'sbx_eduarda');
  await gp.goto(link); await gp.waitForSelector('text=Voltar para Quadro anterior');
  out.push({ passo: 'convidada logada', voltar: true, adicionarAoMeuQuadro: await gp.getByText(/Adicionar ao meu quadro|Abrir no meu quadro/).count() > 0, podeCriar: await gp.getByText('Nova atividade').count() > 0 });
  await gctx.close();
  // ---- remover o voltar
  await op.getByRole('button', { name: /Público por link/ }).first().click(); await op.waitForSelector('#board-back-select');
  await op.locator('#board-back-select').selectOption({ label: 'Nenhum quadro (sem botão de voltar)' }); await op.waitForTimeout(800); await op.keyboard.press('Escape');
  const actx2 = await browser.newContext(); const ap2 = await actx2.newPage(); await ap2.goto(link); await ap2.waitForSelector('text=Tarefa de Amanda');
  out.push({ passo: 'dono remove o voltar', botaoVoltar: await ap2.getByText(/Voltar para/).count() }); await actx2.close();
} finally {
  await op.evaluate(async ({ b }) => { const g = await (await fetch('/api/personal-board', { credentials: 'include' })).json(); await fetch('/api/personal-board', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ board: b, baseUpdatedAt: g.updatedAt, mergeable: true }) }); }, { b: backup });
}
for (const o of out) console.log(JSON.stringify(o));
await browser.close();
