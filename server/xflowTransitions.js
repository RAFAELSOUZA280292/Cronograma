// Matriz de transições de status do XFlow. Cada ação nomeada sabe de quais
// status de origem ela pode partir e qual permissão (xflowPermissions.js)
// ela exige — o backend nunca aceita um PATCH que solte o ticket direto num
// status arbitrário.
//
// Fluxo v2 (P1.10): aguardando_informacoes/aguardando_usuario/aguardando_terceiro
// foram consolidados num único status `aguardando_terceiro` + sub-campo
// `waiting_on_type` (solicitante/cliente/terceiro) — os três nunca foram, na
// prática, distintos. Homologação e Publicação viraram dois passos
// (`em_homologacao` → aprovar → `pronta_para_publicacao` → publicar →
// `publicada`), permitindo registrar versão/build/release só no momento em
// que a correção realmente sobe pra produção, que pode ser bem depois da
// aprovação técnica.

export const XFLOW_TERMINAL_STATUSES = ['concluida', 'duplicada', 'nao_reproduzida', 'nao_e_bug', 'descartada'];

const NON_TERMINAL_ACTIVE = [
  'aberta', 'atribuida', 'em_desenvolvimento', 'em_revisao', 'pronta_para_teste',
  'em_homologacao', 'pronta_para_publicacao', 'publicada', 'aguardando_validacao_solicitante',
  'aguardando_terceiro', 'aguardando_gerencia',
];

export const XFLOW_TRANSITIONS = {
  aceitar: { from: ['aberta'], to: 'atribuida', permission: 'triage' },
  pedir_infos: { from: ['aberta', 'atribuida', 'em_desenvolvimento', 'em_revisao', 'pronta_para_teste'], to: 'aguardando_terceiro', permission: 'triage' },
  nao_reproduziu: { from: ['aberta', 'atribuida', 'em_desenvolvimento'], to: 'nao_reproduzida', permission: 'triage', requiresFields: ['closureJustification'] },
  marcar_duplicado: { from: ['aberta', 'atribuida', 'em_desenvolvimento'], to: 'duplicada', permission: 'triage', requiresFields: ['duplicateOfTicketId'] },
  classificar_nao_bug: { from: ['aberta'], to: 'nao_e_bug', permission: 'triage' },
  escalar_gerencia: { from: ['aberta', 'atribuida', 'em_desenvolvimento'], to: 'aguardando_gerencia', permission: 'triage' },
  resolver_gerencia: { from: ['aguardando_gerencia'], to: null, permission: 'resolver_gerencia', requiresFields: ['note'] },
  redirecionar: { from: ['aberta', 'atribuida'], to: null, permission: 'triage', requiresFields: [] },
  iniciar_dev_direto: { from: ['aberta'], to: 'em_desenvolvimento', permission: 'triage' },
  iniciar_desenvolvimento: { from: ['atribuida'], to: 'em_desenvolvimento', permission: 'advance_dev_pipeline' },
  enviar_revisao: { from: ['em_desenvolvimento'], to: 'em_revisao', permission: 'advance_dev_pipeline' },
  marcar_pronta_teste: { from: ['em_revisao'], to: 'pronta_para_teste', permission: 'advance_dev_pipeline' },
  enviar_homologacao: { from: ['pronta_para_teste'], to: 'em_homologacao', permission: 'advance_dev_pipeline' },
  homolog_aprovar: { from: ['em_homologacao'], to: 'pronta_para_publicacao', permission: 'homologar' },
  homolog_reprovar: { from: ['em_homologacao'], to: 'em_desenvolvimento', permission: 'homologar', requiresFields: ['note'] },
  publicar: { from: ['pronta_para_publicacao'], to: 'publicada', permission: 'publicar' },
  enviar_validacao: { from: ['publicada'], to: 'aguardando_validacao_solicitante', permission: 'enviar_validacao' },
  aprovar_validacao: { from: ['aguardando_validacao_solicitante'], to: 'concluida', permission: 'aprovar_validacao' },
  reprovar_validacao: { from: ['aguardando_validacao_solicitante'], to: 'em_desenvolvimento', permission: 'reprovar_validacao' },
  reabrir: { from: XFLOW_TERMINAL_STATUSES, to: 'em_desenvolvimento', permission: 'reabrir', requiresFields: ['note'] },
  bloquear: { from: NON_TERMINAL_ACTIVE, to: 'bloqueada', permission: 'block', requiresFields: ['blockedReason'], savesPrevStatus: true },
  desbloquear: { from: ['bloqueada'], to: null, permission: 'unblock' },
  pausar: { from: NON_TERMINAL_ACTIVE, to: 'pausada', permission: 'pause', savesPrevStatus: true },
  retomar: { from: ['pausada', 'aguardando_terceiro'], to: null, permission: 'resume' },
  fechar_sem_desenvolver: { from: [...NON_TERMINAL_ACTIVE, 'bloqueada', 'pausada'], to: null, permission: 'fechar_sem_desenvolver', requiresFields: ['closureReason', 'closureJustification'] },
  arquivar: { from: XFLOW_TERMINAL_STATUSES, to: null, permission: 'arquivar' },
  desarquivar: { from: XFLOW_TERMINAL_STATUSES, to: null, permission: 'desarquivar' },
  // Soft-delete: de qualquer status (não só terminal, ao contrário de
  // arquivar) — um ticket aberto por engano também precisa poder ir pra
  // Lixeira. purgar (apagar de vez) não passa por aqui — é DELETE direto,
  // ver router.delete('/tickets/:id') em xflow.js.
  excluir: { from: null, to: null, permission: 'excluir' },
  restaurar: { from: null, to: null, permission: 'restaurar' },
  // Ações que não mudam status — só validam permissão sobre o ticket atual.
  editar_campo: { from: null, to: null, permission: 'edit_content' },
  mudar_severidade: { from: null, to: null, permission: 'change_severity' },
  mudar_prioridade: { from: null, to: null, permission: 'change_priority' },
  reatribuir: { from: null, to: null, permission: 'reassign' },
  editar_prazo_proxima_acao: { from: null, to: null, permission: 'editar_prazo_proxima_acao' },
  comentar: { from: null, to: null, permission: 'comment' },
  anexar: { from: null, to: null, permission: 'attach_evidence' },
};

const CLOSURE_REASON_TO_STATUS = {
  duplicado: 'duplicada', nao_reproduzido: 'nao_reproduzida', comportamento_esperado: 'nao_e_bug',
  erro_configuracao: 'nao_e_bug', erro_usuario: 'nao_e_bug', melhoria: 'nao_e_bug',
  problema_externo: 'descartada', nao_aplicavel: 'descartada',
  resolvido_anteriormente: 'duplicada', descartado_gestao: 'descartada',
};
export { CLOSURE_REASON_TO_STATUS };

// Valida se `action`, partindo de `fromStatus`, é permitida estruturalmente
// (não checa permissão de papel — isso é `xflowPermissions.canDo`, chamado
// separadamente). Retorna { ok: true, toStatus } ou { ok: false, reason }.
export function checkTransition(action, fromStatus, payload) {
  const def = XFLOW_TRANSITIONS[action];
  if (!def) return { ok: false, reason: `Ação desconhecida: ${action}` };
  if (def.from && !def.from.includes(fromStatus)) {
    return { ok: false, reason: `Ação "${action}" não é permitida a partir do status "${fromStatus}".` };
  }
  for (const field of def.requiresFields || []) {
    if (!payload || !payload[field] || !String(payload[field]).trim()) {
      return { ok: false, reason: `Campo obrigatório ausente para "${action}": ${field}.` };
    }
  }
  let toStatus = def.to;
  if (action === 'fechar_sem_desenvolver') {
    toStatus = CLOSURE_REASON_TO_STATUS[payload.closureReason];
    if (!toStatus) return { ok: false, reason: 'Motivo de encerramento inválido.' };
    if (payload.closureReason === 'duplicado' && !payload.duplicateOfTicketId) {
      return { ok: false, reason: 'Informe o BUG original ao marcar como duplicado.' };
    }
  }
  return { ok: true, toStatus, def };
}
