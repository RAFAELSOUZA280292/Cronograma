// E2E (descartável) do arrastar negócio no CRM — arrasto NATIVO no Chromium real, como a Eduarda. NÃO é do projeto: precisa de `playwright-core` instalado
// numa pasta temporária (`npm i playwright-core@1.57.0`) e do Chromium do Playwright em ~/Library/Caches/ms-playwright. Copie este arquivo para lá e rode:
//   node crm-drag-cenarios.mjs   (servidor local no :5173/:3001, sandbox-edu, usuário sbx_eduarda). Cenários: servidor 500, rede cai e volta, 404, Desfazer, 3 arrastos seguidos.
// Cenários de falha do arrastar no CRM, com arrasto nativo no Chromium real, como a Eduarda.
import { chromium } from 'playwright-core';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: EXE, headless: true });
async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.evaluate(async () => { await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'sbx_eduarda', password: 'sbx-local-pass' }) }); });
  await page.goto(BASE + '/crm'); await page.getByRole('button', { name: 'Negócios', exact: true }).first().click();
  await page.waitForSelector('.crm-board'); await page.waitForTimeout(2000);
  return { ctx, page };
}
const colOf = (page) => (n) => page.locator('.crm-col').filter({ has: page.locator('.crm-col-title', { hasText: n }) }).first();
async function drag(page, col, from, to) {
  const card = col(from).locator('.crm-deal').first(); const title = await card.locator('.crm-deal-title').innerText();
  const a = await card.boundingBox(); const b = await col(to).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + 20); await page.mouse.down(); await page.mouse.move(a.x + a.width / 2 + 8, a.y + 28, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + 100, { steps: 12 }); await page.mouse.up();
  return title;
}
const exact = (t) => new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const has = async (col, name, title) => (await col(name).locator('.crm-deal-title').filter({ hasText: exact(title) }).count()) > 0;
const toasts = (page) => page.locator('.ui-toast').allInnerTexts().then((a) => a.map((t) => t.replace(/\s+/g, ' ').trim()));
const serverStage = async (page, title) => page.evaluate(async (t) => { const r = await (await fetch('/api/crm/deals?q=' + encodeURIComponent(t) + '&status=open&limit=20', { credentials: 'include' })).json(); const d = r.items.find((x) => x.title === t); return d ? d.stageName : null; }, title);
const res = [];
// A) servidor devolve 500 em todas as tentativas → volta ao lugar, com mensagem, e NADA gravado
{ const { ctx, page } = await fresh(); const col = colOf(page); let hits = 0;
  await page.route('**/api/crm/deals/*/move', (r) => { hits++; r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Erro simulado do servidor.' }) }); });
  const title = await drag(page, col, 'Leads', 'Conexão'); await page.waitForTimeout(600);
  const logoApos = await has(col, 'Conexão', title);
  await page.waitForTimeout(9500);
  res.push({ cenario: 'A) servidor 500 sempre', apareceuLogo: logoApos, voltouParaLeads: await has(col, 'Leads', title), aindaEmConexao: await has(col, 'Conexão', title), tentativas: hits, servidor: await serverStage(page, title), avisos: await toasts(page) }); await ctx.close(); }
// B) rede cai na 1ª tentativa e volta na 2ª → fica, grava UMA vez
{ const { ctx, page } = await fresh(); const col = colOf(page); let hits = 0; let ok = 0;
  await page.route('**/api/crm/deals/*/move', (r) => { hits++; if (hits === 1) r.abort('connectionfailed'); else { ok++; r.continue(); } });
  const title = await drag(page, col, 'Leads', 'Conexão'); await page.waitForTimeout(600); const logo = await has(col, 'Conexão', title);
  await page.waitForTimeout(4500);
  res.push({ cenario: 'B) rede cai 1x e volta', apareceuLogo: logo, noFim: await has(col, 'Conexão', title), tentativas: hits, gravacoes: ok, servidor: await serverStage(page, title), avisos: await toasts(page) }); await ctx.close(); }
// C) erro de regra (404 etapa) → sem repetir, volta e avisa
{ const { ctx, page } = await fresh(); const col = colOf(page); let hits = 0;
  await page.route('**/api/crm/deals/*/move', (r) => { hits++; r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Etapa não encontrada neste funil.' }) }); });
  const title = await drag(page, col, 'Leads', 'Conexão'); await page.waitForTimeout(1500);
  res.push({ cenario: 'C) 404 do servidor', voltouParaLeads: await has(col, 'Leads', title), tentativas: hits, servidor: await serverStage(page, title), avisos: await toasts(page) }); await ctx.close(); }
// D) Desfazer depois de mover
{ const { ctx, page } = await fresh(); const col = colOf(page);
  const title = await drag(page, col, 'Leads', 'Conexão'); await page.waitForTimeout(1500);
  const moved = await serverStage(page, title);
  await page.locator('.ui-toast-action', { hasText: 'Desfazer' }).first().click(); await page.waitForTimeout(2500);
  res.push({ cenario: 'D) mover e Desfazer', depoisDeMover: moved, depoisDeDesfazer: await serverStage(page, title), naTelaEmLeads: await has(col, 'Leads', title) }); await ctx.close(); }
// E) três arrastos seguidos, rápidos
{ const { ctx, page } = await fresh(); const col = colOf(page); const titles = [];
  for (let i = 0; i < 3; i++) { titles.push(await drag(page, col, 'Leads', 'Conexão')); await page.waitForTimeout(150); }
  await page.waitForTimeout(3500);
  res.push({ cenario: 'E) 3 arrastos em sequência', naTela: await Promise.all(titles.map((t) => has(col, 'Conexão', t))), noServidor: await Promise.all(titles.map((t) => serverStage(page, t))) }); await ctx.close(); }
for (const r of res) console.log(JSON.stringify(r));
await browser.close();
