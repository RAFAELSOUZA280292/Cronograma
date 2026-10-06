// Dossiê do cliente (2026-10-02, ver PROJECT_CONTEXT.md §63) — tela com o compilado de TODAS as
// reuniões de uma empresa, gerado pela RENATA (server/dossier.js). A geração leva minutos (a IA lê
// tudo), então o servidor roda em segundo plano e este painel acompanha por polling a cada 3s.
// Quem já tem um dossiê vê ele na hora; "Gerar de novo" só pede um novo, sem apagar o anterior até
// o novo ficar pronto. Exporta em Markdown (copiar/baixar — pra levar pro Claude, Drive, etc.) e em
// PDF (janela própria só pra imprimir, sem depender do tema do app).
import React, { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, Copy, Download, Printer, Loader2, AlertTriangle, Check, Sparkles, FileText } from 'lucide-react';
import { useIsMobile } from '../App.jsx';
import { apiGet, apiPost } from '../lib/api.js';
import { DialogOverlay } from '../ui/dialog.jsx';
import { dossierToMarkdown, dossierToHtml, fmtBR, WORKSTREAM_STATUS, DECISION_STATE, TODO_STATUS } from './dossierExport.js';

const DOSSIER_CSS = `
  .dos-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:1000; display:flex; justify-content:center; align-items:flex-start; padding:24px 12px; overflow-y:auto; }
  .dos-box { width:min(940px,100%); background:var(--bg-2); border:1px solid var(--border-2); border-radius:14px; padding:20px 24px 28px; color:var(--text-2); }
  .dos-head { display:flex; align-items:flex-start; gap:12px; justify-content:space-between; flex-wrap:wrap; margin-bottom:14px; }
  .dos-title { font-size:20px; font-weight:800; color:var(--text-1); display:flex; align-items:center; gap:8px; }
  .dos-sub { font-size:12px; color:var(--text-5); margin-top:3px; }
  .dos-actions { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .dos-btn { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; padding:7px 12px; border-radius:8px; cursor:pointer; background:var(--bg-3); border:1px solid var(--border-2); color:var(--text-2); font-family:inherit; }
  .dos-btn:hover:not(:disabled) { border-color:var(--border-3); color:var(--text-1); } .dos-btn:disabled { opacity:.5; cursor:default; }
  .dos-btn-primary { background:#F5C400; border-color:#F5C400; color:#111; } .dos-btn-primary:hover:not(:disabled) { color:#111; filter:brightness(.96); }
  .dos-banner { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 14px; border-radius:10px; font-size:12.5px; margin-bottom:12px; border:1px solid var(--border-2); background:var(--bg-3); }
  .dos-banner.warn { background:rgba(255,159,64,.1); border-color:rgba(255,159,64,.35); } .dos-banner.err { background:rgba(226,87,76,.1); border-color:rgba(226,87,76,.4); } .dos-banner.info { background:rgba(245,196,0,.1); border-color:rgba(245,196,0,.35); }
  .dos-bar { height:5px; border-radius:3px; background:var(--bg-4); overflow:hidden; flex:1; min-width:140px; } .dos-bar i { display:block; height:100%; background:#F5C400; transition:width .3s; }
  .dos-bar.ind i { width:35%; animation:dos-slide 1.4s ease-in-out infinite; } @keyframes dos-slide { 0% { margin-left:-35%; } 100% { margin-left:100%; } }
  .dos-spin { animation:dos-rot 1s linear infinite; } @keyframes dos-rot { to { transform:rotate(360deg); } }
  .dos-tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; margin:6px 0 4px; }
  .dos-tile { background:var(--bg-3); border:1px solid var(--border-1); border-radius:10px; padding:10px 12px; } .dos-tile b { display:block; font-size:19px; color:var(--text-1); } .dos-tile span { font-size:11px; color:var(--text-5); }
  .dos-tile.bad b { color:var(--ui-danger); }
  .dos-h { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-5); margin:24px 0 10px; padding-bottom:6px; border-bottom:1px solid var(--border-1); }
  .dos-p { font-size:13.5px; line-height:1.6; color:var(--text-2); margin:0 0 10px; white-space:pre-wrap; }
  .dos-item { padding:10px 0; border-bottom:1px solid var(--border-1); } .dos-item:last-child { border-bottom:none; }
  .dos-item-t { font-size:13.5px; font-weight:700; color:var(--text-1); } .dos-item-b { font-size:13px; color:var(--text-3); margin-top:3px; line-height:1.5; }
  .dos-date { font-size:11.5px; font-weight:700; color:var(--text-5); font-variant-numeric:tabular-nums; margin-right:8px; }
  .dos-card { background:var(--bg-3); border:1px solid var(--border-1); border-radius:10px; padding:12px 14px; margin-bottom:10px; }
  .dos-pts { margin:8px 0 0; padding-left:18px; font-size:12.5px; color:var(--text-3); line-height:1.55; }
  .dos-tag { display:inline-block; font-size:10px; font-weight:800; padding:2px 8px; border-radius:99px; background:var(--bg-4); color:var(--text-3); vertical-align:middle; margin-left:6px; }
  .dos-tag.em_andamento, .dos-tag.alterada { background:rgba(255,159,64,.18); color:#e08a2a; } .dos-tag.concluida, .dos-tag.vigente { background:rgba(62,207,110,.16); color:var(--ui-ok); }
  .dos-tag.revogada { background:rgba(226,87,76,.16); color:var(--ui-danger); } .dos-tag.incerta { background:rgba(245,196,0,.18); color:#b98900; }
  .dos-note { font-size:12px; color:#e08a2a; margin-top:3px; }
  .dos-srcs { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
  .dos-src { font-size:10.5px; font-weight:600; padding:2px 8px; border-radius:99px; background:var(--bg-4); border:1px solid var(--border-1); color:var(--text-4); cursor:pointer; font-family:inherit; }
  .dos-src:hover { color:var(--text-1); border-color:var(--border-3); }
  .dos-open { display:grid; grid-template-columns:minmax(0,2.2fr) minmax(0,1.1fr) minmax(0,.9fr) minmax(0,.9fr); gap:10px; padding:8px 0; border-bottom:1px solid var(--border-1); font-size:12.5px; align-items:start; }
  .dos-open.late .due { color:var(--ui-danger); font-weight:700; }
  .dos-sidehead { font-size:11.5px; font-weight:800; color:var(--text-4); margin:14px 0 2px; }
  .dos-foot { font-size:11px; color:var(--text-6); margin-top:22px; line-height:1.5; }
  @media (max-width:640px) { .dos-box { padding:16px 14px 22px; } .dos-open { grid-template-columns:1fr 1fr; } }

  .dos-btn:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) { .dos-btn { min-height:44px; } .dos-overlay { padding:0; } .dos-box { border-radius:0; } }
`;

function Sources({ ids, byId, onOpenMeeting }) {
  const list = (ids || []).map((id) => byId[id]).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="dos-srcs">
      {list.map((m) => (
        <button key={m.id} type="button" className="dos-src" onClick={() => onOpenMeeting(m.id)} title="Abrir esta reunião">{fmtBR(m.date) || 's/ data'} · {m.title || 'Reunião'}</button>
      ))}
    </div>
  );
}

function slug(s) { return String(s || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente'; }

export default function DossierPanel({ pid, companyName, onClose, onOpenMeeting }) {
  const isMobile = useIsMobile();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await apiGet(`/api/assistant/dossier?projectId=${encodeURIComponent(pid)}`));
      setLoadError('');
    } catch (e) { setLoadError(e.message || 'Não foi possível carregar o dossiê. Atualize a página e tente de novo.'); } finally { setLoading(false); }
  }, [pid]);

  useEffect(() => { load(); }, [load]);
  const generating = !!(state && state.current && state.current.status === 'generating');
  useEffect(() => {
    if (!generating) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [generating, load]);

  async function start() {
    setStarting(true); setActionError('');
    try { setState(await apiPost('/api/assistant/dossier', { projectId: pid })); } catch (e) { setActionError(e.message || 'Não foi possível iniciar a geração do dossiê. Tente de novo em instantes.'); } finally { setStarting(false); }
  }

  const dossier = state && state.dossier;
  const content = dossier && dossier.content;
  const cur = state && state.current;
  const stale = state && state.staleness;
  const staleTotal = stale ? stale.new + stale.changed + stale.removed : 0;
  const byId = {};
  ((content && content.meetings) || []).forEach((m) => { byId[m.id] = m; });
  // Espera a entrada de histórico deste painel sair antes de empilhar a da reunião (senão o Voltar do desempilhar desfaz a reunião).
  const openMeeting = (id) => { onClose(); setTimeout(() => onOpenMeeting(id), 150); };
  const fileBase = `dossie-${slug(companyName || (content && content.company))}-${new Date().toISOString().slice(0, 10)}`;

  async function copyMd() {
    try { await navigator.clipboard.writeText(dossierToMarkdown(content)); setCopied(true); setTimeout(() => setCopied(false), 2000); setActionError(''); } catch (e) { setActionError('O navegador não deixou copiar. Use "Baixar .md".'); }
  }
  function downloadMd() {
    const url = URL.createObjectURL(new Blob([dossierToMarkdown(content)], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${fileBase}.md`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function printPdf() {
    const w = window.open('', '_blank');
    if (!w) { setActionError('O navegador bloqueou a janela de impressão — libere pop-ups para este site e tente de novo.'); return; }
    w.document.open(); w.document.write(dossierToHtml(content)); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) { /* o usuário imprime pelo menu */ } }, 400);
  }

  const p = (cur && cur.progress) || {};
  const progressLabel = p.stage === 'consolidate'
    ? (p.total > 1 ? `Compilando o dossiê — parte ${Math.min((p.done || 0) + 1, p.total)} de ${p.total}…` : 'Compilando o dossiê com a IA… isso leva alguns minutos.')
    : (p.total > 0 ? `Lendo as reuniões — resumindo a transcrição ${Math.min((p.done || 0) + 1, p.total)} de ${p.total}…` : `Lendo as ${p.meetings || (state && state.meetingsNow) || ''} reuniões…`);
  const determinate = p.stage !== 'consolidate' && p.total > 0;

  return (
    <DialogOverlay className="dos-overlay" onClose={onClose} label="Dossiê do cliente">
      <style>{DOSSIER_CSS}</style>
      <div className="dos-box" onClick={(e) => e.stopPropagation()} style={isMobile ? { borderRadius: 10 } : undefined}>
        <div className="dos-head">
          <div>
            <div className="dos-title"><FileText size={20} color="#F5C400" /> Dossiê do cliente{companyName ? ` — ${companyName}` : ''}</div>
            <div className="dos-sub">
              {dossier ? `Gerado em ${new Date(dossier.finishedAt || dossier.createdAt).toLocaleString('pt-BR')}${dossier.createdByName ? ` por ${dossier.createdByName}` : ''}` : 'Compilado de todas as reuniões, feito pela RENATA'}
            </div>
          </div>
          <div className="dos-actions">
            {content && <button type="button" className="dos-btn" onClick={copyMd}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar (Markdown)'}</button>}
            {content && <button type="button" className="dos-btn" onClick={downloadMd}><Download size={13} /> Baixar .md</button>}
            {content && <button type="button" className="dos-btn" onClick={printPdf}><Printer size={13} /> PDF / Imprimir</button>}
            {state && !generating && <button type="button" className={`dos-btn ${content ? '' : 'dos-btn-primary'}`} onClick={start} disabled={starting || !state.meetingsNow} title={starting ? 'Aguarde terminar' : !state.meetingsNow ? 'Nenhuma reunião para compilar' : undefined}><RefreshCw size={13} className={starting ? 'dos-spin' : ''} /> {content ? 'Gerar de novo' : 'Gerar dossiê'}</button>}
            <button type="button" className="dos-btn" onClick={onClose} aria-label="Fechar"><X size={14} /></button>
          </div>
        </div>

        {loading && <div className="dos-p" style={{ color: 'var(--text-5)' }}>Carregando…</div>}
        {loadError && <div className="dos-banner err"><AlertTriangle size={15} color="#e2574c" /> {loadError}</div>}
        {actionError && <div className="dos-banner err"><AlertTriangle size={15} color="#e2574c" /> {actionError}</div>}

        {generating && (
          <div className="dos-banner info">
            <Loader2 size={15} className="dos-spin" color="#F5C400" />
            <span style={{ fontWeight: 700 }}>{progressLabel}</span>
            <div className={`dos-bar ${determinate ? '' : 'ind'}`}><i style={determinate ? { width: `${Math.round(((p.done || 0) / p.total) * 100)}%` } : undefined} /></div>
            <span style={{ color: 'var(--text-5)', fontSize: 11.5 }}>Pode fechar esta janela — continua em segundo plano.</span>
          </div>
        )}
        {cur && cur.status === 'error' && !generating && (
          <div className="dos-banner err"><AlertTriangle size={15} color="#e2574c" /> <span><b>A última geração falhou.</b> {cur.error}</span></div>
        )}
        {content && staleTotal > 0 && !generating && (
          <div className="dos-banner warn">
            <AlertTriangle size={15} color="#e08a2a" />
            <span>Desde este dossiê: {[stale.new && `${stale.new} reunião(ões) nova(s)`, stale.changed && `${stale.changed} alterada(s)`, stale.removed && `${stale.removed} removida(s)`].filter(Boolean).join(', ')}. Gere de novo para incluir.</span>
          </div>
        )}

        {state && !content && !generating && !(cur && cur.status === 'error') && (
          <div className="dos-card" style={{ textAlign: 'center', padding: '28px 20px' }}>
            <Sparkles size={22} color="#F5C400" />
            <div className="dos-item-t" style={{ marginTop: 8 }}>{state.meetingsNow ? `A RENATA vai ler as ${state.meetingsNow} reunião(ões) desta empresa e montar o dossiê.` : 'Esta empresa ainda não tem reuniões para compilar.'}</div>
            <div className="dos-item-b">Resumo executivo, linha do tempo, frentes de trabalho, decisões (e o que mudou), pendências, pessoas, riscos e lacunas — cada item com a reunião de origem. Leva alguns minutos.</div>
          </div>
        )}

        {content && (
          <div>
            <div className="dos-tiles">
              <div className="dos-tile"><b>{content.stats.meetingsTotal}</b><span>reuniões{content.stats.period.from ? ` · ${fmtBR(content.stats.period.from)} a ${fmtBR(content.stats.period.to)}` : ''}</span></div>
              <div className="dos-tile"><b>{content.stats.activities.open}</b><span>tarefas abertas (de {content.stats.activities.total})</span></div>
              <div className={`dos-tile ${content.stats.activities.overdue ? 'bad' : ''}`}><b>{content.stats.activities.overdue}</b><span>vencidas</span></div>
              <div className="dos-tile"><b>{content.stats.meetingsWithContent}/{content.stats.meetingsTotal}</b><span>reuniões com conteúdo{content.stats.meetingsFromTranscript ? ` (${content.stats.meetingsFromTranscript} resumidas da transcrição)` : ''}</span></div>
            </div>

            {content.executiveSummary && (<><div className="dos-h">Resumo executivo</div>{content.executiveSummary.split(/\n{2,}/).map((t, i) => <p key={i} className="dos-p">{t}</p>)}</>)}

            {content.timeline.length > 0 && (<><div className="dos-h">Linha do tempo</div>{content.timeline.map((t, i) => (
              <div key={i} className="dos-item"><div className="dos-item-t"><span className="dos-date">{fmtBR(t.date) || 's/ data'}</span>{t.title}</div><div className="dos-item-b">{t.summary}</div><Sources ids={t.meetingIds} byId={byId} onOpenMeeting={openMeeting} /></div>
            ))}</>)}

            {content.workstreams.length > 0 && (<><div className="dos-h">Frentes de trabalho</div>{content.workstreams.map((w, i) => (
              <div key={i} className="dos-card"><div className="dos-item-t">{w.name}<span className={`dos-tag ${w.status}`}>{WORKSTREAM_STATUS[w.status] || w.status}</span></div><div className="dos-item-b">{w.description}</div>
                {w.keyPoints.length > 0 && <ul className="dos-pts">{w.keyPoints.map((k, j) => <li key={j}>{k}</li>)}</ul>}
                <Sources ids={w.meetingIds} byId={byId} onOpenMeeting={openMeeting} /></div>
            ))}</>)}

            {content.decisions.length > 0 && (<><div className="dos-h">Decisões</div>{content.decisions.map((d, i) => (
              <div key={i} className="dos-item"><div className="dos-item-t"><span className="dos-date">{fmtBR(d.date) || 's/ data'}</span>{d.decision}<span className={`dos-tag ${d.state}`}>{DECISION_STATE[d.state] || d.state}</span></div>
                {d.note && <div className="dos-note">{d.note}</div>}<Sources ids={d.meetingIds} byId={byId} onOpenMeeting={openMeeting} /></div>
            ))}</>)}

            {content.openItems.length > 0 && (<><div className="dos-h">Pendências em aberto <span style={{ textTransform: 'none', fontWeight: 600, letterSpacing: 0 }}>— direto dos dados do sistema, não da IA</span></div>
              {['pricetax', 'cliente'].map((side) => {
                const rows = content.openItems.filter((it) => it.side === side);
                if (!rows.length) return null;
                return (
                  <div key={side}><div className="dos-sidehead">{side === 'pricetax' ? 'Lado PRICETAX' : 'Lado do cliente'} ({rows.length})</div>
                    {rows.map((it, i) => (
                      <div key={i} className={`dos-open ${it.overdue ? 'late' : ''}`}>
                        <div><b style={{ color: 'var(--text-1)' }}>{it.title}</b>{it.subtitle ? <div style={{ color: 'var(--text-5)' }}>{it.subtitle}</div> : null}<button type="button" className="dos-src" style={{ marginTop: 4 }} onClick={() => openMeeting(it.meetingId)}>{fmtBR(it.meetingDate) || 's/ data'} · {it.meetingTitle || 'Reunião'}</button></div>
                        <div>{it.responsible || <span style={{ color: 'var(--text-6)' }}>sem responsável</span>}</div>
                        <div>{TODO_STATUS[it.status] || it.status}</div>
                        <div className="due">{fmtBR(it.dueDate) || '—'}{it.overdue ? ' · vencido' : ''}</div>
                      </div>
                    ))}</div>
                );
              })}</>)}

            {content.people.length > 0 && (<><div className="dos-h">Pessoas</div>{content.people.map((pp, i) => (
              <div key={i} className="dos-item"><div className="dos-item-t">{pp.name}{[pp.role, pp.organization].filter(Boolean).length ? <span style={{ fontWeight: 500, color: 'var(--text-5)' }}> · {[pp.role, pp.organization].filter(Boolean).join(' · ')}</span> : null}</div>{pp.notes && <div className="dos-item-b">{pp.notes}</div>}</div>
            ))}</>)}

            {content.risks.length > 0 && (<><div className="dos-h">Riscos e dependências</div>{content.risks.map((r, i) => (
              <div key={i} className="dos-item"><div className="dos-item-t">{r.risk}</div><div className="dos-item-b">{r.why}</div><Sources ids={r.meetingIds} byId={byId} onOpenMeeting={openMeeting} /></div>
            ))}</>)}

            {content.gaps.length > 0 && (<><div className="dos-h">Lacunas e pontos a esclarecer</div>{content.gaps.map((g, i) => (
              <div key={i} className="dos-item"><div className="dos-item-t">{g.question}</div><div className="dos-item-b">{g.why}</div><Sources ids={g.meetingIds} byId={byId} onOpenMeeting={openMeeting} /></div>
            ))}</>)}

            {content.notes && content.notes.meetingsWithoutContent.length > 0 && (
              <div className="dos-banner warn" style={{ marginTop: 18 }}><AlertTriangle size={15} color="#e08a2a" /><span>{content.notes.meetingsWithoutContent.length} reunião(ões) não têm resumo, decisões, tarefas nem transcrição registrados e ficaram de fora do conteúdo: {content.notes.meetingsWithoutContent.map((id) => (byId[id] ? `${fmtBR(byId[id].date)} ${byId[id].title}` : id)).join('; ')}.</span></div>
            )}
            {content.notes && content.notes.digestFailures > 0 && (
              <div className="dos-banner warn"><AlertTriangle size={15} color="#e08a2a" /><span>Não foi possível resumir a transcrição de {content.notes.digestFailures} reunião(ões); elas entraram só com o que já estava registrado. Gerar de novo tenta outra vez.</span></div>
            )}
            <div className="dos-foot">Gerado por IA a partir somente das reuniões registradas neste sistema. Pode conter imprecisões: confira nas reuniões de origem (botões acima) antes de usar numa decisão.</div>
          </div>
        )}
      </div>
    </DialogOverlay>
  );
}
