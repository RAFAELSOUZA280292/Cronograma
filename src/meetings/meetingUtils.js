// Utilitários puros pra tela de detalhe de Reunião (2026-09, redesign
// "AI Meeting Workspace") — parsing de transcrição bruta, corte por
// tópico e montagem do .txt de exportação. Nada aqui toca estado ou API.
import { fmtDate } from '../App.jsx';
import { todoStatusMeta } from './Meetings.jsx';

// Reconhece o padrão mais comum visto nas transcrições reais coladas
// pelo Rafael: uma linha de horário ("00:00" ou "00:00 – 00:01"),
// seguida (na mesma linha ou na próxima não-vazia) do nome de quem fala,
// seguida do texto até a próxima marca de horário. É best-effort — se o
// texto não render um número mínimo de entradas reconhecidas, devolve
// null e a UI cai pra parágrafos simples (nunca finge estrutura que não
// existe).
const TIME_LINE_RE = /^(\d{1,2}:\d{2})(?:\s*[-–—]\s*\d{1,2}:\d{2})?\s*$/;
const MIN_RECOGNIZED_ENTRIES = 3;

export function parseTranscript(rawText) {
  const text = (rawText || '').trim();
  if (!text) return null;
  const lines = text.split('\n');
  const entries = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const m = line.match(TIME_LINE_RE);
    if (m) {
      const time = m[1];
      i++;
      while (i < lines.length && !lines[i].trim()) i++;
      const speaker = i < lines.length ? lines[i].trim() : '';
      i++;
      while (i < lines.length && !lines[i].trim()) i++;
      const textLines = [];
      while (i < lines.length && !TIME_LINE_RE.test(lines[i].trim())) {
        textLines.push(lines[i]);
        i++;
      }
      const body = textLines.join('\n').trim();
      if (speaker && body) entries.push({ time, speaker, text: body });
    } else {
      i++;
    }
  }
  if (entries.length < MIN_RECOGNIZED_ENTRIES) return null;
  return entries;
}

// Corta as entradas já parseadas em seções por tópico, usando o
// startTime que a IA identificou (texto literal do timestamp). Se o
// timestamp de um tópico não bater com nenhuma entrada reconhecida
// (formato diferente, tópico sem hora), esse tópico fica sem entradas —
// a UI mostra só o título nesse caso, sem inventar conteúdo.
export function sliceEntriesByTopics(entries, topics) {
  if (!entries || !topics || topics.length === 0) return [];
  const starts = topics.map((t) => {
    if (!t.startTime) return -1;
    return entries.findIndex((e) => e.time === t.startTime);
  });
  return topics.map((t, idx) => {
    const start = starts[idx];
    if (start === -1) return { ...t, entries: [] };
    let end = entries.length;
    for (let j = idx + 1; j < starts.length; j++) {
      if (starts[j] !== -1) { end = starts[j]; break; }
    }
    return { ...t, entries: entries.slice(start, end) };
  });
}

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
