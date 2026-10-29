// Tokens de link público (A9, 2026-10-29). A tela gera o token com `crypto.getRandomValues` (48 hex = 192 bits), mas o servidor não pode confiar nisso:
// um navegador antigo (Math.random) ou um cliente mal-intencionado poderia gravar um token fraco ou escolhido. Regra: um token que JÁ existia no documento
// continua valendo (links antigos não quebram); um token NOVO só vale se tiver o formato forte — senão o servidor troca por um gerado aqui.
import crypto from 'node:crypto';

export const STRONG_TOKEN = /^[0-9a-f]{48}$/;
export const newShareToken = () => crypto.randomBytes(24).toString('hex');

function tokensOf(doc) {
  const out = new Set();
  const add = (t) => { if (typeof t === 'string' && t) out.add(t); };
  if (doc && Array.isArray(doc.boards)) for (const b of doc.boards) { add(b && b.shareToken); for (const c of (b && b.columns) || []) add(c && c.shareToken); }
  if (doc && Array.isArray(doc.meetings)) for (const m of doc.meetings) add(m && m.shareToken);
  return out;
}

function fix(holder, known, stats) {
  if (!holder || typeof holder.shareToken !== 'string' || !holder.shareToken) return;
  if (known.has(holder.shareToken) || STRONG_TOKEN.test(holder.shareToken)) return;
  holder.shareToken = newShareToken();
  stats.replaced += 1;
}

// Muda `next` no lugar; devolve quantos tokens foram trocados.
export function enforceShareTokens(prev, next) {
  const known = tokensOf(prev);
  const stats = { replaced: 0 };
  if (next && Array.isArray(next.boards)) for (const b of next.boards) { fix(b, known, stats); for (const c of (b && b.columns) || []) fix(c, known, stats); }
  if (next && Array.isArray(next.meetings)) for (const m of next.meetings) fix(m, known, stats);
  return stats.replaced;
}

// Campos que a página pública de uma reunião precisa (lista fechada): nada de anexos, comentários, subtarefas, notas internas, autor ou vínculo com atividade.
export function publicMeetingView(m) {
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  const out = pick(m, ['id', 'title', 'date', 'time', 'participants', 'summary', 'decisions', 'transcript', 'topics', 'highlights', 'shareVisibility']);
  out.actionItems = (Array.isArray(m.actionItems) ? m.actionItems : []).filter((it) => it && !it.deleted)
    .map((it) => pick(it, ['id', 'title', 'status', 'responsible', 'dueDate', 'owner', 'kind']));
  return out;
}
