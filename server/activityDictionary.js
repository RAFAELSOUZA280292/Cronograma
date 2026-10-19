// Dicionário de atividades (2026-10-19, pedido do Rafael: "um mega dicionário de todas as atividades"; ver PROJECT_CONTEXT.md §80).
// Para cada atividade conhecida: o que ENTRA nela, o que NÃO entra, palavras-chave e exemplos de tarefas. É lido só pelo servidor, na hora de a RENATA escolher a atividade de
// uma tarefa (server/taskLinkSuggest.js). NÃO vai para a tela nem para o JSON do projeto: o cliente nunca vê este conteúdo.
// Como uma atividade da empresa casa com uma entrada: (1) `stdKey` da atividade; (2) título igual a um dos `nomes`; (3) um `nomes` contido no título (o mais longo ganha).
// Atividade sem entrada continua funcionando: a RENATA usa só o título e a descrição (como antes). Acrescentar uma entrada nova melhora a escolha, nunca a trava.
// Regra de ouro (Rafael): a RENATA só VINCULA a atividades que já existem; este dicionário nunca cria atividade.

const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const E = (key, nomes, entra, naoEntra, palavras, exemplos, stdKeys = []) => ({ key, nomes, entra, naoEntra, palavras, exemplos, stdKeys });

export const DICTIONARY = [
  // ---------- Diagnóstico (padrão v4/v5 e modelo antigo)
  E('kickoff', ['kickoff', 'kickoff e governança', 'kickoff único no cliente'],
    'Reunião de abertura com a diretoria, apresentação do time e do escopo, definição de responsáveis por área, instituição do comitê, e-mail de boas-vindas, pedido inicial de documentos.',
    'Coleta e conferência dos dados em si (isso é Dados do cliente ou Envio dos dados); entrevistas por área; qualquer entrega técnica.',
    ['kickoff', 'abertura', 'boas-vindas', 'comitê da reforma', 'responsável por área', 'apresentar o time', 'governança'],
    ['Definir os membros do comitê da reforma', 'Enviar o e-mail de boas-vindas e a lista de documentos', 'Agendar a ata do comitê'], ['kickoff']),
  E('dados', ['dados do cliente', 'envio dos dados', 'envio de dados', 'documentação extra'],
    'Pedido, recebimento e conferência dos dados e documentos: EFDs (ICMS/IPI e Contribuições) de todos os estabelecimentos e períodos, registros consolidados contra filiais, XMLs, relatórios do ERP (Vitax/SAP), balancete, documentação complementar.',
    'Análise dos dados (isso é Validação documental); entrevista com a área; simulação de cenários.',
    ['enviar sped', 'efd', 'xml', 'relatório do sap', 'relatório vitax', 'balancete', 'base de dados', 'documentação complementar', 'checklist de dados', 'segmento'],
    ['Enviar o relatório do Vitax/SAP com a coluna de segmento', 'Mandar os XMLs de 2026', 'Enviar o balancete de dezembro'], ['dados']),
  E('entrevistas', ['entrevistas com as áreas', 'entrevista com as áreas'],
    'Entrevista estruturada com cada área (Diretoria, Fiscal, Contábil, Financeiro, Compras, Vendas, TI, Jurídico, RH, Logística, Cadastros, Comex) para levantar processos, sistemas, desafios e lacunas.',
    'Oficina de decisão; treinamento; reuniões de acompanhamento já com decisão.',
    ['entrevista', 'mapear fluxo', 'entendimento de tecnologias', 'desafios atuais', 'levantar com a área', 'roteiro da área'],
    ['Entrevistar o time de Logística sobre o fluxo físico', 'Mapear o fluxo de contas a pagar com o Financeiro'], ['entrevistas']),
  E('analise-documental', ['análise e validação documental', 'validação documental e inventários', 'fechamento da análise documental'],
    'Validar os dados recebidos, subir e processar na ferramenta (X da Questão), identificar benefícios fiscais, outros débitos e créditos, recolhimentos e saldos credores por imposto, e pedir documentação extra quando faltar.',
    'Envio dos dados pelo cliente (Dados do cliente); apresentação do cenário (Apresentação prévia); plano de recuperação dos saldos (Saldos credores).',
    ['validação documental', 'processar na ferramenta', 'x da questão', 'benefícios fiscais', 'regimes especiais', 'outros créditos', 'f100', 'documentação extra', 'inventário'],
    ['Validar o relatório do Vitax e recarregar a base com segmento', 'Identificar os benefícios fiscais do PR e de SC'], ['inventarios']),
  E('cenarios', ['cenários e número geral', 'retorno com o número geral', 'análise impactos cenário ar e dr', 'cenário ar e dr'],
    'Montar e refazer os cenários de compras, vendas, DRE e caixa (AR e DR), o número geral de impacto e o estudo de fluxo de caixa; ajustes de premissa (IPI, NCM, segmento) que mudam o resultado.',
    'A apresentação do resultado ao cliente (Apresentação prévia); a negociação com fornecedores (Compras).',
    ['cenário', 'ar e dr', 'número geral', 'impacto na dre', 'fluxo de caixa', 'refazer o cálculo', 'premissa', 'ipi de 6,5', 'simulação'],
    ['Refazer as projeções mantendo o IPI de 6,5% na NCM 7615.10.00', 'Montar o modelo de impacto líquido na DRE e no caixa'], ['cenarios']),
  E('apresentacao', ['apresentação prévia', 'apresentação prévia ar e dr', 'apresentação prévia cenário ar'],
    'Reunião em que o resultado dos cenários é apresentado ao cliente antes do relatório final, com as decisões e os ajustes pedidos naquele encontro.',
    'Construir o cenário em si (Cenários); o workshop por áreas.',
    ['apresentação prévia', 'apresentar o cenário', 'visão prévia', 'validar com a realidade da empresa'],
    ['Remarcar a apresentação prévia do cenário AR', 'Apresentar a visão prévia com foco em compras'], ['apresentacao']),
  E('workshop-report', ['workshop por áreas', 'report final + workshop', 'report final e plano de ação', 'workshop'],
    'Workshop de reforma (mitos e verdades, transição, split payment, casos práticos), relatório final com o plano de ação por frente, rankings de fornecedores e de clientes para o report, agenda dos workshops.',
    'Workshop específico com fornecedores (Circularização de fornecedores); treinamento da ferramenta (Treinamento).',
    ['workshop', 'report final', 'ppt', 'ranking de fornecedores', 'ranking de clientes', 'plano de ação', 'confirmação de agenda', 'parceiros'],
    ['Montar o PPT do report final', 'Confirmar a agenda do workshop com os times internos'], ['workshop', 'report']),
  E('integracao-equipes', ['reunião integração de equipes', 'integração de equipes'],
    'Reunião de integração das equipes e estratégia de clientes e fornecedores.',
    'Entrevistas por área; treinamento.', ['integração de equipes', 'estratégia de clientes e fornecedores'],
    ['Realizar a reunião de integração de equipe'], []),
  E('atacadao', ['estudo alcast x atacadão', 'estudo atacadão', 'atacadão'],
    'Estudo e reunião específicos sobre o cliente/canal Atacadão.', 'Qualquer outro tema de vendas.', ['atacadão'],
    ['Conduzir a reunião sobre a análise do Atacadão'], []),
  E('regras-erp', ['regras tributárias erp', 'mapeamento de erp e regras tributárias'],
    'Mapeamento do ERP (SAP, TaxBRA, JUBTAX) e das regras tributárias parametrizadas: retenções por IVA, cClassTrib por CFOP, captura de XML, fluxo de compras e emissão.',
    'Parametrização e testes no SAP (Adaptação de sistemas); decisão de política fiscal (Fiscal).',
    ['regras tributárias', 'taxbra', 'jubtax', 'sap', 'retenção', 'parametrização atual', 'cclasstrib por cfop', 'mapeamento do erp'],
    ['Mapear como o TaxBRA trata as retenções de serviço', 'Documentar as regras de cClassTrib por CFOP'], []),
  E('legenda-compras', ['legenda compras'], 'Legenda que relaciona local de negócio/CNPJ ao segmento (laminados, UD, trading) nas compras.', 'Qualquer outro tema de compras.', ['legenda', 'local de negócio', 'segmento'], ['Enviar a legenda de local de negócio e segmento'], []),

  // ---------- Áreas (modelo antigo + padrão)
  E('compras', ['compras', 'integração time de compras', 'integração do time de compras', 'compras e suprimentos'],
    'Trabalho com a área de Compras: sensibilização, fluxo de compras, tecnologias de cotação, desafios, políticas (adiantamentos, pagamentos, entregas), situações especiais (importação, serviços críticos), ranking de fornecedores com aumento e redução de preço, oficinas e validação do desenho com Compras.',
    'Circularização/formulário de fornecedores; preço líquido e piloto; cartas e preço de 2027; treinamento da ferramenta para Suprimentos (cada uma tem a sua atividade).',
    ['compras', 'suprimentos', 'compradores', 'fluxo de compras', 'política de compras', 'fornecedores', 'importação', 'cotação'],
    ['Mapear o fluxo de compras com Suprimentos', 'Apresentar o ranking de fornecedores com aumento e redução'], ['compras']),
  E('circularizacao', ['circularização de fornecedores'],
    'Formulário de maturidade tributária enviado aos fornecedores: preparar, disparar, acompanhar quem respondeu, cobrar a curva A, workshop com fornecedores, indicador de respostas, análise das respostas.',
    'Negociação do preço líquido (Preço líquido e piloto); cartas de preço esperado de 2027.',
    ['formulário', 'circularização', 'parceiros', 'quem respondeu', 'curva a', 'respostas dos fornecedores', 'workshop com fornecedores', 'disparar'],
    ['Confirmar se a curva A recebeu o formulário', 'Criar o indicador de quem respondeu o formulário', 'Marcar o workshop com os fornecedores'], []),
  E('preco-liquido', ['preço líquido por fornecedor e piloto', 'preço líquido'],
    'Formação do preço líquido item a item, racional de cálculo, ajuste da ferramenta (valor por unidade de compra), piloto com um fornecedor de UD e um de laminados, rodadas de negociação, tabela de preço líquido por fornecedor.',
    'O formulário de fornecedores (Circularização); as cartas e a tabela de janeiro (Preço esperado de 2027).',
    ['preço líquido', 'racional', 'piloto', 'negociação com fornecedores', 'unidade de compra', 'tabela de preço', 'item a item', 'sucata sul', 'enquadramento do fornecedor'],
    ['Entregar o racional de formação do preço líquido por item', 'Executar o piloto com um fornecedor de UD e um de laminados', 'Corrigir o enquadramento do fornecedor Sucata Sul'], []),
  E('preco-2027', ['preço esperado de 2027', 'cartas e tabela de janeiro'],
    'Cartas aos fornecedores com o preço esperado de 2027, atualização do pedido de compra e da tabela de preço de janeiro, congelamento do preço de janeiro.',
    'Negociação em curso (Preço líquido e piloto).', ['carta', 'preço esperado', 'tabela de janeiro', 'pedido de compra', 'congelar o preço'],
    ['Enviar as cartas com o preço esperado de 2027', 'Atualizar o pedido de compra de janeiro'], []),
  E('treinamento-suprimentos', ['treinamento da ferramenta para suprimentos', 'treinamento da ferramenta'],
    'Treinamento do time de Suprimentos no simulador e no portal de compras, criação de acessos individuais, quem terá acesso.',
    'Treinamento por área sobre os novos procedimentos (Treinamento e comunicação).', ['treinamento da ferramenta', 'acessos individuais', 'login e senha', 'simulador', 'portal de compras'],
    ['Criar os acessos individuais ao simulador para cada comprador', 'Definir quem terá acesso à ferramenta'], []),
  E('vendas', ['vendas', 'integração time de vendas', 'integração do time de vendas', 'vendas e preço', 'comercial'],
    'Trabalho com a área Comercial: sensibilização, fluxo de vendas, políticas (prazos, adiantamentos, entregas), situações especiais, ranking de clientes e produtos, formação de preço pelo valor líquido, verbas, workshop com clientes-chave.',
    'Compras e fornecedores; precificação de compra.', ['vendas', 'comercial', 'clientes-chave', 'preço de venda', 'verbas', 'comissões', 'política de vendas', 'ranking de clientes'],
    ['Mapear o fluxo de vendas', 'Definir a política de verbas com o Comercial'], ['vendas']),
  E('financeiro', ['financeiro', 'financeiro e caixa'],
    'Área financeira e caixa: contas a pagar e a receber, PMP/PMR, linhas de crédito, regras de nota de débito e crédito, split payment e RAD, impacto no capital de giro, oficina de decisão do RAD, programa de conformidade do ressarcimento.',
    'Treinamento e testes de nota de débito/crédito no ERP (Nota de Débito e Nota de Crédito); saldos credores (Saldos credores).',
    ['financeiro', 'caixa', 'contas a pagar', 'contas a receber', 'pmp', 'pmr', 'rad', 'split payment', 'capital de giro', 'conciliação bancária', 'linhas de crédito'],
    ['Mapear os prazos médios de pagamento e recebimento', 'Reunião específica de RAD'], ['financeiro']),
  E('nd-nc', ['nota de débito e nota de crédito', 'nota de débito e crédito'],
    'Treinamento sobre nota de débito e nota de crédito, validar como a empresa emite e recebe, e testar nota de débito e crédito no ERP em homologação.',
    'Regras gerais do financeiro (Financeiro); demais notas fiscais (Adaptação de sistemas).', ['nota de débito', 'nota de crédito', 'nd e nc', 'adiantamento', 'ajuste de valor'],
    ['Treinar o time sobre nota de débito e nota de crédito', 'Testar nota de débito e nota de crédito no SAP'], []),
  E('split-payment', ['split payment e demais operações financeiras', 'split payment'],
    'Agenda de split payment e demais operações financeiras (nota de débito, crédito, fluxo de caixa) realizada em 08/09.', 'RAD específico (Financeiro).', ['split payment', 'operações financeiras'],
    ['Enviar o material formal sobre split payment e RAD'], []),
  E('fiscal', ['fiscal / tributário', 'fiscal e tributário', 'fiscal'],
    'Parametrização fiscal inteira: CST e cClassTrib por item e operação, reclassificação das notas (CFOP/CST/cClassTrib), regras de crédito e débito, benefícios e regimes especiais (TTD 410, crédito presumido), plano de testes de emissão, obrigações acessórias.',
    'Saldos credores (Saldos credores); DeRE; execução dos testes no SAP (Adaptação de sistemas).',
    ['fiscal', 'cclasstrib', 'cst', 'cfop', 'benefícios fiscais', 'ttd 410', 'crédito presumido', 'obrigações acessórias', 'reclassificação das notas', 'apuração', 'efd'],
    ['Validar a reclassificação das notas', 'Cálculo econômico do benefício de Santa Catarina (TTD 410) contra o Paraná'], ['fiscal']),
  E('saldos-credores', ['saldos credores e plano de recuperação', 'saldos credores'],
    'Levantar os saldos credores de ICMS, IPI, PIS e COFINS por tributo e filial, conciliar com a escrituração, analisar as vias legais, simular a recuperação em 2027, decidir a estratégia, registrar o que vence em 2026 e aprovar o plano de ação 2027–2033.',
    'Execução mensal do ressarcimento em 2027 (Operação assistida); parametrização fiscal (Fiscal).',
    ['saldo credor', 'saldos credores', 'ressarcimento', 'compensação', 'crédito acumulado', 'pedido de ipi', 'homologação', 'art. 378', 'plano de recuperação'],
    ['Levantar os saldos credores por tributo e por filial', 'Simular o fluxo de recuperação dos saldos em 2027'], ['saldos']),
  E('dere', ['dere', 'declaração de regimes específicos'], 'Declaração de Regimes Específicos (DeRE): preparar e entregar.', 'Outras obrigações acessórias (Fiscal).', ['dere', 'regimes específicos'], ['Entregar a DeRE'], []),
  E('juridico', ['jurídico', 'jurídico e contratos'],
    'Inventário e classificação de contratos, cláusulas de reajuste e repactuação, cláusula-padrão de transição tributária, tese de IBS/CBS fora da base do ICMS, renegociação de contratos, análise legal.',
    'Parecer legal específico de saldos credores (Saldos credores).', ['jurídico', 'contratos', 'cláusula', 'repactuação', 'aditivo', 'renegociação contratual', 'tese'],
    ['Levantar o inventário de contratos ativos', 'Redigir a cláusula-padrão de transição tributária'], ['juridico']),
  E('logistica', ['logística', 'logística e operações'],
    'Malha logística, CDs, rotas, fornecedores de frete (inclusive transportadores do Simples), relatório de fretes, crédito do frete, estruturas mantidas por benefício fiscal.',
    'Contratos de frete como assunto jurídico (Jurídico).', ['logística', 'frete', 'transportadora', 'cd', 'malha', 'rotas', 'tms', 'wms', 'armazenagem'],
    ['Enviar o relatório de fretes de um mês por segmento', 'Mapear a malha logística atual'], []),
  E('controladoria', ['controladoria', 'contábil e controladoria', 'contábil'],
    'DRE atual e reformada, centro de custo, indicadores executivos, consolidação dos resultados das áreas, plano de contas, tratamento contábil dos saldos antigos, módulo de custo do ERP.',
    'Saldos credores como estratégia (Saldos credores).', ['controladoria', 'dre', 'centro de custo', 'indicadores', 'plano de contas', 'orçamento', 'balancete', 'custo padrão'],
    ['Levantar a DRE atual e a estrutura de centro de custo', 'Construir a DRE reformada'], ['contabil']),
  E('sistemas', ['adaptação de sistemas', 'sistemas: base do erp', 'sistemas: documentos fiscais', 'sistemas'],
    'ERP/SAP: backlog de parametrização, CST e cClassTrib no ERP, ambiente de homologação, testes de emissão e rejeição, demais notas (venda, devolução, transferência, complementar, NFS-e, CT-e), notas técnicas da NF-e, conciliação bancária e retorno do split, plano de contingência.',
    'Treinamento e testes específicos de nota de débito/crédito (Nota de Débito e Nota de Crédito) quando a tarefa for só disso.',
    ['sap', 'erp', 'parametrizar', 'homologação', 'sandbox', 'nota técnica', 'danfe', 'nfs-e', 'ct-e', 'rejeição', 'ambiente de testes'],
    ['Mapear as notas técnicas vigentes e o que falta aplicar no SAP', 'Parametrizar CST e cClassTrib no ERP'], ['erp', 'docs']),
  E('duvidas', ['tira-dúvidas geral', 'tira-dúvidas'], 'Reunião com todas as áreas para fechar pendências soltas, matriz de riscos e pendências, responsáveis e prazos.', 'Tarefas de uma área específica.', ['pendências abertas', 'matriz de riscos', 'dúvidas recorrentes', 'alinhamento geral'], ['Consolidar as pendências abertas por área'], []),
  E('encerramento', ['encerramento'], 'Retrospectiva, indicadores de resultado, relatório executivo, roadmap do ano 2, aprovação de continuidade, ata do comitê de prontidão e inventário de pendências da virada.', 'Tarefas operacionais de uma área.', ['retrospectiva', 'relatório executivo', 'roadmap', 'continuidade', 'ata de prontidão', 'inventário de pendências'], ['Elaborar o relatório executivo anual'], []),

  // ---------- Padrão v4/v5: demais atividades
  E('oficinas', ['oficinas de decisão com as áreas', 'oficina de decisão'], 'Oficina por área para mostrar o impacto e decidir as políticas (preço, compras, financeiro, contábil, contratos).', 'Entrevista (levantamento); validação do desenho (depois da decisão).', ['oficina', 'decisão da área', 'decidir política'], ['Realizar a oficina de decisão com Compras'], ['oficinas']),
  E('desenho', ['desenho dos processos e requisitos'], 'Processos futuros por área, matriz de operações e requisitos entregues ao ERP e ao fornecedor.', 'Parametrização em si (Sistemas).', ['desenho', 'requisitos', 'matriz de operações', 'processo futuro'], ['Entregar os requisitos ao ERP'], ['desenho']),
  E('validacao', ['validação do desenho com as áreas'], 'Cada área confirma que o desenho reflete a decisão e a operação real antes de construir.', 'Teste de aceite (depois de construído).', ['validar o desenho', 'validação do desenho'], ['Validar o desenho com o Financeiro'], ['validacao']),
  E('cadastros', ['cadastros'], 'Cadastro de fornecedores com regime, itens com NCM e NBS, clientes com regime e Zona Franca.', 'Parametrização fiscal (Fiscal).', ['cadastro', 'ncm', 'nbs', 'regime do fornecedor', 'zona franca'], ['Corrigir NCM dos itens sem classificação'], ['cadastros']),
  E('testes', ['testes e contingência', 'testes'], 'Testes integrados em homologação, repetição quando a alíquota da CBS for publicada, plano de contingência.', 'Teste de aceite por área.', ['teste integrado', 'contingência', 'homologação'], ['Repetir os testes com a alíquota publicada'], ['testes']),
  E('aceite', ['validação por área (aceite)', 'teste de aceite'], 'Cada área testa os seus fluxos reais no ambiente de homologação e dá o aceite.', 'Testes integrados da TI.', ['aceite', 'teste de aceite'], ['Teste de aceite do Fiscal'], ['aceite']),
  E('treinamento', ['treinamento e comunicação', 'treinamento'], 'Treinamento de cada área nos novos procedimentos e comunicação a clientes e fornecedores.', 'Treinamento da ferramenta para Suprimentos quando for só da ferramenta.', ['treinar', 'treinamento por área', 'comunicação a clientes'], ['Treinar o Fiscal nos novos procedimentos'], ['treinamento']),
  E('prontidao', ['prontidão da virada', 'prontidão'], 'Avaliação de prontidão de cada área, pendências aceitas com contingência, plano de suporte, ata e corte contábil.', 'Execução das áreas.', ['prontidão', 'plano de corte', 'virada', 'ata de prontidão'], ['Avaliar a prontidão do Fiscal'], ['prontidao']),
  E('operacao', ['operação assistida e rotina', 'operação assistida'], 'Primeira apuração, ciclo mensal, recuperação de créditos em 2027, reforço de treinamento, encerramento dos 8 meses.', 'Preparação antes da virada.', ['primeira apuração', 'ciclo mensal', 'operação assistida', 'primeira nota de 2027'], ['Conferir a primeira nota de 2027 de cada fornecedor'], ['operacao']),
  E('comite', ['comitê de reforma tributária', 'comitê'], 'Reunião mensal do comitê com a empresa, acompanhamento semanal, registro vivo de decisões, riscos e pendências.', 'Entregas técnicas de uma área.', ['comitê', 'reunião mensal', 'registro de decisões'], ['Registrar as decisões da reunião do comitê'], ['comite']),
  E('rh', ['rh, folha e dp', 'rh e folha', 'rh'], 'Benefícios, folha, eSocial, terceirização, créditos sobre benefícios.', 'Contratos com prestadores como tema jurídico.', ['rh', 'folha', 'benefícios', 'esocial', 'vale refeição'], ['Mapear os benefícios e as convenções coletivas'], []),
];

const normTitle = (s) => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const INDEX = DICTIONARY.map((e) => ({ e, names: e.nomes.map(normTitle) }));

// Acha a entrada do dicionário para uma atividade da empresa; devolve null se não houver (a RENATA segue só com título e descrição).
export function dictFor(activity) {
  if (!activity) return null;
  if (activity.stdKey) {
    const byKey = INDEX.find(({ e }) => (e.stdKeys || []).includes(activity.stdKey) || e.key === activity.stdKey);
    if (byKey) return byKey.e;
  }
  const t = normTitle(activity.title);
  if (!t) return null;
  const exact = INDEX.find(({ names }) => names.includes(t));
  if (exact) return exact.e;
  let best = null;
  for (const { e, names } of INDEX) for (const n of names) {
    if (n.length >= 6 && (t.includes(n) || n.includes(t)) && (!best || n.length > best.len)) best = { e, len: n.length };
  }
  return best ? best.e : null;
}

// Texto do dicionário para o prompt da RENATA (vazio se a atividade não tem entrada).
export function dictPromptLine(activity) {
  const d = dictFor(activity);
  if (!d) return '';
  return ` | ENTRA: ${d.entra} | NÃO ENTRA: ${d.naoEntra} | exemplos de tarefa: ${d.exemplos.join('; ')}`;
}

// Pontuação por palavras-chave (regra de reserva): quantas palavras-chave da atividade aparecem no texto da tarefa.
export function keywordScore(activity, text) {
  const d = dictFor(activity);
  if (!d) return 0;
  const t = normTitle(text);
  return d.palavras.reduce((n, w) => (t.includes(normTitle(w)) ? n + 1 : n), 0);
}
