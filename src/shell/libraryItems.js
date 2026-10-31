// Itens da paleta (Ctrl+K) para Pareceres, Modelos e Conhecimento: resposta de GET /api/library-search → itens da lista.
// `open` traz as ações do App; o ícone vem de fora para este arquivo ficar puro (testável sem React).
import { KNOWLEDGE_TYPE_LABELS } from '../knowledge/knowledgeMeta.js';

export const LIBRARY_GROUPS = ['Pareceres', 'Modelos', 'Conhecimento'];

export function libraryItems(res, open, icons = {}) {
  const r = res || {};
  const parecer = (r.pareceres || []).map((p) => ({
    id: `lib-p-${p.id}`, group: 'Pareceres', label: p.title || p.file_name || 'Parecer',
    hint: p.scope === 'cliente' && p.company_name ? `Cliente · ${p.company_name}` : 'Geral', icon: icons.parecer, run: () => open.parecer(p.id),
  }));
  const modelos = (r.modelos || []).map((m) => ({
    id: `lib-m-${m.id}`, group: 'Modelos', label: m.title || 'Modelo', hint: m.category || '', icon: icons.modelo, run: () => open.modelo(m.id),
  }));
  const facts = (r.facts || []).map((f) => ({
    id: `lib-f-${f.id}`, group: 'Conhecimento', label: f.subject || 'Conhecimento', hint: KNOWLEDGE_TYPE_LABELS[f.knowledge_type] || '', icon: icons.fact, run: () => open.fact(f.id),
  }));
  return [...parecer, ...modelos, ...facts];
}
