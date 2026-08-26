import React, { useState, useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  X, Plus, MessageSquare, Clock, Paperclip, ChevronDown, LogOut,
  Upload, Archive, Ban, Trash2, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, Quote, Building2, Columns3, LayoutGrid, LayoutList,
  Undo2, Redo2, Heading2, Heading3, Indent as IndentIcon, Outdent, Code, Minus as MinusIcon, Link2, Smile, Download, Home,
} from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TiptapImage from '@tiptap/extension-image';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api.js';
import { S, uid, fmtDate, fmtTs, useIsMobile, BrandLogo, ThemeToggleBtn, useDirtyForm, useAutosaveTimestamp, ConfirmDiscardModal, savedStatusLabel, COLUMN_COLOR_META, NotificationBell } from '../App.jsx';

const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

// Descrição do BUG é rich text (editor Tiptap, ver RichTextEditor). HTML
// nunca vai pra tela sem passar por aqui — mesmo conteúdo já sanitizado no
// backend ao salvar (defesa em profundidade, server/xflow.js
// sanitizeDescriptionHtml — não confia só no cliente). Allow-list espelha
// (ampliada) a do backend — mudou lá, considerar mudar aqui.
const RICH_TEXT_ALLOWED_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 's', 'font', 'p', 'div', 'br',
  'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'span', 'img', 'a', 'hr', 'pre', 'code',
];
const RICH_TEXT_LINK_SCHEME = /^(https?:|mailto:)/i;
// ALLOWED_URI_REGEXP só pega valores que "parecem" uma URI com esquema —
// um src sem "://" (ex.: "x") escapa dessa checagem. Hook fecha a brecha:
// qualquer <img> cujo src não comece literalmente com "data:image/" é
// removido, sem exceção (mesma regra do sanitizeDescriptionHtml no
// backend); <a> passa pela mesma lógica pro esquema do href (nunca
// javascript:), e ganha rel/target seguros sempre que abre em nova aba.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') || '';
    if (!src.startsWith('data:image/')) node.remove();
  }
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') || '';
    if (!RICH_TEXT_LINK_SCHEME.test(href)) node.removeAttribute('href');
    else { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer nofollow'); }
  }
});
function sanitizeRichText(html) {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS,
    ALLOWED_ATTR: ['style', 'face', 'src', 'alt', 'href', 'target', 'rel'],
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
const RICH_TEXT_SIZES = [
  { value: '', label: 'Tamanho' },
  { value: '11px', label: 'Pequeno' },
  { value: '12.5px', label: 'Normal' },
  { value: '15px', label: 'Grande' },
  { value: '19px', label: 'Enorme' },
];
const RICH_TEXT_EMOJIS = [
  '😀', '😂', '😉', '😍', '🤔', '😅', '😬', '😢', '😡', '👍', '👎', '🙏', '👏', '🎉', '🔥', '💡',
  '⚠️', '✅', '❌', '❓', '❗', '🐛', '🚀', '📌', '📎', '🕒', '💬', '👀',
];

// Estilos do editor: pareado com o `contentEditable` do Tiptap via
// `editorProps.attributes.class` — a classe `.xflow-rte-body` continua indo
// direto no elemento editável de verdade, então a maior parte do CSS de
// antes (contenteditable caseiro) segue valendo sem mudança.
const RICH_TEXT_CSS = `
  .xflow-rte-toolbar { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; padding: 4px; background: var(--bg-3); border: 1px solid var(--border-3); border-bottom: none; border-radius: 6px 6px 0 0; }
  .xflow-rte-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: transparent; border: none; border-radius: 4px; color: var(--text-3); cursor: pointer; }
  .xflow-rte-btn:hover { background: var(--bg-4); color: var(--text-1); }
  .xflow-rte-btn:disabled { opacity: .35; cursor: default; }
  .xflow-rte-btn.active { background: rgba(245,196,0,.16); color: #F5C400; }
  .xflow-rte-sep { width: 1px; height: 18px; background: var(--border-2); margin: 0 3px; }
  .xflow-rte-font { font-size: 11.5px; background: var(--bg-4); border: 1px solid var(--border-3); color: var(--text-2); border-radius: 4px; padding: 3px 4px; width: auto; }
  .xflow-rte-body { min-height: 110px; max-height: 380px; overflow-y: auto; background: var(--bg-4); border: 1px solid var(--border-3); border-radius: 0 0 6px 6px; padding: 10px 12px; font-size: 12.5px; color: var(--text-1); line-height: 1.6; }
  .xflow-rte-body:focus { outline: none; border-color: #F5C400; }
  .xflow-rte-body .is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--text-6); float: left; height: 0; pointer-events: none; }
  .xflow-rte-body h2 { font-size: 17px; font-weight: 800; margin: 10px 0 4px; }
  .xflow-rte-body h3 { font-size: 14.5px; font-weight: 800; margin: 8px 0 4px; }
  .xflow-rte-body blockquote { margin: 6px 0; padding: 2px 10px; border-left: 3px solid var(--border-3); color: var(--text-4); }
  .xflow-rte-body ul, .xflow-rte-body ol { margin: 6px 0; padding-left: 22px; }
  .xflow-rte-body img { max-width: 100%; border-radius: 4px; margin: 4px 0; display: block; }
  .xflow-rte-body hr { border: none; border-top: 1px solid var(--border-3); margin: 10px 0; }
  .xflow-rte-body a { color: #3ea6ff; text-decoration: underline; }
  .xflow-rte-body pre { background: var(--bg-3); border: 1px solid var(--border-3); border-radius: 6px; padding: 8px 10px; overflow-x: auto; font-size: 11.5px; }
  .xflow-rte-body code { font-family: "Courier New", monospace; background: var(--bg-3); border-radius: 3px; padding: 1px 4px; font-size: 11.5px; }
  .xflow-rte-body pre code { background: none; padding: 0; }
  .xflow-rte-body[contenteditable=false] { cursor: default; }
  .xflow-rte-emoji-panel { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; padding: 6px; background: var(--bg-1); border: 1px solid var(--border-1); border-radius: 8px; box-shadow: var(--pb-shadow-drag, 0 8px 24px rgba(0,0,0,.3)); }
  .xflow-rte-emoji-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; font-size: 16px; background: transparent; border: none; border-radius: 5px; cursor: pointer; }
  .xflow-rte-emoji-btn:hover { background: var(--bg-4); }
  .xflow-ticket-ref { color: #F5C400; font-weight: 700; cursor: pointer; text-decoration: underline; text-decoration-style: dotted; }
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

const XFLOW_TYPE_META = {
  bug: { label: 'BUG', ...tone('#e2574c') },
  melhoria: { label: 'Melhoria', ...tone('#9b7af5') },
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

const XFLOW_PRODUCTS = ['X da Questão', 'XClass', 'XPED', 'Gestão Projetos - Empresas', 'XFlow', 'Gestão de Atividades', 'Outro'];
const XFLOW_ENVIRONMENT_LABEL = { producao: 'Produção', homologacao: 'Homologação', desenvolvimento: 'Desenvolvimento' };
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
  reorder: () => true,
};
function canDoClient(action, user, ticket, payload) {
  const role = effectiveXflowRole(user);
  if (!role) return false;
  const rule = XFLOW_RULES[action];
  if (!rule) return true;
  return !!rule(role, user, ticket, payload);
}

// ---- Quadro (Kanban) — mapeamento de arrastar-e-soltar pras ações
// nomeadas de status. server/xflowTransitions.js é a fonte da verdade (o
// backend sempre valida de novo); isso aqui só decide o que a UI oferece
// ou recusa visualmente durante o drag — mudou lá, considerar mudar aqui,
// mesmo espírito de XFLOW_RULES acima.
// Cor de cada coluna — mesma paleta pastel do quadro pessoal
// (COLUMN_COLOR_META/App.jsx), fixa por status (não editável pelo
// usuário, diferente do quadro pessoal). Escolhida só pra nenhuma coluna
// vizinha repetir cor (o quadro rola horizontalmente, colunas não-vizinhas
// nunca ficam lado a lado) — não é uma codificação de severidade.
const XFLOW_BOARD_COLUMNS = [
  { id: 'aberta', label: 'Aberta', statuses: ['aberta'], color: 'gray' },
  { id: 'atribuida', label: 'Atribuída', statuses: ['atribuida'], color: 'blue' },
  { id: 'em_desenvolvimento', label: 'Em Desenvolvimento', statuses: ['em_desenvolvimento'], color: 'purple' },
  { id: 'em_revisao', label: 'Em Revisão', statuses: ['em_revisao'], color: 'pink' },
  { id: 'pronta_para_teste', label: 'Pronta p/ Teste', statuses: ['pronta_para_teste'], color: 'yellow' },
  { id: 'em_homologacao', label: 'Em Homologação', statuses: ['em_homologacao'], color: 'orange' },
  { id: 'pronta_para_publicacao', label: 'Pronta p/ Publicação', statuses: ['pronta_para_publicacao'], color: 'green' },
  { id: 'publicada', label: 'Publicada', statuses: ['publicada'], color: 'brown' },
  { id: 'aguardando_validacao_solicitante', label: 'Aguard. Validação do Solicitante', statuses: ['aguardando_validacao_solicitante'], color: 'blue' },
  { id: 'concluida', label: 'Concluída', statuses: ['concluida'], terminal: true, color: 'green' },
  { id: 'pausada', label: 'Pausada', statuses: ['pausada'], color: 'yellow' },
  { id: 'bloqueada', label: 'Bloqueada', statuses: ['bloqueada'], color: 'red' },
  { id: 'aguardando_terceiro', label: 'Aguardando Terceiro', statuses: ['aguardando_terceiro'], color: 'orange' },
  { id: 'aguardando_gerencia', label: 'Aguardando Gerência', statuses: ['aguardando_gerencia'], color: 'purple' },
  { id: 'encerrada', label: 'Encerrada', statuses: ['duplicada', 'nao_reproduzida', 'nao_e_bug', 'descartada'], terminal: true, closedGroup: true, color: 'gray' },
];
const XFLOW_STATUS_TO_COLUMN = {};
XFLOW_BOARD_COLUMNS.forEach((col) => col.statuses.forEach((s) => { XFLOW_STATUS_TO_COLUMN[s] = col.id; }));

// Espelha NON_TERMINAL_ACTIVE de server/xflowTransitions.js.
const XFLOW_NON_TERMINAL_ACTIVE = [
  'aberta', 'atribuida', 'em_desenvolvimento', 'em_revisao', 'pronta_para_teste',
  'em_homologacao', 'pronta_para_publicacao', 'publicada', 'aguardando_validacao_solicitante',
  'aguardando_terceiro', 'aguardando_gerencia',
];

// tier 1 = PATCH direto, sem campo extra. tier 2 = pede 1 campo antes de
// confirmar (blockedReason/nota), via DragFieldPromptModal.
const XFLOW_BOARD_DRAG_RULES = [
  { from: ['aberta'], toColumn: 'atribuida', action: 'aceitar', permission: 'triage', tier: 1 },
  { from: ['aberta'], toColumn: 'em_desenvolvimento', action: 'iniciar_dev_direto', permission: 'triage', tier: 1 },
  { from: ['atribuida'], toColumn: 'em_desenvolvimento', action: 'iniciar_desenvolvimento', permission: 'advance_dev_pipeline', tier: 1 },
  { from: ['em_desenvolvimento'], toColumn: 'em_revisao', action: 'enviar_revisao', permission: 'advance_dev_pipeline', tier: 1 },
  { from: ['em_revisao'], toColumn: 'pronta_para_teste', action: 'marcar_pronta_teste', permission: 'advance_dev_pipeline', tier: 1 },
  { from: ['pronta_para_teste'], toColumn: 'em_homologacao', action: 'enviar_homologacao', permission: 'advance_dev_pipeline', tier: 1 },
  { from: ['em_homologacao'], toColumn: 'pronta_para_publicacao', action: 'homolog_aprovar', permission: 'homologar', tier: 1 },
  { from: ['pronta_para_publicacao'], toColumn: 'publicada', action: 'publicar', permission: null, tier: 1 },
  { from: ['publicada'], toColumn: 'aguardando_validacao_solicitante', action: 'enviar_validacao', permission: 'enviar_validacao', tier: 1 },
  { from: ['aguardando_validacao_solicitante'], toColumn: 'concluida', action: 'aprovar_validacao', permission: 'aprovar_validacao', tier: 1 },
  { from: ['aguardando_validacao_solicitante'], toColumn: 'em_desenvolvimento', action: 'reprovar_validacao', permission: 'reprovar_validacao', tier: 1 },
  { from: ['aberta', 'atribuida', 'em_desenvolvimento'], toColumn: 'aguardando_gerencia', action: 'escalar_gerencia', permission: 'triage', tier: 1 },
  { from: ['aberta', 'atribuida', 'em_desenvolvimento', 'em_revisao', 'pronta_para_teste'], toColumn: 'aguardando_terceiro', action: 'pedir_infos', permission: 'triage', tier: 1 },
  { from: XFLOW_NON_TERMINAL_ACTIVE, toColumn: 'pausada', action: 'pausar', permission: 'pause', tier: 1 },
  {
    from: XFLOW_NON_TERMINAL_ACTIVE, toColumn: 'bloqueada', action: 'bloquear', permission: 'block', tier: 2,
    promptField: { name: 'blockedReason', label: 'Motivo do bloqueio', type: 'select', options: XFLOW_BLOCK_REASON_ORDER.map((k) => ({ value: k, label: XFLOW_BLOCK_REASON_META[k] })) },
  },
  {
    from: ['em_homologacao'], toColumn: 'em_desenvolvimento', action: 'homolog_reprovar', permission: 'homologar', tier: 2,
    promptField: { name: 'note', label: 'Motivo da reprovação na homologação', type: 'textarea' },
  },
];

// Sair de uma coluna lateral sempre chama a ação de retomada — o status
// real de destino é decidido pelo servidor (statusBeforeBlock), não pela
// coluna onde o card foi solto.
const XFLOW_BOARD_RESUME_RULES = {
  pausada: { action: 'retomar', permission: 'resume', tier: 1, actionLabel: 'Retomar' },
  bloqueada: { action: 'desbloquear', permission: 'unblock', tier: 1, actionLabel: 'Desbloquear' },
  aguardando_terceiro: { action: 'retomar', permission: 'resume', tier: 1, actionLabel: 'Retomar' },
  aguardando_gerencia: {
    action: 'resolver_gerencia', permission: 'resolver_gerencia', tier: 2, actionLabel: 'Resolver com a gerência',
    promptField: { name: 'note', label: 'Decisão da gerência', type: 'textarea' },
  },
};

// Retorna null (soltou na própria coluna, nada a fazer), { blocked, reason }
// ou a regra a executar. currentUser/ticket só entram pra checar
// canDoClient — a validação de verdade é sempre repetida no backend.
function resolveDrag(fromStatus, targetColumnId, currentUser, ticket) {
  const fromColumnId = XFLOW_STATUS_TO_COLUMN[fromStatus];
  if (fromColumnId === targetColumnId) return null;
  const resumeRule = XFLOW_BOARD_RESUME_RULES[fromStatus];
  if (resumeRule) {
    if (!canDoClient(resumeRule.permission, currentUser, ticket)) return { blocked: true, reason: 'Você não tem permissão para essa ação.' };
    return resumeRule;
  }
  const rule = XFLOW_BOARD_DRAG_RULES.find((r) => r.toColumn === targetColumnId && r.from.includes(fromStatus));
  if (!rule) return { blocked: true, reason: 'Não é possível mover essa TASK direto para essa coluna — abra o card pra ver as ações disponíveis.' };
  if (!canDoClient(rule.permission, currentUser, ticket)) return { blocked: true, reason: 'Você não tem permissão para essa ação.' };
  return rule;
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

// Chave normalizada de "quem está com a bola" — usada pra filtro e contagem
// (2026-08). Diferente de whoHasTheBall(): não fragmenta por waitingOnType
// (senão "Solicitante"/"Aguardando resposta do financeiro"/etc. viravam
// grupos separados) — cada tipo de dono vira um balde único e estável.
function ballHolderKey(t) {
  if (t.ballHolderType === 'dev' && t.ballHolderUserId) return `dev:${t.ballHolderUserId}`;
  if (t.ballHolderType === 'reporter') return 'reporter';
  if (t.ballHolderType === 'gestao') return 'gestao';
  if (t.ballHolderType === 'terceiro') return 'terceiro';
  if (t.ballHolderType === 'triage_queue') return 'triage_queue';
  return 'none';
}
const BALL_HOLDER_BUCKET_LABEL = { gestao: 'Gestão', reporter: 'Solicitante', terceiro: 'Terceiro', triage_queue: 'Fila de triagem', none: 'Ninguém' };
function ballHolderLabelForKey(key, teamById) {
  if (key.startsWith('dev:')) return (teamById[key.slice(4)] && teamById[key.slice(4)].name) || key.slice(4);
  return BALL_HOLDER_BUCKET_LABEL[key] || key;
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

// Reconhece @menção (nomes do time) e #N (referência a outra TASK, 2026-08)
// num único passe — #N só vira link se o número existir de fato em
// `ticketsByNumber`; senão fica como texto puro (ex.: "#3 parafusos" num
// comentário qualquer não deve virar link morto).
function renderCommentText(text, team, ticketsByNumber, onOpenTicketRef) {
  const names = (team || []).map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length);
  const namePart = names.length ? `@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})` : null;
  const pattern = new RegExp(`(${[namePart, '#\\d+'].filter(Boolean).join('|')})`, 'g');
  const out = [];
  let lastIndex = 0;
  let m;
  let key = 0;
  while ((m = pattern.exec(text))) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index));
    const token = m[0];
    if (token.startsWith('@')) {
      out.push(<span key={key++} style={S.mentionTag}>{token}</span>);
    } else {
      const number = token.slice(1);
      const t = ticketsByNumber && ticketsByNumber[number];
      if (t && onOpenTicketRef) {
        out.push(
          <a key={key++} href="#" onClick={(e) => { e.preventDefault(); onOpenTicketRef(number); }} style={{ color: '#F5C400', fontWeight: 700, textDecoration: 'none' }}>
            {token}
          </a>
        );
      } else {
        out.push(token);
      }
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

function Badge({ meta, small }) {
  if (!meta) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: small ? 10.5 : 11.5, fontWeight: 700, padding: small ? '2px 7px' : '3px 9px', borderRadius: 999, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  );
}

// Tamanho de fonte — Tiptap não empacota isso oficialmente, é o padrão
// documentado pela própria lib: uma Extension que só adiciona um atributo
// global (`fontSize`) ao mark `textStyle` que o extension-text-style já
// registra, igual o extension-font-family faz pra `fontFamily`.
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element) => element.style.fontSize || null,
          renderHTML: (attributes) => (attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize) => ({ chain }) => chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).run(),
    };
  },
});

// Recuo — só via botões da toolbar (não amarra Tab/Shift+Tab pra não
// brigar com o sink/lift nativo de listas que o StarterKit já usa nessas
// teclas). Guarda o nível em `margin-left` no próprio parágrafo/título.
const RTE_INDENT_STEP = 24;
const RTE_INDENT_MAX = 8;
const Indent = Extension.create({
  name: 'indent',
  addOptions() { return { types: ['paragraph', 'heading'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        indent: {
          default: 0,
          parseHTML: (element) => {
            const ml = parseInt(element.style.marginLeft || '0', 10);
            return Number.isFinite(ml) && ml > 0 ? Math.round(ml / RTE_INDENT_STEP) : 0;
          },
          renderHTML: (attributes) => (attributes.indent ? { style: `margin-left: ${attributes.indent * RTE_INDENT_STEP}px` } : {}),
        },
      },
    }];
  },
  addCommands() {
    function shiftIndent(delta) {
      return () => ({ tr, state, dispatch }) => {
        const { types } = this.options;
        let changed = false;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
          if (types.includes(node.type.name)) {
            const next = Math.max(0, Math.min(RTE_INDENT_MAX, (node.attrs.indent || 0) + delta));
            if (next !== (node.attrs.indent || 0)) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
              changed = true;
            }
          }
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };
    }
    return { indent: shiftIndent(1).bind(this), outdent: shiftIndent(-1).bind(this) };
  },
});

// Linkifica "#30" dentro da Descrição, transformando em referência
// clicável pra outra TASK (2026-08) — via Decoration do ProseMirror, não
// altera o HTML salvo (o "#30" digitado continua sendo texto puro no
// documento; só o RENDER ganha o link). `getState()` é lido a cada
// decorations()/handleClick porque `extensions` só é montado uma vez
// (useEditor com deps `[]`) — sem isso o clique sempre veria o primeiro
// conjunto de tickets/callback da primeira renderização (mesmo motivo dos
// onChangeRef/onCommitRef logo abaixo).
const TicketRefExtension = Extension.create({
  name: 'ticketRef',
  addOptions() { return { getState: () => ({ byNumber: null, onOpen: null }) }; },
  addProseMirrorPlugins() {
    const { getState } = this.options;
    return [
      new Plugin({
        key: new PluginKey('ticketRef'),
        props: {
          decorations(state) {
            const { byNumber } = getState();
            if (!byNumber || byNumber.size === 0) return null;
            const decos = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              const re = /#(\d+)/g;
              let m;
              while ((m = re.exec(node.text))) {
                if (byNumber.has(m[1])) {
                  decos.push(Decoration.inline(pos + m.index, pos + m.index + m[0].length, { class: 'xflow-ticket-ref', 'data-ticket-number': m[1] }));
                }
              }
            });
            return decos.length ? DecorationSet.create(state.doc, decos) : null;
          },
          handleClick(_view, _pos, event) {
            const target = event.target;
            if (target && target.classList && target.classList.contains('xflow-ticket-ref')) {
              const number = target.getAttribute('data-ticket-number');
              const { byNumber, onOpen } = getState();
              const t = byNumber && byNumber.get(number);
              if (t && onOpen) { onOpen(number); return true; }
            }
            return false;
          },
        },
      }),
    ];
  },
});

// Extensão da Descrição do problema (BUG/melhoria/TASK) — editor real via
// Tiptap (ver PROJECT_CONTEXT.md §18). `value`/`onChange`/`onCommit`/
// `onPasteImage`/`disabled`/`placeholder` mantêm exatamente o mesmo
// contrato do editor caseiro anterior, então quem usa o componente
// (NewTicketModal, TicketDetailModal) não precisou mudar nada. `onChange`
// é local/vivo (sem custo de rede); `onCommit` é o que efetivamente salva
// (onBlur), mesmo espírito do ContentField acima. Callbacks ficam em refs
// (padrão recomendado pelo próprio Tiptap) porque as opções do
// `useEditor` só são lidas na criação do editor — sem isso, um `onChange`/
// `onPasteImage` novo a cada render (comum quando o pai passa uma arrow
// function inline) ficaria "congelado" na primeira versão.
function RichTextEditor({ value, onChange, onCommit, onPasteImage, disabled, placeholder, ticketsByNumber, onOpenTicketRef }) {
  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  const onPasteImageRef = useRef(onPasteImage);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);
  useEffect(() => { onPasteImageRef.current = onPasteImage; }, [onPasteImage]);
  const [showEmoji, setShowEmoji] = useState(false);

  // Ver TicketRefExtension acima — byNumber precisa ser Map (não o objeto
  // plano `ticketsByNumber`) pra decorations() checar presença em O(1).
  const ticketRefStateRef = useRef({ byNumber: null, onOpen: null });
  const editorRef = useRef(null);
  useEffect(() => {
    const byNumber = new Map(Object.entries(ticketsByNumber || {}));
    ticketRefStateRef.current = { byNumber, onOpen: onOpenTicketRef };
    if (editorRef.current) editorRef.current.view.dispatch(editorRef.current.state.tr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketsByNumber, onOpenTicketRef]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Indent,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: true, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } }),
      TiptapImage,
      Placeholder.configure({ placeholder: placeholder || '' }),
      TicketRefExtension.configure({ getState: () => ticketRefStateRef.current }),
    ],
    content: sanitizeRichText(value || ''),
    editable: !disabled,
    editorProps: {
      attributes: { class: 'xflow-rte-body' },
      handlePaste: (view, event) => {
        const items = Array.from((event.clipboardData && event.clipboardData.items) || []);
        const imageItem = items.find((it) => it.type && it.type.startsWith('image/'));
        if (!imageItem) return false;
        const file = imageItem.getAsFile();
        if (!file) return false;
        if (file.size > MAX_EVIDENCE_BYTES) {
          window.alert(`A imagem colada tem ${(file.size / (1024 * 1024)).toFixed(1)} MB — o limite é ${MAX_EVIDENCE_BYTES / (1024 * 1024)} MB.`);
          return true;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const { schema } = view.state;
          const node = schema.nodes.image.create({ src: reader.result });
          view.dispatch(view.state.tr.replaceSelectionWith(node));
          if (onPasteImageRef.current) onPasteImageRef.current({ id: uid('ev'), name: `print-${Date.now()}.png`, size: file.size, type: file.type, dataUrl: reader.result });
        };
        reader.readAsDataURL(file);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => { if (onChangeRef.current) onChangeRef.current(sanitizeRichText(ed.getHTML())); },
    onBlur: ({ editor: ed }) => { if (onCommitRef.current) onCommitRef.current(sanitizeRichText(ed.getHTML())); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  editorRef.current = editor;

  useEffect(() => { if (editor) editor.setEditable(!disabled); }, [editor, disabled]);

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const html = sanitizeRichText(value || '');
    if (sanitizeRichText(editor.getHTML()) !== html) editor.commands.setContent(html, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  function btnCls(active) { return `xflow-rte-btn${active ? ' active' : ''}`; }
  function insertLink() {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL do link:', prev);
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (url.trim()) chain.setLink({ href: url.trim() }).run();
    else chain.unsetLink().run();
  }
  function insertEmoji(emoji) {
    editor.chain().focus().insertContent(emoji).run();
    setShowEmoji(false);
  }

  return (
    <div>
      <style>{RICH_TEXT_CSS}</style>
      {!disabled && (
        <div className="xflow-rte-toolbar">
          <button type="button" className="xflow-rte-btn" title="Desfazer (Ctrl+Z)" disabled={!editor.can().undo()} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={13} /></button>
          <button type="button" className="xflow-rte-btn" title="Refazer (Ctrl+Shift+Z)" disabled={!editor.can().redo()} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={13} /></button>
          <div className="xflow-rte-sep" />
          <button type="button" className={btnCls(editor.isActive('heading', { level: 2 }))} title="Título" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={13} /></button>
          <button type="button" className={btnCls(editor.isActive('heading', { level: 3 }))} title="Subtítulo" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={13} /></button>
          <div className="xflow-rte-sep" />
          <button type="button" className={btnCls(editor.isActive('bold'))} title="Negrito (Ctrl+B)" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={13} /></button>
          <button type="button" className={btnCls(editor.isActive('italic'))} title="Itálico (Ctrl+I)" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={13} /></button>
          <button type="button" className={btnCls(editor.isActive('underline'))} title="Sublinhado (Ctrl+U)" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={13} /></button>
          <button type="button" className={btnCls(editor.isActive('strike'))} title="Tachado" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={13} /></button>
          <div className="xflow-rte-sep" />
          <select className="xflow-rte-font" title="Fonte" value={editor.getAttributes('textStyle').fontFamily || ''} onChange={(e) => { const v = e.target.value; if (v) editor.chain().focus().setFontFamily(v).run(); else editor.chain().focus().unsetFontFamily().run(); }}>
            {RICH_TEXT_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select className="xflow-rte-font" title="Tamanho" value={editor.getAttributes('textStyle').fontSize || ''} onChange={(e) => { const v = e.target.value; if (v) editor.chain().focus().setFontSize(v).run(); else editor.chain().focus().unsetFontSize().run(); }}>
            {RICH_TEXT_SIZES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <div className="xflow-rte-sep" />
          <button type="button" className={btnCls(editor.isActive({ textAlign: 'left' }))} title="Alinhar à esquerda" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={13} /></button>
          <button type="button" className={btnCls(editor.isActive({ textAlign: 'center' }))} title="Centralizar" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={13} /></button>
          <button type="button" className={btnCls(editor.isActive({ textAlign: 'right' }))} title="Alinhar à direita" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight size={13} /></button>
          <button type="button" className={btnCls(editor.isActive({ textAlign: 'justify' }))} title="Justificar" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify size={13} /></button>
          <div className="xflow-rte-sep" />
          <button type="button" className={btnCls(editor.isActive('bulletList'))} title="Lista com marcadores" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={13} /></button>
          <button type="button" className={btnCls(editor.isActive('orderedList'))} title="Lista numerada" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={13} /></button>
          <button type="button" className="xflow-rte-btn" title="Diminuir recuo" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().outdent().run()}><Outdent size={13} /></button>
          <button type="button" className="xflow-rte-btn" title="Aumentar recuo" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().indent().run()}><IndentIcon size={13} /></button>
          <div className="xflow-rte-sep" />
          <button type="button" className={btnCls(editor.isActive('blockquote'))} title="Citação" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={13} /></button>
          <button type="button" className={btnCls(editor.isActive('codeBlock'))} title="Bloco de código" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code size={13} /></button>
          <button type="button" className="xflow-rte-btn" title="Linha horizontal" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setHorizontalRule().run()}><MinusIcon size={13} /></button>
          <div className="xflow-rte-sep" />
          <button type="button" className={btnCls(editor.isActive('link'))} title="Link" onMouseDown={(e) => e.preventDefault()} onClick={insertLink}><Link2 size={13} /></button>
          <div style={{ position: 'relative' }}>
            <button type="button" className="xflow-rte-btn" title="Emoji" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowEmoji((v) => !v)}><Smile size={13} /></button>
            {showEmoji && (
              <div className="xflow-rte-emoji-panel" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10, marginTop: 4 }}>
                {RICH_TEXT_EMOJIS.map((em) => (
                  <button key={em} type="button" className="xflow-rte-emoji-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => insertEmoji(em)}>{em}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

const XFLOW_TASK_TYPES = [
  { value: 'bug', label: 'BUG', desc: 'Algo quebrado ou funcionando errado.' },
  { value: 'melhoria', label: 'Melhoria', desc: 'Sugestão de algo novo ou melhor do que já existe.' },
];

// Autocomplete de Empresa/Cliente afetado — "banco" de clientes é o
// próprio histórico de tickets da org (server/xflow.js GET
// /affected-companies), atualizado localmente na hora (sem esperar reload)
// quando um nome novo é usado. Busca por substring em qualquer parte do
// nome, não só prefixo — cobre "Raf"/"Sou"/"Rafael S" tudo do mesmo jeito.
function normalizeForSearch(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function AffectedCompanyField({ value, options, disabled, onCommit, placeholder }) {
  const [draft, setDraft] = useState(value || '');
  const [open, setOpen] = useState(false);
  useEffect(() => { setDraft(value || ''); }, [value]);

  const q = normalizeForSearch(draft);
  const list = options || [];

  const matches = q
    ? list
      .filter((o) => normalizeForSearch(o).includes(q) && normalizeForSearch(o) !== q)
      .sort((a, b) => {
        const an = normalizeForSearch(a), bn = normalizeForSearch(b);
        const aStarts = an.startsWith(q) ? 0 : 1;
        const bStarts = bn.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.length - b.length;
      })
      .slice(0, 8)
    : [];

  const exactMatch = list.some((o) => normalizeForSearch(o) === q);
  const similar = !exactMatch && q.length >= 3
    ? list.find((o) => {
      const on = normalizeForSearch(o);
      if (on === q) return false;
      const dist = levenshtein(q, on);
      return dist > 0 && dist <= Math.max(1, Math.floor(Math.min(q.length, on.length) * 0.3));
    })
    : null;

  function commit(v) {
    const val = v !== undefined ? v : draft;
    setDraft(val);
    setOpen(false);
    if (val !== (value || '')) onCommit(val);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text" value={draft} disabled={disabled} placeholder={placeholder}
        onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      />
      {open && matches.length > 0 && (
        <div style={{ ...S.dropdownMenu, position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
          {matches.map((m) => (
            <button key={m} type="button" style={S.dropdownItem} onMouseDown={(e) => { e.preventDefault(); commit(m); }}>{m}</button>
          ))}
        </div>
      )}
      {similar && (
        <div style={{ ...S.fieldHint, marginTop: 4, color: '#ff9f40' }}>
          Já existe um registro parecido: <b>{similar}</b>.{' '}
          <button type="button" style={{ ...S.iconBtnGhost, padding: '2px 6px', fontSize: 11, textDecoration: 'underline' }} onMouseDown={(e) => { e.preventDefault(); commit(similar); }}>
            Usar esse
          </button>
        </div>
      )}
    </div>
  );
}

function blankTicketForm() {
  return {
    type: 'bug', title: '', product: '', clientType: '', module: '', affectedUser: '', affectedCompany: '',
    environment: 'producao', description: '', expectedResult: '', reproSteps: '',
    impact: '', frequency: '', occurredAt: new Date().toISOString().slice(0, 10), priority: '', evidence: [], expectedCompletionAt: '',
  };
}

function NewTicketModal({ onClose, onCreate, affectedCompanies }) {
  const [form, setForm] = useState(blankTicketForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isMobile = useIsMobile();
  const isDirty = useDirtyForm(form);
  const [showGuard, setShowGuard] = useState(false);
  function requestClose() { if (isDirty) setShowGuard(true); else onClose(); }

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

  const requiredOk = form.title.trim() && form.product && form.clientType && !richTextIsBlank(form.description) && form.environment && form.occurredAt;

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
    <div style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={requestClose}>
      <div style={{ ...S.detailBox, width: 'min(1100px, 94vw)', maxHeight: '90vh', overflowY: 'auto', padding: isMobile ? undefined : '24px 30px 30px 30px', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...S.detailTopBar, alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>Nova TASK</div>
            <div style={{ fontSize: 12, color: 'var(--text-5)', marginTop: 3 }}>
              Só o essencial pra abrir agora — dá pra completar o resto depois.
            </div>
          </div>
          <button style={S.iconBtnGhost} onClick={requestClose}><X size={18} /></button>
        </div>

        <div style={S.subSectionLabel}>Tipo</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {XFLOW_TASK_TYPES.map((t) => (
            <button
              key={t.value} type="button" onClick={() => set({ type: t.value })}
              style={{
                flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                border: `1.5px solid ${form.type === t.value ? '#F5C400' : 'var(--border-3)'}`,
                background: form.type === t.value ? 'rgba(245,196,0,.12)' : 'var(--bg-4)',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13, color: form.type === t.value ? '#F5C400' : 'var(--text-1)' }}>{t.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-5)', marginTop: 2 }}>{t.desc}</div>
            </button>
          ))}
        </div>

        <div style={{ ...S.subSectionLabel, marginTop: 14 }}>Título {form.type === 'melhoria' ? 'da melhoria' : 'do BUG'} <span style={{ color: '#e2574c' }}>*</span></div>
        <input
          type="text" value={form.title} onChange={(e) => set({ title: e.target.value })}
          placeholder={form.type === 'melhoria' ? 'Ex.: "Adicionar filtro por responsável na lista"' : 'Ex.: "Erro ao calcular aderência após upload do SPED"'}
          style={{ fontSize: 17, fontWeight: 600, padding: '13px 14px', borderRadius: 9 }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <div style={S.subSectionLabel}>Produto / Plataforma <span style={{ color: '#e2574c' }}>*</span></div>
            <select value={form.product} onChange={(e) => set({ product: e.target.value })}>
              <option value="">Selecione</option>
              {XFLOW_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <div style={S.subSectionLabel}>Tipo de cliente <span style={{ color: '#e2574c' }}>*</span></div>
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

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <div style={S.subSectionLabel}>Data da ocorrência <span style={{ color: '#e2574c' }}>*</span></div>
            <input type="date" value={form.occurredAt} onChange={(e) => set({ occurredAt: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <div style={S.subSectionLabel}>Previsão de conclusão</div>
            <input type="date" value={form.expectedCompletionAt} onChange={(e) => set({ expectedCompletionAt: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <div style={S.subSectionLabel}>Prioridade sugerida</div>
            <select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">Selecione</option>
              {XFLOW_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_PRIORITY_META[k].label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={S.subSectionLabel}>Descrição {form.type === 'melhoria' ? 'da melhoria' : 'do problema'} <span style={{ color: '#e2574c' }}>*</span></div>
          <RichTextEditor
            value={form.description}
            onChange={(html) => set({ description: html })}
            onPasteImage={(ev) => setForm((f) => ({ ...f, evidence: [...f.evidence, ev] }))}
            placeholder="O que aconteceu"
          />
        </div>

        <div style={{ ...S.fieldHint, marginTop: 10 }}>
          O resto pode ser preenchido depois de aberto: módulo, usuário/empresa afetados,
          resultado esperado, passo a passo, impacto e frequência.
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
                <AffectedCompanyField
                  value={form.affectedCompany}
                  options={affectedCompanies}
                  onCommit={(v) => set({ affectedCompany: v })}
                  placeholder="Comece a digitar..."
                />
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
          {saving ? 'Enviando...' : form.type === 'melhoria' ? 'Registrar melhoria' : 'Abrir BUG'}
        </button>
      </div>
      {showGuard && (
        <ConfirmDiscardModal
          onSaveAndExit={requiredOk ? submit : undefined}
          onDiscard={onClose}
          onCancel={() => setShowGuard(false)}
          saving={saving}
        />
      )}
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

function TicketDetailModal({ ticket, team, currentUser, onClose, onAction, onCreateSpinoff, affectedCompanies, allTickets, onOpenTicket, onViewed }) {
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
  const [showGuard, setShowGuard] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [previewEvidence, setPreviewEvidence] = useState(null);

  const lastSavedAt = useAutosaveTimestamp(ticket);
  const hasCommentDraft = !!commentDraft.trim() || pendingMentions.length > 0;
  const hasActionDraft = [
    blockReasonDraft, closeReasonDraft, closeJustDraft, closeDupIdDraft, dupIdDraft, reproduceNoteDraft,
    redirectProduct, redirectModule, redirectAssignee, waitNote, gerenciaNote, homologRejectNote,
    publishVersion, publishBuild, publishRelease,
  ].some((v) => v && v.trim());
  const hasDraft = hasCommentDraft || hasActionDraft;
  function requestClose() { if (hasDraft) setShowGuard(true); else onClose(); }
  function saveDraftsAndClose() {
    if (hasCommentDraft) submitComment();
    onClose();
  }

  useEffect(() => {
    let cancelled = false;
    apiGet(`/api/xflow/tickets/${ticket.id}/events`).then((res) => { if (!cancelled) setEvents(res.events); }).catch(() => {});
    return () => { cancelled = true; };
  }, [ticket.id, ticket.updatedAt]);

  // Registro de leitura (2026-08, pedido do Rafael) — dispara só ao abrir
  // (não em `ticket.updatedAt`, que muda a cada ação; o dedup de 5min é
  // no servidor mas não faz sentido bater essa rota a cada edição). Também
  // marca como lida qualquer notificação pendente apontando pra essa TASK.
  useEffect(() => {
    apiPost(`/api/xflow/tickets/${ticket.id}/view`, {}).catch(() => {});
    if (onViewed) onViewed(ticket.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  const teamById = useMemo(() => {
    const m = {};
    (team || []).forEach((t) => { m[t.id] = t; });
    return m;
  }, [team]);

  // Vínculo entre TASKs (2026-08, pedido do Rafael) — mapa por número pra
  // resolver referências "#30" citadas na descrição/comentários, e pra
  // montar a lista "TASKs vinculadas" a partir de linkedTicketIds.
  const ticketsByNumber = useMemo(() => {
    const m = {};
    (allTickets || []).forEach((t) => { m[String(t.number)] = t; });
    return m;
  }, [allTickets]);
  const ticketsById = useMemo(() => {
    const m = {};
    (allTickets || []).forEach((t) => { m[t.id] = t; });
    return m;
  }, [allTickets]);
  const linkedTickets = (ticket.linkedTicketIds || []).map((lid) => ticketsById[lid]).filter(Boolean);
  const [linkQuery, setLinkQuery] = useState('');
  const linkMatches = linkQuery.trim()
    ? (allTickets || [])
        .filter((t) => t.id !== ticket.id
          && !(ticket.linkedTicketIds || []).includes(t.id)
          && (String(t.number).includes(linkQuery.trim()) || t.title.toLowerCase().includes(linkQuery.trim().toLowerCase())))
        .slice(0, 8)
    : [];
  function openTicketRefByNumber(number) {
    const t = ticketsByNumber[String(number)];
    if (t && onOpenTicket) onOpenTicket(t.id);
  }

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
    <div style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }} onClick={requestClose}>
      <div style={{ ...S.detailBox, width: 'min(1000px, 100%)', maxHeight: '92vh', overflowY: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-5)', fontWeight: 700 }}>BUG #{ticket.number}</div>
            <ContentField as="input" value={ticket.title} disabled={!canEditContent} onCommit={(v) => runAction('editar_campo', { field: 'title', value: v })} />
            <div style={{ fontSize: 11.5, color: 'var(--text-5)', marginTop: 4 }}>
              Aberto em {fmtDateFromTs(ticket.createdAt)}
            </div>
            <div style={{ fontSize: 11, color: hasDraft ? '#ff9f40' : 'var(--text-6)', marginTop: 2 }}>{savedStatusLabel(hasDraft, lastSavedAt)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {linkCopied && <span style={{ fontSize: 11, color: 'var(--text-5)' }}>Link copiado!</span>}
            <button
              style={S.iconBtnGhost} title="Copiar link permanente desta TASK"
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${ticket.number}`;
                navigator.clipboard.writeText(url).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); });
              }}
            ><Link2 size={16} /></button>
            <button style={S.iconBtnGhost} onClick={requestClose}><X size={18} /></button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <Badge meta={XFLOW_TYPE_META[ticket.type] || XFLOW_TYPE_META.bug} />
          <Badge meta={XFLOW_STATUS_META[ticket.status]} />
          <Badge meta={XFLOW_SEVERITY_META[ticket.severity]} />
          <Badge meta={XFLOW_PRIORITY_META[ticket.priority]} />
          {ticket.slaResolutionState && <Badge meta={XFLOW_SLA_STATE_META[ticket.slaResolutionState]} />}
          {ticket.archived && <Badge meta={{ label: 'Arquivado', ...tone('#999999') }} />}
          {ticket.deleted && <Badge meta={{ label: 'Na Lixeira', ...tone('#e2574c') }} />}
        </div>
        {ticket.expectedCompletionAt && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-5)', marginTop: -8, marginBottom: 14 }}>
            Previsão de conclusão: <strong style={{ color: 'var(--text-2)' }}>{fmtDate(ticket.expectedCompletionAt)}</strong>
            <Badge meta={expectedCompletionBadge(ticket.expectedCompletionAt)} />
          </div>
        )}

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
              ticketsByNumber={ticketsByNumber}
              onOpenTicketRef={openTicketRefByNumber}
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
            {(ticket.evidence || []).map((ev) => {
              const isImage = ev.type && ev.type.startsWith('image/');
              return (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
                  {isImage ? (
                    <img
                      src={ev.dataUrl} alt={ev.name}
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                      onClick={() => setPreviewEvidence(ev)}
                    />
                  ) : <Paperclip size={12} />}
                  {isImage ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); setPreviewEvidence(ev); }}>{ev.name}</a>
                  ) : (
                    <a href={ev.dataUrl} download={ev.name}>{ev.name}</a>
                  )}
                  {isImage && (
                    <a href={ev.dataUrl} download={ev.name} title="Baixar" style={S.iconBtnGhost}><Download size={12} /></a>
                  )}
                  {canDoClient('attach_evidence', currentUser, ticket) && (
                    <button style={S.iconBtnGhost} title="Remover anexo" onClick={() => runAction('remover_anexo', { evidenceId: ev.id })}><X size={12} /></button>
                  )}
                </div>
              );
            })}

            <div style={{ ...S.subSectionLabel, marginTop: 12 }}><Link2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />TASKs vinculadas</div>
            {linkedTickets.length === 0 && <div style={S.fieldHint}>Nenhuma TASK vinculada ainda.</div>}
            {linkedTickets.map((lt) => (
              <div key={lt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <a href="#" onClick={(e) => { e.preventDefault(); if (onOpenTicket) onOpenTicket(lt.id); }} style={{ fontSize: 12.5, fontWeight: 700, color: '#F5C400', textDecoration: 'none', flex: '0 1 auto' }}>
                  #{lt.number} — {lt.title}
                </a>
                <Badge meta={XFLOW_STATUS_META[lt.status]} small />
                <button style={S.iconBtnGhost} title="Remover vínculo" onClick={() => runAction('desvincular_ticket', { linkedTicketId: lt.id })}><X size={12} /></button>
              </div>
            ))}
            <input
              type="text" placeholder="Vincular TASK — busque por número, título ou palavra-chave"
              value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} style={{ marginTop: 8 }}
            />
            {linkMatches.length > 0 && (
              <div style={{ border: '1px solid var(--border-2)', borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
                {linkMatches.map((m) => (
                  <button
                    key={m.id} type="button"
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'var(--bg-3)', border: 'none', borderBottom: '1px solid var(--border-1)', cursor: 'pointer', fontSize: 12.5, color: 'var(--text-2)' }}
                    onClick={() => { runAction('vincular_ticket', { linkedTicketId: m.id }); setLinkQuery(''); }}
                  >
                    #{m.number} — {m.title}
                  </button>
                ))}
              </div>
            )}

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
                <div>{renderCommentText(c.text, team, ticketsByNumber, openTicketRefByNumber)}</div>
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
            <ContentField as="input" type="date" value={ticket.dueDate} disabled={!canEditOps} onCommit={(v) => runAction('editar_prazo_proxima_acao', { dueDate: v })} />
            <div style={S.fieldHint}>Prazo esperado de quem abriu a TASK, com base na urgência do cliente e do time interno — não é a entrega combinada pelo dev.</div>

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Previsão de conclusão</div>
            <ContentField as="input" type="date" value={ticket.expectedCompletionAt} disabled={!canEditContent} onCommit={(v) => runAction('editar_campo', { field: 'expectedCompletionAt', value: v })} />
            <div style={S.fieldHint}>Data que o dev define como a entrega correta — visível para solicitante, dev e gestão.</div>

            <div style={{ ...S.subSectionLabel, marginTop: 14 }}>Dados capturados</div>
            <div style={{ ...S.fieldHint, marginBottom: 4 }}>
              Campos que faltaram na abertura podem ser preenchidos aqui — toda alteração fica registrada na timeline.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Produto / Plataforma</div>
                <select value={ticket.product || ''} disabled={!canEditContent} onChange={(e) => runAction('editar_campo', { field: 'product', value: e.target.value })}>
                  <option value="">Selecione</option>
                  {XFLOW_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Ambiente</div>
                <div style={{ fontSize: 13, fontWeight: 600, padding: '9px 0' }}>{XFLOW_ENVIRONMENT_LABEL[ticket.environment] || ticket.environment || '—'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Módulo / Tela</div>
                <ContentField as="input" value={ticket.module} disabled={!canEditContent} placeholder="Ex.: Upload, Aderência" onCommit={(v) => runAction('editar_campo', { field: 'module', value: v })} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Tipo de cliente</div>
                <select value={ticket.clientType || ''} disabled={!canEditContent} onChange={(e) => runAction('editar_campo', { field: 'clientType', value: e.target.value })}>
                  <option value="">Selecione</option>
                  {XFLOW_CLIENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Usuário afetado</div>
                <ContentField as="input" value={ticket.affectedUser} disabled={!canEditContent} placeholder="Quem encontrou o problema" onCommit={(v) => runAction('editar_campo', { field: 'affectedUser', value: v })} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Empresa/Cliente afetado</div>
                <AffectedCompanyField
                  value={ticket.affectedCompany}
                  options={affectedCompanies}
                  disabled={!canEditContent}
                  onCommit={(v) => runAction('editar_campo', { field: 'affectedCompany', value: v })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Impacto</div>
                <select value={ticket.impact || ''} disabled={!canEditContent} onChange={(e) => runAction('editar_campo', { field: 'impact', value: e.target.value })}>
                  <option value="">Selecione</option>
                  {XFLOW_IMPACT_ORDER.map((k) => <option key={k} value={k}>{XFLOW_IMPACT_META[k]}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Frequência</div>
                <select value={ticket.frequency || ''} disabled={!canEditContent} onChange={(e) => runAction('editar_campo', { field: 'frequency', value: e.target.value })}>
                  <option value="">Selecione</option>
                  {XFLOW_FREQUENCY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_FREQUENCY_META[k]}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Data da ocorrência</div>
                <ContentField as="input" type="date" value={ticket.occurredAt} disabled={!canEditContent} onCommit={(v) => runAction('editar_campo', { field: 'occurredAt', value: v })} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Prioridade sugerida</div>
                <select
                  value={ticket.suggestedPriority || ''}
                  disabled={!canEditContent || !!ticket.suggestedPriority}
                  onChange={(e) => runAction('definir_prioridade_sugerida', { value: e.target.value })}
                >
                  <option value="">Selecione</option>
                  {XFLOW_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_PRIORITY_META[k].label}</option>)}
                </select>
                {ticket.suggestedPriority && <div style={S.fieldHint}>Definida — não pode ser alterada depois.</div>}
              </div>
            </div>

            {ticket.capturedUrl && <div style={{ ...S.fieldHint, marginTop: 10, wordBreak: 'break-all' }}>URL: {ticket.capturedUrl}</div>}
          </div>
        </div>
      </div>
      {showGuard && (
        <ConfirmDiscardModal
          onSaveAndExit={hasCommentDraft ? saveDraftsAndClose : undefined}
          onDiscard={onClose}
          onCancel={() => setShowGuard(false)}
        />
      )}
      {previewEvidence && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={(e) => { e.stopPropagation(); setPreviewEvidence(null); }}
        >
          <div style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <img src={previewEvidence.dataUrl} alt={previewEvidence.name} style={{ maxWidth: '90vw', maxHeight: '78vh', display: 'block', borderRadius: 8, objectFit: 'contain' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#eee', fontSize: 13 }}>{previewEvidence.name}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={previewEvidence.dataUrl} download={previewEvidence.name} style={S.primaryBtn}><Download size={14} /> Baixar</a>
                <button style={S.iconBtnGhost} onClick={() => setPreviewEvidence(null)}><X size={18} color="#fff" /></button>
              </div>
            </div>
          </div>
        </div>
      )}
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
// Contador "faltam X dias" / "entrega hoje" da Previsão de conclusão
// (2026-08, pedido do Rafael — "deixe claro em exibição"). Data guardada
// como "YYYY-MM-DD" puro (sem hora) — monta a data em horário local em
// vez de `new Date(iso)` direto, que interpretaria como UTC meia-noite e
// podia virar o dia errado dependendo do fuso do navegador.
function expectedCompletionBadge(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays < 0) return { label: `Atrasada ${Math.abs(diffDays)}d`, ...tone('#e2574c') };
  if (diffDays === 0) return { label: 'Entrega hoje', ...tone('#ff9f40') };
  if (diffDays === 1) return { label: 'Falta 1 dia', ...tone('#ff9f40') };
  return { label: `Faltam ${diffDays} dias`, ...tone('#3ea6ff') };
}
function fmtDateFromTs(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
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

const BLANK_FILTERS = { search: '', status: '', product: '', severity: '', priority: '', assigneeId: '', slaState: '', agingBucket: '', ballHolder: '' };

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
  if (filters.ballHolder) {
    if (filters.ballHolder.startsWith('triageReporter:')) {
      if (ballHolderKey(t) !== 'triage_queue' || t.reporterId !== filters.ballHolder.slice('triageReporter:'.length)) return false;
    } else if (ballHolderKey(t) !== filters.ballHolder) return false;
  }
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

// Ordenação do Quadro — mesmo modelo de "atalhos + ordem manual" do
// quadro pessoal (SORT_OPTIONS/sortCards em App.jsx), adaptado: lá a
// ordem manual é a posição no array JSONB do board; aqui os tickets são
// linhas relacionais, então usam o campo próprio `boardOrder` (número
// fracionário, recalculado no cliente a cada arraste — ver
// XflowBoardView). Só o modo `manual` lê/escreve `boardOrder`; os outros
// são puramente calculados a cada render, sem persistir nada.
const XFLOW_SORT_OPTIONS = [
  { value: 'priority', label: 'Prioridade' },
  { value: 'oldest', label: 'Mais antiga' },
  { value: 'assignee', label: 'Responsável' },
  { value: 'product', label: 'Produto/Plataforma' },
  { value: 'manual', label: 'Ordem manual' },
];
function sortXflowTickets(tickets, mode, teamById) {
  const list = tickets.slice();
  if (mode === 'manual') return list.sort((a, b) => (a.boardOrder || 0) - (b.boardOrder || 0));
  if (mode === 'oldest') return list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  if (mode === 'assignee') return list.sort((a, b) => whoHasTheBall(a, teamById).localeCompare(whoHasTheBall(b, teamById), 'pt-BR'));
  if (mode === 'product') return list.sort((a, b) => (a.product || '').localeCompare(b.product || '', 'pt-BR'));
  return list.sort(smartDevSort);
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
      <Badge meta={XFLOW_TYPE_META[t.type] || XFLOW_TYPE_META.bug} small />
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
      <div style={{ fontSize: 10.5, color: 'var(--text-6)' }} title="Data de abertura">
        Aberto {fmtDateFromTs(t.createdAt)}{days != null ? ` · há ${days}d` : ''}
      </div>
      {t.expectedCompletionAt && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Previsão de conclusão">
          <span style={{ fontSize: 10.5, color: 'var(--text-6)' }}>Previsão: {fmtDate(t.expectedCompletionAt)}</span>
          <Badge meta={expectedCompletionBadge(t.expectedCompletionAt)} small />
        </div>
      )}
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

function FilterBar({ filters, setFilters, team, teamById, tickets }) {
  function set(patch) { setFilters((f) => ({ ...f, ...patch })); }
  // "Responsável atual" só lista quem de fato está com a bola em algum
  // ticket agora (2026-08, pedido do Rafael) — não é "todo mundo com papel
  // de dev", é exatamente o valor visto no campo "Quem está com a bola" de
  // cada ticket. Um dev sem nenhum ticket na mão (ex.: usuário que só abre
  // TASK) simplesmente não aparece na lista.
  const presentBallHolders = new Set((tickets || []).map(ballHolderKey).filter((k) => k !== 'none'));
  // Sem filtro de papel aqui de propósito: `ballHolderKey()` gera `dev:<id>`
  // pra qualquer ticket com assignee_id setado, seja lá qual for o papel de
  // quem foi atribuído (gestão/admin também podem virar responsável de uma
  // TASK via reatribuir) — exigir xflowRole==='dev' escondia gente real da
  // lista (bug reportado pelo Rafael: Rafael Souza, responsável de uma TASK
  // em "Em Desenvolvimento", não aparecia no filtro).
  const devs = teamById
    ? Object.values(teamById).filter((m) => presentBallHolders.has(`dev:${m.id}`)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    : [];
  // Solicitantes com atividade parada na fila de triagem (2026-08, pedido do
  // Rafael) — "Fila de triagem" sozinha não dizia de quem é a task, então
  // some por nome de quem abriu, igual já acontece com dev.
  const triageReporters = teamById
    ? [...new Map((tickets || []).filter((t) => ballHolderKey(t) === 'triage_queue' && t.reporterId && teamById[t.reporterId]).map((t) => [t.reporterId, teamById[t.reporterId]])).values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    : [];
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
          <option value="">Atribuído a: todos</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {teamById && (
        <select value={filters.ballHolder} onChange={(e) => set({ ballHolder: e.target.value })} style={{ width: 'auto' }} title="Quem precisa agir agora, não a atribuição fixa">
          <option value="">Responsável atual: todos</option>
          {devs.map((m) => <option key={m.id} value={`dev:${m.id}`}>{m.name}</option>)}
          {presentBallHolders.has('gestao') && <option value="gestao">Gestão</option>}
          {presentBallHolders.has('reporter') && <option value="reporter">Solicitante</option>}
          {presentBallHolders.has('terceiro') && <option value="terceiro">Terceiro</option>}
          {presentBallHolders.has('triage_queue') && <option value="triage_queue">Fila de triagem: todos</option>}
          {triageReporters.map((r) => <option key={r.id} value={`triageReporter:${r.id}`}>Fila de triagem: {r.name}</option>)}
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
      <FilterBar filters={filters} setFilters={setFilters} teamById={teamById} tickets={tickets} />
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
      <FilterBar filters={filters} setFilters={setFilters} teamById={teamById} tickets={tickets} />
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

  // "Responsável atual" (quem está com a bola agora) — diferente de byDev
  // acima, que é a atribuição fixa. Aqui cobre todo mundo (dev/gestão/
  // solicitante/terceiro/fila), não só dev, e reflete pra onde o ticket
  // está de fato esperando ação neste momento (2026-08, pedido do Rafael).
  const byBallHolder = {};
  active.forEach((t) => {
    const key = ballHolderKey(t);
    if (key === 'none') return;
    byBallHolder[key] = (byBallHolder[key] || 0) + 1;
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

        <div style={{ ...S.accessBlock, flex: '1 1 260px' }}>
          <div style={S.settingsLabel}>Por responsável atual</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-6)', marginTop: -4, marginBottom: 6 }}>Quem precisa agir agora — clique pra filtrar</div>
          {Object.entries(byBallHolder).sort((a, b) => b[1] - a[1]).map(([key, count]) => {
            const isActive = filters.ballHolder === key;
            return (
              <div
                key={key}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 6, cursor: 'pointer' }}
                onClick={() => setFilters((f) => ({ ...f, ballHolder: f.ballHolder === key ? '' : key }))}
              >
                <span style={{ color: isActive ? 'var(--text-1)' : 'var(--text-4)', fontWeight: isActive ? 700 : 400 }}>{ballHolderLabelForKey(key, teamById)}</span>
                <span style={{ fontWeight: 700 }}>{count}</span>
              </div>
            );
          })}
          {Object.keys(byBallHolder).length === 0 && <div style={S.emptyMuted}>Nada em aberto.</div>}
        </div>
      </div>

      <FilterBar filters={filters} setFilters={setFilters} team={team} teamById={teamById} tickets={tickets} />
      <TicketList list={list} teamById={teamById} onOpen={onOpen} />
    </>
  );
}

function ArchivedView({ tickets, teamById, filters, setFilters, onOpen, onUnarchive, canUnarchive }) {
  const archived = tickets.filter((t) => t.archived);
  const list = archived.filter((t) => matchesFilters(t, filters));
  return (
    <>
      <FilterBar filters={filters} setFilters={setFilters} teamById={teamById} tickets={tickets} />
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
      <FilterBar filters={filters} setFilters={setFilters} teamById={teamById} tickets={tickets} />
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

// Modal pequeno pro nível 2 do drag do Quadro — pede o único campo que a
// ação exige (motivo do bloqueio / nota) antes de confirmar. Mesmo padrão
// visual de modal pequeno de ConfirmDiscardModal.
function DragFieldPromptModal({ title, field, saving, onConfirm, onCancel }) {
  const [value, setValue] = useState('');
  const valid = value.trim().length > 0;
  return (
    <div style={S.detailOverlay} onClick={onCancel}>
      <div style={{ ...S.detailBox, width: 'min(420px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div>
          <button style={S.iconBtnGhost} onClick={onCancel}><X size={16} /></button>
        </div>
        <div style={S.subSectionLabel}>{field.label}</div>
        {field.type === 'select' ? (
          <select value={value} onChange={(e) => setValue(e.target.value)} autoFocus>
            <option value="">Selecione...</option>
            {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} autoFocus placeholder="Descreva..." />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button style={S.iconBtnGhost} onClick={onCancel} disabled={saving}>Cancelar</button>
          <button style={S.primaryBtn} onClick={() => valid && onConfirm(value)} disabled={!valid || saving}>{saving ? 'Salvando...' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  );
}

function XflowBoardCard({ ticket, teamById, columnId, columnTerminal, showRealStatus, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id, data: { type: 'card', ticket, columnId }, disabled: columnTerminal,
  });
  const days = daysSince(ticket.createdAt);
  const completionMeta = expectedCompletionBadge(ticket.expectedCompletionAt);
  const style = { transform: DndCSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 };
  return (
    <div
      ref={setNodeRef}
      {...(columnTerminal ? {} : { ...attributes, ...listeners })}
      style={{ ...S.personalCard, ...style, cursor: columnTerminal ? 'pointer' : 'grab', touchAction: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}
      onClick={onOpen}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-5)' }}>#{ticket.number}</span>
        <Badge meta={XFLOW_TYPE_META[ticket.type] || XFLOW_TYPE_META.bug} small />
        {showRealStatus && <Badge meta={XFLOW_STATUS_META[ticket.status]} small />}
      </div>
      <div style={{ fontWeight: 700, fontSize: 12.5, lineHeight: 1.3 }}>
        {ticket.flaggedReturned && <span style={{ color: '#ff9f40', marginRight: 5 }}>↩</span>}
        {ticket.title}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <Badge meta={XFLOW_SEVERITY_META[ticket.severity]} small />
        <Badge meta={XFLOW_PRIORITY_META[ticket.priority]} small />
        {(ticket.slaResolutionState === 'vencido' || ticket.slaResolutionState === 'proximo_vencer') && (
          <Badge meta={XFLOW_SLA_STATE_META[ticket.slaResolutionState]} small />
        )}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-5)' }}>{whoHasTheBall(ticket, teamById)}</div>
      {ticket.expectedCompletionAt && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-5)' }}>Previsão: {fmtDate(ticket.expectedCompletionAt)}</span>
          {completionMeta && <Badge meta={completionMeta} small />}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-6)' }}>Aberto{days != null ? ` há ${days}d` : ''}</div>
    </div>
  );
}

function XflowBoardColumn({ column, tickets, teamById, dimmed, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { column } });
  const colorMeta = COLUMN_COLOR_META[column.color];
  return (
    <div
      ref={setNodeRef}
      style={{ ...S.personalCol, background: isOver ? colorMeta.bg : colorMeta.container, opacity: dimmed ? 0.4 : 1, transition: 'opacity .12s ease, background .12s ease' }}
    >
      <div style={S.personalColHead}>
        <div style={{ ...S.personalColTag, background: colorMeta.bg, color: colorMeta.text, fontWeight: 700 }}>
          {column.label}
        </div>
        <span style={S.kanbanCount}>{tickets.length}</span>
      </div>
      <div style={{ ...S.personalColBody, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.map((t) => (
            <XflowBoardCard
              key={t.id}
              ticket={t}
              teamById={teamById}
              columnId={column.id}
              columnTerminal={!!column.terminal}
              showRealStatus={!!column.closedGroup}
              onOpen={() => onOpen(t.id)}
            />
          ))}
        </SortableContext>
        {tickets.length === 0 && <div style={S.personalColEmpty}>Nenhuma TASK aqui.</div>}
      </div>
    </div>
  );
}

// Visão "Quadro" — mesmas TASKs/filtros já visíveis pra cada papel (o
// backend já restringe reporter aos próprios tickets), só reorganizadas
// em colunas por status real. Arrastar-e-soltar passa por resolveDrag()
// (ver bloco XFLOW_BOARD_* acima) — nunca seta status livre, sempre chama
// uma ação nomeada existente, com o mesmo caminho de PATCH que os botões
// do TicketDetailModal já usam. Sem otimismo local: como a coluna de cada
// card é 100% derivada do status real (`tickets` prop, atualizado pelo
// XFlowScreen a partir da resposta do servidor), uma ação que falhar
// simplesmente não move nada — sem necessidade de reverter estado.
function XflowBoardView({ tickets, currentUser, teamById, filters, setFilters, onOpen, onAction, showToast }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );
  const [activeTicket, setActiveTicket] = useState(null);
  const [validColumnIds, setValidColumnIds] = useState(null);
  const [pendingDrop, setPendingDrop] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sortMode, setSortMode] = useState('priority');

  const visible = tickets.filter((t) => !t.archived && matchesFilters(t, filters));
  const byColumn = {};
  XFLOW_BOARD_COLUMNS.forEach((c) => { byColumn[c.id] = []; });
  visible.forEach((t) => {
    const colId = XFLOW_STATUS_TO_COLUMN[t.status];
    if (byColumn[colId]) byColumn[colId].push(t);
  });
  XFLOW_BOARD_COLUMNS.forEach((c) => { byColumn[c.id] = sortXflowTickets(byColumn[c.id], sortMode, teamById); });

  function handleDragStart(event) {
    const ticket = event.active.data.current && event.active.data.current.ticket;
    if (!ticket) return;
    setActiveTicket(ticket);
    const valid = new Set([XFLOW_STATUS_TO_COLUMN[ticket.status]]);
    XFLOW_BOARD_COLUMNS.forEach((col) => {
      const result = resolveDrag(ticket.status, col.id, currentUser, ticket);
      if (result && !result.blocked) valid.add(col.id);
    });
    setValidColumnIds(valid);
  }

  async function runDrag(ticket, rule, payload) {
    setBusy(true);
    try {
      await onAction(ticket.id, rule.action, payload || {});
      setPendingDrop(null);
    } catch (err) {
      showToast(err.message || 'Não foi possível mover a TASK.');
    } finally {
      setBusy(false);
    }
  }

  // Ponto médio fracionário entre os dois vizinhos no ponto de soltura
  // (padrão Trello/Linear) — evita ter que reescrever a ordem de todo
  // mundo a cada arraste. `overCardId` null significa "soltou na área
  // vazia da coluna", ou seja, vai pro fim.
  function computeReorderBoardOrder(ticket, columnId, overCardId) {
    const colTickets = byColumn[columnId] || [];
    const withoutDragged = colTickets.filter((t) => t.id !== ticket.id);
    const rawIndex = overCardId ? withoutDragged.findIndex((t) => t.id === overCardId) : -1;
    const insertIndex = rawIndex === -1 ? withoutDragged.length : rawIndex;
    const prev = withoutDragged[insertIndex - 1];
    const next = withoutDragged[insertIndex];
    const prevOrder = prev ? (prev.boardOrder || 0) : (next ? (next.boardOrder || 0) - 1000 : 0);
    const nextOrder = next ? (next.boardOrder || 0) : (prev ? (prev.boardOrder || 0) + 1000 : 1000);
    if (Math.abs(nextOrder - prevOrder) < 1e-9) return null;
    return (prevOrder + nextOrder) / 2;
  }

  function handleDragEnd(event) {
    const ticket = activeTicket;
    setActiveTicket(null);
    setValidColumnIds(null);
    if (!ticket || !event.over) return;
    const overData = event.over.data.current;
    const overIsCard = overData && overData.type === 'card';
    const targetColumnId = overIsCard ? overData.columnId : event.over.id;
    const fromColumnId = XFLOW_STATUS_TO_COLUMN[ticket.status];

    if (targetColumnId === fromColumnId) {
      if (sortMode !== 'manual') return;
      const newOrder = computeReorderBoardOrder(ticket, fromColumnId, overIsCard ? event.over.id : null);
      if (newOrder === null) return;
      onAction(ticket.id, 'reordenar', { boardOrder: newOrder }).catch((err) => showToast(err.message || 'Não foi possível reordenar.'));
      return;
    }

    const result = resolveDrag(ticket.status, targetColumnId, currentUser, ticket);
    if (!result) return;
    if (result.blocked) { showToast(result.reason); return; }
    if (result.promptField) { setPendingDrop({ ticket, rule: result }); return; }
    runDrag(ticket, result);
  }

  return (
    <>
      <FilterBar filters={filters} setFilters={setFilters} teamById={teamById} tickets={tickets} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-5)', fontWeight: 600 }}>Ordenar por</span>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} style={{ ...S.personalFilterSelect, width: 'auto' }}>
          {XFLOW_SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        {sortMode === 'manual' && <span style={S.fieldHint}>Arraste os cards dentro da coluna pra reorganizar.</span>}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={S.personalBoardArea}>
          {XFLOW_BOARD_COLUMNS.map((col) => (
            <XflowBoardColumn
              key={col.id}
              column={col}
              tickets={byColumn[col.id]}
              teamById={teamById}
              onOpen={onOpen}
              dimmed={!!validColumnIds && !validColumnIds.has(col.id)}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTicket && (
            <div style={{ ...S.personalCard, boxShadow: 'var(--pb-shadow-drag)', opacity: .92, fontWeight: 700, fontSize: 12.5 }}>
              #{activeTicket.number} {activeTicket.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {pendingDrop && (
        <DragFieldPromptModal
          title={`${pendingDrop.rule.actionLabel || `Mover #${pendingDrop.ticket.number} para ${(XFLOW_BOARD_COLUMNS.find((c) => c.id === pendingDrop.rule.toColumn) || {}).label || ''}`}`}
          field={pendingDrop.rule.promptField}
          saving={busy}
          onCancel={() => setPendingDrop(null)}
          onConfirm={(value) => runDrag(pendingDrop.ticket, pendingDrop.rule, { [pendingDrop.rule.promptField.name]: value })}
        />
      )}
    </>
  );
}

export default function XFlowScreen({
  currentUser, onExit, onGoCompany, onGoPersonal, onLogout, theme, onToggleTheme,
  notifications, showNotifications, onToggleNotifications, onOpenNotification, onMarkNotificationRead, onMarkAllNotificationsRead,
  pendingOpenTicketId, onPendingOpenConsumed, onTicketViewed,
}) {
  // Histórico do navegador — Nível 2 (2026-08): sub-navegação local do
  // XFlow (Quadro/Lista/Arquivados/Lixeira), em cima da entrada de Nível 1
  // que App.jsx já empurra ao entrar no módulo ("navTag":"xflow"). Lido uma
  // vez no mount (cobre o caso de montar via Voltar/Avançar, quando o
  // history.state já chega com o sub certo) — ver PROJECT_CONTEXT.md §9.
  const initXflowSub = (() => {
    try {
      const s = window.history.state;
      if (s && s.navTag === 'xflow' && s.xflowSub) return s.xflowSub;
    } catch (e) { /* ignora */ }
    return 'quadro';
  })();
  const [tickets, setTickets] = useState([]);
  const [team, setTeam] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [openTicketId, setOpenTicketId] = useState(null);
  const [showArchived, setShowArchived] = useState(initXflowSub === 'archived');
  const [showTrash, setShowTrash] = useState(initXflowSub === 'trash');
  const [trashTickets, setTrashTickets] = useState([]);
  const [trashLoaded, setTrashLoaded] = useState(false);
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [toastMsg, setToastMsg] = useState('');
  const [affectedCompanies, setAffectedCompanies] = useState([]);
  const [viewMode, setViewMode] = useState(initXflowSub === 'lista' ? 'lista' : 'quadro');

  function pushXflowSub(sub) {
    try { window.history.pushState({ navTag: 'xflow', xflowSub: sub }, '', window.location.href); } catch (e) { /* ignora */ }
  }
  function goToXflowView(mode) {
    setShowArchived(false);
    setShowTrash(false);
    setViewMode(mode);
    pushXflowSub(mode);
  }
  function toggleXflowArchived() {
    const opening = !showArchived;
    setShowArchived(opening);
    setShowTrash(false);
    pushXflowSub(opening ? 'archived' : viewMode);
  }
  function toggleXflowTrash() {
    const opening = !showTrash;
    setShowTrash(opening);
    setShowArchived(false);
    pushXflowSub(opening ? 'trash' : viewMode);
  }
  // Nível 3 (2026-08): abrir TicketDetailModal empilha detailTicket em cima
  // do state atual (mesmo padrão de openActivityDetail em App.jsx) — Voltar
  // fecha o modal em vez de sair do XFlow. A URL ganha #<número> (2026-08,
  // pedido do Rafael de link permanente por TASK) — vira parte da mesma
  // entrada de histórico, então Voltar já desfaz o hash de graça junto com
  // o resto.
  function openTicketDetail(id) {
    setOpenTicketId(id);
    try {
      const t = tickets.find((tk) => tk.id === id) || trashTickets.find((tk) => tk.id === id);
      const cur = window.history.state || {};
      const url = t ? `${window.location.pathname}${window.location.search}#${t.number}` : window.location.href;
      window.history.pushState({ ...cur, detailTicket: id }, '', url);
    } catch (e) { /* ignora */ }
  }
  function closeTicketDetail() {
    try {
      if (window.history.state && window.history.state.detailTicket) { window.history.back(); return; }
    } catch (e) { /* ignora */ }
    setOpenTicketId(null);
    try { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search); } catch (e) { /* ignora */ }
  }
  useEffect(() => {
    try {
      const cur = window.history.state;
      if (!cur || cur.navTag !== 'xflow' || !cur.xflowSub) {
        window.history.replaceState({ navTag: 'xflow', xflowSub: initXflowSub }, '', window.location.href);
      }
    } catch (e) { /* ignora */ }
    function onPopState(e) {
      const state = e.state;
      if (!state || state.navTag !== 'xflow') return; // troca de módulo — App.jsx cuida
      setOpenTicketId(state.detailTicket || null);
      const sub = state.xflowSub || 'quadro';
      if (sub === 'trash') { setShowTrash(true); setShowArchived(false); }
      else if (sub === 'archived') { setShowArchived(true); setShowTrash(false); }
      else { setShowTrash(false); setShowArchived(false); setViewMode(sub === 'lista' ? 'lista' : 'quadro'); }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(msg) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 4500); }

  useEffect(() => {
    Promise.all([apiGet('/api/xflow/tickets'), apiGet('/api/xflow/team'), apiGet('/api/xflow/affected-companies')])
      .then(([t, tm, ac]) => { setTickets(t.tickets); setTeam(tm.team); setAffectedCompanies(ac.affectedCompanies); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  // Link permanente por TASK (2026-08): "#30" na URL abre direto o BUG #30
  // assim que a lista carrega — só roda uma vez (hashOpenDone), senão fica
  // reabrindo o mesmo ticket toda vez que `tickets` muda depois.
  const hashOpenDone = useRef(false);
  useEffect(() => {
    if (!loaded || hashOpenDone.current) return;
    hashOpenDone.current = true;
    const m = /^#(\d+)$/.exec(window.location.hash);
    if (!m) return;
    const t = tickets.find((tk) => String(tk.number) === m[1]);
    if (t) openTicketDetail(t.id);
    else showToast(`TASK #${m[1]} não encontrada.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Clique numa notificação (Central de Notificações, 2026-08) de fora do
  // XFlow: App.jsx seta `pendingOpenTicketId` e troca o workspace; aqui só
  // abre assim que os tickets estiverem carregados e limpa o pendente (senão
  // ficaria reabrindo sozinho depois que o usuário já fechou o modal).
  useEffect(() => {
    if (!pendingOpenTicketId || !loaded) return;
    const t = tickets.find((tk) => tk.id === pendingOpenTicketId);
    if (t) openTicketDetail(t.id);
    if (onPendingOpenConsumed) onPendingOpenConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenTicketId, loaded]);

  function registerAffectedCompany(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setAffectedCompanies((prev) => (prev.some((n) => n.toLowerCase() === trimmed.toLowerCase()) ? prev : [trimmed, ...prev]));
  }

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
    registerAffectedCompany(res.ticket.affectedCompany);
    setShowNew(false);
    openTicketDetail(res.ticket.id);
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
    if (action === 'editar_campo' && payload && payload.field === 'affectedCompany') {
      registerAffectedCompany(payload.value);
    }
    setTickets((prev) => prev.map((t) => {
      if (t.id === res.ticket.id) return res.ticket;
      if (res.relatedTicket && t.id === res.relatedTicket.id) return res.relatedTicket;
      return t;
    }));
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
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea, button { font-family: 'Inter', sans-serif; }
        input[type=text], input[type=date], input[type=email], input[type=password], input[type=number], select, textarea {
          background:var(--bg-4); border:1px solid var(--border-3); color:var(--text-1); border-radius:6px;
          padding:6px 8px; font-size:12.5px; width:100%;
        }
        input[type=text]:focus, input[type=date]:focus, input[type=email]:focus, input[type=password]:focus, input[type=number]:focus, select:focus, textarea:focus {
          outline:none; border-color:#F5C400;
        }
        input[type=checkbox]{ accent-color:#F5C400; width:15px; height:15px; }
        ::-webkit-scrollbar{ height:8px; width:8px; }
        ::-webkit-scrollbar-thumb{ background:var(--border-3); border-radius:4px; }
        :root {
          --pcol-gray-bg: rgba(255,255,255,.06); --pcol-gray-text: var(--text-3); --pcol-gray-container: rgba(255,255,255,.03);
          --pcol-brown-bg: rgba(160,120,90,.22); --pcol-brown-text: #c9a488; --pcol-brown-container: rgba(160,120,90,.08);
          --pcol-orange-bg: rgba(217,115,13,.20); --pcol-orange-text: #e8a463; --pcol-orange-container: rgba(217,115,13,.07);
          --pcol-yellow-bg: rgba(203,145,47,.20); --pcol-yellow-text: #e0b968; --pcol-yellow-container: rgba(203,145,47,.07);
          --pcol-green-bg: rgba(68,131,97,.22); --pcol-green-text: #7fc79c; --pcol-green-container: rgba(68,131,97,.08);
          --pcol-blue-bg: rgba(51,126,169,.22); --pcol-blue-text: #7ec2e8; --pcol-blue-container: rgba(51,126,169,.08);
          --pcol-purple-bg: rgba(144,101,176,.22); --pcol-purple-text: #c6a4e0; --pcol-purple-container: rgba(144,101,176,.08);
          --pcol-pink-bg: rgba(193,76,138,.22); --pcol-pink-text: #ea9dc4; --pcol-pink-container: rgba(193,76,138,.08);
          --pcol-red-bg: rgba(212,76,71,.22); --pcol-red-text: #f08f8a; --pcol-red-container: rgba(212,76,71,.08);
          --pcol-default-container: rgba(255,255,255,.02);
        }
        html[data-theme="light"] {
          --pcol-gray-bg: #EDECE9; --pcol-gray-text: #55534E; --pcol-gray-container: #F7F7F6;
          --pcol-brown-bg: #EEE0DA; --pcol-brown-text: #64473A; --pcol-brown-container: #F8F2EF;
          --pcol-orange-bg: #FADEC9; --pcol-orange-text: #D9730D; --pcol-orange-container: #FDF2E8;
          --pcol-yellow-bg: #FDECC8; --pcol-yellow-text: #CB912F; --pcol-yellow-container: #FEF9EB;
          --pcol-green-bg: #DBEDDB; --pcol-green-text: #448361; --pcol-green-container: #EFF8EF;
          --pcol-blue-bg: #D3E5EF; --pcol-blue-text: #337EA9; --pcol-blue-container: #EFF5F9;
          --pcol-purple-bg: #E8DEEE; --pcol-purple-text: #9065B0; --pcol-purple-container: #F6F2F9;
          --pcol-pink-bg: #F5E0E9; --pcol-pink-text: #C14C8A; --pcol-pink-container: #FBF2F6;
          --pcol-red-bg: #FFE2DD; --pcol-red-text: #D44C47; --pcol-red-container: #FFF3F1;
          --pcol-default-container: #F7F7F5;
        }
      `}</style>
      <div style={S.topbar}>
        <div style={S.brandRow}>
          <BrandLogo theme={theme} style={S.logoImg} />
          <div>
            <div style={{ fontWeight: 800 }}>XFlow</div>
            <div style={{ fontSize: 11, color: 'var(--text-5)' }}>{currentUser.name} · {XFLOW_ROLE_META[effRole] ? XFLOW_ROLE_META[effRole].label : currentUser.xflowRole}</div>
          </div>
          {onGoCompany && <button style={S.iconBtnGhost} onClick={onGoCompany}><Building2 size={14} /> Ir para Empresas</button>}
          {onGoPersonal && <button style={S.iconBtnGhost} onClick={onGoPersonal}><Columns3 size={14} /> Ir para Gestão de Atividades</button>}
          {onExit && <button style={S.iconBtnGhost} onClick={onExit}>Sair do XFlow</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!showArchived && !showTrash && (
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-3)', padding: 3, borderRadius: 8 }}>
              <button style={{ ...S.pbGhostBtn, border: 'none', ...(viewMode === 'quadro' ? { background: S.pbGhostBtnActive.background, color: S.pbGhostBtnActive.color } : {}) }} onClick={() => goToXflowView('quadro')}>
                <LayoutGrid size={13} /> Quadro
              </button>
              <button style={{ ...S.pbGhostBtn, border: 'none', ...(viewMode === 'lista' ? { background: S.pbGhostBtnActive.background, color: S.pbGhostBtnActive.color } : {}) }} onClick={() => goToXflowView('lista')}>
                <LayoutList size={13} /> Lista
              </button>
            </div>
          )}
          {canArchiveTier && (
            <button style={{ ...S.pbGhostBtn, ...(showArchived ? S.pbGhostBtnActive : {}) }} onClick={toggleXflowArchived}>
              <Archive size={13} /> Arquivados
            </button>
          )}
          {canRestoreTier && (
            <button style={{ ...S.pbGhostBtn, ...(showTrash ? S.pbGhostBtnActive : {}) }} onClick={toggleXflowTrash}>
              <Trash2 size={13} /> Lixeira
            </button>
          )}
          <button style={S.primaryBtn} onClick={() => setShowNew(true)}><Plus size={15} /> Nova TASK</button>
          <NotificationBell
            notifications={notifications} show={showNotifications} onToggle={onToggleNotifications}
            onOpenItem={onOpenNotification} onMarkRead={onMarkNotificationRead} onMarkAllRead={onMarkAllNotificationsRead}
          />
          {onExit && <button style={S.iconBtnGhost} title="Início" onClick={onExit}><Home size={15} /></button>}
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
              onOpen={openTicketDetail} onRestore={(id) => performAction(id, 'restaurar', {})}
              onPurge={purgeTicket} canRestore={canRestoreTier} canPurge={canPurgeTier}
            />
          )
        )}

        {loaded && showArchived && !showTrash && (
          <ArchivedView
            tickets={tickets} teamById={teamById} filters={filters} setFilters={setFilters}
            onOpen={openTicketDetail} onUnarchive={(id) => performAction(id, 'desarquivar', {})}
            canUnarchive={canArchiveTier}
          />
        )}

        {loaded && !showArchived && !showTrash && viewMode === 'quadro' && (
          <XflowBoardView
            tickets={tickets} currentUser={currentUser} teamById={teamById} filters={filters} setFilters={setFilters}
            onOpen={openTicketDetail} onAction={performAction} showToast={showToast}
          />
        )}
        {loaded && !showArchived && !showTrash && viewMode === 'lista' && effRole === 'reporter' && (
          <ReporterHome tickets={tickets} currentUser={currentUser} teamById={teamById} filters={filters} setFilters={setFilters} onOpen={openTicketDetail} />
        )}
        {loaded && !showArchived && !showTrash && viewMode === 'lista' && effRole === 'dev' && (
          <DevHome tickets={tickets} currentUser={currentUser} teamById={teamById} filters={filters} setFilters={setFilters} onOpen={openTicketDetail} />
        )}
        {loaded && !showArchived && !showTrash && viewMode === 'lista' && (effRole === 'gestao' || effRole === 'admin') && (
          <GestorHome tickets={tickets} team={team} teamById={teamById} filters={filters} setFilters={setFilters} onOpen={openTicketDetail} />
        )}
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreate={createTicket} affectedCompanies={affectedCompanies} />}
      {openTicket && (
        <TicketDetailModal
          ticket={openTicket}
          team={team}
          currentUser={currentUser}
          affectedCompanies={affectedCompanies}
          allTickets={tickets}
          onClose={closeTicketDetail}
          onAction={performAction}
          onCreateSpinoff={createSpinoff}
          onOpenTicket={openTicketDetail}
          onViewed={onTicketViewed}
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
