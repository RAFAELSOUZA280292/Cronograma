// Matemática do auditor de leitura (src/dev/uiAudit.js): contraste WCAG, composição com transparência e leitura das cores do navegador.
// Parte pura (sem DOM). Rodar: node scripts/ui-audit.test.mjs
import assert from 'node:assert/strict';
import { parseColor, luminance, contrastRatio, composite, minContrastFor } from '../src/dev/uiAudit.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

ok('leitura de rgb, rgba, % e color(srgb)', () => {
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(parseColor('rgba(255, 0, 0, 0.5)'), { r: 255, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseColor('rgb(0 0 0 / 40%)').a, 0.4);
  const c = parseColor('color(srgb 1 0.5 0 / 0.25)');
  near(c.r, 255); near(c.g, 127.5); near(c.b, 0); near(c.a, 0.25);
  assert.equal(parseColor('oklch(0.7 0.1 200)'), null, 'formato desconhecido não é "medido"');
  assert.equal(parseColor(''), null);
  assert.equal(parseColor('rgb(a, b, c)'), null);
});

ok('contraste: preto/branco = 21; branco/branco = 1; é simétrico', () => {
  const k = { r: 0, g: 0, b: 0 }; const w = { r: 255, g: 255, b: 255 };
  near(contrastRatio(k, w), 21, 0.001); near(contrastRatio(w, w), 1, 0.001); near(contrastRatio(w, k), contrastRatio(k, w), 1e-9);
});

ok('valores de referência do projeto (medidos em 30/10/2026)', () => {
  const white = { r: 255, g: 255, b: 255 };
  near(contrastRatio({ r: 0xFE, g: 0xDB, b: 0x00 }, white), 1.37, 0.02); // amarelo da marca sobre branco: reprovava
  near(contrastRatio({ r: 0x77, g: 0x77, b: 0x77 }, white), 4.48, 0.02); // limite clássico do #777
  assert.ok(contrastRatio({ r: 0x26, g: 0x24, b: 0x20 }, white) > 15); // --text-1 do tema claro
});

ok('transparência é composta sobre o fundo antes de medir', () => {
  const half = composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
  near(half.r, 127.5); near(half.g, 127.5);
  const none = composite({ r: 10, g: 10, b: 10, a: 0 }, { r: 200, g: 100, b: 50, a: 1 });
  assert.deepEqual([none.r, none.g, none.b], [200, 100, 50]);
});

ok('limite por tamanho: grande = 3:1, normal = 4,5:1', () => {
  assert.equal(minContrastFor(16, 400), 4.5);
  assert.equal(minContrastFor(18.66, 700), 3);
  assert.equal(minContrastFor(18.66, 400), 4.5);
  assert.equal(minContrastFor(24, 400), 3);
  assert.equal(minContrastFor(28, 800), 3);
});

ok('luminância fica entre 0 e 1', () => {
  assert.equal(luminance({ r: 0, g: 0, b: 0 }), 0);
  near(luminance({ r: 255, g: 255, b: 255 }), 1, 1e-9);
});

console.log(`\n${n} verificações ok`);
