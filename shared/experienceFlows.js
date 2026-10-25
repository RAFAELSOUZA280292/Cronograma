// Fluxos que medimos para saber se o produto está ajudando (§97). Medimos o PRODUTO (fluxo, resultado, duração, erro), nunca a pessoa:
// nada de texto digitado, mouse ou tempo de tela; as telas de resultado mostram o fluxo, não quem o executou.
// `askAfter`: depois de quantas execuções bem-sucedidas na sessão vale pedir a nota (1 clique).
export const FLOWS = {
  'crm.followup.concluir': { label: 'Concluir follow-up', askAfter: 5 },
  'crm.followup.agendar_proximo': { label: 'Agendar o próximo follow-up', askAfter: 5 },
  'crm.negocio.criar': { label: 'Criar negócio', askAfter: 3 },
  'crm.lead_rapido': { label: 'Cadastrar lead novo', askAfter: 2 },
  'crm.negocio.mover_etapa': { label: 'Mover negócio de etapa', askAfter: 8 },
  'crm.negocio.editar_direto': { label: 'Editar na lista de negócios', askAfter: 6 },
  'crm.atividade.reagendar': { label: 'Reagendar atividade', askAfter: 5 },
  'paleta.acao': { label: 'Usar a paleta de comandos (Ctrl+K)', askAfter: 6 },
  'paleta.busca_crm': { label: 'Achar negócio/empresa pela busca (Ctrl+K)', askAfter: 6 },
};
export const OUTCOMES = ['ok', 'error', 'rejected', 'undo'];
// Metas iniciais para validação (não são benchmarks publicados).
export const GOALS = { csat: 4.5, success: 0.9 };
// `/api/crm/deals/123e4567-.../move` → `crm/deals/:id/move` (sem ids, sem query): só o "tipo" de rota entra na medição de erros.
export function routeGroup(path) {
  const clean = String(path || '').split('?')[0].replace(/^\/api\//, '');
  return clean.split('/').map((s) => (/^[0-9a-f-]{8,}$/i.test(s) || /^\d+$/.test(s) ? ':id' : s)).join('/').slice(0, 60).toLowerCase().replace(/[^a-z0-9_:/.-]/g, '');
}
