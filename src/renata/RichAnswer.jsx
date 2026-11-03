// Resposta da RENATA formatada (02/11/2026, pedidos do Rafael: "falta estar mais bem formatada e visual; falta poder clicar e ir até
// as pendências" e, depois, o print de referência com resumo em destaque, seções com ícone e cartões com selo de prazo). Nada de HTML
// vindo do modelo: tudo vira nó React. Entende "### título", listas "- " e "1. ", **negrito** e [texto](/caminho) só para caminhos
// do próprio painel (shared/panelLinks.js). Item de lista vira cartão: título (link), linha de detalhes e selo "Venceu dd/mm" em
// vermelho; clicar no cartão dispara `pt:open-link` (App.jsx abre o registro). Usado no painel lateral e na tela inicial.
import React from 'react';
import { ArrowUpRight, ChevronRight, Clock, Info, CalendarDays, Users, Briefcase, Mail, ListChecks, User, Layers, FileText } from 'lucide-react';
import { parsePanelLink } from '../../shared/panelLinks.js';
import { parseItem } from './richAnswerParse.js';

export const RICH_ANSWER_CSS = `
.rna { display: flex; flex-direction: column; gap: var(--sp-3); }
.rna p { margin: 0; }
.rna-sum { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 14px; background: color-mix(in srgb, #F5C400 11%, var(--bg-1)); border: 1px solid color-mix(in srgb, #F5C400 30%, transparent); font-size: var(--fs-md); line-height: 1.5; color: var(--text-1); }
.rna-sum > svg { flex: none; color: #c99a00; margin-top: 2px; }
.rna-sec { display: flex; align-items: center; gap: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--border-1); margin-top: 4px; }
.rna-sec::before { content: ''; width: 3px; align-self: stretch; min-height: 22px; border-radius: 2px; background: var(--ui-accent, #F5C400); flex: none; }
.rna-sec-ico { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: none; background: color-mix(in srgb, #F5C400 16%, var(--bg-1)); color: #b88a00; }
.rna-sec h4 { margin: 0; font-size: 12.5px; font-weight: 800; letter-spacing: .03em; text-transform: uppercase; color: var(--text-1); line-height: 1.35; }
.rna-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--sp-2); }
.rna-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--r-xl); background: var(--bg-1); border: 1px solid var(--border-1); line-height: 1.4; }
.rna-card.go { cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.rna-card.go:hover { border-color: color-mix(in srgb, #F5C400 55%, var(--border-2)); box-shadow: 0 2px 10px rgba(0,0,0,.06); }
.rna-card.go:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 2px; }
.rna-card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-1); }
.rna-num { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 11.5px; font-weight: 800; background: var(--bg-3); color: var(--text-3); }
.rna-title { font-weight: 700; color: var(--text-1); overflow-wrap: anywhere; }
.rna-title.link { color: var(--ui-link, #1a73e8); text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 30%, transparent); text-underline-offset: 3px; }
.rna-title.link svg { vertical-align: -2px; margin-left: 3px; }
.rna-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 12.5px; color: var(--text-3); }
.rna-meta-item { display: inline-flex; align-items: center; gap: 5px; }
.rna-meta-item + .rna-meta-item::before { content: ''; width: 1px; height: 12px; background: var(--border-3); margin-right: 5px; }
.rna-meta-item svg { color: var(--text-4); flex: none; }
.rna-due { flex: none; display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: var(--r-pill); font-size: var(--fs-xs); font-weight: 700; white-space: nowrap; color: var(--ui-danger, #d93636); background: color-mix(in srgb, var(--ui-danger, #e5484d) 11%, transparent); }
.rna-due.ok { color: var(--text-3); background: var(--bg-3); }
.rna-tag { display: inline-flex; padding: 2px 8px; border-radius: var(--r-pill); font-size: 11.5px; font-weight: 700; background: var(--bg-3); color: var(--text-3); white-space: nowrap; }
.rna-chev { flex: none; color: var(--text-5); }
.rna-plain { position: relative; padding: 0 0 0 16px; line-height: 1.5; }
.rna-plain::before { content: ''; position: absolute; left: 4px; top: .62em; width: 5px; height: 5px; border-radius: 50%; background: var(--ui-accent, #F5C400); }
.rna-list:has(> .rna-plain) { gap: var(--sp-1); }
.rna-link { display: inline; padding: 0; border: none; background: none; font: inherit; font-weight: 700; color: var(--ui-link, #1a73e8); cursor: pointer; text-align: left; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 2px; }
.rna-link svg { vertical-align: -2px; margin-left: 2px; }
.rna-link:focus-visible { outline: 2px solid var(--ui-accent, #F5C400); outline-offset: 2px; border-radius: 3px; }
.rna-late { color: var(--ui-danger, #d93636); font-weight: 700; }
@media (max-width: 480px) { .rna-card { flex-wrap: wrap; } .rna-due { order: 3; } .rna-chev { display: none; } }
`;

const LATE_RE = /(venceu(?: em)? \d{1,2}\/\d{1,2}(?:\/\d{2,4})?|atrasad[ao]s?(?: há \d+ dias?)?|vencid[ao]s?)/gi;

function decorate(text, key) {
  return String(text).split(LATE_RE).map((p, i) => (i % 2 === 1 ? <span key={`${key}-l${i}`} className="rna-late">{p}</span> : p));
}

function inline(text, onLink) {
  const out = [];
  const re = /\[([^\]]{1,200})\]\(([^)\s]{1,400})\)|\*\*([^*]+)\*\*/g;
  let last = 0; let m; let k = 0;
  const s = String(text);
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(...decorate(s.slice(last, m.index), `t${k++}`));
    if (m[1] !== undefined) {
      const href = m[2];
      if (parsePanelLink(href) && onLink) out.push(<button key={`a${k++}`} type="button" className="rna-link" title="Abrir no painel" onClick={() => onLink(href)}>{m[1]}<ArrowUpRight size={12} aria-hidden="true" /></button>);
      else out.push(m[1]);
    } else out.push(<strong key={`b${k++}`}>{decorate(m[3], `bb${k}`)}</strong>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(...decorate(s.slice(last), `t${k++}`));
  return out;
}

// Ícone da seção pelo assunto do título.
function sectionIcon(title) {
  const t = title.toLowerCase();
  if (/reuni|tarefa/.test(t)) return Users;
  if (/cronograma|atividade|agenda|prazo/.test(t)) return CalendarDays;
  if (/neg[oó]cio|crm|proposta|lead/.test(t)) return Briefcase;
  if (/e-?mail|conversa/.test(t)) return Mail;
  if (/parecer|document/.test(t)) return FileText;
  return ListChecks;
}

const looksLikePerson = (s) => /^[A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ú][a-zà-ú]+)+$/.test(s);

function Card({ line, n, onLink }) {
  const it = parseItem(line);
  const go = it.href && parsePanelLink(it.href) && onLink;
  // Item sem registro e sem prazo (explicação, números de um parecer) fica lista simples: cartão só para pendência de verdade.
  if (!it.href && !it.due) return <li className="rna-plain">{n ? <b>{n}. </b> : null}{inline(line, onLink)}</li>;
  const open = () => { if (go) onLink(it.href); };
  return (
    <li
      className={`rna-card${go ? ' go' : ''}`}
      {...(go ? { role: 'link', tabIndex: 0, title: 'Abrir no painel', onClick: open, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } } : {})}
    >
      {n ? <span className="rna-num" aria-hidden="true">{n}</span> : null}
      <div className="rna-card-main">
        <span className={`rna-title${go ? ' link' : ''}`}>{inline(it.title, null)}{go && <ArrowUpRight size={13} aria-hidden="true" />}</span>
        {(it.meta.length > 0 || it.tags.length > 0) && (
          <span className="rna-meta">
            {it.meta.map((m, i) => {
              const Icon = i === 0 ? (looksLikePerson(m) ? User : Layers) : null;
              return <span key={i} className="rna-meta-item">{Icon && <Icon size={13} aria-hidden="true" />}{inline(m, onLink)}</span>;
            })}
            {it.tags.map((t, i) => <span key={`t${i}`} className="rna-tag">{t}</span>)}
          </span>
        )}
      </div>
      {it.due && <span className={`rna-due${/venc|atras/i.test(it.due) ? '' : ' ok'}`}><Clock size={13} aria-hidden="true" />{it.due}</span>}
      {go && <ChevronRight size={16} className="rna-chev" aria-hidden="true" />}
    </li>
  );
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
    if (HEADING.test(l)) { flush(); blocks.push({ t: 'h', text: l.replace(HEADING, '').replace(/\*\*/g, '') }); continue; }
    const type = BULLET.test(l) ? 'ul' : NUMBER.test(l) ? 'ol' : 'p';
    if (!cur || cur.t !== type) { flush(); cur = { t: type, items: [] }; }
    cur.items.push(type === 'ul' ? l.replace(BULLET, '') : type === 'ol' ? l.replace(NUMBER, '') : l);
  }
  flush();
  // Resposta "de relatório" (com seções ou cartões): o 1º parágrafo vira o resumo em destaque.
  const structured = blocks.some((b) => b.t === 'h' || b.t === 'ul' || b.t === 'ol');
  const summaryIdx = structured && blocks[0] && blocks[0].t === 'p' ? 0 : -1;
  return (
    <div className="rna">
      {blocks.map((b, i) => {
        if (i === summaryIdx) return <div key={i} className="rna-sum"><Info size={18} aria-hidden="true" /><p>{b.items.map((it, k) => <React.Fragment key={k}>{k > 0 && <br />}{inline(it, onLink)}</React.Fragment>)}</p></div>;
        if (b.t === 'h') { const Icon = sectionIcon(b.text); return <div key={i} className="rna-sec"><span className="rna-sec-ico"><Icon size={16} aria-hidden="true" /></span><h4>{decorate(b.text, `h${i}`)}</h4></div>; }
        if (b.t === 'ul' || b.t === 'ol') return <ul key={i} className="rna-list">{b.items.map((it, k) => <Card key={k} line={it} n={b.t === 'ol' ? k + 1 : 0} onLink={onLink} />)}</ul>;
        return <p key={i}>{b.items.map((it, k) => <React.Fragment key={k}>{k > 0 && <br />}{inline(it, onLink)}</React.Fragment>)}</p>;
      })}
    </div>
  );
}

// Abre o link no painel: o App.jsx escuta `pt:open-link` e leva à empresa, atividade, reunião, tarefa ou negócio.
export function openPanelLink(href) {
  window.dispatchEvent(new CustomEvent('pt:open-link', { detail: { href } }));
}
