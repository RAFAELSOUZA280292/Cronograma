import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Plus, MessageSquare, Clock, Paperclip, ChevronDown, LogOut,
  Upload, Archive, Ban,
} from 'lucide-react';
import { apiGet, apiPost, apiPatch } from '../lib/api.js';
import { S, uid, fmtDate, fmtTs, useIsMobile, BrandLogo, ThemeToggleBtn } from '../App.jsx';

const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
function tone(hex) {
  return { color: hex, bg: hexToRgba(hex, 0.14), border: hexToRgba(hex, 0.5) };
}

export const XFLOW_ROLE_META = {
  reporter: { label: 'Reporter' },
  dev: { label: 'Dev' },
  gestao: { label: 'Gestão' },
};
export const XFLOW_ROLE_ORDER = ['reporter', 'dev', 'gestao'];

const XFLOW_LATERAL_STATUSES = [
  'aguardando_informacoes', 'pausada', 'bloqueada', 'aguardando_usuario',
  'aguardando_gerencia', 'aguardando_terceiro', 'duplicada', 'nao_reproduzida',
  'nao_e_bug', 'descartada',
];
const XFLOW_TERMINAL_STATUSES = ['concluida', 'duplicada', 'nao_reproduzida', 'nao_e_bug', 'descartada'];

const XFLOW_STATUS_META = {
  aberta: { label: 'Aberta', ...tone('#3ea6ff') },
  triagem: { label: 'Em triagem', ...tone('#F5C400') },
  validada_como_bug: { label: 'Validada como bug', ...tone('#9b7af5') },
  priorizada: { label: 'Priorizada', ...tone('#ff9f40') },
  atribuida: { label: 'Atribuída', ...tone('#3ea6ff') },
  em_desenvolvimento: { label: 'Em desenvolvimento', ...tone('#3ea6ff') },
  em_revisao: { label: 'Em revisão', ...tone('#9b7af5') },
  pronta_para_teste: { label: 'Pronta para teste', ...tone('#F5C400') },
  em_homologacao: { label: 'Em homologação', ...tone('#ff9f40') },
  publicada: { label: 'Publicada', ...tone('#3ecf6e') },
  aguardando_validacao_solicitante: { label: 'Aguardando validação do solicitante', ...tone('#ff9f40') },
  concluida: { label: 'Concluída', ...tone('#3ecf6e') },
  aguardando_informacoes: { label: 'Aguardando informações', ...tone('#999999') },
  pausada: { label: 'Pausada', ...tone('#ff9f40') },
  bloqueada: { label: 'Bloqueada', ...tone('#e2574c') },
  aguardando_usuario: { label: 'Aguardando usuário/cliente', ...tone('#999999') },
  aguardando_gerencia: { label: 'Aguardando gerência', ...tone('#999999') },
  aguardando_terceiro: { label: 'Aguardando terceiro', ...tone('#999999') },
  duplicada: { label: 'Duplicada', ...tone('#999999') },
  nao_reproduzida: { label: 'Não reproduzida', ...tone('#999999') },
  nao_e_bug: { label: 'Não é bug', ...tone('#999999') },
  descartada: { label: 'Descartada', ...tone('#e2574c') },
};

const XFLOW_SEVERITY_META = {
  s1: { label: 'S1 — Crítico', ...tone('#e2574c') },
  s2: { label: 'S2 — Alto', ...tone('#ff9f40') },
  s3: { label: 'S3 — Médio', ...tone('#F5C400') },
  s4: { label: 'S4 — Baixo', ...tone('#3ea6ff') },
};
const XFLOW_SEVERITY_ORDER = ['s1', 's2', 's3', 's4'];

const XFLOW_PRIORITY_META = {
  urgente: { label: 'Urgente', ...tone('#e2574c') },
  alta: { label: 'Alta', ...tone('#ff9f40') },
  normal: { label: 'Normal', ...tone('#F5C400') },
  baixa: { label: 'Baixa', ...tone('#3ea6ff') },
};
const XFLOW_PRIORITY_ORDER = ['urgente', 'alta', 'normal', 'baixa'];

const XFLOW_IMPACT_META = {
  bloqueia: 'Bloqueia operação', parcial: 'Parcial', visual: 'Visual', melhoria: 'Melhoria',
};
const XFLOW_IMPACT_ORDER = ['bloqueia', 'parcial', 'visual', 'melhoria'];

const XFLOW_FREQUENCY_META = { sempre: 'Sempre', as_vezes: 'Às vezes', uma_vez: 'Aconteceu uma vez' };
const XFLOW_FREQUENCY_ORDER = ['sempre', 'as_vezes', 'uma_vez'];

const XFLOW_BLOCK_REASON_META = {
  dependencia_tecnica: 'Dependência técnica', aguardando_banco: 'Aguardando banco',
  aguardando_api: 'Aguardando API', aguardando_infra: 'Aguardando infraestrutura',
  aguardando_regra_negocio: 'Aguardando regra de negócio', aguardando_cliente: 'Aguardando cliente',
  aguardando_arquivo: 'Aguardando arquivo', aguardando_decisao_gestao: 'Aguardando decisão de gestão',
};
const XFLOW_BLOCK_REASON_ORDER = Object.keys(XFLOW_BLOCK_REASON_META);

const XFLOW_CLOSURE_REASON_META = {
  duplicado: 'Duplicado', nao_reproduzido: 'Não reproduzido',
  comportamento_esperado: 'Comportamento esperado', erro_configuracao: 'Erro de configuração',
  erro_usuario: 'Erro do usuário', melhoria: 'Melhoria / nova funcionalidade',
  problema_externo: 'Problema externo', nao_aplicavel: 'Não aplicável',
  resolvido_anteriormente: 'Resolvido anteriormente', descartado_gestao: 'Descartado pela gestão',
};
const XFLOW_CLOSURE_REASON_ORDER = Object.keys(XFLOW_CLOSURE_REASON_META);
const CLOSURE_REASON_TO_STATUS = {
  duplicado: 'duplicada', nao_reproduzido: 'nao_reproduzida', comportamento_esperado: 'nao_e_bug',
  erro_configuracao: 'nao_e_bug', erro_usuario: 'nao_e_bug', melhoria: 'nao_e_bug',
  problema_externo: 'descartada', nao_aplicavel: 'descartada',
  resolvido_anteriormente: 'duplicada', descartado_gestao: 'descartada',
};

const XFLOW_PRODUCTS = ['TINTAX', 'XPED', 'XCheck', 'XClass', 'Outro'];

function metaLabel(map, key) { return (map[key] && (map[key].label || map[key])) || key || '—'; }

function isTerminal(status) { return XFLOW_TERMINAL_STATUSES.includes(status); }
function isLateral(status) { return XFLOW_LATERAL_STATUSES.includes(status); }

function whoHasTheBall(ticket, teamById) {
  if (isTerminal(ticket.status)) return '—';
  const LATERAL_OWNER = {
    aguardando_informacoes: 'Solicitante', aguardando_usuario: 'Solicitante',
    aguardando_gerencia: 'Gestão', aguardando_terceiro: 'Terceiro',
    pausada: 'Ninguém (pausada)',
  };
  if (ticket.status === 'bloqueada') return `Ninguém (bloqueada — ${metaLabel(XFLOW_BLOCK_REASON_META, ticket.blockedReason)})`;
  if (LATERAL_OWNER[ticket.status]) return LATERAL_OWNER[ticket.status];
  if (ticket.status === 'aguardando_validacao_solicitante') return 'Solicitante';
  if (ticket.assigneeId && teamById[ticket.assigneeId]) return teamById[ticket.assigneeId].name;
  return 'Ninguém atribuído';
}

function historyEntry(action, userName) {
  return { ts: new Date().toISOString(), action, user: userName };
}

function captureMetadata() {
  let sessionId = '';
  try {
    sessionId = window.sessionStorage.getItem('xflow_session_id') || '';
    if (!sessionId) {
      sessionId = uid('sess');
      window.sessionStorage.setItem('xflow_session_id', sessionId);
    }
  } catch { /* sessionStorage indisponível */ }
  return {
    capturedUrl: window.location.href,
    browser: navigator.userAgent,
    os: navigator.platform || '',
    appVersion: '1.0.0',
    screenRes: `${window.screen.width}x${window.screen.height}`,
    sessionId,
  };
}

function renderCommentText(text, team) {
  const names = (team || []).map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length === 0) return text;
  const pattern = new RegExp(`@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = text.split(pattern);
  return parts.map((part, i) => (names.includes(part) ? <span key={i} style={S.mentionTag}>@{part}</span> : part));
}

function Badge({ meta, small }) {
  if (!meta) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: small ? 10.5 : 11.5, fontWeight: 700, padding: small ? '2px 7px' : '3px 9px', borderRadius: 999, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  );
}

function blankTicketForm() {
  return {
    title: '', product: '', module: '', affectedUser: '', affectedCompany: '',
    environment: 'producao', description: '', expectedResult: '', reproSteps: '',
    impact: '', frequency: '', occurredAt: '', priority: '', evidence: [],
  };
}

function NewTicketModal({ onClose, onCreate }) {
  const [form, setForm] = useState(blankTicketForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isMobile = useIsMobile();

  function set(patch) { setForm((f) => ({ ...f, ...patch })); }

  function handleEvidencePick(e) {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (file.size > MAX_EVIDENCE_BYTES) {
        window.alert(`"${file.name}" tem ${(file.size / (1024 * 1024)).toFixed(1)} MB — o limite por arquivo é ${MAX_EVIDENCE_BYTES / (1024 * 1024)} MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setForm((f) => ({ ...f, evidence: [...f.evidence, { id: uid('ev'), name: file.name, size: file.size, type: file.type, dataUrl: reader.result }] }));
      reader.readAsDataURL(file);
    });
  }
  function removeEvidence(id) { setForm((f) => ({ ...f, evidence: f.evidence.filter((ev) => ev.id !== id) })); }

  const requiredOk = form.title.trim() && form.product && form.module.trim() && form.affectedUser.trim()
    && form.affectedCompany.trim() && form.environment && form.description.trim() && form.expectedResult.trim()
    && form.reproSteps.trim() && form.impact && form.frequency && form.occurredAt && form.priority;

  async function submit() {
    if (!requiredOk || saving) return;
    setSaving(true);
    try {
      await onCreate({ ...form, ...captureMetadata() });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(640px, 100%)', maxHeight: '90vh', overflowY: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Novo BUG</div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={S.subSectionLabel}>Título do BUG</div>
        <input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder='Ex.: "Erro ao calcular aderência após upload do SPED"' />

        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Produto / Plataforma</div>
            <select value={form.product} onChange={(e) => set({ product: e.target.value })}>
              <option value="">Selecione</option>
              {XFLOW_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Módulo / Tela</div>
            <input type="text" value={form.module} onChange={(e) => set({ module: e.target.value })} placeholder="Ex.: Upload, Aderência, Dashboard" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Usuário afetado</div>
            <input type="text" value={form.affectedUser} onChange={(e) => set({ affectedUser: e.target.value })} placeholder="Quem encontrou o problema" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Empresa/Cliente afetado</div>
            <input type="text" value={form.affectedCompany} onChange={(e) => set({ affectedCompany: e.target.value })} />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={S.subSectionLabel}>Ambiente</div>
          <select value={form.environment} onChange={(e) => set({ environment: e.target.value })}>
            <option value="producao">Produção</option>
            <option value="homologacao">Homologação</option>
            <option value="desenvolvimento">Desenvolvimento</option>
          </select>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={S.subSectionLabel}>Descrição do problema</div>
          <textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="O que aconteceu" />
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={S.subSectionLabel}>Resultado esperado</div>
          <textarea rows={2} value={form.expectedResult} onChange={(e) => set({ expectedResult: e.target.value })} placeholder="O que deveria acontecer" />
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={S.subSectionLabel}>Passo a passo para reproduzir</div>
          <textarea rows={4} value={form.reproSteps} onChange={(e) => set({ reproSteps: e.target.value })} placeholder={'1. Entrou em...\n2. Clicou em...\n3. Fez upload...'} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Impacto</div>
            <select value={form.impact} onChange={(e) => set({ impact: e.target.value })}>
              <option value="">Selecione</option>
              {XFLOW_IMPACT_ORDER.map((k) => <option key={k} value={k}>{XFLOW_IMPACT_META[k]}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Frequência</div>
            <select value={form.frequency} onChange={(e) => set({ frequency: e.target.value })}>
              <option value="">Selecione</option>
              {XFLOW_FREQUENCY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_FREQUENCY_META[k]}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Data e hora da ocorrência</div>
            <input type="datetime-local" value={form.occurredAt} onChange={(e) => set({ occurredAt: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={S.subSectionLabel}>Prioridade sugerida</div>
            <select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">Selecione</option>
              {XFLOW_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_PRIORITY_META[k].label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={S.subSectionLabel}>Evidência (print, vídeo, arquivo, mensagem de erro)</div>
          <label style={S.iconBtn}><Upload size={14} /> Anexar evidência
            <input type="file" multiple style={{ display: 'none' }} onChange={handleEvidencePick} />
          </label>
          {form.evidence.map((ev) => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
              <Paperclip size={12} /> {ev.name}
              <button style={S.iconBtnGhost} onClick={() => removeEvidence(ev.id)}><X size={12} /></button>
            </div>
          ))}
        </div>

        <div style={{ ...S.fieldHint, marginTop: 10 }}>
          Capturado automaticamente ao enviar: URL atual, navegador, sistema operacional, resolução da tela e sessão.
        </div>

        {error && <div style={{ ...S.loginBlockedMsg, marginTop: 10 }}>{error}</div>}

        <button style={{ ...S.primaryBtn, marginTop: 16, width: '100%', justifyContent: 'center' }} onClick={submit} disabled={!requiredOk || saving}>
          {saving ? 'Enviando...' : 'Abrir BUG'}
        </button>
      </div>
    </div>
  );
}

function TriageMenu({ onAction }) {
  const [open, setOpen] = useState(false);
  const items = [
    { key: 'aceitar', label: 'Aceitar BUG' },
    { key: 'infos', label: 'Solicitar mais informações' },
    { key: 'nao_reproduziu', label: 'Não consegui reproduzir' },
    { key: 'duplicado', label: 'Marcar como duplicado' },
    { key: 'nao_e_bug', label: 'Classificar como não sendo BUG' },
    { key: 'escalar', label: 'Escalar para gerência/PO' },
    { key: 'redirecionar', label: 'Redirecionar' },
    { key: 'iniciar', label: 'Iniciar desenvolvimento' },
  ];
  return (
    <div style={{ position: 'relative' }}>
      <button style={{ ...S.primaryBtn, width: '100%', justifyContent: 'center' }} onClick={() => setOpen((v) => !v)}>
        Triagem <ChevronDown size={14} />
      </button>
      {open && (
        <div style={{ ...S.dropdownMenu, position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4 }}>
          {items.map((it) => (
            <button key={it.key} style={S.dropdownItem} onClick={() => { onAction(it.key); setOpen(false); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketDetailModal({ ticket, team, currentUser, onClose, onUpdate, onCreateSpinoff }) {
  const isMobile = useIsMobile();
  const [commentDraft, setCommentDraft] = useState('');
  const [pendingMentions, setPendingMentions] = useState([]);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockReasonDraft, setBlockReasonDraft] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeReasonDraft, setCloseReasonDraft] = useState('');
  const [closeJustDraft, setCloseJustDraft] = useState('');
  const [closeDupIdDraft, setCloseDupIdDraft] = useState('');
  const [showDupForm, setShowDupForm] = useState(false);
  const [dupIdDraft, setDupIdDraft] = useState('');
  const [reproduceNoteDraft, setReproduceNoteDraft] = useState('');
  const [showReproduceForm, setShowReproduceForm] = useState(false);

  const teamById = useMemo(() => {
    const m = {};
    (team || []).forEach((t) => { m[t.id] = t; });
    return m;
  }, [team]);

  const isReporter = ticket.reporterId === currentUser.id;
  const canTriage = currentUser.xflowRole === 'dev' || currentUser.xflowRole === 'gestao';
  const canValidateClosure = isReporter || currentUser.xflowRole === 'gestao';

  function patch(fields, action) {
    const next = { ...ticket, ...fields };
    if (action) next.history = [historyEntry(action, currentUser.name), ...(ticket.history || [])].slice(0, 300);
    onUpdate(next);
  }

  function triageAction(key) {
    if (key === 'aceitar') patch({ status: 'atribuida', assigneeId: currentUser.id }, `${currentUser.name} aceitou o BUG`);
    else if (key === 'infos') patch({ status: 'aguardando_informacoes', statusBeforeBlock: ticket.status }, 'Solicitadas mais informações ao solicitante');
    else if (key === 'nao_reproduziu') setShowReproduceForm(true);
    else if (key === 'duplicado') setShowDupForm(true);
    else if (key === 'nao_e_bug') patch({ status: 'nao_e_bug', closureReason: 'comportamento_esperado' }, 'Classificado como não sendo BUG');
    else if (key === 'escalar') patch({ status: 'aguardando_gerencia', assigneeId: null }, 'Escalado para gerência/PO');
    else if (key === 'redirecionar') window.alert('Abra o BUG e ajuste o campo Produto/Responsável pra redirecionar.');
    else if (key === 'iniciar') patch({ status: 'em_desenvolvimento', assigneeId: currentUser.id }, 'Desenvolvimento iniciado');
  }

  function confirmReproduce() {
    if (!reproduceNoteDraft.trim()) return;
    patch({ status: 'nao_reproduzida', closureJustification: reproduceNoteDraft.trim() }, 'Marcado como não reproduzido');
    setShowReproduceForm(false);
    setReproduceNoteDraft('');
  }
  function confirmDuplicate() {
    if (!dupIdDraft.trim()) return;
    patch({ status: 'duplicada', duplicateOfTicketId: dupIdDraft.trim(), closureReason: 'duplicado' }, `Marcado como duplicado do BUG #${dupIdDraft.trim()}`);
    setShowDupForm(false);
    setDupIdDraft('');
  }

  function startBlock() { setShowBlockForm(true); }
  function confirmBlock() {
    if (!blockReasonDraft) return;
    patch({ status: 'bloqueada', blockedReason: blockReasonDraft, statusBeforeBlock: ticket.status }, `Bloqueado — ${metaLabel(XFLOW_BLOCK_REASON_META, blockReasonDraft)}`);
    setShowBlockForm(false);
    setBlockReasonDraft('');
  }
  function unblock() {
    patch({ status: ticket.statusBeforeBlock || 'em_desenvolvimento', blockedReason: '', statusBeforeBlock: '' }, 'Desbloqueado');
  }
  function togglePause() {
    if (ticket.status === 'pausada') patch({ status: ticket.statusBeforeBlock || 'aberta', statusBeforeBlock: '' }, 'Retomado');
    else patch({ status: 'pausada', statusBeforeBlock: ticket.status }, 'Pausado');
  }

  async function confirmClose() {
    if (!closeReasonDraft || !closeJustDraft.trim()) return;
    if (closeReasonDraft === 'duplicado' && !closeDupIdDraft.trim()) return;
    const nextStatus = CLOSURE_REASON_TO_STATUS[closeReasonDraft];
    patch({
      status: nextStatus, closureReason: closeReasonDraft, closureJustification: closeJustDraft.trim(),
      duplicateOfTicketId: closeReasonDraft === 'duplicado' ? closeDupIdDraft.trim() : ticket.duplicateOfTicketId,
    }, `Encerrado sem desenvolvimento — ${metaLabel(XFLOW_CLOSURE_REASON_META, closeReasonDraft)}`);
    if (closeReasonDraft === 'melhoria' && onCreateSpinoff) {
      await onCreateSpinoff(ticket);
    }
    setShowCloseForm(false);
    setCloseReasonDraft(''); setCloseJustDraft(''); setCloseDupIdDraft('');
  }

  function sendToReview() { patch({ status: 'em_revisao' }, 'Enviado para revisão'); }
  function markReadyForTest() {
    if (!ticket.solution || !ticket.whatToTest) { window.alert('Preencha "Solução aplicada" e "O que testar" antes.'); return; }
    patch({ status: 'pronta_para_teste' }, 'Marcado pronto para teste');
  }
  function sendToHomolog() { patch({ status: 'em_homologacao' }, 'Enviado para homologação'); }
  function publish() { patch({ status: 'publicada' }, 'Publicado'); }
  function sendToValidation() { patch({ status: 'aguardando_validacao_solicitante' }, 'Enviado para validação do solicitante'); }
  function approve() { patch({ status: 'concluida' }, `${currentUser.name} aprovou a solução`); }
  function reject() { patch({ status: 'em_desenvolvimento' }, `${currentUser.name} reprovou a solução — voltou para desenvolvimento`); }
  function archive() { patch({ archived: true }, 'Arquivado'); }

  function submitComment() {
    const text = commentDraft.trim();
    if (!text) return;
    const comment = { id: uid('xc'), text, ts: new Date().toISOString(), author: currentUser.name, authorId: currentUser.id, mentions: pendingMentions };
    patch({ comments: [comment, ...(ticket.comments || [])] }, 'Comentário adicionado');
    setCommentDraft('');
    setPendingMentions([]);
  }
  function insertMention(m) {
    setCommentDraft((d) => `${d}@${m.name} `);
    setPendingMentions((p) => (p.includes(m.id) ? p : [...p, m.id]));
  }

  function handleEvidencePick(e) {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (file.size > MAX_EVIDENCE_BYTES) {
        window.alert(`"${file.name}" tem ${(file.size / (1024 * 1024)).toFixed(1)} MB — o limite por arquivo é ${MAX_EVIDENCE_BYTES / (1024 * 1024)} MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => patch({ evidence: [...(ticket.evidence || []), { id: uid('ev'), name: file.name, size: file.size, type: file.type, dataUrl: reader.result }] }, `Anexo adicionado: "${file.name}"`);
      reader.readAsDataURL(file);
    });
  }

  const ball = whoHasTheBall(ticket, teamById);
  const terminal = isTerminal(ticket.status);

  return (
    <div style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(1000px, 100%)', maxHeight: '92vh', overflowY: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-5)', fontWeight: 700 }}>BUG #{ticket.number}</div>
            <input type="text" value={ticket.title} onChange={(e) => patch({ title: e.target.value })} onBlur={() => patch({}, `Título alterado: "${ticket.title}"`)} style={{ fontSize: 17, fontWeight: 800, border: 'none', background: 'transparent', padding: 0 }} />
          </div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <Badge meta={XFLOW_STATUS_META[ticket.status]} />
          <Badge meta={XFLOW_SEVERITY_META[ticket.severity]} />
          <Badge meta={XFLOW_PRIORITY_META[ticket.priority]} />
          {ticket.archived && <Badge meta={{ label: 'Arquivado', ...tone('#999999') }} />}
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <div style={{ flex: 2, minWidth: 0 }}>
            <div style={S.subSectionLabel}>Descrição</div>
            <textarea rows={3} value={ticket.description} onChange={(e) => patch({ description: e.target.value })} />

            <div style={{ ...S.subSectionLabel, marginTop: 12 }}>Resultado esperado</div>
            <textarea rows={2} value={ticket.expectedResult} onChange={(e) => patch({ expectedResult: e.target.value })} />

            <div style={{ ...S.subSectionLabel, marginTop: 12 }}>Passo a passo para reproduzir</div>
            <textarea rows={4} value={ticket.reproSteps} onChange={(e) => patch({ reproSteps: e.target.value })} />

            <div style={{ ...S.subSectionLabel, marginTop: 12 }}>Evidências</div>
            <label style={S.iconBtn}><Upload size={14} /> Anexar
              <input type="file" multiple style={{ display: 'none' }} onChange={handleEvidencePick} />
            </label>
            {(ticket.evidence || []).map((ev) => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
                {ev.type && ev.type.startsWith('image/') ? <img src={ev.dataUrl} alt={ev.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} /> : <Paperclip size={12} />}
                <a href={ev.dataUrl} download={ev.name}>{ev.name}</a>
              </div>
            ))}

            {(ticket.solution || ticket.whatToTest || ['em_desenvolvimento', 'em_revisao', 'pronta_para_teste', 'em_homologacao', 'publicada', 'aguardando_validacao_solicitante', 'concluida'].includes(ticket.status)) && (
              <>
                <div style={{ ...S.subSectionLabel, marginTop: 12 }}>Solução aplicada</div>
                <textarea rows={2} value={ticket.solution || ''} onChange={(e) => patch({ solution: e.target.value })} placeholder="O que foi feito para corrigir" />
                <div style={{ ...S.subSectionLabel, marginTop: 12 }}>O que testar</div>
                <textarea rows={2} value={ticket.whatToTest || ''} onChange={(e) => patch({ whatToTest: e.target.value })} placeholder="Passos pra validar a correção" />
              </>
            )}

            <div style={{ ...S.subSectionLabel, marginTop: 16 }}><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários</div>
            <textarea rows={2} value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Escreva um comentário... use @ pra mencionar alguém" />
            {team && team.length > 0 && (
              <select value="" onChange={(e) => { const m = team.find((t) => t.id === e.target.value); if (m) insertMention(m); }} style={{ marginTop: 6, width: 'auto' }}>
                <option value="">+ Mencionar...</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
            <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={submitComment} disabled={!commentDraft.trim()}>Comentar</button>
            {(ticket.comments || []).map((c) => (
              <div key={c.id} style={{ ...S.logRow, marginTop: 10 }}>
                <div style={S.logTs}>{fmtTs(c.ts)} · {c.author}</div>
                <div>{renderCommentText(c.text, team)}</div>
              </div>
            ))}

            <div style={{ ...S.subSectionLabel, marginTop: 16 }}><Clock size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Timeline</div>
            {(ticket.history || []).length === 0 && <div style={S.emptyMuted}>Nenhum evento ainda.</div>}
            {(ticket.history || []).map((h, i) => (
              <div key={i} style={S.logRow}>
                <div style={S.logTs}>{fmtTs(h.ts)}{h.user ? ` · ${h.user}` : ''}</div>
                <div style={S.logAction}>{h.action}</div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: isMobile ? '100%' : 260 }}>
            <div style={{ ...S.accessBlock, marginBottom: 12 }}>
              <div style={S.settingsLabel}>Quem está com a bola</div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{ball}</div>
              {ticket.nextAction && <div style={{ ...S.fieldHint, marginTop: 4 }}>Próxima ação: {ticket.nextAction}</div>}
              {ticket.dueDate && <div style={{ ...S.fieldHint, marginTop: 2 }}>Prazo: {fmtDate(ticket.dueDate)}</div>}
            </div>

            {!terminal && (ticket.status === 'aberta' || ticket.status === 'triagem') && canTriage && (
              <div style={{ marginBottom: 10 }}><TriageMenu onAction={triageAction} /></div>
            )}
            {showReproduceForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>O que você tentou pra reproduzir?</div>
                <textarea rows={2} value={reproduceNoteDraft} onChange={(e) => setReproduceNoteDraft(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmReproduce} disabled={!reproduceNoteDraft.trim()}>Confirmar</button>
              </div>
            )}
            {showDupForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>ID/número do BUG original</div>
                <input type="text" value={dupIdDraft} onChange={(e) => setDupIdDraft(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmDuplicate} disabled={!dupIdDraft.trim()}>Vincular e marcar duplicado</button>
              </div>
            )}

            {ticket.status === 'atribuida' && <button style={{ ...S.primaryBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => patch({ status: 'em_desenvolvimento' }, 'Desenvolvimento iniciado')}>Iniciar desenvolvimento</button>}
            {ticket.status === 'em_desenvolvimento' && <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={sendToReview}>Enviar para revisão</button>}
            {ticket.status === 'em_revisao' && <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={markReadyForTest}>Marcar pronta para teste</button>}
            {ticket.status === 'pronta_para_teste' && <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={sendToHomolog}>Enviar para homologação</button>}
            {ticket.status === 'em_homologacao' && <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={publish}>Publicar</button>}
            {ticket.status === 'publicada' && <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={sendToValidation}>Enviar para validação do solicitante</button>}
            {ticket.status === 'aguardando_validacao_solicitante' && (
              canValidateClosure ? (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button style={{ ...S.primaryBtn, flex: 1, justifyContent: 'center' }} onClick={approve}>Aprovar</button>
                  <button style={{ ...S.iconBtn, flex: 1, justifyContent: 'center' }} onClick={reject}>Reprovar</button>
                </div>
              ) : <div style={{ ...S.fieldHint, marginBottom: 8 }}>Aguardando validação do solicitante — DEV não pode concluir sozinho.</div>
            )}

            {!terminal && ticket.status !== 'bloqueada' && (
              <button style={{ ...S.iconBtnGhost, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={startBlock}><Ban size={13} /> Bloquear</button>
            )}
            {ticket.status === 'bloqueada' && (
              <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={unblock}>Desbloquear</button>
            )}
            {showBlockForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Motivo</div>
                <select value={blockReasonDraft} onChange={(e) => setBlockReasonDraft(e.target.value)}>
                  <option value="">Selecione</option>
                  {XFLOW_BLOCK_REASON_ORDER.map((k) => <option key={k} value={k}>{XFLOW_BLOCK_REASON_META[k]}</option>)}
                </select>
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmBlock} disabled={!blockReasonDraft}>Confirmar bloqueio</button>
              </div>
            )}
            {!terminal && ticket.status !== 'bloqueada' && (
              <button style={{ ...S.iconBtnGhost, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={togglePause}>{ticket.status === 'pausada' ? 'Retomar' : 'Pausar'}</button>
            )}
            {!terminal && (
              <button style={{ ...S.iconBtnGhost, width: '100%', justifyContent: 'center', marginBottom: 6, color: '#e2574c' }} onClick={() => setShowCloseForm((v) => !v)}>Fechar sem desenvolver</button>
            )}
            {showCloseForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Motivo do encerramento</div>
                <select value={closeReasonDraft} onChange={(e) => setCloseReasonDraft(e.target.value)}>
                  <option value="">Selecione</option>
                  {XFLOW_CLOSURE_REASON_ORDER.map((k) => <option key={k} value={k}>{XFLOW_CLOSURE_REASON_META[k]}</option>)}
                </select>
                {closeReasonDraft === 'duplicado' && (
                  <input type="text" style={{ marginTop: 6 }} placeholder="ID/número do BUG original" value={closeDupIdDraft} onChange={(e) => setCloseDupIdDraft(e.target.value)} />
                )}
                <div style={{ ...S.fieldHint, marginTop: 6 }}>Justificativa (obrigatória)</div>
                <textarea rows={2} value={closeJustDraft} onChange={(e) => setCloseJustDraft(e.target.value)} />
                {closeReasonDraft === 'melhoria' && <div style={{ ...S.fieldHint, marginTop: 4 }}>Vai criar automaticamente uma nova TASK de melhoria vinculada a este BUG.</div>}
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmClose} disabled={!closeReasonDraft || !closeJustDraft.trim() || (closeReasonDraft === 'duplicado' && !closeDupIdDraft.trim())}>Confirmar encerramento</button>
              </div>
            )}
            {ticket.status === 'concluida' && !ticket.archived && (
              <button style={{ ...S.iconBtnGhost, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={archive}><Archive size={13} /> Arquivar</button>
            )}

            <div style={{ ...S.subSectionLabel, marginTop: 14 }}>Severidade</div>
            <select value={ticket.severity || ''} onChange={(e) => patch({ severity: e.target.value }, `Severidade alterada para ${metaLabel(XFLOW_SEVERITY_META, e.target.value)}`)}>
              <option value="">Sem severidade</option>
              {XFLOW_SEVERITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_SEVERITY_META[k].label}</option>)}
            </select>

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Prioridade</div>
            <select value={ticket.priority || ''} onChange={(e) => patch({ priority: e.target.value }, `Prioridade alterada para ${metaLabel(XFLOW_PRIORITY_META, e.target.value)}`)}>
              <option value="">Sem prioridade</option>
              {XFLOW_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_PRIORITY_META[k].label}</option>)}
            </select>

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Responsável atual</div>
            <select value={ticket.assigneeId || ''} onChange={(e) => patch({ assigneeId: e.target.value || null }, 'Responsável alterado')}>
              <option value="">Ninguém</option>
              {(team || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Próxima ação</div>
            <input type="text" value={ticket.nextAction || ''} onChange={(e) => patch({ nextAction: e.target.value })} />

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Prazo</div>
            <input type="date" value={ticket.dueDate || ''} onChange={(e) => patch({ dueDate: e.target.value })} />

            <div style={{ ...S.subSectionLabel, marginTop: 14 }}>Dados capturados</div>
            <div style={S.fieldHint}>Produto: {ticket.product || '—'} · Módulo: {ticket.module || '—'}</div>
            <div style={S.fieldHint}>Empresa afetada: {ticket.affectedCompany || '—'}</div>
            <div style={S.fieldHint}>Ambiente: {ticket.environment || '—'}</div>
            <div style={S.fieldHint}>Impacto: {metaLabel(XFLOW_IMPACT_META, ticket.impact)} · Frequência: {metaLabel(XFLOW_FREQUENCY_META, ticket.frequency)}</div>
            {ticket.capturedUrl && <div style={{ ...S.fieldHint, wordBreak: 'break-all' }}>URL: {ticket.capturedUrl}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function XFlowScreen({ currentUser, onExit, onLogout, theme, onToggleTheme }) {
  const [tickets, setTickets] = useState([]);
  const [team, setTeam] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('meus');
  const [showNew, setShowNew] = useState(false);
  const [openTicketId, setOpenTicketId] = useState(null);

  useEffect(() => {
    Promise.all([apiGet('/api/xflow/tickets'), apiGet('/api/xflow/team')])
      .then(([t, tm]) => { setTickets(t.tickets); setTeam(tm.team); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const teamById = useMemo(() => {
    const m = {};
    team.forEach((t) => { m[t.id] = t; });
    return m;
  }, [team]);

  async function createTicket(form) {
    const res = await apiPost('/api/xflow/tickets', form);
    setTickets((prev) => [res.ticket, ...prev]);
    setShowNew(false);
  }

  async function createSpinoff(originalTicket) {
    const res = await apiPost('/api/xflow/tickets', {
      title: `[Melhoria] ${originalTicket.title}`,
      product: originalTicket.product, module: originalTicket.module,
      description: originalTicket.description, type: 'melhoria',
      originatedFromTicketId: String(originalTicket.number),
      status: 'aberta',
    });
    setTickets((prev) => [res.ticket, ...prev]);
  }

  async function updateTicket(nextTicket) {
    setTickets((prev) => prev.map((t) => (t.id === nextTicket.id ? nextTicket : t)));
    try {
      const res = await apiPatch(`/api/xflow/tickets/${nextTicket.id}`, { ticket: nextTicket });
      setTickets((prev) => prev.map((t) => (t.id === res.ticket.id ? res.ticket : t)));
    } catch (e) {
      window.alert('Falha ao salvar: ' + e.message);
    }
  }

  const openTicket = tickets.find((t) => t.id === openTicketId);

  const role = currentUser.xflowRole;
  const meusBugs = tickets.filter((t) => {
    if (isTerminal(t.status) && t.archived) return false;
    if (role === 'reporter') return t.reporterId === currentUser.id;
    if (role === 'dev') return t.assigneeId === currentUser.id;
    if (role === 'gestao') return t.status === 'aguardando_gerencia' || t.assigneeId === currentUser.id || t.reporterId === currentUser.id;
    return false;
  });
  const dependemDeVoce = meusBugs.filter((t) => {
    if (role === 'reporter') return t.status === 'aguardando_informacoes' || t.status === 'aguardando_validacao_solicitante';
    if (role === 'gestao') return t.status === 'aguardando_gerencia';
    return false;
  });
  const fila = tickets.filter((t) => (t.status === 'aberta' || t.status === 'triagem') && !t.assigneeId);
  const escalados = tickets.filter((t) => t.status === 'aguardando_gerencia');
  const todos = tickets.filter((t) => !(isTerminal(t.status) && t.archived));

  const TABS = [
    { key: 'meus', label: 'Meus BUGs', list: meusBugs },
    ...(role === 'dev' || role === 'gestao' ? [{ key: 'fila', label: 'Fila', list: fila }] : []),
    ...(role === 'gestao' ? [{ key: 'todos', label: 'Todos os BUGs', list: todos }] : []),
    ...(role === 'gestao' ? [{ key: 'escalados', label: 'Escalados', list: escalados }] : []),
  ];
  const activeList = (TABS.find((t) => t.key === tab) || TABS[0]).list;

  const isMobile = useIsMobile();

  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.brandRow}>
          <BrandLogo theme={theme} style={S.logoImg} />
          <div>
            <div style={{ fontWeight: 800 }}>XFlow</div>
            <div style={{ fontSize: 11, color: 'var(--text-5)' }}>{currentUser.name} · {XFLOW_ROLE_META[role] ? XFLOW_ROLE_META[role].label : role}</div>
          </div>
          {onExit && <button style={S.iconBtnGhost} onClick={onExit}>Sair do XFlow</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={S.primaryBtn} onClick={() => setShowNew(true)}><Plus size={15} /> Novo BUG</button>
          <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
          {onLogout && <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={15} /></button>}
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        {dependemDeVoce.length > 0 && (
          <div style={{ ...S.loginBlockedMsg, marginTop: 16, background: 'rgba(255,159,64,.14)', color: '#ff9f40', borderColor: 'rgba(255,159,64,.5)' }}>
            ⚠ {dependemDeVoce.length} BUG{dependemDeVoce.length === 1 ? '' : 's'} dependendo de você
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.key} style={{ ...S.pbGhostBtn, ...(tab === t.key ? S.pbGhostBtnActive : {}) }} onClick={() => setTab(t.key)}>
              {t.label} ({t.list.length})
            </button>
          ))}
        </div>

        {!loaded && <div style={{ ...S.emptyMuted, marginTop: 20 }}>Carregando...</div>}
        {loaded && activeList.length === 0 && <div style={{ ...S.emptyMuted, marginTop: 20 }}>Nenhum BUG aqui.</div>}

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 40 }}>
          {activeList.map((t) => (
            <div key={t.id} style={{ ...S.accessBlock, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} onClick={() => setOpenTicketId(t.id)}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-5)', width: 56 }}>#{t.number}</div>
              <div style={{ flex: 1, minWidth: 160, fontWeight: 700 }}>{t.title}</div>
              <Badge meta={XFLOW_STATUS_META[t.status]} small />
              <Badge meta={XFLOW_SEVERITY_META[t.severity]} small />
              <Badge meta={XFLOW_PRIORITY_META[t.priority]} small />
              <div style={{ fontSize: 11, color: 'var(--text-5)' }}>{t.product}</div>
              <div style={{ fontSize: 11, color: 'var(--text-5)' }}>{whoHasTheBall(t, teamById)}</div>
            </div>
          ))}
        </div>
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreate={createTicket} />}
      {openTicket && (
        <TicketDetailModal
          ticket={openTicket}
          team={team}
          currentUser={currentUser}
          onClose={() => setOpenTicketId(null)}
          onUpdate={updateTicket}
          onCreateSpinoff={createSpinoff}
        />
      )}
    </div>
  );
}
