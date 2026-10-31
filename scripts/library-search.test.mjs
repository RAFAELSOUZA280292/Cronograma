// Busca da paleta em Pareceres/Modelos/Conhecimento: termos, escape de curinga, montagem dos filtros (server/librarySearch.js)
// e o mapeamento da resposta para itens da lista (src/shell/libraryItems.js). Sem banco. Rodar: node scripts/library-search.test.mjs
import assert from 'node:assert/strict';
import { searchTerms, wordStartPattern, termConditions } from '../server/librarySearch.js';
import { libraryItems, LIBRARY_GROUPS } from '../src/shell/libraryItems.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };

ok('termos: minúsculas, mínimo 2 letras, no máximo 5', () => {
  assert.deepEqual(searchTerms('  Crédito  de  ICMS '), ['crédito', 'de', 'icms']);
  assert.deepEqual(searchTerms('a b c'), []);
  assert.equal(searchTerms('um dois tres quatro cinco seis sete').length, 5);
  assert.deepEqual(searchTerms(undefined), []);
});

ok('metacaracteres de regex do usuário são escapados', () => {
  assert.equal(wordStartPattern('100%'), '100%');
  assert.equal(wordStartPattern('a.b'), 'a\\.b');
  assert.equal(wordStartPattern('(x)+'), '\\(x\\)\\+');
  assert.equal(wordStartPattern('c\\d'), 'c\\\\d');
  assert.ok(new RegExp('(^|[^a-z0-9])' + wordStartPattern('a.b')).test('x a.b') && !new RegExp('(^|[^a-z0-9])' + wordStartPattern('a.b')).test('x axb'));
});

ok('filtros: E entre termos, OU entre campos, parâmetros a partir do índice dado', () => {
  const c = termConditions(['title', 'description'], ['icms', 'crédito'], 3);
  assert.equal(c.params.length, 2);
  assert.match(c.sql, /\$3/); assert.match(c.sql, /\$4/); assert.doesNotMatch(c.sql, /\$5/);
  assert.equal(c.sql.split(' AND ').length, 2);
  assert.equal(c.sql.split(' OR ').length, 3); // um OR por termo (2 campos)
  assert.match(c.sql, /immutable_unaccent\(lower\(title\)\) ~ /);
});

ok('nenhum valor do usuário entra no SQL (só em parâmetros)', () => {
  const c = termConditions(['title'], ["x'; DROP TABLE pareceres;--"], 2);
  assert.doesNotMatch(c.sql, /DROP/);
  assert.match(c.params[0], /DROP/);
});

const calls = [];
const open = { parecer: (id) => calls.push(['parecer', id]), modelo: (id) => calls.push(['modelo', id]), fact: (id) => calls.push(['fact', id]) };

ok('itens: grupos, rótulos, dica e ação abrem o id certo', () => {
  const items = libraryItems({
    pareceres: [{ id: 'p1', title: 'Parecer Tema 69', scope: 'cliente', company_name: 'KUHN', file_name: 'a.pdf' }, { id: 'p2', title: '', scope: 'geral', file_name: 'b.pdf' }],
    modelos: [{ id: 'm1', title: 'Proposta', category: 'Comercial' }],
    facts: [{ id: 'f1', subject: 'Alíquota CBS 2027', knowledge_type: 'DECISION' }],
  }, open, {});
  assert.deepEqual(items.map((i) => i.group), ['Pareceres', 'Pareceres', 'Modelos', 'Conhecimento']);
  assert.equal(items[0].hint, 'Cliente · KUHN'); assert.equal(items[1].hint, 'Geral'); assert.equal(items[1].label, 'b.pdf');
  assert.equal(items[2].hint, 'Comercial'); assert.equal(items[3].hint, 'Decisão');
  items.forEach((i) => i.run());
  assert.deepEqual(calls, [['parecer', 'p1'], ['parecer', 'p2'], ['modelo', 'm1'], ['fact', 'f1']]);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
});

ok('itens: resposta vazia ou ausente não quebra; grupos conhecidos', () => {
  assert.deepEqual(libraryItems(null, open), []);
  assert.deepEqual(libraryItems({}, open), []);
  assert.deepEqual(LIBRARY_GROUPS, ['Pareceres', 'Modelos', 'Conhecimento']);
});

console.log(`\n${n} verificações ok.`);
