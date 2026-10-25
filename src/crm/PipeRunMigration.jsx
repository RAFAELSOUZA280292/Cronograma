// Migração PipeRun → CRM (§84). Só o administrador do CRM. Quatro etapas: Extrair (API, só leitura) › Revisar (prévia, nada gravado) › Importar › Conferir (relatório de divergências).
// O token do PipeRun é digitado aqui, vai uma vez ao servidor e não fica guardado em lugar nenhum (nem neste navegador).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, AlertTriangle, DatabaseBackup } from 'lucide-react';
import { crm } from './crmApi.js';
import { Modal } from './ui.jsx';
import { guardedModal } from '../ui/SafeBoundary.jsx';
import { askConfirm, notify } from '../ui/dialogs.jsx';

const ENTITY_LABEL = { users: 'usuários', pipelines: 'funis', stages: 'etapas', origins: 'origens', lostReasons: 'motivos de perda', activityTypes: 'tipos de atividade', customFields: 'campos personalizados', segments: 'segmentos', tags: 'tags', items: 'produtos', companies: 'empresas', persons: 'pessoas', deals: 'negócios', activities: 'atividades', notes: 'anotações', proposals: 'propostas', files: 'arquivos', emails: 'e-mails', cnaes: 'CNAEs' };
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fdt = (ts) => { try { return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

function downloadCsv(name, cols, rows) {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const body = [cols.map((c) => esc(c[1])).join(';'), ...rows.map((r) => cols.map(([k]) => esc(r[k])).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' })); a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function ProgressBar({ progress }) {
  const p = progress || {};
  const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : (p.step && p.steps ? Math.round((p.step / p.steps) * 100) : 0);
  const label = p.phase === 'extract' ? `Extraindo ${ENTITY_LABEL[p.label] || p.label || ''}…${p.total ? ` ${p.got}/${p.total}` : ''}` : `${p.phase || 'Preparando'}…${p.total ? ` ${p.done}/${p.total}` : ''}`;
  return (
    <div role="status" aria-live="polite">
      <div className="crm-muted" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ height: 10, borderRadius: 6, background: 'var(--bg-4)', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: '#F5C400', transition: 'width .4s' }} /></div>
    </div>
  );
}

function Tile({ label, value, sub, tone }) {
  return <div className="crm-card"><div className="crm-kpi-value" style={tone ? { color: tone } : undefined}>{value}</div><div className="crm-kpi-label">{label}</div>{sub && <div className="crm-kpi-sub">{sub}</div>}</div>;
}

function PipeRunMigration({ onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState(null);
  const [ownerMap, setOwnerMap] = useState({});
  const [includeFiles, setIncludeFiles] = useState(true);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);

  const refresh = useCallback(async () => { try { const s = await crm.pipeRunStatus(); setStatus(s); return s; } catch (e) { setError(e.message || 'Não foi possível consultar a migração.'); return null; } }, []);
  useEffect(() => { refresh().then((s) => { if (s && s.runs[0] && s.runs[0].status === 'running') setStep(s.runs[0].kind === 'import' ? 3 : 1); else if (s && s.counts && s.counts.deals) setStep(2); }); }, [refresh]);
  const running = status && status.runs[0] && status.runs[0].status === 'running' ? status.runs[0] : null;
  useEffect(() => {
    if (!running) return undefined;
    timer.current = setInterval(refresh, 1500);
    return () => clearInterval(timer.current);
  }, [running, refresh]);

  // quando uma execução termina, avança sozinho
  const lastRun = status && status.runs[0];
  const prevStatus = useRef(null);
  useEffect(() => {
    if (!lastRun) return;
    if (prevStatus.current === 'running' && lastRun.status !== 'running') {
      if (lastRun.status === 'done' && lastRun.kind === 'extract') { setStep(2); loadPreview(); } else if (lastRun.status === 'done' && lastRun.kind === 'import') { if (onDone) onDone(); }
    }
    prevStatus.current = lastRun.status;
  }, [lastRun && lastRun.status, lastRun && lastRun.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPreview(map = ownerMap) {
    setError(''); setBusy(true);
    try { setPreview(await crm.pipeRunPreview(map)); } catch (e) { setError(e.message || 'Não foi possível montar a prévia.'); } finally { setBusy(false); }
  }
  useEffect(() => { if (step === 2 && !preview) loadPreview(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  async function loadReport() { setError(''); setBusy(true); try { setReport(await crm.pipeRunReport()); } catch (e) { setError(e.message || 'Não foi possível conferir.'); } finally { setBusy(false); } }
  useEffect(() => { if (step === 4 && !report) loadReport(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function extract() {
    setError(''); setBusy(true);
    try { await crm.pipeRunExtract(token.trim()); setToken(''); await refresh(); setPreview(null); } catch (e) { setError(e.message || 'Não foi possível iniciar a extração.'); } finally { setBusy(false); }
  }
  async function importNow() {
    const p = preview;
    const ok = await askConfirm({ title: 'Importar do PipeRun para o CRM?', confirmLabel: 'Importar agora', message: `Vão entrar ${p.deals.toImport - p.deals.alreadyImported} negócios novos, ${p.provisional.toCreate} empresas provisórias, contatos, anotações e atividades. Rodar de novo não duplica nada. Nada é alterado no PipeRun.` });
    if (!ok) return;
    setError(''); setBusy(true);
    try { await crm.pipeRunImport({ ownerMap, includeFiles }); setStep(3); await refresh(); } catch (e) { setError(e.message || 'Não foi possível iniciar a importação.'); } finally { setBusy(false); }
  }
  async function purge() {
    const ok = await askConfirm({ title: 'Apagar a cópia bruta do PipeRun?', danger: true, confirmLabel: 'Apagar a cópia', requireText: 'APAGAR', message: 'Isso apaga do servidor os dados pessoais extraídos do PipeRun. Faça só depois da virada e da conferência. O que já está no CRM não muda, e o backup em arquivo que você guardou continua sendo seu.' });
    if (!ok) return;
    try { const r = await crm.pipeRunPurge(); notify(r.note, { tone: 'success', ttlMs: 9000 }); await refresh(); setPreview(null); } catch (e) { notify(e.message || 'Não foi possível apagar.', { tone: 'error' }); }
  }

  const issues = lastRun && lastRun.kind === 'import' && lastRun.result ? lastRun.result.issues || [] : [];
  const stepper = [['1', 'Extrair'], ['2', 'Revisar'], ['3', 'Importar'], ['4', 'Conferir']];
  const canGo = (n) => n === 1 || (n >= 2 && status && status.counts && status.counts.deals) || false;

  return (
    <Modal title="Migrar do PipeRun" onClose={onClose} width={980} locked={!!running}>
      <div className="crm-step">{stepper.map(([n, l], i) => (
        <React.Fragment key={n}>{i > 0 && <span>›</span>}<button type="button" className="crm-btn" style={{ padding: '3px 10px', fontWeight: step === Number(n) ? 800 : 500, opacity: canGo(Number(n)) ? 1 : 0.5 }} disabled={!canGo(Number(n)) || !!running} title={!canGo(Number(n)) ? 'Faça a extração primeiro' : running ? 'Aguarde terminar' : undefined} onClick={() => setStep(Number(n))}>{n}. {l}</button></React.Fragment>
      ))}</div>
      {error && <div className="crm-alert crm-alert-danger" role="alert">{error}</div>}

      {step === 1 && (
        <>
          <div className="crm-alert crm-alert-info"><strong>Só leitura.</strong> A extração apenas lê o PipeRun pela API oficial; nada é alterado lá. Tudo é guardado como cópia bruta, e a importação é feita a partir dessa cópia (dá para refazer sem chamar o PipeRun de novo).</div>
          {running && running.kind === 'extract' ? <ProgressBar progress={running.progress} /> : (
            <div style={{ maxWidth: 560, margin: '14px 0' }}>
              <label className="crm-muted" htmlFor="pr-token">Token da API do PipeRun (Meus Dados → Integrações)</label>
              <input id="pr-token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole o token aqui" />
              <div className="crm-muted" style={{ marginTop: 6 }}>O token vai uma vez ao servidor, só para esta extração. Não fica gravado em nenhum lugar. Depois da migração, gere outro no PipeRun e revogue este.</div>
              <div className="crm-form-foot" style={{ justifyContent: 'flex-start' }}><button type="button" className="crm-btn crm-btn-primary" disabled={busy || token.trim().length < 16} title={token.trim().length < 16 ? 'Cole o token completo' : busy ? 'Aguarde' : undefined} onClick={extract}><DatabaseBackup size={14} /> Extrair do PipeRun</button></div>
            </div>
          )}
          {status && status.counts && Object.keys(status.counts).length > 0 && !running && (
            <div className="crm-section"><h3 className="crm-section-title">Já extraído {status.fetchedAt ? `em ${fdt(status.fetchedAt)}` : ''}</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{Object.entries(status.counts).filter(([k]) => ['deals', 'companies', 'persons', 'activities', 'notes', 'files', 'proposals'].includes(k)).map(([k, v]) => <span key={k} className="crm-pill">{v} {ENTITY_LABEL[k]}</span>)}</div>
              <div className="crm-form-foot" style={{ justifyContent: 'flex-start' }}><button type="button" className="crm-btn crm-btn-primary" onClick={() => setStep(2)}>Continuar com estes dados</button></div></div>
          )}
          {lastRun && lastRun.kind === 'extract' && lastRun.status === 'failed' && <div className="crm-alert crm-alert-danger"><strong>A última extração falhou:</strong> {lastRun.error}</div>}
        </>
      )}

      {step === 2 && (
        <>
          {!preview && <div className="crm-empty">{busy ? 'Montando a prévia…' : 'Sem dados.'}</div>}
          {preview && !preview.ready && <div className="crm-alert crm-alert-warn">{preview.message}</div>}
          {preview && preview.ready && (
            <>
              <div className="crm-alert crm-alert-info">Nada foi gravado ainda. Confira o que vai acontecer; a importação é repetível e não duplica.</div>
              <div className="crm-cards">
                <Tile label="Negócios a importar" value={preview.deals.toImport} sub={`${preview.deals.bySituation.Aberta || 0} abertos · ${preview.deals.bySituation.Congelada || 0} congelados · ${preview.deals.bySituation.Ganha || 0} ganhos · ${preview.deals.bySituation.Perdida || 0} perdidos${preview.deals.trashed ? ` · ${preview.deals.trashed} na lixeira (ficam de fora)` : ''}`} />
                <Tile label="Empresas" value={preview.companies.toCreate} sub={`a criar · ${preview.companies.alreadyInCrm} já existem no CRM · ${preview.companies.refused} registros vazios recusados`} />
                <Tile label="Empresas provisórias" value={preview.provisional.toCreate} tone="#ff9f40" sub={`para negócios sem empresa no PipeRun (${preview.provisional.fromPerson} pelo nome da pessoa, ${preview.provisional.fromTitle} pelo título) · ${preview.provisional.linkToExisting} ligam a empresa que já existe`} />
                <Tile label="Contatos" value={preview.contacts.withCompany + preview.contacts.viaDeal} sub={`${preview.contacts.withoutAnyCompany} pessoas sem empresa e sem negócio ficam só no backup`} />
                <Tile label="Anotações + propostas" value={preview.notes.willImport + preview.notes.proposals} sub={`${preview.notes.ofTrashedDeals} eram de negócios na lixeira · ${preview.notes.empty} vazias`} />
                <Tile label="Atividades" value={preview.activities.total - preview.activities.withoutDeal} sub={`${preview.activities.withoutDeal} sem negócio ficam só no backup`} />
                <Tile label="Documentos" value={preview.files.documents} sub={`PDF/DOCX… de ${preview.files.total} arquivos; imagens e áudios (${preview.files.ignored}) ficam só no backup`} />
              </div>
              {preview.companies.possibleDuplicates > 0 && <div className="crm-alert crm-alert-warn"><AlertTriangle size={14} /> {preview.companies.possibleDuplicates} empresa(s) têm nome parecido com uma que já existe no CRM; entram como novas e aparecem no relatório final para você unir se for a mesma.</div>}
              <div className="crm-alert crm-alert-info"><strong>Funis:</strong> {preview.deals.funnels.map((f) => `${f.name} (${f.deals})${f.exists ? '' : ' — será criado'}`).join(' · ')}. A ordem das etapas vem do PipeRun.</div>
              {preview.provisional.sample.length > 0 && <div className="crm-muted" style={{ marginBottom: 8 }}>Exemplos de empresas provisórias: {preview.provisional.sample.join(' · ')}…</div>}

              <div className="crm-section" style={{ marginBottom: 10 }}>
                <h3 className="crm-section-title">Quem é quem (responsáveis e autores)</h3>
                {preview.people.map((p) => (
                  <div key={p.key} className="crm-map-row">
                    <span>{p.name || p.email} <span className="crm-muted">· {p.deals} negócio(s), {p.activities} atividade(s), {p.notes} nota(s){p.how ? ` · achei por ${p.how}` : ''}</span></span>
                    <select aria-label={`Usuário do CRM para ${p.name || p.email}`} value={ownerMap[p.key] !== undefined ? ownerMap[p.key] : (p.userId || '')} onChange={(e) => setOwnerMap((m) => ({ ...m, [p.key]: e.target.value }))}>
                      <option value="">Sem usuário (guardo o nome no texto)</option>{preview.crmUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}><input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} /> Subir os {preview.files.documents} documentos (PDF/DOCX…) para o CRM (baixados do PipeRun; máximo 20 MB cada)</label>
              <div className="crm-form-foot">
                <button type="button" className="crm-btn" onClick={() => setStep(1)}>Voltar</button>
                <button type="button" className="crm-btn crm-btn-primary" disabled={busy || !!running} title={running ? 'Já há uma execução em andamento' : busy ? 'Aguarde' : undefined} onClick={importNow}>Importar agora</button>
              </div>
            </>
          )}
        </>
      )}

      {step === 3 && (
        <>
          {running && running.kind === 'import' && <><div className="crm-alert crm-alert-info" role="status">Importando… pode fechar esta janela; a importação continua no servidor.</div><ProgressBar progress={running.progress} /></>}
          {!running && lastRun && lastRun.kind === 'import' && lastRun.status === 'failed' && <div className="crm-alert crm-alert-danger"><strong>A importação falhou:</strong> {lastRun.error}. O que já entrou fica; rodar de novo continua de onde parou, sem duplicar.</div>}
          {!running && lastRun && lastRun.kind === 'import' && lastRun.status === 'done' && lastRun.result && (
            <>
              <div className="crm-alert crm-alert-info" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Check size={16} color="#3ecf6e" /> <span><strong>Importação concluída</strong> ({fdt(lastRun.finishedAt)}).</span></div>
              <div className="crm-cards">
                <Tile label="Negócios" value={lastRun.result.deals.created} sub={`${lastRun.result.deals.alreadyImported} já existiam · ${lastRun.result.deals.failed} falharam`} />
                <Tile label="Empresas" value={lastRun.result.companies.created} sub={`+ ${lastRun.result.provisional.created} provisórias`} />
                <Tile label="Contatos" value={lastRun.result.contacts.created} sub={`${lastRun.result.contacts.linkedToExisting} ligados a contatos existentes`} />
                <Tile label="Anotações" value={lastRun.result.notes.created} />
                <Tile label="Atividades" value={lastRun.result.activities.created} />
                <Tile label="Documentos" value={lastRun.result.files.created} sub={lastRun.result.files.failed ? `${lastRun.result.files.failed} falharam` : undefined} />
              </div>
              {issues.length > 0 && (
                <div className="crm-alert crm-alert-warn" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span><strong>{issues.length}</strong> item(ns) ficaram de fora ou com aviso (a maioria é lixeira do PipeRun e pessoas/atividades sem vínculo).</span>
                  <button type="button" className="crm-btn" onClick={() => downloadCsv('migracao-piperun-avisos.csv', [['phase', 'Etapa'], ['pid', 'ID no PipeRun'], ['title', 'Registro'], ['message', 'Motivo']], issues)}><Download size={14} /> Baixar a lista</button>
                </div>
              )}
              <div className="crm-form-foot"><button type="button" className="crm-btn" onClick={() => setStep(2)}>Voltar</button><button type="button" className="crm-btn crm-btn-primary" onClick={() => { setReport(null); setStep(4); }}>Conferir</button></div>
            </>
          )}
          {!running && !(lastRun && lastRun.kind === 'import') && <div className="crm-empty">Nenhuma importação feita ainda. Volte à etapa 2.</div>}
        </>
      )}

      {step === 4 && (
        <>
          {busy && !report && <div className="crm-empty">Conferindo…</div>}
          {report && !report.ready && <div className="crm-alert crm-alert-warn">{report.message} Se você já apagou a cópia bruta, a conferência não é mais possível; refaça a extração para conferir.</div>}
          {report && report.ready && (
            <>
              <div className={`crm-alert ${report.ok ? 'crm-alert-info' : 'crm-alert-warn'}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{report.ok ? <Check size={16} color="#3ecf6e" /> : <AlertTriangle size={16} />} <span>{report.ok ? <strong>Tudo bate: contagens, valores por situação e por funil, sem nenhuma divergência.</strong> : <strong>{report.divergenceCount} divergência(s) para revisar.</strong>}</span></div>
              <h3 className="crm-section-title">Contagens</h3>
              <div className="crm-table-wrap"><table className="crm-table" style={{ minWidth: 640 }}><thead><tr><th>Item</th><th className="crm-num">PipeRun</th><th className="crm-num">CRM</th><th /><th>Observação</th></tr></thead><tbody>
                {report.summary.map((r) => <tr key={r.label} style={{ cursor: 'default' }}><td>{r.label}</td><td className="crm-num">{r.piperun}</td><td className="crm-num">{r.crm}</td><td>{r.ok ? <Check size={14} color="#3ecf6e" aria-label="confere" /> : <AlertTriangle size={14} color="#ff9f40" aria-label="diverge" />}</td><td className="crm-muted">{r.note}</td></tr>)}
              </tbody></table></div>
              <h3 className="crm-section-title" style={{ marginTop: 14 }}>Valores por situação</h3>
              <div className="crm-table-wrap"><table className="crm-table" style={{ minWidth: 560 }}><thead><tr><th>Situação</th><th className="crm-num">Negócios PipeRun</th><th className="crm-num">CRM</th><th className="crm-num">Valor PipeRun</th><th className="crm-num">Valor CRM</th></tr></thead><tbody>
                {report.bySituation.map((r) => <tr key={r.label} style={{ cursor: 'default' }}><td>{r.label}</td><td className="crm-num">{r.piperun}</td><td className="crm-num">{r.crm}</td><td className="crm-num">{brl(r.piperunValue)}</td><td className="crm-num" style={{ color: r.piperunValue === r.crmValue ? undefined : '#e2574c' }}>{brl(r.crmValue)}</td></tr>)}
              </tbody></table></div>
              <h3 className="crm-section-title" style={{ marginTop: 14 }}>Negócios por funil</h3>
              <div className="crm-table-wrap"><table className="crm-table" style={{ minWidth: 420 }}><thead><tr><th>Funil</th><th className="crm-num">PipeRun</th><th className="crm-num">CRM</th></tr></thead><tbody>
                {report.byFunnel.map((r) => <tr key={r.label} style={{ cursor: 'default' }}><td>{r.label}</td><td className="crm-num">{r.piperun}</td><td className="crm-num" style={{ color: r.piperun === r.crm ? undefined : '#e2574c' }}>{r.crm}</td></tr>)}
              </tbody></table></div>
              {report.divergenceCount > 0 && (
                <div className="crm-section" style={{ marginTop: 14 }}>
                  <h3 className="crm-section-title">Divergências ({report.divergenceCount}) <button type="button" className="crm-btn" style={{ marginLeft: 8 }} onClick={() => downloadCsv('migracao-piperun-divergencias.csv', [['type', 'Tipo'], ['pid', 'ID no PipeRun'], ['title', 'Registro'], ['detail', 'Detalhe']], report.divergences)}><Download size={14} /> Baixar</button></h3>
                  <div className="crm-table-wrap" style={{ maxHeight: '28vh', overflowY: 'auto' }}><table className="crm-table" style={{ minWidth: 560 }}><tbody>
                    {report.divergences.slice(0, 200).map((d, i) => <tr key={i} style={{ cursor: 'default' }}><td><span className="crm-pill">{d.type}</span></td><td>{d.title}</td><td className="crm-muted">{d.detail}</td></tr>)}
                  </tbody></table></div>
                </div>
              )}
              {report.provisionalToComplete.length > 0 && (
                <div className="crm-section" style={{ marginTop: 14 }}>
                  <h3 className="crm-section-title">Empresas provisórias a completar ({report.provisionalToComplete.length})</h3>
                  <div className="crm-muted" style={{ marginBottom: 6 }}>Foram criadas porque o negócio não tinha empresa no PipeRun. Abra cada uma em Empresas e preencha razão social e CNPJ (a Visão geral também lista as incompletas).</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: '16vh', overflowY: 'auto' }}>{report.provisionalToComplete.map((c) => <span key={c.id} className="crm-pill">{c.name}</span>)}</div>
                </div>
              )}
              <div className="crm-alert crm-alert-info" style={{ marginTop: 14 }}><strong>Para virar a chave:</strong> use os dois sistemas em paralelo por algumas semanas, deixe o PipeRun só para consulta e só cancele depois de conferir. Guarde o backup em arquivo e verifique as obrigações do contrato e da LGPD. Quando terminar, apague a cópia bruta daqui e revogue o token no PipeRun.</div>
              <div className="crm-form-foot"><button type="button" className="crm-btn" onClick={loadReport} disabled={busy} title={busy ? 'Aguarde terminar a conferência' : undefined}>Conferir de novo</button><button type="button" className="crm-btn crm-btn-danger" onClick={purge}>Apagar a cópia bruta…</button><button type="button" className="crm-btn crm-btn-primary" onClick={onClose}>Fechar</button></div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

export default guardedModal(PipeRunMigration, 'a migração do PipeRun', 'crm-piperun-migration');
