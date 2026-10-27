// Mede quanto a TELA demora para mostrar o cartão na etapa nova depois de soltar o mouse (THROTTLE=8 simula CPU 8x mais lenta). Mesmos pré-requisitos de crm-drag-cenarios.mjs.
// Mede, com arrasto nativo no Chromium, quanto tempo a TELA leva para mostrar o cartão na etapa nova depois de soltar o mouse.
import { chromium } from 'playwright-core';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://localhost:5173'; const RATE = Number(process.env.THROTTLE || 1); const N = Number(process.env.N || 3);
const FAIL = process.env.FAIL === '1';
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
if (RATE > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE }); }
await page.goto(BASE + '/');
await page.evaluate(async () => { await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'sbx_eduarda', password: 'sbx-local-pass' }) }); });
await page.goto(BASE + '/crm');
await page.getByRole('button', { name: 'Negócios', exact: true }).first().click();
await page.waitForSelector('.crm-board'); await page.waitForTimeout(2500);
if (FAIL) await page.route('**/api/crm/deals/*/move', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Erro simulado do servidor.' }) }));
const col = (n) => page.locator('.crm-col').filter({ has: page.locator('.crm-col-title', { hasText: n }) }).first();
const out = [];
for (let i = 0; i < N; i++) {
  const card = col('Leads').locator('.crm-deal').first(); const title = await card.locator('.crm-deal-title').innerText();
  const a = await card.boundingBox(); const b = await col('Conexão').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + 20); await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + 28, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + 100, { steps: 12 });
  const t0 = Date.now(); await page.mouse.up();
  let tShow = null;
  for (let k = 0; k < 400; k++) { // até 20 s
    const c = await col('Conexão').locator('.crm-deal-title').filter({ hasText: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).count();
    if (c > 0) { tShow = Date.now() - t0; break; }
    await page.waitForTimeout(50);
  }
  const toast = await page.locator('[role="status"], [role="alert"], .toast, .ui-toast').allInnerTexts().catch(() => []);
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const inLeads = await col('Leads').locator('.crm-deal-title').filter({ hasText: new RegExp('^' + esc + '$') }).count();
  out.push({ title: title.slice(0, 28), apareceuNaEtapaNovaEm_ms: tShow, aindaEmLeads: inLeads > 0, avisos: toast.map((t) => t.replace(/\s+/g, ' ').slice(0, 70)).filter(Boolean).slice(0, 3) });
  await page.waitForTimeout(FAIL ? 3500 : 1500);
}
console.log(`CPU ${RATE}x${FAIL ? ' · servidor falhando (500)' : ''}`); for (const o of out) console.log(' ', JSON.stringify(o));
await browser.close();
