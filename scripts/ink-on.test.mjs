// Texto preto ou branco conforme o fundo (src/lib/inkOn.js). Rodar: node scripts/ink-on.test.mjs
import assert from 'node:assert/strict';
import { inkOn } from '../src/lib/inkOn.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };

ok('fundo claro → texto escuro; fundo escuro → texto branco', () => {
  assert.equal(inkOn('#FEDB00'), '#111');
  assert.equal(inkOn('#ffffff'), '#111');
  assert.equal(inkOn('#3ecf6e'), '#111');
  assert.equal(inkOn('#000000'), '#fff');
  assert.equal(inkOn('#14142b'), '#fff');
  assert.equal(inkOn('#D6249F'), '#fff');
});

ok('formatos aceitos: #rgb, rgb() e rgba()', () => {
  assert.equal(inkOn('#fff'), '#111');
  assert.equal(inkOn('#000'), '#fff');
  assert.equal(inkOn('rgb(214, 36, 159)'), '#fff');
  assert.equal(inkOn('rgba(255,255,255,0.5)'), '#111');
});

ok('fundo ilegível (variável, nome, vazio) mantém o preto de sempre', () => {
  assert.equal(inkOn('var(--bg-3)'), '#111');
  assert.equal(inkOn('red'), '#111');
  assert.equal(inkOn(''), '#111');
  assert.equal(inkOn(undefined), '#111');
});

console.log(`\n${n} verificações ok`);
