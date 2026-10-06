// Ações da Agenda (Onda 5, §81): responder convite do Google e criar compromisso. Sem JSX; o servidor é
// POST /api/agenda/events/:id/respond e POST /api/agenda/events (server/agenda.js).
import { useState } from 'react';
import { apiPost } from '../lib/api.js';
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
