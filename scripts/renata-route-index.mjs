// Gera server/renata/routeIndex.json: TODAS as rotas HTTP do servidor (método + caminho completo + arquivo), lendo o código-fonte (mapa de montagem de
// server/index.js + chamadas router.METHOD('…') de cada arquivo). Base do catálogo de cobertura da RENATA (§101): o teste `renata-coverage.test.mjs` falha se uma
// rota nova não estiver classificada (ferramenta curada, acesso genérico ou excluída), e a matriz docs/RENATA_MATRIZ_COBERTURA.md sai daqui.
//   node scripts/renata-route-index.mjs            # grava o índice
//   node scripts/renata-route-index.mjs --check    # só confere se está atualizado (sai 1 se não estiver)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'server');
const indexSrc = fs.readFileSync(path.join(server, 'index.js'), 'utf8');

// import { router as xRouter, publicRouter as yRouter } from './x.js'  →  {xRouter: {file:'x.js', local:'router'}, ...}
const imports = {};
for (const m of indexSrc.matchAll(/import\s*\{([^}]+)\}\s*from\s*'(\.\/[^']+\.js)'/g)) {
  for (const part of m[1].split(',')) {
    const mm = part.trim().match(/^(\w+)\s+as\s+(\w+)$/);
    if (mm) imports[mm[2]] = { file: m[2].slice(2), local: mm[1] };
  }
}
const mounts = [];
for (const m of indexSrc.matchAll(/app\.use\('([^']+)',\s*(\w+)\)/g)) if (imports[m[2]]) mounts.push({ prefix: m[1], ...imports[m[2]] });
// o CRM monta também as rotas da migração PipeRun (registerPiperunRoutes) sob o mesmo prefixo
mounts.push({ prefix: '/api/crm', file: 'crm/piperun/routes.js', local: 'router' });

const routes = [];
const seen = new Set();
for (const mt of mounts) {
  const file = path.join(server, mt.file);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`\\b${mt.local}\\.(get|post|put|patch|delete)\\(\\s*'([^']*)'`, 'g');
  for (const m of src.matchAll(re)) {
    const full = `${mt.prefix}${m[2] === '/' ? '' : m[2]}` || '/';
    const key = `${m[1].toUpperCase()} ${full}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push({ method: m[1].toUpperCase(), path: full, file: mt.file });
  }
}
routes.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
const out = `${JSON.stringify({ geradoPor: 'scripts/renata-route-index.mjs', total: routes.length, routes }, null, 1)}\n`;
const target = path.join(server, 'renata', 'routeIndex.json');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (cur !== out) { console.error('routeIndex.json desatualizado: rode node scripts/renata-route-index.mjs'); process.exit(1); }
  console.log(`routeIndex.json em dia (${routes.length} rotas)`);
} else {
  fs.writeFileSync(target, out);
  console.log(`routeIndex.json gravado: ${routes.length} rotas`);
}
