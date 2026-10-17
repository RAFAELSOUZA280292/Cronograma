// Lista "Tarefas de reunião vinculadas" no detalhe da atividade (2026-10-16). Só LÊ `actionItems[].activityId` (mesma fonte do chip
// "N tarefas · M abertas" do Resumo e da Tabela); nada novo é gravado. Clicar numa linha abre a tarefa na reunião de origem.
import React from 'react';
import { ListChecks, ChevronRight } from 'lucide-react';
import { fmtDate } from '../App.jsx';
import { todoStatusMeta } from './Meetings.jsx';
import { linkedTasksForActivity } from './ActivityLink.jsx';
import { todayIso } from './todoUtils.js';

const MAX_ROWS = 6;

const CSS = `
  .lt-wrap { margin-top: 4px; }
  .lt-list { display: flex; flex-direction: column; gap: 4px; }
  .lt-row { display: flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; background: var(--bg-3); border: 1px solid var(--border-2); border-radius: 9px; padding: 7px 9px; cursor: pointer; color: var(--text-2); font: inherit; }
  .lt-row:hover { border-color: var(--border-3); background: var(--bg-4); }
  .lt-row:focus-visible, .lt-all:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 2px; }
  .lt-row.done .lt-title { text-decoration: line-through; color: var(--text-5); }
  .lt-main { flex: 1; min-width: 0; }
  .lt-title { font-size: 12.5px; font-weight: 600; color: var(--text-1); overflow-wrap: anywhere; }
  .lt-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-top: 3px; font-size: 10.5px; color: var(--text-5); }
  .lt-pill { display: inline-block; font-size: 10px; font-weight: 700; border-radius: 999px; border: 1px solid; padding: 1px 7px; white-space: nowrap; }
  .lt-late { color: #e2574c; font-weight: 700; }
  .lt-go { flex-shrink: 0; color: var(--text-6); margin-top: 2px; }
  .lt-all { margin-top: 6px; background: transparent; border: 0; padding: 4px 2px; color: var(--text-4); font-size: 11.5px; font-weight: 700; cursor: pointer; text-decoration: underline; }
  .lt-all:hover { color: var(--text-1); }
  @media (max-width: 767px) { .lt-row { min-height: 44px; padding: 9px 10px; } .lt-all { min-height: 44px; } }
`;

export default function LinkedTasks({ meetings, activityId, labelStyle, onOpenTask, onOpenAll }) {
  const tasks = linkedTasksForActivity(meetings, activityId);
  if (!tasks.length) return null;
  const today = todayIso();
  const shown = tasks.slice(0, MAX_ROWS);
  const open = tasks.filter((t) => !t.done).length;
  return (
    <div className="lt-wrap">
      <style>{CSS}</style>
      <div style={labelStyle}><ListChecks size={12} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 4 }} />Tarefas de reunião ({tasks.length}{open !== tasks.length ? ` · ${open} aberta${open === 1 ? '' : 's'}` : ''})</div>
      <div className="lt-list">
        {shown.map((t) => {
          const meta = todoStatusMeta(t.status);
          const late = !t.done && t.dueDate && t.dueDate < today;
          return (
            <button key={`${t.meetingId}-${t.id}`} type="button" className={`lt-row${t.done ? ' done' : ''}`} onClick={() => onOpenTask(t.meetingId, t.id)} title="Abrir esta tarefa na reunião de origem">
              <span className="lt-main">
                <span className="lt-title">{t.title || '(sem título)'}</span>
                <span className="lt-meta">
                  <span className="lt-pill" style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>{meta.label}</span>
                  {t.responsible && <span>{t.responsible}</span>}
                  {t.dueDate && <span className={late ? 'lt-late' : undefined}>{late ? 'Atrasada · ' : 'Prazo '}{fmtDate(t.dueDate)}</span>}
                  <span>Reunião: {t.meetingTitle || 'sem título'}{t.meetingDate ? ` · ${fmtDate(t.meetingDate)}` : ''}</span>
                </span>
              </span>
              <ChevronRight size={14} className="lt-go" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <button type="button" className="lt-all" onClick={onOpenAll}>{tasks.length > MAX_ROWS ? `Ver as ${tasks.length} tarefas na aba Tarefas` : 'Ver na aba Tarefas'}</button>
    </div>
  );
}
