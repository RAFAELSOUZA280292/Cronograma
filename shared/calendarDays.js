// Reservar na agenda (2026-10-19): regra do Rafael — na MESMA empresa não pode haver dois blocos de agenda no mesmo dia (empresas diferentes podem).
// O dia do bloco fica dentro do período da atividade (início..fim); sem fim, é o dia de início. Funções puras, usadas no servidor e na tela.
const DAY = 86400000;
const t = (iso) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
export const isWeekend = (d) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w === 0 || w === 6; };
export const windowOf = (row) => ({ from: row.date, to: row.endDate && row.endDate >= row.date ? row.endDate : row.date });
export const inWindow = (row, day) => { const w = windowOf(row); return !!day && day >= w.from && day <= w.to; };

// Escolhe um dia livre para cada linha. `taken`: dias já ocupados por outras reservas da empresa. Quem tem menos folga (período mais curto) escolhe primeiro;
// cada um fica no próprio dia de início se estiver livre; senão, o primeiro dia útil livre dentro do período (fim de semana só se não houver outro).
// Devolve { days: {activityId: 'AAAA-MM-DD'}, unresolved: [activityId] } — não resolvido mantém o dia de início (continua em conflito).
export function assignDays(rows, taken = new Set(), today = '') {
  const used = new Set(taken);
  const days = {};
  const unresolved = [];
  const order = rows.slice().sort((a, b) => (t(windowOf(a).to) - t(windowOf(a).from)) - (t(windowOf(b).to) - t(windowOf(b).from)) || a.date.localeCompare(b.date) || String(a.title || '').localeCompare(String(b.title || '')));
  for (const r of order) {
    const w = windowOf(r);
    let pick = !used.has(r.date) ? r.date : '';
    if (!pick) {
      const free = [];
      for (let ms = Math.max(t(w.from), today ? t(today) : 0), n = 0; ms <= t(w.to) && n < 400; ms += DAY, n += 1) { const d = iso(ms); if (!used.has(d)) free.push(d); }
      pick = free.find((d) => !isWeekend(d)) || free[0] || '';
    }
    if (pick) { used.add(pick); days[r.activityId] = pick; } else { days[r.activityId] = r.date; unresolved.push(r.activityId); }
  }
  return { days, unresolved };
}

// Dias repetidos entre as linhas escolhidas (e as reservas que ficam): { 'AAAA-MM-DD': [activityId, ...] } só com mais de um.
export function duplicateDays(entries) {
  const by = {};
  for (const e of entries) (by[e.day] || (by[e.day] = [])).push(e.activityId);
  return Object.fromEntries(Object.entries(by).filter(([, ids]) => ids.length > 1));
}
