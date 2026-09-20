// Importar negócios de planilha (feito pro export "Oportunidades" do PipeRun). Arquivo → colunas →
// conferir → resultado. Nada é gravado antes de "Importar". O que fica de fora (sem empresa, empresa
// que não está no CRM, lixeira, inválido) volta numa lista CSV pra o Rafael completar no sistema de origem.
import React, { useState } from 'react';
import { Upload, Check, Download } from 'lucide-react';
import { crm } from './crmApi.js';
import { Modal } from './ui.jsx';
import { guessMapping } from './importMapping.js';

const STATUS_LABEL = { new: 'Nova', already: 'Já importada', no_company: 'Sem empresa', company_not_found: 'Empresa não está no CRM', discarded: 'Lixeira', invalid: 'Inválida' };
const STATUS_COLOR = { new: '#3ecf6e', already: '#9a9a9a', no_company: '#ff9f40', company_not_found: '#ff9f40', discarded: '#9a9a9a', invalid: '#e2574c' };
const REQUIRED = ['externalId', 'title', 'pipelineName', 'stageName', 'situation'];

function downloadCsv(name, rows) {
  const cols = [['line', 'Linha'], ['externalId', 'ID no sistema de origem'], ['title', 'Título'], ['pipeline', 'Funil'], ['stage', 'Etapa'], ['situation', 'Situação'], ['company', 'Empresa'], ['person', 'Pessoa'], ['personEmail', 'E-mail da pessoa'], ['status', 'Situação da importação'], ['reason', 'Motivo']];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const body = [cols.map((c) => esc(c[1])).join(';'), ...rows.map((r) => cols.map(([k]) => esc(k === 'status' ? (STATUS_LABEL[r[k]] || r[k]) : r[k])).join(';'))].join('\r\n');
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default function DealImportWizard({ options, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [fields, setFields] = useState(null);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [ownerMap, setOwnerMap] = useState({});
  const [filter, setFilter] = useState('problems');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const owners = (options && options.owners) || [];

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const f = fields || await crm.dealImportFields();
      setFields(f);
      const mod = await import('xlsx/dist/xlsx.mini.min.js');
      const XLSX = mod.default || mod;
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      if (aoa.length < 2) throw new Error('A planilha precisa ter o cabeçalho na 1ª linha e ao menos uma linha de dados.');
      const hs = aoa[0].map((h) => String(h).trim());
      const rows = aoa.slice(1).filter((r) => r.some((v) => String(v).trim() !== ''));
      if (rows.length > f.maxRows) throw new Error(`A planilha tem ${rows.length} linhas; o limite é ${f.maxRows} por importação — divida em partes.`);
      setFileName(file.name); setHeaders(hs); setDataRows(rows); setMapping(guessMapping('deals', hs)); setStep(2);
    } catch (err) { setError(err.message || 'Não consegui ler esse arquivo.'); } finally { setBusy(false); e.target.value = ''; }
  }

  function buildRows() {
    return dataRows.map((r) => {
      const o = {};
      Object.entries(mapping).forEach(([field, idx]) => {
        if (idx === '' || idx == null) return;
        let v = String(r[idx] == null ? '' : r[idx]).trim();
        if (field === 'companyCnpj' && /^\d{12,13}$/.test(v.replace(/\D/g, '')) && !/[.\-/]/.test(v)) v = v.padStart(14, '0');
        o[field] = v;
      });
      return o;
    });
  }

  const has = (k) => mapping[k] !== undefined && mapping[k] !== '';
  const mappingOk = REQUIRED.every(has) && (has('companyCnpj') || has('companyName'));

  async function runPreview() {
    setError(''); setBusy(true);
    try { const p = await crm.dealImportPreview(buildRows()); setPreview(p); setOwnerMap({}); setFilter(p.rows.some((r) => r.status !== 'new' && r.status !== 'already') ? 'problems' : 'all'); setStep(3); }
    catch (e) { setError(e.message || 'Não foi possível conferir a planilha.'); } finally { setBusy(false); }
  }

  async function runCommit() {
    setError(''); setBusy(true);
    try { const r = await crm.dealImportCommit(buildRows(), ownerMap); setResult(r); setStep(4); if (onDone) onDone(); }
    catch (e) { setError(e.message || 'Não foi possível importar.'); } finally { setBusy(false); }
  }

  const shown = preview ? preview.rows.filter((r) => (filter === 'all' ? true : filter === 'problems' ? !['new', 'already'].includes(r.status) : r.status === filter)) : [];
  const skippedCount = preview ? preview.skipped.length : 0;

  return (
    <Modal title="Importar negócios" onClose={onClose} width={920}>
      <div className="crm-step"><span>{step === 1 ? <b>1. Arquivo</b> : '1. Arquivo'}</span><span>›</span><span>{step === 2 ? <b>2. Colunas</b> : '2. Colunas'}</span><span>›</span><span>{step === 3 ? <b>3. Conferir</b> : '3. Conferir'}</span><span>›</span><span>{step === 4 ? <b>4. Resultado</b> : '4. Resultado'}</span></div>

      {step === 1 && (
        <div style={{ textAlign: 'center', padding: '24px 8px' }}>
          <div className="crm-muted" style={{ marginBottom: 14, maxWidth: 560, marginInline: 'auto' }}>
            Suba o arquivo de <b>Oportunidades</b> exportado do PipeRun (.xlsx). Importe as <b>empresas antes</b>: o negócio é ligado à empresa pelo CNPJ ou pelo nome, e o que não tiver empresa no CRM fica de fora (você recebe a lista).
          </div>
          <label className="crm-btn crm-btn-primary" style={{ cursor: 'pointer' }}><Upload size={14} /> {busy ? 'Lendo…' : 'Escolher arquivo'}<input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} disabled={busy} /></label>
        </div>
      )}

      {step === 2 && fields && (
        <>
          <div className="crm-muted" style={{ marginBottom: 10 }}>{fileName} — {dataRows.length} linhas. Aponte qual coluna alimenta cada campo (deixei o palpite pelos cabeçalhos). Obrigatórios: ID, título, funil, etapa, situação e CNPJ ou nome da empresa.</div>
          <div style={{ maxHeight: '48vh', overflowY: 'auto' }}>
            {fields.fields.map((f) => (
              <div key={f.key} className="crm-map-row">
                <span>{f.label}{REQUIRED.includes(f.key) ? ' *' : ''}</span>
                <select value={mapping[f.key] === undefined ? '' : mapping[f.key]} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}>
                  <option value="">— não importar —</option>{headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!mappingOk && <div className="crm-alert crm-alert-warn">Falta apontar {REQUIRED.filter((k) => !has(k)).map((k) => fields.fields.find((f) => f.key === k).label).concat(has('companyCnpj') || has('companyName') ? [] : ['CNPJ ou nome da empresa']).join(', ')}.</div>}
          {error && <div className="crm-err">{error}</div>}
          <div className="crm-form-foot"><button type="button" className="crm-btn" onClick={() => setStep(1)}>Voltar</button><button type="button" className="crm-btn crm-btn-primary" disabled={!mappingOk || busy} onClick={runPreview}>{busy ? 'Conferindo…' : 'Conferir'}</button></div>
        </>
      )}

      {step === 3 && preview && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {Object.entries(preview.counts).filter(([, n]) => n > 0).map(([k, n]) => <span key={k} className="crm-pill" style={{ color: STATUS_COLOR[k] }}>{n} {STATUS_LABEL[k].toLowerCase()}</span>)}
          </div>

          {preview.funnels.length > 0 && (
            <div className="crm-alert crm-alert-info">
              <strong>Funis:</strong> {preview.funnels.map((f) => `${f.name} (${f.count})${f.exists ? '' : ' — será criado'}${f.newStages.length ? ` + etapas novas: ${f.newStages.join(', ')}` : ''}`).join(' · ')}.
              <div className="crm-muted" style={{ marginTop: 4 }}>A ordem das etapas dos funis novos é uma estimativa (o arquivo não traz a ordem) — ajuste depois em “Funis”.</div>
            </div>
          )}
          {preview.willPromote > 0 && <div className="crm-alert crm-alert-info">{preview.willPromote} empresa(s) que ainda não são cliente serão promovidas a <b>Cliente</b> (negócio ganho), com a data do fechamento.</div>}

          {preview.owners.length > 0 && (
            <div className="crm-section" style={{ marginBottom: 10 }}>
              <h3 className="crm-section-title">Responsáveis</h3>
              {preview.owners.map((o) => (
                <div key={o.key} className="crm-map-row">
                  <span>{o.label} <span className="crm-muted">· {o.count} negócio(s){o.email && o.email !== o.label ? ` · ${o.email}` : ''}</span></span>
                  {o.userId ? <span style={{ color: '#3ecf6e', fontWeight: 700 }}>✓ encontrado no CRM</span> : (
                    <select value={ownerMap[o.key] || ''} onChange={(e) => setOwnerMap((m) => ({ ...m, [o.key]: e.target.value }))}>
                      <option value="">Sem responsável (não encontrei esse usuário)</option>{owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="crm-filters" style={{ marginBottom: 6 }}>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar linhas">
              <option value="problems">Só o que fica de fora</option><option value="all">Todas as linhas</option>
              {Object.entries(preview.counts).filter(([, n]) => n > 0).map(([k, n]) => <option key={k} value={k}>{STATUS_LABEL[k]} ({n})</option>)}
            </select>
            {skippedCount > 0 && <button type="button" className="crm-btn" onClick={() => downloadCsv('negocios-que-ficaram-de-fora.csv', preview.skipped)}><Download size={14} /> Baixar lista dos que ficam de fora ({skippedCount})</button>}
          </div>
          <div className="crm-table-wrap" style={{ maxHeight: '34vh', overflowY: 'auto' }}>
            <table className="crm-table crm-first-narrow" style={{ minWidth: 640 }}>
              <thead><tr><th>Linha</th><th>Negócio</th><th>Funil / etapa</th><th>Situação</th><th>Detalhe</th></tr></thead>
              <tbody>
                {shown.slice(0, 300).map((r) => (
                  <tr key={r.index} style={{ cursor: 'default' }}>
                    <td className="crm-num">{r.line}</td><td><div className="crm-name">{r.title}</div><div className="crm-muted">{r.companyName}</div></td>
                    <td>{r.pipeline}<div className="crm-muted">{r.stage}</div></td>
                    <td><span className="crm-pill" style={{ color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span></td>
                    <td style={{ fontSize: 12 }}>{r.messages.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <div className="crm-empty">Nenhuma linha neste filtro.</div>}
          </div>
          {shown.length > 300 && <div className="crm-muted">Mostrando as 300 primeiras de {shown.length}.</div>}
          {error && <div className="crm-err">{error}</div>}
          <div className="crm-form-foot">
            <button type="button" className="crm-btn" onClick={() => setStep(2)}>Voltar</button>
            <button type="button" className="crm-btn crm-btn-primary" disabled={busy || preview.counts.new === 0} onClick={runCommit}>{busy ? 'Importando…' : `Importar ${preview.counts.new} negócio(s)`}</button>
          </div>
        </>
      )}

      {step === 4 && result && (
        <>
          <div className="crm-alert crm-alert-info" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Check size={16} color="#3ecf6e" /> <span><strong>{result.created} negócio(s) importado(s).</strong> {result.alreadyImported ? `${result.alreadyImported} já estavam no CRM. ` : ''}{result.promotedCompanies ? `${result.promotedCompanies} empresa(s) viraram cliente. ` : ''}</span></div>
          {result.createdFunnels.length > 0 && <div className="crm-muted" style={{ marginBottom: 6 }}>Funis criados: {result.createdFunnels.join(', ')}. Confira e reordene as etapas em “Funis”.</div>}
          {result.skipped.length > 0 && (
            <div className="crm-alert crm-alert-warn" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span><strong>{result.skipped.length}</strong> linha(s) ficaram de fora (sem empresa, empresa fora do CRM, lixeira ou inválidas).</span>
              <button type="button" className="crm-btn" onClick={() => downloadCsv('negocios-que-ficaram-de-fora.csv', result.skipped)}><Download size={14} /> Baixar a lista</button>
            </div>
          )}
          {result.failed.length > 0 && <div className="crm-alert crm-alert-danger"><strong>{result.failed.length} falharam:</strong> {result.failed.slice(0, 5).map((f) => `linha ${f.line} (${f.message})`).join('; ')}</div>}
          <div className="crm-form-foot"><button type="button" className="crm-btn crm-btn-primary" onClick={onClose}>Fechar</button></div>
        </>
      )}
    </Modal>
  );
}
