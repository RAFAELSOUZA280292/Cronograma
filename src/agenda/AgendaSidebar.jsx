// Menu lateral da Agenda, como o do Google Agenda (2026-11-02, §138): Criar (Evento, Tarefa, Ausente), mini-calendário do mês,
// "Reunião com…" (traz para a grade a agenda de quem você escolher e marca a reunião com essas pessoas), Minhas agendas (mostrar,
// cor livre, conectar outra) e Outras agendas (assinar a agenda de colegas e sócios; o Google decide se você vê detalhes ou só
// livre/ocupado).
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X, Users, CalendarPlus, ListTodo, Plane, Settings2 } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { ColorPicker } from './AgendaExtras.jsx';
import './agenda.css';

const pad2 = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']; // começa na segunda, como a grade
const DOW_FULL = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

function CreateMenu({ onCreate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  const pick = (k) => { setOpen(false); onCreate(k); };
  return (
    <div className="agd-create" ref={ref} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <button type="button" className="agd-create-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Plus size={20} aria-hidden="true" /> Criar <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="agd-menu" role="menu">
          <button type="button" role="menuitem" autoFocus onClick={() => pick('event')}><CalendarPlus size={15} aria-hidden="true" /> Evento</button>
          <button type="button" role="menuitem" onClick={() => pick('task')}><ListTodo size={15} aria-hidden="true" /> Tarefa</button>
          <button type="button" role="menuitem" onClick={() => pick('away')}><Plane size={15} aria-hidden="true" /> Ausente</button>
        </div>
      )}
    </div>
  );
}

export function MiniMonth({ anchorDate, rangeStart, rangeEnd, onPick }) {
  const [month, setMonth] = useState(() => new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
  useEffect(() => { setMonth(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)); }, [anchorDate]);
  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first); start.setDate(1 - offset);
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = key(new Date());
  const inRange = (d) => d >= rangeStart && d < rangeEnd;
  return (
    <div className="agd-mini">
      <div className="agd-mini-head">
        <span>{MONTHS[month.getMonth()]} de {month.getFullYear()}</span>
        <button type="button" className="agd-ic" aria-label="Mês anterior" title="Mês anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} aria-hidden="true" /></button>
        <button type="button" className="agd-ic" aria-label="Próximo mês" title="Próximo mês" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
      <div className="agd-mini-grid" role="grid" aria-label={`${MONTHS[month.getMonth()]} de ${month.getFullYear()}`}>
        {DOW.map((l, i) => <div key={i} className="agd-mini-dow" aria-hidden="true">{l}</div>)}
        {days.map((d) => {
          const k = key(d);
          return (
            <button
              key={k} type="button" className={`agd-mini-day${d.getMonth() !== month.getMonth() ? ' out' : ''}${k === today ? ' today' : ''}${inRange(d) ? ' sel' : ''}`}
              aria-label={`${DOW_FULL[(d.getDay() + 6) % 7]}, ${d.getDate()} de ${MONTHS[d.getMonth()].toLowerCase()}`} aria-current={k === today ? 'date' : undefined}
              onClick={() => onPick(d)}
            >{d.getDate()}</button>
          );
        })}
      </div>
    </div>
  );
}

// Campo de pessoa da equipe (nome ou e-mail), com sugestões. `exclude` = e-mails já escolhidos.
function PersonPicker({ placeholder, exclude, onPick, ariaLabel }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) { setItems([]); return undefined; }
    const n = ++seq.current;
    const t = setTimeout(() => {
      apiGet(`/api/agenda/people?q=${encodeURIComponent(term)}`).then((d) => {
        if (n !== seq.current) return;
        let list = (d.people || []).filter((p) => !exclude.includes(p.email));
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(term) && !list.some((p) => p.email === term.toLowerCase()) && !exclude.includes(term.toLowerCase())) list = [{ name: '', email: term.toLowerCase() }, ...list];
        setItems(list.slice(0, 8)); setActive(0);
      }).catch(() => setItems([]));
    }, 150);
    return () => clearTimeout(t);
  }, [q, exclude]);
  const pick = (p) => { onPick(p); setQ(''); setItems([]); };
  const listId = `${ariaLabel.replace(/\W+/g, '-')}-sug`;
  return (
    <div className="agd-pp">
      <input
        className="ui-input agd-pp-input" value={q} placeholder={placeholder} aria-label={ariaLabel} autoComplete="off"
        role="combobox" aria-expanded={items.length > 0} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={items.length ? `${listId}-${active}` : undefined}
        onChange={(e) => setQ(e.target.value)} onBlur={() => setTimeout(() => setItems([]), 150)}
        onKeyDown={(e) => {
          if (!items.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]); }
          else if (e.key === 'Escape') { e.stopPropagation(); setItems([]); }
        }}
      />
      {items.length > 0 && (
        <ul className="agd-sug" id={listId} role="listbox" aria-label="Pessoas">
          {items.map((p, i) => (
            <li key={p.email} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}>
              <span className="agd-sug-name">{p.name || p.email}</span>{p.name && <span className="agd-sug-mail">{p.email}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Linha de agenda: caixinha (mostrar), bolinha de cor (abre a cor livre), nome; ações à direita.
function CalRow({ checked, color, label, note, onToggle, onColor, colors, actions }) {
  const [picking, setPicking] = useState(false);
  const rowRef = useRef(null);
  // Clique fora (ou Esc) fecha as cores, como no Google (03/11/2026: o Rafael escolhia a cor e o quadro ficava aberto).
  useEffect(() => {
    if (!picking) return undefined;
    const off = (e) => { if (rowRef.current && !rowRef.current.contains(e.target)) setPicking(false); };
    const esc = (e) => { if (e.key === 'Escape') setPicking(false); };
    document.addEventListener('pointerdown', off);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); };
  }, [picking]);
  return (
    <li className="agd-cal" ref={rowRef}>
      <label className="agd-cal-main" title={note || label}>
        <input type="checkbox" checked={checked} onChange={onToggle} style={{ '--c': color }} />
        <span className="agd-cal-name">{label}</span>
      </label>
      {note && <span className="agd-cal-note" title={note}>!</span>}
      {onColor && (
        <button type="button" className="agd-cal-color" style={{ background: color }} aria-label={`Cor de ${label}`} title="Mudar a cor" aria-expanded={picking} onClick={() => setPicking((v) => !v)} />
      )}
      {actions}
      {picking && <ColorPicker value={color} colors={colors} title={`Cor de ${label}`} onPick={onColor} onClose={() => setPicking(false)} />}
    </li>
  );
}

export default function AgendaSidebar({
  anchorDate, rangeStart, rangeEnd, onPickDate, onCreate, accounts, hidden, onToggleAccount, onAccountColor, onManageAccounts,
  team, teamStatus, onTeamChange, withPeople, onWithChange, onScheduleWith, colors,
}) {
  const subs = team || [];
  const statusOf = (email) => (teamStatus || []).find((c) => c.email === email);
  return (
    <aside className="agd-side" aria-label="Menu da agenda">
      <CreateMenu onCreate={onCreate} />
      <MiniMonth anchorDate={anchorDate} rangeStart={rangeStart} rangeEnd={rangeEnd} onPick={onPickDate} />

      <section className="agd-side-sec" aria-labelledby="agd-with-h">
        <h3 id="agd-with-h"><Users size={14} aria-hidden="true" /> Reunião com…</h3>
        <PersonPicker placeholder="Pesquisar pessoas" ariaLabel="Reunião com: pesquisar pessoas" exclude={withPeople.map((p) => p.email)} onPick={(p) => onWithChange([...withPeople, p].slice(0, 6))} />
        {withPeople.length > 0 && (
          <>
            <ul className="agd-with">
              {withPeople.map((p) => {
                const st = statusOf(p.email);
                return (
                  <li key={p.email}>
                    <span className="agd-acc-dot" style={{ background: p.color }} aria-hidden="true" />
                    <span className="agd-cal-name" title={st && st.message ? st.message : p.email}>{p.name || p.email}{st && st.status === 'busy' ? ' · livre/ocupado' : st && (st.status === 'none' || st.status === 'scope' || st.status === 'error') ? ' · sem acesso' : ''}</span>
                    <button type="button" className="agd-ic" aria-label={`Tirar ${p.name || p.email}`} title="Tirar" onClick={() => onWithChange(withPeople.filter((x) => x.email !== p.email))}><X size={14} aria-hidden="true" /></button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="ui-btn primary sm agd-with-go" onClick={onScheduleWith}>Marcar reunião com {withPeople.length === 1 ? (withPeople[0].name || withPeople[0].email).split(' ')[0] : `${withPeople.length} pessoas`}</button>
          </>
        )}
      </section>

      <section className="agd-side-sec" aria-labelledby="agd-mine-h">
        <h3 id="agd-mine-h">Minhas agendas <button type="button" className="agd-ic" aria-label="Conectar ou configurar agendas" title="Conectar outra agenda, nome e cor" onClick={onManageAccounts}><Settings2 size={14} aria-hidden="true" /></button></h3>
        <ul className="agd-cals">
          {accounts.map((a) => (
            <CalRow
              key={a.id} checked={!hidden.has(a.id) && a.calendarEnabled !== false} color={a.color} label={a.label}
              note={a.status === 'error' ? a.error : ''} onToggle={() => (a.calendarEnabled === false ? onManageAccounts() : onToggleAccount(a.id))}
              onColor={(c) => onAccountColor(a, c)} colors={colors}
            />
          ))}
        </ul>
      </section>

      <section className="agd-side-sec" aria-labelledby="agd-other-h">
        <h3 id="agd-other-h">Outras agendas</h3>
        <PersonPicker placeholder="Assinar a agenda de alguém" ariaLabel="Assinar a agenda de um colega" exclude={subs.map((s) => s.email)} onPick={(p) => onTeamChange([...subs, { email: p.email, name: p.name, show: true }])} />
        {subs.length === 0 && <div className="agd-side-hint">Assine a agenda dos sócios e da equipe para ver tudo numa grade só.</div>}
        <ul className="agd-cals">
          {subs.map((s) => {
            const st = statusOf(s.email);
            const note = st && st.status !== 'details' ? st.message : '';
            return (
              <CalRow
                key={s.email} checked={s.show} color={s.color} label={s.name || s.email} note={note}
                onToggle={() => onTeamChange(subs.map((x) => (x.email === s.email ? { ...x, show: !x.show } : x)))}
                onColor={(c) => onTeamChange(subs.map((x) => (x.email === s.email ? { ...x, color: c } : x)))} colors={colors}
                actions={<button type="button" className="agd-ic agd-cal-x" aria-label={`Deixar de ver a agenda de ${s.name || s.email}`} title="Remover" onClick={() => onTeamChange(subs.filter((x) => x.email !== s.email))}><X size={14} aria-hidden="true" /></button>}
              />
            );
          })}
        </ul>
        {subs.some((s) => (statusOf(s.email) || {}).status === 'scope') && (
          <a className="ui-btn sm" href="/api/google/oauth/start">Reconectar o Google (1 vez)</a>
        )}
      </section>
    </aside>
  );
}
