// Leitura de um item de lista da resposta da RENATA para o cartão (src/renata/RichAnswer.jsx). Puro, testado em scripts/rich-answer.test.mjs.
const DUE_RE = /^(venceu|vence|vencida|vencido|prazo|atrasad[ao])\b/i;
const LINK_RE = /\[([^\]]{1,200})\]\(([^)\s]{1,400})\)/;

// "[Título](link) — Financeiro · venceu 09/09 · 9 subatividades em aberto" → { title, href, meta[], due, tags[] }.
export function parseItem(line) {
  const s = String(line).trim();
  const lm = LINK_RE.exec(s);
  let title = ''; let href = ''; let rest = s;
  if (lm && lm.index <= 2) { title = lm[1]; href = lm[2]; rest = s.slice(lm.index + lm[0].length); }
  else {
    const cut = s.search(/\s[—–]\s/);
    title = cut > 0 ? s.slice(0, cut) : s; rest = cut > 0 ? s.slice(cut) : '';
  }
  const parts = rest.replace(/^\s*[—–:-]\s*/, '').split(/\s+[·|—–]\s+|\s*;\s*/).map((p) => p.trim().replace(/^\((.*)\)$/, '$1')).filter(Boolean);
  let due = ''; const meta = []; const tags = [];
  for (const p of parts) {
    if (!due && DUE_RE.test(p)) due = p.charAt(0).toUpperCase() + p.slice(1);
    else if (/!$/.test(p) && p.length <= 24) tags.push(p);
    else meta.push(p);
  }
  return { title: title.replace(/\*\*/g, ''), href, meta, due, tags };
}

// Tipo do bloco (o mesmo da RENATA do projeto: warning, facts, impact, recommendation, timeline) pelo título; "facts" ganha o ícone do assunto.
export function blockType(title) {
  const t = String(title || '').toLowerCase();
  if (/aten[cç][aã]o|risco|alerta|urgente|cr[ií]tic|cuidado|diverg/.test(t)) return 'warning';
  if (/recomend|sugest|pr[oó]ximos? passos?|o que fazer|plano de a|leve preparado|como agir/.test(t)) return 'recommendation';
  if (/impacto|efeito|consequ|resultado/.test(t)) return 'impact';
  if (/linha do tempo|hist[oó]rico|evolu[cç][aã]o|cronologia/.test(t)) return 'timeline';
  return 'facts';
}
