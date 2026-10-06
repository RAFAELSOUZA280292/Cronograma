// Casca única (Onda 1, §81): a MESMA barra no topo de todas as telas depois do login.
// ← Início (com texto) · seletor de módulos · busca global (Ctrl/Cmd+K) · sino · menu da pessoa (perfil, tema, sair).
// Os módulos mantêm só o que é deles (título, ações do módulo); Início/Sair/Tema/Sino/Perfil vivem aqui.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Search, LogOut, UserCog, Sun, Moon, Check, Sparkles } from 'lucide-react';
import { NotificationBell, UserAvatar } from '../App.jsx';
import CommandPalette from './CommandPalette.jsx';
import { useEscClose } from '../lib/nav.js';
import { GlobalSaveStatus } from '../ui/index.jsx';

const CSS = `
.shell-bar { position: sticky; top: 0; z-index: 45; display: flex; align-items: center; gap: 8px; height: var(--shell-h, 48px); padding: 0 14px;
  background: var(--bg-1); border-bottom: 1px solid var(--border-1); font-family: 'Inter', sans-serif; color: var(--text-2); box-sizing: border-box; }
.shell-bar * { box-sizing: border-box; }
.shell-btn { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid transparent; background: transparent;
  color: var(--text-2); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.shell-btn:hover { background: var(--bg-3); }
.shell-btn:focus-visible, .shell-menu-item:focus-visible, .shell-pal-item:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 1px; }
.shell-btn.icon { width: 32px; padding: 0; justify-content: center; }
.shell-sep { width: 1px; height: 20px; background: var(--border-1); margin: 0 2px; flex-shrink: 0; }
.shell-spacer { flex: 1; min-width: 0; }
.shell-save { display: inline-flex; align-items: center; margin-right: 6px; white-space: nowrap; }
.shell-cur { color: var(--text-1); font-weight: 700; }
.shell-renata { color: var(--ui-accent, #F5C400); }
.shell-renata:hover { background: var(--ui-accent-bg, rgba(245,196,0,.14)); }
.shell-search { min-width: 190px; justify-content: flex-start; color: var(--text-4); background: var(--bg-3); border-color: var(--border-1); font-weight: 500; }
.shell-search kbd, .shell-pal kbd { margin-left: auto; font: inherit; font-size: 10.5px; padding: 1px 5px; border-radius: 4px; border: 1px solid var(--border-2); color: var(--text-4); background: var(--bg-1); }
.shell-pop { position: relative; }
.shell-menu { position: absolute; top: 38px; z-index: 46; min-width: 230px; max-height: 70vh; overflow-y: auto; padding: 6px; border-radius: 10px;
  background: var(--bg-2); border: 1px solid var(--border-2); box-shadow: 0 12px 32px rgba(0,0,0,.35); }
.shell-menu.left { left: 0; } .shell-menu.right { right: 0; }
.shell-menu-item { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--text-2);
  font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.shell-menu-item:hover { background: var(--bg-3); }
.shell-menu-item[aria-current="true"] { color: var(--text-1); font-weight: 700; }
.shell-menu-item .check { margin-left: auto; color: var(--ui-accent, #F5C400); }
.shell-menu-head { padding: 8px 10px 6px; font-size: 12px; color: var(--text-4); }
.shell-menu-head b { display: block; color: var(--text-1); font-size: 13px; }
.shell-menu hr { border: 0; border-top: 1px solid var(--border-1); margin: 5px 0; }
.shell-pal-overlay { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,.55); display: flex; align-items: flex-start; justify-content: center; padding: 12vh 16px 16px; font-family: 'Inter', sans-serif; }
.shell-pal { width: min(620px, 100%); max-height: 70vh; display: flex; flex-direction: column; border-radius: 14px; background: var(--bg-1); border: 1px solid var(--border-2); box-shadow: 0 20px 60px rgba(0,0,0,.5); overflow: hidden; }
.shell-pal-input { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border-1); color: var(--text-4); }
.shell-pal-input input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-1); font: inherit; font-size: 15px; }
.shell-pal-list { overflow-y: auto; padding: 6px; }
.shell-pal-group { padding: 10px 10px 4px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-4); }
.shell-pal-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; cursor: pointer; color: var(--text-2); font-size: 14px; }
.shell-pal-item[data-active="true"] { background: var(--bg-3); color: var(--text-1); }
.shell-pal-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shell-pal-hint { font-size: 12px; color: var(--text-4); max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shell-pal-star { flex-shrink: 0; margin: -6px -4px -6px 0; color: var(--text-5); }
.shell-pal-star[aria-pressed="true"] { color: var(--ui-accent, #F5C400); }
.shell-pal-empty { padding: 22px 12px; text-align: center; color: var(--text-4); font-size: 13.5px; }
.shell-pal-foot { display: flex; gap: 16px; padding: 8px 14px; border-top: 1px solid var(--border-1); font-size: 11.5px; color: var(--text-4); }
.shell-pal-foot kbd { margin: 0 3px 0 0; }
@media (max-width: 720px) {
  .shell-bar { gap: 4px; padding: 0 8px; }
  .shell-bar button, .shell-bar .shell-btn { min-height: 44px; min-width: 44px; }
  .shell-btn.icon, .shell-search { width: 44px; }
  .shell-search { min-width: 0; width: 32px; padding: 0; justify-content: center; }
  .shell-search span, .shell-search kbd { display: none; }
  .shell-cur-label { display: none; }
  .shell-hide-m { display: none; }
  .shell-renata-t { display: none; }
  .shell-renata { width: 44px; padding: 0; justify-content: center; }
  .shell-save .ui-save { font-size: 11px; }
  .shell-pal-overlay { padding-top: 8vh; }
}
/* A barra ocupa 48px: as telas que ocupam a altura toda descontam isso para não criar rolagem extra. */
.page-root { min-height: calc(100dvh - var(--shell-h, 48px)) !important; }
@media print { .shell-bar { display: none !important; } }
`;

function Menu({ label, align = 'left', trigger, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEscClose(() => setOpen(false), open);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="shell-pop" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v), label })}
      {open && <div className={`shell-menu ${align}`} role="menu" aria-label={label} onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

export default function ModuleShell({
  user, current, modes, onGo, onHome, getSearchItems, onOpenRenata,
  notifications, showNotifications, onToggleNotifications, onOpenNotification, onMarkNotificationRead, onMarkAllNotificationsRead,
  onOpenProfile, theme, onToggleTheme, onLogout,
}) {
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPalette((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cur = modes.find((m) => m.key === current) || null;
  const CurIcon = cur && cur.icon;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

  return (
    <>
      <style>{CSS}</style>
      <header className="shell-bar no-print" role="banner">
        {cur && onHome && (
          <button type="button" className="shell-btn" onClick={onHome} title="Voltar à tela inicial">
            <ArrowLeft size={15} aria-hidden="true" /> Início
          </button>
        )}
        {cur && onHome && <span className="shell-sep" aria-hidden="true" />}
        <Menu label="Trocar de módulo" trigger={({ open, toggle }) => (
          <button type="button" className="shell-btn" onClick={toggle} aria-haspopup="menu" aria-expanded={open} title="Trocar de módulo">
            {CurIcon ? <CurIcon size={15} aria-hidden="true" /> : null}
            <span className={`shell-cur ${cur ? 'shell-cur-label' : ''}`}>{cur ? cur.label : 'Módulos'}</span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
        )}>
          {modes.map((m) => {
            const I = m.icon;
            return (
              <button key={m.key} type="button" role="menuitem" className="shell-menu-item" aria-current={m.key === current ? 'true' : undefined} onClick={() => onGo(m.key)}>
                <I size={15} aria-hidden="true" /> {m.label}{m.key === current && <Check size={14} className="check" aria-hidden="true" />}
              </button>
            );
          })}
        </Menu>
        <span className="shell-spacer" />
        <span className="shell-save"><GlobalSaveStatus /></span>
        <button type="button" className="shell-btn shell-search" onClick={() => setPalette(true)} title="Buscar (Ctrl+K)" aria-label="Buscar">
          <Search size={14} aria-hidden="true" /> <span>Buscar…</span> <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        {onOpenRenata && (
          <button type="button" className="shell-btn shell-renata" onClick={() => onOpenRenata()} title="Falar com a RENATA" aria-label="Falar com a RENATA">
            <Sparkles size={15} aria-hidden="true" /> <span className="shell-renata-t">RENATA</span>
          </button>
        )}
        {notifications && (
          <NotificationBell
            notifications={notifications} show={showNotifications} onToggle={onToggleNotifications}
            onOpenItem={onOpenNotification} onMarkRead={onMarkNotificationRead} onMarkAllRead={onMarkAllNotificationsRead}
          />
        )}
        <Menu label="Menu da conta" align="right" trigger={({ open, toggle }) => (
          <button type="button" className="shell-btn icon" onClick={toggle} aria-haspopup="menu" aria-expanded={open} title={`${user.name || user.username} — conta`} aria-label="Menu da conta">
            <UserAvatar user={user} size={24} />
          </button>
        )}>
          <div className="shell-menu-head"><b>{user.name || user.username}</b>{user.email || user.username}</div>
          <hr />
          <button type="button" role="menuitem" className="shell-menu-item" onClick={() => onOpenProfile()}><UserCog size={15} aria-hidden="true" /> Meu perfil</button>
          <button type="button" role="menuitem" className="shell-menu-item" onClick={onToggleTheme}>
            {theme === 'light' ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />} {theme === 'light' ? 'Modo escuro' : 'Modo claro'}
          </button>
          <hr />
          <button type="button" role="menuitem" className="shell-menu-item" onClick={onLogout}><LogOut size={15} aria-hidden="true" /> Sair</button>
        </Menu>
      </header>
      {palette && <CommandPalette getItems={getSearchItems} onAskRenata={onOpenRenata} onClose={() => setPalette(false)} />}
    </>
  );
}
