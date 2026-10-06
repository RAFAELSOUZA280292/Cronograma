// Quais notificações cada usuário quer ver (2026-10-06). Guardado por usuário em users.preferences.notifications
// ({ muted: [categoria,...] }) — nenhuma categoria silenciada = vê tudo (padrão). O filtro é na LEITURA: silenciar
// esconde sem apagar, então religar a categoria traz de volta o que chegou enquanto estava desligada.
// Tipo de notificação desconhecido (ex.: "mention") nunca é escondido.
export const NOTIFICATION_CATEGORIES = [
  { key: 'empresas', label: 'Empresas', description: 'Atividades do cronograma e tarefas de reunião: responsável, vínculo, menção, tarefa vencida.', prefixes: ['activity_', 'todo_'], active: true },
  { key: 'gestao', label: 'Gestão de Atividades', description: 'Avisos do seu quadro pessoal de tarefas.', prefixes: ['personal_'], active: false },
  { key: 'xflow', label: 'XFlow', description: 'TASKs: responsável definido e menções em comentários.', prefixes: ['xflow_'], active: true },
  { key: 'crm', label: 'CRM', description: 'Atividades do CRM atribuídas ou vencendo e menções em notas.', prefixes: ['crm_'], active: true },
  { key: 'pareceres', label: 'Pareceres e Modelos', description: 'Menções em comentários de pareceres e de modelos de documentos.', prefixes: ['parecer_', 'modelo_'], active: true },
  { key: 'renata', label: 'RENATA', description: 'Avisos da RENATA.', prefixes: ['renata_'], active: false },
];

export function readMuted(preferences) {
  const m = preferences && preferences.notifications && preferences.notifications.muted;
  const valid = new Set(NOTIFICATION_CATEGORIES.map((c) => c.key));
  return Array.isArray(m) ? [...new Set(m.filter((k) => valid.has(k)))] : [];
}

export function mutedPatterns(muted) {
  return NOTIFICATION_CATEGORIES.filter((c) => muted.includes(c.key)).flatMap((c) => c.prefixes.map((p) => `${p}%`));
}

export function publicCategories(muted) {
  return NOTIFICATION_CATEGORIES.map((c) => ({ ...c, muted: muted.includes(c.key) }));
}

export async function loadMutedPatterns(pool, userId) {
  const { rows } = await pool.query('SELECT preferences FROM users WHERE id=$1', [userId]);
  return mutedPatterns(readMuted(rows[0] && rows[0].preferences));
}
