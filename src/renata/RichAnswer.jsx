// Resposta da RENATA formatada (02/11/2026, pedido do Rafael: "falta estar mais bem formatada e visual; falta poder clicar e ir até
// as pendências"). Nada de HTML vindo do modelo: tudo vira nó React. Entende "### título", listas "- " e "1. ", **negrito**,
// [texto](/caminho) só para caminhos do próprio painel (shared/panelLinks.js) — vira botão que abre o registro (evento
// `pt:open-link`, tratado no App.jsx) — e destaca "venceu …"/"atrasad…" em vermelho. Usado no painel lateral e na tela inicial.
import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { parsePanelLink } from '../../shared/panelLinks.js';

export const RICH_ANSWER_CSS = `
.rna h4 { margin: 12px 0 6px; font-size: 12.5px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; color: var(--text-2); display: flex; align-items: center; gap: 6px; }
.rna h4:first-child { margin-top: 0; }
.rna h4::before { content: ''; width: 3px; height: 13px; border-radius: 2px; background: var(--ui-accent, #F5C400); flex: none; }
.rna p { margin: 0 0 8px; } .rna p:last-child { margin-bottom: 0; }
.rna ul, .rna ol { margin: 0 0 10px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--sp-1); }
.rna li { padding: 6px 9px; border-radius: var(--r-md); background: var(--bg-1); border: 1px solid var(--border-1); line-height: 1.45; }
.rna ol { counter-reset: rna; } .rna ol > li { counter-increment: rna; }
.rna ol > li::before { content: counter(rna) '.'; font-weight: 800; color: var(--text-4); margin-right: 6px; }
.rna-link { display: inline; padding: 0; border: none; background: none; font: inherit; font-weight: 700; color: var(--ui-link, #1a73e8); cursor: pointer; text-align: left; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 2px; }
.rna-link:hover { text-decoration-color: currentColor; }
.rna-link svg { vertical-align: -2px; margin-left: 2px; }
.rna-link:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 2px; border-radius: 3px; }
.rna-late { color: var(--ui-danger, #e5484d); font-weight: 700; white-space: nowrap; }
`;

const LATE_RE = /(venceu(?: em)? \d{1,2}\/\d{1,2}(?:\/\d{2,4})?|atrasad[ao]s?(?: há \d+ dias?)?|vencid[ao]s?)/gi;

function decorate(text, key) {
  const parts = String(text).split(LATE_RE);
  return parts.map((p, i) => (i % 2 === 1 ? <span key={`${key}-l${i}`} className="rna-late">{p}</span> : p));
}

function inline(text, onLink) {
  // [texto](caminho) → botão só se o caminho for do painel; senão fica só o texto (nunca um link para fora vindo do modelo).
  const out = [];
  const re = /\[([^\]]{1,200})\]\(([^)\s]{1,400})\)|\*\*([^*]+)\*\*/g;
  let last = 0; let m; let k = 0;
  const s = String(text);
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(...decorate(s.slice(last, m.index), `t${k++}`));
    if (m[1] !== undefined) {
      const href = m[2];
      if (parsePanelLink(href) && onLink) {
        out.push(<button key={`a${k++}`} type="button" className="rna-link" title="Abrir no painel" onClick={() => onLink(href)}>{m[1]}<ArrowUpRight size={12} aria-hidden="true" /></button>);
      } else out.push(m[1]);
    } else out.push(<strong key={`b${k++}`}>{decorate(m[3], `bb${k}`)}</strong>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(...decorate(s.slice(last), `t${k++}`));
  return out;
}

const BULLET = /^\s*[-•*]\s+/;
const NUMBER = /^\s*\d{1,2}[.)]\s+/;
const HEADING = /^\s*#{2,4}\s+/;

export default function RichAnswer({ text, onLink }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let cur = null;
  const flush = () => { if (cur) blocks.push(cur); cur = null; };
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, '');
    if (!l.trim()) { flush(); continue; }
    if (HEADING.test(l)) { flush(); blocks.push({ t: 'h', text: l.replace(HEADING, '') }); continue; }
    const type = BULLET.test(l) ? 'ul' : NUMBER.test(l) ? 'ol' : 'p';
    if (!cur || cur.t !== type) { flush(); cur = { t: type, items: [] }; }
    cur.items.push(type === 'ul' ? l.replace(BULLET, '') : type === 'ol' ? l.replace(NUMBER, '') : l);
  }
  flush();
  return (
    <div className="rna">
      {blocks.map((b, i) => {
        if (b.t === 'h') return <h4 key={i}>{inline(b.text.replace(/\*\*/g, ''), onLink)}</h4>;
        if (b.t === 'ul') return <ul key={i}>{b.items.map((it, k) => <li key={k}>{inline(it, onLink)}</li>)}</ul>;
        if (b.t === 'ol') return <ol key={i}>{b.items.map((it, k) => <li key={k}>{inline(it, onLink)}</li>)}</ol>;
        return <p key={i}>{b.items.map((it, k) => <React.Fragment key={k}>{k > 0 && <br />}{inline(it, onLink)}</React.Fragment>)}</p>;
      })}
    </div>
  );
}

// Abre o link no painel: o App.jsx escuta `pt:open-link` e leva à empresa, atividade, reunião, tarefa ou negócio.
export function openPanelLink(href) {
  window.dispatchEvent(new CustomEvent('pt:open-link', { detail: { href } }));
}
