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
