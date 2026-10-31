// Cor da bolinha dos selos de status (src/ui/statusDot.js). Rodar: node scripts/status-dot.test.mjs
import assert from 'node:assert/strict';
import { softDot } from '../src/ui/statusDot.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };

ok('neon conhecido vira variável (maiúscula ou minúscula)', () => {
  assert.equal(softDot('#3ea6ff'), 'var(--tg-blue)');
  assert.equal(softDot('#F5C400'), 'var(--tg-yellow)');
  assert.equal(softDot('#FEDB00'), 'var(--tg-yellow)');
  assert.equal(softDot('#e2574c'), 'var(--tg-risk)');
  assert.equal(softDot('#9b7af5'), 'var(--tg-purple)');
  assert.equal(softDot('#999999'), 'var(--tg-gray)');
});

ok('cor desconhecida passa sem mudar; vazio vira cinza neutro', () => {
  assert.equal(softDot('#123456'), '#123456');
  assert.equal(softDot('var(--text-6)'), 'var(--text-6)');
  assert.equal(softDot(''), 'var(--text-6)');
  assert.equal(softDot(undefined), 'var(--text-6)');
});

console.log(`\n${n} verificações ok`);
