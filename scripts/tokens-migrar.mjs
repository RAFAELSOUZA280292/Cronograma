// Tokens de forma (Onda 2, U1): raio, tamanho de texto e espaçamento (gap) saem de uma escala só, definida em index.html.
// Este script troca, nos CSS do app, os valores que JÁ coincidem exatamente com a escala (ex.: `border-radius:8px` → `var(--r-md)`):
// o resultado na tela é idêntico por construção. Valores fora da escala (12.5px, 11px, 9px…) NÃO são tocados: cada um é uma decisão visual do módulo.
//   node scripts/tokens-migrar.mjs --report            adoção por módulo (tokenizado × migrável × fora da escala)
//   node scripts/tokens-migrar.mjs --apply src/crm     troca os valores exatos nos arquivos indicados
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCALE = {
  radius: { 4: '--r-xs', 6: '--r-sm', 8: '--r-md', 10: '--r-lg', 12: '--r-xl', 999: '--r-pill' },
  font: { 12: '--fs-xs', 13: '--fs-sm', 14: '--fs-md', 16: '--fs-lg', 20: '--fs-xl' },
  gap: { 4: '--sp-1', 8: '--sp-2', 12: '--sp-3', 16: '--sp-4' },
};
// Valores de cada token em index.html (o teste confere que o arquivo e esta tabela dizem a mesma coisa).
export const TOKEN_VALUES = {
  '--r-xs': '4px', '--r-sm': '6px', '--r-md': '8px', '--r-lg': '10px', '--r-xl': '12px', '--r-pill': '999px',
  '--fs-xs': '12px', '--fs-sm': '13px', '--fs-md': '14px', '--fs-lg': '16px', '--fs-xl': '20px',
  '--sp-1': '4px', '--sp-2': '8px', '--sp-3': '12px', '--sp-4': '16px',
};
// Módulos já migrados: o teste garante que não voltam valores crus da escala (catraca).
export const TOKENIZED = ['src/ui', 'src/shell', 'src/renata', 'src/crm', 'src/home'];

// Fim do valor: `;`, `}`, `!important`, fecha-aspas/crase ou fim do texto — assim `8px 8px 0 0` e `calc(...)` nunca casam.
const END = String.raw`(?=\s*(?:;|\}|!important|['"\x60]|$))`;
const RULES = [
  { kind: 'radius', re: new RegExp(String.raw`((?<![-\w])border-radius:\s*)(4|6|8|10|12|999)px${END}`, 'gm') },
  { kind: 'font', re: new RegExp(String.raw`((?<![-\w])font-size:\s*)(12|13|14|16|20)px${END}`, 'gm') },
  { kind: 'gap', re: new RegExp(String.raw`((?<![-\w])(?:row-|column-)?gap:\s*)(4|8|12|16)px${END}`, 'gm') },
];
const OFF = [
  { kind: 'radius', re: /(?<![-\w])border-radius:\s*(\d+(?:\.\d+)?)px(?=\s*(?:;|\}|!important|['"`]|$))/gm, scale: SCALE.radius },
  { kind: 'font', re: /(?<![-\w])font-size:\s*(\d+(?:\.\d+)?)px(?=\s*(?:;|\}|!important|['"`]|$))/gm, scale: SCALE.font },
  { kind: 'gap', re: /(?<![-\w])(?:row-|column-)?gap:\s*(\d+(?:\.\d+)?)px(?=\s*(?:;|\}|!important|['"`]|$))/gm, scale: SCALE.gap },
];

export function migrateText(text) {
  const counts = { radius: 0, font: 0, gap: 0 };
  let out = text;
  for (const r of RULES) out = out.replace(r.re, (_m, head, v) => { counts[r.kind] += 1; return `${head}var(${SCALE[r.kind][v]})`; });
  return { text: out, counts };
}

export function measureText(text) {
  const m = { tokenized: 0, migravel: 0, fora: 0, foraValores: {} };
  m.tokenized = (text.match(/var\(--(?:r|fs|sp)-(?:xs|sm|md|lg|xl|pill|[1-4])\)/g) || []).length;
  m.migravel = Object.values(migrateText(text).counts).reduce((a, b) => a + b, 0);
  for (const o of OFF) for (const x of text.matchAll(o.re)) {
    if (!o.scale[Number(x[1])]) { m.fora += 1; const k = `${o.kind} ${x[1]}px`; m.foraValores[k] = (m.foraValores[k] || 0) + 1; }
  }
  return m;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function filesIn(p) {
  const abs = path.resolve(root, p);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [abs];
  return fs.readdirSync(abs, { recursive: true }).map((f) => path.join(abs, String(f))).filter((f) => /\.(css|jsx?)$/.test(f) && fs.statSync(f).isFile());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const report = args.includes('--report');
  const targets = args.filter((a) => !a.startsWith('--'));
  if (apply) {
    let total = 0;
    for (const t of targets) for (const f of filesIn(t)) {
      const src = fs.readFileSync(f, 'utf8'); const { text, counts } = migrateText(src);
      const n = counts.radius + counts.font + counts.gap;
      if (n) { fs.writeFileSync(f, text); total += n; console.log(`${String(n).padStart(4)}  ${path.relative(root, f)}  (raio ${counts.radius}, texto ${counts.font}, espaço ${counts.gap})`); }
    }
    console.log(`\n${total} valores trocados por tokens.`);
  } else if (report) {
    const dirs = fs.readdirSync(path.join(root, 'src'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `src/${d.name}`);
    const rows = [['src (raiz)', filesIn('src').filter((f) => path.dirname(f) === path.join(root, 'src'))], ...dirs.map((d) => [d, filesIn(d)])];
    console.log('módulo'.padEnd(20), 'tokenizado'.padStart(11), 'migrável'.padStart(9), 'fora da escala'.padStart(15), ' maiores desvios');
    for (const [name, files] of rows) {
      const t = { tokenized: 0, migravel: 0, fora: 0, v: {} };
      for (const f of files) { const m = measureText(fs.readFileSync(f, 'utf8')); t.tokenized += m.tokenized; t.migravel += m.migravel; t.fora += m.fora; for (const [k, n] of Object.entries(m.foraValores)) t.v[k] = (t.v[k] || 0) + n; }
      if (!t.tokenized && !t.migravel && !t.fora) continue;
      const top = Object.entries(t.v).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}×${n}`).join(', ');
      console.log(name.padEnd(20), String(t.tokenized).padStart(11), String(t.migravel).padStart(9), String(t.fora).padStart(15), ' ', top);
    }
  } else console.log('Use --report ou --apply <pasta|arquivo>…');
}
