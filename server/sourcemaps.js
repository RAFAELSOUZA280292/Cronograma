// Tradução de pilhas de erro do navegador para o código-fonte, SÓ para o log (2026-10-16). O build gera os sourcemaps como "hidden" (vite.config.js):
// viram arquivos em .sourcemaps/ (fora de dist/, que é a pasta pública), o JS não aponta para eles e o servidor ainda responde 404 a qualquer *.map — o público nunca os vê. Aqui eles são lidos
// apenas para trocar "https://…/assets/index-ABC.js:1314:5454" por "src/App.jsx:8335:3" nas linhas `[client-error]`.
// Segurança: só se usa o NOME do arquivo (padrão estrito, sem barras nem "..") e ele é sempre procurado dentro de .sourcemaps/; nada de URL é buscada.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

// Os .map ficam FORA de dist/ (scripts/stash-sourcemaps.mjs, rodado pelo `npm run build`): a pasta pública não contém nenhum.
export const MAPS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.sourcemaps');
const FRAME = /https?:\/\/[^\s()'"]+?\/assets\/([A-Za-z0-9_.-]+\.js):(\d+):(\d+)/g;
const MAX_FRAMES = 40;
const MAX_CACHED = 8;
const cache = new Map(); // nome do .js -> Promise<TraceMap|null>

function load(mapsDir, file) {
  if (cache.has(file)) { const p = cache.get(file); cache.delete(file); cache.set(file, p); return p; } // LRU simples
  const p = fs.readFile(path.join(mapsDir, `${file}.map`), 'utf8')
    .then((txt) => new TraceMap(JSON.parse(txt)))
    .catch(() => null); // mapa ausente (ex.: aba antiga de uma versão já substituída) → mantém a linha original
  cache.set(file, p);
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
  return p;
}

// "../../src/App.jsx" → "src/App.jsx"; "../../node_modules/react-dom/x.js" → "node_modules/react-dom/x.js"
export function cleanSource(src) {
  const s = String(src || '').replace(/\\/g, '/');
  const i = s.search(/(?:^|\/)(src|node_modules|server|shared)\//);
  return (i >= 0 ? s.slice(i).replace(/^\//, '') : s.replace(/^(\.\.\/)+/, '')) || '?';
}

// Troca cada quadro "…/assets/ARQ.js:L:C" por "src/arquivo.jsx:L:C (nome)" quando o mapa existe; senão deixa como veio. Nunca lança.
export async function symbolicate(text, mapsDir) {
  try {
    const s = String(text || '');
    if (!s || !s.includes('/assets/')) return s;
    const matches = [...s.matchAll(FRAME)].slice(0, MAX_FRAMES);
    if (!matches.length) return s;
    const repl = new Map();
    for (const m of matches) {
      const [full, file, line, col] = m;
      if (repl.has(full)) continue;
      const tm = await load(mapsDir, file);
      if (!tm) continue;
      // o navegador conta a coluna a partir de 1; o trace-mapping, a partir de 0
      const pos = originalPositionFor(tm, { line: Number(line), column: Math.max(0, Number(col) - 1) });
      if (pos && pos.source) repl.set(full, `${cleanSource(pos.source)}:${pos.line}:${(pos.column || 0) + 1}`); // sem o nome do mapa: é o identificador naquele ponto, não a função, e confunde
    }
    return s.replace(FRAME, (full) => repl.get(full) || full);
  } catch (e) {
    return String(text || '');
  }
}

// Quantos mapas há para o servidor usar (aparece no log de inicialização: confirma, em produção, que o build os gerou e que ficaram no lugar).
export async function countMaps(mapsDir = MAPS_DIR) {
  try { return (await fs.readdir(mapsDir)).filter((f) => f.endsWith('.map')).length; } catch (e) { return 0; }
}
