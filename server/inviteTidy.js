// Convite já respondido sai da Caixa de entrada, como no Gmail (02/11/2026, Rafael: "quando eu faço isso no Google o e-mail já sai da
// minha frente… quando eu aceitar direto na agenda remova o e-mail também"). Procura convites ainda na Entrada (anexo .ics, últimos
// 120 dias), acha o evento na agenda pelo UID e ARQUIVA a conversa (tira o marcador INBOX; nada é apagado) quando a pessoa já
// respondeu Sim, Talvez ou Não — tenha respondido pelo cartão do e-mail, pela Agenda do painel, pelo Google Agenda ou pelo celular.
// Cancelamento, resposta de convidado e convite ainda sem resposta ficam na Entrada.
import { gmailFor, walkParts } from './googleMail.js';
import { isCalendarPart, parseIcs } from './calendarInvite.js';
import { findEventByICalUID, googleConfigured } from './googleCalendar.js';

const ANSWERED = new Set(['accepted', 'declined', 'tentative']);
const lastRun = new Map(); // userId -> ms (arrumação ao abrir a Caixa: no máximo a cada 3 min)

export const isAnsweredInvite = (invite, event) => !!invite && ['request', 'update'].includes(invite.kind) && !!event && ANSWERED.has(event.myResponse);

function findPart(payload, partId) {
  if (!payload) return null;
  if (payload.partId === partId) return payload;
  for (const p of payload.parts || []) { const f = findPart(p, partId); if (f) return f; }
  return null;
}

export async function tidyAnsweredInvites(userId, { force = false, max = 25 } = {}) {
  if (!googleConfigured()) return { archived: 0, skipped: 'sem Google' };
  const now = Date.now();
  if (!force && now - (lastRun.get(userId) || 0) < 3 * 60 * 1000) return { archived: 0, skipped: 'recente' };
  lastRun.set(userId, now);
  const g = await gmailFor(userId, { source: 'convites', background: true });
  if (!g) return { archived: 0, skipped: 'sem Gmail' };
  const { data } = await g.gmail.users.messages.list({ userId: 'me', q: 'in:inbox filename:ics newer_than:120d', maxResults: max });
  const done = new Set();
  let archived = 0;
  for (const { id, threadId } of data.messages || []) {
    if (done.has(threadId)) continue;
    try {
      const { data: msg } = await g.gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const cal = walkParts(msg.payload).attachments.filter(isCalendarPart).sort((a, b) => (a.mimeType === 'text/calendar' ? 0 : 1) - (b.mimeType === 'text/calendar' ? 0 : 1))[0];
      if (!cal) continue;
      const part = cal.partId ? findPart(msg.payload, cal.partId) : null;
      let raw = part && part.body && part.body.data;
      if (!raw && cal.id) raw = (await g.gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: cal.id })).data.data;
      const invite = raw ? parseIcs(Buffer.from(raw, 'base64url').toString('utf8')) : null;
      if (!invite || !invite.uid) continue;
      const event = await findEventByICalUID(userId, invite.uid).catch(() => null);
      if (!isAnsweredInvite(invite, event)) continue;
      await g.gmail.users.threads.modify({ userId: 'me', id: threadId, requestBody: { removeLabelIds: ['INBOX'] } });
      done.add(threadId);
      archived += 1;
    } catch (e) { /* um convite com problema não impede os outros */ }
  }
  return { archived };
}
