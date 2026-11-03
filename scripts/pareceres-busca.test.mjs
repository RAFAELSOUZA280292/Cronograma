// Escolha dos pareceres para a pergunta (server/knowledgeFacts.js): sigla de tributo conta, e entre pareceres do mesmo tema o mais
// recente vem primeiro (02/11/2026: "Qual a alíquota da CBS?" respondia pelo 25/2026 de 9,30% em vez do 29/2026 de 11,3%).
import assert from 'node:assert/strict';
import { pickRelevantPareceres, parecerOrder } from '../server/knowledgeFacts.js';
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const P = (num, txt) => ({ id: num, subject: `Parecer PRICETAX Nº ${num}`, content: `Parecer PRICETAX Nº ${num} — ${txt}` });
const rows = [
  P('25/2026', '"Alíquota de referência da CBS para 2027". Temas: CBS, alíquota de referência, 2027.'),
  P('29/2026', '"Alíquota de referência da CBS de 11,3% para 2027". TCU 11,3468%. Temas: CBS, TCU, alíquota, Senado.'),
  P('20/2026', 'Split payment, CBS e alíquota no recolhimento. Temas: split payment, CBS, alíquota, RAD.'),
  P('21/2026', 'Crédito presumido do produtor rural na CBS. Temas: crédito presumido, CBS.'),
  P('22/2026', 'Cooperativas e alíquota zero de CBS. Temas: cooperativa, ato cooperado, alíquota, CBS.'),
  P('23/2026', 'Cartão corporativo e IBS. Temas: cartão, IBS, alíquota.'),
];
const nums = (q) => pickRelevantPareceres(rows, q).map((r) => r.id);

ok('"Qual a alíquota da CBS?" acha os pareceres da CBS, o 29/2026 primeiro', () => { const r = nums('Qual a aliquota da CBS?'); assert.equal(r[0], '29/2026'); assert.ok(r.includes('25/2026')); });
ok('pergunta mais precisa fica só nos dois da alíquota de referência', () => assert.deepEqual(nums('alíquota da CBS em 2027'), ['29/2026', '25/2026']));
ok('sigla curta (IBS) não é descartada', () => assert.deepEqual(nums('Qual a alíquota do IBS?'), ['23/2026']));
ok('tema raro continua funcionando', () => { assert.deepEqual(nums('como funciona o split payment?'), ['20/2026']); assert.deepEqual(nums('me fale do cartão corporativo'), ['23/2026']); });
ok('pergunta sem tema não puxa parecer', () => assert.deepEqual(nums('bom dia, tudo bem?'), []));
ok('ordem pelo número/ano do parecer', () => { assert.ok(parecerOrder(rows[1]) > parecerOrder(rows[0])); assert.equal(parecerOrder({ subject: 'sem número', content: '' }), 0); });
console.log(`\n${n} verificações da escolha dos pareceres passaram.`);
