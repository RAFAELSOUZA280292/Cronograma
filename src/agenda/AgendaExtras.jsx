// Peças da Agenda "como a do Google", parte 2 (2026-11-02, §138): Criar › Tarefa e Ausente, detalhe de tarefa e de compromisso de
// colega, seletor de cor livre das agendas e resultados da busca. Tudo grava no Google da própria pessoa (rotas /api/agenda/*).
import React, { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, Trash2, Search, ArrowLeft, Plane, ListTodo, Video } from 'lucide-react';
import { Modal } from '../ui/dialog.jsx';
import { Button, Callout } from '../ui/index.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';
import { apiDelete, apiPatch, apiPost } from '../lib/api.js';
import { useDirtyForm } from '../App.jsx';
import { fmtBrWhen, brIso } from './agendaActions.js';
import { AttendeeList, meetLabel } from './EventDetail.jsx';
import { tidyDescription } from './describe.js';
import './agenda.css';

const label = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)' };
const hint = { fontSize: 11.5, fontWeight: 500, color: 'var(--text-5)', lineHeight: 1.4 };
const pad2 = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

// Mensagem do servidor quando falta reconectar o Google ou ligar a API de Tarefas: aparece dentro da janela, com o que fazer.
function GoogleFix({ error }) {
  if (!error) return null;
  if (error.code === 'needs_reconnect') return <Callout tone="info" title="Falta um passo no Google" action={<a className="ui-btn primary sm" href="/api/google/oauth/start">Reconectar o Google</a>}>{error.message}</Callout>;
  return null;
}

export function TaskModal({ initialDate, onClose, onDone }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate || today());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const dirty = useDirtyForm({ title, date, notes });
  async function close() {
    if (busy) return;
    if (dirty && !(await askConfirm({ title: 'Descartar a tarefa?', message: 'O que você preencheu será perdido.', confirmLabel: 'Descartar', cancelLabel: 'Continuar editando', danger: true }))) return;
    onClose();
  }
  async function save(e) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      await apiPost('/api/agenda/tasks', { title: title.trim(), date, notes: notes.trim() });
      notify('Tarefa criada nas suas Tarefas do Google.', { tone: 'success' });
      onDone();
    } catch (err) { setError({ message: (err && err.message) || 'Não foi possível criar a tarefa.', code: err && err.data && err.data.code }); setBusy(false); }
  }
  return (
    <Modal
      title="Nova tarefa" onClose={close} busy={busy} error={error && !error.code ? error.message : ''}
      footer={<><Button onClick={close} disabled={busy} disabledReason="Aguarde terminar">Cancelar</Button><Button type="submit" form="agenda-task" variant="primary" icon={ListTodo} loading={busy} disabled={!title.trim()} disabledReason="Dê um título à tarefa">Criar tarefa</Button></>}
    >
      <form id="agenda-task" className="agd-form" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && error.code && (error.code === 'needs_reconnect' ? <GoogleFix error={error} /> : <Callout tone="warn" title="Tarefas do Google desligadas">{error.message}</Callout>)}
        <label style={label}>Título<input className="ui-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus placeholder="Ex.: Mandar a proposta da DELAVAL" /></label>
        <label style={label}>Prazo<input className="ui-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label style={label}>Detalhes <span style={{ fontWeight: 500, color: 'var(--text-5)' }}>(opcional)</span><textarea className="ui-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} style={{ resize: 'vertical' }} /></label>
        <div style={hint}>Vai para as suas Tarefas do Google (as mesmas do Gmail e do celular) e aparece na agenda no dia do prazo.</div>
      </form>
    </Modal>
  );
}

export function AwayModal({ initialDate, onClose, onDone }) {
  const d0 = initialDate || today();
  const [startDate, setStartDate] = useState(d0);
  const [startTime, setStartTime] = useState('08:00');
  const [endDate, setEndDate] = useState(d0);
  const [endTime, setEndTime] = useState('18:00');
  const [decline, setDecline] = useState(true);
  const [message, setMessage] = useState('Estou ausente neste período e retorno em breve. Recuso este convite automaticamente; se for urgente, me procure por e-mail.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      await apiPost('/api/agenda/out-of-office', { start: brIso(startDate, startTime), end: brIso(endDate, endTime), autoDecline: decline, message: decline ? message.trim() : '' });
      notify(decline ? 'Ausência marcada. Convites nesse período serão recusados com a sua mensagem.' : 'Ausência marcada na sua agenda.', { tone: 'success' });
      onDone();
    } catch (err) { setError((err && err.message) || 'Não foi possível marcar a ausência.'); setBusy(false); }
  }
  return (
    <Modal
      title="Ausente (fora do escritório)" onClose={onClose} busy={busy} error={error}
      footer={<><Button onClick={onClose} disabled={busy} disabledReason="Aguarde terminar">Cancelar</Button><Button type="submit" form="agenda-away" variant="primary" icon={Plane} loading={busy}>Marcar ausência</Button></>}
    >
      <form id="agenda-away" className="agd-form" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="agd-propose-row">
          <label style={label}>De<input className="ui-input" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} /></label>
          <label style={label}>Hora<input className="ui-input" type="time" step="900" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
        </div>
        <div className="agd-propose-row">
          <label style={label}>Até<input className="ui-input" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <label style={label}>Hora<input className="ui-input" type="time" step="900" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
        </div>
        <label className="agd-check"><input type="checkbox" checked={decline} onChange={(e) => setDecline(e.target.checked)} /><span>Recusar sozinho os convites nesse período</span></label>
        {decline && <label style={label}>Mensagem para quem convidar<textarea className="ui-input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} style={{ resize: 'vertical' }} /></label>}
        <div style={hint}>Horário de Brasília. Fica como "Fora do escritório" no Google Agenda: quem consultar a sua agenda vê que você está ausente.</div>
      </form>
    </Modal>
  );
}

// Tarefa do Google na agenda: concluir, reabrir, excluir.
export function TaskDetail({ task, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try { await apiPatch(`/api/agenda/tasks/${encodeURIComponent(task.id)}`, { done: !task.done }); notify(task.done ? 'Tarefa reaberta.' : 'Tarefa concluída.', { tone: 'success' }); onChanged(); onClose(); } catch (e) { notify((e && e.message) || 'Não foi possível alterar a tarefa.', { tone: 'error' }); setBusy(false); }
  }
  async function remove() {
    if (!(await askConfirm({ title: 'Excluir esta tarefa?', message: 'Ela sai das suas Tarefas do Google.', confirmLabel: 'Excluir', danger: true }))) return;
    setBusy(true);
    try { await apiDelete(`/api/agenda/tasks/${encodeURIComponent(task.id)}`); notify('Tarefa excluída.', { tone: 'success' }); onChanged(); onClose(); } catch (e) { notify((e && e.message) || 'Não foi possível excluir.', { tone: 'error' }); setBusy(false); }
  }
  return (
    <Modal
      title={task.title} subtitle={`Tarefa · prazo ${fmtBrWhen(task.start, task.end, true).replace(' · dia inteiro', '')}`} onClose={onClose} busy={busy}
      footer={<><Button icon={Trash2} onClick={remove} disabled={busy} disabledReason="Aguarde terminar">Excluir</Button><Button variant="primary" icon={task.done ? RotateCcw : Check} onClick={toggle} loading={busy}>{task.done ? 'Reabrir' : 'Marcar como concluída'}</Button></>}
    >
      <div className="agd-detail">
        {task.done && <div className="agd-muted"><Check size={14} aria-hidden="true" /> Concluída</div>}
        {task.description ? <div className="agd-desc">{task.description}</div> : <div className="agd-muted">Sem detalhes.</div>}
      </div>
    </Modal>
  );
}

// Compromisso de um colega (agenda assinada ou "Reunião com…"): só leitura.
export function TeamEventDetail({ ev, onClose, onSchedule }) {
  return (
    <Modal
      title={ev.title} subtitle={fmtBrWhen(ev.start, ev.end, ev.allDay)} onClose={onClose}
      footer={<><Button onClick={() => onSchedule(ev.owner)}>Marcar reunião com {ev.accountLabel || ev.owner}</Button><Button onClick={onClose}>Fechar</Button></>}
    >
      <div className="agd-detail">
        <div><b>Agenda de:</b> {ev.accountLabel || ev.owner}</div>
        {ev.meetLink && (
          <a className="ui-btn primary agd-meet" href={ev.meetLink} target="_blank" rel="noopener noreferrer">
            <Video size={16} aria-hidden="true" /> {meetLabel(ev.meetLink)}
          </a>
        )}
        {ev.location && <div><b>Local:</b> {ev.location}</div>}
        {ev.organizerName && <div><b>Organizador:</b> {ev.organizerName}</div>}
        {ev.busyOnly && <div className="agd-muted">Esta pessoa só compartilha livre/ocupado com você.</div>}
        {/* §168: participantes como no Google, com Copiar e-mails / E-mail para todos (§167). */}
        <AttendeeList attendees={ev.attendees} organizerEmail={ev.organizerEmail} subject={ev.title || ''} />
        {ev.description && <div className="agd-desc">{tidyDescription(ev.description)}</div>}
      </div>
    </Modal>
  );
}

// Cor livre de uma agenda: as sugeridas + "Outra cor…" (qualquer cor).
export function ColorPicker({ value, colors, onPick, onClose, title }) {
  // "Outra cor…": o seletor do sistema muda a cor a cada movimento; grava só quando para por um instante.
  const [free, setFree] = useState(/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#5B8DEF');
  const timer = useRef(null);
  const pending = useRef(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  // Fechou antes de gravar (clique fora logo depois de escolher)? Grava na hora.
  useEffect(() => () => { clearTimeout(timer.current); if (pending.current) pickRef.current(pending.current); }, []);
  const pickFree = (c) => {
    setFree(c); pending.current = c; clearTimeout(timer.current);
    timer.current = setTimeout(() => { pending.current = null; onPick(c); }, 350);
  };
  return (
    <div className="agd-cpop" role="dialog" aria-label={title || 'Escolher cor'} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="agd-swatches">
        {colors.map((c) => (
          <button key={c} type="button" className={`agd-swatch${String(value).toLowerCase() === c.toLowerCase() ? ' on' : ''}`} style={{ '--c': c }} aria-label={`Cor ${c}`} title={c} onClick={() => { onPick(c); onClose(); }} />
        ))}
      </div>
      <label className="agd-cfree">
        <input type="color" value={free} onChange={(e) => pickFree(e.target.value)} />
        <span>Outra cor…</span>
      </label>
    </div>
  );
}

// Resultado da lupa: lista por data, como a busca do Google Agenda. Clicar leva ao dia e abre o compromisso.
export function SearchResults({ q, results, loading, error, onBack, onOpen }) {
  const groups = [];
  for (const ev of results || []) {
    const key = String(ev.start).slice(0, 10);
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.items.push(ev); else groups.push({ key, items: [ev] });
  }
  return (
    <div className="agd-frame agd-search">
      <div className="agd-search-head">
        <Button size="sm" icon={ArrowLeft} onClick={onBack}>Voltar à agenda</Button>
        <span><Search size={14} aria-hidden="true" /> {loading ? 'Buscando…' : `${(results || []).length} resultado${(results || []).length === 1 ? '' : 's'} para “${q}”`}</span>
      </div>
      {error && <div style={{ padding: 12 }}><Callout tone="danger">{error}</Callout></div>}
      {!loading && !error && !(results || []).length && <div className="agd-muted" style={{ padding: 16 }}>Nada encontrado no último ano nem no próximo.</div>}
      {groups.map((g) => (
        <div key={g.key} className="agd-sgroup">
          <div className="agd-sdate">{fmtBrWhen(g.items[0].start, g.items[0].end, true).replace(' · dia inteiro', '')}</div>
          <ul>
            {g.items.map((ev) => (
              <li key={ev.id}>
                <button type="button" className="agd-sitem" onClick={() => onOpen(ev)}>
                  <span className="agd-acc-dot" style={{ background: ev.color || '#5B8DEF' }} aria-hidden="true" />
                  <span className="agd-stime">{ev.allDay ? 'Dia todo' : fmtBrWhen(ev.start, ev.end).split(' · ')[1]}</span>
                  <span className="agd-stitle">{ev.title}</span>
                  {ev.location && <span className="agd-sloc">{ev.location}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
