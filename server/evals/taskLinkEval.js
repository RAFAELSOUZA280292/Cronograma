// Avaliação de qualidade da sugestão tarefa → atividade (Fase 5 do plano, 2026-10-13; docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md).
// Empresa SINTÉTICA ("Empresa Modelo", sem dado de cliente) com atividades no estilo dos cronogramas reais da PRICETAX (as que o Rafael
// listou: Kickoff, Envio de dados, Apresentação prévia AR/DR, Workshop, Compras, Análise, Validação documental, Comitê da reforma…) e
// ~35 tarefas com a atividade esperada. Roda o MESMO caminho de produção (`suggestActivityLinks`) — nunca uma cópia — e mede cobertura,
// precisão, falso-positivo e o critério de liberação do plano ("só liberar passando"). Sem gravar nada no banco.
// ATENÇÃO: as respostas esperadas são a leitura de quem montou o conjunto; a CONFERÊNCIA À MÃO é do time (ajuste `accept` abaixo).
import { suggestActivityLinks } from '../taskLinkSuggest.js';

export const EVAL_PHASES = [{ id: 1, name: 'Leitura Real' }, { id: 2, name: 'Mão na Massa por Área' }, { id: 3, name: 'Consolidação' }];

const A = (id, phase, title, desc, responsible) => ({ id, phase, title, desc, responsible, date: '', status: 'nao-iniciado' });
export const EVAL_ACTIVITIES = [
  A('e-kick', 1, 'Kickoff', 'Reunião de abertura com a diretoria e as áreas', 'PRICETAX'),
  A('e-envio', 1, 'Envio de dados', 'Cliente envia SPED, XML e bases de vendas e compras', 'Cliente'),
  A('e-previa', 1, 'Apresentação prévia', 'Primeira devolução do número geral ao cliente', 'PRICETAX'),
  A('e-ar', 1, 'Apresentação prévia AR', 'Resultado do cenário Antes da Reforma (AR)', 'PRICETAX'),
  A('e-dr', 1, 'Apresentação DR', 'Resultado do cenário Depois da Reforma (DR)', 'PRICETAX'),
  A('e-work', 2, 'Workshop', 'Workshop prático com as áreas', 'PRICETAX'),
  A('e-compras', 2, 'Compras', 'Fornecedores que vão subir e descer de preço, item por item', 'Compras'),
  A('e-analise', 2, 'Análise', 'Análise das divergências e dos números do cliente', 'PRICETAX'),
  A('e-valid', 2, 'Validação documental', 'Conferência dos documentos fiscais enviados', 'PRICETAX'),
  A('e-fiscal', 2, 'Fiscal / Tributário', 'cClassTrib, CST e cadastro fiscal', 'Fiscal'),
  A('e-fin', 2, 'Financeiro', 'Nota de débito e crédito, caixa', 'Financeiro'),
  A('e-vendas', 2, 'Vendas', 'Novos preços de venda por produto, cliente e canal', 'Comercial'),
  A('e-juridico', 2, 'Jurídico', 'Contratos e cláusulas de repactuação', 'Jurídico'),
  A('e-log', 2, 'Logística', 'Malha, centros de distribuição e rotas', 'Logística'),
  A('e-ctrl', 2, 'Controladoria', 'DRE reformada e indicadores executivos', 'Controladoria'),
  A('e-sist', 3, 'Adaptação de sistemas', 'Parametrização e homologação final do ERP', 'TI'),
  A('e-duvidas', 3, 'Tira-dúvidas geral', 'Todas as áreas juntas para fechar pendências soltas', 'Todas'),
  A('e-comite', 3, 'Comitê da reforma', 'Comitê de decisão com a diretoria', 'Diretoria'),
  A('e-fim', 3, 'Encerramento', 'Retrospectiva do ano e plano do Ano 2', 'Diretoria'),
];

// accept = ids aceitos (mais de um quando a fronteira entre duas atividades é legítima); accept: [] = nenhuma atividade se aplica.
const C = (title, accept, extra = {}) => ({ title, accept, ...extra });
export const EVAL_CASES = [
  C('Agendar a reunião de kickoff com a diretoria do cliente', ['e-kick']),
  C('Levantar os contatos de cada área para a abertura do projeto', ['e-kick']),
  C('Cliente enviar os SPEDs de 2025 e a base de vendas', ['e-envio'], { owner: 'cliente' }),
  C('Enviar os XMLs das notas de compra dos últimos 12 meses', ['e-envio'], { owner: 'cliente' }),
  C('Confirmar quais arquivos ainda faltam no envio de dados', ['e-envio']),
  C('Montar a apresentação prévia com o número geral do impacto', ['e-previa', 'e-ar', 'e-dr']),
  C('Apresentar ao cliente o resultado do cenário AR, antes da reforma', ['e-ar', 'e-previa']),
  C('Revisar a carga tributária atual do AR com o time fiscal', ['e-ar', 'e-analise'], { area: 'Fiscal' }),
  C('Preparar a apresentação do DR, depois da reforma, com o ganho de crédito', ['e-dr']),
  C('Simular o cenário DR com as alíquotas de IBS e CBS', ['e-dr', 'e-analise']),
  C('Agendar o workshop com as áreas de compras e fiscal', ['e-work']),
  C('Preparar o material do workshop com exemplos de notas fiscais', ['e-work']),
  C('Levantar a lista dos 20 maiores fornecedores e o regime tributário de cada um', ['e-compras'], { area: 'Compras' }),
  C('Simular o impacto no preço de compra dos fornecedores do Simples', ['e-compras'], { area: 'Compras' }),
  C('Renegociar o prazo de pagamento com os fornecedores de insumos', ['e-compras', 'e-fin']),
  C('Analisar as divergências entre o SPED e a base de vendas enviada', ['e-analise', 'e-valid']),
  C('Conciliar os valores de ICMS entre o livro fiscal e a base', ['e-analise', 'e-valid', 'e-fiscal']),
  C('Validar com o cliente se as notas de devolução foram todas enviadas', ['e-valid', 'e-envio']),
  C('Conferir as NF-e canceladas e inutilizadas no período', ['e-valid']),
  C('Preparar a pauta do comitê da reforma com a diretoria', ['e-comite']),
  C('Apresentar ao comitê as decisões sobre preço de venda', ['e-comite', 'e-vendas']),
  C('Revisar o cClassTrib e o CST dos produtos com o time fiscal', ['e-fiscal'], { area: 'Fiscal' }),
  C('Corrigir o cadastro de NCM dos itens com CST errado', ['e-fiscal'], { area: 'Fiscal' }),
  C('Adaptar a emissão de nota de débito e de crédito no financeiro', ['e-fin'], { area: 'Financeiro' }),
  C('Projetar o impacto da reforma no fluxo de caixa do cliente', ['e-fin', 'e-dr'], { area: 'Financeiro' }),
  C('Definir os novos preços de venda por canal', ['e-vendas'], { area: 'Comercial' }),
  C('Comunicar os clientes sobre o reajuste de preços', ['e-vendas'], { area: 'Comercial' }),
  C('Fazer a retrospectiva do ano com a diretoria', ['e-fim']),
  C('Montar o plano do Ano 2 do projeto', ['e-fim']),
  C('Revisar as cláusulas de repactuação dos contratos de fornecimento', ['e-juridico'], { area: 'Jurídico' }),
  C('Mapear as rotas e os centros de distribuição que mudam de custo', ['e-log'], { area: 'Logística' }),
  C('Montar a DRE reformada e os indicadores executivos', ['e-ctrl'], { area: 'Controladoria' }),
  C('Parametrizar o ERP para os novos campos de IBS e CBS', ['e-sist'], { area: 'TI' }),
  C('Homologar a emissão de NF-e com os novos campos no sistema', ['e-sist', 'e-fiscal'], { area: 'TI' }),
  C('Fechar as pendências soltas com todas as áreas', ['e-duvidas']),
  C('Responder as dúvidas do financeiro e do fiscal sobre o cenário DR', ['e-duvidas', 'e-dr']),
  C('Confirmar quem do cliente participa do workshop', ['e-work'], { owner: 'cliente' }),
  C('Mandar o contrato social atualizado da empresa', ['e-envio', 'e-valid'], { owner: 'cliente' }),
  // Casos difíceis (fronteiras e armadilhas de palavra-chave): servem para o teste distinguir uma IA que lê de uma regra que casa palavras.
  C('Preparar o número do AR para levar na apresentação prévia', ['e-ar', 'e-previa']),
  C('Pedir ao cliente os XMLs de venda que ainda faltam', ['e-envio'], { owner: 'cliente' }),
  C('Ver com o fiscal qual CST usar no produto de exportação no cenário DR', ['e-fiscal', 'e-dr']),
  C('Calcular o ganho de crédito das compras no DR por fornecedor', ['e-dr', 'e-compras', 'e-analise']),
  C('Revisar o contrato com o fornecedor principal antes do workshop', ['e-juridico', 'e-compras', 'e-work']),
  C('Cobrar o time do cliente pelos arquivos que ficaram faltando', ['e-envio', 'e-valid']),
  // Nenhuma atividade se aplica: sugerir aqui é falso-positivo.
  C('Marcar o almoço de confraternização com a equipe', []),
  C('Renovar o certificado digital da empresa', []),
  C('Enviar a nota fiscal de serviço da PRICETAX ao cliente', []),
  C('Pagar a anuidade do sistema de gravação de reuniões', []),
  C('Atualizar o e-mail da Ana no cadastro de contatos', []),
  C('Ligar para o contador sobre o fechamento de outro cliente', []),
  C('Alinhar os próximos passos com a Ana', []),
  C('Enviar a ata da reunião para o grupo', []),
  C('Comprar as passagens para a visita ao cliente', []),
  C('Pagar o fornecedor de café do escritório', []),
  C('Enviar o contrato da PRICETAX para assinatura do cliente', []),
  C('Contratar um freelancer para formatar os slides', []),
].map((c, i) => ({ id: `ec${String(i + 1).padStart(2, '0')}`, owner: 'pricetax', area: '', ...c }));

// Critério de liberação (plano, Fase 5): só liberar passando. Valores conservadores; ajuste junto com o time depois de ver o 1º relatório.
export const RELEASE_GATE = { minPrecision: 0.85, minHighPrecision: 0.9, minHighN: 8, maxFalsePositive: 0.25, minCoverage: 0.6 };

const pct = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

// Função pura: métricas a partir de {case, got:{activityId,confidence,source}|null}.
export function scoreEval(results, gate = RELEASE_GATE) {
  const pos = results.filter((r) => r.case.accept.length);
  const neg = results.filter((r) => !r.case.accept.length);
  const sugPos = pos.filter((r) => r.got);
  const ok = (r) => r.got && r.case.accept.includes(r.got.activityId);
  const high = sugPos.filter((r) => r.got.confidence >= 0.8);
  const fp = neg.filter((r) => r.got);
  const m = {
    total: results.length, positives: pos.length, negatives: neg.length,
    suggested: sugPos.length, correct: sugPos.filter(ok).length,
    coverage: pct(pos.length ? sugPos.length / pos.length : null),
    precision: pct(sugPos.length ? sugPos.filter(ok).length / sugPos.length : null),
    high: { n: high.length, precision: pct(high.length ? high.filter(ok).length / high.length : null) },
    falsePositive: pct(neg.length ? fp.length / neg.length : null), falsePositiveN: fp.length,
    bySource: {},
  };
  for (const src of ['ia', 'aprendido', 'regra']) {
    const l = sugPos.filter((r) => r.got.source === src);
    m.bySource[src] = { n: l.length, precision: pct(l.length ? l.filter(ok).length / l.length : null) };
  }
  const checks = [
    { id: 'precision', label: `Precisão das sugestões ≥ ${gate.minPrecision * 100}%`, value: m.precision, pass: m.precision != null && m.precision >= gate.minPrecision },
    { id: 'high', label: `Precisão com confiança ≥ 80% ≥ ${gate.minHighPrecision * 100}% (mín. ${gate.minHighN} casos)`, value: m.high.precision, pass: m.high.n >= gate.minHighN && m.high.precision >= gate.minHighPrecision },
    { id: 'fp', label: `Sugeriu em tarefa sem atividade ≤ ${gate.maxFalsePositive * 100}%`, value: m.falsePositive, pass: m.falsePositive != null && m.falsePositive <= gate.maxFalsePositive },
    { id: 'coverage', label: `Cobertura (sugeriu quando havia atividade) ≥ ${gate.minCoverage * 100}%`, value: m.coverage, pass: m.coverage != null && m.coverage >= gate.minCoverage },
  ];
  const label = (id) => (EVAL_ACTIVITIES.find((a) => a.id === id) || {}).title || id;
  const failures = results.filter((r) => (r.case.accept.length ? (r.got && !ok(r)) : !!r.got)).map((r) => ({
    id: r.case.id, title: r.case.title, expected: r.case.accept.length ? r.case.accept.map(label).join(' ou ') : '(nenhuma)',
    got: r.got ? label(r.got.activityId) : '', confidence: r.got ? r.got.confidence : null, source: r.got ? r.got.source : '',
  }));
  const missed = pos.filter((r) => !r.got).map((r) => ({ id: r.case.id, title: r.case.title, expected: r.case.accept.map(label).join(' ou ') }));
  return { metrics: m, checks, passed: checks.every((c) => c.pass), failures, missed };
}

// `client` real em produção; null = só a regra de reserva (linha de base sem IA). `learn` = exemplos do aprendizado (opcional).
export async function runTaskLinkEval({ client, learn } = {}) {
  const tasks = EVAL_CASES.map((c) => ({ id: c.id, title: c.title, area: c.area, owner: c.owner, responsible: '' }));
  const t0 = Date.now();
  const res = await suggestActivityLinks({
    client: client || null, activities: EVAL_ACTIVITIES, phases: EVAL_PHASES, tasks,
    meeting: { title: 'Reunião de acompanhamento (avaliação)', summary: 'Alinhamento de próximos passos do projeto de Reforma Tributária.' },
    learn: learn || null,
  });
  const results = EVAL_CASES.map((c) => ({ case: c, got: res.suggestions[c.id] || null }));
  return { ...scoreEval(results), usedAI: res.usedAI, aiError: res.aiError || '', usage: res.usage, ms: Date.now() - t0, cases: EVAL_CASES.length };
}
