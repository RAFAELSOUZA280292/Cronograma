// Caixa de e-mail, pacote visual (2026-11-02): preferências de exibição (largura das colunas, painel de leitura, densidade) e o mapa
// de atalhos da lista/leitura. Só funções puras — a tela (MailScreen.jsx) e a ajuda "?" (shell/shortcuts.js) leem daqui.
// `scripts/mail-view.test.mjs` confere limites, saneamento e o mapa de teclas.

// `side`/`sideW` (§150): painel lateral à direita (Agenda ou Tarefas, como a barra do Google) e a largura dele.
export const VIEW_DEFAULTS = { navW: 220, listW: 360, listH: 0.45, reading: 'right', density: 'comfortable', snippet: true, navCollapsed: false, side: '', sideW: 340 };
export const LIMITS = { nav: [160, 360], list: [260, 720], listH: [0.2, 0.8], readerMin: 360, side: [280, 640] };
export const SIDE_PANELS = ['', 'agenda', 'tasks'];
export function clampSide(w) { return Math.round(clamp(Number(w) || VIEW_DEFAULTS.sideW, ...LIMITS.side)); }
export const READING = ['right', 'bottom', 'off'];
export const DENSITY = ['comfortable', 'compact'];

export const viewKey = (userId) => `pt-mail-view:${userId || 'anon'}`;

export function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
export function clampNav(w) { return Math.round(clamp(Number(w) || VIEW_DEFAULTS.navW, ...LIMITS.nav)); }
// `avail` = largura da área lista+leitura; a leitura nunca fica com menos de LIMITS.readerMin.
export function clampList(w, avail) {
  const [min, maxAbs] = LIMITS.list;
  const max = avail ? Math.max(min, Math.min(maxAbs, avail - LIMITS.readerMin)) : maxAbs;
  return Math.round(clamp(Number(w) || VIEW_DEFAULTS.listW, min, max));
}
export function clampListH(f) { const n = Number(f); return clamp(Number.isFinite(n) ? n : VIEW_DEFAULTS.listH, ...LIMITS.listH); }

// O que vem do localStorage pode estar velho ou adulterado: tudo volta ao padrão se não fizer sentido.
export function sanitizeView(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  if (!v || typeof v !== 'object') v = {};
  return {
    navW: clampNav(v.navW),
    listW: clampList(v.listW),
    listH: clampListH(v.listH),
    reading: READING.includes(v.reading) ? v.reading : VIEW_DEFAULTS.reading,
    density: DENSITY.includes(v.density) ? v.density : VIEW_DEFAULTS.density,
    snippet: typeof v.snippet === 'boolean' ? v.snippet : VIEW_DEFAULTS.snippet,
    navCollapsed: v.navCollapsed === true,
    side: SIDE_PANELS.includes(v.side) ? v.side : VIEW_DEFAULTS.side,
    sideW: clampSide(v.sideW),
  };
}

// Divisória pelo teclado: setas mudam 16 (Shift: 64), Home/End vão ao limite. Devolve null para tecla que não é dela.
export function stepSize(value, e, { min, max, step = 16, vertical = false }) {
  const s = e.shiftKey ? step * 4 : step;
  const less = vertical ? 'ArrowUp' : 'ArrowLeft';
  const more = vertical ? 'ArrowDown' : 'ArrowRight';
  if (e.key === less) return clamp(value - s, min, max);
  if (e.key === more) return clamp(value + s, min, max);
  if (e.key === 'Home') return min;
  if (e.key === 'End') return max;
  return null;
}

// Atalhos da Caixa de e-mail. `match` = valores de KeyboardEvent.key; `keys` = como aparecem na ajuda.
export const MAIL_SHORTCUTS = [
  { action: 'next', match: ['j', 'ArrowDown'], keys: ['J', '↓'], what: 'Próxima conversa da lista' },
  { action: 'prev', match: ['k', 'ArrowUp'], keys: ['K', '↑'], what: 'Conversa anterior da lista' },
  { action: 'open', match: ['Enter'], keys: ['Enter'], what: 'Abrir a conversa marcada' },
  { action: 'close', match: ['Escape'], keys: ['Esc'], what: 'Fechar a leitura e voltar para a lista (ou limpar a seleção)' },
  { action: 'archive', match: ['e'], keys: ['E'], what: 'Arquivar a conversa (tirar da Entrada)' },
  { action: 'trash', match: ['#', 'Delete'], keys: ['#', 'Delete'], what: 'Mover para a Lixeira' },
  { action: 'move', match: ['v'], keys: ['V'], what: 'Mover a conversa para uma pasta' },
  { action: 'star', match: ['s'], keys: ['S'], what: 'Marcar ou tirar a estrela' },
  { action: 'unread', match: ['u'], keys: ['U'], what: 'Marcar como não lido' },
  { action: 'reply', match: ['r'], keys: ['R'], what: 'Responder (com a conversa aberta)' },
  { action: 'replyAll', match: ['a'], keys: ['A'], what: 'Responder a todos (com a conversa aberta)' },
  { action: 'forward', match: ['f'], keys: ['F'], what: 'Encaminhar (com a conversa aberta)' },
  { action: 'compose', match: ['c', 'n'], keys: ['C', 'N'], what: 'Escrever um e-mail novo' },
  { action: 'search', match: ['/'], keys: ['/'], what: 'Ir para a pesquisa de e-mails' },
];

const BY_KEY = new Map(MAIL_SHORTCUTS.flatMap((s) => s.match.map((k) => [k, s.action])));
// Ctrl/⌘/Alt nunca (Mod K e os do navegador são de outros); Shift só onde a tecla precisa dele (#).
export function mailKeyAction(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key;
  if (e.shiftKey && k !== '#') return null;
  return BY_KEY.get(k) || null;
}

export function neighborId(ids, id, dir) {
  if (!ids.length) return null;
  const i = ids.indexOf(id);
  if (i < 0) return dir > 0 ? ids[0] : ids[ids.length - 1];
  return ids[clamp(i + dir, 0, ids.length - 1)];
}

// Depois de arquivar/excluir a conversa aberta, abre a de baixo (ou a de cima, se era a última), como no Outlook.
export function afterRemoval(ids, id) {
  const i = ids.indexOf(id);
  if (i < 0) return null;
  return ids[i + 1] || ids[i - 1] || null;
}

// A ação tira a conversa da pasta que está na tela? (mesma regra do `act` da MailScreen)
export function removesFrom(action, folder) {
  return (action === 'archive' && folder === 'INBOX') || action === 'trash' || action === 'spam'
    || (action === 'untrash' && folder === 'TRASH') || (action === 'inbox' && (folder === 'ARCHIVE' || folder === 'SPAM'))
    || (action === 'unstar' && folder === 'STARRED');
}
