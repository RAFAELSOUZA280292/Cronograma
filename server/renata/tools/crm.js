// Ferramentas do CRM (§101): TODAS as operações do CRM (empresas, contatos, negócios, atividades, notas, produtos, funis, cadências, tags) como ferramentas
// estruturadas. Cada uma chama a rota do CRM que a tela usa, em nome do usuário — a validação, a auditoria ("RENATA (IA, a pedido de …)") e as permissões
// (admin/diretor/gestor/vendedor/consultor/financeiro/visualização) são as da própria tela.
import { T } from '../validate.js';
import { crmCan } from '../../crm/permissions.js';

const vis = (cap = 'read') => (u) => crmCan(u, cap);
const REL = ['prospect', 'client', 'former_client', 'partner'];
const ACT_TYPES = ['task', 'call', 'email', 'meeting', 'whatsapp', 'visit', 'followup'];

const undoUpdate = (tool, idKey) => (input, before) => {
  if (!before) return null;
  const patch = {};
  for (const k of Object.keys(input)) if (k !== idKey && k !== 'force' && before[k] !== undefined) patch[k] = before[k];
  return Object.keys(patch).length ? { tool, input: { [idKey]: input[idKey], ...patch }, label: 'devolver os valores anteriores' } : null;
};
const nm = (b, ...ks) => { for (const k of ks) if (b && b[k]) return b[k]; return ''; };

const companyProps = {
  legalName: T.str('Razão social / nome da empresa', { maxLength: 200 }), tradeName: T.str('Nome fantasia'), cnpj: T.str('CNPJ (14 dígitos, com ou sem pontuação)'),
  relationship: T.enm('Relação: prospect, client (cliente), former_client (ex-cliente), partner (parceiro)', REL), ownerId: T.str('Id do usuário responsável (use crm_listar_opcoes para achar)'),
  segment: T.str('Segmento'), city: T.str('Cidade'), state: T.str('UF (2 letras)'), source: T.str('Origem do cadastro'), phone: T.str('Telefone'), contactEmail: T.str('E-mail de contato'),
  website: T.str('Site'), taxRegime: T.str('Regime tributário (Lucro Real, Lucro Presumido, Simples Nacional, MEI, Outro)'), companySize: T.str('Porte (MEI, Micro, Pequeno, Médio, Grande)'),
  revenueEstimate: T.num('Faturamento estimado'), employees: T.int('Nº de funcionários'), erp: T.str('ERP usado'),
};
const contactProps = {
  firstName: T.str('Nome'), lastName: T.str('Sobrenome'), jobTitle: T.str('Cargo'), department: T.str('Departamento'), email: T.str('E-mail'), phone: T.str('Telefone'),
  whatsapp: T.str('WhatsApp'), linkedin: T.str('LinkedIn'), isPrimary: T.bool('É o contato principal da empresa'),
};
const dealProps = {
  title: T.str('Título do negócio', { maxLength: 200 }), dealType: T.enm('new (novo negócio) ou upsell (só para empresa cliente)', ['new', 'upsell']), value: T.num('Valor em reais'), mrr: T.num('Receita recorrente mensal'),
  expectedCloseDate: T.date('Previsão de fechamento'), ownerId: T.str('Id do usuário responsável'), primaryContactId: T.uuid('Contato principal (id)'), source: T.str('Origem'), description: T.str('Descrição'),
  probabilityOverride: T.int('Probabilidade manual (0 a 100)', { minimum: 0, maximum: 100 }),
};
const actProps = {
  title: T.str('Título da atividade', { maxLength: 200 }), activityType: T.enm('Tipo', ACT_TYPES), description: T.str('Descrição'), dueDate: T.date('Data'), dueTime: T.str('Horário HH:MM'),
  priority: T.enm('Prioridade', ['low', 'normal', 'high']), ownerId: T.str('Id do usuário responsável'), contactId: T.uuid('Contato (id)'), dealId: T.uuid('Negócio (id)'),
};
const withId = (idName, doc, props, required = []) => T.obj({ [idName]: T.uuid(doc), ...props }, [idName, ...required]);

export function registerCrm(registry) {
  const add = (def) => registry.add({ module: 'CRM', visible: vis(def.cap || 'read'), ...def });

  // ---------- consultas
  add({ name: 'crm_buscar', summary: 'Busca global no CRM por texto (empresas, contatos e negócios). Comece por aqui para achar o id de um registro.', risk: 'read', params: T.obj({ q: T.str('Texto (nome, CNPJ, e-mail, telefone)', { minLength: 2 }) }, ['q']), route: { method: 'GET', path: '/api/crm/search' } });
  add({ name: 'crm_listar_opcoes', summary: 'Opções do CRM: usuários responsáveis (id e nome), funis com etapas (ids), produtos, motivos de perda, origens. Use para traduzir nomes em ids.', risk: 'read', params: T.obj({}), route: { method: 'GET', path: '/api/crm/options' } });
  add({ name: 'crm_listar_empresas', summary: 'Lista empresas do CRM com filtros.', risk: 'read', params: T.obj({ q: T.str('Texto'), relationship: T.enm('Relação', REL), ownerId: T.str('Responsável (id, "me" ou "none")'), limit: T.int('Máximo (até 100)', { minimum: 1, maximum: 100 }) }), route: { method: 'GET', path: '/api/crm/companies' } });
  add({ name: 'crm_ver_empresa', summary: 'Ficha completa de uma empresa: dados, contatos, negócios, atividades e resumo.', risk: 'read', params: T.obj({ id: T.uuid('Id da empresa') }, ['id']), route: { method: 'GET', path: '/api/crm/companies/{id}' } });
  add({ name: 'crm_historico_empresa', summary: 'Linha do tempo (histórico) de uma empresa.', risk: 'read', params: T.obj({ id: T.uuid('Id da empresa'), limit: T.int('Máximo', { minimum: 1, maximum: 100 }) }, ['id']), route: { method: 'GET', path: '/api/crm/companies/{id}/timeline' } });
  add({ name: 'crm_listar_contatos', summary: 'Lista contatos (filtre por empresa ou texto).', risk: 'read', params: T.obj({ q: T.str('Texto'), companyId: T.uuid('Empresa (id)'), limit: T.int('Máximo', { minimum: 1, maximum: 100 }) }), route: { method: 'GET', path: '/api/crm/contacts' } });
  add({ name: 'crm_listar_negocios', summary: 'Lista negócios com filtros (situação, funil, responsável, atenção). ownerId aceita "me" apenas via crm_painel; aqui use o id do usuário.', risk: 'read',
    params: T.obj({ q: T.str('Texto'), status: T.enm('open (padrão), won, lost ou all', ['open', 'won', 'lost', 'all']), pipelineId: T.uuid('Funil (id)'), stageId: T.uuid('Etapa (id)'), ownerId: T.str('Responsável (id ou "none")'), companyId: T.uuid('Empresa (id)'),
      attention: T.enm('Atenção: late (passo atrasado), nonext (sem próximo passo), stalled (parado +14 dias), overdue (previsão vencida)', ['late', 'nonext', 'stalled', 'overdue']), tag: T.str('Tag'), limit: T.int('Máximo (até 100)', { minimum: 1, maximum: 100 }) }), route: { method: 'GET', path: '/api/crm/deals' } });
  add({ name: 'crm_ver_negocio', summary: 'Ficha completa de um negócio: dados, atividades, notas, histórico de etapas e linha do tempo.', risk: 'read', params: T.obj({ id: T.uuid('Id do negócio') }, ['id']), route: { method: 'GET', path: '/api/crm/deals/{id}' } });
  add({ name: 'crm_listar_atividades', summary: 'Lista atividades/follow-ups do CRM. ownerId="me" = as do usuário que pediu.', risk: 'read',
    params: T.obj({ ownerId: T.str('Responsável (id, "me" ou "none")'), bucket: T.enm('overdue (atrasadas), today, week, later', ['overdue', 'today', 'week', 'later']), status: T.enm('open (padrão), done, cancelled, all', ['open', 'done', 'cancelled', 'all']), dealId: T.uuid('Negócio (id)'), companyId: T.uuid('Empresa (id)'), limit: T.int('Máximo (até 100)', { minimum: 1, maximum: 100 }) }), route: { method: 'GET', path: '/api/crm/activities' } });
  add({ name: 'crm_ver_atividade', summary: 'Detalhe de uma atividade do CRM.', risk: 'read', params: T.obj({ id: T.uuid('Id da atividade') }, ['id']), route: { method: 'GET', path: '/api/crm/activities/{id}' } });
  add({ name: 'crm_painel', summary: 'Indicadores do CRM por painel: mine (meu dia), team (time: por responsável), revenue (receita/MRR/previsão), accounts (contas).', risk: 'read', params: T.obj({ lens: T.enm('Painel', ['mine', 'team', 'revenue', 'accounts']) }, ['lens']), route: { method: 'GET', path: '/api/crm/overview' }, map: (i) => i });
  add({ name: 'crm_listar_funis', summary: 'Funis e etapas (ids, probabilidade, prazo).', risk: 'read', params: T.obj({}), route: { method: 'GET', path: '/api/crm/pipelines' } });
  add({ name: 'crm_listar_produtos', summary: 'Catálogo de produtos.', risk: 'read', params: T.obj({}), route: { method: 'GET', path: '/api/crm/products' } });
  add({ name: 'crm_listar_cadencias', summary: 'Cadências de follow-up configuradas por etapa.', risk: 'read', params: T.obj({}), route: { method: 'GET', path: '/api/crm/cadences' } });
  add({ name: 'crm_listar_tags', summary: 'Tags de negócios.', risk: 'read', params: T.obj({}), route: { method: 'GET', path: '/api/crm/tags' } });
  add({ name: 'crm_consultar_cnpj', summary: 'Consulta dados de um CNPJ na Receita e diz se já existe duplicado no CRM.', risk: 'read', cap: 'write', params: T.obj({ cnpj: T.str('CNPJ') }, ['cnpj']), route: { method: 'GET', path: '/api/crm/cnpj/{cnpj}' } });

  // ---------- empresas
  add({ name: 'crm_criar_empresa', summary: 'Cadastra uma empresa. Se houver empresa parecida o servidor avisa (duplicidade): mostre ao usuário antes de repetir com force=true.', risk: 'write', cap: 'write', creates: true,
    params: T.obj({ ...companyProps, force: T.bool('Criar mesmo havendo empresa parecida (só depois de o usuário confirmar)') }, ['legalName']), route: { method: 'POST', path: '/api/crm/companies' },
    describe: (i) => `Cadastrar a empresa “${i.legalName}”${i.cnpj ? ` (CNPJ ${i.cnpj})` : ''}.`, undo: (i, b, r) => (r && r.company ? { tool: 'crm_excluir_empresa', input: { id: r.company.id }, label: 'excluir a empresa criada' } : null),
    summarize: (i, r) => `Empresa “${(r.company && r.company.legalName) || i.legalName}” cadastrada.` });
  add({ name: 'crm_atualizar_empresa', summary: 'Altera dados de uma empresa (só envie o que muda).', risk: 'write', cap: 'write', params: withId('id', 'Id da empresa', { ...companyProps, force: T.bool('Ignorar aviso de duplicidade') }),
    route: { method: 'PATCH', path: '/api/crm/companies/{id}' }, before: { path: '/api/crm/companies/{id}', pick: (r) => r.company }, undo: undoUpdate('crm_atualizar_empresa', 'id'),
    describe: (i, b) => `Alterar a empresa “${nm(b, 'legalName')}”: ${Object.keys(i).filter((k) => !['id', 'force'].includes(k)).join(', ')}.` });
  add({ name: 'crm_excluir_empresa', summary: 'Exclui (lógica) uma empresa do CRM — vai para a lixeira, o histórico permanece.', risk: 'critical', cap: 'remove', params: T.obj({ id: T.uuid('Id da empresa') }, ['id']),
    route: { method: 'DELETE', path: '/api/crm/companies/{id}' }, before: { path: '/api/crm/companies/{id}', pick: (r) => r.company }, describe: (i, b) => `EXCLUIR a empresa “${nm(b, 'legalName')}” (e o que depende dela no CRM).` });
  add({ name: 'crm_vincular_projeto', summary: 'Vincula uma empresa do CRM a um cronograma (projeto) de cliente.', risk: 'write', cap: 'write', params: T.obj({ id: T.uuid('Empresa do CRM (id)'), projectId: T.str('Id do projeto/cronograma') }, ['id', 'projectId']),
    route: { method: 'POST', path: '/api/crm/companies/{id}/projects' }, describe: (i) => 'Vincular a empresa ao cronograma informado.' });

  // ---------- contatos
  add({ name: 'crm_criar_contato', summary: 'Cadastra um contato de uma empresa.', risk: 'write', cap: 'write', creates: true, params: T.obj({ companyId: T.uuid('Empresa (id)'), ...contactProps, force: T.bool('Ignorar aviso de duplicidade') }, ['companyId', 'firstName']),
    route: { method: 'POST', path: '/api/crm/contacts' }, describe: (i) => `Cadastrar o contato ${i.firstName} ${i.lastName || ''}.`, undo: (i, b, r) => (r && r.contact ? { tool: 'crm_excluir_contato', input: { id: r.contact.id }, label: 'excluir o contato criado' } : null) });
  add({ name: 'crm_atualizar_contato', summary: 'Altera dados de um contato.', risk: 'write', cap: 'write', params: withId('id', 'Id do contato', { ...contactProps, force: T.bool('Ignorar aviso de duplicidade') }),
    route: { method: 'PATCH', path: '/api/crm/contacts/{id}' }, before: { path: '/api/crm/contacts/{id}', pick: (r) => r.contact }, undo: undoUpdate('crm_atualizar_contato', 'id'),
    describe: (i, b) => `Alterar o contato ${nm(b, 'firstName')} ${nm(b, 'lastName')}.` });
  add({ name: 'crm_excluir_contato', summary: 'Exclui (lógica) um contato.', risk: 'critical', cap: 'write', params: T.obj({ id: T.uuid('Id do contato') }, ['id']), route: { method: 'DELETE', path: '/api/crm/contacts/{id}' },
    before: { path: '/api/crm/contacts/{id}', pick: (r) => r.contact }, describe: (i, b) => `EXCLUIR o contato ${nm(b, 'firstName')} ${nm(b, 'lastName')}.` });

  // ---------- negócios
  add({ name: 'crm_criar_negocio', summary: 'Cria um negócio numa empresa já cadastrada (sem pipelineId/stageId usa o funil padrão e a 1ª etapa). Sem ownerId o responsável é quem pediu.', risk: 'write', cap: 'write', creates: true,
    params: T.obj({ companyId: T.uuid('Empresa (id)'), ...dealProps, pipelineId: T.uuid('Funil (id)'), stageId: T.uuid('Etapa em aberto (id)') }, ['companyId', 'title']), route: { method: 'POST', path: '/api/crm/deals' },
    describe: (i) => `Criar o negócio “${i.title}”.`, undo: (i, b, r) => (r && r.deal ? { tool: 'crm_excluir_negocio', input: { id: r.deal.id }, label: 'excluir o negócio criado' } : null), summarize: (i, r) => `Negócio “${(r.deal && r.deal.title) || i.title}” criado.` });
  add({ name: 'crm_criar_lead_rapido', summary: 'Cadastra empresa + contato + negócio de uma vez (lead novo da prospecção). Empresa parecida → o servidor avisa.', risk: 'write', cap: 'write', creates: true,
    params: T.obj({ companyName: T.str('Nome da empresa'), contactName: T.str('Nome do contato'), phone: T.str('Telefone/WhatsApp'), email: T.str('E-mail'), title: T.str('Título do negócio'), source: T.str('Origem'), pipelineId: T.uuid('Funil (id)'), stageId: T.uuid('Etapa (id)'), force: T.bool('Criar mesmo com empresa parecida') }, ['companyName']),
    route: { method: 'POST', path: '/api/crm/leads' }, describe: (i) => `Cadastrar lead rápido: ${i.companyName}${i.contactName ? ` / ${i.contactName}` : ''}.` });
  add({ name: 'crm_atualizar_negocio', summary: 'Altera um negócio (valor, previsão, responsável, contato, origem, descrição…). Para trocar de etapa use crm_mover_negocio.', risk: 'write', cap: 'write', params: withId('id', 'Id do negócio', dealProps),
    route: { method: 'PATCH', path: '/api/crm/deals/{id}' }, before: { path: '/api/crm/deals/{id}', pick: (r) => r.deal }, undo: undoUpdate('crm_atualizar_negocio', 'id'),
    describe: (i, b) => `Alterar o negócio “${nm(b, 'title')}”: ${Object.keys(i).filter((k) => k !== 'id').join(', ')}.` });
  add({ name: 'crm_mover_negocio', summary: 'Move um negócio de etapa. Para GANHAR ou PERDER, mova para a etapa Ganho/Perdido do funil (perder exige lostReason; veja os motivos em crm_listar_opcoes). Fechar pede confirmação.', risk: 'write', cap: 'write',
    params: T.obj({ id: T.uuid('Id do negócio'), stageId: T.uuid('Etapa de destino (id)'), lostReason: T.str('Motivo da perda (chave), se for perder'), lostDetail: T.str('Detalhe da perda') }, ['id', 'stageId']), route: { method: 'POST', path: '/api/crm/deals/{id}/move' },
    before: { path: '/api/crm/deals/{id}', pick: (r) => r.deal }, undo: (i, b) => (b && b.stageId && b.status === 'open' ? { tool: 'crm_mover_negocio', input: { id: i.id, stageId: b.stageId }, label: 'voltar à etapa anterior' } : null),
    confirm: (i) => !!i.lostReason, describe: (i, b) => `Mover o negócio “${nm(b, 'title')}” da etapa “${nm(b, 'stageName')}” para a etapa informada${i.lostReason ? ` como PERDIDO (${i.lostReason})` : ''}.` });
  add({ name: 'crm_fechar_negocio_ganho', summary: 'Marca um negócio como GANHO (move para a etapa Ganho do funil dele). Sempre pede confirmação: muda indicadores e pode promover a empresa a cliente.', risk: 'critical', cap: 'write', params: T.obj({ id: T.uuid('Id do negócio') }, ['id']),
    before: { path: '/api/crm/deals/{id}', pick: (r) => r.deal }, describe: (i, b) => `GANHAR o negócio “${nm(b, 'title')}”${b && b.value ? ` (R$ ${b.value})` : ''}.`,
    run: async (ctx, i) => closeDeal(ctx, i.id, 'won', {}) });
  add({ name: 'crm_fechar_negocio_perdido', summary: 'Marca um negócio como PERDIDO com o motivo (chaves em crm_listar_opcoes › lostReasons). Sempre pede confirmação.', risk: 'critical', cap: 'write',
    params: T.obj({ id: T.uuid('Id do negócio'), lostReason: T.str('Motivo da perda (chave)'), lostDetail: T.str('Detalhe') }, ['id', 'lostReason']),
    before: { path: '/api/crm/deals/{id}', pick: (r) => r.deal }, describe: (i, b) => `PERDER o negócio “${nm(b, 'title')}” (motivo: ${i.lostReason}).`, run: async (ctx, i) => closeDeal(ctx, i.id, 'lost', { lostReason: i.lostReason, lostDetail: i.lostDetail }) });
  add({ name: 'crm_excluir_negocio', summary: 'Exclui (lógica) um negócio.', risk: 'critical', cap: 'remove', params: T.obj({ id: T.uuid('Id do negócio') }, ['id']), route: { method: 'DELETE', path: '/api/crm/deals/{id}' },
    before: { path: '/api/crm/deals/{id}', pick: (r) => r.deal }, describe: (i, b) => `EXCLUIR o negócio “${nm(b, 'title')}”.` });
  add({ name: 'crm_definir_tags_negocio', summary: 'Define as tags de um negócio (substitui a lista).', risk: 'write', cap: 'write', params: T.obj({ id: T.uuid('Id do negócio'), tags: T.arr('Nomes das tags', T.str('tag'), { maxItems: 20 }) }, ['id', 'tags']),
    route: { method: 'PUT', path: '/api/crm/deals/{id}/tags' }, before: { path: '/api/crm/deals/{id}', pick: (r) => r.deal }, undo: (i, b) => (b ? { tool: 'crm_definir_tags_negocio', input: { id: i.id, tags: b.tags || [] }, label: 'voltar às tags anteriores' } : null), describe: (i, b) => `Definir as tags do negócio “${nm(b, 'title')}”: ${i.tags.join(', ') || '(nenhuma)'}.` });

  // ---------- atividades
  add({ name: 'crm_criar_atividade', summary: 'Agenda uma atividade/follow-up do CRM numa empresa (opcionalmente num negócio e contato). Sem ownerId o responsável é quem pediu.', risk: 'write', cap: 'write', creates: true,
    params: T.obj({ companyId: T.uuid('Empresa (id)'), ...actProps, alreadyDone: T.bool('Registrar como já realizada') }, ['companyId', 'title', 'dueDate']), route: { method: 'POST', path: '/api/crm/activities' },
    describe: (i) => `Agendar “${i.title}” para ${i.dueDate}${i.dueTime ? ` ${i.dueTime}` : ''}.`, undo: (i, b, r) => (r && r.activity ? { tool: 'crm_excluir_atividade', input: { id: r.activity.id }, label: 'excluir a atividade criada' } : null) });
  add({ name: 'crm_atualizar_atividade', summary: 'Altera uma atividade em aberto (reagendar, trocar responsável, prioridade, título…).', risk: 'write', cap: 'write', params: withId('id', 'Id da atividade', actProps),
    route: { method: 'PATCH', path: '/api/crm/activities/{id}' }, before: { path: '/api/crm/activities/{id}', pick: (r) => r.activity }, undo: undoUpdate('crm_atualizar_atividade', 'id'),
    describe: (i, b) => `Alterar a atividade “${nm(b, 'title')}”: ${Object.keys(i).filter((k) => k !== 'id').join(', ')}.` });
  add({ name: 'crm_concluir_atividade', summary: 'Conclui uma atividade com o resultado (e, se houver cadência, o servidor agenda o próximo passo).', risk: 'write', cap: 'write', params: T.obj({ id: T.uuid('Id da atividade'), outcome: T.str('Resultado, em uma linha') }, ['id']),
    route: { method: 'POST', path: '/api/crm/activities/{id}/complete' }, before: { path: '/api/crm/activities/{id}', pick: (r) => r.activity }, undo: (i) => ({ tool: 'crm_reabrir_atividade', input: { id: i.id }, label: 'reabrir a atividade' }),
    describe: (i, b) => `Concluir “${nm(b, 'title')}”.` });
  add({ name: 'crm_reabrir_atividade', summary: 'Reabre uma atividade concluída ou cancelada.', risk: 'write', cap: 'write', params: T.obj({ id: T.uuid('Id da atividade') }, ['id']), route: { method: 'POST', path: '/api/crm/activities/{id}/reopen' },
    before: { path: '/api/crm/activities/{id}', pick: (r) => r.activity }, describe: (i, b) => `Reabrir “${nm(b, 'title')}”.` });
  add({ name: 'crm_cancelar_atividade', summary: 'Cancela uma atividade em aberto.', risk: 'write', cap: 'write', params: T.obj({ id: T.uuid('Id da atividade') }, ['id']), route: { method: 'POST', path: '/api/crm/activities/{id}/cancel' },
    before: { path: '/api/crm/activities/{id}', pick: (r) => r.activity }, undo: (i) => ({ tool: 'crm_reabrir_atividade', input: { id: i.id }, label: 'reabrir a atividade' }), describe: (i, b) => `Cancelar “${nm(b, 'title')}”.` });
  add({ name: 'crm_excluir_atividade', summary: 'Exclui (lógica) uma atividade.', risk: 'critical', cap: 'remove', params: T.obj({ id: T.uuid('Id da atividade') }, ['id']), route: { method: 'DELETE', path: '/api/crm/activities/{id}' },
    before: { path: '/api/crm/activities/{id}', pick: (r) => r.activity }, describe: (i, b) => `EXCLUIR a atividade “${nm(b, 'title')}”.` });

  // ---------- notas
  add({ name: 'crm_registrar_nota', summary: 'Registra uma nota/comentário/interação em um negócio, empresa ou contato.', risk: 'write', cap: 'write', creates: true,
    params: T.obj({ entityType: T.enm('Onde registrar', ['deal', 'company', 'contact']), entityId: T.uuid('Id do negócio/empresa/contato'), body: T.str('Texto da nota', { minLength: 1, maxLength: 5000 }) }, ['entityType', 'entityId', 'body']),
    route: { method: 'POST', path: '/api/crm/notes' }, describe: (i) => `Registrar nota: “${i.body.slice(0, 80)}${i.body.length > 80 ? '…' : ''}”.`, undo: (i, b, r) => (r && r.note ? { tool: 'crm_excluir_nota', input: { id: r.note.id }, label: 'excluir a nota' } : null) });
  add({ name: 'crm_editar_nota', summary: 'Edita o texto de uma nota.', risk: 'write', cap: 'write', params: T.obj({ id: T.uuid('Id da nota'), body: T.str('Novo texto', { minLength: 1, maxLength: 5000 }) }, ['id', 'body']), route: { method: 'PATCH', path: '/api/crm/notes/{id}' },
    describe: () => 'Editar uma nota.' });
  add({ name: 'crm_excluir_nota', summary: 'Exclui uma nota.', risk: 'critical', cap: 'write', params: T.obj({ id: T.uuid('Id da nota') }, ['id']), route: { method: 'DELETE', path: '/api/crm/notes/{id}' }, describe: () => 'EXCLUIR uma nota.' });

  // ---------- catálogo, funis e cadências (configuração: sempre confirmam)
  add({ name: 'crm_criar_produto', summary: 'Cadastra um produto no catálogo.', risk: 'write', cap: 'catalog', confirm: 'always', creates: true, params: T.obj({ name: T.str('Nome'), description: T.str('Descrição'), billing: T.enm('one_time (pontual) ou recurring (mensal)', ['one_time', 'recurring']), listPrice: T.num('Preço de tabela'), category: T.str('Categoria') }, ['name']),
    route: { method: 'POST', path: '/api/crm/products' }, describe: (i) => `Cadastrar o produto “${i.name}”.` });
  add({ name: 'crm_atualizar_produto', summary: 'Altera um produto do catálogo.', risk: 'write', cap: 'catalog', confirm: 'always', params: T.obj({ id: T.uuid('Id do produto'), name: T.str('Nome'), description: T.str('Descrição'), billing: T.enm('Cobrança', ['one_time', 'recurring']), listPrice: T.num('Preço'), category: T.str('Categoria'), active: T.bool('Ativo') }, ['id']),
    route: { method: 'PATCH', path: '/api/crm/products/{id}' }, describe: () => 'Alterar um produto do catálogo.' });
  add({ name: 'crm_excluir_produto', summary: 'Exclui um produto do catálogo.', risk: 'critical', cap: 'catalog', params: T.obj({ id: T.uuid('Id do produto') }, ['id']), route: { method: 'DELETE', path: '/api/crm/products/{id}' }, describe: () => 'EXCLUIR um produto do catálogo.' });
  add({ name: 'crm_criar_funil', summary: 'Cria um funil de vendas.', risk: 'write', cap: 'funnel', confirm: 'always', creates: true, params: T.obj({ name: T.str('Nome do funil'), openStageNames: T.arr('Etapas em aberto, em ordem', T.str('etapa'), { maxItems: 20 }) }, ['name']), route: { method: 'POST', path: '/api/crm/pipelines' },
    describe: (i) => `Criar o funil “${i.name}”${i.openStageNames ? ` com ${i.openStageNames.length} etapas` : ''}.` });
  add({ name: 'crm_atualizar_funil', summary: 'Renomeia um funil ou o define como padrão.', risk: 'write', cap: 'funnel', confirm: 'always', params: T.obj({ id: T.uuid('Id do funil'), name: T.str('Novo nome'), isDefault: T.bool('Tornar padrão') }, ['id']), route: { method: 'PATCH', path: '/api/crm/pipelines/{id}' },
    describe: () => 'Alterar um funil.' });
  add({ name: 'crm_arquivar_funil', summary: 'Arquiva (exclui) um funil SEM negócios.', risk: 'critical', cap: 'funnel', params: T.obj({ id: T.uuid('Id do funil') }, ['id']), route: { method: 'DELETE', path: '/api/crm/pipelines/{id}' }, describe: () => 'ARQUIVAR um funil.' });
  add({ name: 'crm_salvar_etapas', summary: 'Define a lista completa de etapas em aberto de um funil (ordem, nome, probabilidade, prazo). Lista completa: o que faltar é removido.', risk: 'critical', cap: 'funnel',
    params: T.obj({ id: T.uuid('Id do funil'), stages: T.arr('Etapas em aberto na ordem', T.obj({ id: T.uuid('Id da etapa existente'), name: T.str('Nome'), probability: T.int('Probabilidade de fechar 0-100 (obrigatória; repita a atual das etapas que já existem — veja crm_listar_funis)', { minimum: 0, maximum: 100 }), slaDays: T.int('Prazo em dias', { minimum: 1, maximum: 365 }) }, ['name', 'probability']), { minItems: 1, maxItems: 30 }) }, ['id', 'stages']),
    route: { method: 'POST', path: '/api/crm/pipelines/{id}/stages' }, describe: (i) => `SALVAR ${i.stages.length} etapas do funil (etapas fora da lista são removidas).` });
  add({ name: 'crm_criar_cadencia', summary: 'Cria a cadência de follow-up de uma etapa (passos automáticos; vale só para negócios que ENTRAREM na etapa).', risk: 'write', cap: 'funnel', confirm: 'always', creates: true,
    params: T.obj({ pipelineId: T.uuid('Funil (id)'), stageId: T.uuid('Etapa (id)'), name: T.str('Nome'), steps: T.arr('Passos (1 a 8)', T.obj({ title: T.str('Título'), type: T.enm('Tipo', ACT_TYPES), days: T.int('Dias (1º: da entrada; demais: da conclusão do anterior)', { minimum: 0, maximum: 90 }) }, ['title', 'days']), { minItems: 1, maxItems: 8 }) }, ['pipelineId', 'stageId', 'steps']),
    route: { method: 'POST', path: '/api/crm/cadences' }, describe: (i) => `Criar a cadência com ${i.steps.length} passo(s) na etapa informada.` });
  add({ name: 'crm_excluir_cadencia', summary: 'Exclui uma cadência.', risk: 'critical', cap: 'funnel', params: T.obj({ id: T.uuid('Id da cadência') }, ['id']), route: { method: 'DELETE', path: '/api/crm/cadences/{id}' }, describe: () => 'EXCLUIR uma cadência.' });

  // ---------- lote
  add({ name: 'crm_lote_atualizar_negocios', summary: 'Aplica a MESMA alteração a vários negócios de uma vez (até 100): responsável, previsão ou origem. Sempre pede confirmação e informa quantos serão alterados.', risk: 'critical', cap: 'write',
    params: T.obj({ ids: T.arr('Ids dos negócios', T.uuid('id'), { minItems: 1, maxItems: 100 }), ownerId: T.str('Novo responsável (id)'), expectedCloseDate: T.date('Nova previsão'), source: T.str('Nova origem') }, ['ids']),
    bulk: (i) => i.ids.length, describe: (i) => `ALTERAR ${i.ids.length} negócio(s): ${['ownerId', 'expectedCloseDate', 'source'].filter((k) => i[k] !== undefined).join(', ')}.`,
    run: async (ctx, i) => bulkPatch(ctx, '/api/crm/deals/', i.ids, pick(i, ['ownerId', 'expectedCloseDate', 'source'])) });
  add({ name: 'crm_lote_atualizar_atividades', summary: 'Aplica a MESMA alteração a várias atividades do CRM (até 100): responsável, data, prioridade. Sempre pede confirmação. Reatribuição em lote não notifica uma a uma.', risk: 'critical', cap: 'write',
    params: T.obj({ ids: T.arr('Ids das atividades', T.uuid('id'), { minItems: 1, maxItems: 100 }), ownerId: T.str('Novo responsável (id)'), dueDate: T.date('Nova data'), priority: T.enm('Prioridade', ['low', 'normal', 'high']) }, ['ids']),
    bulk: (i) => i.ids.length, describe: (i) => `ALTERAR ${i.ids.length} atividade(s): ${['ownerId', 'dueDate', 'priority'].filter((k) => i[k] !== undefined).join(', ')}.`,
    run: async (ctx, i) => bulkPatch(ctx, '/api/crm/activities/', i.ids, pick(i, ['ownerId', 'dueDate', 'priority'])) });
}

const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// Fechar negócio: acha a etapa Ganho/Perdido do funil do negócio e move (a mesma chamada da tela).
async function closeDeal(ctx, id, kind, extra) {
  const { callInternal } = await import('../internalCall.js');
  const d = await callInternal({ userId: ctx.user.id, method: 'GET', path: `/api/crm/deals/${encodeURIComponent(id)}` });
  if (d.status !== 200) return d;
  const stage = (d.json.stages || []).find((s) => s.kind === kind);
  if (!stage) return { status: 400, json: { message: `O funil deste negócio não tem etapa ${kind === 'won' ? 'Ganho' : 'Perdido'}.` } };
  return callInternal({ userId: ctx.user.id, commandId: ctx.actionId, method: 'POST', path: `/api/crm/deals/${encodeURIComponent(id)}/move`, body: { stageId: stage.id, ...extra } });
}

async function bulkPatch(ctx, base, ids, patch) {
  if (!Object.keys(patch).length) return { status: 400, json: { message: 'Informe o que alterar (responsável, data, prioridade, previsão ou origem).' } };
  const { callInternal } = await import('../internalCall.js');
  const done = []; const failed = [];
  for (const id of [...new Set(ids)]) {
    const body = base.includes('activities') ? { ...patch, silentNotify: true } : patch; // lote não dispara um aviso por atividade
    const r = await callInternal({ userId: ctx.user.id, commandId: ctx.actionId, method: 'PATCH', path: `${base}${encodeURIComponent(id)}`, body });
    if (r.status >= 200 && r.status < 300) done.push(id); else failed.push({ id, motivo: (r.json && r.json.message) || `HTTP ${r.status}` });
  }
  const ok = done.length > 0;
  return { status: ok ? 200 : 400, partial: ok && failed.length > 0, json: { alterados: done.length, falhas: failed.length, ids_alterados: done, falhas_detalhe: failed.slice(0, 20) } };
}
