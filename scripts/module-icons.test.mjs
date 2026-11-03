// Ícone e título por módulo (shared/moduleIcons.js, §158): o index.html do endereço já sai com o favorito do módulo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MODULE_ICONS, MODULE_URLS, moduleIcon, moduleManifest, withModuleHead } from '../shared/moduleIcons.js';
import { MODE_PATHS, modeForPath } from '../src/lib/routes.js';

// O link do manifesto é posto pelo build (vite-plugin-pwa), não está no index.html do código: o teste acrescenta como o build faz.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace('</head>', '<link rel="manifest" href="/manifest.webmanifest"></head>');
const ag = withModuleHead(html, modeForPath('/agenda'));
assert.match(ag, /<link rel="apple-touch-icon" href="\/icons\/m-agenda-180\.png" \/>/);
assert.match(ag, /<link rel="icon" type="image\/png" href="\/icons\/m-agenda-64\.png" \/>/);
assert.match(ag, /<title>Agenda · PRICETAX<\/title>/);
assert.match(ag, /<link rel="manifest" href="\/m\/agenda\.webmanifest">/, 'manifesto do módulo (Dock do Mac)');
assert.match(ag, /<meta name="apple-mobile-web-app-title" content="Agenda · PRICETAX" \/>/);
assert.match(withModuleHead(html, modeForPath('/E-mail')), /m-mail-180\.png/, 'apelido do endereço também');
assert.equal(withModuleHead(html, null), html, 'sem módulo (tela inicial, link público) o HTML não muda');
assert.equal(moduleIcon(null, 180), '/apple-touch-icon.png');
assert.equal(moduleIcon('gate', 64), '/favicon.png');
for (const mode of Object.keys(MODE_PATHS)) {
  assert.ok(MODULE_ICONS[mode], `módulo sem ícone: ${mode}`);
  for (const size of [64, 180]) assert.ok(fs.existsSync(new URL(`../public${moduleIcon(mode, size)}`, import.meta.url)), `falta o arquivo ${moduleIcon(mode, size)} (rode node scripts/gen-module-icons.mjs)`);
}
assert.deepEqual(MODULE_URLS, MODE_PATHS, 'endereços dos módulos iguais aos de src/lib/routes.js');
for (const mode of Object.keys(MODE_PATHS)) assert.ok(fs.existsSync(new URL(`../public/icons/m-${mode}-512.png`, import.meta.url)), `falta o 512 de ${mode}`);
const base = { name: 'PRICETAX — Cronograma', short_name: 'PRICETAX', id: '/', start_url: '/', scope: '/', display: 'standalone', icons: [], shortcuts: [{ name: 'x', url: '/x' }] };
const mm = moduleManifest(base, 'mail');
assert.deepEqual([mm.id, mm.start_url, mm.scope, mm.name, mm.short_name, mm.display], ['/email', '/email', '/', 'E-mail · PRICETAX', 'E-mail', 'standalone'], 'cada módulo é um app próprio, que abre no endereço dele');
assert.deepEqual(mm.icons.map((i) => i.src), ['/icons/m-mail-180.png', '/icons/m-mail-512.png']);
assert.equal(mm.shortcuts, undefined);
assert.notEqual(moduleManifest(base, 'agenda').id, mm.id, 'Agenda e E-mail não viram o mesmo app');
assert.equal(moduleManifest(base, 'nada'), null);
console.log('module-icons: tudo certo');
