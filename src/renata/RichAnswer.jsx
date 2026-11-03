// Resposta da RENATA formatada — o formato ÚNICO das três conversas (02/11/2026; Rafael: "em cada aba a RENATA tem um formato de
// falar, de exibir… isso já não era para estar padronizado?"): abertura curta + blocos tipados (atenção, fatos, impacto,
// recomendação, linha do tempo), herdados da RENATA do projeto, com cartões clicáveis e selo de prazo dentro. Nada de HTML
// vindo do modelo: tudo vira nó React. Entende "### título", listas "- " e "1. ", **negrito** e [texto](/caminho) só para caminhos
// do próprio painel (shared/panelLinks.js). Item de lista vira cartão: título (link), linha de detalhes e selo "Venceu dd/mm" em
// vermelho; clicar no cartão dispara `pt:open-link` (App.jsx abre o registro). Usado no painel lateral e na tela inicial.
import React from 'react';
import { ArrowUpRight, ChevronRight, Clock, CalendarDays, Users, Briefcase, Mail, ListChecks, User, Layers, FileText, AlertTriangle, TrendingUp, Lightbulb, History } from 'lucide-react';
import { parsePanelLink } from '../../shared/panelLinks.js';
import { parseItem, blockType } from './richAnswerParse.js';
export { blockType };

export const RICH_ANSWER_CSS = `
.rna { display: flex; flex-direction: column; gap: var(--sp-3); }
.rna p { margin: 0; }
.rna-intro { font-size: var(--fs-md); line-height: 1.55; color: var(--text-1); }
.rna-blk { border-radius: 14px; padding: 12px 14px; background: var(--bg-2); border: 1px solid var(--border-1); display: flex; flex-direction: column; gap: var(--sp-2); }
.rna-blk-head { display: flex; align-items: center; gap: 10px; }
.rna-blk-ico { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; flex: none; }
.rna-blk h4 { margin: 0; font-size: 13.5px; font-weight: 800; color: var(--text-1); line-height: 1.35; }
.rna-blk-body { display: flex; flex-direction: column; gap: var(--sp-2); font-size: 13.5px; line-height: 1.6; color: var(--text-2); }
.rna-blk-warning { border-color: color-mix(in srgb, var(--ui-danger, #e5484d) 35%, transparent); }
.rna-blk-warning .rna-blk-ico { background: color-mix(in srgb, var(--ui-danger, #e5484d) 13%, transparent); color: var(--ui-danger, #d93636); }
.rna-blk-facts .rna-blk-ico { background: color-mix(in srgb, #5B8DEF 15%, transparent); color: #3d6fd6; }
.rna-blk-impact .rna-blk-ico { background: color-mix(in srgb, #3ecf6e 15%, transparent); color: #1f9d50; }
.rna-blk-recommendation { border-color: color-mix(in srgb, #9b6dff 30%, transparent); }
.rna-blk-recommendation .rna-blk-ico { background: color-mix(in srgb, #9b6dff 15%, transparent); color: #7a4fe0; }
.rna-blk-timeline .rna-blk-ico { background: var(--bg-3); color: var(--text-4); }
.rna-tl { margin: 0; padding: 0 0 0 14px; list-style: none; border-left: 2px solid var(--border-2); display: flex; flex-direction: column; gap: 10px; }
.rna-tl li { position: relative; }
.rna-tl li::before { content: ''; position: absolute; left: -19px; top: 5px; width: 8px; height: 8px; border-radius: 50%; background: var(--ui-accent, #F5C400); }
.rna-tl b { display: block; font-size: var(--fs-xs); color: var(--text-1); }
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
.rna-meta-item + .rna-meta-item::before { content: '·'; color: var(--text-5); margin-right: 4px; font-weight: 700; }
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

const TYPE_ICON = { warning: AlertTriangle, impact: TrendingUp, recommendation: Lightbulb, timeline: History };
function blockIcon(type, title) {
  if (TYPE_ICON[type]) return TYPE_ICON[type];
  const t = String(title || '').toLowerCase();
  if (/reuni|tarefa/.test(t)) return Users;
  if (/cronograma|atividade|agenda|prazo/.test(t)) return CalendarDays;
  if (/neg[oó]cio|crm|proposta|lead/.test(t)) return Briefcase;
  if (/e-?mail|conversa/.test(t)) return Mail;
  if (/parecer|document|fato/.test(t)) return FileText;
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


// Bloco tipado — o MESMO desenho nas três conversas da RENATA (painel lateral, tela inicial e RENATA do projeto).
export function AnswerBlock({ type = 'facts', title, children }) {
  const Icon = blockIcon(type, title);
  return (
    <section className={`rna-blk rna-blk-${type}`}>
      {title && <div className="rna-blk-head"><span className="rna-blk-ico"><Icon size={15} aria-hidden="true" /></span><h4>{decorate(title, 'bt')}</h4></div>}
      <div className="rna-blk-body">{children}</div>
    </section>
  );
}

// Itens de um bloco: cartão para pendência (link ou prazo), lista simples para explicação, linha do tempo no bloco "timeline".
export function AnswerItems({ items, numbered = false, type, onLink }) {
  if (type === 'timeline') {
    return <ul className="rna-tl">{items.map((it, k) => { const cut = it.indexOf(' — '); return <li key={k}>{cut > -1 && <b>{inline(it.slice(0, cut), onLink)}</b>}{inline(cut > -1 ? it.slice(cut + 3) : it, onLink)}</li>; })}</ul>;
  }
  return <ul className="rna-list">{items.map((it, k) => <Card key={k} line={it} n={numbered ? k + 1 : 0} onLink={onLink} />)}</ul>;
}

export function AnswerText({ text, onLink }) {
  return <p>{String(text || '').split('\n').filter((l) => l.trim()).map((l, k) => <React.Fragment key={k}>{k > 0 && <br />}{inline(l, onLink)}</React.Fragment>)}</p>;
}

const BULLET = /^\s*[-•*]\s+/;
const NUMBER = /^\s*\d{1,2}[.)]\s+/;
const HEADING = /^\s*#{2,4}\s+/;

// Texto da RENATA (markdown simples) → abertura + blocos tipados. "### título" abre um bloco; o que vem antes do 1º título é a abertura.
export default function RichAnswer({ text, onLink }) {
  const lines = String(text || '').split('\n');
  const intro = [];
  const sections = [];
  let sec = null; let cur = null;
  const target = () => (sec ? sec.parts : intro);
  const flush = () => { if (cur) target().push(cur); cur = null; };
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, '');
    if (!l.trim()) { flush(); continue; }
    if (HEADING.test(l)) { flush(); const title = l.replace(HEADING, '').replace(/\*\*/g, ''); sec = { title, type: blockType(title), parts: [] }; sections.push(sec); continue; }
    const t = BULLET.test(l) ? 'ul' : NUMBER.test(l) ? 'ol' : 'p';
    if (!cur || cur.t !== t) { flush(); cur = { t, items: [] }; }
    cur.items.push(t === 'ul' ? l.replace(BULLET, '') : t === 'ol' ? l.replace(NUMBER, '') : l);
  }
  flush();
  const renderParts = (parts, type) => parts.map((b, i) => (b.t === 'p'
    ? <AnswerText key={i} text={b.items.join('\n')} onLink={onLink} />
    : <AnswerItems key={i} items={b.items} numbered={b.t === 'ol'} type={type} onLink={onLink} />));
  // Avisos primeiro (como na RENATA do projeto: "ponto de atenção" nunca fica perdido no meio) e recomendação/próximos passos por último.
  const rank = (x) => (x.type === 'warning' ? 0 : x.type === 'recommendation' ? 2 : 1);
  const ordered = sections.map((x, i) => ({ x, i })).sort((p, q) => rank(p.x) - rank(q.x) || p.i - q.i).map((o) => o.x);
  return (
    <div className="rna">
      {intro.length > 0 && <div className="rna-intro">{renderParts(intro)}</div>}
      {ordered.map((x, i) => <AnswerBlock key={i} type={x.type} title={x.title}>{renderParts(x.parts, x.type)}</AnswerBlock>)}
    </div>
  );
}

// Abre o link no painel: o App.jsx escuta `pt:open-link` e leva à empresa, atividade, reunião, tarefa ou negócio.
export function openPanelLink(href) {
  window.dispatchEvent(new CustomEvent('pt:open-link', { detail: { href } }));
}
