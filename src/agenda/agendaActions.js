// Ações da Agenda (Onda 5, §81): responder convite do Google e criar compromisso. Sem JSX; o servidor é
// POST /api/agenda/events/:id/respond e POST /api/agenda/events (server/agenda.js).
import { useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js';
import { askConfirm, notify } from '../ui/dialogs.jsx';

// Só convite do Google em que a pessoa é convidada (dono do evento e "desconhecido" não têm o que responder).
export function canRespond(ev) {
  return !!ev && ev.source === 'google' && ev.status !== 'cancelled'
    && ['needsAction', 'tentative', 'accepted', 'declined'].includes(ev.myResponse);
}
export const isUnanswered = (ev) => !!ev && ev.source === 'google' && (ev.myResponse === 'needsAction' || ev.myResponse === 'tentative');

const DONE = { accepted: 'Convite aceito.', tentative: 'Resposta enviada: talvez.', declined: 'Convite recusado.' };

// `apply(id, myResponse)` atualiza o estado local do dono da lista. Otimista: aplica já e reverte se o servidor recusar.
export async function respondToInvite(ev, response, apply) {
  const prev = ev.myResponse;
  if (!canRespond(ev) || prev === response) return false;
  if (response === 'declined') {
    const ok = await askConfirm({ title: 'Recusar este convite?', message: 'O organizador será avisado.', confirmLabel: 'Recusar', danger: true });
    if (!ok) return false;
  }
  apply(ev.id, response);
  try {
    const res = await apiPost(`/api/agenda/events/${encodeURIComponent(ev.id)}/respond`, { response });
    if (res && res.myResponse && res.myResponse !== response) apply(ev.id, res.myResponse);
    notify(DONE[response], { tone: 'success' });
    return true;
  } catch (e) {
    apply(ev.id, prev);
    notify((e && e.message) || 'Não foi possível responder ao convite.', { tone: 'error' });
    return false;
  }
}

export function useRespond(apply) {
  const [respondingId, setRespondingId] = useState(null);
  async function respond(ev, response) {
    if (respondingId) return;
    setRespondingId(ev.id);
    try { await respondToInvite(ev, response, apply); } finally { setRespondingId(null); }
  }
  return { respond, respondingId };
}

export const createAgendaEvent = (payload) => apiPost('/api/agenda/events', payload);
export const updateAgendaEvent = (id, payload) => apiPatch(`/api/agenda/events/${encodeURIComponent(id)}`, payload);
export const getAgendaEvent = (id) => apiGet(`/api/agenda/events/${encodeURIComponent(id)}`).then((r) => r.event);
export const cancelAgendaEvent = (id) => apiDelete(`/api/agenda/events/${encodeURIComponent(id)}`);
export const rescheduleAgendaEvent = (id, start, end) => apiPost(`/api/agenda/events/${encodeURIComponent(id)}/reschedule`, { start, end }).then((r) => r.event);
// Proposta de novo horário: vai como nota na sua resposta ("Talvez" se você não escolher outra), que o organizador recebe por e-mail.
export const proposeNewTime = (id, start, end, comment, response) => apiPost(`/api/agenda/events/${encodeURIComponent(id)}/respond`, { propose: { start, end }, comment, response }).then((r) => r.event);

// Data e hora de Brasília de um instante ISO (os campos do formulário são sempre em Brasília).
export function brParts(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
// "qua., 4 de nov. · 14:30–15:30" no horário de Brasília (dia inteiro: só a data).
export function fmtBrWhen(start, end, allDay) {
  if (allDay) {
    const d = new Date(`${String(start).slice(0, 10)}T12:00:00-03:00`);
    return `${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: 'numeric', month: 'short' }).format(d)} · dia inteiro`;
  }
  const s = new Date(start); const e = new Date(end || start);
  if (Number.isNaN(s.getTime())) return '';
  const day = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: 'numeric', month: 'short', year: s.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(s);
  const p = brParts(start); const q = brParts(end || start);
  return `${day} · ${p.time}–${q.time}${p.date !== q.date ? ` (${q.date.split('-').reverse().slice(0, 2).join('/')})` : ''}`;
}
export const guestsWord = (n) => (n === 1 ? 'O convidado recebe' : `Os ${n} convidados recebem`);
export const brIso = (date, time) => new Date(`${date}T${time}:00-03:00`).toISOString();

// "Ver na agenda" a partir de outra tela (Caixa de e-mail): a Agenda abre no dia do evento com o detalhe aberto.
const OPEN_KEY = 'agenda-open-event';
export function requestAgendaOpen(id, start) {
  try { window.sessionStorage.setItem(OPEN_KEY, JSON.stringify({ id, start })); } catch { /* sem sessionStorage: abre só a Agenda */ }
}
export function takeAgendaOpen() {
  try {
    const raw = window.sessionStorage.getItem(OPEN_KEY);
    window.sessionStorage.removeItem(OPEN_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.id === 'string' ? v : null;
  } catch { return null; }
}
