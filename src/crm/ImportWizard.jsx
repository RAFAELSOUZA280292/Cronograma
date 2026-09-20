// Importação de planilha Excel/CSV (PRD 48): arquivo -> mapeamento de colunas
// -> preview com duplicidades -> importar. O arquivo é lido AQUI (navegador);
// o servidor recebe só as linhas já mapeadas e reclassifica tudo antes de
// gravar (o preview é conveniência, nunca autoridade).
import React, { useState } from 'react';
import { Upload, Check } from 'lucide-react';
import { crm } from './crmApi.js';
import { Modal } from './ui.jsx';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const SYNONYMS = {
  companies: {
    legalName: ['razao social', 'nome da empresa', 'empresa', 'razao', 'nome'], tradeName: ['nome fantasia', 'fantasia'], cnpj: ['cnpj'],
    economicGroup: ['grupo economico', 'grupo'], website: ['site', 'website'], segment: ['segmento', 'setor'], cnae: ['cnae'], city: ['cidade', 'municipio'],
    state: ['uf', 'estado'], relationship: ['relacao', 'status', 'tipo'], source: ['origem', 'fonte'], ownerName: ['responsavel', 'vendedor'],
    companySize: ['porte'], taxRegime: ['regime tributario', 'regime'], revenueEstimate: ['faturamento', 'receita'], employees: ['funcionarios'], erp: ['erp'],
  },
  contacts: {
    fullName: ['nome completo', 'contato', 'nome'], firstName: ['primeiro nome'], lastName: ['sobrenome'], companyCnpj: ['cnpj'], companyName: ['empresa', 'razao social'],
    jobTitle: ['cargo'], department: ['departamento', 'area'], email: ['e mail', 'email'], phone: ['telefone', 'fone'], whatsapp: ['whatsapp', 'celular'],
    linkedin: ['linkedin'], decisionRole: ['papel na decisao', 'papel'], influence: ['influencia'], relationshipStrength: ['relacionamento'],
  },
};

function guessMapping(target, headers) {
  const map = {};
  const used = new Set();
  const nh = headers.map(norm);
  Object.entries(SYNONYMS[target]).forEach(([field, syns]) => {
    for (const s of syns) {
      const i = nh.findIndex((h, idx) => !used.has(idx) && h === s);
      if (i >= 0) { map[field] = i; used.add(i); return; }
    }
    for (const s of syns) {
      const i = nh.findIndex((h, idx) => !used.has(idx) && h.includes(s));
      if (i >= 0) { map[field] = i; used.add(i); return; }
    }
  });
  return map;
}

const STATUS_LABEL = { new: 'Nova', duplicate: 'Duplicada', possible_duplicate: 'Possível duplicada', invalid: 'Inválida' };
const STATUS_COLOR = { new: '#3ecf6e', duplicate: '#e2574c', possible_duplicate: '#ff9f40', invalid: '#e2574c' };

export default function ImportWizard({ onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [target, setTarget] = useState('companies');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [fields, setFields] = useState(null);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [includePossible, setIncludePossible] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const f = fields || await crm.importFields();
      setFields(f);
      // Leitor enxuto carregado só agora (chunk separado): assim quem nunca importa planilha não baixa o parser.
      const mod = await import('xlsx/dist/xlsx.mini.min.js');
      const XLSX = mod.default || mod;
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      if (aoa.length < 2) throw new Error('A planilha precisa ter o cabeçalho na 1ª linha e ao menos uma linha de dados.');
      const hs = aoa[0].map((h) => String(h).trim());
      const rows = aoa.slice(1).filter((r) => r.some((v) => String(v).trim() !== ''));
      if (rows.length > f.maxRows) throw new Error(`A planilha tem ${rows.length} linhas; o limite é ${f.maxRows} por importação — divida em partes.`);
      setFileName(file.name); setHeaders(hs); setDataRows(rows); setMapping(guessMapping(target, hs)); setStep(2);
    } catch (err) { setError(err.message || 'Não consegui ler esse arquivo.'); } finally { setBusy(false); e.target.value = ''; }
  }

  function buildRows() {
    return dataRows.map((r) => {
      const o = {};
      Object.entries(mapping).forEach(([field, idx]) => {
        if (idx === '' || idx == null) return;
        let v = String(r[idx] == null ? '' : r[idx]).trim();
        if ((field === 'cnpj' || field === 'companyCnpj') && /^\d{12,13}$/.test(v.replace(/\D/g, '')) && !/[.\-/]/.test(v)) v = v.padStart(14, '0');
        o[field] = v;
      });
      return o;
    });
  }

  const fieldList = fields ? (target === 'companies' ? fields.companies : fields.contacts) : [];
  const needOk = target === 'companies'
    ? (mapping.legalName !== undefined && mapping.legalName !== '') || (mapping.tradeName !== undefined && mapping.tradeName !== '')
    : ((mapping.fullName !== undefined && mapping.fullName !== '') || (mapping.firstName !== undefined && mapping.firstName !== '')) && ((mapping.companyCnpj !== undefined && mapping.companyCnpj !== '') || (mapping.companyName !== undefined && mapping.companyName !== ''));

  async function runPreview() {
    setError(''); setBusy(true);
    try { setPreview(await crm.importPreview(target, buildRows())); setStep(3); } catch (e) { setError(e.message || 'Não foi possível conferir a planilha.'); } finally { setBusy(false); }
  }

  async function runCommit() {
    setError(''); setBusy(true);
    try { setResult(await crm.importCommit(target, buildRows(), includePossible)); setStep(4); if (onDone) onDone(); } catch (e) { setError(e.message || 'Não foi possível importar.'); } finally { setBusy(false); }
  }

  const willImport = preview ? preview.counts.new + (includePossible ? preview.counts.possible_duplicate : 0) : 0;

  return (
    <Modal title="Importar planilha" onClose={onClose} width="min(880px, 100%)">
      <div className="crm-step">
        {['Arquivo', 'Colunas', 'Conferir', 'Resultado'].map((l, i) => <span key={l} style={{ marginRight: 10 }}>{step === i + 1 ? <b>{i + 1}. {l}</b> : `${i + 1}. ${l}`}</span>)}
      </div>

      {step === 1 && (
        <>
          <div className="crm-form-grid">
            <div className="crm-field full">
              <label>O que você vai importar?</label>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600 }}><input type="radio" style={{ width: 'auto' }} checked={target === 'companies'} onChange={() => setTarget('companies')} /> Empresas</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600 }}><input type="radio" style={{ width: 'auto' }} checked={target === 'contacts'} onChange={() => setTarget('contacts')} /> Contatos (as empresas precisam já estar cadastradas)</label>
              </div>
            </div>
            <div className="crm-field full">
              <label>Arquivo (.xlsx, .xls ou .csv) — cabeçalho na 1ª linha</label>
              <label className="crm-btn" style={{ display: 'inline-flex', cursor: 'pointer' }}><Upload size={14} /> {busy ? 'Lendo…' : 'Escolher arquivo'}
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} disabled={busy} />
              </label>
            </div>
          </div>
          <div className="crm-alert crm-alert-info">Nada é gravado antes da conferência. Empresas com CNPJ já cadastrado são puladas; nomes parecidos pedem a sua confirmação.</div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="crm-sub" style={{ marginBottom: 10 }}>{fileName} — {dataRows.length} linhas. Aponte qual coluna da planilha alimenta cada campo (deixei o palpite pelos nomes dos cabeçalhos).</div>
          {fieldList.map((f) => (
            <div key={f.key} className="crm-map-row">
              <span>{f.label}</span>
              <select value={mapping[f.key] === undefined ? '' : mapping[f.key]} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}>
                <option value="">— não importar —</option>{headers.map((h, i) => <option key={i} value={i}>{h || `(coluna ${i + 1})`}</option>)}
              </select>
            </div>
          ))}
          {!needOk && <div className="crm-alert crm-alert-warn">{target === 'companies' ? 'Mapeie pelo menos o nome da empresa.' : 'Mapeie o nome do contato e o CNPJ ou o nome da empresa.'}</div>}
        </>
      )}

      {step === 3 && preview && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {['new', 'possible_duplicate', 'duplicate', 'invalid'].map((k) => (
              <span key={k} className="crm-pill" style={{ color: STATUS_COLOR[k] }}>{preview.counts[k]} {STATUS_LABEL[k].toLowerCase()}{preview.counts[k] === 1 ? '' : 's'}</span>
            ))}
          </div>
          {preview.counts.possible_duplicate > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={includePossible} onChange={(e) => setIncludePossible(e.target.checked)} /> Importar também as possíveis duplicadas ({preview.counts.possible_duplicate}) — eu conferi que são registros diferentes
            </label>
          )}
          <div className="crm-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="crm-table" style={{ minWidth: 560 }}>
              <thead><tr><th>Linha</th><th>Nome</th><th>Situação</th><th>Detalhe</th></tr></thead>
              <tbody>
                {preview.rows.filter((r) => r.status !== 'new' || r.messages.length).slice(0, 200).map((r) => (
                  <tr key={r.index} style={{ cursor: 'default' }}>
                    <td>{r.line}</td><td>{r.name}</td><td><span className="crm-status" style={{ color: STATUS_COLOR[r.status], border: '1px solid currentColor' }}>{STATUS_LABEL[r.status]}</span></td><td>{r.messages.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.every((r) => r.status === 'new' && !r.messages.length) && <div className="crm-empty">Tudo certo — nenhuma linha com problema.</div>}
          </div>
        </>
      )}

      {step === 4 && result && (
        <div>
          <div className="crm-alert crm-alert-info" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Check size={16} /> <span><b>{result.created}</b> importado(s) · {result.skipped} ignorado(s) · {result.failed.length} com erro</span></div>
          {result.failed.map((f, i) => <div key={i} className="crm-err">Linha {f.line} ({f.name}): {f.message}</div>)}
        </div>
      )}

      {error && <div className="crm-err">{error}</div>}
      <div className="crm-form-foot">
        {step < 4 && <button type="button" className="crm-btn" onClick={onClose}>Cancelar</button>}
        {step === 2 && <button type="button" className="crm-btn" onClick={() => setStep(1)}>Voltar</button>}
        {step === 2 && <button type="button" className="crm-btn crm-btn-primary" disabled={busy || !needOk} onClick={runPreview}>{busy ? 'Conferindo…' : 'Conferir'}</button>}
        {step === 3 && <button type="button" className="crm-btn" onClick={() => setStep(2)}>Voltar</button>}
        {step === 3 && <button type="button" className="crm-btn crm-btn-primary" disabled={busy || willImport === 0} onClick={runCommit}>{busy ? 'Importando…' : `Importar ${willImport} ${willImport === 1 ? 'linha' : 'linhas'}`}</button>}
        {step === 4 && <button type="button" className="crm-btn crm-btn-primary" onClick={onClose}>Fechar</button>}
      </div>
    </Modal>
  );
}
