// "Hoje" da tela inicial (Onda 5, §81): o que está atrasado, o que vence hoje, as reuniões de hoje/amanhã e as notificações
// não lidas — cada item com resolver em 1 clique (Concluir, Adiar para amanhã, Abrir). Só apresentação: o App dono dos
// dados passa `actions` (que gravam e mostram o aviso com Desfazer). Os eventos do Google NÃO entram aqui: já estão na
// RENATA da tela inicial (RenataAgendaBriefing).
import React, { useMemo, useState } from 'react';
import { CheckCircle2, CalendarClock, ExternalLink, Mic, ListChecks, Columns3, Building2, Bell, ChevronDown } from 'lucide-react';
import { Button, EmptyState } from '../ui/index.jsx';
import { buildTodayItems } from './todayItems.js';
import { useNotifPrefs, visibleNotifications, requestNotifSettings } from '../lib/notifPrefs.js';

const LIMIT = 8;
const MAX_NOTIFS = 5;

const CSS = `
.tp { margin: 0 0 18px; font-family: 'Inter', sans-serif; align-self: stretch; width: 100%; box-sizing: border-box; }
.tp-card { background: var(--bg-2); border: 1px solid var(--border-1); border-radius: 14px; padding: 16px 18px; }
.tp-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.tp-title { margin: 0; font-size: 16px; font-weight: 800; color: var(--text-1); }
.tp-sub { font-size: 12.5px; color: var(--text-4); }
.tp-sec { margin-top: 14px; }
.tp-sec-title { display: flex; align-items: center; gap: 7px; margin: 0 0 6px; font-size: 12px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--text-4); }
.tp-sec-title.danger { color: var(--ui-danger, #ff7b70); }
.tp-sec-toggle { display: flex; align-items: center; gap: 7px; width: 100%; padding: 6px 4px; margin: 0 -4px; background: transparent; border: 0; border-radius: 8px; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; text-align: left; cursor: pointer; }
.tp-sec-toggle:hover { background: var(--bg-3); }
.tp-chev { margin-left: auto; flex-shrink: 0; transition: transform .15s ease; }
.tp-sec.collapsed .tp-chev { transform: rotate(-90deg); }
@media (prefers-reduced-motion: reduce) { .tp-chev { transition: none; } }
.tp-n { min-width: 20px; text-align: center; padding: 1px 7px; border-radius: 999px; font-size: 11.5px; font-weight: 800; background: var(--bg-4); color: var(--text-3); }
.tp-sec-title.danger .tp-n { background: var(--ui-danger-bg, rgba(226,87,76,.15)); color: var(--ui-danger, #ff7b70); }
.tp-row { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-top: 1px solid var(--border-1); }
.tp-row:first-of-type { border-top: 0; }
.tp-main { flex: 1; min-width: 0; }
.tp-name { font-size: 13.5px; font-weight: 700; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; font-size: 12px; color: var(--text-4); }
.tp-meta .late { color: var(--ui-danger, #ff7b70); font-weight: 700; }
.tp-meta .today { color: var(--ui-warn, #ffb066); font-weight: 700; }
.tp-src { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 6px; background: var(--bg-3); color: var(--text-4); font-size: 11px; font-weight: 700; }
.tp-prio { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; }
.tp-prio.urgente, .tp-prio.alta { color: #e2574c; } .tp-prio.media { color: #ff9f40; } .tp-prio.baixa { color: var(--text-5); }
.tp-acts { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.tp-more { margin-top: 6px; }
.tp-none { font-size: 13px; color: var(--text-4); padding: 8px 0 2px; }
@media (max-width: 720px) {
  .tp-row { flex-direction: column; align-items: stretch; gap: 8px; }
  .tp-acts { justify-content: flex-start; }
  .tp-name { white-space: normal; }
}
`;

const SOURCE_LABEL = {
  card: { text: 'Meu quadro', Icon: Columns3 },
  activity: { text: 'Atividade', Icon: Building2 },
  todo: { text: 'Tarefa de reunião', Icon: ListChecks },
};
const PRIORITY_LABEL = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' };

function lateText(days) {
  return days === 1 ? 'Venceu ontem' : `Venceu há ${days} dias`;
}

function ItemRow({ item, actions }) {
  const src = SOURCE_LABEL[item.source];
  const SrcIcon = src.Icon;
  return (
    <li className="tp-row" style={{ listStyle: 'none' }}>
      <div className="tp-main">
        <div className="tp-name" title={item.title}>{item.title}</div>
        <div className="tp-meta">
          <span className="tp-src"><SrcIcon size={11} aria-hidden="true" /> {src.text}</span>
          <span>{item.hint}</span>
          {item.priority && PRIORITY_LABEL[item.priority] && <span className={`tp-prio ${item.priority}`}>{PRIORITY_LABEL[item.priority]}</span>}
          <span className={item.daysLate > 0 ? 'late' : 'today'}>{item.daysLate > 0 ? lateText(item.daysLate) : 'Vence hoje'}</span>
        </div>
      </div>
      <div className="tp-acts">
        <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => actions.complete(item)} aria-label={`Concluir: ${item.title}`}>Concluir</Button>
        <Button size="sm" icon={CalendarClock} onClick={() => actions.postpone(item)} aria-label={`Adiar para amanhã: ${item.title}`}>Adiar para amanhã</Button>
        <Button size="sm" icon={ExternalLink} onClick={() => actions.open(item)} aria-label={`Abrir: ${item.title}`}>Abrir</Button>
      </div>
    </li>
  );
}

function ItemSection({ id, title, danger, items, expanded, onToggle, actions, collapsed, onCollapse }) {
  if (!items.length) return null;
  const shown = expanded ? items : items.slice(0, LIMIT);
  return (
    <section className={`tp-sec${collapsed ? ' collapsed' : ''}`} aria-labelledby={`tp-${id}`}>
      <SectionHead id={id} title={title} count={items.length} danger={danger} collapsed={collapsed} onToggle={onCollapse} />
      <div id={`tp-body-${id}`} hidden={collapsed}>
        <ul style={{ margin: 0, padding: 0 }}>{shown.map((it) => <ItemRow key={it.key} item={it} actions={actions} />)}</ul>
        {items.length > LIMIT && (
          <div className="tp-more">
            <Button size="sm" aria-expanded={expanded} onClick={onToggle}>{expanded ? 'Mostrar menos' : `Ver todos (${items.length})`}</Button>
          </div>
        )}
      </div>
    </section>
  );
}

// Cada etapa (Atrasadas, Vencem hoje, Reuniões, Notificações) pode ser recolhida; a escolha fica guardada neste navegador.
const COLLAPSE_KEY = 'pricetax-today-collapsed-v1';
function readCollapsed() {
  try { return JSON.parse(window.localStorage.getItem(COLLAPSE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = (id) => setCollapsed((c) => {
    const next = { ...c, [id]: !c[id] };
    try { window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch (e) { /* sem armazenamento: vale só nesta sessão */ }
    return next;
  });
  return [collapsed, toggleCollapsed];
}

function SectionHead({ id, title, count, danger, icon: Icon, collapsed, onToggle }) {
  return (
    <h3 className={`tp-sec-title ${danger ? 'danger' : ''}`} id={`tp-${id}`}>
      <button type="button" className="tp-sec-toggle" aria-expanded={!collapsed} aria-controls={`tp-body-${id}`} onClick={onToggle}
        title={collapsed ? `Mostrar ${title.toLowerCase()}` : `Ocultar ${title.toLowerCase()}`}>
        {Icon && <Icon size={13} aria-hidden="true" />}
        <span>{title}</span> <span className="tp-n">{count}</span>
        <ChevronDown size={15} className="tp-chev" aria-hidden="true" />
      </button>
    </h3>
  );
}

function dayWord(m) { return m.day === 'today' ? 'Hoje' : 'Amanhã'; }

export default function TodayPanel({ projects, personalBoard, user, notifications, todayIso, actions }) {
  const [open, setOpen] = useState({});
  const [collapsed, toggleCollapsed] = useCollapsed();
  const data = useMemo(() => buildTodayItems({ projects, personalBoard, user, todayIso }), [projects, personalBoard, user, todayIso]);
  const prefs = useNotifPrefs();
  const unread = useMemo(() => visibleNotifications(notifications, prefs.categories).filter((n) => !n.read), [notifications, prefs.categories]);
  const shownNotifs = unread.slice(0, MAX_NOTIFS);
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const nothingDue = data.total === 0;
  const empty = nothingDue && data.meetings.length === 0 && unread.length === 0;

  const parts = [];
  if (data.overdue.length) parts.push(`${data.overdue.length} atrasada${data.overdue.length === 1 ? '' : 's'}`);
  if (data.today.length) parts.push(data.today.length === 1 ? '1 vence hoje' : `${data.today.length} vencem hoje`);

  return (
    <section className="tp" aria-label="Hoje">
      <style>{CSS}</style>
      <div className="tp-card">
        <div className="tp-head">
          <h2 className="tp-title">Hoje</h2>
          <span className="tp-sub">{parts.length ? parts.join(' · ') : 'Tudo em dia'}</span>
        </div>

        {empty && (
          <EmptyState compact tone="ok" icon={CheckCircle2} title="Nada atrasado nem vencendo hoje." description="Reuniões de hoje e novidades aparecem aqui quando houver." />
        )}

        {!empty && nothingDue && <div className="tp-none">Nada atrasado nem vencendo hoje.</div>}

        <ItemSection id="late" title="Atrasadas" danger items={data.overdue} expanded={!!open.late} onToggle={() => toggle('late')} actions={actions} collapsed={!!collapsed.late} onCollapse={() => toggleCollapsed('late')} />
        <ItemSection id="today" title="Vencem hoje" items={data.today} expanded={!!open.today} onToggle={() => toggle('today')} actions={actions} collapsed={!!collapsed.today} onCollapse={() => toggleCollapsed('today')} />

        {data.meetings.length > 0 && (
          <section className={`tp-sec${collapsed.meet ? ' collapsed' : ''}`} aria-labelledby="tp-meet">
            <SectionHead id="meet" title="Reuniões de hoje e amanhã" count={data.meetings.length} icon={Mic} collapsed={!!collapsed.meet} onToggle={() => toggleCollapsed('meet')} />
            <div id="tp-body-meet" hidden={!!collapsed.meet}>
            <ul style={{ margin: 0, padding: 0 }}>
              {(open.meet ? data.meetings : data.meetings.slice(0, LIMIT)).map((m) => (
                <li key={m.key} className="tp-row" style={{ listStyle: 'none' }}>
                  <div className="tp-main">
                    <div className="tp-name" title={m.title}>{m.title}</div>
                    <div className="tp-meta"><span className={m.day === 'today' ? 'today' : ''} style={m.day === 'today' ? undefined : { fontWeight: 700 }}>{dayWord(m)}{m.time ? ` às ${m.time}` : ''}</span><span>{m.hint}</span></div>
                  </div>
                  <div className="tp-acts"><Button size="sm" icon={ExternalLink} onClick={() => actions.openMeeting(m)} aria-label={`Abrir reunião: ${m.title}`}>Abrir</Button></div>
                </li>
              ))}
            </ul>
            {data.meetings.length > LIMIT && <div className="tp-more"><Button size="sm" aria-expanded={!!open.meet} onClick={() => toggle('meet')}>{open.meet ? 'Mostrar menos' : `Ver todas (${data.meetings.length})`}</Button></div>}
          </div>
          </section>
        )}

        {unread.length > 0 && (
          <section className={`tp-sec${collapsed.notif ? ' collapsed' : ''}`} aria-labelledby="tp-notif">
            <SectionHead id="notif" title="Notificações não lidas" count={unread.length} icon={Bell} collapsed={!!collapsed.notif} onToggle={() => toggleCollapsed('notif')} />
            <div id="tp-body-notif" hidden={!!collapsed.notif}>
            <ul style={{ margin: 0, padding: 0 }}>
              {shownNotifs.map((n) => (
                <li key={n.id} className="tp-row" style={{ listStyle: 'none' }}>
                  <div className="tp-main">
                    <div className="tp-name" title={n.title}>{n.title}</div>
                    <div className="tp-meta"><span>{n.actorName ? `${n.actorName}: ` : ''}{String(n.body || '').slice(0, 110)}</span></div>
                  </div>
                  <div className="tp-acts">
                    <Button size="sm" icon={ExternalLink} onClick={() => actions.openNotification(n)} aria-label={`Abrir notificação: ${n.title}`}>Abrir</Button>
                    <Button size="sm" onClick={() => actions.markNotificationRead(n.id, true)} aria-label={`Marcar como lida: ${n.title}`}>Marcar como lida</Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="tp-more" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {unread.length > MAX_NOTIFS && <Button size="sm" onClick={actions.openAllNotifications}>{`Ver todas (${unread.length})`}</Button>}
              {unread.length > 1 && actions.markAllNotificationsRead && <Button size="sm" onClick={actions.markAllNotificationsRead}>Marcar todas como lidas</Button>}
              <Button size="sm" onClick={() => { requestNotifSettings(); actions.openAllNotifications(); }}>Escolher quais ver</Button>
            </div>
          </div>
          </section>
        )}
      </div>
    </section>
  );
}
