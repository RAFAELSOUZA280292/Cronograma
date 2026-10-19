// Proposta v4 do cronograma padrão — "modelo ideal do comitê de reforma tributária" (2026-10-19, decidido com o Rafael em telas de validação; ver PROJECT_CONTEXT §65).
// 8 etapas (contratação, descoberta, diagnóstico, decisões e desenho, implementação, homologação e treinamento, prontidão e virada, operação assistida) em 6 fases + o comitê como
// frente transversal (fase 07). Agenda por área: entrevista, oficina de decisão, validação do desenho, teste de aceite, treinamento, prontidão e rotina. As 92 subatividades da v3
// são redistribuídas pela regra do verbo (a B13.1 é substituída pelo treinamento por área) e entram 102 novas; cada encontro leva o seu roteiro (campo `guide`).
// Prazos: dias corridos contados da assinatura do contrato (D+0), 8 meses (D+0 a D+242), virada em D+150 (contrato assinado 5 meses antes; 3 meses de operação assistida depois).
// O início de referência é 04/08/2026 (01/01/2027 = D+150). Dado puro, sem dependências além da v3.
import { ITEMS as V3_ITEMS } from './cronogramaPadraoV3.js';

export const V4_KICKOFF = '2026-08-04';
export const VIRADA_DAY = 150;
export const TOTAL_DAY = 242;
export const TEAM = ['PRICETAX', 'Cliente', 'Compras', 'Comercial', 'Financeiro', 'Fiscal', 'Jurídico', 'Logística', 'Controladoria', 'Contábil', 'RH', 'TI', 'Diretoria', 'Todas', 'Cadastros', 'Comex'];

export const PHASES = [
  { id: 1, name: 'Diagnóstico PRICETAX', sub: 'Mobilização, descoberta e diagnóstico aprovado pela diretoria (D+0 a D+67)', color: '#ff9f40' },
  { id: 2, name: 'Decisões e desenho', sub: 'Decisões registradas por área e requisitos entregues ao ERP (até D+95)', color: '#3ea6ff' },
  { id: 3, name: 'Implementação', sub: 'Cada frente fecha o seu checklist de construção (até D+125)', color: '#F5C400' },
  { id: 4, name: 'Homologação e treinamento', sub: 'Testes aprovados pelas áreas e equipes treinadas (até D+140)', color: '#3ecf6e' },
  { id: 5, name: 'Prontidão e virada', sub: 'Ata de prontidão (D+140); a reforma entra em vigor em D+150 de qualquer forma', color: '#e2574c' },
  { id: 6, name: 'Operação assistida', sub: 'Primeira apuração, ciclo mensal acompanhado e encerramento aos 8 meses (D+242)', color: '#b98af5' },
  { id: 7, name: 'Comitê de reforma tributária (transversal)', sub: 'Reunião mensal com a empresa e acompanhamento, do primeiro ao último dia', color: '#888780' },
];

// [chave, fase, título, responsável, [início, fim], descrição]
export const MAINS = [
  ['kickoff', 1, 'Kickoff e governança', 'PRICETAX', [0, 4], 'Boas-vindas, kickoff com a diretoria, responsável por área nomeado, comitê instituído e alinhamento com o fornecedor do ERP.'],
  ['dados', 1, 'Dados do cliente', 'Cliente', [5, 14], 'Recebimento e conferência dos dados e documentos: EFDs de todos os estabelecimentos e períodos, registros consolidados contra os de cada filial, XML e documentação extra.'],
  ['entrevistas', 1, 'Entrevistas com as áreas', 'PRICETAX', [15, 34], 'Entrevista estruturada com todas as áreas, com roteiro próprio; cada uma entrega o inventário da área e as lacunas com dono.'],
  ['inventarios', 1, 'Validação documental e inventários', 'PRICETAX', [35, 44], 'Operações, benefícios, saldos credores, fluxos e demais inventários completos e validados com o cliente. Depois daqui não se descobre mais nada.'],
  ['cenarios', 1, 'Cenários e número geral', 'PRICETAX', [45, 54], 'Cenários de compras, vendas, DRE e caixa, número geral e estudo de fluxo de caixa.'],
  ['apresentacao', 1, 'Apresentação prévia', 'PRICETAX', [55, 57], 'Apresentação prévia dos cenários ao cliente, antes do relatório final.'],
  ['workshop', 1, 'Workshop por áreas', 'PRICETAX', [58, 62], 'Passa o diagnóstico para as áreas: mitos e verdades, transição, split payment, benefícios fiscais e casos práticos.'],
  ['report', 1, 'Report final e plano de ação', 'PRICETAX', [63, 67], 'Relatório final com o plano de ação por frente, com dono e data.'],
  ['oficinas', 2, 'Oficinas de decisão com as áreas', 'PRICETAX', [68, 85], 'Uma oficina por área para mostrar o impacto e decidir as políticas; as decisões de preço, compras, financeiro, contábil e contratos saem daqui. Inclui, quando a diretoria pedir, a avaliação de investimentos e estrutura societária.'],
  ['desenho', 2, 'Desenho dos processos e requisitos', 'PRICETAX', [72, 90], 'Processos futuros por área, matriz de operações e requisitos entregues ao ERP e ao fornecedor.'],
  ['validacao', 2, 'Validação do desenho com as áreas', 'PRICETAX', [80, 95], 'Cada área confirma que o desenho reflete a decisão e a operação real antes de construir.'],
  ['erp', 3, 'Sistemas: base do ERP', 'TI', [70, 87], 'Ambiente de homologação, tabelas oficiais, CNPJ alfanumérico e tabelas de alíquotas e CFOP.'],
  ['docs', 3, 'Sistemas: documentos fiscais', 'TI', [80, 125], 'NF-e, DANFE, devolução, validação cadastral, notas de débito e crédito, eventos, NFS-e, CT-e e importação. Inclui o tratamento do adiantamento no ERP.'],
  ['fiscal', 3, 'Fiscal e tributário', 'Fiscal', [88, 125], 'Parametrização fiscal inteira: regras por NCM, benefícios, 2027, conferência de notas, apuração, obrigações acessórias e CSRF. Inclui o monitoramento mensal da situação fiscal de fornecedores e clientes.'],
  ['cadastros', 3, 'Cadastros', 'Fiscal', [89, 115], 'Fornecedores com regime, itens com NCM e NBS, clientes com regime e Zona Franca.'],
  ['compras', 3, 'Compras', 'Compras', [90, 110], 'Negociação com base na simulação e cotação por menor custo após crédito. Inclui a carta a cada fornecedor e a atualização do pedido de compra e da tabela de janeiro.'],
  ['vendas', 3, 'Vendas e preço', 'Comercial', [91, 118], 'Argumento comercial, formação de preço pelo valor líquido e base de comissões.'],
  ['financeiro', 3, 'Financeiro e caixa', 'Financeiro', [92, 120], 'Títulos separados, contas a pagar e a receber, orçamento de caixa e relatório de crédito. Inclui o programa de conformidade do ressarcimento e a projeção do fim do diferimento do ICMS, quando houver.'],
  ['contabil', 3, 'Contábil e controladoria', 'Contábil', [93, 120], 'Plano de contas e de-para, DRE e orçamento e checklist mensal de fechamento. Inclui o ajuste do módulo de custo do ERP.'],
  ['juridico', 3, 'Jurídico e contratos', 'Jurídico', [94, 110], 'Revisão de contratos, tabelas e propostas com a cláusula tributária. Inclui a renegociação com prestadores de benefícios e a revisão dos contratos de frete.'],
  ['testes', 4, 'Testes e contingência', 'Todas', [105, 135], 'Testes integrados em homologação, repetição quando a alíquota da CBS for publicada e plano de contingência.'],
  ['aceite', 4, 'Validação por área (aceite)', 'Todas', [108, 138], 'Cada área testa seus fluxos reais no ambiente de homologação e dá o aceite.'],
  ['treinamento', 4, 'Treinamento e comunicação', 'PRICETAX', [118, 140], 'Treinamento de cada área nos novos procedimentos e comunicação a clientes e fornecedores.'],
  ['prontidao', 5, 'Prontidão da virada', 'Diretoria', [126, 149], 'Avaliação de prontidão de cada área, pendências aceitas com contingência, plano de suporte, ata e corte contábil. A reforma entra em vigor de qualquer forma.'],
  ['operacao', 6, 'Operação assistida e rotina', 'PRICETAX', [150, 242], 'Primeira apuração, ciclo mensal acompanhado, recuperação de créditos, reforço de treinamento e encerramento com a passagem para a rotina. Inclui a conferência da primeira nota de 2027, o indicador de repasse e o plano anual de monetização do ICMS.'],
  ['comite', 7, 'Comitê de reforma tributária', 'Diretoria', [0, 242], 'Reunião mensal com a empresa (aprova o portão da etapa), acompanhamento semanal, registro vivo de decisões, riscos e pendências e vigília das normas.'],
];

// Destino das 92 subatividades da v3 (a B13.1 é substituída pelo treinamento por área).
const DEST = {};
const put = (codes, main) => codes.split(' ').forEach((c) => { DEST[c] = main; });
put('A1.0 A1.1 A1.2 A1.3', 'kickoff'); put('A2.1 A2.2 A2.3', 'dados');
put('A3.1 A3.2 A3.3 B4.1 B4.9 B4.11 B4.12 B11.1 B12.1', 'inventarios'); put('A4.1 A4.2 A4.3 B6.1 B11.2 B11.3', 'cenarios');
put('A5.1', 'apresentacao'); put('A6.1 A6.2', 'workshop'); put('A7.1 A7.2', 'report');
put('B3.10 B6.4 B7.2 B7.4 B7.5 B8.1 B9.2 B9.5 B10.1 B1.1', 'oficinas');
put('B2.1 B2.2 B2.3 B2.4', 'erp'); put('B3.1 B3.2 B3.3 B3.4 B3.5 B3.6 B3.7 B3.8 B3.9', 'docs'); put('B4.2 B4.3 B4.4 B4.5 B4.6 B4.7 B4.8 B4.13', 'fiscal');
put('B5.1 B5.2 B5.3', 'cadastros'); put('B6.2 B6.3', 'compras'); put('B7.1 B7.3 B7.6', 'vendas'); put('B8.2 B8.3 B8.4 B8.7', 'financeiro');
put('B9.1 B9.3 B9.6', 'contabil'); put('B10.2', 'juridico'); put('B14.1 B14.2 B14.3 B14.5', 'testes'); put('B7.7', 'treinamento');
put('B1.2 B1.3 B13.2 B9.4', 'prontidao'); put('B15.1 B15.2 B15.3 B15.4 B8.5 B8.6 B14.4', 'operacao'); put('B4.10', 'comite');

// Predecessoras que mudam por causa da nova ordem (a decisão agora vem antes da construção).
// Ajustes de título pedidos pelo cruzamento com o Tecumseh (2026-10-19): cada função recebe o título da v3 e devolve o novo.
const TITLE_FIX = {
  'B11.1': (t) => `${t}; confirmar como a parcela do empregado entra no eSocial`,
  'A2.3': (t) => `${t} e classificá-los por risco de crédito`,
  'B6.2': (t) => `${t}, e alinhar o prazo de pagamento ao giro do crédito`,
  'B7.3': (t) => `${t}; revisar ano a ano a política regional de preço pelo destino do IBS`,
  'B8.7': (t) => `${t}, com o estoque de crédito e o prazo médio de recuperação para a pauta da diretoria`,
  'B10.1': (t) => `${t} e a de compensar a CBS com outros tributos federais`,
  'B7.5': (t) => `Levantar os contratos com pagamento antecipado e ${t.charAt(0).toLowerCase()}${t.slice(1)}`,
  'B8.6': (t) => `${t} e o split entre empresas do grupo, quando houver (2028)`,
  'B8.3': (t) => `${t} e rever os prazos de pagamento e recebimento por causa do split`,
  'B15.4': (t) => `${t.replace(' e o plano da rotina contínua', ', o plano da rotina contínua')} e o plano de execução e acompanhamento de 2027 a 2033`,
};
const PRED_FIX = { 'B9.2': [], 'B9.1': ['B9.2'], 'B9.5': ['B4.9'] };
// Ordem dentro de cada atividade (os que não aparecem vão no fim, na ordem da v3).
const ORDER = {
  inventarios: ['A3.1', 'B4.1', 'B11.1', 'B12.1', 'B4.9', 'B4.11', 'B4.12', 'A3.2', 'A3.3'],
  cenarios: ['A4.1', 'B6.1', 'B11.2', 'B11.3', 'A4.2', 'A4.3'],
  testes: ['B14.1', 'B14.3', 'B14.5', 'B14.2'],
};
// Datas fixas (D+n) onde o dia importa.
const FIXED = { 'B1.3': 140, 'B9.4': 149, 'B13.2': 139, 'B1.2': 138, 'B4.10': 133, 'B15.1': 206, 'B15.2': 215, 'B8.5': 180, 'B8.6': 200, 'B14.4': 170, 'B15.3': 238, 'B15.4': 242 };

const AREAS = [
  { n: 'Diretoria e CFO', k: 'DIR', r: 'Diretoria', m: 'EDRPA', q: ['O que a diretoria espera do comitê e em que prazo de decisão?', 'Qual o apetite de risco e as metas de margem e caixa?', 'Como reportar ao conselho?'], d: ['Política geral de repasse ao preço', 'Alçadas e frentes prioritárias'], e: ['Patrocinador e membros do comitê', 'Metas e calendário de reuniões'] },
  { n: 'Fiscal e tributário', k: 'FIS', r: 'Fiscal', m: 'EDVTRPA', q: ['Quais operações e CFOP existem (venda, serviço, transferência, remessa, importação, industrialização)?', 'Quais benefícios e regimes especiais?', 'Qual o saldo credor por tributo e quais teses ou autuações abertas?', 'Quais obrigações e quem as faz?'], d: ['Tratamento de cada operação', 'Uso dos benefícios e destino dos saldos credores'], e: ['Matriz de operações', 'Inventário de benefícios, saldos credores e obrigações'] },
  { n: 'Contábil e controladoria', k: 'CTB', r: 'Contábil', m: 'EDVTRPA', q: ['Como é o plano de contas e o fechamento?', 'Quais provisões e estoques são afetados?', 'Como o orçamento trata os tributos?'], d: ['Contabilização das novas contas', 'Tratamento dos saldos antigos, DRE e orçamento'], e: ['Plano de contas e de-para', 'Rotina de fechamento e impacto na DRE'] },
  { n: 'Financeiro e tesouraria', k: 'FIN', r: 'Financeiro', m: 'EDVTRPA', q: ['Quais os prazos de pagamento e recebimento e as retenções?', 'Como o caixa reage ao tributo por fora e ao split payment?', 'Quem são os bancos e as credenciadoras?'], d: ['Política de recolhimento pelo adquirente', 'Títulos separados e orçamento de caixa do primeiro trimestre'], e: ['Fluxo de caixa de um mês-base', 'Contratos com bancos e rotina de contas a pagar e receber'] },
  { n: 'Compras e suprimentos', k: 'CPR', r: 'Compras', m: 'EDVTRPA', q: ['Qual a curva ABC de fornecedores e o regime de cada um (Simples, Presumido, Real)?', 'Quais contratos de fornecimento têm cláusula tributária?', 'Há importação e regime aduaneiro?', 'Como entram uso e consumo e ativo?'], d: ['Estratégia por fornecedor e renegociação', 'Consolidar os fornecedores que repassam a redução', 'Quando comprar de quem'], e: ['Base de fornecedores com regime e crédito', 'Simulação de custo atual contra o novo'] },
  { n: 'Comercial e vendas', k: 'CML', r: 'Comercial', m: 'EDVTRPA', q: ['Como e onde o preço é formado?', 'Quais tabelas, descontos, bonificações e comissões?', 'Qual o perfil dos clientes (regime, Zona Franca, exportação)?', 'Quais contratos e adiantamentos?'], d: ['Política de preço por perfil de cliente', 'Comunicação e comissões'], e: ['Tabelas e contratos de venda', 'Perfil de clientes e regras de preço'] },
  { n: 'TI e ERP', k: 'TI', r: 'TI', m: 'EDVTPA', q: ['Quais sistemas e integrações existem?', 'Qual a versão do ERP e o cronograma do fornecedor?', 'Quais customizações calculam imposto?', 'Quais ambientes de teste?'], d: ['O que o ERP faz e o que fica fora dele', 'Janela de congelamento'], e: ['Mapa de sistemas e integrações', 'Plano do fornecedor e lista de customizações'] },
  { n: 'Jurídico e contratos', k: 'JUR', r: 'Jurídico', m: 'EDVPA', q: ['Quais contratos têm cláusula tributária e vigência longa?', 'Quais teses e contencioso tributário?', 'Quais normas acompanhar?'], d: ['Cláusula-padrão', 'Quais contratos renegociar e quais teses manter'], e: ['Inventário de contratos relevantes', 'Inventário do contencioso tributário'] },
  { n: 'RH e folha', k: 'RH', r: 'RH', m: 'EDVRA', q: ['Quais benefícios existem e o que dizem as convenções coletivas?', 'A parcela do empregado nos benefícios entra no eSocial?', 'Há terceirização e mão de obra própria?', 'Como está a folha e a desoneração?'], d: ['O que levar ao acordo coletivo', 'Redesenho dos benefícios sem nota (saúde, creche, PCD, viagens) para gerar crédito', 'Mão de obra própria ou contratada'], e: ['Benefícios e contratos de terceiros, com custo e crédito potencial'] },
  { n: 'Logística e operações', k: 'LOG', r: 'Logística', m: 'EDVTRPA', q: ['Quais fluxos físicos existem (transferência, remessa, retorno, devolução)?', 'Como são os fretes e as transportadoras?', 'Quais armazéns e centros de distribuição?', 'Quais documentos acompanham a mercadoria?'], d: ['Ajustes de fluxo', 'Revisão da malha e dos prazos com o crédito do frete', 'Quem emite cada documento'], e: ['Fluxos físicos contra documentos', 'Contratos de frete e locais de estoque'] },
  { n: 'Cadastros e dados mestres', k: 'CAD', r: 'Cadastros', m: 'EDVTRPA', q: ['Qual a qualidade de NCM, NBS e origem dos itens?', 'Há regime de fornecedores e clientes no cadastro?', 'Quem mantém o cadastro?'], d: ['Campos obrigatórios', 'Rotina de atualização'], e: ['Base de itens, fornecedores e clientes com as lacunas'] },
  { n: 'Comércio exterior', k: 'CEX', r: 'Comex', m: 'EDVTPA', opt: true, q: ['Há importação (DUIMP), exportação, Recof, drawback ou Zona Franca?', 'Quais os regimes e os créditos de cada um?'], d: ['Tratamento e crédito por regime'], e: ['Operações e regimes aduaneiros'] },
];
export const AREA_NAMES = AREAS.map((a) => a.n);
ORDER.oficinas = AREAS.map((x) => `OFI-${x.k}`);
ORDER.dados = ['A2.1', 'A2.2', 'INT-1', 'INT-2', 'INT-3', 'INT-4', 'INT-5', 'A2.3'];
ORDER.treinamento = [...AREAS.filter((x) => x.m.includes('R')).map((x) => `TRE-${x.k}`), 'B7.7'];
const SECOND_ROUND = ['Fiscal e tributário', 'Financeiro e tesouraria', 'Compras e suprimentos', 'Comercial e vendas', 'TI e ERP'];

const bullets = (xs) => xs.map((x) => `- ${x}`).join('\n');
function guide(type, a, variant) {
  const opt = a.opt ? ' (quando houver)' : '';
  if (type === 'ent') {
    const op = variant === 'op';
    return [`Objetivo: entender como a área opera hoje e preencher o inventário dela${opt}.`,
      `Quem participa: ${op ? 'consultor PRICETAX e quem executa as rotinas da área' : 'consultor PRICETAX e o responsável da área'}.`,
      `Duração: ${op ? '60 min' : '90 min'}.`,
      'A empresa traz: os documentos pedidos para a área no e-mail inicial, exemplos reais (notas, contratos, relatórios) e a lista de quem executa cada rotina.',
      `Perguntar:\n${bullets(a.q)}`, `Mapear (entrega):\n${bullets(a.e)}`,
      'Sai do encontro: ata no modelo, inventário da área preenchido ou com as lacunas listadas e os riscos percebidos.',
      'Fica registrado em: ata e tarefas na aba Reuniões; inventário anexado na subatividade.',
      'Concluído quando: a ata foi devolvida e validada pelo responsável da área e cada lacuna tem dono.'].join('\n');
  }
  if (type === 'ofi') {
    return [`Objetivo: mostrar o impacto da área e decidir as políticas dela${opt}.`, 'Quem participa: consultor, responsável da área e, quando a alçada exigir, a diretoria.', 'Duração: 2 h.',
      'A empresa traz: poder de decisão e os dados atualizados desde a entrevista.', 'A PRICETAX traz: o impacto em reais da área, as opções com ganhos e riscos e uma recomendação.',
      `Decidir:\n${bullets(a.d)}`, 'Sai do encontro: cada decisão com status (decidida ou adiada), dono e o requisito que ela gera para o ERP.',
      'Fica registrado em: ata na aba Reuniões; decisões no registro vivo do comitê.', 'Concluído quando: todas as decisões da pauta têm status e dono.'].join('\n');
  }
  if (type === 'val') {
    return [`Objetivo: confirmar que o desenho reflete a decisão e a operação real antes de construir${opt}.`, 'Quem participa: consultor, responsável da área, um usuário-chave e a TI quando houver sistema.', 'Duração: 60 a 90 min.',
      'A empresa traz: um usuário-chave que conheça o dia a dia.', 'Sai do encontro: desenho validado, com as ressalvas e as mudanças registradas.',
      'Fica registrado em: ata na aba Reuniões; desenho anexado na subatividade.', 'Concluído quando: o responsável da área deu o aceite.'].join('\n');
  }
  if (type === 'tst') {
    return [`Objetivo: a área testa os fluxos reais no ambiente de homologação${opt}.`, 'Quem participa: o usuário-chave da área executa, o consultor acompanha e a TI corrige.', 'Duração: 2 a 4 h por sessão, quantas forem necessárias.',
      'A empresa traz: o usuário-chave com tempo reservado e o ambiente pronto.', 'A PRICETAX traz: o roteiro de casos, tirado da matriz de operações.',
      'Sai do encontro: resultado por caso (passou ou falhou), defeitos com dono e reteste.', 'Fica registrado em: resultado anexado na subatividade; defeitos viram tarefas.',
      'Concluído quando: todos os casos críticos passaram, ou a falha tem contingência aceita.'].join('\n');
  }
  if (type === 'tre') {
    return ['Objetivo: capacitar a área nos novos procedimentos.', 'Quem participa: o consultor treina e o responsável da área garante a presença.', 'Duração: 2 h, mais o material.',
      'A empresa traz: a lista das pessoas da área e uma sala ou um link.', 'Sai do encontro: lista de presença, material usado e uma avaliação rápida.',
      'Fica registrado em: material e lista anexados na subatividade.', 'Concluído quando: a equipe da área foi treinada, ou os ausentes têm reposição agendada.'].join('\n');
  }
  if (type === 'pro') {
    return [`Objetivo: medir a área contra os critérios de prontidão definidos nas oficinas de decisão${opt}.`, 'Quem participa: consultor e responsável da área.', 'Duração: 60 min.',
      'A empresa traz: os critérios de prontidão e as evidências da área.', 'Sai do encontro: checklist da área (atende, não atende, ou pendência aceita com contingência).',
      'Fica registrado em: checklist anexado; pendências no registro vivo do comitê.', 'Concluído quando: o responsável da área assinou o checklist.'].join('\n');
  }
  if (type === 'rot') {
    return [`Objetivo: ver o primeiro ciclo real da área depois da virada e corrigir o que aparecer${opt}.`, 'Quem participa: consultor e usuário-chave.', 'Duração: 60 min por ciclo mensal.',
      'A empresa traz: o ciclo do mês rodado pela própria área.', 'Sai do encontro: ocorrências, ajustes feitos e indicadores do ciclo.', 'Fica registrado em: ata na aba Reuniões.',
      'Concluído quando: o ciclo fechou sem ocorrência aberta sem dono.'].join('\n');
  }
  return '';
}
const REGISTRO_GUIDE = ['Objetivo: não deixar nada combinado nas reuniões sem dono, prazo e status.',
  'Como registrar a cada reunião:\n1. Cole a transcrição na aba Reuniões (caixa de transcrições) ou crie a reunião à mão. A IA preenche o resumo, o campo "Decisões tomadas" e as tarefas.\n2. Confira o campo "Decisões tomadas" e corrija o que a IA errou.\n3. Nas tarefas, confirme responsável e prazo e escolha o tipo: tarefa, decisão, risco ou pendência.\n4. Vincule cada tarefa à atividade do cronograma a que ela pertence. O que for do próprio comitê vai para "Comitê de reforma tributária".\n5. Na subatividade da reunião (semanal ou mensal), use "Reunião vinculada" para ligar a ata.',
  'Onde consultar: aba Tarefas, filtrando por tipo e por atividade; o detalhe da atividade "Comitê de reforma tributária" lista as tarefas vinculadas; o Dossiê junta todas as reuniões do cliente.',
  'Concluído quando: a ata da última reunião está registrada e nenhuma tarefa, risco ou pendência ficou sem responsável e prazo.'].join('\n');
const WEEKLY_GUIDE = ['Objetivo: acompanhar o andamento entre as reuniões mensais.', 'Quem participa: coordenador da PRICETAX e os responsáveis das áreas com frente aberta.', 'Duração: 30 min.',
  'Pauta: o que venceu e o que vence na semana; riscos novos; bloqueios que precisam da diretoria.', 'Sai do encontro: tarefas novas com dono e prazo e pendências atualizadas.',
  'Fica registrado em: ata curta na aba Reuniões e tarefas vinculadas à atividade "Comitê de reforma tributária". Esta subatividade é recorrente: ligue-a à reunião mais recente em "Reunião vinculada".',
  'Concluído quando: a reunião da semana foi registrada.'].join('\n');
const MONTHLY_GUIDE = ['Objetivo: aprovar o portão da etapa e decidir o que depende da diretoria.', 'Quem participa: patrocinador, responsável de cada área, coordenador e consultores da PRICETAX.', 'Duração: 90 min (60 min nos meses de rotina).',
  'Pauta fixa:\n1. Andamento contra o plano\n2. Portão da etapa: aprovado ou pendente\n3. Riscos e pendências críticas\n4. Decisões que precisam da diretoria\n5. Próximos 30 dias\n6. Números (impacto e créditos), quando houver',
  'Sai do encontro: ata em até 2 dias úteis, decisões e tarefas na aba Reuniões e um resumo de uma página.', 'Fica registrado em: aba Reuniões (ata, decisões tomadas e tarefas com tipo); vincule a ata a esta subatividade em "Reunião vinculada"; registro vivo de decisões, riscos e pendências atualizado.', 'Concluído quando: o patrocinador aprovou a ata.'].join('\n');

const V3_PRIO = { P1: 'alta', P2: 'media', P3: 'baixa' };
export function buildItems() {
  const mainResp = Object.fromEntries(MAINS.map((m) => [m[0], m[3]]));
  const items = [];
  const respOf = (it, main) => it.resp || (it.ar || []).find((x) => TEAM.includes(x)) || (it.ex === 'PriceTax' ? 'PRICETAX' : it.ex === 'ERP' ? 'TI' : mainResp[main]);
  for (const it of V3_ITEMS) {
    if (it.id === 'B13.1') continue;
    const main = DEST[it.id]; if (!main) throw new Error('sem destino: ' + it.id);
    items.push({ code: it.id, main, title: TITLE_FIX[it.id] ? TITLE_FIX[it.id](it.t) : it.t, resp: respOf(it, main), ex: it.ex, ar: it.ar, prio: V3_PRIO[it.p] || '', lim: it.lim || null, pred: PRED_FIX[it.id] || it.pred || [], apl: it.apl || '', rec: it.rec || '', guide: '', fixed: FIXED[it.id] ?? null, isNew: false });
  }
  const add = (o) => items.push({ lim: null, pred: [], apl: '', rec: '', guide: '', fixed: null, isNew: true, ar: [o.resp], prio: 'media', ex: 'PriceTax', ...o });
  const key = (a) => a.k;
  const idsFor = (a) => ({ ent: `ENT-${key(a)}`, entOp: `ENT-${key(a)}-O`, ofi: `OFI-${key(a)}`, val: `VAL-${key(a)}`, tst: `TST-${key(a)}`, tre: `TRE-${key(a)}`, pro: `PRO-${key(a)}`, rot: `ROT-${key(a)}` });
  const apl = (a) => (a.opt ? 'quando houver comércio exterior' : '');
  // Entrevistas (primeiro as de gestão de todas as áreas, depois as de operação)
  for (const a of AREAS) { const id = idsFor(a); add({ code: id.ent, main: 'entrevistas', title: `Entrevista com ${a.n}${SECOND_ROUND.includes(a.n) ? ': gestão' : ''}${a.opt ? ' (quando houver)' : ''}`, resp: a.r, prio: 'alta', apl: apl(a), guide: guide('ent', a, 'g') }); }
  for (const a of AREAS.filter((x) => SECOND_ROUND.includes(x.n))) { const id = idsFor(a); add({ code: id.entOp, main: 'entrevistas', title: `Entrevista com ${a.n}: operação`, resp: a.r, prio: 'alta', pred: [id.ent], guide: guide('ent', a, 'op') }); }
  // Intake de dados e documentos (a conferência de EFD, consolidado, XML e documentação extra)
  const intake = [['INT-1', 'Conferir o recebimento dos EFDs ICMS/IPI e Contribuições de todos os estabelecimentos e períodos'], ['INT-2', 'Conferir os registros consolidados contra os de cada filial'], ['INT-3', 'Pedir os XMLs quando o EFD não traz o detalhe'], ['INT-4', 'Pedir a documentação extra (CT-e, NFS-e, ativo imobilizado, energia e outras)'], ['INT-5', 'Registrar as lacunas de dados, cada uma com dono']];
  intake.forEach(([c, t], i) => add({ code: c, main: 'dados', title: t, resp: 'Fiscal', prio: 'alta', pred: i ? [intake[i - 1][0]] : ['A2.2'] }));
  // Oficinas, desenho e validação do desenho
  for (const a of AREAS) { const id = idsFor(a); add({ code: id.ofi, main: 'oficinas', title: `Oficina de decisão com ${a.n}${a.opt ? ' (quando houver)' : ''}`, resp: a.r, prio: 'alta', apl: apl(a), pred: [SECOND_ROUND.includes(a.n) ? id.entOp : id.ent], guide: guide('ofi', a) }); }
  const des = [['DES-1', 'Desenhar os processos futuros por área'], ['DES-2', 'Montar a matriz de operações com o tratamento de cada uma'], ['DES-3', 'Entregar os requisitos ao ERP e ao fornecedor']];
  des.forEach(([c, t], i) => add({ code: c, main: 'desenho', title: t, resp: 'Fiscal', prio: 'alta', pred: i ? [des[i - 1][0]] : [] }));
  for (const a of AREAS.filter((x) => x.m.includes('V'))) { const id = idsFor(a); add({ code: id.val, main: 'validacao', title: `Validar o desenho com ${a.n}${a.opt ? ' (quando houver)' : ''}`, resp: a.r, apl: apl(a), pred: [id.ofi, 'DES-1'], guide: guide('val', a) }); }
  // Teste de aceite, treinamento e prontidão
  for (const a of AREAS.filter((x) => x.m.includes('T'))) { const id = idsFor(a); add({ code: id.tst, main: 'aceite', title: `Teste de aceite com ${a.n}${a.opt ? ' (quando houver)' : ''}`, resp: a.r, ex: 'Cliente', apl: apl(a), pred: [id.val], guide: guide('tst', a) }); }
  for (const a of AREAS.filter((x) => x.m.includes('R'))) { const id = idsFor(a); add({ code: id.tre, main: 'treinamento', title: `Treinar ${a.n}`, resp: a.r, pred: [a.m.includes('V') ? id.val : id.ofi], guide: guide('tre', a) }); }
  for (const a of AREAS.filter((x) => x.m.includes('P'))) { const id = idsFor(a); add({ code: id.pro, main: 'prontidao', title: `Avaliar a prontidão de ${a.n}${a.opt ? ' (quando houver)' : ''}`, resp: a.r, prio: 'alta', apl: apl(a), pred: [a.m.includes('T') ? id.tst : a.m.includes('V') ? id.val : id.ofi].concat(a.m.includes('R') ? [id.tre] : []), guide: guide('pro', a) }); }
  add({ code: 'PRO-CORTE', main: 'prontidao', title: 'Plano de corte e congelamento de parâmetros', resp: 'TI', prio: 'alta', pred: [] });
  // Operação assistida
  for (const a of AREAS) { const id = idsFor(a); add({ code: id.rot, main: 'operacao', title: `Acompanhar ${a.n} na rotina${a.opt ? ' (quando houver)' : ''}`, resp: a.r, apl: apl(a), pred: [a.m.includes('P') ? id.pro : a.m.includes('R') ? id.tre : id.val], guide: guide('rot', a) }); }
  add({ code: 'OPE-REF', main: 'operacao', title: 'Reforço de treinamento depois da primeira apuração', resp: 'Todas', pred: ['B15.1'], fixed: 210 });
  // Lacunas do cruzamento com o Tecumseh (2026-10-19): itens novos
  add({ code: 'CUS-ERP', main: 'contabil', title: 'Ajustar o módulo de custo do ERP: custo sem IBS/CBS e crédito conforme o regime do fornecedor', resp: 'Controladoria', ex: 'ERP', ar: ['Controladoria', 'TI'], prio: 'alta', pred: ['B5.1', 'B6.1'] });
  add({ code: 'FIS-REG', main: 'fiscal', title: 'Monitorar a situação fiscal de fornecedores e clientes e indicar quando usar o recolhimento pelo adquirente', resp: 'Fiscal', ex: 'Cliente', rec: 'mensal', pred: ['B5.1'] });
  add({ code: 'FIN-DIF', main: 'financeiro', title: 'Projetar o caixa extra do fim do diferimento do ICMS com os fornecedores e negociar prazo', resp: 'Financeiro', ex: 'Cliente', apl: 'quando houver diferimento de ICMS' });
  add({ code: 'FIN-CONF', main: 'financeiro', title: 'Aderir ao programa de conformidade para ressarcir CBS e IBS no prazo mais curto', resp: 'Financeiro', ex: 'Cliente', prio: 'alta' });
  add({ code: 'CPR-CARTA', main: 'compras', title: 'Enviar a cada fornecedor relevante a carta com o preço esperado de 2027 e pedir a abertura do preço líquido e dos tributos', resp: 'Compras', ex: 'Cliente', pred: ['B6.1'] });
  add({ code: 'CPR-PO', main: 'compras', title: 'Atualizar o pedido de compra e a tabela de preço de janeiro de 2027 para o preço esperado', resp: 'Compras', ex: 'Cliente', pred: ['CPR-CARTA'] });
  add({ code: 'CPR-NF1', main: 'operacao', title: 'Conferir a primeira nota de 2027 de cada fornecedor contra o preço esperado; divergência bloqueia o pagamento', resp: 'Compras', ex: 'Cliente', pred: ['CPR-PO'], fixed: 156 });
  add({ code: 'CPR-REP', main: 'operacao', title: 'Medir o repasse da redução de preço por fornecedor e por comprador, todo trimestre', resp: 'Compras', ex: 'Cliente', rec: 'contínuo', pred: ['CPR-NF1'], fixed: 190 });
  add({ code: 'FIN-ICMS', main: 'operacao', title: 'Montar o plano anual de monetização do crédito acumulado de ICMS (transferir a fornecedores, usar em importação)', resp: 'Fiscal', ex: 'Cliente', rec: 'anual', apl: 'quando houver crédito acumulado de ICMS', pred: ['B8.5'], fixed: 195 });
  add({ code: 'ERP-ADI', main: 'docs', title: 'Tratar o adiantamento no ERP: imposto antecipado no recebimento e ajuste na entrega', resp: 'Fiscal', ex: 'ERP', ar: ['Fiscal', 'TI', 'Financeiro'], pred: ['B7.5'] });
  add({ code: 'JUR-BEN', main: 'juridico', title: 'Renegociar com os prestadores de benefícios (saúde, creche, alimentação, uniformes) a nota em nome da empresa', resp: 'RH', ex: 'Cliente', pred: ['OFI-RH'] });
  add({ code: 'JUR-FRT', main: 'juridico', title: 'Rever os contratos de frete e armazenagem, com atenção aos transportadores do Simples Nacional', resp: 'Logística', ex: 'Cliente' });
  add({ code: 'DIR-INV', main: 'oficinas', title: 'Avaliar investimentos e estrutura societária à luz da reforma', resp: 'Diretoria', prio: 'baixa', apl: 'quando a diretoria pedir', pred: ['OFI-DIR'] });
  // Comitê
  add({ code: 'COM-SEM', main: 'comite', title: 'Reunião semanal de acompanhamento (recorrente)', resp: 'Diretoria', rec: 'semanal', fixed: 7, prio: 'alta', guide: WEEKLY_GUIDE });
  const MONTH = [30, 60, 90, 120, 148, 180, 210, 240];
  MONTH.forEach((d, i) => add({ code: `COM-M${i + 1}`, main: 'comite', title: `Reunião mensal com a empresa ${i + 1} de 8: portão da etapa, riscos, decisões`, resp: 'Diretoria', prio: 'alta', fixed: d, guide: MONTHLY_GUIDE, pred: i ? [`COM-M${i}`] : [] }));
  add({ code: 'COM-REG', main: 'comite', title: 'Registro vivo de decisões, riscos e pendências (a cada reunião)', resp: 'PRICETAX', rec: 'contínuo', fixed: 7, guide: REGISTRO_GUIDE });
  add({ code: 'COM-CMP', main: 'comite', title: 'Plano de comunicação do projeto', resp: 'PRICETAX', fixed: 10 });
  const byCode = Object.fromEntries(items.map((x) => [x.code, x]));
  const OFI = { Diretoria: 'OFI-DIR', Fiscal: 'OFI-FIS', Compras: 'OFI-CPR', TI: 'OFI-TI', Financeiro: 'OFI-FIN', Contábil: 'OFI-CTB', Jurídico: 'OFI-JUR' };
  for (const it of items) if (!it.isNew && it.main === 'oficinas' && OFI[it.resp]) it.pred = [...it.pred, OFI[it.resp]];
  byCode['A3.1'].pred = [...byCode['A3.1'].pred, 'ENT-TI-O'];
  byCode['B1.3'].pred = [...byCode['B1.3'].pred, ...items.filter((x) => x.main === 'prontidao' && x.code.startsWith('PRO-')).map((x) => x.code)];
  return items;
}

const dayNum = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
const refDay = dayNum(V4_KICKOFF);
const limitDay = (lim) => (lim && lim.d ? dayNum(lim.d) - refDay : null);

// Atribui o dia (D+n) de cada subatividade dentro da janela da sua atividade, em ordem; respeita data fixa, limite da norma e predecessoras.
export function schedule(items) {
  const win = Object.fromEntries(MAINS.map((m) => [m[0], m[4]]));
  const pos = Object.fromEntries(V3_ITEMS.map((it, i) => [it.id, i]));
  const byMain = {};
  items.forEach((it, i) => { it.seq = i; (byMain[it.main] ||= []).push(it); });
  for (const [mk, list] of Object.entries(byMain)) {
    const ord = ORDER[mk] || [];
    list.sort((a, b) => {
      const ia = ord.indexOf(a.code), ib = ord.indexOf(b.code);
      if (ia >= 0 || ib >= 0) return (ia >= 0 ? ia : 999) - (ib >= 0 ? ib : 999) || a.seq - b.seq;
      if (!a.isNew && !b.isNew) return (pos[a.code] ?? 0) - (pos[b.code] ?? 0);
      return a.seq - b.seq;
    });
    const [s, e] = win[mk];
    const free = list.filter((x) => x.fixed === null);
    list.forEach((it) => { if (it.fixed !== null) it.n = it.fixed; });
    free.forEach((it, i) => { it.n = free.length === 1 ? e : s + Math.round((i * (e - s)) / (free.length - 1)); });
    if (mk === 'prontidao') items.filter((x) => x.main === mk && x.code.startsWith('PRO-') && x.code !== 'PRO-CORTE').forEach((it, i) => { it.n = 126 + i; });
    if (mk === 'prontidao') { const c = items.find((x) => x.code === 'PRO-CORTE'); c.n = 137; }
    if (mk === 'operacao') items.filter((x) => x.main === mk && x.code.startsWith('ROT-')).forEach((it, i) => { it.n = 208 + Math.round((i * 28) / 11); });
  }
  const byCode = Object.fromEntries(items.map((x) => [x.code, x]));
  for (const it of items) { const L = limitDay(it.lim); it.limD = L; if (L !== null && it.n > L && it.fixed === null) it.n = Math.max(win[it.main][0], L); }
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (const it of items) for (const p of it.pred) { const q = byCode[p]; if (q && q.n > it.n && it.fixed === null) { it.n = q.n; moved = true; } }
    if (!moved) break;
  }
  return items;
}

export function descOf(mainKey) { return (MAINS.find((m) => m[0] === mainKey) || [])[5] || ''; }
