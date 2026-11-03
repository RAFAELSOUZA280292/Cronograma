// Painel lateral da Caixa de e-mail (2026-11-03, §150; Rafael mostrou a barra do Google: "preciso do mesmo no nosso e-mail… ver a
// minha agenda, redimensionar, alterar para amanhã, onde tem tarefas você destina para o nosso quadro"). Barra de ícones à direita +
// um painel por vez:
// - Agenda: o dia em coluna (a mesma grade da Agenda do painel, WeekGrid com um dia), Hoje/‹ ›/data, compromisso abre o detalhe de
//   sempre (responder, editar, Meet, propor horário), horário vazio abre "Novo compromisso"; convite aberto no e-mail = faixa
//   tracejada no horário dele e aviso de choque.
// - Tarefas: "Criar tarefa deste e-mail" (cartão no quadro pessoal com link de volta à conversa) e os cartões de hoje e atrasados.
// Lê e grava só o que é da própria pessoa, pelas rotas de sempre (/api/agenda) e por /api/board-side (um cartão por vez, com trava).
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, ExternalLink, ListTodo, Plus, X } from 'lucide-react';
import { Button, Callout, EmptyState, IconButton, Skeleton } from '../ui/index.jsx';
import { DateField } from '../ui/DateTimeFields.jsx';
import { notify } from '../ui/dialogs.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import { WeekGrid } from '../agenda/Agenda.jsx';
import EventDetailModal from '../agenda/EventDetail.jsx';
import NewEventModal from '../agenda/NewEventModal.jsx';
import { useRespond } from '../agenda/agendaActions.js';
import { CAL_SOURCES, rsvpOf } from '../agenda/dayLoad.js';
import { findConflicts } from '../../shared/agendaConflicts.js';

const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const minOfDay = (d) => d.getHours() * 60 + d.getMinutes();
const brDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const NOT_MINE = new Set(['team', 'gtask']);

export function SideRail({ side, onToggle, hasAgenda, hasTasks }) {
  const items = [hasAgenda && { key: 'agenda', label: 'Agenda', Icon: CalendarDays }, hasTasks && { key: 'tasks', label: 'Tarefas', Icon: ListTodo }].filter(Boolean);
  return (
    <nav className="mail-apps" aria-label="Agenda e tarefas ao lado do e-mail">
      {items.map(({ key, label, Icon }) => (
        <button key={key} type="button" className={`mail-app${side === key ? ' on' : ''}`} aria-pressed={side === key} title={side === key ? `Fechar ${label}` : `Abrir ${label} ao lado`} aria-label={label} onClick={() => onToggle(side === key ? '' : key)}>
          <Icon size={18} aria-hidden="true" />
        </button>
      ))}
    </nav>
  );
}

// Horário do convite no dia mostrado (faixa) e os compromissos seus que se sobrepõem a ele.
export function focusOnDay(focus, day, events) {
  if (!focus || !focus.start || focus.allDay) return { mark: null, clashes: [] };
  const s = new Date(focus.start); const e = new Date(focus.end || focus.start);
  if (Number.isNaN(s.getTime()) || isoDay(s) !== isoDay(day)) return { mark: null, clashes: [] };
  const endMin = isoDay(e) === isoDay(s) ? Math.max(minOfDay(e), minOfDay(s) + 15) : 24 * 60;
  const clashes = (events || []).filter((ev) => !ev.allDay && !NOT_MINE.has(ev.source) && ev.id !== focus.eventId && rsvpOf(ev) !== 'declined'
    && Date.parse(ev.start) < e.getTime() && Date.parse(ev.end) > s.getTime());
  return { mark: { startMin: minOfDay(s), endMin, label: 'Convite' }, clashes };
}

export function SideAgenda({ focus, onClose, onGoAgenda }) {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [data, setData] = useState(null); // { connected, events, accounts, warnings }
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [detailId, setDetailId] = useState(null);
  const [newEvent, setNewEvent] = useState(null);
  const [editing, setEditing] = useState(null);
  const { respond, respondingId } = useRespond((id, myResponse) => setData((d) => (d ? { ...d, events: d.events.map((e) => (e.id === id ? { ...e, myResponse } : e)) } : d)));
  const focusKey = focus ? `${focus.start}|${focus.eventId || ''}` : '';

  // Convite aberto no e-mail: o painel vai para o dia dele.
  useEffect(() => { if (focus && focus.start && !Number.isNaN(Date.parse(focus.start))) setDay(startOfDay(new Date(focus.start))); }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayKey = isoDay(day);
  useEffect(() => {
    let alive = true;
    const load = () => apiGet(`/api/agenda?start=${day.toISOString()}&end=${addDays(day, 1).toISOString()}`)
      .then((r) => { if (alive) { setData({ connected: r.connected, events: r.events || [], accounts: r.accounts || [], warnings: r.warnings || [] }); setError(''); } })
      .catch((e) => { if (alive) setError((e && e.message) || 'Não consegui carregar a agenda.'); });
    setData(null);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [dayKey, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const events = data ? data.events : [];
  const conflicts = useMemo(() => findConflicts(events.filter((e) => !NOT_MINE.has(e.source))), [events]);
  const hasClash = (ev) => rsvpOf(ev) === 'accepted' && (conflicts.get(ev.id) || []).some((o) => rsvpOf(o) === 'accepted');
  const { mark, clashes } = useMemo(() => focusOnDay(focus, day, events), [focus, day, events]);
  const today = isoDay(new Date()) === dayKey;
  const scrollTo = mark ? mark.startMin : today ? Math.max(0, minOfDay(new Date()) - 60) : undefined;
  const writable = data ? data.accounts.filter((a) => !a.readOnly && a.status !== 'error' && (a.id !== 'principal' || a.connected)) : [];
  const label = `${WEEKDAY[day.getDay()]}, ${day.getDate()} de ${MONTH[day.getMonth()]}`;
  const detailEv = detailId ? events.find((e) => e.id === detailId) : null;

  function openEvent(ev) {
    if (ev.source === 'xflow_ticket' && ev.link) { window.location.hash = ev.link; return; }
    if (CAL_SOURCES.has(ev.source)) setDetailId(ev.id);
  }

  return (
    <section className="mail-side-panel" aria-label="Agenda ao lado do e-mail">
      <header className="mail-side-head">
        <div className="mail-side-title">Agenda</div>
        {onGoAgenda && <IconButton label="Abrir a Agenda completa" icon={ExternalLink} size="sm" onClick={onGoAgenda} />}
        <IconButton label="Fechar a agenda" icon={X} size="sm" onClick={onClose} />
      </header>
      <div className="mail-side-nav">
        <Button size="sm" onClick={() => setDay(startOfDay(new Date()))} disabled={today} disabledReason="Já está em hoje">Hoje</Button>
        <IconButton label="Dia anterior" icon={ChevronLeft} size="sm" onClick={() => setDay((d) => addDays(d, -1))} />
        <IconButton label="Próximo dia" icon={ChevronRight} size="sm" onClick={() => setDay((d) => addDays(d, 1))} />
        <span className="mail-side-day" aria-live="polite">{label}</span>
        <DateField value={dayKey} onChange={(iso) => { if (iso) setDay(startOfDay(new Date(`${iso}T12:00:00`))); }} ariaLabel="Ir para a data" shortcuts={false} className="mail-side-date" />
        <IconButton label="Novo compromisso" icon={Plus} size="sm" onClick={() => setNewEvent({ date: dayKey, time: today ? `${pad2(Math.min(23, new Date().getHours() + 1))}:00` : '09:00' })} />
      </div>
      {mark && (
        <div className={`mail-side-focus${clashes.length ? ' clash' : ''}`} role="status">
          {clashes.length ? <AlertTriangle size={14} aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />}
          <span>{clashes.length ? `O convite choca com: ${clashes.map((c) => c.title || '(sem título)').join(', ')}` : 'Você está livre no horário do convite.'}</span>
        </div>
      )}
      {error && <div className="mail-side-pad"><Callout tone="danger" icon={AlertTriangle} title="Não consegui carregar a agenda" action={<Button size="sm" onClick={() => setTick((n) => n + 1)}>Tentar de novo</Button>}>{error}</Callout></div>}
      {data && data.connected === false && <div className="mail-side-pad"><Callout icon={CalendarDays} title="Agenda do Google não conectada">Conecte em Meu perfil › Agenda para ver seus compromissos aqui.</Callout></div>}
      {data && data.warnings.length > 0 && <div className="mail-side-pad"><Callout tone="warn" icon={AlertTriangle} title="Parte da agenda não carregou">{data.warnings.join(' ')}</Callout></div>}
      <div className="mail-side-grid">
        {!data && !error ? <div className="mail-side-pad"><Skeleton height={280} /></div> : (
          <WeekGrid
            daysInView={[day]} events={events} dayStats={{}} hideDetails={false} hasClash={hasClash}
            eventLabel={(ev) => ev.title || '(sem título)'} eventAria={(ev) => ev.title || '(sem título)'} eventTip={(ev) => [ev.accountLabel, ev.location].filter(Boolean).join('\n')}
            onOpenEvent={openEvent} onPickSlot={(d, m) => setNewEvent({ date: isoDay(d), time: `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}` })}
            mark={mark} scrollTo={scrollTo}
          />
        )}
      </div>
      {newEvent && data && <NewEventModal initial={newEvent} connected={data.connected} accounts={writable} events={events} onClose={() => setNewEvent(null)} onCreated={() => { setNewEvent(null); setTick((n) => n + 1); }} />}
      {detailId && (
        <EventDetailModal
          key={detailId} id={detailId} initial={detailEv} conflicts={detailEv ? conflicts.get(detailEv.id) : null} onClose={() => setDetailId(null)}
          onRespond={respond} respondBusy={respondingId === detailId} onEdit={(ev) => setEditing(ev)} onChanged={() => setTick((n) => n + 1)}
        />
      )}
      {editing && data && <NewEventModal event={editing} connected={data.connected} accounts={writable} events={events} onClose={() => setEditing(null)} onCreated={() => { setEditing(null); setTick((n) => n + 1); }} />}
    </section>
  );
}

export function SideTasks({ thread, onClose, onGoPersonal }) {
  const [info, setInfo] = useState(null); // { today, pages, due, dueTotal }
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [pageId, setPageId] = useState('');
  const [columnId, setColumnId] = useState('');
  const [busy, setBusy] = useState(false);
  const threadId = thread && thread.id;

  useEffect(() => {
    let alive = true;
    apiGet('/api/board-side').then((r) => { if (alive) { setInfo(r); setError(''); } }).catch((e) => { if (alive) setError((e && e.message) || 'Não consegui ler o seu quadro.'); });
    return () => { alive = false; };
  }, [tick]);
  // E-mail aberto: o título já vem com o assunto (a pessoa ajusta).
  useEffect(() => { setTitle(thread && thread.subject ? thread.subject.slice(0, 200) : ''); setNote(''); }, [threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = info ? info.pages : [];
  const page = pages.find((p) => p.id === pageId) || pages[0];
  const columns = page ? page.columns : [];
  const column = columns.find((c) => c.id === columnId) || columns[0];

  async function create(e) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const r = await apiPost('/api/board-side/cards', {
        title: title.trim(), note: note.trim(), dueDate, pageId: page && page.id, columnId: column && column.id,
        ...(thread ? { threadId: thread.id, subject: thread.subject, from: thread.from } : {}),
      });
      notify(`Tarefa criada em ${r.card.page} › ${r.card.column}.`, { tone: 'success', ...(onGoPersonal ? { actionLabel: 'Abrir o quadro', onAction: onGoPersonal } : {}) });
      setNote(''); setDueDate('');
      if (!thread) setTitle('');
      setTick((n) => n + 1);
    } catch (err) { notify((err && err.message) || 'Não consegui criar a tarefa.', { tone: 'error' }); } finally { setBusy(false); }
  }

  return (
    <section className="mail-side-panel" aria-label="Tarefas ao lado do e-mail">
      <header className="mail-side-head">
        <div className="mail-side-title">Tarefas</div>
        {onGoPersonal && <IconButton label="Abrir a Gestão de Atividades" icon={ExternalLink} size="sm" onClick={onGoPersonal} />}
        <IconButton label="Fechar as tarefas" icon={X} size="sm" onClick={onClose} />
      </header>
      <div className="mail-side-scroll">
        {error && <div className="mail-side-pad"><Callout tone="danger" icon={AlertTriangle} title="Não consegui ler o seu quadro" action={<Button size="sm" onClick={() => setTick((n) => n + 1)}>Tentar de novo</Button>}>{error}</Callout></div>}
        <form className="mail-side-form" onSubmit={create}>
          <div className="mail-side-sub">{thread ? 'Criar tarefa deste e-mail' : 'Nova tarefa'}</div>
          <label><span>Título</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="O que precisa ser feito" /></label>
          <label><span>Anotação (opcional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Detalhe, combinado, próximo passo" /></label>
          <div className="mail-side-row">
            <div className="mail-side-field"><span>Prazo</span><DateField value={dueDate} onChange={setDueDate} allowClear ariaLabel="Prazo da tarefa" /></div>
          </div>
          {pages.length > 1 && (
            <label><span>Página do quadro</span>
              <select value={page ? page.id : ''} onChange={(e) => { setPageId(e.target.value); setColumnId(''); }}>{pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
          )}
          {columns.length > 0 && (
            <label><span>Coluna</span>
              <select value={column ? column.id : ''} onChange={(e) => setColumnId(e.target.value)}>{columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
          )}
          {thread && <div className="mail-side-hint">O cartão leva quem mandou, o assunto e um link que reabre este e-mail.</div>}
          <Button type="submit" variant="primary" size="sm" icon={Plus} loading={busy} disabled={!info || !title.trim()} disabledReason={!info ? 'Carregando o seu quadro' : 'Escreva o título'}>Criar tarefa</Button>
        </form>
        <div className="mail-side-sub mail-side-sub-list">Hoje e atrasadas{info && info.dueTotal > info.due.length ? ` (${info.due.length} de ${info.dueTotal})` : ''}</div>
        {!info && !error && <div className="mail-side-pad"><Skeleton height={60} /></div>}
        {info && !info.due.length && <EmptyState compact icon={CircleCheck} title="Nada vencendo hoje" description="As tarefas do seu quadro com prazo até hoje aparecem aqui." />}
        {info && info.due.length > 0 && (
          <ul className="mail-side-tasks">
            {info.due.map((t) => (
              <li key={t.id}>
                <button type="button" className="mail-side-task" onClick={onGoPersonal} disabled={!onGoPersonal} title={`${t.page} › ${t.column}`}>
                  <span className={`mail-side-due${t.overdue ? ' late' : ''}`}>{t.overdue ? `venceu ${brDate(t.dueDate)}` : 'hoje'}</span>
                  <span className="mail-side-task-title">{t.title}</span>
                  <span className="mail-side-task-where">{t.page} › {t.column}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
