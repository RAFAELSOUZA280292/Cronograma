// Tokens de forma (U1): escala em index.html × tabela do migrador, regras de troca e a catraca dos módulos já migrados. Sem navegador.
// Rodar: node scripts/design-tokens.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCALE, TOKEN_VALUES, TOKENIZED, migrateText, measureText, filesIn } from './tokens-migrar.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const m = (s) => migrateText(s).text;

ok('index.html define cada token com o valor documentado', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [tok, val] of Object.entries(TOKEN_VALUES)) {
    const re = new RegExp(`${tok}:\\s*([^;]+);`);
    const found = re.exec(html);
    assert.ok(found, `${tok} não definido em index.html`);
    assert.equal(found[1].trim(), val, `${tok}`);
  }
});

ok('a escala aponta só para tokens que existem e valem o próprio número', () => {
  for (const group of Object.values(SCALE)) for (const [px, tok] of Object.entries(group)) assert.equal(TOKEN_VALUES[tok], `${px}px`, `${tok} deveria valer ${px}px`);
});

ok('troca valor exato nas três famílias', () => {
  assert.equal(m('.a{border-radius:8px;font-size:12px;gap:4px}'), '.a{border-radius:var(--r-md);font-size:var(--fs-xs);gap:var(--sp-1)}');
  assert.equal(m('border-radius: 999px;'), 'border-radius: var(--r-pill);');
  assert.equal(m('row-gap:12px; column-gap:16px;'), 'row-gap:var(--sp-3); column-gap:var(--sp-4);');
  assert.equal(m('font-size:20px !important;'), 'font-size:var(--fs-xl) !important;');
});

ok('não toca o que não é um valor único da escala', () => {
  for (const s of ['border-radius:8px 8px 0 0;', 'border-radius:50%;', 'border-radius:9px;', 'border-radius:99px;', 'font-size:12.5px;', 'font-size:11px;', 'font-size:1.2em;',
    'gap:8px 12px;', 'gap:6px;', 'grid-gap:8px;', 'font-size:calc(12px + 1px);', 'fontSize: 12', 'borderRadius: 8', 'line-height:12px;', 'max-gap:8px;']) {
    assert.equal(m(s), s, s);
  }
});

ok('funciona dentro de template string e de atributo style entre aspas', () => {
  assert.equal(m("css = `.x { gap:8px; }`"), "css = `.x { gap:var(--sp-2); }`");
  assert.equal(m('<div style="font-size:13px">'), '<div style="font-size:var(--fs-sm)">');
});

ok('medição: conta tokenizados, migráveis e desvios por valor', () => {
  const r = measureText('a{border-radius:var(--r-md);font-size:12px;font-size:12.5px;font-size:12.5px;gap:6px}');
  assert.equal(r.tokenized, 1); assert.equal(r.migravel, 1); assert.equal(r.fora, 3);
  assert.deepEqual(r.foraValores, { 'font 12.5px': 2, 'gap 6px': 1 });
});

ok('catraca: módulos migrados não têm valor cru da escala', () => {
  for (const dir of TOKENIZED) {
    const files = filesIn(dir);
    assert.ok(files.length > 0, `${dir} sem arquivos`);
    for (const f of files) {
      const { counts } = migrateText(fs.readFileSync(f, 'utf8'));
      const left = counts.radius + counts.font + counts.gap;
      assert.equal(left, 0, `${path.relative(root, f)} tem ${left} valor(es) cru(s) da escala: rode node scripts/tokens-migrar.mjs --apply ${dir}`);
    }
  }
});

console.log(`\n${n} verificações ok.`);
