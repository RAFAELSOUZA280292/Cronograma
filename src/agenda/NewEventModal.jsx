// "Novo compromisso" e "Editar" da Agenda (Onda 5, §81; edição, Meet, lembrete e sugestão de contatos em 2026-11-02). Grava no Google
// Calendar da pessoa (POST/PATCH /api/agenda/events); os convidados recebem o convite (ou a alteração) por e-mail. Horário de Brasília.
// Falha mantém o que foi digitado.
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Link2, Video, X } from 'lucide-react';
import { Modal } from '../ui/dialog.jsx';
import { Button, Callout, Select } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { useDirtyForm } from '../App.jsx';
import { apiGet } from '../lib/api.js';
import { createAgendaEvent, updateAgendaEvent, brParts, brIso } from './agendaActions.js';
import { conflictsWith } from '../../shared/agendaConflicts.js';
import './agenda.css';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_GUESTS = 30;
const DURATIONS = [15, 30, 45, 60, 90, 120];
export const REMINDER_OPTIONS = [['', 'Padrão da agenda'], ['-1', 'Sem lembrete'], ['0', 'Na hora'], ['5', '5 min antes'], ['10', '10 min antes'], ['15', '15 min antes'], ['30', '30 min antes'], ['60', '1 hora antes'], ['120', '2 horas antes'], ['1440', '1 dia antes']];
const SEPARATORS = /[,;\s]+/;

const pad2 = (n) => String(n).padStart(2, '0');
const label = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)' };
const hint = { fontSize: 11.5, fontWeight: 500, color: 'var(--text-5)', lineHeight: 1.4 };

// Hoje + próxima hora cheia (usado quando não veio de um horário clicado).
export function defaultSlot() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, time: `${pad2(d.getHours())}:00` };
}

function endsAt(time, minutes) {
  const m = /^(\d{2}):(\d{2})$/.exec(time || '');
  if (!m || !(minutes >= 5)) return '';
  const total = Number(m[1]) * 60 + Number(m[2]) + minutes;
  if (total >= 24 * 60) return '';
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function ConnectNeeded({ onClose, message }) {
  return (
    <Modal title="Novo compromisso" onClose={onClose} size="sm" footer={<Button onClick={onClose}>Fechar</Button>}>
      <Callout
        tone="info" icon={Link2} title="Conecte o seu Google Calendar para criar compromissos"
        action={<a className="ui-btn primary sm" href="/api/google/oauth/start">Conectar Google</a>}
      >
        {message || 'Os compromissos são criados no seu Google Calendar, e os convidados recebem o convite por e-mail.'}
      </Callout>
    </Modal>
  );
}

// Valores iniciais: horário clicado (novo) ou o evento que está sendo editado.
function startValues(initial, event) {
  if (!event) return { title: initial.title || '', date: initial.date, time: initial.time, duration: '60', customMin: '', location: '', description: '', guests: initial.guests || [], meet: true, reminder: '' };
  const s = brParts(event.start);
  const mins = Math.round((new Date(event.end) - new Date(event.start)) / 60000);
  const preset = DURATIONS.includes(mins);
  return {
    title: event.title || '', date: s.date, time: s.time,
    duration: preset ? String(mins) : 'custom', customMin: preset ? '' : String(mins),
    location: event.location || '', description: event.description || '',
    guests: (event.attendees || []).filter((a) => !a.self).map((a) => a.email),
    meet: !!event.meetLink, reminder: event.reminderMinutes === null || event.reminderMinutes === undefined ? '' : String(event.reminderMinutes),
  };
}

const MEET_LABEL = { meet: 'Criar link do Google Meet', teams: 'Criar reunião no Microsoft Teams' };

function NewEventForm({ initial, event, accounts, events, onClose, onCreated }) {
  const v0 = useRef(startValues(initial, event)).current;
  const editing = !!event;
  // Em qual agenda gravar (§128): na edição, a do próprio evento; no novo, a principal (ou a primeira que aceita escrita).
  const options = (accounts && accounts.length) ? accounts : [{ id: 'principal', label: 'Agenda principal (Google)', color: '#5B8DEF', meet: 'meet' }];
  const [accountId, setAccountId] = useState(() => (event ? (event.account || 'principal') : (options[0] && options[0].id) || 'principal'));
  const acc = options.find((a) => a.id === accountId) || { id: accountId, label: event && event.accountLabel, color: event && event.color, meet: event && event.source === 'microsoft' ? 'teams' : 'meet' };
  const meetKind = acc.id === 'principal' ? 'meet' : (acc.meet || 'none');
  const [title, setTitle] = useState(v0.title);
  const [date, setDate] = useState(v0.date);
  const [time, setTime] = useState(v0.time);
  const [duration, setDuration] = useState(v0.duration);
  const [customMin, setCustomMin] = useState(v0.customMin);
  const [location, setLocation] = useState(v0.location);
  const [description, setDescription] = useState(v0.description);
  const [guests, setGuests] = useState(v0.guests);
  const [meet, setMeet] = useState(v0.meet);
  const [reminder, setReminder] = useState(v0.reminder);
  const [sugg, setSugg] = useState([]);
  const [suggActive, setSuggActive] = useState(0);
  const suggSeq = useRef(0);
  const [guestDraft, setGuestDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsConnect, setNeedsConnect] = useState(false);
  const asking = useRef(false);
  const guestInput = useRef(null);

  const dirty = useDirtyForm({ title, date, time, duration, customMin, location, description, guests, guestDraft, meet, reminder });
  const minutes = duration === 'custom' ? Number(customMin) : Number(duration);
  // Conflito com o que já está em qualquer agenda visível (aviso, não impede).
  const clash = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !(minutes >= 5)) return [];
    const startISO = brIso(date, time);
    return conflictsWith(startISO, new Date(Date.parse(startISO) + minutes * 60000).toISOString(), events || [], event && event.id);
  })();

  function addGuests(tokens) {
    const wanted = tokens.map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (!wanted.length) return;
    setGuests((cur) => {
      const next = [...cur];
      for (const t of wanted) if (!next.includes(t)) next.push(t);
      return next;
    });
    setError('');
  }
  // Sugestão de contatos (Gmail + CRM, a mesma da Caixa de e-mail). Sem Gmail conectado a lista fica vazia, sem aviso.
  useEffect(() => {
    const q = guestDraft.trim();
    if (q.length < 2) { setSugg([]); return undefined; }
    const n = ++suggSeq.current;
    const t = setTimeout(() => {
      apiGet(`/api/mail/contacts?q=${encodeURIComponent(q)}`)
        .then((d) => { if (n === suggSeq.current) { setSugg((d.contacts || []).filter((c) => !guests.includes(c.email)).slice(0, 8)); setSuggActive(0); } })
        .catch(() => { if (n === suggSeq.current) setSugg([]); });
    }, 180);
    return () => clearTimeout(t);
  }, [guestDraft, guests]);
  function pickSugg(c) {
    addGuests([c.email]); setGuestDraft(''); setSugg([]);
    if (guestInput.current) guestInput.current.focus();
  }

  function onGuestChange(v) {
    if (!SEPARATORS.test(v)) { setGuestDraft(v); return; }
    const parts = v.split(SEPARATORS);
    const endsWithSep = SEPARATORS.test(v.slice(-1));
    const tail = endsWithSep ? '' : parts.pop();
    addGuests(parts);
    setGuestDraft(tail || '');
  }
  function commitDraft() {
    if (guestDraft.trim()) { addGuests([guestDraft]); setGuestDraft(''); }
  }
  function onGuestKey(e) {
    if (sugg.length && e.key === 'ArrowDown') { e.preventDefault(); setSuggActive((a) => (a + 1) % sugg.length); return; }
    if (sugg.length && e.key === 'ArrowUp') { e.preventDefault(); setSuggActive((a) => (a - 1 + sugg.length) % sugg.length); return; }
    if (sugg.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pickSugg(sugg[suggActive]); return; }
    if (sugg.length && e.key === 'Escape') { e.stopPropagation(); setSugg([]); return; }
    if (e.key === 'Enter') { e.preventDefault(); commitDraft(); }
    else if (e.key === 'Backspace' && !guestDraft && guests.length) setGuests((cur) => cur.slice(0, -1));
  }

  async function requestClose() {
    if (busy || asking.current) return;
    if (dirty) {
      asking.current = true;
      const ok = await askConfirm({ title: editing ? 'Descartar as alterações?' : 'Descartar o compromisso?', message: editing ? 'O que você mudou não será salvo.' : 'O que você preencheu será perdido.', confirmLabel: 'Descartar', cancelLabel: 'Continuar editando', danger: true });
      asking.current = false;
      if (!ok) return;
    }
    onClose();
  }

  async function submit(e) {
    if (e) e.preventDefault();
    if (busy) return;
    setNeedsConnect(false);
    const all = [...guests];
    const draft = guestDraft.trim().toLowerCase();
    if (draft && !all.includes(draft)) all.push(draft);
    if (!title.trim()) { setError('Dê um título ao compromisso.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Informe a data do compromisso.'); return; }
    if (!/^\d{2}:\d{2}$/.test(time)) { setError('Informe a hora de início.'); return; }
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 720) { setError('A duração precisa ficar entre 5 minutos e 12 horas.'); return; }
    if (all.some((g) => !EMAIL.test(g))) { setError('Corrija ou remova os e-mails destacados em vermelho.'); return; }
    if (all.length > MAX_GUESTS) { setError(`No máximo ${MAX_GUESTS} convidados.`); return; }
    commitDraft();
    setError(''); setBusy(true);
    try {
      const payload = { title: title.trim(), date, startTime: time, durationMinutes: minutes, location: location.trim(), description: description.trim(), attendees: all, meet: meet && meetKind !== 'none', reminderMinutes: reminder === '' ? null : Number(reminder), accountId };
      const res = editing ? await updateAgendaEvent(event.id, payload) : await createAgendaEvent(payload);
      const sent = all.length ? ' Os convidados receberam o convite por e-mail.' : '';
      notify(editing ? `Compromisso atualizado.${all.length ? ' Os convidados foram avisados.' : ''}` : `Compromisso criado.${sent}`, { tone: 'success' });
      onCreated(res && res.event);
    } catch (err) {
      setError((err && err.message) || (editing ? 'Não foi possível salvar o compromisso.' : 'Não foi possível criar o compromisso.'));
      if (err && err.status === 409 && /conecte/i.test(err.message || '')) setNeedsConnect(true);
      setBusy(false);
    }
  }

  const invalidCount = guests.filter((g) => !EMAIL.test(g)).length;
  const end = endsAt(time, minutes);
  const reason = !title.trim() ? 'Dê um título ao compromisso' : invalidCount > 0 ? 'Corrija ou remova os e-mails inválidos' : '';

  return (
    <Modal
      title={editing ? 'Editar compromisso' : 'Novo compromisso'} onClose={requestClose} busy={busy} error={error}
      footer={(
        <>
          <Button onClick={requestClose} disabled={busy} disabledReason="Aguarde terminar">Cancelar</Button>
          <Button type="submit" form="agenda-new-event" variant="primary" loading={busy} disabled={!!reason} disabledReason={reason}>{editing ? 'Salvar' : 'Criar compromisso'}</Button>
        </>
      )}
    >
      <form id="agenda-new-event" className="agd-form" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {needsConnect && (
          <Callout tone="info" icon={Link2} title="Google Calendar não conectado" action={<a className="ui-btn primary sm" href="/api/google/oauth/start">Conectar Google</a>}>
            Conecte a sua conta e tente de novo. O que você digitou fica aqui.
          </Callout>
        )}
        {(options.length > 1 || editing) && (
          <label style={label}>
            Agenda
            <div className="agd-acc-pick">
              <span className="agd-acc-dot" style={{ background: acc.color || '#999' }} aria-hidden="true" />
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={editing} style={{ flex: 1 }}>
                {options.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                {editing && !options.some((a) => a.id === accountId) && <option value={accountId}>{acc.label || 'Agenda do evento'}</option>}
              </Select>
            </div>
            {editing && <span style={hint}>O compromisso fica na agenda em que foi criado.</span>}
          </label>
        )}
        <label style={label}>
          Título
          <input className="ui-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus placeholder="Ex.: Reunião de alinhamento com o cliente" />
        </label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...label, flex: '1 1 150px' }}>
            Data
            <input className="ui-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label style={{ ...label, flex: '1 1 120px' }}>
            Início
            <input className="ui-input" type="time" step="900" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label style={{ ...label, flex: '1 1 150px' }}>
            Duração
            <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
              {DURATIONS.map((m) => <option key={m} value={String(m)}>{m} min</option>)}
              <option value="custom">Outra duração…</option>
            </Select>
          </label>
        </div>
        {duration === 'custom' && (
          <label style={label}>
            Duração em minutos
            <input className="ui-input" type="number" min={5} max={720} step={5} value={customMin} onChange={(e) => setCustomMin(e.target.value)} placeholder="Ex.: 75" />
          </label>
        )}
        <div style={hint}>Horário de Brasília{end ? ` · termina às ${end}` : ''}.</div>
        {clash.length > 0 && (
          <div className="agd-conflict" role="status">
            <AlertTriangle size={14} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
            <span>Choca com {clash.slice(0, 3).map((c) => `“${c.title}”${c.accountLabel ? ` (${c.accountLabel})` : ''}`).join(', ')}{clash.length > 3 ? ` e mais ${clash.length - 3}` : ''}. Você pode criar assim mesmo.</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {meetKind !== 'none' && (
            <label className="agd-check" style={{ flex: '1 1 220px' }}>
              <input type="checkbox" checked={meet} disabled={editing && !!event.meetLink} onChange={(e) => setMeet(e.target.checked)} />
              <Video size={15} aria-hidden="true" />
              <span>{editing && event.meetLink ? 'Já tem link da reunião' : MEET_LABEL[meetKind]}</span>
            </label>
          )}
          <label style={{ ...label, flex: '1 1 180px' }}>
            Lembrete
            <Select value={reminder} onChange={(e) => setReminder(e.target.value)}>
              {REMINDER_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </label>
        </div>
        <label style={label}>
          Local <span style={{ fontWeight: 500, color: 'var(--text-5)' }}>(opcional)</span>
          <input className="ui-input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} placeholder={meet && meetKind !== 'none' ? 'Opcional: o link da reunião já vai no convite' : 'Endereço ou link da videochamada'} />
        </label>
        <label style={label}>
          Descrição <span style={{ fontWeight: 500, color: 'var(--text-5)' }}>(opcional)</span>
          <textarea className="ui-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} style={{ resize: 'vertical' }} />
        </label>
        <div style={label}>
          <label htmlFor="agenda-guests">Convidados <span style={{ fontWeight: 500, color: 'var(--text-5)' }}>(opcional, até {MAX_GUESTS})</span></label>
          <div className="agd-guests" onClick={() => guestInput.current && guestInput.current.focus()}>
            {guests.map((g) => {
              const ok = EMAIL.test(g);
              return (
                <span key={g} title={ok ? g : `"${g}" não parece um e-mail válido`} className={`agd-guest${ok ? '' : ' bad'}`}>
                  {g}{!ok && <span className="ui-sr"> (e-mail inválido)</span>}
                  <button
                    type="button" className="agd-guest-x" aria-label={`Remover convidado ${g}`} title={`Remover ${g}`}
                    onClick={(e) => { e.stopPropagation(); setGuests((cur) => cur.filter((x) => x !== g)); }}
                  ><X size={12} aria-hidden="true" /></button>
                </span>
              );
            })}
            <input
              id="agenda-guests" ref={guestInput} className="agd-guest-input" type="text" inputMode="email" autoComplete="off" value={guestDraft}
              onChange={(e) => onGuestChange(e.target.value)} onKeyDown={onGuestKey} onBlur={commitDraft}
              placeholder={guests.length ? '' : 'Nome ou e-mail'}
              role="combobox" aria-expanded={sugg.length > 0} aria-controls="agenda-guests-sug" aria-autocomplete="list"
              aria-activedescendant={sugg.length ? `agenda-guests-sug-${suggActive}` : undefined}
            />
          </div>
          {sugg.length > 0 && (
            <ul className="agd-sug" id="agenda-guests-sug" role="listbox" aria-label="Sugestões de convidado">
              {sugg.map((c, i) => (
                <li
                  key={c.email} id={`agenda-guests-sug-${i}`} role="option" aria-selected={i === suggActive} className={i === suggActive ? 'on' : ''}
                  onMouseDown={(e) => { e.preventDefault(); pickSugg(c); }} onMouseEnter={() => setSuggActive(i)}
                >
                  <span className="agd-sug-name">{c.name || c.email}</span>
                  {c.name && <span className="agd-sug-mail">{c.email}</span>}
                  {c.source === 'crm' && <span className="agd-sug-tag">CRM</span>}
                </li>
              ))}
            </ul>
          )}
          <div style={hint}>
            Digite o nome ou o e-mail; separe por vírgula ou Enter. Os convidados recebem o convite por e-mail{editing ? ' (e a alteração, se você mudar algo)' : ''}.
            {guests.length > 0 && <> {guests.length}/{MAX_GUESTS}.</>}
          </div>
          {invalidCount > 0 && <div style={{ ...hint, color: 'var(--ui-danger)' }} role="status">{invalidCount === 1 ? '1 e-mail parece inválido' : `${invalidCount} e-mails parecem inválidos`}: corrija ou remova antes de criar.</div>}
          {guests.length > MAX_GUESTS && <div style={{ ...hint, color: 'var(--ui-danger)' }} role="status">Limite de {MAX_GUESTS} convidados: remova {guests.length - MAX_GUESTS}.</div>}
        </div>
      </form>
    </Modal>
  );
}

export default function NewEventModal({ initial, event, connected, accounts, events, onClose, onCreated }) {
  if (connected === false && !event && !(accounts && accounts.length)) return <ConnectNeeded onClose={onClose} />;
  return <NewEventForm initial={initial || defaultSlot()} event={event} accounts={accounts} events={events} onClose={onClose} onCreated={onCreated} />;
}
