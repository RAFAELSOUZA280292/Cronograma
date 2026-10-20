// Reuniões no cronograma e dias de agenda (2026-10-19, regra do Rafael): ATIVIDADE e SUBATIVIDADE têm tipo — 'reuniao' (call, precisa de gente junto ao mesmo tempo) ou 'trabalho' (padrão).
// Trabalho pode se acumular no mesmo dia; REUNIÃO: no máximo uma por dia na mesma empresa. Funções puras, usadas no servidor e na tela.
import { pautaTitles } from './pauta.js';
const DAY = 86400000;
const t = (iso) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const alive = (arr) => (Array.isArray(arr) ? arr.filter((x) => x && !x.deleted) : []);
export const KINDS = ['trabalho', 'reuniao'];
export const isMeeting = (x) => !!x && x.kind === 'reuniao';
export const isWeekend = (d) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w === 0 || w === 6; };
export const windowOf = (row) => ({ from: row.date, to: row.endDate && row.endDate >= row.date ? row.endDate : row.date });
export const inWindow = (row, day) => { const w = windowOf(row); return !!day && day >= w.from && day <= w.to; };

// Reuniões do cronograma: atividades do tipo reunião (período início..fim) e subatividades do tipo reunião (dia próprio). Chave: id da atividade, ou "idAtividade#idSub".
export function meetingItems(project) {
  const phaseName = new Map(alive(project && project.phases).map((p) => [p.id, p.name]));
  const out = [];
  for (const a of alive(project && project.activities)) {
    const phase = phaseName.get(a.phase) || '';
    if (isMeeting(a)) out.push({ key: a.id, activityId: a.id, subId: '', title: a.title || '', phaseName: phase, date: a.date || '', endDate: a.endDate || '', responsible: a.responsible || '', done: a.status === 'concluido', meetingTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(a.meetingTime || '') ? a.meetingTime : '' });
    for (const s of alive(a.subactivities)) {
      if (isMeeting(s)) out.push({ key: `${a.id}#${s.id}`, activityId: a.id, subId: s.id, title: `${a.title || ''} — ${s.title || ''}`, phaseName: phase, date: s.date || '', endDate: '', responsible: s.responsible || a.responsible || '', done: !!s.done, pauta: pautaTitles(project.activities, a.id, s.id) });
    }
  }
  return out;
}

// Dias repetidos entre reuniões: { 'AAAA-MM-DD': [chave, ...] } só onde há mais de uma. `dayOf` permite usar um dia escolhido no lugar do dia do cronograma.
export function duplicateDays(entries) {
  const by = {};
  for (const e of entries) if (e.day) (by[e.day] || (by[e.day] = [])).push(e.key || e.activityId);
  return Object.fromEntries(Object.entries(by).filter(([, ids]) => ids.length > 1));
}

// Conflitos no próprio cronograma (pelo dia de cada reunião, ainda sem escolher outro): [{ day, items: [{key,title}] }] de hoje em diante (ou todos, sem `today`).
export function meetingConflicts(project, today = '') {
  const items = meetingItems(project).filter((m) => m.date && !m.done && (!today || m.date >= today));
  const by = {};
  for (const m of items) (by[m.date] || (by[m.date] = [])).push({ key: m.key, title: m.title });
  return Object.entries(by).filter(([, l]) => l.length > 1).map(([day, list]) => ({ day, items: list })).sort((a, b) => a.day.localeCompare(b.day));
}

// Escolhe um dia livre para cada reunião. `taken`: dias já ocupados por outras reuniões. Quem tem menos folga (período mais curto) escolhe primeiro; cada um fica no próprio
// dia de início se estiver livre; senão, o primeiro dia útil livre do período (fim de semana só se não houver outro). Sem saída, mantém o dia de início e entra em `unresolved`.
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
