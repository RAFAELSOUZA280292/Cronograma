// Auditoria de uma empresa contra o padrão de cronograma (2026-10-19). Botão "Auditoria" no cabeçalho da empresa (equipe PRICETAX). SOMENTE LEITURA: mostra
// o que está conforme, o que falta (atividades ausentes), o comparativo de datas com o padrão, o conteúdo (descrição/subatividades) e alertas de coerência.
// Os dados vêm de GET /api/standard-plan/audit/:id (server/standardAudit.js). Corrigir é com as ferramentas de sempre (aba Padrão da Visão Geral, edição normal).
import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui/dialog.jsx';
import { Button, ErrorState, SkeletonCards } from '../ui/index.jsx';
import { apiGet } from '../lib/api.js';
import { loadXlsx } from '../lib/xlsxLoader.js';
import { notify } from '../ui/dialogs.jsx';

const fd = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '—');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const STATUS = { 'nao-iniciado': 'Não iniciada', 'em-andamento': 'Em andamento', pausado: 'Pausada', concluido: 'Concluída' };
const DATE_LABEL = { 'no-prazo': 'No prazo', depois: 'Depois do padrão', antes: 'Antes do padrão', 'sem-data': 'Sem data', 'padrao-sem-data': 'Padrão sem data', 'sem-referencia': 'Sem referência' };
const DATE_TONE = { 'no-prazo': 'ok', depois: 'warn', antes: 'info', 'sem-data': 'bad', 'padrao-sem-data': 'info', 'sem-referencia': 'info' };
const DESC_LABEL = { 'padrao-novo': 'Padrão novo', 'padrao-antigo': 'Padrão antigo (atualizável)', personalizada: 'Personalizada', vazia: 'Vazia' };
const DESC_TONE = { 'padrao-novo': 'ok', 'padrao-antigo': 'warn', personalizada: 'info', vazia: 'bad' };
const SEV_LABEL = { naoConforme: 'Não conforme', atencao: 'Atenção', info: 'Informativo' };
const SEV_TONE = { naoConforme: 'bad', atencao: 'warn', info: 'info' };
const diffText = (n) => (n === null || n === undefined ? '—' : n === 0 ? 'igual' : `${n > 0 ? '+' : '−'}${Math.abs(n)} dia${Math.abs(n) === 1 ? '' : 's'}`);

const CSS = `
  .sa { display:flex; flex-direction:column; gap:18px; font-size:13px; color:var(--text-2); }
  .sa h3 { margin:0 0 8px; font-size:12px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--text-4); }
  .sa-tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:8px; }
  .sa-tile { background:var(--bg-2); border:1px solid var(--border-2); border-radius:12px; padding:10px 12px; min-width:0; }
  .sa-tile b { display:block; font-size:22px; line-height:1.1; color:var(--text-1); font-variant-numeric:tabular-nums; }
  .sa-tile span { display:block; margin-top:3px; font-size:11.5px; color:var(--text-4); }
  .sa-tile.bad b { color:#e2574c; } .sa-tile.warn b { color:#ff9f40; } .sa-tile.ok b { color:#3ecf6e; }
  .sa-note { font-size:12px; line-height:1.5; color:var(--text-3); background:var(--bg-3); border:1px solid var(--border-1); border-radius:10px; padding:8px 10px; }
  .sa-list { display:flex; flex-direction:column; gap:6px; }
  .sa-card { background:var(--bg-2); border:1px solid var(--border-1); border-radius:10px; padding:9px 11px; display:flex; flex-direction:column; gap:3px; min-width:0; }
  .sa-card-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .sa-title { font-weight:700; color:var(--text-1); overflow-wrap:anywhere; }
  .sa-sub { font-size:12px; color:var(--text-4); overflow-wrap:anywhere; }
  .sa-chip { display:inline-block; font-size:10.5px; font-weight:700; border-radius:999px; padding:1px 8px; border:1px solid var(--border-2); color:var(--text-3); white-space:nowrap; }
  .sa-chip.ok { color:#3ecf6e; border-color:rgba(62,207,110,.5); } .sa-chip.warn { color:#ff9f40; border-color:rgba(255,159,64,.5); }
  .sa-chip.bad { color:#e2574c; border-color:rgba(226,87,76,.5); } .sa-chip.info { color:#6aa9ff; border-color:rgba(62,166,255,.5); }
  .sa-link { background:none; border:0; padding:0; color:var(--ui-accent, #F5C400); font:inherit; font-weight:700; cursor:pointer; text-decoration:underline; text-align:left; }
  .sa-wrap { overflow-x:auto; border:1px solid var(--border-1); border-radius:10px; }
  .sa-table { width:100%; border-collapse:collapse; font-size:12.5px; min-width:760px; }
  .sa-table th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-5); padding:8px 10px; background:var(--bg-2); border-bottom:1px solid var(--border-1); white-space:nowrap; }
  .sa-table td { padding:8px 10px; border-bottom:1px solid var(--border-1); vertical-align:top; }
  .sa-table tr:last-child td { border-bottom:0; }
  .sa-num { font-variant-numeric:tabular-nums; white-space:nowrap; }
  .sa details summary { cursor:pointer; color:var(--text-3); font-size:12px; }
  .sa details ul { margin:4px 0 0; padding-left:18px; color:var(--text-3); font-size:12px; line-height:1.55; }
  .sa-empty { color:var(--text-4); font-size:12.5px; padding:6px 2px; }
  .sa-actions { display:flex; flex-wrap:wrap; gap:8px; }
  body:has(.sa) .asst-fab { display:none !important; }
  @media (max-width: 767px) { .sa details summary { min-height:44px; display:flex; align-items:center; } .sa-link { min-height:44px; display:inline-flex; align-items:center; } }
`;

function Chip({ tone, children }) { return <span className={`sa-chip ${tone || ''}`}>{children}</span>; }

function buildText(a) {
  const s = a.summary; const L = [];
  L.push(`AUDITORIA DO PADRÃO — ${a.company.label}`);
  L.push(`Gerada em ${fd(a.today)}. Referência de datas: kickoff da empresa em ${fd(a.reference.kickoffCompany)} (padrão: ${fd(a.reference.kickoffStandard)}); tolerância de ${a.toleranceDays} dias.`);
  L.push('');
  L.push(`Atividades do padrão presentes: ${s.present} de ${s.standardTotal} (${s.exact} exatas, ${s.toConfirm} a confirmar). Ausentes: ${s.missing}. Extras do engajamento: ${s.extras}.`);
  L.push(`Datas: ${s.dates.onTime} no prazo, ${s.dates.after} depois, ${s.dates.before} antes do padrão, ${s.dates.noDate} sem data.`);
  L.push(`Subatividades do padrão: ${s.subs.present} de ${s.subs.expected}. Fases: ${s.phasesStatus === 'igual' ? 'iguais ao padrão' : 'diferentes do padrão'}.`);
  L.push(`Alertas: ${s.findings.naoConforme} não conforme(s), ${s.findings.atencao} de atenção, ${s.findings.info} informativo(s).`);
  L.push('');
  L.push('ATIVIDADES AUSENTES:'); if (!a.missing.length) L.push('- nenhuma');
  a.missing.forEach((m) => L.push(`- ${m.title} (${m.kind === 'nova' ? 'nova no padrão' : 'do modelo'}; responsável ${m.responsible}; fase ${m.phase})${m.suggestion ? ` — possível equivalente: ${m.suggestion.title}` : ''}`));
  L.push(''); L.push('COMPARATIVO DE DATAS (diferença em relação ao padrão deslocado para o kickoff da empresa):');
  a.matches.forEach((m) => L.push(`- ${m.title} ↔ ${m.activity.title}: padrão ${fd(m.dates.std)} → a partir do kickoff ${fd(m.dates.stdRel)}; empresa ${fd(m.dates.company)}; ${DATE_LABEL[m.dates.status]} (${diffText(m.dates.diffRel)})`));
  L.push(''); L.push('EQUIVALÊNCIAS A CONFIRMAR:'); const tc = a.matches.filter((m) => m.level === 'provavel'); if (!tc.length) L.push('- nenhuma');
  tc.forEach((m) => L.push(`- padrão "${m.title}" ↔ empresa "${m.activity.title}" (${m.why})`));
  L.push(''); L.push('ALERTAS:'); if (!a.findings.length) L.push('- nenhum');
  a.findings.forEach((f) => L.push(`- [${SEV_LABEL[f.sev]}] ${f.title}${f.activityTitle ? ` — ${f.activityTitle}` : ''}: ${f.detail}`));
  L.push(''); L.push('EXTRAS DO ENGAJAMENTO (fora do padrão):'); if (!a.extras.length) L.push('- nenhum');
  a.extras.forEach((x) => L.push(`- ${x.title}${x.date ? ` (${fd(x.date)})` : ' (sem data)'}`));
  L.push(''); L.push(`FASES — empresa: ${a.phases.company.join(', ') || '—'} | padrão: ${a.phases.standard.join(', ')}`);
  return L.join('\n');
}

async function downloadXlsx(a) {
  let X; try { X = await loadXlsx(); } catch { notify('Não foi possível preparar a planilha agora. Recarregue a página e tente de novo.', { tone: 'error' }); return; }
  const s = a.summary;
  const wb = X.utils.book_new();
  const add = (name, rows) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), name);
  add('Resumo', [['Auditoria do padrão', a.company.label], ['Gerada em', fd(a.today)], ['Kickoff da empresa', fd(a.reference.kickoffCompany)], ['Kickoff do padrão', fd(a.reference.kickoffStandard)],
    ['Atividades do padrão presentes', `${s.present} de ${s.standardTotal}`], ['Ausentes', s.missing], ['A confirmar', s.toConfirm], ['Extras', s.extras],
    ['Datas no prazo', s.dates.onTime], ['Datas depois do padrão', s.dates.after], ['Datas antes do padrão', s.dates.before], ['Sem data', s.dates.noDate],
    ['Subatividades do padrão', `${s.subs.present} de ${s.subs.expected}`], ['Fases', s.phasesStatus], ['Alertas não conformes', s.findings.naoConforme], ['Alertas de atenção', s.findings.atencao]]);
  add('Ausentes', [['Atividade do padrão', 'Tipo', 'Responsável', 'Fase', 'Subatividades', 'Possível equivalente'], ...a.missing.map((m) => [m.title, m.kind === 'nova' ? 'Nova no padrão' : 'Do modelo', m.responsible, m.phase, m.subs.length, m.suggestion ? m.suggestion.title : ''])]);
  add('Datas', [['Atividade do padrão', 'Atividade da empresa', 'Equivalência', 'Padrão (absoluto)', 'Padrão a partir do kickoff da empresa', 'Empresa (início)', 'Empresa (fim)', 'Diferença (dias)', 'Situação'],
    ...a.matches.map((m) => [m.title, m.activity.title, m.level === 'exato' ? 'Exata' : 'A confirmar', fd(m.dates.std), fd(m.dates.stdRel), fd(m.dates.company), fd(m.dates.companyEnd), m.dates.diffRel ?? '', DATE_LABEL[m.dates.status]])]);
  add('Conteúdo', [['Atividade do padrão', 'Atividade da empresa', 'Descrição', 'Subatividades presentes', 'Subatividades esperadas', 'Faltando'],
    ...a.matches.map((m) => [m.title, m.activity.title, DESC_LABEL[m.desc], m.subs.present, m.subs.expected, m.subs.missing.join(' | ')])]);
  add('Alertas', [['Gravidade', 'Alerta', 'Atividade', 'Detalhe'], ...a.findings.map((f) => [SEV_LABEL[f.sev], f.title, f.activityTitle, f.detail])]);
  add('Extras', [['Atividade', 'Responsável', 'Data', 'Status'], ...a.extras.map((x) => [x.title, x.responsible, fd(x.date), STATUS[x.status] || x.status])]);
  const safe = String(a.company.label).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'empresa';
  X.writeFile(wb, `auditoria-padrao-${safe}-${a.today}.xlsx`);
}

export default function StandardAuditModal({ projectId, companyLabel, onClose, onOpenActivity }) {
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setAudit(null); setError('');
    apiGet(`/api/standard-plan/audit/${encodeURIComponent(projectId)}`).then((r) => { if (r && r.audit) setAudit(r.audit); else setError('Resposta inesperada do servidor.'); }).catch((e) => setError((e && e.message) || 'Não foi possível auditar agora.'));
  }, [projectId]);
  useEffect(load, [load]);

  async function copy() {
    try { await navigator.clipboard.writeText(buildText(audit)); notify('Relatório copiado.', { tone: 'success' }); } catch { notify('Não consegui copiar. Use "Baixar Excel".', { tone: 'error' }); }
  }
  const open = (id) => { if (id && onOpenActivity) onOpenActivity(id); };
  const s = audit && audit.summary;

  return (
    <Modal title="Auditoria do padrão" subtitle={companyLabel} size="lg" width="min(1080px, 100%)" onClose={onClose}
      footer={audit ? <div className="sa-actions"><Button onClick={copy}>Copiar relatório</Button><Button variant="primary" onClick={() => downloadXlsx(audit)}>Baixar Excel</Button></div> : null}>
      <style>{CSS}</style>
      {!audit && !error && <SkeletonCards count={3} />}
      {error && <ErrorState title="Não foi possível auditar" message={error} onRetry={load} />}
      {audit && (
        <div className="sa">
          <div className="sa-tiles">
            <div className={`sa-tile ${s.missing ? 'bad' : 'ok'}`}><b>{s.present} de {s.standardTotal}</b><span>atividades do padrão presentes</span></div>
            <div className={`sa-tile ${s.missing ? 'bad' : 'ok'}`}><b>{s.missing}</b><span>ausentes</span></div>
            <div className={`sa-tile ${s.toConfirm ? 'warn' : 'ok'}`}><b>{s.toConfirm}</b><span>equivalências a confirmar</span></div>
            <div className="sa-tile"><b>{s.dates.onTime}</b><span>datas no prazo (de {s.present})</span></div>
            <div className={`sa-tile ${s.dates.after || s.dates.before ? 'warn' : 'ok'}`}><b>{s.dates.after + s.dates.before}</b><span>datas fora do padrão ({s.dates.after} depois, {s.dates.before} antes)</span></div>
            <div className="sa-tile"><b>{s.subs.present} de {s.subs.expected}</b><span>subatividades do padrão</span></div>
            <div className={`sa-tile ${s.findings.naoConforme ? 'bad' : s.findings.atencao ? 'warn' : 'ok'}`}><b>{s.findings.naoConforme + s.findings.atencao}</b><span>alertas ({s.findings.naoConforme} não conforme, {s.findings.atencao} atenção)</span></div>
            <div className="sa-tile"><b>{s.extras}</b><span>extras do engajamento (fora do padrão)</span></div>
          </div>
          <div className="sa-note">
            Padrão usado: modelo de {s.standardTotal} atividades ({plural(s.standardTotal - 3, 'do modelo', 'do modelo')} + 3 novas). Datas comparadas a partir do kickoff: kickoff da empresa em <b>{fd(audit.reference.kickoffCompany)}</b> ({audit.reference.basedOn === 'kickoff' ? 'atividade equivalente ao Kickoff' : 'data mais antiga, pois não há Kickoff equivalente'}); no padrão, em {fd(audit.reference.kickoffStandard)}. Tolerância de {audit.toleranceDays} dias. Esta tela só lê: nada é alterado.
          </div>

          <section>
            <h3>Atividades ausentes do padrão ({audit.missing.length})</h3>
            {audit.missing.length === 0 ? <div className="sa-empty">Nenhuma: todas as atividades do padrão têm equivalente na empresa.</div> : (
              <div className="sa-list">
                {audit.missing.map((m) => (
                  <div key={m.key} className="sa-card">
                    <div className="sa-card-top"><span className="sa-title">{m.title}</span><Chip tone={m.kind === 'nova' ? 'info' : 'warn'}>{m.kind === 'nova' ? 'Nova no padrão' : 'Do modelo'}</Chip><Chip>{m.responsible}</Chip><Chip>{m.phase}</Chip></div>
                    <div className="sa-sub">{m.desc}</div>
                    <div className="sa-sub">{plural(m.subs.length, 'subatividade', 'subatividades')} no padrão{m.stdDate ? ` · data no padrão: ${fd(m.stdDate)}` : ' · sem data no padrão (o time define)'}</div>
                    {m.suggestion && <div className="sa-sub">Possível equivalente: <button type="button" className="sa-link" onClick={() => open(m.suggestion.activityId)}>{m.suggestion.title}</button> (só o título lembra; confirme)</div>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3>Comparativo de datas com o padrão</h3>
            <div className="sa-wrap">
              <table className="sa-table">
                <thead><tr><th>Atividade do padrão</th><th>Na empresa</th><th>Padrão (absoluto)</th><th>Padrão a partir do kickoff</th><th>Empresa</th><th>Diferença</th><th>Situação</th></tr></thead>
                <tbody>
                  {audit.matches.map((m) => (
                    <tr key={m.key}>
                      <td><b>{m.title}</b></td>
                      <td><button type="button" className="sa-link" onClick={() => open(m.activity.id)}>{m.activity.title}</button>{m.level === 'provavel' && <> <Chip tone="warn">a confirmar</Chip></>}</td>
                      <td className="sa-num">{fd(m.dates.std)}{m.dates.stdEnd && m.dates.stdEnd !== m.dates.std ? ` → ${fd(m.dates.stdEnd)}` : ''}</td>
                      <td className="sa-num">{fd(m.dates.stdRel)}</td>
                      <td className="sa-num">{fd(m.dates.company)}{m.dates.companyEnd && m.dates.companyEnd !== m.dates.company ? ` → ${fd(m.dates.companyEnd)}` : ''}</td>
                      <td className="sa-num">{diffText(m.dates.diffRel)}</td>
                      <td><Chip tone={DATE_TONE[m.dates.status]}>{DATE_LABEL[m.dates.status]}</Chip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {audit.matches.some((m) => m.level === 'provavel') && (
            <section>
              <h3>Equivalências a confirmar ({audit.matches.filter((m) => m.level === 'provavel').length})</h3>
              <div className="sa-list">
                {audit.matches.filter((m) => m.level === 'provavel').map((m) => (
                  <div key={m.key} className="sa-card">
                    <div className="sa-card-top"><span className="sa-sub">Padrão</span><span className="sa-title">{m.title}</span><span className="sa-sub">↔ empresa</span><button type="button" className="sa-link" onClick={() => open(m.activity.id)}>{m.activity.title}</button></div>
                    <div className="sa-sub">Motivo: {m.why}. Se a equivalência estiver errada, a atividade do padrão passa a contar como ausente.</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3>Conteúdo: descrição e subatividades do padrão</h3>
            <div className="sa-wrap">
              <table className="sa-table">
                <thead><tr><th>Atividade do padrão</th><th>Descrição</th><th>Subatividades do padrão presentes</th><th>Responsável</th></tr></thead>
                <tbody>
                  {audit.matches.map((m) => (
                    <tr key={m.key}>
                      <td><b>{m.title}</b></td>
                      <td><Chip tone={DESC_TONE[m.desc]}>{DESC_LABEL[m.desc]}</Chip></td>
                      <td>{m.subs.expected === 0 ? <span className="sa-sub">o padrão não tem subatividades aqui</span> : (
                        <details><summary>{m.subs.present} de {m.subs.expected}{m.subs.missing.length ? ` — faltam ${m.subs.missing.length}` : ' — completo'}</summary>{m.subs.missing.length > 0 && <ul>{m.subs.missing.map((t) => <li key={t}>{t}</li>)}</ul>}</details>)}</td>
                      <td>{m.responsible.ok ? <Chip tone="ok">{m.responsible.actual}</Chip> : <span>{m.responsible.actual || '—'} <span className="sa-sub">(padrão: {m.responsible.expected})</span></span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3>Alertas de coerência ({audit.findings.length})</h3>
            {audit.findings.length === 0 ? <div className="sa-empty">Nenhum alerta.</div> : (
              <div className="sa-list">
                {['naoConforme', 'atencao', 'info'].flatMap((sev) => audit.findings.filter((f) => f.sev === sev)).map((f, i) => (
                  <div key={`${f.code}-${f.activityId}-${i}`} className="sa-card">
                    <div className="sa-card-top"><Chip tone={SEV_TONE[f.sev]}>{SEV_LABEL[f.sev]}</Chip><span className="sa-title">{f.title}</span>{f.activityId && <button type="button" className="sa-link" onClick={() => open(f.activityId)}>{f.activityTitle || '(sem título)'}</button>}</div>
                    <div className="sa-sub">{f.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3>Fases</h3>
            <div className="sa-note">
              <Chip tone={audit.phases.status === 'igual' ? 'ok' : 'warn'}>{audit.phases.status === 'igual' ? 'Iguais ao padrão' : 'Diferentes do padrão'}</Chip>{' '}
              Empresa: {audit.phases.company.join(' · ') || '—'}. Padrão: {audit.phases.standard.join(' · ')}.
            </div>
          </section>

          <section>
            <h3>Extras do engajamento — fora do padrão ({audit.extras.length})</h3>
            {audit.extras.length === 0 ? <div className="sa-empty">Nenhuma.</div> : (
              <div className="sa-list">
                {audit.extras.map((x) => (
                  <div key={x.id} className="sa-card"><div className="sa-card-top"><button type="button" className="sa-link" onClick={() => open(x.id)}>{x.title || '(sem título)'}</button><Chip>{x.responsible || 'sem responsável'}</Chip><Chip>{x.date ? fd(x.date) : 'sem data'}</Chip><Chip>{STATUS[x.status] || x.status}</Chip></div></div>
                ))}
                <div className="sa-sub">Extras não são erro: são etapas próprias deste engajamento que o modelo não tem.</div>
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
