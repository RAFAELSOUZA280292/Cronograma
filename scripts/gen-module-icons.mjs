// Ícone de cada módulo para favoritos e aba do navegador (2026-11-03, §158; Rafael favoritou Agenda e E-mail no Safari e os dois
// saíram com o mesmo X). Gera public/icons/m-<módulo>-180.png (favorito/tela de início: fundo preto, ícone do módulo em amarelo e o X
// da marca no canto) e m-<módulo>-64.png (aba: só o ícone). Os ícones são os mesmos do menu do painel (lucide-react, SHELL_MODES).
//   node scripts/gen-module-icons.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Activity, Briefcase, Bug, Building2, CalendarDays, Columns3, FileText, FolderOpen, Globe, Mail, MessageCircle, Sparkles, UserCog } from 'lucide-react';
import { chromium } from '@playwright/test';
import { MODULE_ICONS } from '../shared/moduleIcons.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'icons');
const GLYPH = { company: Building2, personal: Columns3, xflow: Bug, agenda: CalendarDays, mail: Mail, whatsapp: MessageCircle, macro: Globe, knowledge: Sparkles, crm: Briefcase, pareceres: FileText, modelos: FolderOpen, users: UserCog, ops: Activity };
const logo = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'public', 'apple-touch-icon.png')).toString('base64')}`;
const svg = (Icon, size, stroke) => renderToStaticMarkup(React.createElement(Icon, { size, color: '#F5C400', strokeWidth: stroke }));

// Mesmo Chromium do teste de fluxos (e2e/playwright.config.mjs): o do cache que existir, não o da versão exata do Playwright.
function findChromium() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  try {
    for (const d of fs.readdirSync(cache).filter((x) => x.startsWith('chromium_headless_shell-')).sort().reverse()) {
      for (const sub of fs.readdirSync(path.join(cache, d))) { const p = path.join(cache, d, sub, 'chrome-headless-shell'); if (fs.existsSync(p)) return p; }
    }
  } catch { /* cai no padrão do Playwright */ }
  return undefined;
}
const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const key of Object.keys(MODULE_ICONS)) {
  const Icon = GLYPH[key];
  if (!Icon) throw new Error(`Sem ícone para ${key}`);
  // 180: favorito do Safari / ícone de tela de início.
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(`<body style="margin:0;background:#000"><div style="position:relative;width:180px;height:180px;background:#0b0b0b;display:grid;place-items:center">
    <div style="margin:-8px 0 0 -6px">${svg(Icon, 104, 1.9)}</div>
    <div style="position:absolute;right:10px;bottom:10px;width:50px;height:50px;border-radius:14px;background:#000;box-shadow:0 0 0 2px #0b0b0b;overflow:hidden"><img src="${logo}" style="width:50px;height:50px;display:block"></div>
  </div></body>`);
  await page.screenshot({ path: path.join(OUT, `m-${key}-180.png`), clip: { x: 0, y: 0, width: 180, height: 180 } });
  // 64: aba do navegador (pequeno demais para o X: só o ícone).
  await page.setViewportSize({ width: 64, height: 64 });
  await page.setContent(`<body style="margin:0;background:#000"><div style="width:64px;height:64px;background:#0b0b0b;border-radius:14px;display:grid;place-items:center">${svg(Icon, 46, 2.4)}</div></body>`);
  await page.screenshot({ path: path.join(OUT, `m-${key}-64.png`), clip: { x: 0, y: 0, width: 64, height: 64 }, omitBackground: false });
  console.log('ok', key);
}
await browser.close();
