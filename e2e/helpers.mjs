// Ajudantes do teste de fluxos: login (pela tela e pela API), dados de teste por API e a conferência de acessibilidade com catraca (axe-core).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { PASS } from './setup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(here, 'axe-baseline.json');
export const stamp = () => Date.now().toString(36);

export async function loginUi(page, username, password = PASS) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Usuário' }).fill(username);
  await page.getByRole('textbox', { name: 'Senha' }).fill(password);
  // Espera a resposta do login: sem isso, um `goto` logo em seguida podia cancelar o pedido e cair de volta na tela de entrada (intermitente).
  const respondeu = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await respondeu;
}

// Entra pela API na MESMA sessão do navegador (o cookie fica no contexto) e devolve ajudantes que já levam o cookie.
export async function apiAs(page, username) {
  const r = await page.request.post('/api/auth/login', { data: { username, password: PASS } });
  expect(r.ok(), 'login por API').toBeTruthy();
  const call = async (method, url, data) => {
    const res = await page.request.fetch(url, { method, data, headers: { 'Content-Type': 'application/json' } });
    return { status: res.status(), body: await res.json().catch(() => null) };
  };
  return { get: (u) => call('GET', u), post: (u, d) => call('POST', u, d || {}), patch: (u, d) => call('PATCH', u, d), put: (u, d) => call('PUT', u, d) };
}

// Acessibilidade com catraca: falha se aparecer regra SÉRIA/CRÍTICA nova numa tela. As conhecidas ficam em axe-baseline.json (dívida a pagar aos poucos; só o nome da regra,
// porque a contagem de elementos muda com os dados do teste); `E2E_UPDATE_BASELINE=1` regrava o arquivo depois de você corrigir ou aceitar de propósito.
export async function checkAxe(page, name) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const found = {};
  for (const v of res.violations) if (v.impact === 'serious' || v.impact === 'critical') found[v.id] = v.nodes.length;
  const ids = Object.keys(found).sort();
  let base = {};
  try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch { /* sem referência ainda */ }
  if (process.env.E2E_UPDATE_BASELINE) { base[name] = ids; fs.writeFileSync(BASELINE, `${JSON.stringify(base, null, 2)}\n`); return found; }
  const known = new Set(base[name] || []);
  const worse = Object.entries(found).filter(([id]) => !known.has(id)).map(([id, n]) => `${id}: ${n} elemento(s) (regra nova)`);
  expect(worse, `acessibilidade em "${name}" piorou:\n${res.violations.filter((v) => worse.some((w) => w.startsWith(v.id))).map((v) => `- ${v.id}: ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`).join('\n')}`).toEqual([]);
  return found;
}

// Contraste do texto da janela aberta (WCAG AA: 4,5:1; 3:1 para texto grande) nos DOIS temas. Emojis ficam de fora (glifo colorido, a cor do texto não vale).
// Existe porque o axe não mede o tema claro e os números coloridos do painel de subatividades ficavam ilegíveis nele (§116zr).
const medirContraste = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a >= 0.95) return c; e = e.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const frames = [...document.querySelectorAll('.ui-frame')];
  const root = frames[frames.length - 1];
  const out = [];
  if (!root) return { checked: 0, bad: ['nenhuma janela aberta'] };
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (w.nextNode()) {
    const n = w.currentNode; const txt = n.nodeValue.trim(); if (!txt || /^[\p{Extended_Pictographic}\uFE0F\u200D]+$/u.test(txt)) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || r.height === 0 || el.closest('[disabled], [aria-disabled="true"]')) continue;
    const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el);
    const mix = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    const L1 = lum(mix); const L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize); const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    if (ratio < (large ? 3 : 4.5)) out.push(`"${txt.slice(0, 30)}" ${Math.round(ratio * 100) / 100}:1`);
  }
  return { checked: seen.size, bad: out };
};
export async function checkContrast(page, name) {
  for (const tema of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
    const res = await page.evaluate(medirContraste);
    expect(res.checked, `contraste "${name}" (${tema}): a medição não achou texto`).toBeGreaterThan(0);
    expect(res.bad, `contraste "${name}" no tema ${tema}`).toEqual([]);
  }
}
