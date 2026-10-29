// Ferramentas de plataforma — §101: agenda, notificações, conhecimento, XFlow, pareceres/modelos e o ACESSO GENÉRICO às demais rotas do servidor (as mesmas da
// tela, em nome do usuário, com o mesmo controle de permissão). Consulta (GET) é livre; qualquer coisa que altera pede confirmação explícita. O que a política
// exclui (credenciais, usuários, links públicos, telemetria) é recusado aqui mesmo.
import { T } from '../validate.js';
import { callInternal } from '../internalCall.js';
import { routeIndex, matchRoute, excludedReason, curatedSet, classify } from '../policy.js';
import { XFLOW_TRANSITIONS } from '../../xflowTransitions.js';

const staff = (u) => !!u && (u.isSuperAdmin || u.role === 'master' || u.role === 'pricetax');

export function registerPlataforma(registry) {
  const mod = (module, extra = {}) => ({ module, ...extra });
  // ---------- agenda (Google Calendar do próprio usuário)
  registry.add({ ...mod('Agenda'), name: 'agenda_listar', summary: 'Compromissos do Google Calendar do usuário entre duas datas (start e end em ISO, ex.: 2026-10-26 e 2026-11-02).', risk: 'read', params: T.obj({ start: T.date('Início'), end: T.date('Fim') }, ['start', 'end']), route: { method: 'GET', path: '/api/agenda' } });
  registry.add({ ...mod('Agenda'), name: 'agenda_criar_evento', summary: 'Cria um compromisso no Google Calendar do usuário. Com convidados (e-mails), pede confirmação, pois o Google envia convite a pessoas de fora.', risk: 'write', creates: true,
    params: T.obj({ title: T.str('Título'), date: T.date('Data'), startTime: T.str('Hora HH:MM'), durationMinutes: T.int('Duração em minutos', { minimum: 5, maximum: 720 }), description: T.str('Descrição'), location: T.str('Local'), attendees: T.arr('E-mails dos convidados', T.str('e-mail'), { maxItems: 30 }) }, ['title', 'date', 'startTime']),
    route: { method: 'POST', path: '/api/agenda/events' }, confirm: (i) => Array.isArray(i.attendees) && i.attendees.length > 0, describe: (i) => `Criar o compromisso “${i.title}” em ${i.date} às ${i.startTime}${i.attendees && i.attendees.length ? ` e CONVIDAR ${i.attendees.join(', ')}` : ''}.` });
  registry.add({ ...mod('Agenda'), name: 'agenda_responder_convite', summary: 'Responde a um convite do Google Calendar (accepted, declined ou tentative). O id vem de agenda_listar (começa com google-).', risk: 'write', params: T.obj({ id: T.str('Id do evento'), response: T.enm('Resposta', ['accepted', 'declined', 'tentative']) }, ['id', 'response']),
    route: { method: 'POST', path: '/api/agenda/events/{id}/respond' }, describe: (i) => `Responder ao convite: ${i.response}.` });
  // ---------- notificações
  registry.add({ ...mod('Notificações'), name: 'notificacoes_listar', summary: 'Notificações do usuário (as 200 mais recentes, nas categorias que ele escolheu ver).', risk: 'read', params: T.obj({}), route: { method: 'GET', path: '/api/notifications' } });
  registry.add({ ...mod('Notificações'), name: 'notificacoes_marcar_todas_lidas', summary: 'Marca todas as notificações do usuário como lidas.', risk: 'write', params: T.obj({}), route: { method: 'POST', path: '/api/notifications/read-all' }, describe: () => 'Marcar todas as notificações como lidas.' });
  // ---------- conhecimento, pareceres, modelos (consulta)
  registry.add({ ...mod('Conhecimento'), name: 'conhecimento_buscar', summary: 'Busca na memória da RENATA (fatos da organização e pareceres estudados) por texto.', risk: 'read', visible: staff, params: T.obj({ q: T.str('Texto'), limit: T.int('Máximo', { minimum: 1, maximum: 50 }) }, ['q']), route: { method: 'GET', path: '/api/knowledge/facts' } });
  registry.add({ ...mod('Pareceres'), name: 'pareceres_listar', summary: 'Lista os Pareceres PRICETAX (repositório de PDFs).', risk: 'read', visible: staff, params: T.obj({}), route: { method: 'GET', path: '/api/pareceres' } });
  registry.add({ ...mod('Modelos'), name: 'modelos_listar', summary: 'Lista os Modelos de documentos.', risk: 'read', visible: staff, params: T.obj({}), route: { method: 'GET', path: '/api/templates' } });
  // ---------- XFlow (bugs/tarefas de desenvolvimento)
  const xf = (u) => !!u && !!u.xflowRole;
  registry.add({ ...mod('XFlow'), name: 'xflow_listar', summary: 'Lista os tickets (bugs/tarefas) do XFlow da organização.', risk: 'read', visible: xf, params: T.obj({}), route: { method: 'GET', path: '/api/xflow/tickets' } });
  registry.add({ ...mod('XFlow'), name: 'xflow_criar', summary: 'Abre um ticket no XFlow (bug ou tarefa).', risk: 'write', creates: true, visible: xf,
    params: T.obj({ title: T.str('Título'), description: T.str('Descrição'), expectedResult: T.str('Resultado esperado'), reproSteps: T.str('Passos para reproduzir'), module: T.str('Módulo afetado'), priority: T.str('Prioridade'), product: T.str('Produto') }, ['title']),
    route: { method: 'POST', path: '/api/xflow/tickets' }, describe: (i) => `Abrir o ticket “${i.title}” no XFlow.` });

  const ACOES = Object.keys(XFLOW_TRANSITIONS);
  const ajuda = ACOES.map((a) => `${a}${(XFLOW_TRANSITIONS[a].requiresFields || []).length ? ` (exige ${(XFLOW_TRANSITIONS[a].requiresFields || []).join('+')} em payload)` : ''}`).join('; ');
  registry.add({ ...mod('XFlow'), name: 'xflow_acao', summary: `Executa uma ação sobre um ticket do XFlow (triagem, desenvolvimento, homologação, publicação, validação, bloqueio, pausa, fechamento, exclusão para a lixeira…). O servidor confere papel e transição de status; erro de regra volta com a explicação. Sempre pede confirmação. Ações: ${ajuda}.`, risk: 'write', confirm: 'always', visible: xf,
    params: T.obj({ id: T.str('Id do ticket (xflow_listar)'), action: T.enm('Ação', ACOES), payload: { type: 'object', description: 'Campos exigidos pela ação (ex.: note, blockedReason, closureReason, closureJustification, duplicateOfTicketId, assigneeId)', additionalProperties: true, properties: {} } }, ['id', 'action']),
    route: { method: 'PATCH', path: '/api/xflow/tickets/{id}' }, map: (i) => ({ action: i.action, payload: i.payload || {} }), describe: (i) => `XFlow: executar “${i.action}” no ticket ${i.id}.` });

  // ---------- acesso genérico
  registry.add({ ...mod('Plataforma'), name: 'plataforma_rotas', summary: 'Descobre as operações da plataforma que ainda não têm ferramenta própria: lista rotas (método e caminho) por módulo. Depois use plataforma_consultar (GET) ou plataforma_executar (altera, com confirmação). Para o CRM, quadro e cronogramas, prefira as ferramentas específicas.', risk: 'read',
    params: T.obj({ q: T.str('Filtra por parte do caminho (ex.: xflow, pareceres, inventory)') }),
    run: async (ctx, i) => {
      const cur = curatedSet(registry); const q = String(i.q || '').toLowerCase();
      const list = routeIndex().filter((r) => !excludedReason(r.method, r.path) && classify(r, cur).kind === 'generic' && (!q || r.path.toLowerCase().includes(q)));
      return { status: 200, json: { total: list.length, rotas: list.slice(0, 80).map((r) => `${r.method} ${r.path}`), dica: 'Caminhos com :id pedem o id real. O corpo esperado aparece na mensagem de erro (400) se faltar algo.' } };
    } });
  const checkPath = (method, p, registryRef) => {
    // Só letras, números e `_ - . / : @` no caminho (sem `%` nem barra invertida): nada de `%2e%2e`, `..`, `//` ou outro truque para sair do que foi liberado (B9).
    const pathOnly = String(p).split('?')[0];
    if (!/^\/api\/[A-Za-z0-9_\-./:@]+$/.test(pathOnly) || pathOnly.includes('..') || pathOnly.includes('//')) return 'Caminho inválido (use /api/…).';
    const r = matchRoute(method, p);
    if (!r) return `Não existe a rota ${method} ${p}. Use plataforma_rotas para ver as disponíveis.`;
    const why = excludedReason(r.method, r.path);
    if (why) return `Fora do alcance da RENATA: ${why}`;
    if (method !== 'GET' && classify(r, curatedSet(registryRef)).kind === 'curated') return `Esta operação já tem ferramenta própria (mais segura). Procure entre as ferramentas de ${r.path.split('/')[2]}.`;
    return '';
  };
  registry.add({ ...mod('Plataforma'), name: 'plataforma_consultar', summary: 'Consulta (GET) qualquer rota liberada da plataforma, em nome do usuário e com as permissões dele.', risk: 'read',
    params: T.obj({ path: T.str('Caminho, ex.: /api/xflow/tickets'), query: { type: 'object', description: 'Parâmetros de consulta', additionalProperties: true, properties: {} } }, ['path']),
    run: async (ctx, i) => {
      const bad = checkPath('GET', i.path, registry); if (bad) return { status: 400, json: { message: bad } };
      return callInternal({ userId: ctx.user.id, commandId: ctx.actionId, method: 'GET', path: i.path.split('?')[0], query: i.query });
    } });
  registry.add({ ...mod('Plataforma'), name: 'plataforma_executar', summary: 'Executa uma operação que ALTERA dados (POST, PUT, PATCH, DELETE) numa rota liberada que ainda não tem ferramenta própria. Sempre pede confirmação do usuário antes.', risk: 'write', confirm: 'always',
    params: T.obj({ method: T.enm('Método', ['POST', 'PUT', 'PATCH', 'DELETE']), path: T.str('Caminho com o id real'), body: { type: 'object', description: 'Corpo JSON', additionalProperties: true, properties: {} }, descricao: T.str('O que isto faz, em português, para o usuário confirmar', { maxLength: 300 }) }, ['method', 'path', 'descricao']),
    describe: (i) => `${i.descricao} (${i.method} ${i.path})`,
    run: async (ctx, i) => {
      const bad = checkPath(i.method, i.path, registry); if (bad) return { status: 400, json: { message: bad } };
      return callInternal({ userId: ctx.user.id, commandId: ctx.actionId, method: i.method, path: i.path.split('?')[0], body: i.body || {} });
    } });
}
