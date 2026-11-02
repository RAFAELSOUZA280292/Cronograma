// Revisão de proposta (§131): extenso em pt-BR, número × extenso, soma/parcelas/desconto, datas, citação legal (LC 214/2026), CNPJ e palavras
// repetidas. Puro (sem banco, sem IA).   node scripts/proposal-review.test.mjs
import { intToWords, moneyToWords, wordsToMoney, checkWrittenAmounts, checkSums, checkDates, checkCitations, checkClient, checkWording, cnpjDvOk,
  reviewProposalText, reviewNoteHtml, looksLikeProposal } from '../server/proposalReview.js';

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log(`ok   ${name}`); else { failed += 1; console.log(`FAIL ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`); } };
const eq = (name, got, want) => ok(name, got === want, { got, want });

// extenso
eq('1', moneyToWords(1), 'um real');
eq('0,01', moneyToWords(0.01), 'um centavo');
eq('0,50', moneyToWords(0.5), 'cinquenta centavos');
eq('10,01', moneyToWords(10.01), 'dez reais e um centavo');
eq('100', moneyToWords(100), 'cem reais');
eq('101', moneyToWords(101), 'cento e um reais');
eq('115', intToWords(115), 'cento e quinze');
eq('1.000', moneyToWords(1000), 'mil reais');
eq('1.100 (e antes de centena redonda)', moneyToWords(1100), 'mil e cem reais');
eq('2.050 (e antes de < 100)', moneyToWords(2050), 'dois mil e cinquenta reais');
eq('7.500', moneyToWords(7500), 'sete mil e quinhentos reais');
eq('7.550', moneyToWords(7550), 'sete mil, quinhentos e cinquenta reais');
eq('49.515,50', moneyToWords(49515.5), 'quarenta e nove mil, quinhentos e quinze reais e cinquenta centavos');
eq('1.000.000 (de reais)', moneyToWords(1e6), 'um milhão de reais');
eq('2.000.000', moneyToWords(2e6), 'dois milhões de reais');
eq('1.200.000', moneyToWords(1.2e6), 'um milhão e duzentos mil reais');
eq('1.250.300,99', moneyToWords(1250300.99), 'um milhão, duzentos e cinquenta mil e trezentos reais e noventa e nove centavos');
eq('1.000.001', moneyToWords(1000001), 'um milhão e um reais');
eq('3.014', intToWords(3014), 'três mil e quatorze');

// extenso → número (ida e volta e variações de escrita)
for (const v of [0.5, 1, 12.34, 100, 1100, 7550, 49515.5, 37515.5, 1e6, 1250300.99, 999999.99]) eq(`ida e volta ${v}`, wordsToMoney(moneyToWords(v)), v);
eq('sem vírgula', wordsToMoney('quarenta e nove mil quinhentos e quinze reais e cinquenta centavos'), 49515.5);
eq('catorze / sem acento', wordsToMoney('tres mil e catorze reais'), 3014);
eq('não é valor', wordsToMoney('quinhentos clientes'), null);

// número × extenso — os casos da proposta do Canva
const txt = `[Página 1]
PROPOSTA COMERCIAL — OKUBO
Diagnóstico FULL
Investimento: R$ 49.515,50 (trinta e sete mil, quinhentos e quinze reais e cinquenta centavos)
Consultoria FULL
Investimento: R$ 7.550,00 (sete mil e quinhentos reais)
Treinamento: R$ 3.000,00 (três mil reais)
Base legal: LC 214/2026 e EC 132/2023; Lei Complementar nº 227/2026.
Workshop: Dever de cada para cada área.`;
const w = checkWrittenAmounts(txt);
eq('3 pares número/extenso conferidos', w.conferidos, 3);
eq('2 divergências', w.erros.length, 2);
ok('Diagnóstico: deveria ser quarenta e nove mil…', w.erros[0] && /quarenta e nove mil, quinhentos e quinze reais e cinquenta centavos/.test(w.erros[0].deveria) && /37\.515,50/.test(w.erros[0].deveria), w.erros[0]);
ok('Diagnóstico: onde = item', w.erros[0] && /Diagn/.test(w.erros[0].onde) && /página 1/.test(w.erros[0].onde), w.erros[0] && w.erros[0].onde);
ok('Consultoria: sete mil, quinhentos e cinquenta', w.erros[1] && /sete mil, quinhentos e cinquenta reais/.test(w.erros[1].deveria), w.erros[1]);
ok('extenso antes do número também pareia', checkWrittenAmounts('cinco mil reais (R$ 5.500,00)').erros.length === 1);

// citação legal
const c = checkCitations(txt);
ok('LC 214/2026 vira erro certo com LC 214/2025', c.erros.length === 1 && /214\/2026/.test(c.erros[0].escrito) && /LC 214\/2025/.test(c.erros[0].deveria), c.erros);
ok('EC 132/2023 e LC 227/2026 corretas', c.conferidos === 3, c);
eq('forma "de 16 de janeiro de 2026"', checkCitations('Lei Complementar nº 214, de 16 de janeiro de 2026').erros.length, 1);
eq('LC 214/25 (ano curto) correta', checkCitations('LC 214/25').erros.length, 0);
ok('norma fora da lista não é erro', (() => { const r = checkCitations('Lei 14.999/2025'); return !r.erros.length && r.naoConferidas.length === 1; })());
ok('"Lei 214/2025" pede verificação (é LC)', checkCitations('conforme a Lei 214/2025').verificar.length === 1);

// soma, parcelas e desconto
const s1 = checkSums('Diagnóstico R$ 10.000,00\nImplantação R$ 5.000,00\nTotal: R$ 16.000,00');
ok('total que não bate vai para verificar', s1.verificar.length === 1 && /15\.000,00/.test(s1.verificar[0].deveria), s1);
eq('total que bate', checkSums('Diagnóstico R$ 10.000,00\nImplantação R$ 5.000,00\nTotal: R$ 15.000,00').verificar.length, 0);
eq('total com desconto', checkSums('Diagnóstico R$ 10.000,00\nImplantação R$ 5.000,00\nDesconto R$ 1.000,00\nValor total R$ 14.000,00').verificar.length, 0);
eq('parcelas que batem', checkSums('Valor R$ 12.000,00, em 6 parcelas de R$ 2.000,00').verificar.length, 0);
ok('parcelas que não batem', checkSums('Valor R$ 12.000,00, em 6 parcelas de R$ 2.500,00').verificar.length === 1);
eq('parcelas por extenso', checkSums('Valor R$ 9.000,00 em três parcelas de R$ 3.000,00').verificar.length, 0);
eq('desconto de 10% que bate', checkSums('De R$ 10.000,00 por R$ 9.000,00 (desconto de 10%)').verificar.length, 0);
ok('desconto de 10% que não bate', checkSums('De R$ 10.000,00 por R$ 9.500,00 (desconto de 10%)').verificar.length === 1);

// datas
const d = checkDates('Reunião na segunda-feira, 03/11/2026. Prazo de 10/12/2026 a 05/12/2026. Entrega em 31/02/2027.', { today: '2026-11-02' });
ok('dia da semana errado (03/11/2026 é terça)', d.erros.some((x) => x.tipo === 'Dia da semana' && /terça/.test(x.deveria)), d.erros);
ok('período invertido', d.erros.some((x) => x.tipo === 'Período invertido'));
ok('data inexistente', d.erros.some((x) => x.tipo === 'Data inexistente'));
eq('dia certo passa', checkDates('terça-feira, 03/11/2026', { today: '2026-11-02' }).erros.length, 0);
ok('validade antes da emissão', checkDates('Curitiba, 2 de novembro de 2026. Proposta válida até 30/10/2026.', { today: '2026-11-02' }).erros.some((x) => x.tipo === 'Validade da proposta'));
ok('ano antigo vai para verificar', checkDates('Início em 10/01/2020', { today: '2026-11-02' }).verificar.length === 1);
eq('ano antigo de lei não é alerta', checkDates('Lei 5.764, de 16 de dezembro de 1971', { today: '2026-11-02' }).verificar.length, 0);

// cliente
ok('DV de CNPJ', cnpjDvOk('11.222.333/0001-81') && !cnpjDvOk('11.222.333/0001-82'));
ok('CNPJ alfanumérico (exemplo da RFB)', cnpjDvOk('12.ABC.345/01DE-35'));
const k = checkClient('Cliente: OKUBO MERCANTIL LTDA, CNPJ 11.222.333/0001-82', { legalName: 'Okubo Mercantil Produtos Industriais Ltda', tradeName: 'OKUBO', cnpj: '11222333000181' });
ok('CNPJ com DV errado é erro certo', k.erros.length === 1 && k.erros[0].tipo === 'CNPJ inválido', k);
ok('CNPJ diferente do CRM vai para verificar', k.verificar.some((x) => x.tipo === 'CNPJ do cliente'), k.verificar);
ok('nome fantasia encontrado', !k.verificar.some((x) => x.tipo === 'Nome do cliente'));
ok('nome ausente vai para verificar', checkClient('Proposta para a empresa XYZ', { legalName: 'Kuhn do Brasil S/A' }).verificar.some((x) => x.tipo === 'Nome do cliente'));

// linguagem determinística
const lw = checkWording('O diagnóstico de de cada área será entregue. A equipe fará o levantamento para.');
ok('palavra repetida', lw.erros.length === 1 && /de de/.test(lw.erros[0].escrito), lw.erros);
ok('frase terminando em preposição', lw.verificar.length === 1, lw.verificar);

// revisão completa + nota
const r = reviewProposalText(txt, { company: { legalName: 'Okubo Mercantil Ltda' }, today: '2026-11-02' });
eq('revisão completa: 3 erros certos (2 extensos + LC)', r.erros.length, 3);
const html = reviewNoteHtml({ fileName: 'Proposta OKUBO.pdf', review: r, language: [{ tipo: 'Frase truncada', onde: 'Workshop', escrito: 'Dever de cada para cada área', deveria: 'Deveres de cada área', certeza: 'erro' }] });
ok('nota: ⚠️, Consta / Deveria constar, sem tag perigosa', /⚠️/.test(html) && /Consta:/.test(html) && /Deveria constar:/.test(html) && /Erros identificados/.test(html) && !/<script/i.test(html));
ok('nota: 4 erros (3 + linguagem)', /<strong>4 erro\(s\)<\/strong>/.test(html), html.slice(0, 400));
ok('nota escapa HTML do documento', !/<b>x/.test(reviewNoteHtml({ fileName: '<b>x', review: { erros: [], verificar: [], conferidos: {} } })));
ok('parece proposta', looksLikeProposal('Proposta OKUBO.pdf', '') && looksLikeProposal('doc.pdf', 'Proposta comercial R$ 1.000,00') && !looksLikeProposal('contrato social.pdf', 'Cláusula primeira'));

console.log(failed ? `\n${failed} falha(s)` : '\nproposal-review: tudo certo');
process.exit(failed ? 1 : 0);
