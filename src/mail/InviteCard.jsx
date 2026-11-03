// Cartão de convite de reunião na leitura do e-mail (2026-11-02): convite novo ou alterado, cancelamento, resposta de alguém e
// "novo horário sugerido". Responde Sim/Talvez/Não, propõe outro horário, aceita o horário sugerido (organizador) e abre o evento na
// Agenda do painel — tudo pela agenda do Google da própria pessoa (rotas /api/agenda). Lê o convite em GET /api/mail/messages/:id/invite.
import React, { useEffect, useState } from 'react';
import { Ban, CalendarCheck, CalendarClock, CalendarDays, CalendarX, Reply, Video } from 'lucide-react';
import { Button, Callout, Skeleton } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { apiGet } from '../lib/api.js';
import RsvpButtons from '../agenda/RsvpButtons.jsx';
import { AttendeeList, ProposeTimeForm } from '../agenda/EventDetail.jsx';
import { canRespond, respondToInvite, proposeNewTime, rescheduleAgendaEvent, requestAgendaOpen, fmtBrWhen, guestsWord } from '../agenda/agendaActions.js';
import '../agenda/agenda.css';

const ANSWER = { accepted: 'Sim', tentative: 'Talvez', declined: 'Não', needsAction: 'ainda não respondeu' };
const EMAIL_WORDS = { accepted: 'Sim', tentative: 'Talvez', declined: 'Não' };

function headline(invite, who) {
  const name = who ? (who.name || who.email) : 'Um convidado';
  switch (invite.kind) {
    case 'counter': return { Icon: CalendarClock, text: `${name} sugeriu um novo horário` };
    case 'reply': return { Icon: CalendarCheck, text: `${name} respondeu: ${ANSWER[who && who.response] || 'resposta'}` };
    case 'cancel': return { Icon: CalendarX, text: 'Reunião cancelada' };
    case 'update': return { Icon: CalendarDays, text: 'Convite atualizado' };
    default: return { Icon: CalendarDays, text: 'Convite de reunião' };
  }
}

// `onAnswered`: respondeu (Sim/Talvez/Não ou propôs horário) → a Caixa arquiva a conversa, como o Gmail faz (02/11/2026).
// `onFocus(focus, { open })` (§151): o horário do convite vai para o painel lateral da Caixa (o painel aberto pula para o dia);
// com ele, "Ver na agenda" abre o painel ao lado em vez de trocar de tela.
export default function InviteCard({ messageId, onReply, onGoAgenda, onAnswered, onFocus }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposing, setProposing] = useState(false);

  useEffect(() => {
    let alive = true;
    apiGet(`/api/mail/messages/${encodeURIComponent(messageId)}/invite`)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError((e && e.message) || 'Não consegui ler o convite.'); });
    return () => { alive = false; };
  }, [messageId]);
  const focusOf = (d) => (d && d.invite && !['cancel', 'reply'].includes(d.invite.kind) && d.invite.start
    ? { start: d.invite.start, end: d.invite.end, allDay: !!d.invite.allDay, eventId: d.event ? d.event.id : null, title: d.invite.title } : null);
  useEffect(() => { const f = focusOf(data); if (f && onFocus) onFocus(f, { open: false }); }, [data && data.invite]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="mail-invite"><Callout tone="danger" icon={Ban}>{error}</Callout></div>;
  if (!data) return <div className="mail-invite" aria-busy="true"><Skeleton height={84} /></div>;

  const { invite, calendarError } = data;
  const event = data.event;
  const me = String(data.me || '').toLowerCase();
  const who = ['counter', 'reply'].includes(invite.kind) ? invite.attendees.find((a) => a.email && a.email !== me) || invite.attendees[0] : null;
  const head = headline(invite, who);
  const meetLink = (event && event.meetLink) || invite.meetLink;
  const people = event ? event.attendees : invite.attendees.map((a) => ({ ...a, self: a.email === me }));
  const invited = event && canRespond(event);
  const sameTime = event && Date.parse(event.start) === Date.parse(invite.start) && Date.parse(event.end) === Date.parse(invite.end);
  const setEvent = (ev) => setData((d) => ({ ...d, event: ev }));

  async function respond(ev, response) {
    setBusy(true);
    let ok = false;
    try { ok = await respondToInvite(ev, response, (id, myResponse) => setEvent({ ...ev, myResponse, attendees: (ev.attendees || []).map((a) => (a.self ? { ...a, response: myResponse } : a)) })); } finally { setBusy(false); }
    if (ok && onAnswered) onAnswered();
  }
  async function propose(startISO, endISO, note) {
    setBusy(true);
    try {
      const ev = await proposeNewTime(event.id, startISO, endISO, note);
      if (ev) setEvent(ev);
      setProposing(false);
      notify('Proposta enviada ao organizador junto com a sua resposta (Talvez).', { tone: 'success' });
      if (onAnswered) onAnswered();
    } catch (e) { notify((e && e.message) || 'Não foi possível enviar a proposta.', { tone: 'error' }); } finally { setBusy(false); }
  }
  async function acceptNewTime() {
    const guests = (event.attendees || []).filter((a) => !a.self).length;
    const ok = await askConfirm({
      title: 'Mudar a reunião para o horário sugerido?',
      message: `${fmtBrWhen(invite.start, invite.end)}.${guests ? ` ${guestsWord(guests)} a alteração por e-mail.` : ''}`,
      confirmLabel: 'Mudar o horário', cancelLabel: 'Voltar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      setEvent(await rescheduleAgendaEvent(event.id, invite.start, invite.end));
      notify('Horário alterado. Os convidados foram avisados.', { tone: 'success' });
    } catch (e) { notify((e && e.message) || 'Não foi possível mudar o horário.', { tone: 'error' }); } finally { setBusy(false); }
  }
  function goAgenda() {
    const f = focusOf(data);
    if (onFocus && f) { onFocus(f, { open: true }); return; }
    requestAgendaOpen(event.id, event.start);
    onGoAgenda();
  }

  return (
    <section className={`mail-invite${invite.kind === 'cancel' ? ' cancelled' : ''}`} aria-label="Convite de reunião">
      <div className="mail-invite-head"><head.Icon size={16} aria-hidden="true" /> {head.text}</div>
      <div className="mail-invite-title">{invite.title}</div>
      {invite.kind === 'counter' ? (
        <div className="mail-invite-when">
          <div><b>Sugerido:</b> {fmtBrWhen(invite.start, invite.end, invite.allDay)}</div>
          {event && <div className="mail-invite-sub"><b>Na sua agenda:</b> {fmtBrWhen(event.start, event.end, event.allDay)}{sameTime ? ' (já é o horário sugerido)' : ''}</div>}
        </div>
      ) : (
        <div className="mail-invite-when">{fmtBrWhen(invite.start, invite.end, invite.allDay)} <span className="mail-invite-sub">(horário de Brasília)</span></div>
      )}
      {invite.location && <div className="mail-invite-sub"><b>Local:</b> {invite.location}</div>}
      {invite.organizer && (invite.organizer.email === me
        ? <div className="mail-invite-sub">Você é o organizador.</div>
        : <div className="mail-invite-sub"><b>Organizador:</b> {invite.organizer.name || invite.organizer.email}</div>)}
      {who && who.comment && <div className="mail-invite-sub">“{who.comment}”</div>}
      {invite.comment && !who && <div className="mail-invite-sub">“{invite.comment}”</div>}
      {meetLink && invite.kind !== 'cancel' && (
        <a className="ui-btn sm mail-invite-meet" href={meetLink} target="_blank" rel="noopener noreferrer"><Video size={14} aria-hidden="true" /> Entrar na reunião</a>
      )}
      <details className="mail-invite-people">
        <summary>{people.length ? `Participantes (${people.length})` : 'Participantes'}</summary>
        <AttendeeList attendees={people} organizerEmail={invite.organizer && invite.organizer.email} />
      </details>

      <div className="mail-invite-actions">
        {invite.kind === 'counter' && event && event.canEdit && !sameTime && (
          <Button size="sm" variant="primary" icon={CalendarCheck} onClick={acceptNewTime} loading={busy}>Aceitar novo horário</Button>
        )}
        {invite.kind === 'counter' && onReply && <Button size="sm" icon={Reply} onClick={onReply}>Manter e responder</Button>}
        {invited && invite.kind !== 'cancel' && (
          <>
            <RsvpButtons ev={event} onRespond={respond} busy={busy} labels={EMAIL_WORDS} />
            {!proposing && <Button size="sm" icon={CalendarClock} onClick={() => setProposing(true)} disabled={busy} disabledReason="Aguarde terminar">Propor novo horário</Button>}
          </>
        )}
        {event && (onGoAgenda || onFocus) && <Button size="sm" icon={CalendarDays} onClick={goAgenda}>{onFocus ? 'Ver na agenda ao lado' : 'Ver na agenda'}</Button>}
      </div>
      {proposing && event && (
        <ProposeTimeForm
          start={event.start} end={event.end} busy={busy} onCancel={() => setProposing(false)} onSubmit={propose}
          hint="O organizador recebe a sua proposta por e-mail, junto com a resposta “Talvez”."
        />
      )}
      {!event && invite.kind !== 'cancel' && (
        <div className="mail-invite-sub mail-invite-note">
          {calendarError || 'Este evento não está na sua agenda do Google (o convite pode ter ido para outro endereço ou já ter sido apagado).'}
        </div>
      )}
    </section>
  );
}
