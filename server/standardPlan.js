// Padrão de cronograma aprimorado (2026-10-15; plano em docs/PLANO_APRIMORAMENTO_CRONOGRAMA_PADRAO.md, aprovado pelo Rafael): descrições melhores,
// subatividades e 3 atividades que faltavam (Contábil, RH/Folha/DP, Prontidão da virada), a partir do guia do Felipe — SEM mexer em prazo, data,
// status, responsável nem em nada já concluído. Fonte única: este arquivo alimenta o MODELO das empresas novas (db.js) e a rotina das que já existem.
// Textos só com o que está confirmado em norma ("recolhimento pelo adquirente", LC 214 art. 36; PIS/Cofins extintos e IPI em alíquota zero a partir de
// 2027, ADCT art. 126; CBS menos 0,1 p.p. em 2027-2028, ADCT art. 127 e LC 214 art. 347).
// Módulo sem dependências (db.js importa daqui).

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'para', 'com', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'por', 'ao', 'que', 'se', 'ou']);
export const tokens = (s) => new Set(norm(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)));
export const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i += 1; return i / (a.size + b.size - i); };
const sub = (k, t) => ({ k, t });

// Atividades que já existem no modelo: o título identifica; `oldDesc` é o texto antigo (só se a descrição da empresa ainda for IGUAL a ele é que ela troca).
export const MODEL = [
  { key: 'kickoff', title: 'Kickoff único no cliente',
    oldDesc: 'Mapeamento + captura de documentos + validação inicial, tudo em uma só visita',
    newDesc: 'Mapeamento + captura de documentos + validação inicial, tudo em uma só visita. Inclui nomear o responsável de cada área, instituir a reunião semanal de riscos e pedir ao ERP o ambiente de homologação e o cronograma de versões.',
    subs: [
      sub('kickoff-g1', 'Nomear o responsável de cada área e instituir a reunião semanal de riscos e evidências'),
      sub('kickoff-erp', 'Alinhar com o ERP o ambiente de homologação, separado da produção, e o cronograma de versões'),
      sub('kickoff-extracao', 'Extrair do ERP fornecedores, clientes, pagamentos e recebimentos com CNPJ, número da nota e datas'),
      sub('kickoff-regime', 'Validar o regime tributário dos principais fornecedores'),
    ] },
  { key: 'numero-geral', title: 'Retorno com o número geral',
    oldDesc: 'Impacto real em preço de compra, preço de venda, DRE e caixa',
    newDesc: 'Impacto real em preço de compra, preço de venda, DRE e caixa. Inclui o cenário de caixa do primeiro trimestre de 2027, com e sem recolhimento pelo adquirente e com o IPI zerado ou mantido.',
    subs: [] },
  { key: 'compras', title: 'Compras',
    oldDesc: 'Fornecedores que vão subir e descer de preço, item por item',
    newDesc: 'Fornecedores que vão subir e descer de preço, item por item. Recalcula o custo de cada compra pelo regime do fornecedor, define a negociação e quando recolher o tributo direto (recolhimento pelo adquirente).',
    subs: [
      sub('compras-cadastro', 'Regime do fornecedor como campo obrigatório no cadastro; curva ABC e CNAE dos fornecedores'),
      sub('compras-simulacao', 'Simular o custo atual × o novo, por fornecedor e por item'),
      sub('compras-negociacao', 'Negociar com base na simulação, conforme o regime de cada fornecedor'),
      sub('compras-rad', 'Definir quando usar o recolhimento pelo adquirente, conforme o risco do fornecedor'),
      sub('compras-ipi', 'Avaliar adiar para janeiro as compras de itens com IPI não creditável'),
    ] },
  { key: 'vendas', title: 'Vendas',
    oldDesc: 'Novos preços de venda por produto, cliente e canal',
    newDesc: 'Novos preços de venda por produto, cliente e canal. Refaz a formação de preço a partir do valor líquido, define a política por tipo de cliente e ajusta tabelas, propostas, comissões e a comunicação.',
    subs: [
      sub('vendas-ipi', 'Preparar o argumento comercial sobre o IPI e ajustar produção e estoque de dezembro'),
      sub('vendas-preco', 'Simular margens e refazer a formação de preço: valor líquido, IBS/CBS por fora, ICMS e ISS'),
      sub('vendas-politica', 'Definir a política de preço por tipo de cliente: regime regular, Simples e consumidor final'),
      sub('vendas-rad', 'Identificar os clientes que vão usar o recolhimento pelo adquirente e estimar o volume recebido líquido'),
      sub('vendas-adiantamento', 'Definir o tratamento de adiantamentos recebidos em 2026 para entrega em 2027'),
      sub('vendas-contratos', 'Revisar tabelas, propostas e contratos de 2027 com cláusula tributária'),
      sub('vendas-comissao', 'Redefinir a base de comissões e metas'),
      sub('vendas-comunicado', 'Comunicar os clientes sobre a nova nota fiscal e revisar o cadastro'),
    ] },
  { key: 'financeiro', title: 'Financeiro',
    oldDesc: 'Nota de débito, nota de crédito, adaptação da área financeira e do caixa',
    newDesc: 'Nota de débito, nota de crédito, adaptação da área financeira e do caixa. Inclui o orçamento de caixa do primeiro trimestre de 2027, os títulos com mercadoria e tributo separados, as guias do recolhimento pelo adquirente e o split payment.',
    subs: [
      sub('fin-caixa', 'Montar o orçamento de caixa de janeiro a março de 2027 e, se preciso, negociar capital de giro'),
      sub('fin-titulos', 'Revisar contas a pagar e a receber: retenções, valor líquido × bruto e controle de créditos por documento'),
      sub('fin-guias', 'Desenhar o processo de guias do recolhimento pelo adquirente, por documento, com controle contra pagamento em duplicidade'),
      sub('fin-ressarcimento', 'Pedir o ressarcimento dos saldos credores'),
      sub('fin-split', 'Acompanhar com bancos e credenciadoras a implantação do split payment'),
    ] },
  { key: 'fiscal', title: 'Fiscal / Tributário',
    oldDesc: 'cClassTrib e CST — coincide com a virada da CBS plena',
    newDesc: 'cClassTrib e CST — coincide com a virada da CBS plena. Define a política de IBS/CBS na base do ICMS e do ISS, a matriz de operações (CFOP, CST, cClassTrib), os créditos e a apuração, e os testes de emissão e recebimento.',
    subs: [
      sub('fiscal-base', 'Definir a política de cálculo do ICMS e do ISS com IBS/CBS na base, inclusive nos serviços prestados'),
      sub('fiscal-matriz', 'Mapear as operações e definir CST e cClassTrib de cada uma, inclusive as sem fornecimento, amostras, brindes e bonificações'),
      sub('fiscal-ncm', 'Garantir regra por NCM e origem cadastrada em todo produto ativo'),
      sub('fiscal-compras', 'Cadastrar as operações de compra nacional e decidir o cadastro item a item × por faixa de redução'),
      sub('fiscal-especiais', 'Parametrizar exportação, importação e Zona Franca de Manaus / áreas de livre comércio'),
      sub('fiscal-2027', 'Parametrizar 2027: PIS/Cofins desligados e IPI em alíquota zero (com a exceção da Zona Franca de Manaus)'),
      sub('fiscal-recebidas', 'Conferir as notas recebidas e definir quem trata os eventos da NF-e'),
      sub('fiscal-saldos', 'Levantar os saldos credores de PIS/Cofins e IPI e definir a transição da EFD-Contribuições'),
      sub('fiscal-testes', 'Testar emissão e recebimento com as regras de 2027 e repetir a cada nova versão do ERP'),
      sub('fiscal-apuracao', 'Validar a apuração de IBS/CBS e confirmar as obrigações acessórias de 2027'),
      sub('fiscal-acompanhar', 'Acompanhar a alíquota da CBS de 2027 e a lista de exceções do IPI'),
    ] },
  { key: 'juridico', title: 'Jurídico',
    oldDesc: 'Contratos e cláusulas de repactuação',
    newDesc: 'Contratos e cláusulas de repactuação. Inclui a decisão sobre a tese de IBS/CBS na base do ICMS e do ISS e o acompanhamento das normas ainda em publicação.',
    subs: [
      sub('jur-tese', 'Avaliar ação judicial sobre IBS/CBS na base do ICMS e do ISS'),
      sub('jur-contratos', 'Revisar contratos com clientes e fornecedores: cláusulas tributárias, recolhimento pelo adquirente, "impostos inclusos" e reequilíbrio'),
      sub('jur-normas', 'Acompanhar as normas ainda em publicação e as novas versões'),
    ] },
  { key: 'logistica', title: 'Logística',
    oldDesc: 'Malha, centros de distribuição e rotas',
    newDesc: 'Malha, centros de distribuição e rotas. Valida com o Fiscal cada fluxo físico (transferência, remessa, retorno, devolução e transporte) e o documento fiscal que ele exige.',
    subs: [
      sub('log-matriz', 'Validar com o Fiscal os fluxos físicos e documentais: transferências, remessas, retornos, entregas, devoluções e transporte'),
      sub('log-devolucao', 'Garantir que a devolução referencie a nota original, item a item'),
      sub('log-frete', 'Definir o tratamento do frete: IBS/CBS no conhecimento de transporte e frete de autônomo ou MEI'),
    ] },
  { key: 'controladoria', title: 'Controladoria',
    oldDesc: 'DRE reformada e indicadores executivos',
    newDesc: 'DRE reformada e indicadores executivos. A DRE passa a ter a receita sem os tributos cobrados por fora, as deduções e a nova base de IRPJ/CSLL.',
    subs: [sub('ctrl-dre', 'Ajustar a DRE: receita sem tributos por fora, deduções e base de IRPJ/CSLL')] },
  { key: 'sistemas', title: 'Adaptação de sistemas',
    oldDesc: 'Parametrização e homologação final do ERP',
    newDesc: 'Parametrização e homologação final do ERP. Acompanha o ambiente de homologação, os campos novos da nota (valor líquido, CST e cClassTrib de IBS/CBS), o novo DANFE, as notas de débito e crédito, os eventos, a EFD e a virada de PIS/Cofins e IPI.',
    subs: [
      sub('sis-ambiente', 'Ambiente de homologação, cronograma de versões e tabelas oficiais de cClassTrib, CST e crédito presumido'),
      sub('sis-campos', 'Campos novos da NF-e: IBS, CBS e IS por item, valor líquido e novos totais'),
      sub('sis-danfe', 'Novo DANFE com o bloco de IBS, CBS e IS'),
      sub('sis-debcred', 'Notas de débito e de crédito e eventos do emitente e do destinatário'),
      sub('sis-devolucao', 'Devolução referenciada item a item e validação cadastral na Receita'),
      sub('sis-tabelas', 'Tabela de alíquotas da CBS por vigência e tabela de CFOP, sem alíquota fixa no sistema'),
      sub('sis-servicos', 'NFS-e com cClassTrib correto, inclusive de redução, e leitura das notas tomadas; CT-e e faturas de energia e telecomunicações'),
      sub('sis-titulos', 'Títulos com mercadoria e tributo separados, baixa parcial e relatório de créditos por fornecedor e documento'),
      sub('sis-virada', 'Desligar PIS/Cofins e aplicar IPI em alíquota zero a partir de 01/01/2027, mantendo as exceções da Zona Franca de Manaus'),
      sub('sis-efd', 'EFD ICMS/IPI do leiaute de 2027, CNPJ alfanumérico e testes das integrações entre os sistemas'),
      sub('sis-contingencia', 'Plano de contingência para falha de emissão, de atualização de tabelas ou indisponibilidade do ERP ou da Sefaz'),
    ] },
  { key: 'duvidas', title: 'Tira-dúvidas geral',
    oldDesc: 'Todas as áreas juntas para fechar pendências soltas',
    newDesc: 'Todas as áreas juntas para fechar pendências soltas, cada uma com responsável, prazo e contingência.',
    subs: [
      sub('duv-treino', 'Treinar as equipes de Fiscal, Compras, Faturamento, Financeiro, Contabilidade e Cadastro nos novos procedimentos'),
      sub('duv-pendencias', 'Consolidar as pendências abertas, cada uma com responsável, prazo e contingência'),
    ] },
  { key: 'encerramento', title: 'Encerramento',
    oldDesc: 'Retrospectiva do ano e plano do Ano 2',
    newDesc: 'Retrospectiva do ano e plano do Ano 2. Inclui o balanço das pendências aceitas.',
    subs: [] },
];

// Atividades que faltavam. Criadas SEM data (o time define); `aliases` evitam criar de novo se a empresa já tem algo equivalente.
export const NEW_ACTIVITIES = [
  { key: 'contabil', title: 'Contábil', area: 'Contábil', responsible: 'Contábil', phaseName: 'Mão na Massa por Área',
    desc: 'Plano de contas, contabilização e fechamento com CBS e IBS: tributo a recolher, crédito a recuperar pendente e liberado e saldo credor.',
    aliases: ['contabil', 'contabilidade'],
    subs: [
      sub('cont-plano', 'Ajustar o plano de contas e o de-para: CBS, IBS estadual e IBS municipal a recolher, a recuperar pendente e liberado, e saldo credor'),
      sub('cont-lancamentos', 'Definir a contabilização de venda, compra, recolhimento pelo adquirente, notas de débito e de crédito e devolução'),
      sub('cont-testes', 'Testar a contabilização em homologação com alíquotas cheias'),
      sub('cont-fechamento', 'Criar o checklist mensal de fechamento: documentos fiscais, escrituração, apuração, razão contábil e conta corrente da Receita'),
      sub('cont-inventario', 'Fazer o inventário na virada e valorizar o estoque sem tributos recuperáveis'),
      sub('cont-saldos', 'Definir o tratamento contábil dos saldos antigos de PIS/Cofins e dos ajustes de transição'),
    ] },
  { key: 'rh', title: 'RH, Folha e DP', area: 'RH', responsible: 'RH', phaseName: 'Mão na Massa por Área',
    desc: 'Retenções sobre serviços e EFD-Reinf, créditos de benefícios, reoneração da folha e mão de obra própria × contratada.',
    aliases: ['rh', 'folha', 'dp', 'pessoal'],
    subs: [
      sub('rh-retencoes', 'Retirar PIS/Cofins das retenções sobre serviços e ajustar a EFD-Reinf'),
      sub('rh-beneficios', 'Verificar quais benefícios podem gerar crédito e se há previsão em acordo ou convenção coletiva'),
      sub('rh-cprb', 'Simular a reoneração gradual da folha (CPRB), se aplicável'),
      sub('rh-mao-de-obra', 'Comparar mão de obra própria e contratada, com avaliação de risco trabalhista'),
    ] },
  { key: 'prontidao', title: 'Prontidão da virada (go/no-go)', area: 'Diretoria', responsible: 'Diretoria', phaseName: 'Consolidação',
    desc: 'Critérios mínimos de prontidão, plano de suporte de janeiro e a decisão de seguir ou não com a virada.',
    aliases: ['prontidao', 'go', 'nogo', 'virada'],
    subs: [
      sub('pront-criterios', 'Definir os critérios mínimos de prontidão por área: operações mapeadas, documentos testados, ERP homologado, apuração e escrituração testadas, equipes orientadas'),
      sub('pront-suporte', 'Aprovar o plano de suporte de janeiro e o escalonamento de incidentes'),
      sub('pront-decisao', 'Decidir o go/no-go da virada, com ata e lista de pendências aceitas'),
    ] },
];

// Campos que o plano NUNCA pode alterar numa atividade que já existe (verificado em `applyPlanToData`).
export const PROTECTED_FIELDS = ['id', 'date', 'endDate', 'status', 'responsible', 'phase', 'month', 'priority', 'required', 'durationDays', 'title', 'clientDateConfirmed'];

const live = (arr) => (arr || []).filter((x) => x && !x.deleted);
const findModelActivity = (data, m) => live(data.activities).find((a) => norm(a.title) === norm(m.title));
export const hasSub = (activity, s) => {
  const t = tokens(s.t);
  return (activity.subactivities || []).some((x) => x && (x.stdId === s.k || norm(x.title) === norm(s.t) || jaccard(t, tokens(x.title)) >= 0.6));
};
// Conservador: uma atividade equivalente conta MESMO excluída pelo time (não ressuscita o que a equipe decidiu tirar).
const hasNewActivity = (data, n) => (data.activities || []).some((a) => a && (a.stdKey === n.key
  || norm(a.title) === norm(n.title) || [...tokens(a.title)].some((w) => n.aliases.includes(w))));

// Responsável da atividade nova: alguém da equipe com o nome da área, senão PRICETAX (nunca inventa quem não existe).
function pickResponsible(data, wanted) {
  const team = (data.team || []).map((t) => (typeof t === 'string' ? t : t && t.name)).filter(Boolean); // equipe: objetos {name} no app, strings no projeto em branco
  return team.find((n) => norm(n) === norm(wanted)) || team.find((n) => norm(n) === 'pricetax') || team[0] || 'PRICETAX';
}

// O que mudaria numa empresa (função pura, não altera `data`).
export function planForProject(data) {
  const descriptions = []; const subs = []; const creates = []; const skipped = [];
  for (const m of MODEL) {
    const a = findModelActivity(data, m);
    if (!a) { skipped.push({ title: m.title, reason: 'não encontrada (renomeada ou excluída)' }); continue; }
    if (a.status === 'concluido') { skipped.push({ title: m.title, reason: 'já concluída' }); continue; }
    if (norm(a.desc) === norm(m.oldDesc)) descriptions.push({ activityId: a.id, title: m.title, to: m.newDesc });
    else if (norm(a.desc) !== norm(m.newDesc)) skipped.push({ title: m.title, reason: 'descrição personalizada (mantida)' });
    const missing = m.subs.filter((s) => !hasSub(a, s));
    if (missing.length) subs.push({ activityId: a.id, title: m.title, items: missing });
  }
  for (const n of NEW_ACTIVITIES) if (!hasNewActivity(data, n)) creates.push({ key: n.key, title: n.title, subs: n.subs.length });
  return {
    descriptions, subs, creates, skipped,
    counts: { descriptions: descriptions.length, subs: subs.reduce((x, s) => x + s.items.length, 0), creates: creates.length },
    empty: !descriptions.length && !subs.length && !creates.length,
  };
}

const newSub = (s, uid) => ({ id: uid('s'), title: s.t, done: false, responsible: '', date: '', stdId: s.k });

// Aplica o plano e devolve { data, counts }. Falha (lança) se alguma atividade que já existia mudar em campo protegido.
export function applyPlanToData(data, uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`) {
  const plan = planForProject(data);
  if (plan.empty) return { data, counts: plan.counts, plan };
  const descById = new Map(plan.descriptions.map((d) => [d.activityId, d.to]));
  const subsById = new Map(plan.subs.map((s) => [s.activityId, s.items]));
  const activities = (data.activities || []).map((a) => {
    if (!a || !(descById.has(a.id) || subsById.has(a.id))) return a;
    return {
      ...a,
      ...(descById.has(a.id) ? { desc: descById.get(a.id) } : {}),
      ...(subsById.has(a.id) ? { subactivities: [...(a.subactivities || []), ...subsById.get(a.id).map((s) => newSub(s, uid))] } : {}),
    };
  });
  const phases = data.phases || [];
  const month0 = (data.activities || []).length ? Math.max(...data.activities.map((x) => x.month || 1)) : 0;
  const created = plan.creates.map((c, i) => {
    const n = NEW_ACTIVITIES.find((x) => x.key === c.key);
    const ph = phases.find((p) => norm(p.name) === norm(n.phaseName)) || phases[phases.length - 1];
    return {
      id: uid('act'), month: month0 + 1 + i, phase: ph ? ph.id : 1, title: n.title, desc: n.desc, responsible: pickResponsible(data, n.responsible),
      priority: '', participants: [], date: '', endDate: '', durationDays: '', status: 'nao-iniciado', required: false,
      subactivities: n.subs.map((s) => newSub(s, uid)), notes: '', attachments: [], comments: [], links: [], transcript: '', clientDateConfirmed: false,
      area: n.area, stdKey: n.key,
    };
  });
  const next = { ...data, activities: [...activities, ...created] };
  // Rede de segurança: nada do que já existia pode ter mudado fora de descrição e subatividades.
  const before = new Map((data.activities || []).map((a) => [a.id, a]));
  for (const a of next.activities) {
    const b = before.get(a.id);
    if (!b) continue;
    for (const f of PROTECTED_FIELDS) if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) throw new Error(`Padrão: o campo protegido "${f}" de "${b.title}" mudaria — abortado.`);
    const keptSubs = (b.subactivities || []).every((s, i) => JSON.stringify((a.subactivities || [])[i]) === JSON.stringify(s));
    if (!keptSubs) throw new Error(`Padrão: subatividades existentes de "${b.title}" mudariam — abortado.`);
  }
  if (next.activities.length !== (data.activities || []).length + created.length) throw new Error('Padrão: contagem de atividades inesperada — abortado.');
  return { data: next, counts: plan.counts, plan };
}

// MODELO das empresas novas: aplica as melhorias sobre a lista base do db.js (mesmos textos, mesmas subatividades, 3 atividades novas sem data).
export function improveTemplate(activities, uid) {
  const phases = [{ id: 1, name: 'Leitura Real' }, { id: 2, name: 'Mão na Massa por Área' }, { id: 3, name: 'Consolidação' }];
  const base = activities.map((a) => {
    const m = MODEL.find((x) => norm(x.title) === norm(a.title));
    if (!m) return a;
    return { ...a, desc: m.newDesc, subactivities: [...(a.subactivities || []), ...m.subs.filter((s) => !(a.subactivities || []).some((x) => norm(x.title) === norm(s.t))).map((s) => newSub(s, uid))] };
  });
  const month0 = Math.max(...activities.map((x) => x.month || 1));
  const created = NEW_ACTIVITIES.map((n, i) => ({
    id: `m${month0 + 1 + i}`, month: month0 + 1 + i, phase: (phases.find((p) => p.name === n.phaseName) || phases[2]).id, title: n.title, desc: n.desc, responsible: n.responsible,
    date: '', endDate: '', status: 'nao-iniciado', required: false, subactivities: n.subs.map((s) => newSub(s, uid)), notes: '', attachments: [], area: n.area, stdKey: n.key,
  }));
  return [...base, ...created];
}
