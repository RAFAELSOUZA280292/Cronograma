// Caixa de e-mail, pacote visual: limites das colunas, saneamento das preferências e mapa de atalhos. Rodar: node scripts/mail-view.test.mjs
import assert from 'node:assert/strict';
import {
  VIEW_DEFAULTS, LIMITS, MAIL_SHORTCUTS, sanitizeView, clampNav, clampList, clampListH, stepSize, mailKeyAction, neighborId, afterRemoval, removesFrom, viewKey,
} from '../src/mail/mailView.js';
import { SHORTCUT_GROUPS } from '../src/shell/shortcuts.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const key = (k, mods = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

ok('preferências vazias, quebradas ou adulteradas voltam ao padrão', () => {
  assert.deepEqual(sanitizeView(null), VIEW_DEFAULTS);
  assert.deepEqual(sanitizeView('{não é json'), VIEW_DEFAULTS);
  const v = sanitizeView({ navW: 9999, listW: -5, listH: 3, reading: 'lado', density: 'x', snippet: 'sim', navCollapsed: 'true' });
  assert.equal(v.navW, LIMITS.nav[1]);
  assert.equal(v.listW, LIMITS.list[0]);
  assert.equal(v.listH, LIMITS.listH[1]);
  assert.equal(v.reading, 'right');
  assert.equal(v.density, 'comfortable');
  assert.equal(v.snippet, true);
  assert.equal(v.navCollapsed, false);
  const w = sanitizeView({ side: 'contatos', sideW: 5000 });
  assert.equal(w.side, '', 'painel lateral desconhecido fica fechado');
  assert.equal(w.sideW, LIMITS.side[1]);
});

ok('preferências válidas sobrevivem à ida e volta em JSON', () => {
  const v = { navW: 250, listW: 420, listH: 0.5, reading: 'bottom', density: 'compact', snippet: false, navCollapsed: true, side: 'agenda', sideW: 420 };
  assert.deepEqual(sanitizeView(JSON.stringify(v)), v);
});

ok('limites de largura: pastas 160–360; lista 260–720 e a leitura nunca abaixo de 360', () => {
  assert.equal(clampNav(100), 160); assert.equal(clampNav(500), 360); assert.equal(clampNav(230.4), 230);
  assert.equal(clampList(900, 2000), 720);
  assert.equal(clampList(600, 800), 440);
  assert.equal(clampList(600, 500), 260, 'tela estreita: a lista fica no mínimo');
  assert.equal(clampListH(0.05), 0.2); assert.equal(clampListH('abc'), VIEW_DEFAULTS.listH);
});

ok('divisória pelo teclado: setas, Shift, Home/End; outra tecla não é dela', () => {
  const lim = { min: 160, max: 360 };
  assert.equal(stepSize(220, key('ArrowRight'), lim), 236);
  assert.equal(stepSize(220, key('ArrowLeft', { shiftKey: true }), lim), 160);
  assert.equal(stepSize(220, key('Home'), lim), 160);
  assert.equal(stepSize(220, key('End'), lim), 360);
  assert.equal(stepSize(220, key('ArrowDown'), lim), null);
  assert.equal(stepSize(0.5, key('ArrowDown'), { min: 0.2, max: 0.8, step: 0.05, vertical: true }), 0.55);
});

ok('mapa de atalhos: cada tecla leva a uma ação só', () => {
  const all = MAIL_SHORTCUTS.flatMap((s) => s.match);
  assert.equal(new Set(all).size, all.length);
  const expect = { j: 'next', ArrowDown: 'next', k: 'prev', ArrowUp: 'prev', Enter: 'open', e: 'archive', '#': 'trash', Delete: 'trash', r: 'reply', a: 'replyAll', f: 'forward', s: 'star', u: 'unread', c: 'compose', n: 'compose', '/': 'search', Escape: 'close', v: 'move' };
  for (const [k, a] of Object.entries(expect)) assert.equal(mailKeyAction(key(k, k === '#' ? { shiftKey: true } : {})), a, k);
});

ok('não colide com os atalhos globais: Ctrl/⌘/Alt, "?" e letras com Shift ficam de fora', () => {
  assert.equal(mailKeyAction(key('k', { ctrlKey: true })), null, 'Ctrl K é a busca do sistema');
  assert.equal(mailKeyAction(key('k', { metaKey: true })), null, '⌘ K é a busca do sistema');
  assert.equal(mailKeyAction(key('?', { shiftKey: true })), null, '? é a ajuda');
  assert.equal(mailKeyAction(key('R', { shiftKey: true })), null);
  assert.equal(mailKeyAction(key('e', { altKey: true })), null);
  assert.equal(mailKeyAction(key('x')), null);
});

ok('a ajuda "?" mostra o grupo da Caixa de e-mail com todas as ações', () => {
  const g = SHORTCUT_GROUPS.find((x) => x.title === 'Caixa de e-mail');
  assert.ok(g, 'falta o grupo na ajuda');
  assert.equal(g.items.length, MAIL_SHORTCUTS.length);
});

ok('navegação: vizinho, ponta da lista e depois de tirar a aberta', () => {
  const ids = ['a', 'b', 'c'];
  assert.equal(neighborId(ids, 'b', 1), 'c'); assert.equal(neighborId(ids, 'c', 1), 'c'); assert.equal(neighborId(ids, 'a', -1), 'a');
  assert.equal(neighborId(ids, null, 1), 'a'); assert.equal(neighborId(ids, null, -1), 'c'); assert.equal(neighborId([], null, 1), null);
  assert.equal(afterRemoval(ids, 'b'), 'c'); assert.equal(afterRemoval(ids, 'c'), 'b'); assert.equal(afterRemoval(['a'], 'a'), null);
});

ok('removesFrom segue a regra da tela (arquivar só tira da Entrada)', () => {
  assert.equal(removesFrom('archive', 'INBOX'), true);
  assert.equal(removesFrom('archive', 'Label_1'), false);
  assert.equal(removesFrom('trash', 'SENT'), true);
  assert.equal(removesFrom('unstar', 'STARRED'), true);
  assert.equal(removesFrom('star', 'INBOX'), false);
});

ok('preferência guardada por pessoa', () => { assert.notEqual(viewKey(1), viewKey(2)); assert.equal(viewKey(7), 'pt-mail-view:7'); });

console.log(`\n${n} verificações ok`);
