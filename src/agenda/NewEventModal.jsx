// "Novo compromisso" da Agenda (Onda 5, §81). Cria no Google Calendar da pessoa (POST /api/agenda/events);
// os convidados recebem o convite do Google por e-mail. Horário de Brasília. Falha mantém o que foi digitado.
import React, { useRef, useState } from 'react';
import { Link2, X } from 'lucide-react';
import { Modal } from '../ui/dialog.jsx';
import { Button, Callout, Select } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { useDirtyForm } from '../App.jsx';
import { createAgendaEvent } from './agendaActions.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_GUESTS = 30;
const DURATIONS = [15, 30, 45, 60, 90, 120];
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

function NewEventForm({ initial, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState('60');
  const [customMin, setCustomMin] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [guests, setGuests] = useState([]);
  const [guestDraft, setGuestDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsConnect, setNeedsConnect] = useState(false);
  const asking = useRef(false);
  const guestInput = useRef(null);

  const dirty = useDirtyForm({ title, date, time, duration, customMin, location, description, guests, guestDraft });
  const minutes = duration === 'custom' ? Number(customMin) : Number(duration);

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
    if (e.key === 'Enter') { e.preventDefault(); commitDraft(); }
    else if (e.key === 'Backspace' && !guestDraft && guests.length) setGuests((cur) => cur.slice(0, -1));
  }

  async function requestClose() {
    if (busy || asking.current) return;
    if (dirty) {
      asking.current = true;
      const ok = await askConfirm({ title: 'Descartar o compromisso?', message: 'O que você preencheu será perdido.', confirmLabel: 'Descartar', cancelLabel: 'Continuar editando', danger: true });
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
      await createAgendaEvent({ title: title.trim(), date, startTime: time, durationMinutes: minutes, location: location.trim(), description: description.trim(), attendees: all });
      notify('Compromisso criado.', { tone: 'success' });
      onCreated();
    } catch (err) {
      setError((err && err.message) || 'Não foi possível criar o compromisso.');
      if (err && err.status === 409 && /conecte/i.test(err.message || '')) setNeedsConnect(true);
      setBusy(false);
    }
  }

  const invalidCount = guests.filter((g) => !EMAIL.test(g)).length;
  const end = endsAt(time, minutes);
  const reason = !title.trim() ? 'Dê um título ao compromisso' : invalidCount > 0 ? 'Corrija ou remova os e-mails inválidos' : '';

  return (
    <Modal
      title="Novo compromisso" onClose={requestClose} busy={busy} error={error}
      footer={(
        <>
          <Button onClick={requestClose} disabled={busy} disabledReason="Aguarde terminar">Cancelar</Button>
          <Button type="submit" form="agenda-new-event" variant="primary" loading={busy} disabled={!!reason} disabledReason={reason}>Criar compromisso</Button>
        </>
      )}
    >
      <form id="agenda-new-event" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {needsConnect && (
          <Callout tone="info" icon={Link2} title="Google Calendar não conectado" action={<a className="ui-btn primary sm" href="/api/google/oauth/start">Conectar Google</a>}>
            Conecte a sua conta e tente de novo. O que você digitou fica aqui.
          </Callout>
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
        <label style={label}>
          Local <span style={{ fontWeight: 500, color: 'var(--text-5)' }}>(opcional)</span>
          <input className="ui-input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} placeholder="Endereço ou link da videochamada" />
        </label>
        <label style={label}>
          Descrição <span style={{ fontWeight: 500, color: 'var(--text-5)' }}>(opcional)</span>
          <textarea className="ui-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} style={{ resize: 'vertical' }} />
        </label>
        <div style={label}>
          <label htmlFor="agenda-guests">Convidados <span style={{ fontWeight: 500, color: 'var(--text-5)' }}>(opcional, até {MAX_GUESTS})</span></label>
          <div
            onClick={() => guestInput.current && guestInput.current.focus()}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 6, minHeight: 40, border: '1px solid var(--border-3)', borderRadius: 10, background: 'var(--bg-1)', cursor: 'text' }}
          >
            {guests.map((g) => {
              const ok = EMAIL.test(g);
              return (
                <span
                  key={g} title={ok ? g : `"${g}" não parece um e-mail válido`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 4px 3px 9px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, border: `1px solid ${ok ? 'var(--border-2)' : 'var(--ui-danger)'}`, background: ok ? 'var(--bg-3)' : 'rgba(226,87,76,.12)', color: ok ? 'var(--text-2)' : 'var(--ui-danger)' }}
                >
                  {g}{!ok && <span className="ui-sr"> (e-mail inválido)</span>}
                  <button
                    type="button" aria-label={`Remover convidado ${g}`} title={`Remover ${g}`}
                    onClick={(e) => { e.stopPropagation(); setGuests((cur) => cur.filter((x) => x !== g)); }}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, border: 'none', borderRadius: '50%', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0 }}
                  ><X size={12} aria-hidden="true" /></button>
                </span>
              );
            })}
            <input
              id="agenda-guests" ref={guestInput} type="text" inputMode="email" autoComplete="off" value={guestDraft}
              onChange={(e) => onGuestChange(e.target.value)} onKeyDown={onGuestKey} onBlur={commitDraft}
              placeholder={guests.length ? '' : 'nome@empresa.com.br'}
              style={{ flex: '1 1 160px', minWidth: 120, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, padding: '4px 6px' }}
            />
          </div>
          <div style={hint}>
            Separe os e-mails por vírgula ou Enter. Os convidados recebem o convite do Google por e-mail.
            {guests.length > 0 && <> {guests.length}/{MAX_GUESTS}.</>}
          </div>
          {invalidCount > 0 && <div style={{ ...hint, color: 'var(--ui-danger)' }} role="status">{invalidCount === 1 ? '1 e-mail parece inválido' : `${invalidCount} e-mails parecem inválidos`}: corrija ou remova antes de criar.</div>}
          {guests.length > MAX_GUESTS && <div style={{ ...hint, color: 'var(--ui-danger)' }} role="status">Limite de {MAX_GUESTS} convidados: remova {guests.length - MAX_GUESTS}.</div>}
        </div>
      </form>
    </Modal>
  );
}

export default function NewEventModal({ initial, connected, onClose, onCreated }) {
  if (connected === false) return <ConnectNeeded onClose={onClose} />;
  return <NewEventForm initial={initial || defaultSlot()} onClose={onClose} onCreated={onCreated} />;
}
