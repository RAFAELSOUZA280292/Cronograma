import React from 'react';
import pricetaxLogoBranco from '../assets/brand/pricetax-logo-branco.png';
import pricetaxLogoPreto from '../assets/brand/pricetax-logo-preto.png';
import { CLIENT_TYPE_META, fmtDate, sortActivities, startOfDay, toISODate } from '../App.jsx';
import { resumoCountdown, resumoDateLabel } from '../screens/CompanyViews.jsx';
import { PDF_DEFAULTS, PDF_THEMES, pdfCssVars, pdfPageCss, pdfStatusMeta, pdfToneMeta } from './pdfTheme.js';

// Relatório do cronograma para PDF (window.print). Fica display:none na tela e só aparece em @media print.
// Tema (escuro/claro), orientação e seções vêm de `options` (janela "Exportar PDF", ver PdfExportModal).
const css = (theme, orientation, footer) => `
  .print-report { display: none; }
  @media print {
    ${pdfPageCss(theme, orientation, footer)}
    .print-report { display: block !important; }
    html, body, .page-root { background: ${(PDF_THEMES[theme] || PDF_THEMES.dark).bg} !important; color: ${(PDF_THEMES[theme] || PDF_THEMES.dark).text} !important; }
  }
  .print-report, .print-report * { box-sizing: border-box; }
  .print-report { font-family: Arial, Helvetica, 'Inter', sans-serif; color: var(--pr-text); background: var(--pr-bg); }
  .pr-page { padding: 0; }
  .pr-page + .pr-page { break-before: page; page-break-before: always; }
  .pr-header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid var(--pr-fill); padding-bottom: 11px; margin-bottom: 15px; }
  .pr-header-left { display: flex; align-items: center; gap: 12px; }
  .pr-header-logo-chip { background: var(--pr-chip); border: 1px solid var(--pr-line); border-radius: 4px; padding: 5px 9px; display: flex; align-items: center; }
  .pr-header-logo { width: 34px; height: 34px; object-fit: contain; display: block; }
  .pr-eyebrow { font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--pr-accent); font-weight: 700; }
  .pr-company-name { font-size: 22px; font-weight: 800; margin-top: 3px; color: var(--pr-text); }
  .pr-company-meta { font-size: 11px; color: var(--pr-muted); margin-top: 3px; }
  .pr-header-right { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .pr-header-brand { height: 20px; object-fit: contain; }
  .pr-header-meta { font-size: 10.5px; color: var(--pr-muted); white-space: nowrap; }
  .pr-block { margin-bottom: 15px; }
  .pr-block-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 9px; color: var(--pr-text); break-after: avoid; page-break-after: avoid; }
  .pr-block-sub { font-size: 10px; color: var(--pr-muted); margin: -5px 0 8px; break-after: avoid; }
  .pr-keep { break-inside: avoid; page-break-inside: avoid; }
  .pr-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .pr-kpi { background: var(--pr-card); border: 1px solid var(--pr-line); border-radius: 4px; padding: 11px 14px; }
  .pr-kpi-num { font-size: 26px; font-weight: 800; line-height: 1; }
  .pr-kpi-label { font-size: 10px; color: var(--pr-muted); margin-top: 5px; text-transform: uppercase; letter-spacing: .03em; }
  .pr-progress-row { display: flex; align-items: center; gap: 12px; }
  .pr-progress-track { flex: 1; height: 12px; background: var(--pr-track); border-radius: 3px; overflow: hidden; }
  .pr-progress-fill { height: 100%; background: var(--pr-fill); }
  .pr-progress-pct { font-size: 17px; font-weight: 800; width: 56px; text-align: right; color: var(--pr-accent); }
  .pr-phases-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 28px; }
  .pr-phase-row { display: flex; align-items: center; gap: 10px; font-size: 11px; }
  .pr-phase-name { width: 160px; flex-shrink: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pr-text); }
  .pr-phase-track { flex: 1; height: 7px; background: var(--pr-track); border-radius: 3px; overflow: hidden; }
  .pr-phase-fill { height: 100%; }
  .pr-phase-pct { width: 34px; text-align: right; font-weight: 700; font-size: 10.5px; color: var(--pr-muted); }
  .pr-table-wrap { border: 1px solid var(--pr-line); border-radius: 4px; overflow: hidden; }
  .pr-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .pr-table thead { display: table-header-group; }
  .pr-table tr { break-inside: avoid; page-break-inside: avoid; }
  .pr-table th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--pr-muted); border-bottom: 1px solid var(--pr-line); padding: 7px 10px; background: var(--pr-head); }
  .pr-table td { padding: 6px 10px; border-bottom: 1px solid var(--pr-line); vertical-align: top; color: var(--pr-text); }
  .pr-table tr:last-child td { border-bottom: none; }
  .pr-status-pill, .pr-countdown-pill { display: inline-block; padding: 2px 9px; border-radius: 3px; font-size: 9.5px; font-weight: 700; white-space: nowrap; }
  .pr-empty-row td { color: var(--pr-faint); font-style: italic; }
  .pr-sub-group { margin-bottom: 9px; }
  .pr-sub-head { break-after: avoid; page-break-after: avoid; display: flex; justify-content: space-between; gap: 10px; font-size: 11px; font-weight: 700; margin-bottom: 4px; }
  .pr-sub-head span:last-child { color: var(--pr-muted); font-weight: 600; font-size: 10px; white-space: nowrap; }
  .pr-tl { border: 1px solid var(--pr-line); border-radius: 4px; overflow: hidden; background: var(--pr-card); }
  .pr-tl-head, .pr-tl-row { display: grid; grid-template-columns: 34% 66%; align-items: center; }
  .pr-tl-head { background: var(--pr-head); border-bottom: 1px solid var(--pr-line); font-size: 9px; color: var(--pr-muted); text-transform: uppercase; letter-spacing: .05em; }
  .pr-tl-head > div { padding: 5px 8px; }
  .pr-tl-months { position: relative; height: 22px; padding: 0 !important; }
  .pr-tl-month { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--pr-line); padding: 6px 0 0 4px; font-size: 8.5px; white-space: nowrap; }
  .pr-tl-row { border-bottom: 1px solid var(--pr-line); break-inside: avoid; page-break-inside: avoid; min-height: 17px; }
  .pr-tl-row:last-child { border-bottom: none; }
  .pr-tl-name { padding: 3px 8px; font-size: 9.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pr-text); }
  .pr-tl-name.is-done { color: var(--pr-faint); }
  .pr-tl-track { position: relative; height: 17px; }
  .pr-tl-grid { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--pr-line); opacity: .55; }
  .pr-tl-bar { position: absolute; top: 4px; height: 9px; border-radius: 2px; min-width: 3px; }
  .pr-tl-today { position: absolute; top: 0; bottom: 0; border-left: 2px dashed var(--pr-bad); }
  .pr-tl-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 9px; color: var(--pr-muted); margin-top: 6px; }
  .pr-tl-legend i { display: inline-block; width: 10px; height: 6px; border-radius: 2px; margin-right: 5px; vertical-align: 1px; }
`;

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dayNum = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);

function ActivityTable({ rows, phases, theme, todayISO }) {
  const status = pdfStatusMeta(theme); const tones = pdfToneMeta(theme);
  return (
    <div className="pr-table-wrap">
      <table className="pr-table">
        <thead><tr><th>Atividade</th><th>Responsável</th><th>Fase</th><th>Data</th><th>Contagem</th><th>Status</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr className="pr-empty-row"><td colSpan={6}>Nenhuma atividade nesta lista.</td></tr>}
          {rows.map((a) => {
            const phase = phases.find((p) => p.id === a.phase);
            const sm = status[a.status] || status['nao-iniciado'];
            const cd = resumoCountdown(a, todayISO);
            const tone = tones[cd.tone] || tones.none;
            return (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>{a.responsible || '—'}</td>
                <td>{phase ? phase.name : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{resumoDateLabel(a)}{a.meetingTime ? ` às ${a.meetingTime}` : ''}</td>
                <td><span className="pr-countdown-pill" style={{ background: tone.bg, color: tone.color }}>{cd.label}</span></td>
                <td><span className="pr-status-pill" style={{ background: sm.bg, color: sm.color }}>{sm.label}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ rows, theme, todayISO }) {
  const t = PDF_THEMES[theme] || PDF_THEMES.dark; const status = pdfStatusMeta(theme);
  const dated = rows.filter((a) => a.date || a.endDate);
  if (!dated.length) return null;
  const starts = dated.map((a) => dayNum(a.date || a.endDate)); const ends = dated.map((a) => dayNum(a.endDate || a.date));
  const min = Math.min(...starts); const max = Math.max(...ends, min + 1);
  const span = max - min + 1; const pos = (n) => ((n - min) / span) * 100;
  const months = []; const first = new Date(min * 86400000); let y = first.getUTCFullYear(); let m = first.getUTCMonth();
  while (Date.UTC(y, m, 1) / 86400000 <= max) {
    const n = Math.max(Date.UTC(y, m, 1) / 86400000, min);
    months.push({ key: `${y}-${m}`, left: pos(n), label: `${MONTHS[m]}/${String(y).slice(2)}` });
    m += 1; if (m > 11) { m = 0; y += 1; }
  }
  const todayN = dayNum(todayISO); const showToday = todayN >= min && todayN <= max;
  const color = { 'nao-iniciado': t.faint, 'em-andamento': t.fill, pausado: t.warn, concluido: t.ok };
  return (
    <>
      <div className="pr-tl">
        <div className="pr-tl-head">
          <div>Atividade</div>
          <div className="pr-tl-months">
            {months.map((mo) => <div key={mo.key} className="pr-tl-month" style={{ left: `${mo.left}%` }}>{mo.label}</div>)}
          </div>
        </div>
        {dated.map((a) => {
          const s = dayNum(a.date || a.endDate); const e = dayNum(a.endDate || a.date);
          return (
            <div className="pr-tl-row" key={a.id}>
              <div className={`pr-tl-name${a.status === 'concluido' ? ' is-done' : ''}`}>{a.title}</div>
              <div className="pr-tl-track">
                {months.map((mo) => <div key={mo.key} className="pr-tl-grid" style={{ left: `${mo.left}%` }} />)}
                {showToday && <div className="pr-tl-today" style={{ left: `${pos(todayN)}%` }} />}
                <div className="pr-tl-bar" style={{ left: `${pos(s)}%`, width: `${Math.max(((e - s + 1) / span) * 100, 0.6)}%`, background: color[a.status] || t.faint, opacity: a.status === 'concluido' ? 0.7 : 1 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="pr-tl-legend">
        {Object.entries(status).map(([k, v]) => <span key={k}><i style={{ background: color[k] }} />{v.label}</span>)}
        {showToday && <span><i style={{ background: 'transparent', borderLeft: `2px dashed ${t.bad}`, width: 0, height: 9, borderRadius: 0 }} />Hoje</span>}
      </div>
    </>
  );
}

function meetingRows(activities, todayISO) {
  const out = [];
  for (const a of activities) {
    if (a.kind === 'reuniao' && a.status !== 'concluido' && a.date && a.date >= todayISO) out.push({ id: a.id, date: a.date, time: a.meetingTime || '', title: a.title, parent: '', who: a.responsible || '' });
    for (const s of (a.subactivities || [])) {
      if (s.deleted || s.done || s.kind !== 'reuniao' || !s.date || s.date < todayISO) continue;
      out.push({ id: s.id, date: s.date, time: '', title: s.title, parent: a.title, who: s.responsible || '' });
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.title.localeCompare(y.title));
}

function openSubs(a) { return (a.subactivities || []).filter((s) => !s.deleted && !s.done); }

export function PrintReport({ projects, generatedAt, options }) {
  const opt = options || PDF_DEFAULTS;
  const theme = opt.theme === 'light' ? 'light' : 'dark';
  const sec = { ...PDF_DEFAULTS.sections, ...(opt.sections || {}) };
  const orientation = opt.orientation === 'portrait' ? 'portrait' : 'landscape';
  const t = PDF_THEMES[theme]; const status = pdfStatusMeta(theme);
  const todayISO = toISODate(startOfDay(new Date()));
  const logo = t.logo === 'preto' ? pricetaxLogoPreto : pricetaxLogoBranco;
  const footer = projects.length === 1 ? `PRICETAX · ${projects[0].company.nomeFantasia || projects[0].company.name || 'Cronograma'}` : 'PRICETAX · Cronograma de Reforma Tributária';
  return (
    <div className="print-report" style={pdfCssVars(theme)}>
      <style>{css(theme, orientation, footer)}</style>
      {projects.map((p, i) => {
        const activities = (p.activities || []).filter((a) => !a.deleted);
        const total = activities.length;
        const doneCount = activities.filter((a) => a.status === 'concluido').length;
        const runCount = activities.filter((a) => a.status === 'em-andamento').length;
        const pct = total ? Math.round((doneCount / total) * 100) : 0;
        const isOverdue = (a) => a.status !== 'concluido' && (a.endDate || a.date) && (a.endDate || a.date) < todayISO;
        // Mesma ordem da aba Tabela (sortActivities), para o PDF reproduzir o que o usuário vê na tela.
        const overdue = sortActivities(activities.filter(isOverdue));
        const upcoming = sortActivities(activities.filter((a) => !isOverdue(a) && a.status !== 'concluido'));
        const concluded = sortActivities(activities.filter((a) => a.status === 'concluido'));
        const meetings = meetingRows(activities, todayISO);
        const companyName = p.company.nomeFantasia || p.company.name || 'Empresa sem nome';
        const subGroups = [...overdue, ...upcoming].filter((a) => openSubs(a).length > 0);
        return (
          <div className="pr-page" key={p.id}>
            <div className="pr-header">
              <div className="pr-header-left">
                {p.company.logo && <div className="pr-header-logo-chip"><img className="pr-header-logo" src={p.company.logo} alt="" /></div>}
                <div>
                  <div className="pr-eyebrow">Relatório de acompanhamento</div>
                  <div className="pr-company-name">{companyName}</div>
                  <div className="pr-company-meta">
                    {p.company.cnpj ? `CNPJ ${p.company.cnpj}` : 'CNPJ não informado'}
                    {p.company.regimeTributario ? ` · ${p.company.regimeTributario}` : ''}
                    {p.company.clientType && CLIENT_TYPE_META[p.company.clientType] ? ` · ${CLIENT_TYPE_META[p.company.clientType].label}` : ''}
                  </div>
                </div>
              </div>
              <div className="pr-header-right">
                <img className="pr-header-brand" src={logo} alt="PriceTax" />
                <div className="pr-header-meta">Gerado em {generatedAt}{projects.length > 1 ? <div>{i + 1} de {projects.length}</div> : null}</div>
              </div>
            </div>

            {sec.resumo && (
              <>
                <div className="pr-block pr-keep">
                  <div className="pr-kpis">
                    <div className="pr-kpi"><div className="pr-kpi-num" style={{ color: t.kpiTotal }}>{total}</div><div className="pr-kpi-label">Atividades no total</div></div>
                    <div className="pr-kpi"><div className="pr-kpi-num" style={{ color: t.kpiDone }}>{doneCount}</div><div className="pr-kpi-label">Concluídas</div></div>
                    <div className="pr-kpi"><div className="pr-kpi-num" style={{ color: t.kpiRun }}>{runCount}</div><div className="pr-kpi-label">Em andamento</div></div>
                    <div className="pr-kpi"><div className="pr-kpi-num" style={{ color: overdue.length ? t.bad : t.text }}>{overdue.length}</div><div className="pr-kpi-label">Em atraso</div></div>
                  </div>
                </div>
                <div className="pr-block pr-keep">
                  <div className="pr-block-title">Progresso geral</div>
                  <div className="pr-progress-row">
                    <div className="pr-progress-track"><div className="pr-progress-fill" style={{ width: `${pct}%` }} /></div>
                    <div className="pr-progress-pct">{pct}%</div>
                  </div>
                </div>
              </>
            )}

            {sec.fases && (
              <div className="pr-block pr-keep">
                <div className="pr-block-title">Progresso por fase</div>
                <div className="pr-phases-grid">
                  {p.phases.map((ph) => {
                    const phaseActs = activities.filter((a) => a.phase === ph.id);
                    const phasePct = phaseActs.length ? Math.round((phaseActs.filter((a) => a.status === 'concluido').length / phaseActs.length) * 100) : 0;
                    return (
                      <div className="pr-phase-row" key={ph.id}>
                        <div className="pr-phase-name">{ph.name}</div>
                        <div className="pr-phase-track"><div className="pr-phase-fill" style={{ width: `${phasePct}%`, background: ph.color || t.fill }} /></div>
                        <div className="pr-phase-pct">{phasePct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sec.timeline && (
              <div className="pr-block">
                <div className="pr-block-title">Linha do tempo</div>
                <Timeline rows={[...overdue, ...upcoming, ...concluded]} theme={theme} todayISO={todayISO} />
              </div>
            )}

            {sec.atrasadas && overdue.length > 0 && (
              <div className="pr-block">
                <div className="pr-block-title" style={{ color: t.bad }}>Em atraso ({overdue.length})</div>
                <ActivityTable rows={overdue} phases={p.phases} theme={theme} todayISO={todayISO} />
              </div>
            )}

            {sec.proximas && (
              <div className="pr-block">
                <div className="pr-block-title">Próximas etapas</div>
                <ActivityTable rows={upcoming} phases={p.phases} theme={theme} todayISO={todayISO} />
              </div>
            )}

            {sec.reunioes && (
              <div className="pr-block">
                <div className="pr-block-title">Próximas reuniões ({meetings.length})</div>
                <div className="pr-table-wrap">
                  <table className="pr-table">
                    <thead><tr><th>Data</th><th>Reunião</th><th>Atividade</th><th>Responsável</th></tr></thead>
                    <tbody>
                      {meetings.length === 0 && <tr className="pr-empty-row"><td colSpan={4}>Nenhuma reunião marcada.</td></tr>}
                      {meetings.map((m) => (
                        <tr key={m.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{WEEKDAYS[new Date(`${m.date}T12:00:00`).getDay()]} {fmtDate(m.date)}{m.time ? ` às ${m.time}` : ''}</td>
                          <td>{m.title}</td><td>{m.parent || '—'}</td><td>{m.who || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {sec.subs && subGroups.length > 0 && (
              <div className="pr-block">
                <div className="pr-block-title">Subatividades em aberto</div>
                {subGroups.map((a) => (
                  <div className="pr-sub-group" key={a.id}>
                    <div className="pr-sub-head"><span>{a.title}</span><span>{resumoDateLabel(a)}</span></div>
                    <div className="pr-table-wrap">
                      <table className="pr-table">
                        <thead><tr><th>Item</th><th>Tipo</th><th>Responsável</th><th>Data</th></tr></thead>
                        <tbody>
                          {openSubs(a).map((s) => (
                            <tr key={s.id}><td>{s.title}</td><td>{s.kind === 'reuniao' ? 'Reunião' : 'Trabalho'}</td><td>{s.responsible || '—'}</td><td style={{ whiteSpace: 'nowrap' }}>{s.date ? fmtDate(s.date) : '—'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sec.concluidas && (
              <div className="pr-block">
                <div className="pr-block-title">Atividades concluídas ({concluded.length})</div>
                <div className="pr-table-wrap">
                  <table className="pr-table">
                    <thead><tr><th>Atividade</th><th>Responsável</th><th>Fase</th><th>Data</th></tr></thead>
                    <tbody>
                      {concluded.length === 0 && <tr className="pr-empty-row"><td colSpan={4}>Nenhuma atividade concluída ainda.</td></tr>}
                      {concluded.map((a) => {
                        const phase = p.phases.find((ph) => ph.id === a.phase);
                        return <tr key={a.id}><td>{a.title}</td><td>{a.responsible || '—'}</td><td>{phase ? phase.name : '—'}</td><td>{resumoDateLabel(a)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="pr-block-sub" style={{ marginTop: 6 }}><span style={{ color: status.concluido.color }}>●</span> {doneCount} de {total} atividades concluídas</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
