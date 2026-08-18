import React, { useState, useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  X, Plus, MessageSquare, Clock, Paperclip, ChevronDown, LogOut,
  Upload, Archive, Ban, Trash2, Bold, Italic, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, AlignRight, List, Quote,
} from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api.js';
import { S, uid, fmtDate, fmtTs, useIsMobile, BrandLogo, ThemeToggleBtn } from '../App.jsx';

const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

// Descrição do BUG é rich text (editor próprio, ver RichTextEditor). HTML
// nunca vai pra tela sem passar por aqui — mesmo conteúdo já sanitizado no
// backend ao salvar (defesa em profundidade, server/xflow.js
// sanitizeDescriptionHtml — não confia só no cliente).
const RICH_TEXT_ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'font', 'p', 'div', 'br', 'ul', 'ol', 'li', 'blockquote', 'span', 'img'];
// ALLOWED_URI_REGEXP só pega valores que "parecem" uma URI com esquema —
// um src sem "://" (ex.: "x") escapa dessa checagem. Hook fecha a brecha:
// qualquer <img> cujo src não comece literalmente com "data:image/" é
// removido, sem exceção (mesma regra do sanitizeDescriptionHtml no backend).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') || '';
    if (!src.startsWith('data:image/')) node.remove();
  }
});
function sanitizeRichText(html) {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS,
    ALLOWED_ATTR: ['style', 'face', 'src', 'alt'],
    ALLOWED_URI_REGEXP: /^data:image\//,
  });
}
function richTextIsBlank(html) {
  if (!html) return true;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return !tmp.textContent.trim() && !tmp.querySelector('img');
}

const RICH_TEXT_FONTS = [
  { value: '', label: 'Fonte padrão' },
  { value: 'Georgia, serif', label: 'Serifada' },
  { value: '"Courier New", monospace', label: 'Monoespaçada' },
];

const RICH_TEXT_CSS = `
  .xflow-rte-toolbar { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; padding: 4px; background: var(--bg-3); border: 1px solid var(--border-3); border-bottom: none; border-radius: 6px 6px 0 0; }
  .xflow-rte-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: transparent; border: none; border-radius: 4px; color: var(--text-3); cursor: pointer; }
  .xflow-rte-btn:hover { background: var(--bg-4); color: var(--text-1); }
  .xflow-rte-sep { width: 1px; height: 18px; background: var(--border-2); margin: 0 3px; }
  .xflow-rte-font { font-size: 11.5px; background: var(--bg-4); border: 1px solid var(--border-3); color: var(--text-2); border-radius: 4px; padding: 3px 4px; }
  .xflow-rte-body { min-height: 90px; max-height: 320px; overflow-y: auto; background: var(--bg-4); border: 1px solid var(--border-3); border-radius: 0 0 6px 6px; padding: 8px 10px; font-size: 12.5px; color: var(--text-1); line-height: 1.5; }
  .xflow-rte-body:focus { outline: none; border-color: #F5C400; }
  .xflow-rte-body:empty:before { content: attr(data-placeholder); color: var(--text-6); }
  .xflow-rte-body blockquote { margin: 6px 0; padding: 2px 10px; border-left: 3px solid var(--border-3); color: var(--text-4); }
  .xflow-rte-body ul, .xflow-rte-body ol { margin: 6px 0; padding-left: 22px; }
  .xflow-rte-body img { max-width: 100%; border-radius: 4px; margin: 4px 0; display: block; }
  .xflow-rte-body[contenteditable=false] { cursor: default; }
`;

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
  admin: { label: 'Admin' },
};
export const XFLOW_ROLE_ORDER = ['reporter', 'dev', 'gestao'];

const XFLOW_LATERAL_STATUSES = [
  'pausada', 'bloqueada', 'aguardando_gerencia', 'aguardando_terceiro',
  'duplicada', 'nao_reproduzida', 'nao_e_bug', 'descartada',
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
  pronta_para_publicacao: { label: 'Pronta para publicação', ...tone('#3ecf6e') },
  publicada: { label: 'Publicada', ...tone('#3ecf6e') },
  aguardando_validacao_solicitante: { label: 'Aguardando validação do solicitante', ...tone('#ff9f40') },
  concluida: { label: 'Concluída', ...tone('#3ecf6e') },
  pausada: { label: 'Pausada', ...tone('#ff9f40') },
  bloqueada: { label: 'Bloqueada', ...tone('#e2574c') },
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

const XFLOW_SLA_STATE_META = {
  vencido: { label: 'SLA vencido', ...tone('#e2574c') },
  proximo_vencer: { label: 'SLA próximo de vencer', ...tone('#ff9f40') },
  dentro_prazo: { label: 'Dentro do SLA', ...tone('#3ecf6e') },
  cumprido: { label: 'SLA cumprido', ...tone('#999999') },
};

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

const XFLOW_PRODUCTS = ['X da Questão', 'XClass', 'XPED', 'Outro'];
const XFLOW_CLIENT_TYPES = ['PRICETAX', 'TINTAX'];

function metaLabel(map, key) { return (map[key] && (map[key].label || map[key])) || key || '—'; }

function isTerminal(status) { return XFLOW_TERMINAL_STATUSES.includes(status); }
function isLateral(status) { return XFLOW_LATERAL_STATUSES.includes(status); }

// ---- Permissões (espelha server/xflowPermissions.js — mudou lá, muda aqui) ----
const XFLOW_RANK = { reporter: 0, dev: 1, gestao: 2, admin: 3 };

export function effectiveXflowRole(user) {
  if (!user || !user.xflowRole) return null;
  if (user.role === 'master' || user.isSuperAdmin) return 'admin';
  return user.xflowRole;
}
function isAtLeast(role, min) { return XFLOW_RANK[role] >= XFLOW_RANK[min]; }
function isOwner(user, ticket) { return !!ticket && ticket.reporterId === user.id; }
function isAssignee(user, ticket) { return !!ticket && ticket.assigneeId === user.id; }

const XFLOW_RULES = {
  attach_evidence: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : true),
  edit_content: (role, user, ticket) => {
    if (role === 'reporter') return isOwner(user, ticket) && ['aberta', 'aguardando_informacoes', 'aguardando_terceiro', 'aguardando_usuario'].includes(ticket.status);
    return isAtLeast(role, 'dev');
  },
  triage: (role) => isAtLeast(role, 'dev'),
  reassign: (role) => role === 'dev' || isAtLeast(role, 'gestao'),
  change_severity: (role) => isAtLeast(role, 'dev'),
  change_priority: (role) => isAtLeast(role, 'dev'),
  advance_dev_pipeline: (role, user, ticket) => (role === 'dev' ? isAssignee(user, ticket) : isAtLeast(role, 'gestao')),
  block: (role) => isAtLeast(role, 'dev'),
  unblock: (role) => isAtLeast(role, 'dev'),
  pause: (role) => isAtLeast(role, 'dev'),
  resume: (role) => isAtLeast(role, 'dev'),
  homologar: (role) => isAtLeast(role, 'gestao'),
  enviar_validacao: (role, user, ticket) => (role === 'dev' ? isAssignee(user, ticket) : isAtLeast(role, 'gestao')),
  aprovar_validacao: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : isAtLeast(role, 'gestao')),
  reprovar_validacao: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : isAtLeast(role, 'gestao')),
  reabrir: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : isAtLeast(role, 'gestao')),
  fechar_sem_desenvolver: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : isAtLeast(role, 'dev')),
  fechar_motivo_gestao: (role) => isAtLeast(role, 'gestao'),
  editar_prazo_proxima_acao: (role, user, ticket) => (role === 'dev' ? isAssignee(user, ticket) : isAtLeast(role, 'gestao')),
  arquivar: (role) => isAtLeast(role, 'gestao'),
  excluir: (role, user, ticket) => (role === 'reporter' ? isOwner(user, ticket) : isAtLeast(role, 'dev')),
  restaurar: (role) => isAtLeast(role, 'gestao'),
  purgar: (role) => role === 'admin',
};
function canDoClient(action, user, ticket, payload) {
  const role = effectiveXflowRole(user);
  if (!role) return false;
  const rule = XFLOW_RULES[action];
  if (!rule) return true;
  return !!rule(role, user, ticket, payload);
}

const WAITING_ON_LABEL = { solicitante: 'Solicitante', cliente: 'Cliente', terceiro: 'Terceiro' };
const XFLOW_PURGE_CONFIRM_PHRASE = 'APAGAR DE VEZ';

function whoHasTheBall(ticket, teamById) {
  if (ticket.ballHolderType === 'none') return '—';
  if (ticket.ballHolderType === 'triage_queue') return 'Fila de triagem (dev/gestão)';
  if (ticket.ballHolderType === 'reporter' && ticket.status === 'aguardando_terceiro') return WAITING_ON_LABEL[ticket.waitingOnType] || 'Solicitante';
  if (ticket.ballHolderType === 'reporter') return 'Solicitante';
  if (ticket.ballHolderType === 'gestao') return 'Gestão';
  if (ticket.ballHolderType === 'terceiro') return WAITING_ON_LABEL[ticket.waitingOnType] || 'Terceiro';
  if (ticket.ballHolderType === 'dev' && ticket.ballHolderUserId && teamById[ticket.ballHolderUserId]) return teamById[ticket.ballHolderUserId].name;
  return 'Ninguém atribuído';
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

// Editor rich text da Descrição do problema — negrito/itálico/sublinhado,
// fonte, alinhamento, lista, citação, e colar print/imagem direto no texto
// (que também vira anexo, ver onPasteImage). `value` continua controlado
// pelo pai, mas só re-sincroniza o innerHTML quando o campo NÃO está em
// foco (senão o cursor pula a cada tecla) — truque padrão pra contentEditable
// controlado. `onChange` é local/vivo (sem custo de rede); `onCommit` é o
// que efetivamente salva (onBlur), mesmo espírito do ContentField acima.
function RichTextEditor({ value, onChange, onCommit, onPasteImage, disabled, placeholder }) {
  const editorRef = useRef(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const html = sanitizeRichText(value || '');
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [value]);

  function currentHtml() {
    return sanitizeRichText(editorRef.current ? editorRef.current.innerHTML : '');
  }
  function handleInput() {
    if (onChange) onChange(currentHtml());
  }
  function handleBlur() {
    if (onCommit) onCommit(currentHtml());
  }
  function exec(cmd, arg) {
    if (disabled || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(cmd, false, arg);
    handleInput();
  }
  function handlePaste(e) {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const imageItem = items.find((it) => it.type && it.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    if (file.size > MAX_EVIDENCE_BYTES) {
      window.alert(`A imagem colada tem ${(file.size / (1024 * 1024)).toFixed(1)} MB — o limite é ${MAX_EVIDENCE_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      document.execCommand('insertImage', false, reader.result);
      handleInput();
      handleBlur();
      if (onPasteImage) onPasteImage({ id: uid('ev'), name: `print-${Date.now()}.png`, size: file.size, type: file.type, dataUrl: reader.result });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <style>{RICH_TEXT_CSS}</style>
      {!disabled && (
        <div className="xflow-rte-toolbar">
          <button type="button" className="xflow-rte-btn" title="Negrito" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><Bold size={13} /></button>
          <button type="button" className="xflow-rte-btn" title="Itálico" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><Italic size={13} /></button>
          <button type="button" className="xflow-rte-btn" title="Sublinhado" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><UnderlineIcon size={13} /></button>
          <div className="xflow-rte-sep" />
          <select className="xflow-rte-font" title="Fonte" defaultValue="" onMouseDown={(e) => e.preventDefault()} onChange={(e) => { exec('fontName', e.target.value || 'inherit'); e.target.value = ''; }}>
            {RICH_TEXT_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <div className="xflow-rte-sep" />
          <button type="button" className="xflow-rte-btn" title="Alinhar à esquerda" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyLeft')}><AlignLeft size={13} /></button>
          <button type="button" className="xflow-rte-btn" title="Centralizar" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyCenter')}><AlignCenter size={13} /></button>
          <button type="button" className="xflow-rte-btn" title="Alinhar à direita" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyRight')}><AlignRight size={13} /></button>
          <div className="xflow-rte-sep" />
          <button type="button" className="xflow-rte-btn" title="Lista" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}><List size={13} /></button>
          <button type="button" className="xflow-rte-btn" title="Citação" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'blockquote')}><Quote size={13} /></button>
        </div>
      )}
      <div
        ref={editorRef}
        className="xflow-rte-body"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder || ''}
        onInput={handleInput}
        onBlur={handleBlur}
        onPaste={handlePaste}
      />
    </div>
  );
}

function blankTicketForm() {
  return {
    title: '', product: '', clientType: '', module: '', affectedUser: '', affectedCompany: '',
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

  const requiredOk = form.title.trim() && form.product && !richTextIsBlank(form.description) && form.environment;

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
      <div style={{ ...S.detailBox, width: 'min(660px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? undefined : '24px 30px 30px 30px', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...S.detailTopBar, alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>Novo BUG</div>
            <div style={{ fontSize: 12, color: 'var(--text-5)', marginTop: 3 }}>
              Só o essencial pra abrir agora — dá pra completar o resto depois.
            </div>
          </div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={S.subSectionLabel}>Título do BUG</div>
        <input
          type="text" value={form.title} onChange={(e) => set({ title: e.target.value })}
          placeholder='Ex.: "Erro ao calcular aderência após upload do SPED"'
          style={{ fontSize: 17, fontWeight: 600, padding: '13px 14px', borderRadius: 9 }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <div style={S.subSectionLabel}>Produto / Plataforma</div>
            <select value={form.product} onChange={(e) => set({ product: e.target.value })}>
              <option value="">Selecione</option>
              {XFLOW_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <div style={S.subSectionLabel}>Tipo de cliente</div>
            <select value={form.clientType} onChange={(e) => set({ clientType: e.target.value })}>
              <option value="">Selecione</option>
              {XFLOW_CLIENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <div style={S.subSectionLabel}>Ambiente</div>
            <select value={form.environment} onChange={(e) => set({ environment: e.target.value })}>
              <option value="producao">Produção</option>
              <option value="homologacao">Homologação</option>
              <option value="desenvolvimento">Desenvolvimento</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={S.subSectionLabel}>Descrição do problema</div>
          <RichTextEditor
            value={form.description}
            onChange={(html) => set({ description: html })}
            onPasteImage={(ev) => setForm((f) => ({ ...f, evidence: [...f.evidence, ev] }))}
            placeholder="O que aconteceu"
          />
        </div>

        <div style={{ ...S.fieldHint, marginTop: 10 }}>
          O resto pode ser preenchido depois de aberto: módulo, usuário/empresa afetados,
          resultado esperado, passo a passo, impacto, frequência, data da ocorrência e prioridade sugerida.
        </div>

        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', padding: '9px 0', userSelect: 'none' }}>
            Adicionar mais detalhes agora (opcional)
          </summary>
          <div style={{ marginTop: 4, padding: '16px', background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Módulo / Tela</div>
              <input type="text" value={form.module} onChange={(e) => set({ module: e.target.value })} placeholder="Ex.: Upload, Aderência, Dashboard" />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Usuário afetado</div>
                <input type="text" value={form.affectedUser} onChange={(e) => set({ affectedUser: e.target.value })} placeholder="Quem encontrou o problema" />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Empresa/Cliente afetado</div>
                <input type="text" value={form.affectedCompany} onChange={(e) => set({ affectedCompany: e.target.value })} />
              </div>
            </div>
            <div>
              <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Resultado esperado</div>
              <textarea rows={2} value={form.expectedResult} onChange={(e) => set({ expectedResult: e.target.value })} placeholder="O que deveria acontecer" />
            </div>
            <div>
              <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Passo a passo para reproduzir</div>
              <textarea rows={4} value={form.reproSteps} onChange={(e) => set({ reproSteps: e.target.value })} placeholder={'1. Entrou em...\n2. Clicou em...\n3. Fez upload...'} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Impacto</div>
                <select value={form.impact} onChange={(e) => set({ impact: e.target.value })}>
                  <option value="">Selecione</option>
                  {XFLOW_IMPACT_ORDER.map((k) => <option key={k} value={k}>{XFLOW_IMPACT_META[k]}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Frequência</div>
                <select value={form.frequency} onChange={(e) => set({ frequency: e.target.value })}>
                  <option value="">Selecione</option>
                  {XFLOW_FREQUENCY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_FREQUENCY_META[k]}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Data da ocorrência</div>
                <input type="date" value={form.occurredAt} onChange={(e) => set({ occurredAt: e.target.value })} />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Prioridade sugerida</div>
                <select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
                  <option value="">Selecione</option>
                  {XFLOW_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_PRIORITY_META[k].label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Evidência (print, vídeo, arquivo, mensagem de erro)</div>
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
          </div>
        </details>

        <div style={{ ...S.fieldHint, marginTop: 14 }}>
          Capturado automaticamente ao enviar: URL atual, navegador, sistema operacional, resolução da tela e sessão — do ambiente de quem está preenchendo este formulário, não necessariamente de quem sofreu o problema.
        </div>

        {error && <div style={{ ...S.loginBlockedMsg, marginTop: 10 }}>{error}</div>}

        <button style={{ ...S.primaryBtn, marginTop: 18, width: '100%', justifyContent: 'center', padding: '12px 16px', fontSize: 13.5, borderRadius: 9 }} onClick={submit} disabled={!requiredOk || saving}>
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
    { key: 'pedir_infos', label: 'Solicitar mais informações' },
    { key: 'nao_reproduziu', label: 'Não consegui reproduzir' },
    { key: 'marcar_duplicado', label: 'Marcar como duplicado' },
    { key: 'classificar_nao_bug', label: 'Classificar como não sendo BUG' },
    { key: 'escalar_gerencia', label: 'Escalar para gerência/PO' },
    { key: 'redirecionar', label: 'Redirecionar' },
    { key: 'iniciar_dev_direto', label: 'Iniciar desenvolvimento' },
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

const CONTENT_FIELD_MAX_H = 320;

function autosize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, CONTENT_FIELD_MAX_H) + 'px';
}

function ContentField({ as: Tag = 'textarea', value, onCommit, disabled, rows, placeholder, type }) {
  const [draft, setDraft] = useState(value || '');
  const taRef = useRef(null);
  useEffect(() => { setDraft(value || ''); }, [value]);
  useEffect(() => { autosize(taRef.current); }, [draft]);
  const common = {
    value: draft, disabled, placeholder,
    onChange: (e) => setDraft(e.target.value),
    onBlur: () => { if (draft !== (value || '')) onCommit(draft); },
  };
  if (Tag === 'input') return <input type={type || 'text'} {...common} />;
  return (
    <textarea
      ref={taRef} rows={rows || 2} {...common}
      style={{ resize: 'none', overflowY: 'auto', maxHeight: CONTENT_FIELD_MAX_H }}
    />
  );
}

function TicketDetailModal({ ticket, team, currentUser, onClose, onAction, onCreateSpinoff }) {
  const isMobile = useIsMobile();
  const role = effectiveXflowRole(currentUser);
  const [events, setEvents] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const commentRef = useRef(null);
  useEffect(() => { autosize(commentRef.current); }, [commentDraft]);
  const [pendingMentions, setPendingMentions] = useState([]);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockReasonDraft, setBlockReasonDraft] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeReasonDraft, setCloseReasonDraft] = useState('');
  const [closeJustDraft, setCloseJustDraft] = useState('');
  const [closeDupIdDraft, setCloseDupIdDraft] = useState('');
  const [showDupForm, setShowDupForm] = useState(false);
  const [dupIdDraft, setDupIdDraft] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reproduceNoteDraft, setReproduceNoteDraft] = useState('');
  const [showReproduceForm, setShowReproduceForm] = useState(false);
  const [showRedirectForm, setShowRedirectForm] = useState(false);
  const [redirectProduct, setRedirectProduct] = useState('');
  const [redirectModule, setRedirectModule] = useState('');
  const [redirectAssignee, setRedirectAssignee] = useState('');
  const [showWaitForm, setShowWaitForm] = useState(false);
  const [waitOnType, setWaitOnType] = useState('solicitante');
  const [waitNote, setWaitNote] = useState('');
  const [showGerenciaForm, setShowGerenciaForm] = useState(false);
  const [gerenciaNote, setGerenciaNote] = useState('');
  const [showHomologRejectForm, setShowHomologRejectForm] = useState(false);
  const [homologRejectNote, setHomologRejectNote] = useState('');
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [publishVersion, setPublishVersion] = useState('');
  const [publishBuild, setPublishBuild] = useState('');
  const [publishRelease, setPublishRelease] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiGet(`/api/xflow/tickets/${ticket.id}/events`).then((res) => { if (!cancelled) setEvents(res.events); }).catch(() => {});
    return () => { cancelled = true; };
  }, [ticket.id, ticket.updatedAt]);

  const teamById = useMemo(() => {
    const m = {};
    (team || []).forEach((t) => { m[t.id] = t; });
    return m;
  }, [team]);

  async function runAction(action, payload) {
    try {
      await onAction(ticket.id, action, payload || {});
    } catch (e) {
      window.alert(e.message);
    }
  }

  function triageAction(key) {
    if (key === 'aceitar') runAction('aceitar');
    else if (key === 'pedir_infos') setShowWaitForm(true);
    else if (key === 'nao_reproduziu') setShowReproduceForm(true);
    else if (key === 'marcar_duplicado') setShowDupForm(true);
    else if (key === 'classificar_nao_bug') runAction('classificar_nao_bug');
    else if (key === 'escalar_gerencia') runAction('escalar_gerencia');
    else if (key === 'redirecionar') setShowRedirectForm(true);
    else if (key === 'iniciar_dev_direto') runAction('iniciar_dev_direto');
  }

  function confirmWait() {
    runAction('pedir_infos', { waitingOnType: waitOnType, note: waitNote.trim() || undefined });
    setShowWaitForm(false);
    setWaitNote('');
  }
  function confirmResolverGerencia() {
    if (!gerenciaNote.trim()) return;
    runAction('resolver_gerencia', { note: gerenciaNote.trim() });
    setShowGerenciaForm(false);
    setGerenciaNote('');
  }
  function confirmHomologReject() {
    if (!homologRejectNote.trim()) return;
    runAction('homolog_reprovar', { note: homologRejectNote.trim() });
    setShowHomologRejectForm(false);
    setHomologRejectNote('');
  }
  function confirmPublish() {
    const payload = {};
    if (publishVersion.trim()) payload.version = publishVersion.trim();
    if (publishBuild.trim()) payload.build = publishBuild.trim();
    if (publishRelease.trim()) payload.release = publishRelease.trim();
    runAction('publicar', payload);
    setShowPublishForm(false);
    setPublishVersion(''); setPublishBuild(''); setPublishRelease('');
  }

  function confirmReproduce() {
    if (!reproduceNoteDraft.trim()) return;
    runAction('nao_reproduziu', { closureJustification: reproduceNoteDraft.trim() });
    setShowReproduceForm(false);
    setReproduceNoteDraft('');
  }
  function confirmDuplicate() {
    if (!dupIdDraft.trim()) return;
    runAction('marcar_duplicado', { duplicateOfTicketId: dupIdDraft.trim() });
    setShowDupForm(false);
    setDupIdDraft('');
  }
  function confirmRedirect() {
    const payload = {};
    if (redirectProduct) payload.product = redirectProduct;
    if (redirectModule.trim()) payload.module = redirectModule.trim();
    if (redirectAssignee) payload.assigneeId = redirectAssignee;
    if (!payload.product && !payload.module && !payload.assigneeId) return;
    runAction('redirecionar', payload);
    setShowRedirectForm(false);
    setRedirectProduct(''); setRedirectModule(''); setRedirectAssignee('');
  }

  function confirmBlock() {
    if (!blockReasonDraft) return;
    runAction('bloquear', { blockedReason: blockReasonDraft });
    setShowBlockForm(false);
    setBlockReasonDraft('');
  }

  async function confirmClose() {
    if (!closeReasonDraft || !closeJustDraft.trim()) return;
    if (closeReasonDraft === 'duplicado' && !closeDupIdDraft.trim()) return;
    await runAction('fechar_sem_desenvolver', {
      closureReason: closeReasonDraft, closureJustification: closeJustDraft.trim(),
      duplicateOfTicketId: closeReasonDraft === 'duplicado' ? closeDupIdDraft.trim() : undefined,
    });
    if (closeReasonDraft === 'melhoria' && onCreateSpinoff) {
      await onCreateSpinoff(ticket);
    }
    setShowCloseForm(false);
    setCloseReasonDraft(''); setCloseJustDraft(''); setCloseDupIdDraft('');
  }

  function submitComment() {
    const text = commentDraft.trim();
    if (!text) return;
    runAction('comentar', { text, mentions: pendingMentions });
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
      reader.onload = () => runAction('anexar', { evidence: { id: uid('ev'), name: file.name, size: file.size, type: file.type, dataUrl: reader.result } });
      reader.readAsDataURL(file);
    });
  }

  const ball = whoHasTheBall(ticket, teamById);
  const terminal = isTerminal(ticket.status);
  const canEditContent = canDoClient('edit_content', currentUser, ticket);
  const canEditOps = canDoClient('editar_prazo_proxima_acao', currentUser, ticket);
  const closureReasonOptions = XFLOW_CLOSURE_REASON_ORDER.filter((k) => k !== 'descartado_gestao' || canDoClient('fechar_motivo_gestao', currentUser, ticket));

  const legacyHistory = (ticket.history || []).map((h, i) => ({ id: `legacy-${i}`, createdAt: h.ts, note: h.action, userName: h.user }));
  const structuredHistory = events
    .filter((e) => e.type !== 'comment')
    .map((e) => ({ id: e.id, createdAt: e.createdAt, note: e.note, userName: (teamById[e.userId] && teamById[e.userId].name) || '' }));
  const timeline = [...structuredHistory, ...legacyHistory].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return (
    <div style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={onClose}>
      <div style={{ ...S.detailBox, width: 'min(1000px, 100%)', maxHeight: '92vh', overflowY: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-5)', fontWeight: 700 }}>BUG #{ticket.number}</div>
            <ContentField as="input" value={ticket.title} disabled={!canEditContent} onCommit={(v) => runAction('editar_campo', { field: 'title', value: v })} />
          </div>
          <button style={S.iconBtnGhost} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <Badge meta={XFLOW_STATUS_META[ticket.status]} />
          <Badge meta={XFLOW_SEVERITY_META[ticket.severity]} />
          <Badge meta={XFLOW_PRIORITY_META[ticket.priority]} />
          {ticket.slaResolutionState && <Badge meta={XFLOW_SLA_STATE_META[ticket.slaResolutionState]} />}
          {ticket.archived && <Badge meta={{ label: 'Arquivado', ...tone('#999999') }} />}
          {ticket.deleted && <Badge meta={{ label: 'Na Lixeira', ...tone('#e2574c') }} />}
        </div>

        {ticket.deleted && (
          <div style={{ ...S.loginBlockedMsg, marginBottom: 14 }}>
            Este BUG está na Lixeira{ticket.deletedBy && teamById[ticket.deletedBy] ? ` (excluído por ${teamById[ticket.deletedBy].name})` : ''}.
            {canDoClient('restaurar', currentUser, ticket) && (
              <button style={{ ...S.iconBtn, marginLeft: 10 }} onClick={() => runAction('restaurar')}>Restaurar</button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 20, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <div style={{ flex: 2, minWidth: 0 }}>
            <div style={S.subSectionLabel}>Descrição</div>
            <RichTextEditor
              value={ticket.description}
              disabled={!canEditContent}
              onCommit={(html) => runAction('editar_campo', { field: 'description', value: html })}
              onPasteImage={(ev) => runAction('anexar', { evidence: ev })}
              placeholder="O que aconteceu"
            />

            <div style={{ ...S.subSectionLabel, marginTop: 12 }}>Resultado esperado</div>
            <ContentField value={ticket.expectedResult} disabled={!canEditContent} rows={2} onCommit={(v) => runAction('editar_campo', { field: 'expectedResult', value: v })} />

            <div style={{ ...S.subSectionLabel, marginTop: 12 }}>Passo a passo para reproduzir</div>
            <ContentField value={ticket.reproSteps} disabled={!canEditContent} rows={4} onCommit={(v) => runAction('editar_campo', { field: 'reproSteps', value: v })} />

            <div style={{ ...S.subSectionLabel, marginTop: 12 }}>Evidências</div>
            {canDoClient('attach_evidence', currentUser, ticket) && (
              <label style={S.iconBtn}><Upload size={14} /> Anexar
                <input type="file" multiple style={{ display: 'none' }} onChange={handleEvidencePick} />
              </label>
            )}
            {(ticket.evidence || []).map((ev) => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
                {ev.type && ev.type.startsWith('image/') ? <img src={ev.dataUrl} alt={ev.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} /> : <Paperclip size={12} />}
                <a href={ev.dataUrl} download={ev.name}>{ev.name}</a>
              </div>
            ))}

            {(ticket.solution || ticket.whatToTest || ['em_desenvolvimento', 'em_revisao', 'pronta_para_teste', 'em_homologacao', 'publicada', 'aguardando_validacao_solicitante', 'concluida'].includes(ticket.status)) && (
              <>
                <div style={{ ...S.subSectionLabel, marginTop: 12 }}>Solução aplicada</div>
                <ContentField value={ticket.solution} disabled={!canEditContent} rows={2} placeholder="O que foi feito para corrigir" onCommit={(v) => runAction('editar_campo', { field: 'solution', value: v })} />
                <div style={{ ...S.subSectionLabel, marginTop: 12 }}>O que testar</div>
                <ContentField value={ticket.whatToTest} disabled={!canEditContent} rows={2} placeholder="Passos pra validar a correção" onCommit={(v) => runAction('editar_campo', { field: 'whatToTest', value: v })} />
              </>
            )}

            <div style={{ ...S.subSectionLabel, marginTop: 16 }}><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários</div>
            <textarea
              ref={commentRef} rows={2} value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Escreva um comentário... use @ pra mencionar alguém"
              style={{ resize: 'none', overflowY: 'auto', maxHeight: CONTENT_FIELD_MAX_H }}
            />
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
            {timeline.length === 0 && <div style={S.emptyMuted}>Nenhum evento ainda.</div>}
            {timeline.map((h) => (
              <div key={h.id} style={S.logRow}>
                <div style={S.logTs}>{fmtTs(h.createdAt)}{h.userName ? ` · ${h.userName}` : ''}</div>
                <div style={S.logAction}>{h.note}</div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: isMobile ? '100%' : 260 }}>
            <div style={{ ...S.accessBlock, marginBottom: 12 }}>
              <div style={S.settingsLabel}>Quem está com a bola</div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{ball}</div>
              {ticket.flaggedReturned && <div style={{ ...S.fieldHint, marginTop: 4, color: '#ff9f40', fontWeight: 700 }}>↩ Voltou para você</div>}
              {ticket.nextAction && <div style={{ ...S.fieldHint, marginTop: 4 }}>Próxima ação: {ticket.nextAction}</div>}
              {ticket.dueDate && <div style={{ ...S.fieldHint, marginTop: 2 }}>Prazo: {fmtDate(ticket.dueDate)}</div>}
            </div>

            {!terminal && (ticket.status === 'aberta' || ticket.status === 'triagem') && canDoClient('triage', currentUser, ticket) && (
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
            {showRedirectForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Novo produto (opcional)</div>
                <select value={redirectProduct} onChange={(e) => setRedirectProduct(e.target.value)}>
                  <option value="">Manter</option>
                  {XFLOW_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <div style={{ ...S.fieldHint, marginTop: 6 }}>Novo módulo (opcional)</div>
                <input type="text" value={redirectModule} onChange={(e) => setRedirectModule(e.target.value)} />
                <div style={{ ...S.fieldHint, marginTop: 6 }}>Novo responsável (opcional)</div>
                <select value={redirectAssignee} onChange={(e) => setRedirectAssignee(e.target.value)}>
                  <option value="">Manter</option>
                  {(team || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmRedirect}>Confirmar redirecionamento</button>
              </div>
            )}
            {showWaitForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Aguardar resposta de</div>
                <select value={waitOnType} onChange={(e) => setWaitOnType(e.target.value)}>
                  <option value="solicitante">Solicitante</option>
                  <option value="cliente">Cliente</option>
                  <option value="terceiro">Terceiro</option>
                </select>
                <div style={{ ...S.fieldHint, marginTop: 6 }}>O que está faltando (opcional)</div>
                <textarea rows={2} value={waitNote} onChange={(e) => setWaitNote(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmWait}>Confirmar</button>
              </div>
            )}

            {ticket.status === 'atribuida' && canDoClient('advance_dev_pipeline', currentUser, ticket) && (
              <button style={{ ...S.primaryBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => runAction('iniciar_desenvolvimento')}>Iniciar desenvolvimento</button>
            )}
            {ticket.status === 'em_desenvolvimento' && canDoClient('advance_dev_pipeline', currentUser, ticket) && (
              <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => runAction('enviar_revisao')}>Enviar para revisão</button>
            )}
            {ticket.status === 'em_revisao' && canDoClient('advance_dev_pipeline', currentUser, ticket) && (
              <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => runAction('marcar_pronta_teste')}>Marcar pronta para teste</button>
            )}
            {ticket.status === 'pronta_para_teste' && canDoClient('advance_dev_pipeline', currentUser, ticket) && (
              <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => runAction('enviar_homologacao')}>Enviar para homologação</button>
            )}
            {ticket.status === 'em_homologacao' && (
              canDoClient('homologar', currentUser, ticket) ? (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button style={{ ...S.primaryBtn, flex: 1, justifyContent: 'center' }} onClick={() => runAction('homolog_aprovar')}>Aprovar</button>
                  <button style={{ ...S.iconBtn, flex: 1, justifyContent: 'center' }} onClick={() => setShowHomologRejectForm(true)}>Reprovar</button>
                </div>
              ) : <div style={{ ...S.fieldHint, marginBottom: 8 }}>Em homologação — só gestão/admin aprova ou reprova.</div>
            )}
            {showHomologRejectForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Motivo da reprovação (obrigatório)</div>
                <textarea rows={2} value={homologRejectNote} onChange={(e) => setHomologRejectNote(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmHomologReject} disabled={!homologRejectNote.trim()}>Confirmar reprovação</button>
              </div>
            )}
            {ticket.status === 'pronta_para_publicacao' && canDoClient('publicar', currentUser, ticket) && (
              <button style={{ ...S.primaryBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => setShowPublishForm(true)}>Publicar</button>
            )}
            {showPublishForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Versão (opcional)</div>
                <input type="text" value={publishVersion} onChange={(e) => setPublishVersion(e.target.value)} />
                <div style={{ ...S.fieldHint, marginTop: 6 }}>Build (opcional)</div>
                <input type="text" value={publishBuild} onChange={(e) => setPublishBuild(e.target.value)} />
                <div style={{ ...S.fieldHint, marginTop: 6 }}>Release (opcional)</div>
                <input type="text" value={publishRelease} onChange={(e) => setPublishRelease(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmPublish}>Confirmar publicação</button>
              </div>
            )}
            {ticket.status === 'aguardando_gerencia' && (
              canDoClient('resolver_gerencia', currentUser, ticket)
                ? <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => setShowGerenciaForm(true)}>Resolver e devolver ao dev</button>
                : <div style={{ ...S.fieldHint, marginBottom: 8 }}>Aguardando decisão da gestão.</div>
            )}
            {showGerenciaForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Decisão (obrigatória)</div>
                <textarea rows={2} value={gerenciaNote} onChange={(e) => setGerenciaNote(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmResolverGerencia} disabled={!gerenciaNote.trim()}>Confirmar decisão</button>
              </div>
            )}
            {ticket.status === 'publicada' && canDoClient('enviar_validacao', currentUser, ticket) && (
              <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => runAction('enviar_validacao')}>Enviar para validação do solicitante</button>
            )}
            {ticket.status === 'aguardando_validacao_solicitante' && (
              canDoClient('aprovar_validacao', currentUser, ticket) ? (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button style={{ ...S.primaryBtn, flex: 1, justifyContent: 'center' }} onClick={() => runAction('aprovar_validacao')}>Aprovar</button>
                  <button style={{ ...S.iconBtn, flex: 1, justifyContent: 'center' }} onClick={() => runAction('reprovar_validacao')}>Reprovar</button>
                </div>
              ) : <div style={{ ...S.fieldHint, marginBottom: 8 }}>Aguardando validação do solicitante — DEV não pode concluir sozinho.</div>
            )}

            {!terminal && ticket.status !== 'bloqueada' && canDoClient('block', currentUser, ticket) && (
              <button style={{ ...S.iconBtnGhost, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={() => setShowBlockForm(true)}><Ban size={13} /> Bloquear</button>
            )}
            {ticket.status === 'bloqueada' && canDoClient('unblock', currentUser, ticket) && (
              <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={() => runAction('desbloquear')}>Desbloquear</button>
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
            {!terminal && ['pausada', 'aguardando_terceiro'].includes(ticket.status) && canDoClient('resume', currentUser, ticket) && (
              <button style={{ ...S.iconBtnGhost, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={() => runAction('retomar')}>Retomar</button>
            )}
            {!terminal && !['bloqueada', 'pausada', 'aguardando_terceiro', 'aguardando_gerencia'].includes(ticket.status) && canDoClient('pause', currentUser, ticket) && (
              <button style={{ ...S.iconBtnGhost, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={() => runAction('pausar')}>Pausar</button>
            )}
            {!terminal && canDoClient('fechar_sem_desenvolver', currentUser, ticket) && (
              <button style={{ ...S.iconBtnGhost, width: '100%', justifyContent: 'center', marginBottom: 6, color: '#e2574c' }} onClick={() => setShowCloseForm((v) => !v)}>Fechar sem desenvolver</button>
            )}
            {showCloseForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Motivo do encerramento</div>
                <select value={closeReasonDraft} onChange={(e) => setCloseReasonDraft(e.target.value)}>
                  <option value="">Selecione</option>
                  {closureReasonOptions.map((k) => <option key={k} value={k}>{XFLOW_CLOSURE_REASON_META[k]}</option>)}
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
            {terminal && !ticket.archived && canDoClient('reabrir', currentUser, ticket) && (
              <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={() => {
                const note = window.prompt('Motivo da reabertura (obrigatório):');
                if (note && note.trim()) runAction('reabrir', { note: note.trim() });
              }}>Reabrir BUG</button>
            )}
            {ticket.status === 'concluida' && !ticket.archived && canDoClient('arquivar', currentUser, ticket) && (
              <button style={{ ...S.iconBtnGhost, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={() => runAction('arquivar')}><Archive size={13} /> Arquivar</button>
            )}
            {!ticket.deleted && canDoClient('excluir', currentUser, ticket) && (
              <button style={{ ...S.iconBtnGhost, width: '100%', justifyContent: 'center', marginBottom: 6, color: '#e2574c' }} onClick={() => setShowDeleteConfirm((v) => !v)}>
                <Trash2 size={13} /> Excluir
              </button>
            )}
            {!ticket.deleted && showDeleteConfirm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>
                  O BUG vai para a Lixeira — nada é apagado de verdade. Fica lá com todo o
                  histórico até alguém da gestão restaurar (ou o admin apagar de vez).
                </div>
                <button style={{ ...S.iconBtn, marginTop: 6, color: '#e2574c' }} onClick={() => runAction('excluir')}>Confirmar exclusão</button>
              </div>
            )}

            <div style={{ ...S.subSectionLabel, marginTop: 14 }}>Severidade</div>
            <select value={ticket.severity || ''} disabled={!canDoClient('change_severity', currentUser, ticket)} onChange={(e) => runAction('mudar_severidade', { severity: e.target.value })}>
              <option value="">Sem severidade</option>
              {XFLOW_SEVERITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_SEVERITY_META[k].label}</option>)}
            </select>

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Prioridade</div>
            <select value={ticket.priority || ''} disabled={!canDoClient('change_priority', currentUser, ticket)} onChange={(e) => runAction('mudar_prioridade', { priority: e.target.value })}>
              <option value="">Sem prioridade</option>
              {XFLOW_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_PRIORITY_META[k].label}</option>)}
            </select>
            {ticket.suggestedPriority && <div style={S.fieldHint}>Sugestão original do solicitante: {metaLabel(XFLOW_PRIORITY_META, ticket.suggestedPriority)}</div>}

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Responsável atual</div>
            {(role === 'gestao' || role === 'admin') ? (
              <select value={ticket.assigneeId || ''} onChange={(e) => runAction('reatribuir', { assigneeId: e.target.value || null })}>
                <option value="">Ninguém</option>
                {(team || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ) : role === 'dev' && ticket.assigneeId !== currentUser.id ? (
              <button style={S.iconBtn} onClick={() => runAction('reatribuir', { assigneeId: currentUser.id })}>Assumir para mim</button>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 600 }}>{(teamById[ticket.assigneeId] && teamById[ticket.assigneeId].name) || 'Ninguém'}</div>
            )}

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Próxima ação</div>
            <ContentField as="input" value={ticket.nextAction} disabled={!canEditOps} onCommit={(v) => runAction('editar_prazo_proxima_acao', { nextAction: v })} />

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Prazo</div>
            <input type="date" value={ticket.dueDate || ''} disabled={!canEditOps} onChange={(e) => runAction('editar_prazo_proxima_acao', { dueDate: e.target.value })} />

            <div style={{ ...S.subSectionLabel, marginTop: 14 }}>Dados capturados</div>
            <div style={S.fieldHint}>Produto: {ticket.product || '—'} · Módulo: {ticket.module || '—'}</div>
            <div style={S.fieldHint}>Tipo de cliente: {ticket.clientType || '—'} · Empresa afetada: {ticket.affectedCompany || '—'}</div>
            <div style={S.fieldHint}>Ambiente: {ticket.environment || '—'}</div>
            <div style={S.fieldHint}>Impacto: {metaLabel(XFLOW_IMPACT_META, ticket.impact)} · Frequência: {metaLabel(XFLOW_FREQUENCY_META, ticket.frequency)}</div>
            {ticket.occurredAt && <div style={S.fieldHint}>Data da ocorrência: {fmtDate(ticket.occurredAt)}</div>}
            {ticket.capturedUrl && <div style={{ ...S.fieldHint, wordBreak: 'break-all' }}>URL: {ticket.capturedUrl}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Agregações compartilhadas pelas três Homes (busca/filtros/aging/ordenação) ----

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
function daysSince(iso) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
function agingBucketOf(days) {
  if (days == null) return '';
  if (days <= 1) return '0-1';
  if (days <= 3) return '2-3';
  if (days <= 7) return '4-7';
  if (days <= 15) return '8-15';
  return '15+';
}
const AGING_BUCKET_ORDER = ['0-1', '2-3', '4-7', '8-15', '15+'];
const AGING_BUCKET_LABEL = { '0-1': '0–1 dia', '2-3': '2–3 dias', '4-7': '4–7 dias', '8-15': '8–15 dias', '15+': '15+ dias' };

const BLANK_FILTERS = { search: '', status: '', product: '', severity: '', priority: '', assigneeId: '', slaState: '', agingBucket: '' };

function matchesFilters(t, filters) {
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const hay = `#${t.number} ${t.title} ${t.affectedCompany || ''} ${t.affectedUser || ''} ${t.module || ''} ${t.product || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (filters.status && t.status !== filters.status) return false;
  if (filters.product && t.product !== filters.product) return false;
  if (filters.severity && t.severity !== filters.severity) return false;
  if (filters.priority && t.priority !== filters.priority) return false;
  if (filters.assigneeId && t.assigneeId !== filters.assigneeId) return false;
  if (filters.slaState && t.slaResolutionState !== filters.slaState) return false;
  if (filters.agingBucket && agingBucketOf(daysSince(t.createdAt)) !== filters.agingBucket) return false;
  return true;
}
function hasActiveFilters(filters) { return Object.values(filters).some(Boolean); }

const DEV_SORT_PRIORITY_RANK = { urgente: 0, alta: 1, normal: 2, baixa: 3, '': 4 };
const DEV_SORT_SEVERITY_RANK = { s1: 0, s2: 1, s3: 2, s4: 3, '': 4 };
function smartDevSort(a, b) {
  const av = a.slaResolutionState === 'vencido' ? 0 : 1;
  const bv = b.slaResolutionState === 'vencido' ? 0 : 1;
  if (av !== bv) return av - bv;
  const ap = DEV_SORT_PRIORITY_RANK[a.priority] ?? 4;
  const bp = DEV_SORT_PRIORITY_RANK[b.priority] ?? 4;
  if (ap !== bp) return ap - bp;
  const as = DEV_SORT_SEVERITY_RANK[a.severity] ?? 4;
  const bs = DEV_SORT_SEVERITY_RANK[b.severity] ?? 4;
  if (as !== bs) return as - bs;
  const apv = a.slaResolutionState === 'proximo_vencer' ? 0 : 1;
  const bpv = b.slaResolutionState === 'proximo_vencer' ? 0 : 1;
  if (apv !== bpv) return apv - bpv;
  return (a.createdAt || '').localeCompare(b.createdAt || '');
}

function fmtHours(seconds) {
  const h = (seconds || 0) / 3600;
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function StatCard({ label, count, active, onClick, tone: cardTone }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...S.accessBlock, cursor: 'pointer', textAlign: 'left', minWidth: 118, flex: '1 1 118px',
        border: active ? '1px solid #F5C400' : undefined, background: active ? 'rgba(245,196,0,.08)' : undefined,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, color: cardTone || 'var(--text-1)' }}>{count}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-5)', marginTop: 2 }}>{label}</div>
    </button>
  );
}

function TicketRow({ t, teamById, onOpen }) {
  const days = daysSince(t.createdAt);
  return (
    <div style={{ ...S.accessBlock, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} onClick={() => onOpen(t.id)}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-5)', width: 56 }}>#{t.number}</div>
      <div style={{ flex: 1, minWidth: 160, fontWeight: 700 }}>
        {t.flaggedReturned && <span style={{ color: '#ff9f40', marginRight: 5 }}>↩</span>}
        {t.title}
      </div>
      <Badge meta={XFLOW_STATUS_META[t.status]} small />
      <Badge meta={XFLOW_SEVERITY_META[t.severity]} small />
      <Badge meta={XFLOW_PRIORITY_META[t.priority]} small />
      {(t.slaResolutionState === 'vencido' || t.slaResolutionState === 'proximo_vencer') && (
        <Badge meta={XFLOW_SLA_STATE_META[t.slaResolutionState]} small />
      )}
      <div style={{ fontSize: 11, color: 'var(--text-5)' }}>{t.product}</div>
      <div style={{ fontSize: 11, color: 'var(--text-5)' }}>{whoHasTheBall(t, teamById)}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text-6)' }}>{days == null ? '' : `há ${days}d`}</div>
    </div>
  );
}

function TicketList({ list, teamById, onOpen, emptyLabel }) {
  if (!list.length) return <div style={{ ...S.emptyMuted, marginTop: 10 }}>{emptyLabel || 'Nenhum BUG aqui.'}</div>;
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((t) => <TicketRow key={t.id} t={t} teamById={teamById} onOpen={onOpen} />)}
    </div>
  );
}

function FilterBar({ filters, setFilters, team }) {
  function set(patch) { setFilters((f) => ({ ...f, ...patch })); }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '14px 0' }}>
      <input type="text" placeholder="Buscar por ID, título, empresa, usuário..." value={filters.search} onChange={(e) => set({ search: e.target.value })} style={{ flex: '1 1 220px', minWidth: 180 }} />
      <select value={filters.status} onChange={(e) => set({ status: e.target.value })} style={{ width: 'auto' }}>
        <option value="">Todos os status</option>
        {Object.keys(XFLOW_STATUS_META).map((k) => <option key={k} value={k}>{XFLOW_STATUS_META[k].label}</option>)}
      </select>
      <select value={filters.product} onChange={(e) => set({ product: e.target.value })} style={{ width: 'auto' }}>
        <option value="">Todos os produtos</option>
        {XFLOW_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={filters.severity} onChange={(e) => set({ severity: e.target.value })} style={{ width: 'auto' }}>
        <option value="">Toda severidade</option>
        {XFLOW_SEVERITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_SEVERITY_META[k].label}</option>)}
      </select>
      <select value={filters.priority} onChange={(e) => set({ priority: e.target.value })} style={{ width: 'auto' }}>
        <option value="">Toda prioridade</option>
        {XFLOW_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_PRIORITY_META[k].label}</option>)}
      </select>
      {team && team.length > 0 && (
        <select value={filters.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })} style={{ width: 'auto' }}>
          <option value="">Todo responsável</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      <select value={filters.slaState} onChange={(e) => set({ slaState: e.target.value })} style={{ width: 'auto' }}>
        <option value="">Todo SLA</option>
        {Object.keys(XFLOW_SLA_STATE_META).map((k) => <option key={k} value={k}>{XFLOW_SLA_STATE_META[k].label}</option>)}
      </select>
      <select value={filters.agingBucket} onChange={(e) => set({ agingBucket: e.target.value })} style={{ width: 'auto' }}>
        <option value="">Toda idade</option>
        {AGING_BUCKET_ORDER.map((k) => <option key={k} value={k}>{AGING_BUCKET_LABEL[k]}</option>)}
      </select>
      {hasActiveFilters(filters) && (
        <button style={S.iconBtnGhost} onClick={() => setFilters(BLANK_FILTERS)}>Limpar filtros</button>
      )}
    </div>
  );
}

function ReporterHome({ tickets, currentUser, teamById, filters, setFilters, onOpen }) {
  const [quick, setQuick] = useState('abertos');
  const cards = [
    { key: 'abertos', label: 'Abertos', pred: (t) => !isTerminal(t.status) },
    { key: 'em_analise', label: 'Em análise', pred: (t) => t.status === 'aberta' },
    { key: 'em_desenvolvimento', label: 'Em desenvolvimento', pred: (t) => ['atribuida', 'em_desenvolvimento', 'em_revisao', 'pronta_para_teste'].includes(t.status) },
    { key: 'dependem_de_voce', label: 'Dependem de você', pred: (t) => t.ballHolderType === 'reporter' && !isTerminal(t.status) },
    { key: 'em_validacao', label: 'Em validação', pred: (t) => t.status === 'aguardando_validacao_solicitante' },
    { key: 'concluidos', label: 'Concluídos', pred: (t) => t.status === 'concluida' },
  ];
  const active = cards.find((c) => c.key === quick);
  const base = active ? tickets.filter((t) => active.pred(t) && !t.archived) : tickets.filter((t) => !t.archived);
  const list = base.filter((t) => matchesFilters(t, filters)).sort((a, b) => (b.statusEnteredAt || '').localeCompare(a.statusEnteredAt || ''));
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {cards.map((c) => (
          <StatCard key={c.key} label={c.label} count={tickets.filter((t) => c.pred(t) && !t.archived).length} active={quick === c.key} onClick={() => setQuick(quick === c.key ? null : c.key)} />
        ))}
      </div>
      <FilterBar filters={filters} setFilters={setFilters} />
      <TicketList list={list} teamById={teamById} onOpen={onOpen} />
    </>
  );
}

function DevHome({ tickets, currentUser, teamById, filters, setFilters, onOpen }) {
  const mine = tickets.filter((t) => t.assigneeId === currentUser.id && !(isTerminal(t.status) && t.archived));
  const fila = tickets.filter((t) => t.status === 'aberta' && !t.assigneeId);
  const filteredMine = mine.filter((t) => matchesFilters(t, filters));
  const sections = [
    { key: 'sla_vencido', label: 'SLA vencido', pred: (t) => t.slaResolutionState === 'vencido' },
    { key: 'urgentes', label: 'Urgentes / Críticos', pred: (t) => t.priority === 'urgente' || t.severity === 's1' },
    { key: 'voltaram', label: 'Voltaram para você', pred: (t) => t.flaggedReturned },
    { key: 'bloqueados', label: 'Bloqueados', pred: (t) => t.status === 'bloqueada' },
    { key: 'aguardando_sua_acao', label: 'Aguardando sua ação', pred: (t) => t.ballHolderType === 'dev' && t.ballHolderUserId === currentUser.id },
    { key: 'em_desenvolvimento', label: 'Em desenvolvimento', pred: (t) => ['atribuida', 'em_desenvolvimento', 'em_revisao', 'pronta_para_teste', 'em_homologacao', 'pronta_para_publicacao', 'publicada'].includes(t.status) },
  ];
  return (
    <>
      <FilterBar filters={filters} setFilters={setFilters} />
      {fila.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-4)', marginBottom: 2 }}>Fila de triagem ({fila.length})</div>
          <TicketList list={fila.filter((t) => matchesFilters(t, filters))} teamById={teamById} onOpen={onOpen} />
        </div>
      )}
      {sections.map((s) => {
        const items = filteredMine.filter(s.pred).sort(smartDevSort);
        if (!items.length) return null;
        return (
          <div key={s.key} style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-4)', marginBottom: 2 }}>{s.label} ({items.length})</div>
            <TicketList list={items} teamById={teamById} onOpen={onOpen} />
          </div>
        );
      })}
      {filteredMine.length === 0 && fila.length === 0 && <div style={{ ...S.emptyMuted, marginTop: 20 }}>Nenhum BUG aguardando você.</div>}
    </>
  );
}

function GestorHome({ tickets, team, teamById, filters, setFilters, onOpen }) {
  const [quick, setQuick] = useState(null);
  const [expandedProduct, setExpandedProduct] = useState(null);
  const active = tickets.filter((t) => !(isTerminal(t.status) && t.archived));

  const cards = [
    { key: 'abertos', label: 'Abertos', pred: (t) => !isTerminal(t.status) },
    { key: 'criticos', label: 'Críticos', pred: (t) => t.severity === 's1' },
    { key: 'novos_hoje', label: 'Novos hoje', pred: (t) => isToday(t.createdAt) },
    { key: 'resolvidos_hoje', label: 'Resolvidos hoje', pred: (t) => t.status === 'concluida' && isToday(t.slaResolutionMetAt) },
    { key: 'sla_vencido', label: 'SLA vencido', pred: (t) => t.slaResolutionState === 'vencido' },
    { key: 'bloqueados', label: 'Bloqueados', pred: (t) => t.status === 'bloqueada' },
    { key: 'aguardando_usuario', label: 'Aguardando usuário', pred: (t) => t.status === 'aguardando_terceiro' },
    { key: 'aguardando_gestao', label: 'Aguardando gestão', pred: (t) => t.status === 'aguardando_gerencia' },
    { key: 'em_homologacao', label: 'Em homologação', pred: (t) => ['em_homologacao', 'pronta_para_publicacao'].includes(t.status) },
    { key: 'reabertos', label: 'Reabertos', pred: (t) => (t.reopenCount || 0) > 0 },
  ];
  const activeCard = cards.find((c) => c.key === quick);
  const base = activeCard ? active.filter(activeCard.pred) : active;
  const list = base.filter((t) => matchesFilters(t, filters));

  const bottleneck = {};
  active.forEach((t) => { Object.entries(t.timeBreakdown || {}).forEach(([k, v]) => { bottleneck[k] = (bottleneck[k] || 0) + v; }); });
  const BOTTLENECK_LABEL = { dev: 'Em desenvolvimento', aguardando_usuario: 'Aguardando usuário', aguardando_gestao: 'Aguardando gestão', bloqueado: 'Bloqueado', pausado: 'Pausado', homologacao: 'Homologação', aguardando_validacao: 'Aguardando validação' };

  const byProduct = {};
  active.forEach((t) => {
    const p = t.product || 'Sem produto';
    byProduct[p] = byProduct[p] || { count: 0, modules: {} };
    byProduct[p].count += 1;
    const m = t.module || 'Sem módulo';
    byProduct[p].modules[m] = (byProduct[p].modules[m] || 0) + 1;
  });

  const byDev = {};
  active.forEach((t) => {
    if (!t.assigneeId) return;
    byDev[t.assigneeId] = byDev[t.assigneeId] || { count: 0, devSeconds: 0 };
    byDev[t.assigneeId].count += 1;
    byDev[t.assigneeId].devSeconds += (t.timeBreakdown && t.timeBreakdown.dev) || 0;
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {cards.map((c) => (
          <StatCard key={c.key} label={c.label} count={active.filter(c.pred).length} active={quick === c.key} onClick={() => setQuick(quick === c.key ? null : c.key)} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 18 }}>
        <div style={{ ...S.accessBlock, flex: '1 1 260px' }}>
          <div style={S.settingsLabel}>Gargalos — tempo acumulado (tickets ativos)</div>
          {Object.keys(BOTTLENECK_LABEL).map((k) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 6 }}>
              <span style={{ color: 'var(--text-4)' }}>{BOTTLENECK_LABEL[k]}</span>
              <span style={{ fontWeight: 700 }}>{fmtHours(bottleneck[k])}</span>
            </div>
          ))}
        </div>

        <div style={{ ...S.accessBlock, flex: '1 1 260px' }}>
          <div style={S.settingsLabel}>Por produto / módulo</div>
          {Object.entries(byProduct).sort((a, b) => b[1].count - a[1].count).map(([p, info]) => (
            <div key={p} style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, cursor: 'pointer' }} onClick={() => setExpandedProduct(expandedProduct === p ? null : p)}>
                <span>{p}</span>
                <span style={{ fontWeight: 700 }}>{info.count}</span>
              </div>
              {expandedProduct === p && Object.entries(info.modules).sort((a, b) => b[1] - a[1]).map(([m, n]) => (
                <div key={m} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-5)', paddingLeft: 12, marginTop: 3 }}>
                  <span>→ {m}</span><span>{n}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ ...S.accessBlock, flex: '1 1 260px' }}>
          <div style={S.settingsLabel}>Por DEV (carga ativa)</div>
          {Object.entries(byDev).sort((a, b) => b[1].count - a[1].count).map(([devId, info]) => (
            <div key={devId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 6 }}>
              <span>{(teamById[devId] && teamById[devId].name) || devId}</span>
              <span style={{ color: 'var(--text-5)' }}>{info.count} tickets · {fmtHours(info.devSeconds)} em dev</span>
            </div>
          ))}
          {Object.keys(byDev).length === 0 && <div style={S.emptyMuted}>Nenhum ticket atribuído.</div>}
        </div>
      </div>

      <FilterBar filters={filters} setFilters={setFilters} team={team} />
      <TicketList list={list} teamById={teamById} onOpen={onOpen} />
    </>
  );
}

function ArchivedView({ tickets, teamById, filters, setFilters, onOpen, onUnarchive, canUnarchive }) {
  const archived = tickets.filter((t) => t.archived);
  const list = archived.filter((t) => matchesFilters(t, filters));
  return (
    <>
      <FilterBar filters={filters} setFilters={setFilters} />
      {list.length === 0 && <div style={{ ...S.emptyMuted, marginTop: 20 }}>Nenhum BUG arquivado.</div>}
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((t) => (
          <div key={t.id} style={{ ...S.accessBlock, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-5)', width: 56 }}>#{t.number}</div>
            <div style={{ flex: 1, minWidth: 160, fontWeight: 700, cursor: 'pointer' }} onClick={() => onOpen(t.id)}>{t.title}</div>
            <Badge meta={XFLOW_STATUS_META[t.status]} small />
            {canUnarchive && <button style={S.iconBtnGhost} onClick={() => onUnarchive(t.id)}>Desarquivar</button>}
          </div>
        ))}
      </div>
    </>
  );
}

function LixeiraView({ tickets, teamById, filters, setFilters, onOpen, onRestore, onPurge, canRestore, canPurge }) {
  const list = tickets.filter((t) => matchesFilters(t, filters));
  return (
    <>
      <div style={{ ...S.fieldHint, marginTop: 10 }}>
        BUGs excluídos nunca somem de verdade — ficam aqui com todo o histórico até
        alguém da gestão restaurar, ou o admin apagar de vez.
      </div>
      <FilterBar filters={filters} setFilters={setFilters} />
      {list.length === 0 && <div style={{ ...S.emptyMuted, marginTop: 20 }}>Lixeira vazia.</div>}
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((t) => (
          <div key={t.id} style={{ ...S.accessBlock, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-5)', width: 56 }}>#{t.number}</div>
            <div style={{ flex: 1, minWidth: 160, fontWeight: 700, cursor: 'pointer' }} onClick={() => onOpen(t.id)}>{t.title}</div>
            <Badge meta={XFLOW_STATUS_META[t.status]} small />
            <div style={{ fontSize: 11, color: 'var(--text-6)' }}>
              Excluído {fmtTs(t.deletedAt)}{t.deletedBy && teamById[t.deletedBy] ? ` · ${teamById[t.deletedBy].name}` : ''}
            </div>
            {canRestore && <button style={S.iconBtnGhost} onClick={() => onRestore(t.id)}>Restaurar</button>}
            {canPurge && <button style={{ ...S.iconBtnGhost, color: '#e2574c' }} onClick={() => onPurge(t.id, t.title)}>Apagar de vez</button>}
          </div>
        ))}
      </div>
    </>
  );
}

export default function XFlowScreen({ currentUser, onExit, onLogout, theme, onToggleTheme }) {
  const [tickets, setTickets] = useState([]);
  const [team, setTeam] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [openTicketId, setOpenTicketId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashTickets, setTrashTickets] = useState([]);
  const [trashLoaded, setTrashLoaded] = useState(false);
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    Promise.all([apiGet('/api/xflow/tickets'), apiGet('/api/xflow/team')])
      .then(([t, tm]) => { setTickets(t.tickets); setTeam(tm.team); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!showTrash) return;
    apiGet('/api/xflow/tickets?trash=1')
      .then((t) => { setTrashTickets(t.tickets); setTrashLoaded(true); })
      .catch(() => setTrashLoaded(true));
  }, [showTrash]);

  const teamById = useMemo(() => {
    const m = {};
    team.forEach((t) => { m[t.id] = t; });
    return m;
  }, [team]);

  async function createTicket(form) {
    const res = await apiPost('/api/xflow/tickets', form);
    setTickets((prev) => [res.ticket, ...prev]);
    setShowNew(false);
    setOpenTicketId(res.ticket.id);
    setToastMsg(`BUG #${res.ticket.number} criado`);
    setTimeout(() => setToastMsg(''), 4500);
  }

  async function createSpinoff(originalTicket) {
    const res = await apiPost('/api/xflow/tickets', {
      title: `[Melhoria] ${originalTicket.title}`,
      product: originalTicket.product, module: originalTicket.module,
      description: originalTicket.description, type: 'melhoria',
      originatedFromTicketId: String(originalTicket.number),
      environment: originalTicket.environment || 'producao',
    });
    setTickets((prev) => [res.ticket, ...prev]);
  }

  async function performAction(ticketId, action, payload) {
    const res = await apiPatch(`/api/xflow/tickets/${ticketId}`, { action, payload });
    if (action === 'excluir') {
      setTickets((prev) => prev.filter((t) => t.id !== res.ticket.id));
      setTrashTickets((prev) => (trashLoaded ? [res.ticket, ...prev] : prev));
      setToastMsg(`BUG #${res.ticket.number} movido para a Lixeira`);
      setTimeout(() => setToastMsg(''), 4500);
      return;
    }
    if (action === 'restaurar') {
      setTrashTickets((prev) => prev.filter((t) => t.id !== res.ticket.id));
      setTickets((prev) => [res.ticket, ...prev]);
      setToastMsg(`BUG #${res.ticket.number} restaurado`);
      setTimeout(() => setToastMsg(''), 4500);
      return;
    }
    setTickets((prev) => prev.map((t) => (t.id === res.ticket.id ? res.ticket : t)));
  }

  async function purgeTicket(ticketId, title) {
    const typed = window.prompt(`Para apagar "${title}" de vez (sem volta), digite "${XFLOW_PURGE_CONFIRM_PHRASE}" abaixo:`);
    if (typed !== XFLOW_PURGE_CONFIRM_PHRASE) return;
    await apiDelete(`/api/xflow/tickets/${ticketId}`);
    setTrashTickets((prev) => prev.filter((t) => t.id !== ticketId));
    if (openTicketId === ticketId) setOpenTicketId(null);
    setToastMsg('BUG apagado de vez');
    setTimeout(() => setToastMsg(''), 4500);
  }

  const openTicket = tickets.find((t) => t.id === openTicketId) || trashTickets.find((t) => t.id === openTicketId);
  const effRole = effectiveXflowRole(currentUser);
  const canArchiveTier = effRole === 'gestao' || effRole === 'admin';
  const canRestoreTier = effRole === 'gestao' || effRole === 'admin';
  const canPurgeTier = effRole === 'admin';

  const dependemDeVoceCount = tickets.filter((t) => {
    if (isTerminal(t.status) && t.archived) return false;
    if (effRole === 'reporter') return t.reporterId === currentUser.id && (t.status === 'aguardando_terceiro' || t.status === 'aguardando_validacao_solicitante');
    if (effRole === 'dev') return t.assigneeId === currentUser.id && (t.flaggedReturned || t.status === 'atribuida');
    if (effRole === 'gestao' || effRole === 'admin') return t.status === 'aguardando_gerencia';
    return false;
  }).length;

  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.brandRow}>
          <BrandLogo theme={theme} style={S.logoImg} />
          <div>
            <div style={{ fontWeight: 800 }}>XFlow</div>
            <div style={{ fontSize: 11, color: 'var(--text-5)' }}>{currentUser.name} · {XFLOW_ROLE_META[effRole] ? XFLOW_ROLE_META[effRole].label : currentUser.xflowRole}</div>
          </div>
          {onExit && <button style={S.iconBtnGhost} onClick={onExit}>Sair do XFlow</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canArchiveTier && (
            <button style={{ ...S.pbGhostBtn, ...(showArchived ? S.pbGhostBtnActive : {}) }} onClick={() => { setShowArchived((v) => !v); setShowTrash(false); }}>
              <Archive size={13} /> Arquivados
            </button>
          )}
          {canRestoreTier && (
            <button style={{ ...S.pbGhostBtn, ...(showTrash ? S.pbGhostBtnActive : {}) }} onClick={() => { setShowTrash((v) => !v); setShowArchived(false); }}>
              <Trash2 size={13} /> Lixeira
            </button>
          )}
          <button style={S.primaryBtn} onClick={() => setShowNew(true)}><Plus size={15} /> Novo BUG</button>
          <ThemeToggleBtn theme={theme} onToggle={onToggleTheme} />
          {onLogout && <button style={S.iconBtnGhost} title="Sair" onClick={onLogout}><LogOut size={15} /></button>}
        </div>
      </div>

      <div style={{ padding: '0 24px', paddingBottom: 40 }}>
        {dependemDeVoceCount > 0 && !showArchived && !showTrash && (
          <div style={{ ...S.loginBlockedMsg, marginTop: 16, background: 'rgba(255,159,64,.14)', color: '#ff9f40', borderColor: 'rgba(255,159,64,.5)' }}>
            ⚠ {dependemDeVoceCount} BUG{dependemDeVoceCount === 1 ? '' : 's'} dependendo de você
          </div>
        )}

        {!loaded && <div style={{ ...S.emptyMuted, marginTop: 20 }}>Carregando...</div>}

        {loaded && showTrash && (
          !trashLoaded ? <div style={{ ...S.emptyMuted, marginTop: 20 }}>Carregando...</div> : (
            <LixeiraView
              tickets={trashTickets} teamById={teamById} filters={filters} setFilters={setFilters}
              onOpen={setOpenTicketId} onRestore={(id) => performAction(id, 'restaurar', {})}
              onPurge={purgeTicket} canRestore={canRestoreTier} canPurge={canPurgeTier}
            />
          )
        )}

        {loaded && showArchived && !showTrash && (
          <ArchivedView
            tickets={tickets} teamById={teamById} filters={filters} setFilters={setFilters}
            onOpen={setOpenTicketId} onUnarchive={(id) => performAction(id, 'desarquivar', {})}
            canUnarchive={canArchiveTier}
          />
        )}

        {loaded && !showArchived && !showTrash && effRole === 'reporter' && (
          <ReporterHome tickets={tickets} currentUser={currentUser} teamById={teamById} filters={filters} setFilters={setFilters} onOpen={setOpenTicketId} />
        )}
        {loaded && !showArchived && !showTrash && effRole === 'dev' && (
          <DevHome tickets={tickets} currentUser={currentUser} teamById={teamById} filters={filters} setFilters={setFilters} onOpen={setOpenTicketId} />
        )}
        {loaded && !showArchived && !showTrash && (effRole === 'gestao' || effRole === 'admin') && (
          <GestorHome tickets={tickets} team={team} teamById={teamById} filters={filters} setFilters={setFilters} onOpen={setOpenTicketId} />
        )}
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreate={createTicket} />}
      {openTicket && (
        <TicketDetailModal
          ticket={openTicket}
          team={team}
          currentUser={currentUser}
          onClose={() => setOpenTicketId(null)}
          onAction={performAction}
          onCreateSpinoff={createSpinoff}
        />
      )}
      {toastMsg && (
        <div style={S.toastStack}>
          <div style={S.toast}>{toastMsg}</div>
        </div>
      )}
    </div>
  );
}
