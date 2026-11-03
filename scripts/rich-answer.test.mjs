// Leitura de um item da resposta da RENATA para o cartão (src/renata/richAnswerParse.js).
import assert from 'node:assert/strict';
import { parseItem } from '../src/renata/richAnswerParse.js';
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
ok('pendência completa', () => assert.deepEqual(parseItem('[Fluxo de Venda](/empresas?empresa=p&atividade=a) — Financeiro · venceu 09/09 · 9 subatividades em aberto'),
  { title: 'Fluxo de Venda', href: '/empresas?empresa=p&atividade=a', meta: ['Financeiro', '9 subatividades em aberto'], due: 'Venceu 09/09', tags: [] }));
ok('destaque com "!" vira etiqueta', () => assert.deepEqual(parseItem('[Enviar formulário](/empresas?empresa=p&reuniao=m&tarefa=t) — Rafael Souza · venceu 13/08/2025 · A mais antiga!').tags, ['A mais antiga!']));
ok('item sem link nem prazo', () => { const r = parseItem('Piso: 9,21%'); assert.equal(r.href, ''); assert.equal(r.due, ''); });
ok('sem link, título antes do travessão', () => { const r = parseItem('Pauta com a MWM — venceu 28/08'); assert.equal(r.title, 'Pauta com a MWM'); assert.equal(r.due, 'Venceu 28/08'); });
console.log(`\n${n} verificações da leitura dos itens passaram.`);
