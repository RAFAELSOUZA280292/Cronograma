// Utilitários puros pra tela de detalhe de Reunião (2026-09, redesign
// "AI Meeting Workspace") — parsing de transcrição bruta, corte por
// tópico e montagem do .txt de exportação. Nada aqui toca estado ou API.
import { fmtDate } from '../App.jsx';
import { todoStatusMeta } from './Meetings.jsx';

// parseTranscript/sliceEntriesByTopics/splitDecisionLines moraram aqui
// até a Fase 1 do Assistente Inteligente de Projetos (2026-09) — foram
// extraídas pra shared/transcriptParser.js (sem dependência de React)
// pra poderem ser reaproveitadas pela indexação de memória no backend
// (server/memoryIngest.js) sem duplicar a implementação. Reexportadas
// aqui pra não quebrar nenhum import existente na tela de Reunião.
export { parseTranscript, sliceEntriesByTopics, splitDecisionLines } from '../../shared/transcriptParser.js';

export function buildMeetingText(meeting, companyName) {
  const lines = [];
  lines.push(meeting.title || 'Reunião sem título');
  lines.push('='.repeat((meeting.title || '').length || 20));
  lines.push('');
  lines.push(`Empresa: ${companyName || '—'}`);
  lines.push(`Data: ${meeting.date ? fmtDate(meeting.date) : 'sem data'}${meeting.time ? ` às ${meeting.time}` : ''}`);
  if ((meeting.participants || []).length) lines.push(`Participantes: ${meeting.participants.join(', ')}`);
  lines.push('');
  if (meeting.summary) { lines.push('RESUMO EXECUTIVO'); lines.push(meeting.summary); lines.push(''); }
  if (meeting.decisions) { lines.push('DECISÕES TOMADAS'); lines.push(meeting.decisions); lines.push(''); }
  const items = (meeting.actionItems || []).filter((it) => !it.deleted);
  if (items.length) {
    lines.push('ATIVIDADES GERADAS');
    items.forEach((it) => {
      const side = it.owner === 'cliente' ? (companyName || 'Cliente') : 'PRICETAX';
      lines.push(`- [${todoStatusMeta(it.status).label}] ${it.title} — ${side}${it.responsible ? ` — ${it.responsible}` : ''}${it.dueDate ? ` — prazo ${fmtDate(it.dueDate)}` : ''}`);
    });
    lines.push('');
  }
  if (meeting.transcript) { lines.push('TRANSCRIÇÃO COMPLETA'); lines.push(meeting.transcript); }
  return lines.join('\n');
}

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const HIGHLIGHT_TYPE_META = {
  decisao: { label: 'Decisão', color: '#3ecf6e', bg: 'rgba(62,207,110,.12)', border: 'rgba(62,207,110,.4)' },
  risco: { label: 'Risco', color: '#e2574c', bg: 'rgba(226,87,76,.12)', border: 'rgba(226,87,76,.4)' },
  pendencia: { label: 'Pendência', color: '#ff9f40', bg: 'rgba(255,159,64,.12)', border: 'rgba(255,159,64,.4)' },
  proximo_passo: { label: 'Próximo passo', color: '#3ea6ff', bg: 'rgba(62,166,255,.12)', border: 'rgba(62,166,255,.4)' },
  duvida: { label: 'Dúvida', color: '#b892ff', bg: 'rgba(184,146,255,.12)', border: 'rgba(184,146,255,.4)' },
  insight: { label: 'Insight', color: '#b892ff', bg: 'rgba(184,146,255,.12)', border: 'rgba(184,146,255,.4)' },
  numero_importante: { label: 'Número importante', color: '#F5C400', bg: 'rgba(245,196,0,.12)', border: 'rgba(245,196,0,.4)' },
};
export function highlightTypeMeta(t) { return HIGHLIGHT_TYPE_META[t] || HIGHLIGHT_TYPE_META.insight; }
