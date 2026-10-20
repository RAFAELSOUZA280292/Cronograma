// Reservar na agenda (2026-10-19, pedido do Rafael): cada ATIVIDADE do cronograma da empresa vira UM bloco de agenda (padrão de call: 60 min) para a equipe PRICETAX.
// Funções puras (sem rede nem banco), testadas em Node. Quem fala com o Google é server/companyCalendar.js.
import crypto from 'node:crypto';

export const DEFAULT_TIME = '10:00';
export const DEFAULT_DURATION = 60;
export const DURATIONS = [30, 60, 90, 120, 180];
export const MAX_EMAILS = 20;
export const MAX_ITEMS = 60;
const TZ = 'America/Sao_Paulo';
const EMAIL_RE = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]{2,}$/;
const alive = (arr) => (Array.isArray(arr) ? arr.filter((x) => x && !x.deleted) : []);
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

export const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));

// "a@x.com, b@x.com\nc@x.com" -> { emails (minúsculas, sem repetir), invalid }
export function parseEmails(text) {
  const emails = [];
  const invalid = [];
  for (const raw of String(text || '').split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    if (!EMAIL_RE.test(e)) { invalid.push(raw.trim()); continue; }
    if (!emails.includes(e)) emails.push(e);
  }
  return { emails, invalid };
}

// Atividades que podem virar bloco: vivas, com data, ainda não concluídas e de hoje em diante (não se reserva no passado).
export function candidateActivities(project, today) {
  const phaseName = new Map(alive(project && project.phases).map((p) => [p.id, p.name]));
  const rows = [];
  let past = 0;
  for (const a of alive(project && project.activities)) {
    if (!a.date || !a.title || a.status === 'concluido') continue;
    if (a.date < today) { past += 1; continue; }
    rows.push({ activityId: a.id, title: clip(a.title, 200), phaseName: phaseName.get(a.phase) || '', date: a.date, endDate: a.endDate || '', responsible: clip(a.responsible, 80) });
  }
  rows.sort((x, y) => x.date.localeCompare(y.date) || x.title.localeCompare(y.title));
  return { rows, past };
}

const br = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

// Soma minutos a uma data/hora "de parede" (sem fuso) e devolve no mesmo formato.
export function addMinutes(date, time, minutes) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm + minutes));
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:00`;
}

export function buildEventBody(row, companyName, { time, durationMin, emails, projectId, appUrl }) {
  const periodo = row.endDate && row.endDate !== row.date ? `${br(row.date)} a ${br(row.endDate)}` : br(row.date);
  const linhas = [
    `Atividade do cronograma de Reforma Tributária da ${companyName}.`,
    row.phaseName ? `Fase: ${row.phaseName}` : '',
    `Período da atividade: ${periodo}`,
    row.responsible ? `Responsável: ${row.responsible}` : '',
    appUrl ? `\nAbrir no painel: ${appUrl}/empresas` : '',
    '\nBloco reservado pelo painel PRICETAX (equipe interna).',
  ].filter((x) => x !== '');
  return {
    summary: `${companyName} · ${row.title}`,
    description: linhas.join('\n'),
    start: { dateTime: `${row.date}T${time}:00`, timeZone: TZ },
    end: { dateTime: addMinutes(row.date, time, durationMin), timeZone: TZ },
    attendees: emails.map((email) => ({ email })),
    transparency: 'opaque',
    guestsCanModify: false,
    reminders: { useDefault: true },
    extendedProperties: { private: { pricetaxProjectId: String(projectId || ''), pricetaxActivityId: String(row.activityId) } },
  };
}

// Impressão digital do que o convidado enxerga: se mudar (data, hora, título, convidados), o evento é atualizado.
export function fingerprint(body) {
  const s = JSON.stringify([body.summary, body.description, body.start.dateTime, body.end.dateTime, body.attendees.map((a) => a.email).sort()]);
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}

// Estado de cada linha em relação ao que já foi reservado: 'nova' | 'reservada' (igual) | 'desatualizada' (a atividade mudou depois da reserva).
export function rowStatus(row, mapping, companyName, ctx) {
  if (!mapping) return 'nova';
  const body = buildEventBody(row, companyName, { ...ctx, time: mapping.start_time, durationMin: mapping.duration_min, emails: mapping.emails || [] });
  return fingerprint(body) === mapping.fingerprint ? 'reservada' : 'desatualizada';
}

// Reservas cuja atividade não existe mais (excluída) ou ficou sem data: candidatas a cancelamento.
export function obsoleteMappings(project, mappings) {
  const byId = new Map(alive(project && project.activities).map((a) => [a.id, a]));
  return mappings.filter((m) => { const a = byId.get(m.activity_id); return !a || !a.date; });
}
