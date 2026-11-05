// Detalhe do compromisso do Google dentro do painel (2026-11-02, "nunca mais abrir o Google Agenda"): Meet, participantes com a
// resposta de cada um, responder (Sim/Talvez/Não), propor outro horário, editar e cancelar. As peças `AttendeeList` e `ProposeTimeForm`
// também servem o cartão de convite da Caixa de e-mail (src/mail/InviteCard.jsx).
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Ban, CalendarClock, Copy, Lock, Mail, Pencil, Repeat, Trash2, Video } from 'lucide-react';
import { Modal } from '../ui/dialog.jsx';
import { Button, Callout, Select, Skeleton } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import RsvpButtons from './RsvpButtons.jsx';
import { canRespond, getAgendaEvent, cancelAgendaEvent, proposeNewTime, brParts, brIso, fmtBrWhen, guestsWord } from './agendaActions.js';
import { RSVP_META } from './dayLoad.js';
import { attendeePeople, attendeesCopyText, attendeesMailto } from './attendeeMail.js';
import './agenda.css';

const RESP = {
  accepted: { label: 'Sim', cls: 'yes' },
  tentative: { label: 'Talvez', cls: 'maybe' },
  declined: { label: 'Não', cls: 'no' },
  needsAction: { label: 'Sem resposta', cls: 'none' },
};

export function responseCounts(attendees) {
  const c = { accepted: 0, tentative: 0, declined: 0, needsAction: 0 };
  for (const a of attendees || []) c[a.response in c ? a.response : 'needsAction'] += 1;
  return [c.accepted && `${c.accepted} sim`, c.tentative && `${c.tentative} talvez`, c.declined && `${c.declined} não`, c.needsAction && `${c.needsAction} sem resposta`].filter(Boolean).join(' · ');
}

// `subject` (nome da agenda): mostra "Copiar e-mails" e "E-mail para todos" (§167).
export function AttendeeList({ attendees, organizerEmail, subject }) {
  if (!attendees || !attendees.length) return null;
  const all = attendeePeople(attendees);
  const mailto = subject !== undefined ? attendeesMailto(attendees, subject) : '';
  async function copy() {
    const text = attendeesCopyText(attendees);
    try { await navigator.clipboard.writeText(text); notify(`${all.length} ${all.length === 1 ? 'e-mail copiado' : 'e-mails copiados'}. É só colar no Para.`, { tone: 'success' }); } catch { notify(`Não foi possível copiar. Copie à mão: ${text}`, { tone: 'error', ttlMs: 15000 }); }
  }
  return (
    <div className="agd-people">
      <div className="agd-people-head">
        Participantes <span>{responseCounts(attendees)}</span>
        {subject !== undefined && all.length > 0 && (
          <span className="agd-people-acts">
            <button type="button" className="agd-people-btn" onClick={copy} title="Copiar os e-mails de todos os participantes"><Copy size={13} aria-hidden="true" /> Copiar e-mails</button>
            {mailto && <a className="agd-people-btn" href={mailto} title={`Escrever para todos os participantes com o assunto “${subject}”`}><Mail size={13} aria-hidden="true" /> E-mail para todos</a>}
          </span>
        )}
      </div>
      <ul>
        {attendees.map((a) => {
          const r = RESP[a.response] || RESP.needsAction;
          return (
            <li key={a.email}>
              <span className="agd-person">
                <span className="agd-person-name">{a.name || a.email}{a.self ? ' (você)' : ''}</span>
                {(a.organizer || a.email === organizerEmail) && <span className="agd-person-tag">organizador</span>}
                {a.optional && <span className="agd-person-tag">opcional</span>}
                {a.name && <span className="agd-person-mail">{a.email}</span>}
                {a.comment && <span className="agd-person-note">“{a.comment}”</span>}
              </span>
              <span className={`agd-resp ${r.cls}`}>{r.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Outro horário: data, início e duração (Brasília) + nota. `onSubmit(startISO, endISO, note)`.
export function ProposeTimeForm({ start, end, onSubmit, onCancel, busy, submitLabel = 'Enviar proposta', hint }) {
  const s = brParts(start);
  const mins0 = Math.max(15, Math.round((new Date(end) - new Date(start)) / 60000) || 60);
  const [date, setDate] = useState(s.date);
  const [time, setTime] = useState(s.time);
  const [mins, setMins] = useState(String([15, 30, 45, 60, 90, 120].includes(mins0) ? mins0 : 60));
  const [note, setNote] = useState('');
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
  function submit(e) {
    e.preventDefault();
    if (!ok || busy) return;
    const startISO = brIso(date, time);
    onSubmit(startISO, new Date(Date.parse(startISO) + Number(mins) * 60000).toISOString(), note.trim());
  }
  return (
    <form className="agd-propose agd-form" onSubmit={submit}>
      <div className="agd-propose-row">
        <label>Data<input className="ui-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Início<input className="ui-input" type="time" step="900" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <label>Duração
          <Select value={mins} onChange={(e) => setMins(e.target.value)}>
            {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={String(m)}>{m} min</option>)}
          </Select>
        </label>
      </div>
      <label>Mensagem <span className="agd-opt">(opcional)</span>
        <input className="ui-input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: Nesse horário tenho outra reunião." />
      </label>
      {hint && <div className="agd-hint">{hint}</div>}
      <div className="agd-propose-actions">
        <Button size="sm" onClick={onCancel} disabled={busy} disabledReason="Aguarde terminar">Cancelar</Button>
        <Button size="sm" type="submit" variant="primary" loading={busy} disabled={!ok} disabledReason="Informe data e hora">{submitLabel}</Button>
      </div>
    </form>
  );
}

const meetLabel = (url) => (/meet\.google\.com/i.test(url) ? 'Entrar no Google Meet' : /teams\.(microsoft|live)\.com/i.test(url) ? 'Entrar no Microsoft Teams' : 'Entrar na reunião');

export default function EventDetailModal({ id, initial, conflicts, onClose, onRespond, respondBusy, onEdit, onChanged }) {
  // Link iCal (§128) é só leitura: não há detalhe no provedor para buscar, o que veio na lista é tudo.
  const readOnly = !!(initial && initial.readOnly);
  const [ev, setEv] = useState(initial && (initial.attendees || readOnly) ? initial : null);
  const [error, setError] = useState('');
  const [proposing, setProposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = ev || initial;

  useEffect(() => {
    if (readOnly) return undefined;
    let alive = true;
    getAgendaEvent(id).then((d) => { if (alive) { setEv(d); setError(''); } }).catch((e) => { if (alive) setError((e && e.message) || 'Não consegui abrir o compromisso.'); });
    return () => { alive = false; };
  }, [id, readOnly]);

  // A resposta otimista da lista (RsvpButtons) também vale aqui.
  useEffect(() => {
    if (initial && ev && initial.myResponse !== ev.myResponse) setEv((cur) => ({ ...cur, myResponse: initial.myResponse, attendees: (cur.attendees || []).map((a) => (a.self ? { ...a, response: initial.myResponse } : a)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial && initial.myResponse]);

  async function respondHere(e, r) {
    await onRespond(e, r);
    getAgendaEvent(id).then(setEv).catch(() => {});
  }
  async function propose(startISO, endISO, note) {
    setBusy(true);
    try {
      const d = await proposeNewTime(id, startISO, endISO, note);
      if (d) setEv(d);
      setProposing(false);
      notify('Proposta enviada ao organizador junto com a sua resposta (Talvez).', { tone: 'success' });
      if (onChanged) onChanged();
    } catch (e) { notify((e && e.message) || 'Não foi possível enviar a proposta.', { tone: 'error' }); } finally { setBusy(false); }
  }
  async function cancelIt() {
    const guests = ((ev && ev.attendees) || []).filter((a) => !a.self).length;
    const ok = await askConfirm({ title: 'Cancelar esta reunião?', message: guests ? `${guestsWord(guests)} o cancelamento por e-mail.` : 'O compromisso sai da sua agenda.', confirmLabel: 'Cancelar reunião', cancelLabel: 'Manter', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await cancelAgendaEvent(id);
      notify('Reunião cancelada.', { tone: 'success' });
      if (onChanged) onChanged();
      onClose();
    } catch (e) { notify((e && e.message) || 'Não foi possível cancelar.', { tone: 'error' }); setBusy(false); }
  }

  if (!base) {
    return (
      <Modal title="Compromisso" onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}>
        {error ? <Callout tone="danger" icon={Ban}>{error}</Callout> : <Skeleton height={80} />}
      </Modal>
    );
  }
  const invited = canRespond(base);
  return (
    <Modal
      title={base.title} subtitle={fmtBrWhen(base.start, base.end, base.allDay)} onClose={onClose} busy={busy}
      footer={(
        <>
          {ev && ev.isOrganizer && ev.status !== 'cancelled' && <Button icon={Trash2} onClick={cancelIt} disabled={busy} disabledReason="Aguarde terminar">Cancelar reunião</Button>}
          {/* Dia inteiro não abre o formulário (ele só sabe horário: salvar dava erro de duração ou virava evento no dia anterior). */}
          {ev && ev.canEdit && !base.allDay && ev.status !== 'cancelled' && <Button icon={Pencil} onClick={() => onEdit(ev)} disabled={busy} disabledReason="Aguarde terminar">Editar</Button>}
          <Button onClick={onClose}>Fechar</Button>
        </>
      )}
    >
      <div className="agd-detail">
        {base.accountLabel && (
          <div className="agd-acc-pick agd-muted">
            <span className="agd-acc-dot" style={{ background: base.color || '#999' }} aria-hidden="true" />
            Agenda: <b>{base.accountLabel}</b>{base.privacy === 'particular' && <><Lock size={12} aria-hidden="true" /> particular</>}{readOnly && ' · só leitura (link iCal)'}
          </div>
        )}
        {conflicts && conflicts.length > 0 && (
          <div className="agd-conflict" role="status">
            <AlertTriangle size={14} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
            <span>Choca com {conflicts.slice(0, 3).map((c) => `“${c.title}”${c.accountLabel ? ` (${c.accountLabel})` : ''}`).join(', ')}{conflicts.length > 3 ? ` e mais ${conflicts.length - 3}` : ''}.</span>
          </div>
        )}
        {base.status === 'cancelled' && <Callout tone="danger" icon={Ban}>Este compromisso foi cancelado.</Callout>}
        {error && <Callout tone="danger" icon={Ban}>{error}</Callout>}
        {ev && ev.meetLink && (
          <a className="ui-btn primary agd-meet" href={ev.meetLink} target="_blank" rel="noopener noreferrer">
            <Video size={16} aria-hidden="true" /> {meetLabel(ev.meetLink)}
          </a>
        )}
        {ev && ev.meetLink && <div className="agd-hint">{ev.meetLink.replace(/^https:\/\//, '')}</div>}
        {base.location && <div><b>Local:</b> {base.location}</div>}
        {ev && !ev.isOrganizer && ev.organizerName && <div><b>Organizador:</b> {ev.organizerName}</div>}
        {ev && ev.isOrganizer && <div className="agd-muted">Você é o organizador.</div>}
        {ev && ev.recurring && <div className="agd-muted"><Repeat size={13} aria-hidden="true" /> Reunião que se repete: o que você mudar aqui vale só para esta data.</div>}
        {base.description && <div className="agd-desc">{base.description}</div>}
        {readOnly && base.organizer && <div><b>Organizador:</b> {base.organizer}</div>}
        {readOnly ? null : ev ? <AttendeeList attendees={ev.attendees} organizerEmail={ev.organizerEmail} subject={base.title || ''} /> : <Skeleton height={60} />}
        {invited && (
          <div className="agd-answer">
            <div className="agd-answer-head">Sua resposta: {RSVP_META[base.myResponse === 'needsAction' ? 'pending' : base.myResponse] ? RSVP_META[base.myResponse === 'needsAction' ? 'pending' : base.myResponse].label : 'Sem resposta'}</div>
            <RsvpButtons ev={base} onRespond={respondHere} busy={respondBusy || busy} />
            {!proposing && <Button size="sm" icon={CalendarClock} onClick={() => setProposing(true)} disabled={busy} disabledReason="Aguarde terminar">Propor novo horário</Button>}
            {proposing && (
              <ProposeTimeForm
                start={base.start} end={base.end} busy={busy} onCancel={() => setProposing(false)} onSubmit={propose}
                hint={base.source === 'microsoft' ? 'O organizador recebe a proposta de novo horário pelo Outlook, junto com a resposta “Talvez”.' : 'O organizador recebe a sua proposta por e-mail, junto com a resposta “Talvez”.'}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
