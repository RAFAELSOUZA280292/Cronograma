// Status do TO_DO da reunião — arquivo pequeno e sem dependências para ser importado de qualquer lugar sem arrastar `Meetings.jsx` (2026-10-17, §65).
// Status do TO_DO da reunião (2026-09, pedido do Rafael) — próprio, não
// reaproveita o STATUS_META de atividade: aqui é uma mistura de urgência e
// andamento ("urgente", "não é relevante"), que não faz sentido no ciclo de
// vida de uma atividade normal do cronograma.
export const TODO_STATUS_META = {
  'nao-iniciado': { label: 'Não iniciado', color: 'var(--text-4)', bg: 'var(--border-1)', border: 'var(--border-3)' },
  urgente: { label: 'Urgente', color: '#e2574c', bg: 'rgba(226,87,76,.14)', border: 'rgba(226,87,76,.5)' },
  'em-andamento': { label: 'Em andamento', color: '#3ea6ff', bg: 'rgba(62,166,255,.14)', border: 'rgba(62,166,255,.5)' },
  pausada: { label: 'Pausada', color: '#ff9f40', bg: 'rgba(255,159,64,.14)', border: 'rgba(255,159,64,.5)' },
  concluida: { label: 'Concluída', color: '#3ecf6e', bg: 'rgba(62,207,110,.14)', border: 'rgba(62,207,110,.5)' },
  'nao-relevante': { label: 'Não é relevante', color: 'var(--text-6)', bg: 'var(--border-1)', border: 'var(--border-3)' },
};
// "Não iniciado" é o estado de nascimento de todo item novo (manual ou
// extraído por IA) — por isso vem primeiro na ordem e é o fallback padrão.
export const TODO_STATUS_ORDER = ['nao-iniciado', 'urgente', 'em-andamento', 'pausada', 'concluida', 'nao-relevante'];
export const todoStatusMeta = (s) => TODO_STATUS_META[s] || TODO_STATUS_META['nao-iniciado'];
