// O que o quadro pessoal (Gestão de Atividades) tem de urgente hoje — usado pela RENATA da tela inicial
// (2026-10-05). Módulo puro: recebe o JSON do quadro e a data de hoje (YYYY-MM-DD, horário local) e devolve contagens.
// Considera só o que está de fato aberto: fora concluídas, excluídas (lixeira) e arquivadas.
function daysBetween(fromIso, toIso) {
  const a = new Date(`${fromIso}T12:00:00`);
  const b = new Date(`${toIso}T12:00:00`);
  return Math.round((b - a) / 86400000);
}

export function boardAttention(board, todayIso) {
  const out = { overdue: 0, dueToday: 0, oldest: null };
  if (!board || !Array.isArray(board.boards) || !todayIso) return out;
  for (const b of board.boards) {
    for (const col of b.columns || []) {
      for (const card of col.cards || []) {
        if (!card || card.completed || card.deleted || card.archived || !card.dueDate) continue;
        if (card.dueDate < todayIso) {
          out.overdue += 1;
          if (!out.oldest || card.dueDate < out.oldest.dueDate) out.oldest = { title: card.title || 'Sem título', dueDate: card.dueDate, days: daysBetween(card.dueDate, todayIso) };
        } else if (card.dueDate === todayIso) {
          out.dueToday += 1;
        }
      }
    }
  }
  return out;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function attentionParts(att) {
  const parts = [];
  if (att.overdue > 0) parts.push(plural(att.overdue, 'atrasada', 'atrasadas'));
  if (att.dueToday > 0) parts.push(att.dueToday === 1 ? '1 vence hoje' : `${att.dueToday} vencem hoje`);
  return parts;
}

export function oldestText(att) {
  if (!att.oldest) return '';
  const d = att.oldest.days;
  return `a mais antiga é “${att.oldest.title}” (${d <= 0 ? 'venceu hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`})`;
}
