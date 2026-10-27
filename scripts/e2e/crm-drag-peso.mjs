// Mede o PESO do quadro do CRM numa máquina lenta (THROTTLE=8): tempo para abrir, nós na tela e travas durante/depois do arrasto. Mesmos pré-requisitos de crm-drag-cenarios.mjs.
// Peso do quadro do CRM numa máquina lenta: tempo para abrir, nós na tela, "tempo travado" (long tasks) ao mover um cartão.
import { chromium } from 'playwright-core';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://localhost:5173'; const RATE = Number(process.env.THROTTLE || 1); const N = Number(process.env.N || 3);
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const page = await ctx.newPage();
await page.goto(BASE + '/');
await page.evaluate(async () => { await fetch('/api/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'sbx_eduarda', password: 'sbx-local-pass' }) }); });
await page.goto(BASE + '/crm'); await page.waitForTimeout(1500);
if (RATE > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE }); }
await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([e.startTime, e.duration]))).observe({ entryTypes: ['longtask'] }); });
const t0 = Date.now();
await page.getByRole('button', { name: 'Negócios', exact: true }).first().click();
await page.waitForSelector('.crm-board .crm-deal', { timeout: 120000 });
// espera estabilizar a contagem de cartões
let last = -1, stable = 0; while (stable < 3) { const c = await page.locator('.crm-deal').count(); stable = c === last ? stable + 1 : 0; last = c; await page.waitForTimeout(150); }
const tOpen = Date.now() - t0;
const nodes = await page.evaluate(() => document.querySelectorAll('*').length);
const cards = await page.locator('.crm-deal').count();
const selects = await page.locator('.crm-deal-move select').count();
const options = await page.locator('.crm-deal-move option').count();
const col = (n) => page.locator('.crm-col').filter({ has: page.locator('.crm-col-title', { hasText: n }) }).first();
const moves = [];
for (let i = 0; i < N; i++) {
  await page.evaluate(() => { window.__lt.length = 0; });
  const card = col('Leads').locator('.crm-deal').first(); const a = await card.boundingBox(); const b = await col('Conexão').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + 20);
  const tDown = await page.evaluate(() => performance.now()); await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 8, a.y + 28, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + 100, { steps: 12 });
  const tUp = await page.evaluate(() => performance.now()); await page.mouse.up();
  await page.waitForTimeout(6000);
  const lt = await page.evaluate(() => window.__lt.slice());
  const sum = (arr) => Math.round(arr.reduce((x, y) => x + y[1], 0));
  const during = lt.filter((e) => e[0] >= tDown && e[0] < tUp); const after = lt.filter((e) => e[0] >= tUp);
  moves.push({ durante_o_arrasto: { ms: sum(during), n: during.length, maior: Math.round(Math.max(0, ...during.map((e) => e[1]))) }, depois_de_soltar: { ms: sum(after), n: after.length, maior: Math.round(Math.max(0, ...after.map((e) => e[1]))) } });
}
console.log(`CPU ${RATE}x | abrir o quadro até estabilizar: ${tOpen} ms | cartões: ${cards} | nós no DOM: ${nodes} | <select> de mover: ${selects} (${options} opções)`);
moves.forEach((m, i) => console.log(`  mover #${i + 1}:`, JSON.stringify(m)));
await browser.close();
