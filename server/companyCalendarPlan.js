// Reservar na agenda (2026-10-19, pedido do Rafael): cada ATIVIDADE do cronograma da empresa vira UM bloco de agenda (padrão de call: 60 min) para a equipe PRICETAX.
// Funções puras (sem rede nem banco), testadas em Node. Quem fala com o Google é server/companyCalendar.js.
import crypto from 'node:crypto';
import { inWindow, meetingItems } from '../shared/calendarDays.js';

export const DEFAULT_TIME = '10:00';
export const DEFAULT_DURATION = 60;
export const DURATIONS = [30, 60, 90, 120, 180];
export const MAX_EMAILS = 20;
export const MAX_ITEMS = 60;
const TZ = 'America/Sao_Paulo';
const EMAIL_RE = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]{2,}$/;
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

// Reuniões que podem virar bloco (atividade ou subatividade do tipo Reunião): com data, não concluídas e de hoje em diante (não se reserva no passado).
// Trabalho (execução) não gera convite. `semData` = reuniões sem data, que não dá para reservar. `activityId` guarda a chave (atividade, ou "atividade#sub").
export function candidateMeetings(project, today) {
  const rows = [];
  let past = 0;
  let semData = 0;
  for (const m of meetingItems(project)) {
    if (m.done || !m.title) continue;
    if (!m.date) { semData += 1; continue; }
    if (m.date < today) { past += 1; continue; }
    rows.push({ activityId: m.key, title: clip(m.title, 240), phaseName: m.phaseName, date: m.date, endDate: m.endDate, responsible: clip(m.responsible, 80), isSub: !!m.subId, meetingTime: m.meetingTime || '' });
  }
  rows.sort((x, y) => x.date.localeCompare(y.date) || x.title.localeCompare(y.title));
  return { rows, past, semData };
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

export function buildEventBody(row, companyName, { time, durationMin, emails, projectId, appUrl, day }) {
  const when = day || row.date;
  const periodo = row.endDate && row.endDate !== row.date ? `${br(row.date)} a ${br(row.endDate)}` : br(row.date);
  const linhas = [
    `Reunião do cronograma de Reforma Tributária da ${companyName}.`,
    row.phaseName ? `Fase: ${row.phaseName}` : '',
    row.isSub ? `Data prevista no cronograma: ${periodo}` : `Período da atividade: ${periodo}`,
    row.responsible ? `Responsável: ${row.responsible}` : '',
    appUrl ? `\nAbrir no painel: ${appUrl}/empresas` : '',
    '\nBloco reservado pelo painel PRICETAX (equipe interna).',
  ].filter((x) => x !== '');
  return {
    summary: `${companyName} · ${row.title}`,
    description: linhas.join('\n'),
    start: { dateTime: `${when}T${time}:00`, timeZone: TZ },
    end: { dateTime: addMinutes(when, time, durationMin), timeZone: TZ },
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
  if (!inWindow(row, mapping.start_date)) return 'desatualizada'; // a atividade mudou de período e o bloco ficou fora dele
  const body = buildEventBody(row, companyName, { ...ctx, day: mapping.start_date, time: mapping.start_time, durationMin: mapping.duration_min, emails: mapping.emails || [] });
  return fingerprint(body) === mapping.fingerprint ? 'reservada' : 'desatualizada';
}

// Reservas cuja reunião deixou de existir (excluída, passou a ser Trabalho ou ficou sem data): candidatas a cancelamento.
export function obsoleteMappings(project, mappings) {
  const keys = new Set(meetingItems(project).filter((m) => m.date).map((m) => m.key));
  return mappings.filter((m) => !keys.has(m.activity_id));
}
