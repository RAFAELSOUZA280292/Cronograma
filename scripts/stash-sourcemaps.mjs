// Depois do build (2026-10-16): move dist/assets/*.map para .sourcemaps/ — FORA de dist/, que é a pasta servida ao público. Os sourcemaps existem só para o
// servidor traduzir pilhas de erro nas linhas de log (server/sourcemaps.js). Rodado pelo `npm run build`; não toca em nada além dos .map.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'dist', 'assets');
const out = path.join(root, '.sourcemaps');

fs.rmSync(out, { recursive: true, force: true }); // só os mapas do build atual (os hashes mudam a cada versão)
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const f of fs.existsSync(assets) ? fs.readdirSync(assets) : []) {
  if (!f.endsWith('.map')) continue;
  fs.renameSync(path.join(assets, f), path.join(out, f));
  n += 1;
}
console.log(`sourcemaps: ${n} arquivo(s) movidos para .sourcemaps/ (fora de dist/)`);
