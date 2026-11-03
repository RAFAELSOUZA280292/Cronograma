// Ícone e título por módulo (shared/moduleIcons.js, §158): o index.html do endereço já sai com o favorito do módulo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MODULE_ICONS, moduleIcon, withModuleHead } from '../shared/moduleIcons.js';
import { MODE_PATHS, modeForPath } from '../src/lib/routes.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ag = withModuleHead(html, modeForPath('/agenda'));
assert.match(ag, /<link rel="apple-touch-icon" href="\/icons\/m-agenda-180\.png" \/>/);
assert.match(ag, /<link rel="icon" type="image\/png" href="\/icons\/m-agenda-64\.png" \/>/);
assert.match(ag, /<title>Agenda · PRICETAX<\/title>/);
assert.match(ag, /<meta name="apple-mobile-web-app-title" content="Agenda · PRICETAX" \/>/);
assert.match(withModuleHead(html, modeForPath('/E-mail')), /m-mail-180\.png/, 'apelido do endereço também');
assert.equal(withModuleHead(html, null), html, 'sem módulo (tela inicial, link público) o HTML não muda');
assert.equal(moduleIcon(null, 180), '/apple-touch-icon.png');
assert.equal(moduleIcon('gate', 64), '/favicon.png');
for (const mode of Object.keys(MODE_PATHS)) {
  assert.ok(MODULE_ICONS[mode], `módulo sem ícone: ${mode}`);
  for (const size of [64, 180]) assert.ok(fs.existsSync(new URL(`../public${moduleIcon(mode, size)}`, import.meta.url)), `falta o arquivo ${moduleIcon(mode, size)} (rode node scripts/gen-module-icons.mjs)`);
}
console.log('module-icons: tudo certo');
