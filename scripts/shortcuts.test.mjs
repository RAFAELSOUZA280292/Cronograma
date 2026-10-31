// Lista de atalhos da ajuda ("?"): forma da lista e o detector de "digitando". Rodar: node scripts/shortcuts.test.mjs
import assert from 'node:assert/strict';
import { SHORTCUT_GROUPS, allShortcuts, isTypingTarget, modLabel } from '../src/shell/shortcuts.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };

ok('cada grupo e cada atalho tem título, teclas e descrição', () => {
  assert.ok(SHORTCUT_GROUPS.length >= 3);
  for (const g of SHORTCUT_GROUPS) {
    assert.ok(g.title && g.items.length, `grupo vazio: ${g.title}`);
    for (const it of g.items) { assert.ok(Array.isArray(it.keys) && it.keys.length && it.keys.every(Boolean), `sem teclas: ${it.what}`); assert.ok(String(it.what).length > 8, 'descrição curta demais'); }
  }
});

ok('sem atalho repetido dentro do mesmo grupo', () => {
  for (const g of SHORTCUT_GROUPS) {
    const ids = g.items.map((i) => i.keys.join('+'));
    assert.equal(new Set(ids).size, ids.length, `repetido em ${g.title}: ${ids.join(', ')}`);
  }
});

ok('os atalhos-chave estão na lista (Mod+K, ?, N, Esc)', () => {
  const ids = allShortcuts().map((s) => s.keys.join('+'));
  for (const k of ['Mod+K', '?', 'N', 'Esc']) assert.ok(ids.includes(k), `falta ${k}`);
});

ok('Mod vira Ctrl ou ⌘', () => { assert.equal(modLabel(true), '⌘'); assert.equal(modLabel(false), 'Ctrl'); });

ok('isTypingTarget: campos e texto editável sim; botão e nada não', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTypingTarget(null), false);
});

console.log(`\n${n} verificações ok`);
