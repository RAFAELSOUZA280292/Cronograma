// Papel efetivo + regras de "quem pode fazer o quê" no XFlow. Regras vivem
// aqui como código (não configurável por organização) — é uma decisão de
// negócio fixa, não um dado de usuário. Ver PROJECT_CONTEXT.md §18 pra tabela
// completa e o porquê de cada linha.

const RANK = { reporter: 0, dev: 1, gestao: 2, admin: 3 };

export function effectiveXflowRole(user) {
  if (!user || !user.xflowRole) return null;
  if (user.role === 'master' || user.isSuperAdmin) return 'admin';
  return user.xflowRole;
}

function isAtLeast(role, min) {
  return RANK[role] >= RANK[min];
}

export function isOwner(user, ticket) {
  return !!ticket && ticket.reporterId === user.id;
}

export function isAssignee(user, ticket) {
  return !!ticket && ticket.assigneeId === user.id;
}

// action -> (user, ticket) => boolean. `ticket` é null para ações sem ticket
// ainda (ex.: criar). Toda ação não listada aqui é negada por padrão.
const RULES = {
  create_ticket: () => true,
  comment: () => true,
  reorder: () => true,
  // Vincular/desvincular TASKs relacionadas — mesmo espírito liberal de
  // `comment`/`reorder`: é metadado organizacional/rastreabilidade, não
  // altera conteúdo nem status, então qualquer um com acesso ao XFlow pode
  // linkar o que já vê.
  link_tickets: () => true,
  attach_evidence: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : true),
  edit_content: (role, user, ticket) => {
    if (role === 'reporter') {
      return isOwner(user, ticket) && ['aberta', 'aguardando_informacoes', 'aguardando_terceiro', 'aguardando_usuario'].includes(ticket.status);
    }
    return isAtLeast(role, 'dev');
  },
  triage: (role) => isAtLeast(role, 'dev'),
  reassign: (role, user, ticket, payload) => {
    if (role === 'dev') return !payload || payload.assigneeId === user.id;
    return isAtLeast(role, 'gestao');
  },
  change_severity: (role) => isAtLeast(role, 'dev'),
  change_priority: (role) => isAtLeast(role, 'dev'),
  advance_dev_pipeline: (role, user, ticket) => (role === 'dev' ? isAssignee(user, ticket) : isAtLeast(role, 'gestao')),
  block: (role) => isAtLeast(role, 'dev'),
  unblock: (role) => isAtLeast(role, 'dev'),
  pause: (role) => isAtLeast(role, 'dev'),
  resume: (role) => isAtLeast(role, 'dev'),
  homologar: (role) => isAtLeast(role, 'gestao'),
  resolver_gerencia: (role) => isAtLeast(role, 'gestao'),
  publicar: (role, user, ticket) => (role === 'dev' ? isAssignee(user, ticket) : isAtLeast(role, 'gestao')),
  enviar_validacao: (role, user, ticket) => (role === 'dev' ? isAssignee(user, ticket) : isAtLeast(role, 'gestao')),
  aprovar_validacao: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : isAtLeast(role, 'gestao')),
  reprovar_validacao: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : isAtLeast(role, 'gestao')),
  reabrir: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : isAtLeast(role, 'gestao')),
  fechar_sem_desenvolver: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : isAtLeast(role, 'dev')),
  fechar_motivo_gestao: (role) => isAtLeast(role, 'gestao'),
  editar_prazo_proxima_acao: (role, user, ticket) => (role === 'dev' ? isAssignee(user, ticket) : isAtLeast(role, 'gestao')),
  arquivar: (role) => isAtLeast(role, 'gestao'),
  desarquivar: (role) => isAtLeast(role, 'gestao'),
  // Soft-delete (vai pra Lixeira, nunca some de fato): reporter só do próprio
  // ticket, dev/gestão/admin de qualquer um. Restaurar/purgar são ações da
  // Lixeira em si, não do ticket normal — por isso ficam mais restritas.
  excluir: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : isAtLeast(role, 'dev')),
  restaurar: (role) => isAtLeast(role, 'gestao'),
  // Apagar de vez (sem volta) — só admin (master/superAdmin do Cronograma
  // com xflow_role setado). Ver PROJECT_CONTEXT.md §18.
  purgar: (role) => role === 'admin',
  editar_sla_config: (role) => role === 'admin',
};

export function canDo(action, user, ticket, payload) {
  const role = effectiveXflowRole(user);
  if (!role) return false;
  const rule = RULES[action];
  if (!rule) return false;
  return !!rule(role, user, ticket, payload);
}
