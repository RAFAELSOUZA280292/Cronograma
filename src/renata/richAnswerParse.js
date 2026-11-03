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

