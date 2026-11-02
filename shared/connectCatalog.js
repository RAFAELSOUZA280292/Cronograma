// Catálogo único da API de conectividade (2026-11-02, §129): é daqui que saem a descoberta (`GET /api/connect` com a chave), a especificação
// OpenAPI 3.1 (`/api/connect/openapi.json`) e o guia legível (`/api/connect/docs`) — nunca três listas que se desencontram.
// Fica em shared/ porque o guia da tela (src/connect/guide.js) usa as mesmas regras. Puro (sem banco): quem chama calcula `caps` (o que a chave E o dono dela podem) e o catálogo só filtra e formata.
// Cada entrada: `need` = a capacidade exigida (ver capsFor), `params` (path/query), `body` (campos + exemplo), `response` (exemplo enxuto).
// Regra para quem mexer: rota nova em server/connect.js entra aqui, com o mesmo `need` que o handler confere; o teste
// scripts/connect-discovery.test.mjs percorre este catálogo contra o servidor e falha se alguma rota anunciada não existir.

const S = (description, extra = {}) => ({ type: 'string', description, ...extra });
const I = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const B = (description) => ({ type: 'boolean', description });
const p = (name, schema, required = false) => ({ name, schema, required });

export const GROUPS = {
  conta: 'Quem é a chave',
  atividades: 'Gestão de Atividades (quadro pessoal do dono da chave)',
  empresas: 'Empresas (cronogramas) e reuniões',
  agenda: 'Agenda (Google Calendar do dono da chave)',
  equipe: 'Dia da equipe',
  crm: 'CRM (empresas, contatos, negócios, atividades e notas comerciais)',
};

const DAY = S('Data AAAA-MM-DD', { pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const UUID = (what) => S(`Id (uuid) ${what}`, { format: 'uuid' });

export const CATALOG = [
  // ---------------------------------------------------------------- conta
  { id: 'me', group: 'conta', need: 'any', method: 'GET', path: '/api/connect/me',
    summary: 'Dono da chave, permissão, validade e a data de hoje em Brasília.',
    response: { name: 'Rafael Souza', role: 'master', tokenName: 'Claude do XPED', scope: 'read_all', scopeLabel: 'Ler tudo…', expiresAt: '2027-05-01T12:00:00.000Z', today: '2026-11-03', modules: { personalBoard: true, companies: true } } },

  // ---------------------------------------------------------------- atividades
  { id: 'activities.list', group: 'atividades', need: 'personal', method: 'GET', path: '/api/connect/activities',
    summary: 'Atividades do quadro pessoal, atrasadas primeiro.',
    params: [p('status', S('Filtro', { enum: ['open', 'overdue', 'today', 'urgent', 'done', 'all'], default: 'open' })), p('q', S('Texto a procurar no título, descrição, coluna ou página')), p('limit', I('Máximo de itens (1–200)', { default: 50, minimum: 1, maximum: 200 }))],
    response: { today: '2026-11-03', total: 1, activities: [{ id: 'card-ab12cd3', title: 'Revisar parecer 12/2026', board: 'Rafael', column: 'A fazer', priority: 'alta', status: 'nao-iniciada', dueDate: '2026-11-05', overdue: false, dueToday: false, completed: false }] } },
  { id: 'activities.create', group: 'atividades', need: 'createActivity', method: 'POST', path: '/api/connect/activities', writes: true,
    summary: 'Cria uma atividade no quadro pessoal. Repetir com a mesma `ref` devolve a mesma atividade (não duplica).',
    body: { required: ['title'], fields: { title: S('Título (até 200 caracteres)'), desc: S('Descrição'), dueDate: DAY, priority: S('Prioridade', { enum: ['urgente', 'alta', 'media', 'baixa'] }), board: S('Página: nome ou id (padrão: a primeira)'), column: S('Coluna: nome ou id (padrão: a primeira)'), ref: S('Chave estável sua, para não duplicar') },
      example: { title: 'Revisar parecer 12/2026', dueDate: '2026-11-10', priority: 'alta', column: 'A fazer', ref: 'parecer-12-2026' } },
    response: { created: true, activity: { id: 'card-ab12cd3', title: 'Revisar parecer 12/2026', board: 'Rafael', column: 'A fazer', priority: 'alta', dueDate: '2026-11-10' } } },
  { id: 'board.read', group: 'atividades', need: 'personal', method: 'GET', path: '/api/connect/board',
    summary: 'O quadro pessoal inteiro com ids (páginas, colunas, cartões). Leia antes de organizar.',
    params: [p('checklist', S('"1" traz os passos de cada cartão', { enum: ['1'] }))],
    response: { today: '2026-11-03', updatedAt: '2026-11-03T12:00:00.000Z', pages: [{ id: 'board-1', name: 'Rafael', columns: [{ id: 'col-1', name: 'A fazer', cards: [{ id: 'card-ab12cd3', title: '…', status: 'nao-iniciada', responsibles: ['Felipe'] }] }] }] } },
  { id: 'board.plan', group: 'atividades', need: 'boardPlan', method: 'POST', path: '/api/connect/board/plan', writes: true,
    summary: 'Organiza o quadro em lote. Sem `apply` só mostra a prévia (com `digest`); para gravar, repita o MESMO corpo com apply:true, confirm:true e o digest.',
    body: { required: ['operations'], fields: { operations: { type: 'array', items: { type: 'object' }, description: 'Até 300. op = create_column, rename_column, create_card, move_card, update_card, add_checklist, merge_cards, trash_card, archive_card' }, apply: B('true = gravar (exige confirm e digest)'), confirm: B('true junto com apply'), digest: S('O digest devolvido pela prévia') },
      example: { operations: [{ op: 'update_card', card: 'card-ab12cd3', set: { dueDate: '2026-11-09', responsibles: ['Felipe'] } }] } },
    response: { preview: true, digest: 'a1b2…', changed: 1, errors: [], next: 'Para gravar, repita a mesma chamada com apply:true, confirm:true e este digest.' } },

  // ---------------------------------------------------------------- empresas
  { id: 'companies.list', group: 'empresas', need: 'companies', method: 'GET', path: '/api/connect/companies',
    summary: 'Empresas (cronogramas) que o dono da chave pode ver. Lista inteira, sem paginação.',
    params: [p('q', S('Texto no nome, razão social ou CNPJ'))],
    response: { total: 1, companies: [{ id: 'proj-abc123', name: 'ALCAST', legalName: 'ALCAST DO BRASIL LTDA', cnpj: '00.000.000/0001-00', status: 'ativo', activities: 40, activitiesDone: 12, meetings: 5 }] } },
  { id: 'companies.get', group: 'empresas', need: 'companies', method: 'GET', path: '/api/connect/companies/{id}',
    summary: 'Uma empresa: equipe, fases, atividades (com subatividades) e lista de reuniões (sem transcrição).',
    params: [p('id', S('Id da empresa (de companies.list)'), true)],
    response: { id: 'proj-abc123', name: 'ALCAST', company: { name: '…', cnpj: '…', status: '…', regimeTributario: '…' }, team: [{ name: 'Felipe', role: 'Consultor' }], phases: [{ id: 'ph-1', name: 'Diagnóstico' }], activities: [{ id: 'act-1', title: '…', phase: 'Diagnóstico', status: 'em-andamento', subs: [] }], meetings: [{ id: 'mtg-1', date: '2026-10-28', title: 'Kickoff', hasSummary: true, actionItems: 3 }] } },
  { id: 'meetings.get', group: 'empresas', need: 'companies', method: 'GET', path: '/api/connect/companies/{id}/meetings/{meetingId}',
    summary: 'Uma reunião: resumo, decisões, participantes e itens de ação (com id e vínculo com o cronograma).',
    params: [p('id', S('Id da empresa'), true), p('meetingId', S('Id da reunião (de companies.get)'), true), p('transcript', S('"1" inclui a transcrição (até 60.000 caracteres)', { enum: ['1'] }))],
    response: { id: 'mtg-1', date: '2026-10-28', title: 'Kickoff', company: 'ALCAST', participants: ['Rafael', 'Cliente'], summary: '…', decisions: '…', actionItems: [{ id: 'mai-1', title: '…', responsible: 'Felipe', dueDate: '2026-11-04', activityLink: null }] } },
  { id: 'companies.plan', group: 'empresas', need: 'plan', method: 'POST', path: '/api/connect/companies/{id}/plan', writes: true,
    summary: 'Ajusta o cronograma da empresa. `dryRun` é true por padrão (só mostra); mande dryRun:false para gravar. Tudo ou nada, até 200 operações; a resposta traz `undo`.',
    params: [p('id', S('Id da empresa'), true)],
    body: { required: ['ops'], fields: { ops: { type: 'array', items: { type: 'object' }, description: 'op = activity.set, sub.set, sub.add, sub.move, activity.add, pauta.link, activity.delete, sub.delete, activity.restore, sub.restore' }, dryRun: B('Padrão true'), note: S('Por quê (vai para o Log)') },
      example: { dryRun: true, note: 'Atualização da reunião de 28/10', ops: [{ op: 'sub.set', activity: { id: 'act-1' }, sub: { id: 'sub-1' }, set: { done: true } }] } },
    response: { dryRun: true, changes: [{ op: 'sub.set', before: { done: false }, after: { done: true } }] } },
  { id: 'transcripts.send', group: 'empresas', need: 'transcriptsWrite', method: 'POST', path: '/api/connect/companies/{id}/transcripts', writes: true,
    summary: 'Envia a transcrição de UMA reunião para a RENATA do painel registrar. Responde 202 com submissionId; o mesmo texto não é processado duas vezes. 30 por hora.',
    params: [p('id', S('Id da empresa'), true)],
    body: { required: ['transcript'], fields: { transcript: S('Texto bruto completo (mínimo 200 caracteres)'), date: DAY, time: S('HH:MM (24 h)', { pattern: '^\\d{2}:\\d{2}$' }) },
      example: { transcript: '[00:00] Rafael: Bom dia… (texto completo)', date: '2026-10-28', time: '10:00' } },
    response: { submissionId: 'sub-abc', status: 'pending', duplicate: false, next: 'Consulte GET …/transcripts/sub-abc a cada ~5 s.' } },
  { id: 'transcripts.list', group: 'empresas', need: 'transcriptsRead', method: 'GET', path: '/api/connect/companies/{id}/transcripts',
    summary: 'Envios de transcrição da empresa e a situação de cada um.',
    params: [p('id', S('Id da empresa'), true)],
    response: { submissions: [{ id: 'sub-abc', status: 'done', meetingId: 'mtg-9', createdAt: '…' }] } },
  { id: 'transcripts.get', group: 'empresas', need: 'transcriptsRead', method: 'GET', path: '/api/connect/companies/{id}/transcripts/{submissionId}',
    summary: 'Situação de um envio (pending, processing, done, failed). Quando done traz a reunião criada.',
    params: [p('id', S('Id da empresa'), true), p('submissionId', S('Id do envio'), true)],
    response: { submissionId: 'sub-abc', status: 'done', meetingId: 'mtg-9', meeting: { id: 'mtg-9', title: '…' } } },
  { id: 'transcripts.retry', group: 'empresas', need: 'transcriptsWrite', method: 'POST', path: '/api/connect/companies/{id}/transcripts/{submissionId}/retry', writes: true,
    summary: 'Reprocessa um envio que falhou (409 se não estiver failed).',
    params: [p('id', S('Id da empresa'), true), p('submissionId', S('Id do envio'), true)],
    response: { submissionId: 'sub-abc', status: 'pending' } },
  { id: 'meetings.edit', group: 'empresas', need: 'meetingsEdit', method: 'PATCH', path: '/api/connect/companies/{id}/meetings/{meetingId}', writes: true,
    summary: 'Corrige uma reunião registrada. Só estes campos (outro dá 400). Faça primeiro com dryRun:true. Tudo ou nada; responde com editId e `undo`.',
    params: [p('id', S('Id da empresa'), true), p('meetingId', S('Id da reunião'), true)],
    body: { required: [], fields: { title: S('Título'), date: DAY, time: S('HH:MM'), summary: S('Resumo'), decisions: S('Decisões'), participants: { description: 'Lista inteira ou {add,remove,rename}' }, actionItems: { type: 'array', items: { type: 'object' }, description: 'Operações {op:"set",id,set:{…}} | {op:"add",title,…} | {op:"delete",id} | {op:"restore",id}' }, dryRun: B('true = mostra antes e depois sem gravar'), note: S('Por quê') },
      example: { dryRun: true, actionItems: [{ op: 'set', id: 'mai-1', set: { responsible: 'Felipe' } }] } },
    response: { dryRun: true, changes: [{ field: 'actionItems', before: '…', after: '…' }] } },
  { id: 'meetings.edits', group: 'empresas', need: 'meetingsEditRead', method: 'GET', path: '/api/connect/companies/{id}/meetings/{meetingId}/edits',
    summary: 'Histórico das correções da reunião.',
    params: [p('id', S('Id da empresa'), true), p('meetingId', S('Id da reunião'), true)],
    response: { edits: [{ id: 'med-1', at: '…', by: '…', undone: false }] } },
  { id: 'meetings.undo', group: 'empresas', need: 'meetingsEdit', method: 'POST', path: '/api/connect/companies/{id}/meetings/{meetingId}/edits/{editId}/undo', writes: true,
    summary: 'Desfaz uma correção (409 se já foi desfeita).',
    params: [p('id', S('Id da empresa'), true), p('meetingId', S('Id da reunião'), true), p('editId', S('Id da correção'), true)],
    body: { required: [], fields: { dryRun: B('true = só mostra'), note: S('Por quê') }, example: { dryRun: true } },
    response: { editId: 'med-2', undone: 'med-1' } },

  // ---------------------------------------------------------------- agenda e equipe
  { id: 'agenda', group: 'agenda', need: 'any', method: 'GET', path: '/api/connect/agenda',
    summary: 'Compromissos aceitos ou próprios do Google Calendar do dono. Sem Google conectado vem connected:false e events vazio.',
    params: [p('days', I('Dias à frente (1–14)', { default: 7, minimum: 1, maximum: 14 }))],
    response: { connected: true, events: [{ title: 'Reunião KUHN', start: '2026-11-04T14:00:00-03:00', end: '2026-11-04T15:00:00-03:00', allDay: false, location: '', guests: 3 }] } },
  { id: 'team-day', group: 'equipe', need: 'team', method: 'GET', path: '/api/connect/team-day',
    summary: 'Por pessoa da equipe, num dia de Brasília: entradas e saídas, telas e o que fez. Cada leitura fica registrada.',
    params: [p('date', DAY), p('userId', S('Filtra uma pessoa'))],
    response: { date: '2026-11-03', people: [{ userId: '…', name: '…', sessions: [], screens: [], operations: [] }] } },

  // ---------------------------------------------------------------- CRM (mesmas regras da tela /api/crm)
  { id: 'crm.me', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/me',
    summary: 'O que o dono da chave pode fazer no CRM (capabilities).',
    response: { capabilities: { read: true, write: true, remove: true, export: true, admin: true } } },
  { id: 'crm.options', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/options',
    summary: 'Listas de apoio: responsáveis (owners → ownerId), funis, motivos de perda e valores aceitos nos campos (enums).',
    response: { owners: [{ id: 'u-1', name: 'Eduarda' }], pipelines: [{ id: '9a0b…', name: 'Comercial' }], lostReasons: [{ value: 'preco', label: 'Preço' }], dealTypes: ['new', 'upsell'], enums: { relationship: ['prospect', 'client', 'former_client', 'partner'] } } },
  { id: 'crm.search', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/search',
    summary: 'Busca rápida (mínimo 2 letras) em empresas, contatos e negócios. Use antes de criar, para não duplicar.',
    params: [p('q', S('Nome, CNPJ, e-mail ou telefone'), true)],
    response: { companies: [{ id: '3f1c…', legalName: 'OKUBO LTDA' }], contacts: [], deals: [] } },
  { id: 'crm.pipelines', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/pipelines',
    summary: 'Funis e etapas (ids de pipelineId e stageId; kind = open, won ou lost).',
    response: { pipelines: [{ id: '9a0b…', name: 'Comercial', isDefault: true, stages: [{ id: '1c2d…', name: 'Qualificação', kind: 'open', probability: 20 }] }] } },
  { id: 'crm.deals.list', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/deals',
    summary: 'Negócios, paginados (limit até 200 + offset). `total` diz quantos existem no filtro.',
    params: [p('q', S('Texto no título ou na empresa')), p('status', S('Situação', { enum: ['open', 'won', 'lost', 'all'], default: 'open' })), p('pipelineId', UUID('do funil')), p('stageId', UUID('da etapa')), p('ownerId', S('Id do responsável ("me" não vale aqui)')), p('tag', S('Etiqueta (várias com |)')), p('companyId', UUID('da empresa do CRM')), p('limit', I('1–200', { default: 50, minimum: 1, maximum: 200 })), p('offset', I('Pular N itens (paginação)', { default: 0, minimum: 0 }))],
    response: { total: 120, totalValue: 450000, totalWeighted: 98000, items: [{ id: '5e6f…', title: 'Diagnóstico Reforma', companyId: '3f1c…', companyName: 'OKUBO LTDA', stageName: 'Proposta', status: 'open', value: 15000, tags: ['Evento'] }] } },
  { id: 'crm.deals.get', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/deals/{id}',
    summary: 'Um negócio com itens, atividades, notas e histórico de etapas.',
    params: [p('id', UUID('do negócio'), true)],
    response: { deal: { id: '5e6f…', title: 'Diagnóstico Reforma', stageName: 'Proposta', status: 'open' }, activities: [], notes: [] } },
  { id: 'crm.deals.export', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/deals/export.xlsx', binary: true,
    summary: 'Planilha Excel dos negócios com os mesmos filtros da lista (resposta é arquivo .xlsx; cabeçalho X-Export-Count).',
    params: [p('q', S('Texto')), p('status', S('Situação', { enum: ['open', 'won', 'lost', 'all'] })), p('pipelineId', UUID('do funil')), p('tag', S('Etiqueta (várias com |)')), p('ownerId', S('Id do responsável'))],
    response: '(arquivo .xlsx)' },
  { id: 'crm.companies.list', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/companies',
    summary: 'Empresas do CRM (contas comerciais), paginadas.',
    params: [p('q', S('Nome ou CNPJ')), p('relationship', S('Relação', { enum: ['prospect', 'client', 'former_client', 'partner'] })), p('ownerId', S('Id do responsável')), p('limit', I('1–200', { default: 50, minimum: 1, maximum: 200 })), p('offset', I('Paginação', { default: 0, minimum: 0 }))],
    response: { total: 300, items: [{ id: '3f1c…', legalName: 'OKUBO LTDA', tradeName: 'Okubo', cnpj: '00000000000100', relationship: 'prospect' }] } },
  { id: 'crm.companies.get', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/companies/{id}',
    summary: 'Ficha da empresa: dados, contatos, negócios, atividades e notas.',
    params: [p('id', UUID('da empresa do CRM'), true)],
    response: { company: { id: '3f1c…', legalName: 'OKUBO LTDA' }, contacts: [], deals: [], activities: [], notes: [] } },
  { id: 'crm.companies.create', group: 'crm', need: 'crmWrite', method: 'POST', path: '/api/connect/crm/companies', writes: true,
    summary: 'Cria empresa. 409 = possível duplicada (veja `duplicates`; só repita com force:true se o Rafael confirmar que é outra).',
    body: { required: ['legalName'], fields: { legalName: S('Razão social (ou tradeName)'), tradeName: S('Nome fantasia'), cnpj: S('CNPJ (com ou sem pontuação)'), city: S('Cidade'), state: S('UF, 2 letras'), segment: S('Segmento'), relationship: S('Relação', { enum: ['prospect', 'client', 'former_client', 'partner'], default: 'prospect' }), source: S('Origem do lead'), ownerId: S('Id do responsável (de crm.options)'), website: S('Site'), taxRegime: S('Regime tributário'), force: B('true = criar mesmo com nome parecido') },
      example: { legalName: 'OKUBO LTDA', tradeName: 'Okubo', cnpj: '00.000.000/0001-00', city: 'Curitiba', state: 'PR', relationship: 'prospect', source: 'Indicação' } },
    response: { company: { id: '3f1c…', legalName: 'OKUBO LTDA', relationship: 'prospect' } } },
  { id: 'crm.companies.update', group: 'crm', need: 'crmWrite', method: 'PATCH', path: '/api/connect/crm/companies/{id}', writes: true,
    summary: 'Altera só os campos enviados (mesmos nomes da criação).',
    params: [p('id', UUID('da empresa do CRM'), true)],
    body: { required: [], fields: { legalName: S('Razão social'), tradeName: S('Nome fantasia'), city: S('Cidade'), state: S('UF'), relationship: S('Relação', { enum: ['prospect', 'client', 'former_client', 'partner'] }), ownerId: S('Id do responsável') }, example: { relationship: 'client' } },
    response: { company: { id: '3f1c…', relationship: 'client' } } },
  { id: 'crm.contacts.list', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/contacts',
    summary: 'Contatos, paginados (traz e-mail e telefone: dado pessoal).',
    params: [p('q', S('Nome, e-mail ou telefone')), p('companyId', UUID('da empresa do CRM')), p('limit', I('1–200', { default: 50, minimum: 1, maximum: 200 })), p('offset', I('Paginação', { default: 0, minimum: 0 }))],
    response: { total: 2, items: [{ id: '7a8b…', firstName: 'Ana', lastName: 'Lima', email: 'ana@exemplo.com', companyId: '3f1c…' }] } },
  { id: 'crm.contacts.get', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/contacts/{id}',
    summary: 'Um contato.', params: [p('id', UUID('do contato'), true)],
    response: { contact: { id: '7a8b…', firstName: 'Ana', email: 'ana@exemplo.com' } } },
  { id: 'crm.contacts.create', group: 'crm', need: 'crmWrite', method: 'POST', path: '/api/connect/crm/contacts', writes: true,
    summary: 'Cria contato numa empresa do CRM. 409 = e-mail/telefone já existe (force:true só com confirmação).',
    body: { required: ['companyId', 'firstName'], fields: { companyId: UUID('da empresa do CRM'), firstName: S('Nome'), lastName: S('Sobrenome'), jobTitle: S('Cargo'), email: S('E-mail', { format: 'email' }), phone: S('Telefone'), whatsapp: S('WhatsApp'), isPrimary: B('Contato principal'), force: B('Criar mesmo com possível duplicado') },
      example: { companyId: '3f1c…', firstName: 'Ana', lastName: 'Lima', jobTitle: 'Controller', email: 'ana@exemplo.com' } },
    response: { contact: { id: '7a8b…', firstName: 'Ana' } } },
  { id: 'crm.contacts.update', group: 'crm', need: 'crmWrite', method: 'PATCH', path: '/api/connect/crm/contacts/{id}', writes: true,
    summary: 'Altera só os campos enviados (mesmos nomes da criação).', params: [p('id', UUID('do contato'), true)],
    body: { required: [], fields: { jobTitle: S('Cargo'), email: S('E-mail'), phone: S('Telefone'), whatsapp: S('WhatsApp') }, example: { jobTitle: 'Diretora financeira' } },
    response: { contact: { id: '7a8b…', jobTitle: 'Diretora financeira' } } },
  { id: 'crm.deals.create', group: 'crm', need: 'crmWrite', method: 'POST', path: '/api/connect/crm/deals', writes: true,
    summary: 'Cria negócio numa empresa do CRM (sem pipelineId/stageId vai para a 1ª etapa aberta do funil padrão).',
    body: { required: ['companyId', 'title'], fields: { companyId: UUID('da empresa do CRM'), title: S('Título'), value: { type: 'number', description: 'Valor em reais' }, dealType: S('Tipo', { enum: ['new', 'upsell'], default: 'new' }), pipelineId: UUID('do funil'), stageId: UUID('de uma etapa aberta'), expectedCloseDate: DAY, ownerId: S('Id do responsável'), primaryContactId: UUID('do contato'), source: S('Origem'), description: S('Descrição') },
      example: { companyId: '3f1c…', title: 'Diagnóstico Reforma — Okubo', value: 15000, expectedCloseDate: '2026-12-15', source: 'Indicação' } },
    response: { deal: { id: '5e6f…', title: 'Diagnóstico Reforma — Okubo', stageName: 'Qualificação', status: 'open' }, cadence: { scheduled: null } } },
  { id: 'crm.deals.update', group: 'crm', need: 'crmWrite', method: 'PATCH', path: '/api/connect/crm/deals/{id}', writes: true,
    summary: 'Altera campos do negócio (para mudar de etapa use crm.deals.move).', params: [p('id', UUID('do negócio'), true)],
    body: { required: [], fields: { title: S('Título'), value: { type: 'number', description: 'Valor' }, expectedCloseDate: DAY, ownerId: S('Id do responsável'), description: S('Descrição') }, example: { value: 18000, expectedCloseDate: '2026-12-20' } },
    response: { deal: { id: '5e6f…', value: 18000 } } },
  { id: 'crm.deals.move', group: 'crm', need: 'crmWrite', method: 'POST', path: '/api/connect/crm/deals/{id}/move', writes: true,
    summary: 'Move o negócio de etapa (ganho/perdido = etapa com kind won/lost; perdido exige lostReason).', params: [p('id', UUID('do negócio'), true)],
    body: { required: ['stageId'], fields: { stageId: UUID('da etapa (de crm.pipelines)'), lostReason: S('Motivo da perda', { enum: ['preco', 'concorrente', 'sem_orcamento', 'sem_decisao', 'timing', 'sem_fit', 'sem_resposta', 'escopo', 'outro'] }), lostDetail: S('Obrigatório quando lostReason = outro') }, example: { stageId: '1c2d…' } },
    response: { deal: { id: '5e6f…', stageName: 'Proposta' }, cadence: {} } },
  { id: 'crm.deals.tags', group: 'crm', need: 'crmWrite', method: 'PUT', path: '/api/connect/crm/deals/{id}/tags', writes: true,
    summary: 'Troca as etiquetas do negócio pela lista enviada (lista inteira).', params: [p('id', UUID('do negócio'), true)],
    body: { required: ['tags'], fields: { tags: { type: 'array', items: { type: 'string' }, description: 'Nomes das etiquetas' } }, example: { tags: ['Evento', 'Reforma'] } },
    response: { tags: ['Evento', 'Reforma'] } },
  { id: 'crm.activities.list', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/activities',
    summary: 'Atividades comerciais (follow-ups). Abertas por padrão, até 300.',
    params: [p('status', S('Situação', { enum: ['open', 'done', 'cancelled', 'all'], default: 'open' })), p('bucket', S('Recorte das abertas', { enum: ['overdue', 'today', 'week', 'later'] })), p('companyId', UUID('da empresa do CRM')), p('dealId', UUID('do negócio')), p('ownerId', S('Id do responsável ou "me"')), p('q', S('Texto')), p('limit', I('1–300', { default: 100, minimum: 1, maximum: 300 }))],
    response: { total: 4, counts: { overdue: 1, today: 1, week: 2, later: 0, done: 10 }, items: [{ id: '2b3c…', title: 'Ligar para Ana', activityType: 'call', dueDate: '2026-11-04', status: 'open', companyName: 'OKUBO LTDA' }] } },
  { id: 'crm.activities.create', group: 'crm', need: 'crmWrite', method: 'POST', path: '/api/connect/crm/activities', writes: true,
    summary: 'Cria atividade comercial numa empresa do CRM (opcionalmente ligada a negócio e contato).',
    body: { required: ['companyId', 'title'], fields: { companyId: UUID('da empresa do CRM'), title: S('Título'), activityType: S('Tipo', { enum: ['task', 'call', 'email', 'meeting', 'whatsapp', 'visit', 'followup'] }), dueDate: DAY, dueTime: S('HH:MM'), priority: S('Prioridade', { enum: ['low', 'normal', 'high'] }), description: S('Descrição'), dealId: UUID('do negócio'), contactId: UUID('do contato'), ownerId: S('Id do responsável') },
      example: { companyId: '3f1c…', dealId: '5e6f…', title: 'Enviar proposta revisada', activityType: 'email', dueDate: '2026-11-05', priority: 'high' } },
    response: { activity: { id: '2b3c…', title: 'Enviar proposta revisada', status: 'open' } } },
  { id: 'crm.activities.complete', group: 'crm', need: 'crmWrite', method: 'POST', path: '/api/connect/crm/activities/{id}/complete', writes: true,
    summary: 'Conclui a atividade (pode trazer a próxima da cadência em `next`).', params: [p('id', UUID('da atividade'), true)],
    body: { required: [], fields: { outcome: S('Resultado / o que aconteceu') }, example: { outcome: 'Cliente pediu proposta até sexta.' } },
    response: { activity: { id: '2b3c…', status: 'done' }, next: null } },
  { id: 'crm.notes.create', group: 'crm', need: 'crmWrite', method: 'POST', path: '/api/connect/crm/notes', writes: true,
    summary: 'Registra nota numa empresa, contato ou negócio (texto em `body` ou HTML simples em `bodyHtml`; até 5.000 caracteres). Escreva em linguagem formal.',
    body: { required: ['entityType', 'entityId'], fields: { entityType: S('Onde', { enum: ['company', 'contact', 'deal'] }), entityId: UUID('do registro'), body: S('Texto da nota'), bodyHtml: S('Alternativa a body: h3, ul, li, strong, blockquote, hr') },
      example: { entityType: 'deal', entityId: '5e6f…', body: 'Reunião realizada em 03/11/2026. O cliente solicitou proposta revisada.' } },
    response: { note: { id: '4d5e…', body: 'Reunião realizada…', authorName: 'Claude Code (por Rafael Souza)' } } },
  { id: 'crm.tags', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/tags', summary: 'Etiquetas existentes.', response: { tags: [{ id: '…', name: 'Evento' }] } },
  { id: 'crm.products', group: 'crm', need: 'crmRead', method: 'GET', path: '/api/connect/crm/products', summary: 'Catálogo de produtos e serviços (preço de tabela).', response: { products: [{ id: '…', name: 'Diagnóstico Reforma', price: 15000 }] } },
];

// O que a chave pode, a partir do escopo e do dono (o mesmo que cada handler de server/connect.js confere).
// `user` = rowToUser do dono; `crm` = { read, admin } calculado com crmCan (fica fora daqui para o módulo seguir puro).
export function capsFor(scope, user, crm = {}) {
  const u = user || {};
  const admin = !!(u.isSuperAdmin || u.role === 'master');
  const rank = { write_all: 2, read_write: 2, read_create: 1 }[scope] || 0;
  const companies = !!u.companiesAccess;
  const personal = !!u.personalAccess;
  const crmRead = (scope === 'read_all' && !!crm.read) || ((scope === 'crm_operate' || scope === 'write_all') && !!crm.admin);
  return {
    any: true,
    personal,
    createActivity: personal && rank >= 1,
    boardPlan: personal && scope === 'write_all',
    companies,
    plan: companies && admin && rank >= 2,
    transcriptsRead: companies && ['transcripts', 'meetings_edit', 'read_write', 'write_all', 'read_all'].includes(scope),
    transcriptsWrite: companies && ['transcripts', 'meetings_edit', 'read_write', 'write_all'].includes(scope),
    meetingsEdit: companies && ['meetings_edit', 'write_all'].includes(scope),
    meetingsEditRead: companies && ['meetings_edit', 'write_all', 'read_all'].includes(scope),
    team: admin && ['read_all', 'write_all'].includes(scope),
    crmRead,
    crmWrite: crmRead && (scope === 'crm_operate' || scope === 'write_all'),
  };
}

export const canWriteSomething = (caps) => CATALOG.some((e) => e.writes && caps[e.need]);
export function actionsFor(caps) { return caps ? CATALOG.filter((e) => caps[e.need]) : CATALOG.slice(); }

const toExpress = (path) => path.replace(/\{(\w+)\}/g, ':$1');
// Casa um caminho real com o catálogo (para 404/405 orientados). Devolve as entradas cujo molde bate.
export function matchCatalog(pathname, list = CATALOG) {
  const clean = String(pathname || '').replace(/\/+$/, '');
  return list.filter((e) => new RegExp(`^${toExpress(e.path).replace(/[.]/g, '\\.').replace(/:\w+/g, '[^/]+')}$`).test(clean));
}

function curlOf(e, baseUrl) {
  const url = `${baseUrl}${e.path}`;
  const q = (e.params || []).filter((x) => x.schema && x.schema.default !== undefined && !e.path.includes(`{${x.name}}`)).slice(0, 1).map((x) => `${x.name}=${x.schema.default}`);
  const full = q.length && e.method === 'GET' ? `${url}?${q.join('&')}` : url;
  const auth = '-H "Authorization: Bearer $PRICETAX_TOKEN"';
  if (e.method === 'GET') return `curl -s "${full}" ${auth}${e.binary ? ' -o arquivo.xlsx' : ''}`;
  const body = e.body && e.body.example ? ` -H "Content-Type: application/json" -d '${JSON.stringify(e.body.example)}'` : '';
  return `curl -s -X ${e.method} "${full}" ${auth}${body}`;
}

// Forma compacta de uma ação (descoberta e guia).
export function describeAction(e, baseUrl) {
  return {
    id: e.id, method: e.method, path: e.path, summary: e.summary, writes: !!e.writes,
    params: (e.params || []).map((x) => ({ name: x.name, in: e.path.includes(`{${x.name}}`) ? 'path' : 'query', required: !!x.required || e.path.includes(`{${x.name}}`), type: x.schema.type, ...(x.schema.enum ? { enum: x.schema.enum } : {}), ...(x.schema.default !== undefined ? { default: x.schema.default } : {}), description: x.schema.description })),
    ...(e.body ? { body: { required: e.body.required || [], fields: Object.fromEntries(Object.entries(e.body.fields).map(([k, v]) => [k, v.enum ? `${v.description} (${v.enum.join(' | ')})` : v.description])), example: e.body.example } } : {}),
    responseExample: e.response,
    curl: curlOf(e, baseUrl),
  };
}

export const RULES = [
  'Comece sempre por GET /api/connect: ele diz quem é a chave e lista SÓ as ações que esta chave pode usar. A resposta é longa: leia primeiro `index` (uma linha por ação) e depois o detalhe em `resources`. Não chame rota que não está nessa lista.',
  'Não invente campos, filtros nem rotas. Use exatamente os nomes de `params` e `body.fields`; campo desconhecido é ignorado ou devolve 400.',
  'Ids vêm das próprias respostas (ex.: companies.list → id). Nunca adivinhe um id.',
  'Se `token.canWrite` for false, a chave é só de leitura: não tente gravar (dá 403).',
  'Grave só o que a pessoa pediu. Se o pedido não disser exatamente o que gravar, confirme antes; onde houver prévia (dryRun ou prévia sem apply), mostre a prévia e espere o OK.',
  'Datas sempre AAAA-MM-DD (06/11/2026 → 2026-11-06); horários HH:MM, no horário de Brasília.',
  'Depois de gravar, leia de volta para confirmar e diga o que mudou.',
  'Erros vêm em JSON: { error, message }. Leia `message` (em português) e corrija o pedido em vez de repetir igual.',
  'O token vai só no cabeçalho Authorization. Nunca na URL, em arquivo, em log ou na resposta para o usuário.',
  'Os dados são de clientes da PRICETAX: não copie para fora mais do que a tarefa precisa.',
];

export const ERRORS = {
  400: 'bad_request — dado inválido; `message` diz qual campo corrigir.',
  401: 'unauthorized — chave ausente, errada, revogada ou vencida. Cabeçalho: Authorization: Bearer pxk_…',
  403: 'forbidden — a chave ou o dono dela não pode fazer isso (ex.: chave só de leitura tentando gravar).',
  404: 'not_found — rota ou registro não existe (ou é de outra organização).',
  405: 'method_not_allowed — a rota existe com outro método; veja `allowed`.',
  409: 'conflict — duplicado, prévia desatualizada ou estado mudou; leia `message`.',
  413: 'payload_too_large — corpo grande demais.',
  422: 'unprocessable — operações com erro; nada foi gravado (tudo ou nada).',
  429: 'rate_limited — limite atingido; espere `Retry-After` segundos.',
  500: 'server_error — falha do painel; tente de novo mais tarde e avise o Rafael.',
};
export const ERROR_CODES = { 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed', 409: 'conflict', 413: 'payload_too_large', 422: 'unprocessable', 429: 'rate_limited' };

export const LIMITS = {
  requestsPerMinute: 120,
  activitiesCreatedPerHour: 60,
  transcriptsPerHour: 30,
  boardPlanCallsPerHour: 60,
  pagination: 'Listas do CRM: limit (até 200; atividades até 300) + offset; `total` diz quantos existem. Atividades do quadro: limit até 200. Empresas: lista inteira.',
};

export function authHelp(baseUrl) {
  return {
    header: 'Authorization: Bearer pxk_…',
    example: `curl -s "${baseUrl}/api/connect" -H "Authorization: Bearer $PRICETAX_TOKEN"`,
    getAKey: 'A chave é gerada no painel, em Meu perfil › Integrações (avançado), por quem tem acesso. Ela herda as permissões dessa pessoa.',
    docs: `${baseUrl}/api/connect/docs`,
    openapi: `${baseUrl}/api/connect/openapi.json`,
  };
}

// ---------------------------------------------------------------- OpenAPI 3.1
function schemaOfExample(v) {
  if (Array.isArray(v)) return { type: 'array', items: v.length ? schemaOfExample(v[0]) : {} };
  if (v === null) return {};
  if (typeof v === 'object') return { type: 'object', properties: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, schemaOfExample(x)])) };
  if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'number' };
  if (typeof v === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

export function buildOpenApi({ baseUrl, caps = null, who = null }) {
  const paths = {};
  const opDiscovery = {
    operationId: 'discover', summary: 'Descoberta: quem é a chave e tudo o que ela pode fazer. Chame primeiro.', tags: ['conta'],
    responses: { 200: { description: 'Mapa da chave e das ações disponíveis', content: { 'application/json': { schema: { type: 'object' } } } }, 401: { $ref: '#/components/responses/Error' } },
  };
  paths['/api/connect'] = { get: opDiscovery };
  for (const e of actionsFor(caps)) {
    const params = (e.params || []).map((x) => {
      const inPath = e.path.includes(`{${x.name}}`);
      return { name: x.name, in: inPath ? 'path' : 'query', required: inPath || !!x.required, description: x.schema.description, schema: Object.fromEntries(Object.entries(x.schema).filter(([k]) => k !== 'description')) };
    });
    const op = {
      operationId: e.id.replace(/[^A-Za-z0-9]+(.)/g, (_, c) => c.toUpperCase()),
      summary: e.summary.slice(0, 120), description: e.summary, tags: [e.group],
      ...(params.length ? { parameters: params } : {}),
      responses: {
        [e.method === 'POST' && /create|send/.test(e.id) ? (e.id === 'transcripts.send' ? 202 : 201) : 200]: e.binary
          ? { description: 'Arquivo', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } } }
          : { description: 'OK', content: { 'application/json': { schema: schemaOfExample(e.response), example: e.response } } },
        400: { $ref: '#/components/responses/Error' }, 401: { $ref: '#/components/responses/Error' }, 403: { $ref: '#/components/responses/Error' }, 404: { $ref: '#/components/responses/Error' }, 429: { $ref: '#/components/responses/Error' },
      },
    };
    if (e.body) {
      op.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object', ...(e.body.required && e.body.required.length ? { required: e.body.required } : {}), properties: e.body.fields }, example: e.body.example } } };
    }
    paths[e.path] = { ...(paths[e.path] || {}), [e.method.toLowerCase()]: op };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'PRICETAX — API de conectividade', version: '2026-11-02',
      description: `API do painel da PRICETAX para IAs e integrações. Autenticação: cabeçalho Authorization: Bearer pxk_… (chave gerada no painel). Chame primeiro GET /api/connect.${who ? ` Esta especificação foi filtrada para a chave "${who}": só traz o que ela pode usar.` : ' Sem chave, esta especificação lista todas as ações; com a chave, só as que ela pode usar.'}`,
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    tags: Object.entries(GROUPS).map(([name, description]) => ({ name, description })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'pxk_…' } },
      schemas: { Error: { type: 'object', required: ['error', 'message'], properties: { error: { type: 'string', enum: Object.values(ERROR_CODES) }, message: { type: 'string' }, help: { type: 'string' } } } },
      responses: { Error: { description: 'Erro em JSON', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
    },
  };
}

// ---------------------------------------------------------------- guia legível (markdown)
export function buildDocsMarkdown({ baseUrl, caps = null, who = null }) {
  const list = actionsFor(caps);
  const lines = [
    '# PRICETAX — API de conectividade (guia para IA)', '',
    who ? `Guia filtrado para a chave **${who}**: só aparece o que ela pode usar.` : 'Guia geral (sem chave): lista todas as ações. Com a chave no cabeçalho, este endereço mostra só o que ela pode usar.', '',
    '## Início rápido', '',
    `- URL base: \`${baseUrl}\``,
    '- Cabeçalho em toda chamada: `Authorization: Bearer <chave pxk_…>`',
    `- Primeira chamada: \`curl -s "${baseUrl}/api/connect" -H "Authorization: Bearer $PRICETAX_TOKEN"\``,
    `- OpenAPI 3.1: \`${baseUrl}/api/connect/openapi.json\``, '',
    '## Regras', '', ...RULES.map((r) => `- ${r}`), '',
    '## Erros', '', ...Object.entries(ERRORS).map(([k, v]) => `- **${k}** ${v}`), '',
    '## Limites', '', `- ${LIMITS.requestsPerMinute} requisições por minuto por chave; ${LIMITS.activitiesCreatedPerHour} atividades criadas por hora; ${LIMITS.transcriptsPerHour} transcrições por hora.`, `- ${LIMITS.pagination}`, '',
    '## Ações', '',
  ];
  for (const [g, title] of Object.entries(GROUPS)) {
    const items = list.filter((e) => e.group === g);
    if (!items.length) continue;
    lines.push(`### ${title}`, '');
    for (const e of items) {
      const d = describeAction(e, baseUrl);
      lines.push(`#### \`${e.method} ${e.path}\` — ${e.id}${e.writes ? ' (grava)' : ''}`, '', e.summary, '');
      if (d.params.length) lines.push('Parâmetros: ' + d.params.map((x) => `\`${x.name}\` (${x.in}${x.required ? ', obrigatório' : ''}${x.enum ? `: ${x.enum.join(' | ')}` : ''}) ${x.description || ''}`.trim()).join(' · '), '');
      if (d.body) lines.push('Corpo: ' + Object.entries(d.body.fields).map(([k, v]) => `\`${k}\`${d.body.required.includes(k) ? ' (obrigatório)' : ''} ${v}`).join(' · '), '');
      lines.push('```bash', d.curl, '```', '');
    }
  }
  return lines.join('\n');
}
