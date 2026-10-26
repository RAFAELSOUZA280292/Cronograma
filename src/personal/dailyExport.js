// Daily do Meu quadro (2026-10-26): filtro por prazo e exportação (Excel e PDF). Funções PURAS (sem React/DOM) para testar em Node.
// `people` é o resultado de buildDaily em PersonalBoard.jsx: [{ id, name, entries: [{ card, col, subs, isOwner }] }].

export const DUE_FILTERS = [
  ['all', 'Todos os prazos'],
  ['late', 'Atrasadas'],
  ['today', 'Hoje'],
  ['week', 'Esta semana'],
  ['next7', 'Próximos 7 dias'],
  ['month', 'Este mês'],
  ['range', 'Período…'],
  ['none', 'Sem data'],
];

const isIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const shiftIso = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const fmtBr = (iso) => (isIso(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

// Segunda a domingo da semana de `today`.
export function weekBounds(today) {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const from = shiftIso(today, -((dow + 6) % 7));
  return { from, to: shiftIso(from, 6) };
}

// `filter` = { kind, from, to }. Sem data só passa em "Todos os prazos" e "Sem data"; item concluído nunca é "atrasado".
export function dueMatches(filter, iso, done, today) {
  const kind = (filter && filter.kind) || 'all';
  if (kind === 'all') return true;
  if (kind === 'none') return !isIso(iso);
  if (!isIso(iso)) return false;
  if (kind === 'late') return iso < today && !done;
  if (kind === 'today') return iso === today;
  if (kind === 'week') { const w = weekBounds(today); return iso >= w.from && iso <= w.to; }
  if (kind === 'next7') return iso >= today && iso <= shiftIso(today, 7);
  if (kind === 'month') return iso.slice(0, 7) === today.slice(0, 7);
  if (kind === 'range') return (!isIso(filter.from) || iso >= filter.from) && (!isIso(filter.to) || iso <= filter.to);
  return true;
}

export function dueFilterLabel(filter, today) {
  const kind = (filter && filter.kind) || 'all';
  if (kind === 'range') {
    const f = fmtBr(filter.from); const t = fmtBr(filter.to);
    return f && t ? `Prazo de ${f} a ${t}` : f ? `Prazo a partir de ${f}` : t ? `Prazo até ${t}` : 'Prazo: qualquer período';
  }
  if (kind === 'week') { const w = weekBounds(today); return `Prazo: esta semana (${fmtBr(w.from)} a ${fmtBr(w.to)})`; }
  const hit = DUE_FILTERS.find(([k]) => k === kind);
  return kind === 'all' ? '' : `Prazo: ${hit ? hit[1].toLowerCase() : kind}`;
}

function situation(it, today) {
  if (it.done) return 'Concluída';
  if (!isIso(it.dueDate)) return 'Sem data';
  if (it.dueDate < today) return 'Atrasada';
  if (it.dueDate === today) return 'Para hoje';
  return 'Em dia';
}

// Uma linha por subatividade (atividade sem subatividade sai numa linha só, com a subatividade em branco).
export function dailyRows(people, today, namesOf = () => []) {
  const rows = [];
  people.forEach((pe) => pe.entries.forEach((e) => {
    const base = { Responsável: pe.name, Atividade: e.card.title, Etapa: e.col.name, 'Prazo da atividade': isIso(e.card.dueDate) ? e.card.dueDate : '', 'Responsável pela atividade': e.isOwner ? 'Sim' : 'Não' };
    if (!e.subs.length) { rows.push({ ...base, Subatividade: '', 'Prazo da subatividade': '', Situação: situation({ done: e.card.completed, dueDate: e.card.dueDate }, today), 'Com': '' }); return; }
    e.subs.forEach((it) => rows.push({ ...base, Subatividade: it.text, 'Prazo da subatividade': isIso(it.dueDate) ? it.dueDate : '', Situação: situation(it, today), 'Com': namesOf(it).filter((n) => n !== pe.name).join(', ') }));
  }));
  return rows;
}

export function dailySummary(people) {
  return people.map((pe) => ({ Responsável: pe.name, 'Atividades': pe.entries.length, 'Subatividades abertas': pe.open, 'Atrasadas': pe.late, 'Para hoje': pe.today }));
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Documento autocontido (claro, A4) aberto numa janela só para imprimir/salvar PDF; independe do tema do app.
export function dailyToHtml({ boardName, today, people, filtersText = [], namesOf = () => [] }) {
  const tone = (iso, done) => (done || !isIso(iso) ? '' : iso < today ? 'late' : iso === today ? 'now' : '');
  const sections = people.map((pe) => {
    const body = pe.entries.map((e) => {
      const head = `<tr class="act"><td colspan="3"><b>${esc(e.card.title)}</b> <span class="muted">· ${esc(e.col.name)}${e.isOwner ? '' : ' · só subatividades'}</span></td><td class="d ${tone(e.card.dueDate, e.card.completed)}">${isIso(e.card.dueDate) ? `prazo ${fmtBr(e.card.dueDate)}` : ''}</td></tr>`;
      const subs = e.subs.map((it) => {
        const others = namesOf(it).filter((n) => n !== pe.name);
        return `<tr class="sub"><td class="chk">${it.done ? '☑' : '☐'}</td><td class="${it.done ? 'done' : ''}">${esc(it.text)}</td><td class="muted">${others.length ? `com ${esc(others.join(', '))}` : ''}</td><td class="d ${tone(it.dueDate, it.done)}">${isIso(it.dueDate) ? fmtBr(it.dueDate) : '<span class="muted">sem data</span>'}</td></tr>`;
      }).join('');
      return head + subs;
    }).join('');
    return `<section><h2>${esc(pe.name)} <span class="muted">· ${pe.open} aberta${pe.open === 1 ? '' : 's'}${pe.late ? ` · ${pe.late} atrasada${pe.late === 1 ? '' : 's'}` : ''}${pe.today ? ` · ${pe.today} para hoje` : ''}</span></h2><table><tbody>${body}</tbody></table></section>`;
  }).join('');
  const filters = filtersText.filter(Boolean);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Daily — ${esc(boardName)} — ${esc(fmtBr(today))}</title><style>
  @page { size: A4; margin: 14mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font: 12px/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub-h { color: #555; margin: 0 0 14px; }
  section { break-inside: auto; margin: 0 0 16px; }
  h2 { font-size: 14px; margin: 0 0 6px; padding: 6px 8px; background: #f2f2f2; border-left: 4px solid #FEDB00; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 6px; vertical-align: top; border-bottom: 1px solid #e6e6e6; }
  tr { break-inside: avoid; }
  tr.act td { padding-top: 8px; border-bottom: 1px solid #cfcfcf; }
  td.chk { width: 18px; padding-right: 0; }
  td.d { width: 108px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.d.late { color: #b3261e; font-weight: 700; }
  td.d.now { color: #8a5a00; font-weight: 700; }
  .muted { color: #666; font-weight: 400; }
  .done { text-decoration: line-through; color: #777; }
  .foot { margin-top: 14px; font-size: 10px; color: #777; }
  </style></head><body>
  <h1>Daily — ${esc(boardName)}</h1>
  <p class="sub-h">${esc(fmtBr(today))}${filters.length ? ` · ${esc(filters.join(' · '))}` : ''}</p>
  ${sections || '<p>Nada para mostrar com estes filtros.</p>'}
  <p class="foot">Gerado pelo PRICETAX Cronograma em ${esc(fmtBr(today))}.</p>
  </body></html>`;
}
