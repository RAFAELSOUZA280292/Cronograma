import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import DOMPurify from 'dompurify';
import {
  X, Plus, MessageSquare, Clock, Paperclip, ChevronDown, ChevronRight, MoreHorizontal, SlidersHorizontal,
  Archive, Ban, Trash2, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, Quote, LayoutGrid, LayoutList,
  Undo2, Redo2, Heading2, Heading3, Indent as IndentIcon, Outdent, Code, Minus as MinusIcon, Link2, Smile, Download,
} from 'lucide-react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, closestCenter, useDroppable,
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
import { S, uid, fmtDate, fmtTs, useIsMobile, BrandLogo, useDirtyForm, useAutosaveTimestamp, ConfirmDiscardModal, COLUMN_COLOR_META } from '../App.jsx';
import { DialogOverlay } from '../ui/dialog.jsx';
import { ComposeBox, CommentThread, AddMenu } from '../ui/ComposeBox.jsx';
import { askConfirm, askText, notify } from '../ui/dialogs.jsx';
import { RecordSaveStatus, Button } from '../ui/index.jsx';
import { useEscClose } from '../lib/nav.js';
import { calendarDaysSince } from '../lib/dates.js';

const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

// Colar print (Ctrl+V) e arrastar imagem nas TASKs (2026-10-02, pedido do Rafael: o time de DEV precisa
// colar print e adicionar imagens). Antes só a Descrição aceitava print colado; comentário e os campos
// de texto simples (Resultado esperado, Passo a passo, Solução aplicada, O que testar) ignoravam o Ctrl+V.
// Print colado chega do navegador com o nome genérico "image.png" — vira "print-AAAAMMDD-HHMMSS.png".
const GENERIC_IMAGE_NAME = /^image\.(png|jpe?g|gif|webp)$/i;
function nowStamp() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function imageFilesFrom(list) {
  const imgs = Array.from(list || []).filter((f) => f && f.type && f.type.startsWith('image/'));
  return imgs.map((f, i) => {
    if (f.name && !GENERIC_IMAGE_NAME.test(f.name)) return f;
    const ext = ((f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '')) || 'png';
    return new File([f], `print-${nowStamp()}${imgs.length > 1 ? `-${i + 1}` : ''}.${ext}`, { type: f.type });
  });
}
function clipboardImageFiles(e) {
  const cd = e && e.clipboardData;
  if (!cd) return [];
  const fromFiles = imageFilesFrom(cd.files);
  if (fromFiles.length) return fromFiles;
  return imageFilesFrom(Array.from(cd.items || []).filter((it) => it.kind === 'file').map((it) => it.getAsFile()));
}
function readEvidenceFile(file) {
  return new Promise((resolve) => {
    if (file.size > MAX_EVIDENCE_BYTES) {
      notify(`"${file.name}" tem ${(file.size / (1024 * 1024)).toFixed(1)} MB — o limite por arquivo é ${MAX_EVIDENCE_BYTES / (1024 * 1024)} MB.`, { tone: 'error' });
      resolve(null); return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ id: uid('ev'), name: file.name, size: file.size, type: file.type, dataUrl: reader.result });
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
function FlashToast({ message }) {
  if (!message) return null;
  return (
    <div role="status" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 3000, background: 'var(--bg-1)', color: 'var(--text-1)', border: '1px solid #3ecf6e', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, boxShadow: '0 6px 20px rgba(0,0,0,.35)' }}>{message}</div>
  );
}

// O item se chama TASK; "BUG" é só o TIPO (chip BUG/Melhoria, "não sendo BUG"). Os textos que vêm do servidor
// ainda dizem "o BUG": troca na hora de mostrar (aviso, erro, histórico), com a concordância certa.
const TASK_ARTICLES = { o: 'a', O: 'A', do: 'da', Do: 'Da', ao: 'à', Ao: 'À', no: 'na', No: 'Na', pelo: 'pela', Pelo: 'Pela', este: 'esta', Este: 'Esta', um: 'uma', Um: 'Uma' };
function taskWording(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/(não sendo )BUG/g, '$1\u0000')
    .replace(/\b(o|O|do|Do|ao|Ao|no|No|pelo|Pelo|este|Este|um|Um) BUG\b/g, (m, a) => `${TASK_ARTICLES[a]} TASK`)
    .replace(/\bBUG\b/g, 'TASK')
    .replace(/\u0000/g, 'BUG');
}
// Erro para a pessoa: mensagem do servidor (já em português) sem jargão; sem mensagem, um texto claro com a saída.
function friendlyError(e, fallback) {
  const m = e && e.message;
  if (!m || /^(failed to fetch|networkerror|load failed|\w*error:)/i.test(m)) return fallback;
  return taskWording(m);
}

// Seção recolhível (Onda 6, §81): botão com aria-expanded/aria-controls + corpo que fica montado (hidden) para não perder
// o que foi digitado. `persist` lembra aberto/fechado por seção em sessionStorage (com try/catch); `forceOpen` abre sozinha
// (ex.: campo obrigatório faltando); `summary` é o texto curto ao lado do título ("2 preenchidos").
function readSecOpen(key, dflt) {
  try {
    const v = window.sessionStorage.getItem(`xflow:sec:${key}`);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch (e) { /* sem storage: usa o padrão */ }
  return dflt;
}
function writeSecOpen(key, open) {
  try { window.sessionStorage.setItem(`xflow:sec:${key}`, open ? '1' : '0'); } catch (e) { /* ignora */ }
}
function CollapsibleSection({ id, title, summary, defaultOpen, persist, forceOpen, icon: Icon, children, style }) {
  const [open, setOpen] = useState(() => (persist ? readSecOpen(id, !!defaultOpen) : !!defaultOpen));
  const bodyId = useId();
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  function toggle() {
    setOpen((v) => { if (persist) writeSecOpen(id, !v); return !v; });
  }
  return (
    <section className="xf-sec" style={style}>
      <h3 className="xf-sec-h">
        <button type="button" className="xf-sec-btn" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          {open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          {Icon && <Icon size={13} aria-hidden="true" />}
          <span className="xf-sec-title">{title}</span>
          {summary ? <span className="xf-sec-sum">· {summary}</span> : null}
        </button>
      </h3>
      <div id={bodyId} className="xf-sec-body" hidden={!open}>{children}</div>
    </section>
  );
}
// Campo com rótulo ligado ao controle (leitor de tela lê o nome; clicar no rótulo foca o campo).
function Field({ label, required, hint, style, children }) {
  const id = useId();
  return (
    <div style={style}>
      <label htmlFor={id} style={{ ...S.subSectionLabel, marginTop: 0, display: 'block' }}>
        {label}{required && <span style={{ color: '#e2574c' }} aria-hidden="true"> *</span>}{required && <span className="ui-sr"> (obrigatório)</span>}
      </label>
      {children(id)}
      {hint && <div style={S.fieldHint}>{hint}</div>}
    </div>
  );
}

// CSS do módulo: seções recolhíveis, rodapé de ação fixo e, no celular (<768px), alvos de toque >= 44 px,
// campos em 16px (o iOS dá zoom abaixo disso) e nenhuma rolagem horizontal da página (só dentro do quadro).
const XFLOW_CSS = `
  .xf-root button:focus-visible, .xf-modal button:focus-visible, .xf-modal a:focus-visible, .xf-root a:focus-visible, .xf-modal summary:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 2px; }
  .xf-sec { border-top: 1px solid var(--border-1); margin-top: 12px; }
  .xf-sec-h { margin: 0; font-size: inherit; }
  .xf-sec-btn { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 40px; padding: 8px 2px; background: transparent; border: none; color: var(--text-2); font-family: inherit; font-size: 12.5px; font-weight: 700; text-align: left; cursor: pointer; border-radius: 6px; }
  .xf-sec-btn:hover { color: var(--text-1); }
  .xf-sec-title { text-transform: uppercase; letter-spacing: .04em; font-size: 11.5px; }
  .xf-sec-sum { font-weight: 600; color: var(--text-5); font-size: 12px; text-transform: none; letter-spacing: 0; }
  .xf-sec-body { padding: 2px 0 10px; }
  .xf-sec-body[hidden] { display: none; }
  .xf-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 12px; }
  .xf-grid .xf-wide { grid-column: 1 / -1; }
  .xf-foot { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap; padding: 12px 30px; border-top: 1px solid var(--border-2); background: var(--bg-1); }
  .xf-foot-msg { flex: 1 1 220px; min-width: 0; font-size: 12px; line-height: 1.4; color: var(--text-4); }
  .xf-foot-msg.err { color: #f0a49e; }
  .xf-foot-btns { display: flex; gap: 8px; }
  .xf-filter-toggle { display: none; }
  @media (max-width: 767px) {
    html, body { overflow-x: hidden; }
    .xf-root, .xf-modal { max-width: 100vw; }
    .xf-root button, .xf-modal button, .xf-root a.xf-tap, .xf-modal a.xf-tap, .xf-modal summary { min-height: 44px; }
    .xf-root button:not(.xf-sec-btn):not(.xf-fill), .xf-modal button:not(.xf-sec-btn):not(.xf-fill):not(.xflow-rte-emoji-btn) { min-width: 44px; }
    .xf-root input[type=text], .xf-root input[type=date], .xf-root select, .xf-root textarea,
    .xf-modal input[type=text], .xf-modal input[type=date], .xf-modal select, .xf-modal textarea { font-size: 16px; min-height: 44px; }
    .xf-root select, .xf-modal select { min-height: 44px; }
    .xf-modal textarea { min-height: 0; }
    .xf-foot { padding: 10px 16px calc(10px + var(--safe-bottom, 0px)); }
    .xf-foot-msg { flex-basis: 100%; }
    .xf-foot-btns { width: 100%; }
    .xf-foot-btns > button { flex: 1; }
    .xf-card { min-height: 44px; }
    .xf-filter-toggle { display: inline-flex; }
    .xf-filters-collapsed > :not(.xf-filter-always) { display: none !important; }
    .xf-board { padding-left: 0 !important; padding-right: 0 !important; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .xf-topbar { padding: 12px 16px !important; }
    .xf-topbar-actions { width: 100%; justify-content: space-between; flex-wrap: wrap; }
    .xf-pad { padding-left: 16px !important; padding-right: 16px !important; }
    .xf-stat { min-width: calc(50% - 5px) !important; flex: 1 1 calc(50% - 5px) !important; }
    .xf-row { gap: 8px !important; }
  }
`;

// Descrição da TASK é rich text (editor Tiptap, ver RichTextEditor). HTML
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
  .xflow-rte-toolbar { position: relative; display: flex; align-items: center; gap: 2px; flex-wrap: wrap; padding: 4px; background: var(--bg-3); border: 1px solid var(--border-3); border-bottom: none; border-radius: 6px 6px 0 0; }
  .xflow-rte-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; background: transparent; border: none; border-radius: 4px; color: var(--text-3); cursor: pointer; }
  .xflow-rte-btn:hover { background: var(--bg-4); color: var(--text-1); }
  .xflow-rte-btn:disabled { opacity: .35; cursor: default; }
  .xflow-rte-btn.active { background: rgba(245,196,0,.16); color: var(--ui-accent-text); }
  .xflow-rte-btn:focus-visible, .xflow-rte-opt:focus-visible, .xflow-rte-emoji-btn:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 1px; }
  .xflow-rte-btn.more { width: auto; gap: 4px; padding: 0 9px; font-family: inherit; font-size: 12px; font-weight: 700; }
  .xflow-rte-menu { position: absolute; top: 100%; left: 0; z-index: 30; margin-top: 4px; width: min(340px, 100%); max-height: min(60vh, 420px); overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 8px; background: var(--bg-1); border: 1px solid var(--border-1); border-radius: 8px; box-shadow: var(--pb-shadow-drag, 0 8px 24px rgba(0,0,0,.3)); }
  .xflow-rte-menu-group { display: flex; flex-wrap: wrap; gap: 2px; }
  .xflow-rte-menu-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-5); margin-top: 2px; }
  .xflow-rte-opt { padding: 6px 10px; font-family: inherit; font-size: 12px; color: var(--text-2); background: transparent; border: 1px solid var(--border-2); border-radius: 6px; cursor: pointer; }
  .xflow-rte-opt:hover { background: var(--bg-4); }
  .xflow-rte-opt.active { background: rgba(245,196,0,.16); border-color: var(--ui-accent, #F5C400); color: var(--ui-accent-text); }
  .xflow-rte-menu .xflow-rte-emoji-panel { border: none; box-shadow: none; padding: 0; background: transparent; }
  .xflow-rte-sep { width: 1px; height: 18px; background: var(--border-2); margin: 0 3px; }
  .xflow-rte-font { font-size: 11.5px; background: var(--bg-4); border: 1px solid var(--border-3); color: var(--text-2); border-radius: 4px; padding: 3px 4px; width: auto; }
  .xflow-rte-body { min-height: 110px; max-height: 380px; overflow-y: auto; background: var(--bg-4); border: 1px solid var(--border-3); border-radius: 0 0 6px 6px; padding: 10px 12px; font-size: 12.5px; color: var(--text-1); line-height: 1.6; }
  .xflow-rte-body:focus { outline: none; border-color: #F5C400; box-shadow: 0 0 0 3px rgba(245,196,0,.35); }
  .xflow-rte-body .is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--text-6); float: left; height: 0; pointer-events: none; }
  .xflow-rte-body h2 { font-size: 17px; font-weight: 800; margin: 10px 0 4px; }
  .xflow-rte-body h3 { font-size: 14.5px; font-weight: 800; margin: 8px 0 4px; }
  .xflow-rte-body blockquote { margin: 6px 0; padding: 2px 10px; border-left: 3px solid var(--border-3); color: var(--text-4); }
  .xflow-rte-body ul, .xflow-rte-body ol { margin: 6px 0; padding-left: 22px; }
  .xflow-rte-body img { max-width: 100%; border-radius: 4px; margin: 4px 0; display: block; }
  .xflow-rte-body hr { border: none; border-top: 1px solid var(--border-3); margin: 10px 0; }
  .xflow-rte-body a { color: var(--ui-info2); text-decoration: underline; }
  .xflow-rte-body pre { background: var(--bg-3); border: 1px solid var(--border-3); border-radius: 6px; padding: 8px 10px; overflow-x: auto; font-size: 11.5px; }
  .xflow-rte-body code { font-family: "Courier New", monospace; background: var(--bg-3); border-radius: 3px; padding: 1px 4px; font-size: 11.5px; }
  .xflow-rte-body pre code { background: none; padding: 0; }
  .xflow-rte-body[contenteditable=false] { cursor: default; }
  .xflow-rte-emoji-panel { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; padding: 6px; background: var(--bg-1); border: 1px solid var(--border-1); border-radius: 8px; box-shadow: var(--pb-shadow-drag, 0 8px 24px rgba(0,0,0,.3)); }
  .xflow-rte-emoji-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; font-size: 16px; background: transparent; border: none; border-radius: 5px; cursor: pointer; }
  .xflow-rte-emoji-btn:hover { background: var(--bg-4); }
  @media (max-width: 767px) { .xflow-rte-btn { width: 44px; height: 44px; } .xflow-rte-btn.more { width: auto; } .xflow-rte-emoji-btn { width: 44px; height: 44px; } .xflow-rte-opt { min-height: 44px; } .xflow-rte-menu { width: 100%; } .xflow-rte-emoji-panel { grid-template-columns: repeat(6, 1fr); } .xflow-rte-sep { height: 24px; } .xflow-rte-body { font-size: 16px; } }
  .xflow-ticket-ref { color: var(--ui-accent-text); font-weight: 700; cursor: pointer; text-decoration: underline; text-decoration-style: dotted; }
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
// `disabled`/`placeholder` mantêm o contrato do editor caseiro anterior.
// Onda 3 (2026-10): print colado vira SÓ imagem inline na Descrição — não é mais copiado para Evidências. `onChange`
// é local/vivo (sem custo de rede); `onCommit` é o que efetivamente salva
// (onBlur), mesmo espírito do ContentField acima. Callbacks ficam em refs
// (padrão recomendado pelo próprio Tiptap) porque as opções do
// `useEditor` só são lidas na criação do editor — sem isso, um `onChange`
// novo a cada render (comum quando o pai passa uma arrow
// function inline) ficaria "congelado" na primeira versão.
function RichTextEditor({ value, onChange, onCommit, disabled, placeholder, ticketsByNumber, onOpenTicketRef }) {
  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);
  const [showMore, setShowMore] = useState(false);
  const moreId = useId();
  const toolbarRef = useRef(null);
  const moreBtnRef = useRef(null);
  const menuRef = useRef(null);
  // Esc fecha só o menu "Mais" (ele entra por cima na pilha de Esc do modal) e o foco volta ao botão.
  useEscClose(() => { setShowMore(false); if (moreBtnRef.current) moreBtnRef.current.focus(); }, showMore);
  useEffect(() => {
    if (!showMore) return undefined;
    const first = menuRef.current && menuRef.current.querySelector('[role^="menuitem"]');
    if (first) first.focus();
    const onDown = (e) => { if (toolbarRef.current && !toolbarRef.current.contains(e.target)) setShowMore(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showMore]);

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
          notify(`A imagem colada tem ${(file.size / (1024 * 1024)).toFixed(1)} MB — o limite é ${MAX_EVIDENCE_BYTES / (1024 * 1024)} MB.`, { tone: 'error' });
          return true;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const { schema } = view.state;
          const node = schema.nodes.image.create({ src: reader.result });
          view.dispatch(view.state.tr.replaceSelectionWith(node));
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
  async function insertLink() {
    const prev = editor.getAttributes('link').href || '';
    const url = await askText({ title: 'Inserir link', label: 'URL do link (deixe vazio para remover o link)', defaultValue: prev, confirmLabel: 'Aplicar', required: false });
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (url.trim()) chain.setLink({ href: url.trim() }).run();
    else chain.unsetLink().run();
  }
  function insertEmoji(emoji) {
    editor.chain().focus().insertContent(emoji).run();
  }
  function runMore(fn) { fn(); setShowMore(false); }
  function onMenuKeyDown(e) {
    const items = Array.from(menuRef.current ? menuRef.current.querySelectorAll('[role^="menuitem"]') : []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = items[(i - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    else if (e.key === 'Tab') { setShowMore(false); return; }
    if (next) { e.preventDefault(); next.focus(); }
  }
  const moreActive = editor.isActive('heading') || editor.isActive('underline') || editor.isActive('strike') || editor.isActive('blockquote') || editor.isActive('codeBlock')
    || ['center', 'right', 'justify'].some((a) => editor.isActive({ textAlign: a }))
    || !!editor.getAttributes('textStyle').fontFamily || !!editor.getAttributes('textStyle').fontSize;

  return (
    <div>
      <style>{RICH_TEXT_CSS}</style>
      {!disabled && (
        <div className="xflow-rte-toolbar" ref={toolbarRef} role="toolbar" aria-label="Formatação do texto">
          <button type="button" className="xflow-rte-btn" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" disabled={!editor.can().undo()} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={14} aria-hidden="true" /></button>
          <button type="button" className="xflow-rte-btn" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" disabled={!editor.can().redo()} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={14} aria-hidden="true" /></button>
          <div className="xflow-rte-sep" />
          <button type="button" className={btnCls(editor.isActive('bold'))} aria-label="Negrito" aria-pressed={editor.isActive('bold')} title="Negrito (Ctrl+B)" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} aria-hidden="true" /></button>
          <button type="button" className={btnCls(editor.isActive('italic'))} aria-label="Itálico" aria-pressed={editor.isActive('italic')} title="Itálico (Ctrl+I)" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} aria-hidden="true" /></button>
          <div className="xflow-rte-sep" />
          <button type="button" className={btnCls(editor.isActive('bulletList'))} aria-label="Lista com marcadores" aria-pressed={editor.isActive('bulletList')} title="Lista com marcadores" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} aria-hidden="true" /></button>
          <button type="button" className={btnCls(editor.isActive('orderedList'))} aria-label="Lista numerada" aria-pressed={editor.isActive('orderedList')} title="Lista numerada" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} aria-hidden="true" /></button>
          <div className="xflow-rte-sep" />
          <button type="button" className={btnCls(editor.isActive('link'))} aria-label="Link" aria-pressed={editor.isActive('link')} title="Link" onMouseDown={(e) => e.preventDefault()} onClick={insertLink}><Link2 size={14} aria-hidden="true" /></button>
          <button
            ref={moreBtnRef} type="button" className={`${btnCls(moreActive)} more`} aria-haspopup="menu" aria-expanded={showMore} aria-controls={showMore ? moreId : undefined}
            aria-label="Mais opções de formatação" title="Mais opções de formatação: títulos, sublinhado, tachado, fonte, tamanho, alinhamento, recuo, citação, código, linha e emoji"
            onMouseDown={(e) => e.preventDefault()} onClick={() => setShowMore((v) => !v)}
          ><MoreHorizontal size={14} aria-hidden="true" /> Mais</button>
          {showMore && (
            <div id={moreId} ref={menuRef} className="xflow-rte-menu" role="menu" aria-label="Mais opções de formatação" onKeyDown={onMenuKeyDown} onMouseDown={(e) => e.preventDefault()}>
              <div className="xflow-rte-menu-group" role="group" aria-label="Texto">
                <button type="button" role="menuitemcheckbox" aria-checked={editor.isActive('heading', { level: 2 })} className={btnCls(editor.isActive('heading', { level: 2 }))} aria-label="Título" title="Título" onClick={() => runMore(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}><Heading2 size={14} aria-hidden="true" /></button>
                <button type="button" role="menuitemcheckbox" aria-checked={editor.isActive('heading', { level: 3 })} className={btnCls(editor.isActive('heading', { level: 3 }))} aria-label="Subtítulo" title="Subtítulo" onClick={() => runMore(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}><Heading3 size={14} aria-hidden="true" /></button>
                <button type="button" role="menuitemcheckbox" aria-checked={editor.isActive('underline')} className={btnCls(editor.isActive('underline'))} aria-label="Sublinhado" title="Sublinhado (Ctrl+U)" onClick={() => runMore(() => editor.chain().focus().toggleUnderline().run())}><UnderlineIcon size={14} aria-hidden="true" /></button>
                <button type="button" role="menuitemcheckbox" aria-checked={editor.isActive('strike')} className={btnCls(editor.isActive('strike'))} aria-label="Tachado" title="Tachado" onClick={() => runMore(() => editor.chain().focus().toggleStrike().run())}><Strikethrough size={14} aria-hidden="true" /></button>
              </div>
              <div className="xflow-rte-menu-group" role="group" aria-label="Alinhamento">
                <button type="button" role="menuitemradio" aria-checked={editor.isActive({ textAlign: 'left' })} className={btnCls(editor.isActive({ textAlign: 'left' }))} aria-label="Alinhar à esquerda" title="Alinhar à esquerda" onClick={() => runMore(() => editor.chain().focus().setTextAlign('left').run())}><AlignLeft size={14} aria-hidden="true" /></button>
                <button type="button" role="menuitemradio" aria-checked={editor.isActive({ textAlign: 'center' })} className={btnCls(editor.isActive({ textAlign: 'center' }))} aria-label="Centralizar" title="Centralizar" onClick={() => runMore(() => editor.chain().focus().setTextAlign('center').run())}><AlignCenter size={14} aria-hidden="true" /></button>
                <button type="button" role="menuitemradio" aria-checked={editor.isActive({ textAlign: 'right' })} className={btnCls(editor.isActive({ textAlign: 'right' }))} aria-label="Alinhar à direita" title="Alinhar à direita" onClick={() => runMore(() => editor.chain().focus().setTextAlign('right').run())}><AlignRight size={14} aria-hidden="true" /></button>
                <button type="button" role="menuitemradio" aria-checked={editor.isActive({ textAlign: 'justify' })} className={btnCls(editor.isActive({ textAlign: 'justify' }))} aria-label="Justificar" title="Justificar" onClick={() => runMore(() => editor.chain().focus().setTextAlign('justify').run())}><AlignJustify size={14} aria-hidden="true" /></button>
              </div>
              <div className="xflow-rte-menu-group" role="group" aria-label="Recuo e blocos">
                <button type="button" role="menuitem" className="xflow-rte-btn" aria-label="Diminuir recuo" title="Diminuir recuo" onClick={() => runMore(() => editor.chain().focus().outdent().run())}><Outdent size={14} aria-hidden="true" /></button>
                <button type="button" role="menuitem" className="xflow-rte-btn" aria-label="Aumentar recuo" title="Aumentar recuo" onClick={() => runMore(() => editor.chain().focus().indent().run())}><IndentIcon size={14} aria-hidden="true" /></button>
                <button type="button" role="menuitemcheckbox" aria-checked={editor.isActive('blockquote')} className={btnCls(editor.isActive('blockquote'))} aria-label="Citação" title="Citação" onClick={() => runMore(() => editor.chain().focus().toggleBlockquote().run())}><Quote size={14} aria-hidden="true" /></button>
                <button type="button" role="menuitemcheckbox" aria-checked={editor.isActive('codeBlock')} className={btnCls(editor.isActive('codeBlock'))} aria-label="Bloco de código" title="Bloco de código" onClick={() => runMore(() => editor.chain().focus().toggleCodeBlock().run())}><Code size={14} aria-hidden="true" /></button>
                <button type="button" role="menuitem" className="xflow-rte-btn" aria-label="Linha horizontal" title="Linha horizontal" onClick={() => runMore(() => editor.chain().focus().setHorizontalRule().run())}><MinusIcon size={14} aria-hidden="true" /></button>
              </div>
              <div className="xflow-rte-menu-label" role="presentation">Fonte</div>
              <div className="xflow-rte-menu-group wrap" role="group" aria-label="Fonte">
                {RICH_TEXT_FONTS.map((f) => {
                  const on = (editor.getAttributes('textStyle').fontFamily || '') === f.value;
                  return <button key={f.value || 'padrao'} type="button" role="menuitemradio" aria-checked={on} className={`xflow-rte-opt${on ? ' active' : ''}`} onClick={() => runMore(() => { if (f.value) editor.chain().focus().setFontFamily(f.value).run(); else editor.chain().focus().unsetFontFamily().run(); })}>{f.label}</button>;
                })}
              </div>
              <div className="xflow-rte-menu-label" role="presentation">Tamanho</div>
              <div className="xflow-rte-menu-group wrap" role="group" aria-label="Tamanho">
                {RICH_TEXT_SIZES.map((f) => {
                  const on = (editor.getAttributes('textStyle').fontSize || '') === f.value;
                  return <button key={f.value || 'padrao'} type="button" role="menuitemradio" aria-checked={on} className={`xflow-rte-opt${on ? ' active' : ''}`} onClick={() => runMore(() => { if (f.value) editor.chain().focus().setFontSize(f.value).run(); else editor.chain().focus().unsetFontSize().run(); })}>{f.value ? f.label : 'Tamanho padrão'}</button>;
                })}
              </div>
              <div className="xflow-rte-menu-label" role="presentation">Emoji</div>
              <div className="xflow-rte-emoji-panel" role="group" aria-label="Emoji">
                {RICH_TEXT_EMOJIS.map((em) => (
                  <button key={em} type="button" role="menuitem" className="xflow-rte-emoji-btn" aria-label={`Inserir emoji ${em}`} title={`Inserir ${em}`} onClick={() => runMore(() => insertEmoji(em))}>{em}</button>
                ))}
              </div>
            </div>
          )}
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

function AffectedCompanyField({ id, ariaLabel, value, options, disabled, onCommit, placeholder }) {
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
        id={id} aria-label={ariaLabel} type="text" value={draft} disabled={disabled} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { setOpen(false); e.preventDefault(); } }}
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
  // O editor rico devolve "<p></p>" para um campo vazio: sem normalizar, um formulário intocado já contaria como alterado.
  const emptyRich = (h) => !String(h || '').replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '') && !/<img/i.test(String(h || ''));
  const isDirty = useDirtyForm({ ...form, description: emptyRich(form.description) ? '' : form.description });
  const [showGuard, setShowGuard] = useState(false);
  function requestClose() { if (isDirty) setShowGuard(true); else onClose(); }
  function escClose() { if (showGuard) setShowGuard(false); else requestClose(); }

  function set(patch) { setForm((f) => ({ ...f, ...patch })); }

  const [pasteNote, setPasteNote] = useState('');
  const pasteNoteTimer = useRef(null);
  useEffect(() => () => clearTimeout(pasteNoteTimer.current), []);
  async function addEvidenceFiles(files) {
    let n = 0;
    for (const file of files) {
      const ev = await readEvidenceFile(file);
      if (!ev) continue;
      setForm((f) => ({ ...f, evidence: [...f.evidence, ev] }));
      n += 1;
    }
    if (n) {
      setPasteNote(n === 1 ? `Anexado como evidência: ${files[0].name}` : `${n} arquivos anexados como evidência.`);
      clearTimeout(pasteNoteTimer.current);
      pasteNoteTimer.current = setTimeout(() => setPasteNote(''), 4000);
    }
  }
  // Print colado num campo de texto simples vira evidência (esses campos não guardam imagem).
  const onPasteToEvidence = (e) => {
    const imgs = clipboardImageFiles(e);
    if (!imgs.length) return;
    e.preventDefault();
    addEvidenceFiles(imgs);
  };
  function removeEvidence(id) { setForm((f) => ({ ...f, evidence: f.evidence.filter((ev) => ev.id !== id) })); }

  const requiredOk = form.title.trim() && form.product && form.clientType && !richTextIsBlank(form.description) && form.environment && form.occurredAt;
  const missingRequired = [
    !form.title.trim() && 'título', !form.product && 'produto', !form.clientType && 'tipo de cliente',
    richTextIsBlank(form.description) && 'descrição', !form.environment && 'ambiente', !form.occurredAt && 'data de ocorrência',
  ].filter(Boolean);
  const createDisabledReason = saving ? 'Aguarde terminar de enviar' : !requiredOk ? `Preencha para abrir a TASK: ${missingRequired.join(', ')}` : undefined;

  // Seções recolhíveis: o rótulo diz quantos campos já têm conteúdo; "Contexto" abre sozinha se faltar um obrigatório dela.
  const filled = (list) => list.filter((v) => v && String(v).trim()).length;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const ctxCount = filled([form.environment, form.occurredAt, form.expectedCompletionAt, form.module, form.affectedUser, form.affectedCompany]);
  const impactCount = filled([form.expectedResult, form.reproSteps, form.impact, form.frequency, form.priority]);
  const evCount = form.evidence.length;
  const ctxMissing = !form.environment || !form.occurredAt;

  async function submit() {
    if (!requiredOk || saving) return;
    setSaving(true);
    setError('');
    try {
      await onCreate({ ...form, ...captureMetadata() });
    } catch (e) {
      setError(friendlyError(e, 'Não foi possível abrir a TASK agora. Confira sua conexão e tente de novo — o que você preencheu foi mantido.'));
      setSaving(false);
    }
  }

  const padX = isMobile ? 16 : 30;
  return (
    <DialogOverlay onClose={escClose} label="Nova TASK" className="xf-modal" style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }}>
      <FlashToast message={pasteNote} />
      <div
        style={{
          ...S.detailBox, width: 'min(1100px, 94vw)', height: 'auto', maxHeight: '90vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          ...(isMobile ? { ...S.detailBoxMobile, padding: 0, height: '100dvh', maxHeight: '100dvh' } : null),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...S.detailTopBar, alignItems: 'flex-start', marginBottom: 0, flex: 'none', padding: isMobile ? 'calc(12px + var(--safe-top)) 16px 8px' : '22px 30px 10px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Nova TASK</h2>
            <div style={{ fontSize: 12, color: 'var(--text-5)', marginTop: 3 }}>
              Só o essencial pra abrir agora — o resto você completa depois.
            </div>
          </div>
          <button style={S.iconBtnGhost} aria-label="Fechar" title="Fechar" onClick={requestClose}><X size={18} aria-hidden="true" /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `0 ${padX}px 16px` }}>
          <div style={S.subSectionLabel} id="xf-new-type">Tipo</div>
          <div style={{ display: 'flex', gap: 8 }} role="group" aria-labelledby="xf-new-type">
            {XFLOW_TASK_TYPES.map((t) => (
              <button
                key={t.value} type="button" className="xf-fill" onClick={() => set({ type: t.value })} aria-pressed={form.type === t.value}
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

          <Field label={form.type === 'melhoria' ? 'Título da melhoria' : 'Título do BUG'} required style={{ marginTop: 14 }}>
            {(id) => (
              <input
                id={id} type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} aria-required="true"
                placeholder={form.type === 'melhoria' ? 'Ex.: "Adicionar filtro por responsável na lista"' : 'Ex.: "Erro ao calcular aderência após upload do SPED"'}
                style={{ fontSize: 17, fontWeight: 600, padding: '13px 14px', borderRadius: 9 }}
              />
            )}
          </Field>

          <div className="xf-grid" style={{ marginTop: 14 }}>
            <Field label="Produto / Plataforma" required>
              {(id) => (
                <select id={id} value={form.product} onChange={(e) => set({ product: e.target.value })} aria-required="true">
                  <option value="">Selecione</option>
                  {XFLOW_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
            </Field>
            <Field label="Tipo de cliente" required>
              {(id) => (
                <select id={id} value={form.clientType} onChange={(e) => set({ clientType: e.target.value })} aria-required="true">
                  <option value="">Selecione</option>
                  {XFLOW_CLIENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </Field>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ ...S.subSectionLabel, marginTop: 0 }} id="xf-new-desc">
              Descrição {form.type === 'melhoria' ? 'da melhoria' : 'do problema'} <span style={{ color: '#e2574c' }} aria-hidden="true">*</span><span className="ui-sr"> (obrigatório)</span>
            </div>
            <RichTextEditor
              value={form.description}
              onChange={(html) => set({ description: html })}
              placeholder="O que aconteceu"
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <CollapsibleSection id="new:contexto" title="Contexto" summary={ctxCount ? plural(ctxCount, 'preenchido', 'preenchidos') : 'opcional'} forceOpen={ctxMissing}>
              <div className="xf-grid">
                <Field label="Ambiente" required>
                  {(id) => (
                    <select id={id} value={form.environment} onChange={(e) => set({ environment: e.target.value })} aria-required="true">
                      <option value="producao">Produção</option>
                      <option value="homologacao">Homologação</option>
                      <option value="desenvolvimento">Desenvolvimento</option>
                    </select>
                  )}
                </Field>
                <Field label="Data da ocorrência" required>
                  {(id) => <input id={id} type="date" value={form.occurredAt} onChange={(e) => set({ occurredAt: e.target.value })} aria-required="true" />}
                </Field>
                <Field label="Previsão de conclusão">
                  {(id) => <input id={id} type="date" value={form.expectedCompletionAt} onChange={(e) => set({ expectedCompletionAt: e.target.value })} />}
                </Field>
                <Field label="Módulo / Tela">
                  {(id) => <input id={id} type="text" value={form.module} onChange={(e) => set({ module: e.target.value })} placeholder="Ex.: Upload, Aderência, Dashboard" />}
                </Field>
                <Field label="Usuário afetado">
                  {(id) => <input id={id} type="text" value={form.affectedUser} onChange={(e) => set({ affectedUser: e.target.value })} placeholder="Quem encontrou o problema" />}
                </Field>
                <Field label="Empresa/Cliente afetado">
                  {(id) => (
                    <AffectedCompanyField
                      id={id}
                      value={form.affectedCompany}
                      options={affectedCompanies}
                      onCommit={(v) => set({ affectedCompany: v })}
                      placeholder="Comece a digitar..."
                    />
                  )}
                </Field>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="new:impacto" title="Impacto" summary={impactCount ? plural(impactCount, 'preenchido', 'preenchidos') : 'opcional'}>
              <div className="xf-grid">
                <Field label="Resultado esperado" style={{ gridColumn: '1 / -1' }}>
                  {(id) => <textarea id={id} rows={2} value={form.expectedResult} onChange={(e) => set({ expectedResult: e.target.value })} onPaste={onPasteToEvidence} placeholder="O que deveria acontecer" />}
                </Field>
                <Field label="Passo a passo para reproduzir" style={{ gridColumn: '1 / -1' }}>
                  {(id) => <textarea id={id} rows={4} value={form.reproSteps} onChange={(e) => set({ reproSteps: e.target.value })} onPaste={onPasteToEvidence} placeholder={'1. Entrou em...\n2. Clicou em...\n3. Fez upload...'} />}
                </Field>
                <Field label="Impacto">
                  {(id) => (
                    <select id={id} value={form.impact} onChange={(e) => set({ impact: e.target.value })}>
                      <option value="">Selecione</option>
                      {XFLOW_IMPACT_ORDER.map((k) => <option key={k} value={k}>{XFLOW_IMPACT_META[k]}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Frequência">
                  {(id) => (
                    <select id={id} value={form.frequency} onChange={(e) => set({ frequency: e.target.value })}>
                      <option value="">Selecione</option>
                      {XFLOW_FREQUENCY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_FREQUENCY_META[k]}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Prioridade sugerida">
                  {(id) => (
                    <select id={id} value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
                      <option value="">Selecione</option>
                      {XFLOW_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_PRIORITY_META[k].label}</option>)}
                    </select>
                  )}
                </Field>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="new:evidencias" title="Evidências" summary={evCount ? plural(evCount, 'anexo', 'anexos') : 'opcional'}>
              <div style={{ ...S.fieldHint, marginTop: 0, marginBottom: 6 }}>Print, vídeo, arquivo ou mensagem de erro. Print colado na Descrição fica dentro do texto; cole (Ctrl+V / Cmd+V) nos campos de Impacto para guardar como evidência, ou use o botão.</div>
              <AddMenu onFiles={addEvidenceFiles} accept="" label="Anexar" />
              {form.evidence.map((ev) => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}>
                  {ev.type && ev.type.startsWith('image/') ? <img src={ev.dataUrl} alt={ev.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} /> : <Paperclip size={12} aria-hidden="true" />} <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{ev.name}</span>
                  <button style={S.iconBtnGhost} aria-label={`Remover evidência ${ev.name}`} title="Remover evidência" onClick={() => removeEvidence(ev.id)}><X size={12} aria-hidden="true" /></button>
                </div>
              ))}
            </CollapsibleSection>
          </div>

          <div style={{ ...S.fieldHint, marginTop: 12 }}>
            Capturado automaticamente ao enviar: endereço da tela atual, navegador, sistema, tamanho da tela e sessão — de quem está preenchendo este formulário, não necessariamente de quem sofreu o problema.
          </div>
        </div>

        <div className="xf-foot" style={{ paddingLeft: isMobile ? undefined : padX, paddingRight: isMobile ? undefined : padX }}>
          <div className={`xf-foot-msg${error ? ' err' : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">
            {error || createDisabledReason || 'Tudo certo para enviar.'}
          </div>
          <div className="xf-foot-btns">
            <Button onClick={requestClose}>Cancelar</Button>
            <Button variant="primary" onClick={submit} disabled={!requiredOk || saving} disabledReason={createDisabledReason}>
              {saving ? 'Enviando...' : form.type === 'melhoria' ? 'Registrar melhoria' : 'Abrir BUG'}
            </Button>
          </div>
        </div>
      </div>
      {showGuard && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDiscardModal
            onSaveAndExit={requiredOk ? submit : undefined}
            onDiscard={onClose}
            onCancel={() => setShowGuard(false)}
            saving={saving}
          />
        </div>
      )}
    </DialogOverlay>
  );
}

function TriageMenu({ onAction }) {
  const [open, setOpen] = useState(false);
  const items = [
    { key: 'aceitar', label: 'Aceitar TASK' },
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

function ContentField({ as: Tag = 'textarea', value, onCommit, disabled, rows, placeholder, type, onPasteImage, ariaLabel }) {
  const [draft, setDraft] = useState(value || '');
  const taRef = useRef(null);
  useEffect(() => { setDraft(value || ''); }, [value]);
  useEffect(() => { autosize(taRef.current); }, [draft]);
  const common = {
    value: draft, disabled, placeholder, 'aria-label': ariaLabel,
    onChange: (e) => setDraft(e.target.value),
    onBlur: () => { if (draft !== (value || '')) onCommit(draft); },
    // Campo de texto puro não guarda imagem: o print colado vira anexo da TASK (Evidências).
    onPaste: onPasteImage ? (e) => {
      const imgs = clipboardImageFiles(e);
      if (!imgs.length) return;
      e.preventDefault();
      onPasteImage(imgs);
    } : undefined,
  };
  if (Tag === 'input') return <input type={type || 'text'} {...common} />;
  return (
    <textarea
      ref={taRef} rows={rows || 2} {...common}
      style={{ resize: 'none', overflowY: 'auto', maxHeight: CONTENT_FIELD_MAX_H }}
    />
  );
}

// Texto de comentário: destaca @menção da equipe e transforma #N em link para a TASK N (quando ela existe na lista).
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
        out.push(<a key={key++} href="#" onClick={(e) => { e.preventDefault(); onOpenTicketRef(number); }} style={{ color: '#F5C400', fontWeight: 700, textDecoration: 'none' }}>{token}</a>);
      } else {
        out.push(token);
      }
    }
    lastIndex = m.index + token.length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

function TicketDetailModal({ ticket, team, currentUser, onClose, onAction, onCreateSpinoff, affectedCompanies, allTickets, onOpenTicket, onViewed, backGuardRef }) {
  const isMobile = useIsMobile();
  const role = effectiveXflowRole(currentUser);
  const [events, setEvents] = useState([]);
  const composeRef = useRef(null);
  const commentSentRef = useRef(false);
  const [hasCommentDraft, setHasCommentDraft] = useState(false);
  const [attachNote, setAttachNote] = useState('');
  const attachNoteTimer = useRef(null);
  const attachFilesRef = useRef(null);
  useEffect(() => () => clearTimeout(attachNoteTimer.current), []);
  function flashAttachNote(msg) {
    setAttachNote(msg);
    clearTimeout(attachNoteTimer.current);
    attachNoteTimer.current = setTimeout(() => setAttachNote(''), 4000);
  }
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
  const [sideError, setSideError] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const formBusyRef = useRef(false);

  const lastSavedAt = useAutosaveTimestamp(ticket);
  const hasActionDraft = [
    blockReasonDraft, closeReasonDraft, closeJustDraft, closeDupIdDraft, dupIdDraft, reproduceNoteDraft,
    redirectProduct, redirectModule, redirectAssignee, waitNote, gerenciaNote, homologRejectNote,
    publishVersion, publishBuild, publishRelease,
  ].some((v) => v && v.trim());
  const hasDraft = hasCommentDraft || hasActionDraft;
  function requestClose() { if (hasDraft) setShowGuard(true); else onClose(); }
  function escClose() { if (showGuard) setShowGuard(false); else requestClose(); }
  const hasDraftRef = useRef(hasDraft);
  hasDraftRef.current = hasDraft;
  useEffect(() => {
    if (!backGuardRef) return undefined;
    backGuardRef.current = () => {
      if (!hasDraftRef.current) return false;
      setShowGuard(true);
      return true;
    };
    return () => { backGuardRef.current = null; };
  }, [backGuardRef]);
  function closePreview(e) { if (e && e.stopPropagation) e.stopPropagation(); setPreviewEvidence(null); }
  async function saveDraftsAndClose() {
    if (hasCommentDraft && composeRef.current) {
      commentSentRef.current = false;
      await composeRef.current.submit();
      if (!commentSentRef.current) { setShowGuard(false); return; }
    }
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
    setSideError('');
    try {
      await onAction(ticket.id, action, payload || {});
      return true;
    } catch (e) {
      setSideError(friendlyError(e, 'Não foi possível concluir a ação. Confira sua conexão e tente de novo.'));
      return false;
    }
  }

  async function runForm(action, payload) {
    if (formBusyRef.current) return false;
    formBusyRef.current = true;
    setFormBusy(true);
    try {
      return await runAction(action, payload);
    } finally {
      formBusyRef.current = false;
      setFormBusy(false);
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

  async function confirmWait() {
    if (!(await runForm('pedir_infos', { waitingOnType: waitOnType, note: waitNote.trim() || undefined }))) return;
    setShowWaitForm(false);
    setWaitNote('');
  }
  async function confirmResolverGerencia() {
    if (!gerenciaNote.trim()) return;
    if (!(await runForm('resolver_gerencia', { note: gerenciaNote.trim() }))) return;
    setShowGerenciaForm(false);
    setGerenciaNote('');
  }
  async function confirmHomologReject() {
    if (!homologRejectNote.trim()) return;
    if (!(await runForm('homolog_reprovar', { note: homologRejectNote.trim() }))) return;
    setShowHomologRejectForm(false);
    setHomologRejectNote('');
  }
  async function confirmPublish() {
    const payload = {};
    if (publishVersion.trim()) payload.version = publishVersion.trim();
    if (publishBuild.trim()) payload.build = publishBuild.trim();
    if (publishRelease.trim()) payload.release = publishRelease.trim();
    if (!(await runForm('publicar', payload))) return;
    setShowPublishForm(false);
    setPublishVersion(''); setPublishBuild(''); setPublishRelease('');
  }

  async function confirmReproduce() {
    if (!reproduceNoteDraft.trim()) return;
    if (!(await runForm('nao_reproduziu', { closureJustification: reproduceNoteDraft.trim() }))) return;
    setShowReproduceForm(false);
    setReproduceNoteDraft('');
  }
  async function confirmDuplicate() {
    if (!dupIdDraft.trim()) return;
    if (!(await runForm('marcar_duplicado', { duplicateOfTicketId: dupIdDraft.trim() }))) return;
    setShowDupForm(false);
    setDupIdDraft('');
  }
  async function confirmRedirect() {
    const payload = {};
    if (redirectProduct) payload.product = redirectProduct;
    if (redirectModule.trim()) payload.module = redirectModule.trim();
    if (redirectAssignee) payload.assigneeId = redirectAssignee;
    if (!payload.product && !payload.module && !payload.assigneeId) return;
    if (!(await runForm('redirecionar', payload))) return;
    setShowRedirectForm(false);
    setRedirectProduct(''); setRedirectModule(''); setRedirectAssignee('');
  }

  async function confirmBlock() {
    if (!blockReasonDraft) return;
    if (!(await runForm('bloquear', { blockedReason: blockReasonDraft }))) return;
    setShowBlockForm(false);
    setBlockReasonDraft('');
  }

  async function confirmClose() {
    if (!closeReasonDraft || !closeJustDraft.trim()) return;
    if (closeReasonDraft === 'duplicado' && !closeDupIdDraft.trim()) return;
    const ok = await runForm('fechar_sem_desenvolver', {
      closureReason: closeReasonDraft, closureJustification: closeJustDraft.trim(),
      duplicateOfTicketId: closeReasonDraft === 'duplicado' ? closeDupIdDraft.trim() : undefined,
    });
    if (!ok) return;
    if (closeReasonDraft === 'melhoria' && onCreateSpinoff) {
      try {
        await onCreateSpinoff(ticket);
      } catch (e) {
        setSideError(`A TASK foi encerrada, mas não foi possível criar a melhoria vinculada: ${friendlyError(e, 'tente de novo.')}`);
      }
    }
    setShowCloseForm(false);
    setCloseReasonDraft(''); setCloseJustDraft(''); setCloseDupIdDraft('');
  }

  // Comentário (Onda 3): o ComposeBox guarda o rascunho; lançar aqui mantém o que foi digitado e mostra o erro na própria caixa.
  async function sendComment({ text, mentions, attachments, links }) {
    try {
      await onAction(ticket.id, 'comentar', { text, mentions, attachments, links });
    } catch (e) {
      throw new Error(`Não foi possível enviar o comentário: ${friendlyError(e, 'confira sua conexão.')} O que você escreveu foi mantido — tente de novo.`);
    }
    commentSentRef.current = true;
  }
  async function editComment(commentId, text) {
    await onAction(ticket.id, 'editar_comentario', { commentId, text });
  }
  async function deleteComment(commentId) {
    const ok = await askConfirm({ title: 'Excluir comentário?', message: 'O comentário será apagado desta TASK. Não dá para desfazer.', confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    await runAction('excluir_comentario', { commentId });
  }
  const mentionCandidates = useMemo(
    () => (team || []).filter((t) => t && t.id && t.name).map((t) => ({ id: t.id, name: t.name })),
    [team]
  );

  // Anexa à TASK (Evidências), um de cada vez (cada 'anexar' é uma transação no servidor).
  async function attachFiles(files) {
    let n = 0;
    for (const file of files) {
      const ev = await readEvidenceFile(file);
      if (!ev) continue;
      if (await runAction('anexar', { evidence: ev })) n += 1;
    }
    if (n) flashAttachNote(n === 1 ? `Anexado em Evidências: ${files[0].name}` : `${n} arquivos anexados em Evidências.`);
  }
  attachFilesRef.current = attachFiles;

  const ball = whoHasTheBall(ticket, teamById);
  const terminal = isTerminal(ticket.status);
  const canEditContent = canDoClient('edit_content', currentUser, ticket);
  const canAttach = canDoClient('attach_evidence', currentUser, ticket);
  const pasteToEvidence = canAttach ? (imgs) => attachFiles(imgs) : undefined;

  // Ctrl+V com a TASK aberta e NADA em foco (nenhum campo de texto): o print vai direto pras Evidências.
  // Campo de texto em foco trata o próprio paste (Descrição = inline, comentário = rascunho de anexo,
  // demais = Evidências); por isso aqui só age quando o foco não está num campo editável.
  useEffect(() => {
    if (!canAttach) return undefined;
    function onDocPaste(e) {
      if (e.defaultPrevented) return;
      const el = document.activeElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const imgs = clipboardImageFiles(e);
      if (!imgs.length) return;
      e.preventDefault();
      if (attachFilesRef.current) attachFilesRef.current(imgs);
    }
    document.addEventListener('paste', onDocPaste);
    return () => document.removeEventListener('paste', onDocPaste);
  }, [canAttach]);
  const canEditOps = canDoClient('editar_prazo_proxima_acao', currentUser, ticket);
  const closureReasonOptions = XFLOW_CLOSURE_REASON_ORDER.filter((k) => k !== 'descartado_gestao' || canDoClient('fechar_motivo_gestao', currentUser, ticket));

  const legacyHistory = (ticket.history || []).map((h, i) => ({ id: `legacy-${i}`, createdAt: h.ts, note: h.action, userName: h.user }));
  const structuredHistory = events
    .filter((e) => e.type !== 'comment')
    .map((e) => ({ id: e.id, createdAt: e.createdAt, note: e.note, userName: (teamById[e.userId] && teamById[e.userId].name) || '' }));
  const timeline = [...structuredHistory, ...legacyHistory].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return (
    <DialogOverlay onClose={escClose} label={`TASK #${ticket.number}`} history={false} className="xf-modal" style={{ ...S.detailOverlay, ...(isMobile ? S.detailOverlayMobile : null) }}>
      <FlashToast message={attachNote} />
      <div style={{ ...S.detailBox, width: 'min(1000px, 100%)', maxHeight: '92vh', overflowY: 'auto', ...(isMobile ? S.detailBoxMobile : null) }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div>
            <h2 style={{ margin: 0, fontSize: 12, color: 'var(--text-5)', fontWeight: 700 }}>TASK #{ticket.number}</h2>
            <ContentField as="input" ariaLabel="Título da TASK" value={ticket.title} disabled={!canEditContent} onCommit={(v) => runAction('editar_campo', { field: 'title', value: v })} />
            <div style={{ fontSize: 11.5, color: 'var(--text-5)', marginTop: 4 }}>
              Aberto em {fmtDateFromTs(ticket.createdAt)}
            </div>
            <div style={{ marginTop: 2 }}><RecordSaveStatus hasDraft={hasDraft} lastSavedAt={lastSavedAt} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {linkCopied && <span style={{ fontSize: 11, color: 'var(--text-5)' }}>Link copiado!</span>}
            <button
              style={S.iconBtnGhost} aria-label="Copiar link da TASK" title="Copiar link permanente desta TASK"
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${ticket.number}`;
                navigator.clipboard.writeText(url).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); });
              }}
            ><Link2 size={16} aria-hidden="true" /></button>
            <button style={S.iconBtnGhost} aria-label="Fechar" title="Fechar" onClick={requestClose}><X size={18} aria-hidden="true" /></button>
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
            Esta TASK está na Lixeira{ticket.deletedBy && teamById[ticket.deletedBy] ? ` (excluído por ${teamById[ticket.deletedBy].name})` : ''}.
            {canDoClient('restaurar', currentUser, ticket) && (
              <button style={{ ...S.iconBtn, marginLeft: 10 }} onClick={() => runAction('restaurar')}>Restaurar</button>
            )}
          </div>
        )}

        {sideError && (
          <div role="alert" style={{ ...S.loginBlockedMsg, marginBottom: 14, position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ flex: 1 }}>{sideError}</span>
            <button style={S.iconBtnGhost} aria-label="Dispensar aviso" title="Dispensar aviso" onClick={() => setSideError('')}><X size={12} aria-hidden="true" /></button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 20, flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={{ flex: 2, minWidth: 0, display: isMobile ? 'contents' : 'block' }}>
            <div style={{ order: 1, minWidth: 0 }}>
            <div style={S.subSectionLabel}>Descrição</div>
            <RichTextEditor
              value={ticket.description}
              disabled={!canEditContent}
              onCommit={(html) => runAction('editar_campo', { field: 'description', value: html })}
              ticketsByNumber={ticketsByNumber}
              onOpenTicketRef={openTicketRefByNumber}
              placeholder="O que aconteceu"
            />
            </div>

            <div style={{ order: 3, minWidth: 0 }}>
            <CollapsibleSection id="detail:repro" persist defaultOpen title="Resultado esperado e passo a passo">
            <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Resultado esperado</div>
            <ContentField ariaLabel="Resultado esperado" value={ticket.expectedResult} disabled={!canEditContent} rows={2} onPasteImage={pasteToEvidence} onCommit={(v) => runAction('editar_campo', { field: 'expectedResult', value: v })} />

            <div style={{ ...S.subSectionLabel, marginTop: 12 }}>Passo a passo para reproduzir</div>
            <ContentField ariaLabel="Passo a passo para reproduzir" value={ticket.reproSteps} disabled={!canEditContent} rows={4} onPasteImage={pasteToEvidence} onCommit={(v) => runAction('editar_campo', { field: 'reproSteps', value: v })} />
            </CollapsibleSection>

            <CollapsibleSection id="detail:evidencias" persist defaultOpen={(ticket.evidence || []).length > 0} title="Evidências" summary={(ticket.evidence || []).length ? `${(ticket.evidence || []).length} ${(ticket.evidence || []).length === 1 ? 'anexo' : 'anexos'}` : 'nenhuma'}>
            {canAttach && <div style={{ ...S.fieldHint, marginBottom: 6 }}>Print colado na Descrição fica dentro do texto. Cole com Ctrl+V (Cmd+V no Mac) nos outros campos de texto ou com nada selecionado para guardar como evidência. Pra outros arquivos, use Anexar.</div>}
            {canAttach && <AddMenu onFiles={attachFiles} accept="" label="Anexar" />}
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
                    <button style={S.iconBtnGhost} aria-label={`Remover anexo ${ev.name}`} title="Remover anexo" onClick={() => runAction('remover_anexo', { evidenceId: ev.id })}><X size={12} aria-hidden="true" /></button>
                  )}
                </div>
              );
            })}
            {!(ticket.evidence || []).length && !canAttach && <div style={S.fieldHint}>Nenhuma evidência anexada.</div>}
            </CollapsibleSection>

            <CollapsibleSection id="detail:vinculadas" persist defaultOpen={linkedTickets.length > 0} icon={Link2} title="TASKs vinculadas" summary={linkedTickets.length ? String(linkedTickets.length) : 'nenhuma'}>
            {linkedTickets.length === 0 && <div style={S.fieldHint}>Nenhuma TASK vinculada ainda.</div>}
            {linkedTickets.map((lt) => (
              <div key={lt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <a href="#" onClick={(e) => { e.preventDefault(); if (onOpenTicket) onOpenTicket(lt.id); }} style={{ fontSize: 12.5, fontWeight: 700, color: '#F5C400', textDecoration: 'none', flex: '0 1 auto' }}>
                  #{lt.number} — {lt.title}
                </a>
                <Badge meta={XFLOW_STATUS_META[lt.status]} small />
                <button style={S.iconBtnGhost} aria-label="Remover vínculo" title="Remover vínculo" onClick={() => runAction('desvincular_ticket', { linkedTicketId: lt.id })}><X size={12} aria-hidden="true" /></button>
              </div>
            ))}
            <input
              type="text" placeholder="Vincular TASK — busque por número, título ou palavra-chave" aria-label="Vincular TASK: buscar por número, título ou palavra-chave"
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
            </CollapsibleSection>

            {(ticket.solution || ticket.whatToTest || ['em_desenvolvimento', 'em_revisao', 'pronta_para_teste', 'em_homologacao', 'publicada', 'aguardando_validacao_solicitante', 'concluida'].includes(ticket.status)) && (
              <>
                <div style={{ ...S.subSectionLabel, marginTop: 12 }}>Solução aplicada</div>
                <ContentField ariaLabel="Solução aplicada" value={ticket.solution} disabled={!canEditContent} rows={2} placeholder="O que foi feito para corrigir" onPasteImage={pasteToEvidence} onCommit={(v) => runAction('editar_campo', { field: 'solution', value: v })} />
                <div style={{ ...S.subSectionLabel, marginTop: 12 }}>O que testar</div>
                <ContentField ariaLabel="O que testar" value={ticket.whatToTest} disabled={!canEditContent} rows={2} placeholder="Passos pra validar a correção" onPasteImage={pasteToEvidence} onCommit={(v) => runAction('editar_campo', { field: 'whatToTest', value: v })} />
              </>
            )}
            </div>

            <div style={{ order: 4, minWidth: 0 }}>
            <div style={{ ...S.subSectionLabel, marginTop: 16 }}><MessageSquare size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Comentários</div>
            <ComposeBox
              ref={composeRef}
              onSubmit={sendComment}
              mentionCandidates={mentionCandidates}
              onDirtyChange={setHasCommentDraft}
              submitLabel="Comentar"
              placeholder="Escreva um comentário… @ para mencionar · cole um print com Ctrl+V"
              draftKey={`xflow:${ticket.id}`}
            />
            <div style={{ marginTop: 10 }}>
              <CommentThread
                comments={ticket.comments || []}
                currentUserId={currentUser && currentUser.id}
                canModerate={role === 'admin'}
                onEdit={editComment}
                onDelete={deleteComment}
                renderText={(t) => renderCommentText(t, team, ticketsByNumber, openTicketRefByNumber)}
                empty="Nenhum comentário ainda."
              />
            </div>

            </div>

            <div style={{ order: 5, minWidth: 0 }}>
            <CollapsibleSection id="detail:historico" persist icon={Clock} title="Histórico" summary={timeline.length ? `${timeline.length} ${timeline.length === 1 ? 'evento' : 'eventos'}` : 'nenhum evento'}>
            {timeline.length === 0 && <div style={S.emptyMuted}>Nenhum evento ainda.</div>}
            {timeline.map((h) => (
              <div key={h.id} style={S.logRow}>
                <div style={S.logTs}>{fmtTs(h.createdAt)}{h.userName ? ` · ${h.userName}` : ''}</div>
                <div style={S.logAction}>{taskWording(h.note)}</div>
              </div>
            ))}
            </CollapsibleSection>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: isMobile ? 0 : 260, display: isMobile ? 'contents' : 'block' }}>
            <div style={{ order: 2, minWidth: 0 }}>
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
                <textarea aria-label="O que você tentou pra reproduzir?" rows={2} value={reproduceNoteDraft} onChange={(e) => setReproduceNoteDraft(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmReproduce} disabled={!reproduceNoteDraft.trim() || formBusy} title={formBusy ? 'Aguarde terminar' : !reproduceNoteDraft.trim() ? 'Descreva o que foi observado para continuar' : undefined}>Confirmar</button>
              </div>
            )}
            {showDupForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>ID/número da TASK original</div>
                <input aria-label="ID/número da TASK original" type="text" value={dupIdDraft} onChange={(e) => setDupIdDraft(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmDuplicate} disabled={!dupIdDraft.trim() || formBusy} title={formBusy ? 'Aguarde terminar' : !dupIdDraft.trim() ? 'Informe o número da TASK original' : undefined}>Vincular e marcar duplicado</button>
              </div>
            )}
            {showRedirectForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Novo produto (opcional)</div>
                <select aria-label="Novo produto (opcional)" value={redirectProduct} onChange={(e) => setRedirectProduct(e.target.value)}>
                  <option value="">Manter</option>
                  {XFLOW_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <div style={{ ...S.fieldHint, marginTop: 6 }}>Novo módulo (opcional)</div>
                <input aria-label="Novo módulo (opcional)" type="text" value={redirectModule} onChange={(e) => setRedirectModule(e.target.value)} />
                <div style={{ ...S.fieldHint, marginTop: 6 }}>Novo responsável (opcional)</div>
                <select aria-label="Novo responsável (opcional)" value={redirectAssignee} onChange={(e) => setRedirectAssignee(e.target.value)}>
                  <option value="">Manter</option>
                  {(team || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmRedirect} disabled={formBusy} title={formBusy ? 'Aguarde terminar' : undefined}>Confirmar redirecionamento</button>
              </div>
            )}
            {showWaitForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Aguardar resposta de</div>
                <select aria-label="Aguardar resposta de" value={waitOnType} onChange={(e) => setWaitOnType(e.target.value)}>
                  <option value="solicitante">Solicitante</option>
                  <option value="cliente">Cliente</option>
                  <option value="terceiro">Terceiro</option>
                </select>
                <div style={{ ...S.fieldHint, marginTop: 6 }}>O que está faltando (opcional)</div>
                <textarea aria-label="O que está faltando (opcional)" rows={2} value={waitNote} onChange={(e) => setWaitNote(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmWait} disabled={formBusy} title={formBusy ? 'Aguarde terminar' : undefined}>Confirmar</button>
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
                <textarea aria-label="Motivo da reprovação (obrigatório)" rows={2} value={homologRejectNote} onChange={(e) => setHomologRejectNote(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmHomologReject} disabled={!homologRejectNote.trim() || formBusy} title={formBusy ? 'Aguarde terminar' : !homologRejectNote.trim() ? 'Escreva o motivo da reprovação' : undefined}>Confirmar reprovação</button>
              </div>
            )}
            {ticket.status === 'pronta_para_publicacao' && canDoClient('publicar', currentUser, ticket) && (
              <button style={{ ...S.primaryBtn, width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => setShowPublishForm(true)}>Publicar</button>
            )}
            {showPublishForm && (
              <div style={{ ...S.accessBlock, marginBottom: 10 }}>
                <div style={S.fieldHint}>Versão (opcional)</div>
                <input aria-label="Versão (opcional)" type="text" value={publishVersion} onChange={(e) => setPublishVersion(e.target.value)} />
                <div style={{ ...S.fieldHint, marginTop: 6 }}>Build (opcional)</div>
                <input aria-label="Build (opcional)" type="text" value={publishBuild} onChange={(e) => setPublishBuild(e.target.value)} />
                <div style={{ ...S.fieldHint, marginTop: 6 }}>Release (opcional)</div>
                <input aria-label="Release (opcional)" type="text" value={publishRelease} onChange={(e) => setPublishRelease(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmPublish} disabled={formBusy} title={formBusy ? 'Aguarde terminar' : undefined}>Confirmar publicação</button>
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
                <textarea aria-label="Decisão (obrigatória)" rows={2} value={gerenciaNote} onChange={(e) => setGerenciaNote(e.target.value)} />
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmResolverGerencia} disabled={!gerenciaNote.trim() || formBusy} title={formBusy ? 'Aguarde terminar' : !gerenciaNote.trim() ? 'Escreva a decisão da gerência' : undefined}>Confirmar decisão</button>
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
                <select aria-label="Motivo" value={blockReasonDraft} onChange={(e) => setBlockReasonDraft(e.target.value)}>
                  <option value="">Selecione</option>
                  {XFLOW_BLOCK_REASON_ORDER.map((k) => <option key={k} value={k}>{XFLOW_BLOCK_REASON_META[k]}</option>)}
                </select>
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmBlock} disabled={!blockReasonDraft || formBusy} title={formBusy ? 'Aguarde terminar' : !blockReasonDraft ? 'Escolha o motivo do bloqueio' : undefined}>Confirmar bloqueio</button>
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
                <select aria-label="Motivo do encerramento" value={closeReasonDraft} onChange={(e) => setCloseReasonDraft(e.target.value)}>
                  <option value="">Selecione</option>
                  {closureReasonOptions.map((k) => <option key={k} value={k}>{XFLOW_CLOSURE_REASON_META[k]}</option>)}
                </select>
                {closeReasonDraft === 'duplicado' && (
                  <input type="text" aria-label="ID/número da TASK original" style={{ marginTop: 6 }} placeholder="ID/número da TASK original" value={closeDupIdDraft} onChange={(e) => setCloseDupIdDraft(e.target.value)} />
                )}
                <div style={{ ...S.fieldHint, marginTop: 6 }}>Justificativa (obrigatória)</div>
                <textarea aria-label="Justificativa (obrigatória)" rows={2} value={closeJustDraft} onChange={(e) => setCloseJustDraft(e.target.value)} />
                {closeReasonDraft === 'melhoria' && <div style={{ ...S.fieldHint, marginTop: 4 }}>Vai criar automaticamente uma nova TASK de melhoria vinculada a esta TASK.</div>}
                <button style={{ ...S.iconBtn, marginTop: 6 }} onClick={confirmClose} disabled={!closeReasonDraft || !closeJustDraft.trim() || (closeReasonDraft === 'duplicado' && !closeDupIdDraft.trim()) || formBusy} title={formBusy ? 'Aguarde terminar' : !closeReasonDraft ? 'Escolha o motivo do encerramento' : !closeJustDraft.trim() ? 'Escreva a justificativa' : (closeReasonDraft === 'duplicado' && !closeDupIdDraft.trim()) ? 'Informe o número da TASK original' : undefined}>Confirmar encerramento</button>
              </div>
            )}
            {terminal && !ticket.archived && canDoClient('reabrir', currentUser, ticket) && (
              <button style={{ ...S.iconBtn, width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={async () => {
                const note = await askText({ title: 'Reabrir TASK', label: 'Motivo da reabertura (obrigatório)', confirmLabel: 'Reabrir', required: true });
                if (note && note.trim()) runAction('reabrir', { note: note.trim() });
              }}>Reabrir TASK</button>
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
                  A TASK vai para a Lixeira — nada é apagado de verdade. Fica lá com todo o
                  histórico até alguém da gestão restaurar (ou o admin apagar de vez).
                </div>
                <button style={{ ...S.iconBtn, marginTop: 6, color: '#e2574c' }} onClick={() => runAction('excluir')}>Confirmar exclusão</button>
              </div>
            )}

            </div>

            <div style={{ order: 6, minWidth: 0 }}>
            <CollapsibleSection id="detail:classificacao" persist defaultOpen title="Classificação e responsável">
            <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Severidade</div>
            <select aria-label="Severidade" value={ticket.severity || ''} disabled={!canDoClient('change_severity', currentUser, ticket)} onChange={(e) => runAction('mudar_severidade', { severity: e.target.value })}>
              <option value="">Sem severidade</option>
              {XFLOW_SEVERITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_SEVERITY_META[k].label}</option>)}
            </select>

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Prioridade</div>
            <select aria-label="Prioridade" value={ticket.priority || ''} disabled={!canDoClient('change_priority', currentUser, ticket)} onChange={(e) => runAction('mudar_prioridade', { priority: e.target.value })}>
              <option value="">Sem prioridade</option>
              {XFLOW_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_PRIORITY_META[k].label}</option>)}
            </select>
            {ticket.suggestedPriority && <div style={S.fieldHint}>Sugestão original do solicitante: {metaLabel(XFLOW_PRIORITY_META, ticket.suggestedPriority)}</div>}

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Responsável atual</div>
            {(role === 'gestao' || role === 'admin') ? (
              <select aria-label="Responsável atual" value={ticket.assigneeId || ''} onChange={(e) => runAction('reatribuir', { assigneeId: e.target.value || null })}>
                <option value="">Ninguém</option>
                {(team || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ) : role === 'dev' && ticket.assigneeId !== currentUser.id ? (
              <button style={S.iconBtn} onClick={() => runAction('reatribuir', { assigneeId: currentUser.id })}>Assumir para mim</button>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 600 }}>{(teamById[ticket.assigneeId] && teamById[ticket.assigneeId].name) || 'Ninguém'}</div>
            )}
            </CollapsibleSection>

            <CollapsibleSection id="detail:prazos" persist defaultOpen={!isMobile} title="Prazos e próxima ação" summary={ticket.dueDate ? `prazo ${fmtDate(ticket.dueDate)}` : undefined}>
            <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Próxima ação</div>
            <ContentField ariaLabel="Próxima ação" as="input" value={ticket.nextAction} disabled={!canEditOps} onCommit={(v) => runAction('editar_prazo_proxima_acao', { nextAction: v })} />

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Prazo</div>
            <ContentField ariaLabel="Prazo" as="input" type="date" value={ticket.dueDate} disabled={!canEditOps} onCommit={(v) => runAction('editar_prazo_proxima_acao', { dueDate: v })} />
            <div style={S.fieldHint}>Prazo esperado de quem abriu a TASK, com base na urgência do cliente e do time interno — não é a entrega combinada pelo dev.</div>

            <div style={{ ...S.subSectionLabel, marginTop: 10 }}>Previsão de conclusão</div>
            <ContentField ariaLabel="Previsão de conclusão" as="input" type="date" value={ticket.expectedCompletionAt} disabled={!canEditContent} onCommit={(v) => runAction('editar_campo', { field: 'expectedCompletionAt', value: v })} />
            <div style={S.fieldHint}>Data que o dev define como a entrega correta — visível para solicitante, dev e gestão.</div>
            </CollapsibleSection>

            <CollapsibleSection id="detail:dados" persist title="Dados da abertura">
            <div style={{ ...S.fieldHint, marginTop: 0, marginBottom: 4 }}>
              Campos que faltaram na abertura podem ser preenchidos aqui — toda alteração fica registrada no histórico.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Produto / Plataforma</div>
                <select aria-label="Produto / Plataforma" value={ticket.product || ''} disabled={!canEditContent} onChange={(e) => runAction('editar_campo', { field: 'product', value: e.target.value })}>
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
                <ContentField ariaLabel="Módulo / Tela" as="input" value={ticket.module} disabled={!canEditContent} placeholder="Ex.: Upload, Aderência" onCommit={(v) => runAction('editar_campo', { field: 'module', value: v })} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Tipo de cliente</div>
                <select aria-label="Tipo de cliente" value={ticket.clientType || ''} disabled={!canEditContent} onChange={(e) => runAction('editar_campo', { field: 'clientType', value: e.target.value })}>
                  <option value="">Selecione</option>
                  {XFLOW_CLIENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Usuário afetado</div>
                <ContentField ariaLabel="Usuário afetado" as="input" value={ticket.affectedUser} disabled={!canEditContent} placeholder="Quem encontrou o problema" onCommit={(v) => runAction('editar_campo', { field: 'affectedUser', value: v })} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Empresa/Cliente afetado</div>
                <AffectedCompanyField ariaLabel="Empresa/Cliente afetado"
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
                <select aria-label="Impacto" value={ticket.impact || ''} disabled={!canEditContent} onChange={(e) => runAction('editar_campo', { field: 'impact', value: e.target.value })}>
                  <option value="">Selecione</option>
                  {XFLOW_IMPACT_ORDER.map((k) => <option key={k} value={k}>{XFLOW_IMPACT_META[k]}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Frequência</div>
                <select aria-label="Frequência" value={ticket.frequency || ''} disabled={!canEditContent} onChange={(e) => runAction('editar_campo', { field: 'frequency', value: e.target.value })}>
                  <option value="">Selecione</option>
                  {XFLOW_FREQUENCY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_FREQUENCY_META[k]}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Data da ocorrência</div>
                <ContentField ariaLabel="Data da ocorrência" as="input" type="date" value={ticket.occurredAt} disabled={!canEditContent} onCommit={(v) => runAction('editar_campo', { field: 'occurredAt', value: v })} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <div style={{ ...S.subSectionLabel, marginTop: 0 }}>Prioridade sugerida</div>
                <select aria-label="Prioridade sugerida"
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
            {ticket.capturedUrl && <div style={{ ...S.fieldHint, marginTop: 10, wordBreak: 'break-all' }}>Endereço da tela na abertura: {ticket.capturedUrl}</div>}
            </CollapsibleSection>
            </div>
          </div>
        </div>
      </div>
      {showGuard && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDiscardModal
            onSaveAndExit={hasCommentDraft ? saveDraftsAndClose : undefined}
            onDiscard={onClose}
            onCancel={() => setShowGuard(false)}
          />
        </div>
      )}
      {previewEvidence && (
        <DialogOverlay
          onClose={closePreview} label={previewEvidence.name || 'Evidência'}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <img src={previewEvidence.dataUrl} alt={previewEvidence.name} style={{ maxWidth: '90vw', maxHeight: '78vh', display: 'block', borderRadius: 8, objectFit: 'contain' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#eee', fontSize: 13 }}>{previewEvidence.name}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={previewEvidence.dataUrl} download={previewEvidence.name} style={S.primaryBtn}><Download size={14} /> Baixar</a>
                <button style={S.iconBtnGhost} aria-label="Fechar pré-visualização" title="Fechar pré-visualização" onClick={() => setPreviewEvidence(null)}><X size={18} color="#fff" aria-hidden="true" /></button>
              </div>
            </div>
          </div>
        </DialogOverlay>
      )}
    </DialogOverlay>
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
  return calendarDaysSince(iso);
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
      onClick={onClick} className="xf-stat xf-fill" aria-pressed={!!active}
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
    <div
      className="xf-card xf-row" role="button" tabIndex={0} aria-label={`Abrir TASK #${t.number}: ${t.title}`}
      style={{ ...S.accessBlock, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(t.id); } }}
    >
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
  if (!list.length) return <div style={{ ...S.emptyMuted, marginTop: 10 }}>{emptyLabel || 'Nenhuma TASK aqui.'}</div>;
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((t) => <TicketRow key={t.id} t={t} teamById={teamById} onOpen={onOpen} />)}
    </div>
  );
}

function FilterBar({ filters, setFilters, team, teamById, tickets }) {
  const isMobile = useIsMobile();
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
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
  const activeCount = Object.keys(filters).filter((k) => k !== 'search' && filters[k]).length;
  const collapsed = isMobile && !panelOpen;
  const sel = isMobile ? { width: '100%', minWidth: 0 } : { width: 'auto' };
  const cell = isMobile ? { flex: '1 1 45%', minWidth: 0 } : { display: 'contents' };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '14px 0' }}>
      <input type="text" aria-label="Buscar TASKs" placeholder="Buscar por ID, título, empresa, usuário..." value={filters.search} onChange={(e) => set({ search: e.target.value })} style={{ flex: '1 1 220px', minWidth: 180 }} />
      {isMobile && (
        <button type="button" className="xf-fill" style={S.iconBtn} aria-expanded={panelOpen} aria-controls={panelOpen ? panelId : undefined} onClick={() => setPanelOpen((v) => !v)}>
          <SlidersHorizontal size={14} aria-hidden="true" /> Filtros{activeCount ? ` (${activeCount})` : ''}
        </button>
      )}
      {!collapsed && (
        <div id={panelId} style={isMobile ? { display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' } : { display: 'contents' }}>
          <div style={cell}>
            <select aria-label="Filtrar por status" value={filters.status} onChange={(e) => set({ status: e.target.value })} style={sel}>
              <option value="">Todos os status</option>
              {Object.keys(XFLOW_STATUS_META).map((k) => <option key={k} value={k}>{XFLOW_STATUS_META[k].label}</option>)}
            </select>
          </div>
          <div style={cell}>
            <select aria-label="Filtrar por produto" value={filters.product} onChange={(e) => set({ product: e.target.value })} style={sel}>
              <option value="">Todos os produtos</option>
              {XFLOW_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={cell}>
            <select aria-label="Filtrar por severidade" value={filters.severity} onChange={(e) => set({ severity: e.target.value })} style={sel}>
              <option value="">Toda severidade</option>
              {XFLOW_SEVERITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_SEVERITY_META[k].label}</option>)}
            </select>
          </div>
          <div style={cell}>
            <select aria-label="Filtrar por prioridade" value={filters.priority} onChange={(e) => set({ priority: e.target.value })} style={sel}>
              <option value="">Toda prioridade</option>
              {XFLOW_PRIORITY_ORDER.map((k) => <option key={k} value={k}>{XFLOW_PRIORITY_META[k].label}</option>)}
            </select>
          </div>
          {team && team.length > 0 && (
            <div style={cell}>
              <select aria-label="Filtrar por atribuição" value={filters.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })} style={sel}>
                <option value="">Atribuído a: todos</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          {teamById && (
            <div style={cell}>
              <select aria-label="Filtrar por responsável atual" value={filters.ballHolder} onChange={(e) => set({ ballHolder: e.target.value })} style={sel} title="Quem precisa agir agora, não a atribuição fixa">
                <option value="">Responsável atual: todos</option>
                {devs.map((m) => <option key={m.id} value={`dev:${m.id}`}>{m.name}</option>)}
                {presentBallHolders.has('gestao') && <option value="gestao">Gestão</option>}
                {presentBallHolders.has('reporter') && <option value="reporter">Solicitante</option>}
                {presentBallHolders.has('terceiro') && <option value="terceiro">Terceiro</option>}
                {presentBallHolders.has('triage_queue') && <option value="triage_queue">Fila de triagem: todos</option>}
                {triageReporters.map((r) => <option key={r.id} value={`triageReporter:${r.id}`}>Fila de triagem: {r.name}</option>)}
              </select>
            </div>
          )}
          <div style={cell}>
            <select aria-label="Filtrar por prazo (SLA)" value={filters.slaState} onChange={(e) => set({ slaState: e.target.value })} style={sel}>
              <option value="">Todo SLA</option>
              {Object.keys(XFLOW_SLA_STATE_META).map((k) => <option key={k} value={k}>{XFLOW_SLA_STATE_META[k].label}</option>)}
            </select>
          </div>
          <div style={cell}>
            <select aria-label="Filtrar por tempo aberta" value={filters.agingBucket} onChange={(e) => set({ agingBucket: e.target.value })} style={sel}>
              <option value="">Toda idade</option>
              {AGING_BUCKET_ORDER.map((k) => <option key={k} value={k}>{AGING_BUCKET_LABEL[k]}</option>)}
            </select>
          </div>
        </div>
      )}
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
      {filteredMine.length === 0 && fila.length === 0 && <div style={{ ...S.emptyMuted, marginTop: 20 }}>Nenhuma TASK aguardando você.</div>}
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
          <div style={S.settingsLabel}>Gargalos — tempo acumulado (TASKs ativas)</div>
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
              <span style={{ color: 'var(--text-5)' }}>{info.count} {info.count === 1 ? 'TASK' : 'TASKs'} · {fmtHours(info.devSeconds)} em dev</span>
            </div>
          ))}
          {Object.keys(byDev).length === 0 && <div style={S.emptyMuted}>Nenhuma TASK atribuída.</div>}
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
      {list.length === 0 && <div style={{ ...S.emptyMuted, marginTop: 20 }}>Nenhuma TASK arquivada.</div>}
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
        TASKs excluídas nunca somem de verdade — ficam aqui com todo o histórico até
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
    <DialogOverlay onClose={onCancel} label={title} style={S.detailOverlay}>
      <div style={{ ...S.detailBox, width: 'min(420px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailTopBar}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div>
          <button style={S.iconBtnGhost} aria-label="Fechar" title="Fechar" onClick={onCancel}><X size={16} aria-hidden="true" /></button>
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
          <button style={S.iconBtnGhost} onClick={onCancel} disabled={saving} title={saving ? 'Aguarde terminar' : undefined}>Cancelar</button>
          <button style={S.primaryBtn} onClick={() => valid && onConfirm(value)} disabled={!valid || saving} title={saving ? 'Aguarde terminar' : !valid ? (field.type === 'select' ? 'Selecione uma opção para continuar' : 'Preencha o campo para continuar') : undefined}>{saving ? 'Salvando...' : 'Confirmar'}</button>
        </div>
      </div>
    </DialogOverlay>
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
      {...(columnTerminal ? { role: 'button', tabIndex: 0, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } } } : { ...attributes, ...listeners })}
      className="xf-card"
      style={{ ...S.personalCard, ...style, cursor: columnTerminal ? 'pointer' : 'grab', display: 'flex', flexDirection: 'column', gap: 6 }}
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
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
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
      showToast(friendlyError(err, 'Não foi possível mover a TASK. Tente de novo.'));
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
      onAction(ticket.id, 'reordenar', { boardOrder: newOrder }).catch((err) => showToast(friendlyError(err, 'Não foi possível reordenar. Tente de novo.')));
      return;
    }

    const result = resolveDrag(ticket.status, targetColumnId, currentUser, ticket);
    if (!result) return;
    if (result.blocked) { showToast(taskWording(result.reason)); return; }
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
        <div className="xf-board" style={S.personalBoardArea}>
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
  const [loadError, setLoadError] = useState(false);
  const [trashError, setTrashError] = useState(false);
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

  const openTicketIdRef = useRef(null);
  const backGuardRef = useRef(null);
  const lastDetailUrlRef = useRef('');
  openTicketIdRef.current = openTicketId;

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
  // Se há uma camada de Voltar (useBackLayer, ex.: modal Nova TASK) no topo, a
  // entrada dela é substituída em vez de empilhar — evita a camada, ao se
  // desfazer, dar history.back() e fechar a TASK recém-aberta.
  function openTicketDetail(id) {
    setOpenTicketId(id);
    try {
      const t = tickets.find((tk) => tk.id === id) || trashTickets.find((tk) => tk.id === id);
      const { backLayer, ...cur } = window.history.state || {};
      const url = t ? `${window.location.pathname}${window.location.search}#${t.number}` : window.location.href;
      lastDetailUrlRef.current = url;
      if (backLayer) window.history.replaceState({ ...cur, detailTicket: id }, '', url);
      else window.history.pushState({ ...cur, detailTicket: id }, '', url);
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
      // Voltar com rascunho não salvo na TASK aberta: repõe a entrada e mostra a guarda em vez de descartar.
      if (!state.detailTicket && openTicketIdRef.current && backGuardRef.current && backGuardRef.current()) {
        try { window.history.pushState({ ...state, detailTicket: openTicketIdRef.current }, '', lastDetailUrlRef.current || window.location.href); } catch (err) { /* ignora */ }
        return;
      }
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

  function loadAll() {
    setLoadError(false);
    setLoaded(false);
    Promise.all([apiGet('/api/xflow/tickets'), apiGet('/api/xflow/team'), apiGet('/api/xflow/affected-companies')])
      .then(([t, tm, ac]) => { setTickets(t.tickets); setTeam(tm.team); setAffectedCompanies(ac.affectedCompanies); setLoaded(true); })
      .catch(() => { setLoadError(true); setLoaded(true); });
  }
  useEffect(() => { loadAll(); }, []);

  // Link permanente por TASK (2026-08): "#30" na URL abre direto a TASK #30
  // assim que a lista carrega — só roda uma vez (hashOpenDone), senão fica
  // reabrindo o mesmo ticket toda vez que `tickets` muda depois.
  const hashOpenDone = useRef(false);
  useEffect(() => {
    if (!loaded || loadError || hashOpenDone.current) return;
    hashOpenDone.current = true;
    const m = /^#(\d+)$/.exec(window.location.hash);
    if (!m) return;
    const t = tickets.find((tk) => String(tk.number) === m[1]);
    if (t) openTicketDetail(t.id);
    else showToast(`TASK #${m[1]} não encontrada.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, loadError]);

  // Clique numa notificação (Central de Notificações, 2026-08) de fora do
  // XFlow: App.jsx seta `pendingOpenTicketId` e troca o workspace; aqui só
  // abre assim que os tickets estiverem carregados e limpa o pendente (senão
  // ficaria reabrindo sozinho depois que o usuário já fechou o modal).
  useEffect(() => {
    if (!pendingOpenTicketId || !loaded || loadError) return;
    const t = tickets.find((tk) => tk.id === pendingOpenTicketId);
    if (t) openTicketDetail(t.id);
    if (onPendingOpenConsumed) onPendingOpenConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenTicketId, loaded, loadError]);

  function registerAffectedCompany(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setAffectedCompanies((prev) => (prev.some((n) => n.toLowerCase() === trimmed.toLowerCase()) ? prev : [trimmed, ...prev]));
  }

  function loadTrash() {
    setTrashError(false);
    setTrashLoaded(false);
    apiGet('/api/xflow/tickets?trash=1')
      .then((t) => { setTrashTickets(t.tickets); setTrashLoaded(true); })
      .catch(() => { setTrashError(true); setTrashLoaded(true); });
  }
  useEffect(() => {
    if (!showTrash) return;
    loadTrash();
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
    setToastMsg(`TASK #${res.ticket.number} criada`);
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
      setToastMsg(`TASK #${res.ticket.number} movida para a Lixeira`);
      setTimeout(() => setToastMsg(''), 4500);
      return;
    }
    if (action === 'restaurar') {
      setTrashTickets((prev) => prev.filter((t) => t.id !== res.ticket.id));
      setTickets((prev) => [res.ticket, ...prev]);
      setToastMsg(`TASK #${res.ticket.number} restaurada`);
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
    if (!(await askConfirm({ title: 'Excluir definitivamente?', message: `"${title}" será apagada de vez, sem volta.`, confirmLabel: 'Excluir definitivamente', danger: true, requireText: XFLOW_PURGE_CONFIRM_PHRASE }))) return;
    await apiDelete(`/api/xflow/tickets/${ticketId}`);
    setTrashTickets((prev) => prev.filter((t) => t.id !== ticketId));
    if (openTicketId === ticketId) setOpenTicketId(null);
    setToastMsg('TASK apagada de vez');
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
    <div className="xf-root" style={S.page}>
      <style>{XFLOW_CSS}</style>
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
      <div className="xf-topbar" style={S.topbar}>
        <div style={S.brandRow}>
          <BrandLogo theme={theme} style={S.logoImg} />
          <div>
            <div style={{ fontWeight: 800 }}>XFlow</div>
            <div style={{ fontSize: 11, color: 'var(--text-5)' }}>{currentUser.name} · {XFLOW_ROLE_META[effRole] ? XFLOW_ROLE_META[effRole].label : currentUser.xflowRole}</div>
          </div>
        </div>
        <div className="xf-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        </div>
      </div>

      <div className="xf-pad" style={{ padding: '0 24px', paddingBottom: 40 }}>
        {!loadError && dependemDeVoceCount > 0 && !showArchived && !showTrash && (
          <div style={{ ...S.loginBlockedMsg, marginTop: 16, background: 'rgba(255,159,64,.14)', color: '#ff9f40', borderColor: 'rgba(255,159,64,.5)' }}>
            ⚠ {dependemDeVoceCount} {dependemDeVoceCount === 1 ? 'TASK dependendo' : 'TASKs dependendo'} de você
          </div>
        )}

        {!loaded && <div style={{ ...S.emptyMuted, marginTop: 20 }}>Carregando...</div>}

        {loaded && loadError && (
          <div role="alert" style={{ ...S.loginBlockedMsg, marginTop: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200 }}>Não foi possível carregar as TASKs. Verifique sua conexão e tente de novo.</span>
            <button style={S.iconBtn} onClick={loadAll}>Tentar de novo</button>
          </div>
        )}

        {loaded && !loadError && showTrash && (
          !trashLoaded ? <div style={{ ...S.emptyMuted, marginTop: 20 }}>Carregando...</div> : trashError ? (
            <div role="alert" style={{ ...S.loginBlockedMsg, marginTop: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 200 }}>Não foi possível carregar a Lixeira. Verifique sua conexão e tente de novo.</span>
              <button style={S.iconBtn} onClick={loadTrash}>Tentar de novo</button>
            </div>
          ) : (
            <LixeiraView
              tickets={trashTickets} teamById={teamById} filters={filters} setFilters={setFilters}
              onOpen={openTicketDetail} onRestore={(id) => performAction(id, 'restaurar', {})}
              onPurge={purgeTicket} canRestore={canRestoreTier} canPurge={canPurgeTier}
            />
          )
        )}

        {loaded && !loadError && showArchived && !showTrash && (
          <ArchivedView
            tickets={tickets} teamById={teamById} filters={filters} setFilters={setFilters}
            onOpen={openTicketDetail} onUnarchive={(id) => performAction(id, 'desarquivar', {})}
            canUnarchive={canArchiveTier}
          />
        )}

        {loaded && !loadError && !showArchived && !showTrash && viewMode === 'quadro' && (
          <XflowBoardView
            tickets={tickets} currentUser={currentUser} teamById={teamById} filters={filters} setFilters={setFilters}
            onOpen={openTicketDetail} onAction={performAction} showToast={showToast}
          />
        )}
        {loaded && !loadError && !showArchived && !showTrash && viewMode === 'lista' && effRole === 'reporter' && (
          <ReporterHome tickets={tickets} currentUser={currentUser} teamById={teamById} filters={filters} setFilters={setFilters} onOpen={openTicketDetail} />
        )}
        {loaded && !loadError && !showArchived && !showTrash && viewMode === 'lista' && effRole === 'dev' && (
          <DevHome tickets={tickets} currentUser={currentUser} teamById={teamById} filters={filters} setFilters={setFilters} onOpen={openTicketDetail} />
        )}
        {loaded && !loadError && !showArchived && !showTrash && viewMode === 'lista' && (effRole === 'gestao' || effRole === 'admin') && (
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
          backGuardRef={backGuardRef}
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
