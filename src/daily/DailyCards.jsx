import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Cross, Lightbulb, Star, Moon, Leaf, Settings2, X, ChevronRight, Share2, Check } from 'lucide-react';
import { apiGet } from '../lib/api.js';
import { DialogOverlay } from '../ui/dialog.jsx';

const CSS = `
  .dcs { width:min(760px, 100%); margin:0 0 20px; font-family:'Inter', sans-serif; text-align:left; box-sizing:border-box; --gold:#F5C400; --gold-text:var(--ui-accent-text); }
  .dcs-greet { text-align:center; font-size:14.5px; color:var(--text-4); margin:0; line-height:1.5; }
  .dcs-rule { display:block; width:48px; height:3px; border-radius:99px; background:var(--gold); margin:12px auto 20px; }
  .dcs-card { position:relative; border:1px solid var(--border-1); background:var(--bg-2); border-radius:22px; padding:20px 22px 20px; display:flex; flex-direction:column; gap:16px; min-width:0; overflow:hidden; box-shadow:0 12px 40px rgba(0,0,0,.10); }
  .dcs-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .dcs-head { display:flex; align-items:center; gap:13px; min-width:0; }
  .dcs-badge { width:46px; height:46px; border-radius:50%; background:rgba(245,196,0,.18); color:var(--gold-text); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .dcs-kicker { font-size:13px; font-weight:800; letter-spacing:.09em; text-transform:uppercase; color:var(--gold-text); }
  .dcs-sub { font-size:14.5px; font-weight:800; color:var(--text-1); line-height:1.35; }
  .dcs-sub-h { font-size:13px; color:var(--text-4); margin-top:2px; line-height:1.4; }
  .dcs-conf { display:inline-flex; align-items:center; gap:7px; font-family:inherit; font-size:13px; font-weight:700; color:var(--text-2); background:var(--bg-1); border:1px solid var(--border-2); border-radius:999px; padding:9px 16px; cursor:pointer; min-height:40px; flex-shrink:0; }
  .dcs-conf:hover { background:var(--bg-3); color:var(--text-1); }
  .dcs-chips { display:flex; gap:8px; overflow-x:auto; padding:2px 0 4px; scrollbar-width:none; }
  .dcs-chips::-webkit-scrollbar { display:none; }
  .dcs-chip { flex-shrink:0; display:inline-flex; align-items:center; gap:8px; font-family:inherit; font-size:13.5px; font-weight:700; color:var(--text-3); background:var(--bg-3); border:1px solid transparent; border-radius:999px; padding:9px 16px; cursor:pointer; min-height:40px; white-space:nowrap; }
  .dcs-chip:hover { background:var(--bg-4); }
  .dcs-chip[aria-pressed="true"] { color:#111; background:var(--gold); box-shadow:0 4px 14px rgba(245,196,0,.35); }
  .dcs-main { display:grid; grid-template-columns:minmax(0,1fr) 250px; gap:22px; align-items:stretch; }
  .dcs-body { display:flex; flex-direction:column; gap:10px; min-width:0; }
  .dcs-title { font-size:23px; font-weight:800; color:var(--text-1); line-height:1.25; letter-spacing:-.01em; overflow-wrap:anywhere; }
  .dcs-tag { align-self:flex-start; display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:var(--ui-ok); background:rgba(62,207,110,.15); border-radius:999px; padding:5px 12px; }
  .dcs-ref { font-size:17px; font-weight:800; color:var(--gold-text); margin-top:2px; }
  .dcs-text { font-size:14px; line-height:1.65; color:var(--text-3); white-space:pre-line; overflow-wrap:anywhere; }
  .dcs-text.clamp { display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
  .dcs-text.big { font-size:15px; color:var(--text-2); }
  .dcs-quote { font-size:21px; font-weight:700; line-height:1.4; color:var(--text-1); letter-spacing:-.005em; overflow-wrap:anywhere; }
  .dcs-author { font-size:14px; font-weight:700; color:var(--gold-text); }
  .dcs-actions { display:flex; align-items:center; gap:10px; margin-top:auto; padding-top:6px; flex-wrap:wrap; }
  .dcs-read { display:inline-flex; align-items:center; gap:8px; font-family:inherit; font-size:14px; font-weight:800; color:#111; background:var(--gold); border:none; border-radius:999px; padding:11px 20px; cursor:pointer; min-height:44px; box-shadow:0 6px 18px rgba(245,196,0,.32); }
  .dcs-read:hover { background:#ffd21f; }
  .dcs-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:50%; border:1px solid var(--border-2); background:var(--bg-1); color:var(--text-3); cursor:pointer; }
  .dcs-icon-btn:hover { background:var(--bg-3); color:var(--text-1); }
  .dcs-more { align-self:flex-start; display:inline-flex; align-items:center; gap:4px; background:none; border:none; font-family:inherit; font-size:12.5px; font-weight:800; color:var(--text-1); cursor:pointer; padding:4px 0; min-height:32px; }
  .dcs-art { position:relative; border-radius:18px; min-height:210px; overflow:hidden; display:flex; align-items:center; justify-content:center; color:#8a6205; background:radial-gradient(120% 90% at 85% 15%, #fff4cf 0%, #f6dc93 38%, #e9bd54 100%); }
  .dcs-art::before { content:''; position:absolute; inset:0; background:linear-gradient(90deg, var(--bg-2) 0%, rgba(255,255,255,0) 38%); pointer-events:none; }
  .dcs-art svg { position:relative; opacity:.9; filter:drop-shadow(0 8px 14px rgba(120,80,0,.25)); }
  .dcs-art i { position:absolute; border-radius:50%; background:rgba(255,255,255,.35); }
  html:not([data-theme="light"]) .dcs-art { color:#F5C400; background:radial-gradient(120% 90% at 85% 15%, #4a3a10 0%, #2a210b 45%, #17120a 100%); }
  html:not([data-theme="light"]) .dcs-art i { background:rgba(245,196,0,.10); }
  .dcs-foot { font-size:11px; line-height:1.45; color:var(--text-5); white-space:pre-line; }
  .dcs-foot a { color:inherit; }
  .dcs-muted { font-size:13px; color:var(--text-5); line-height:1.55; }
  .dcs-empty { border:1px dashed var(--border-3); border-radius:18px; padding:16px 18px; display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; background:var(--bg-2); }
  .dcs-empty b { font-size:14px; color:var(--text-1); }
  .dcs-btn { font-family:inherit; font-size:13px; font-weight:700; border-radius:999px; padding:10px 18px; cursor:pointer; border:1px solid #F5C400; background:#F5C400; color:#111; min-height:42px; }
  .dcs-btn:hover { background:#ffd21f; }
  @media (max-width:720px) {
    .dcs-main { grid-template-columns:minmax(0,1fr); }
    .dcs-art { display:none; }
    .dcs-card { padding:16px 16px 16px; border-radius:18px; }
    .dcs-badge { width:40px; height:40px; }
    .dcs-title { font-size:20px; } .dcs-quote { font-size:19px; }
    .dcs-conf span { display:none; } .dcs-conf { padding:9px 12px; }
  }
  .dcs-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:150; display:flex; align-items:center; justify-content:center; padding:16px; }
  .dcs-modal { width:620px; max-width:100%; max-height:92vh; background:var(--bg-1); border:1px solid var(--border-2); border-radius:16px; display:flex; flex-direction:column; overflow:hidden; font-family:'Inter', sans-serif; color:var(--text-1); }
  .dcs-mhead { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:16px 18px 8px; }
  .dcs-x { background:transparent; border:none; color:var(--text-5); cursor:pointer; display:flex; padding:8px; border-radius:8px; min-width:40px; min-height:40px; align-items:center; justify-content:center; }
  .dcs-x:hover { background:var(--bg-3); color:var(--text-2); }
  .dcs-mbody { padding:4px 18px 20px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; }
  .dcs-rd { border-top:1px solid var(--border-1); padding-top:10px; display:flex; flex-direction:column; gap:6px; }

  .dcs-read:focus-visible, .dcs-icon-btn:focus-visible, .dcs-more:focus-visible, .dcs-btn:focus-visible, .dcs-chip:focus-visible, .dcs-x:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; }
  @media (max-width: 767px) { .dcs-btn, .dcs-more, .dcs-chip, .dcs-read { min-height:44px; } .dcs-x { min-width:44px; min-height:44px; } }
`;

const META = {
  liturgy: { short: 'Evangelho', icon: BookOpen, greet: 'Que a Palavra de Deus ilumine o seu dia.', sub: 'Leia, reflita e viva a Palavra no seu dia a dia.' },
  votd: { short: 'Versículo', icon: Cross, greet: 'Uma palavra para começar bem o dia.', sub: 'Um versículo para levar com você.' },
  wisdom: { short: 'Sabedoria', icon: Lightbulb, greet: 'Sabedoria para decidir bem hoje.', sub: 'Um provérbio para pensar durante o dia.' },
  horoscope: { short: 'Horóscopo', icon: Star, greet: 'O que os astros dizem sobre o seu dia.', sub: 'Previsão do seu signo, só por diversão.' },
  chinese: { short: 'Chinês', icon: Moon, greet: 'O que o seu animal diz sobre hoje.', sub: 'Horóscopo chinês, só por diversão.' },
  inspiration: { short: 'Inspiração', icon: Leaf, greet: 'Que quem veio antes inspire o seu dia.', sub: 'Uma frase do dia, sempre com a fonte.' },
};

// O que o cartão mostra, por conteúdo: título, selo, referência, texto e (para a frase) autor.
function describe(card) {
  const d = card.data;
  if (card.kind === 'liturgy') return { title: d.title, tag: d.color ? `cor ${d.color.toLowerCase()}` : '', ref: d.gospel.reference, text: d.gospel.text };
  if (card.kind === 'votd' || card.kind === 'wisdom') return { title: d.reference, text: `“${d.text}”` };
  if (card.kind === 'horoscope') return { title: d.sign, text: d.text };
  if (card.kind === 'chinese') return { title: `${d.animal} de ${d.element}`, text: d.text };
  return { quote: `“${d.text}”`, author: `— ${d.author}`, tag: '', ref: d.theme || '' };
}

function shareText(card) {
  const d = card.data;
  if (card.kind === 'liturgy') return `${d.title}\n${d.gospel.reference}\n${d.gospel.text}`;
  if (card.kind === 'votd' || card.kind === 'wisdom') return `“${d.text}”\n— ${d.reference}`;
  if (card.kind === 'inspiration') return `“${d.text}”\n— ${d.author}${d.translated ? ' (tradução livre)' : ''}`;
  return `${card.title}\n${d.text}`;
}

function Full({ card, onConfigure }) {
  if (card.needsBirth || !card.ok) return <div className="dcs-muted">{card.needsBirth ? 'Falta a sua data de nascimento para este conteúdo.' : card.error || 'Indisponível agora.'}</div>;
  const d = card.data;
  if (card.kind === 'liturgy') {
    return (
      <>
        <div className="dcs-sub">{d.title}{d.color ? ` · cor ${d.color.toLowerCase()}` : ''}</div>
        <div className="dcs-text" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{d.gospel.reference} — {d.gospel.title}</div>
        <div className="dcs-text">{d.gospel.text}</div>
        {[d.firstReading, d.psalm, d.secondReading].filter(Boolean).map((r, i) => (
          <div key={i} className="dcs-rd">
            <div className="dcs-text" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{r.reference}{r.refrain ? ` — ${r.refrain}` : ''}</div>
            <div className="dcs-text">{r.text}</div>
          </div>
        ))}
        <div className="dcs-foot">Fonte: Liturgia Diária (API comunitária, não oficial da CNBB). Confira na sua liturgia antes de citar.</div>
      </>
    );
  }
  if (card.kind === 'votd' || card.kind === 'wisdom') return <><div className="dcs-sub">{d.reference}</div><div className="dcs-text big">“{d.text}”</div><div className="dcs-foot">{d.credit}</div></>;
  if (card.kind === 'horoscope') return <><div className="dcs-sub">{d.sign}</div><div className="dcs-text">{d.text}</div><div className="dcs-foot">Entretenimento. Fonte: AstroWay.</div></>;
  if (card.kind === 'chinese') return <><div className="dcs-sub">{d.animal} de {d.element} · ano {d.year}</div><div className="dcs-text">{d.text}</div><div className="dcs-foot">Texto gerado por IA, para entretenimento.</div></>;
  return <><div className="dcs-text big">“{d.text}”</div><div className="dcs-sub">— {d.author}{d.theme ? ` · ${d.theme}` : ''}</div>{d.original && <div className="dcs-text" style={{ fontStyle: 'italic' }}>Original: “{d.original}”</div>}{d.translated && <div className="dcs-foot">Tradução livre para o português.</div>}<div className="dcs-foot">Fonte: {d.source}{d.sourceUrl ? <> · <a href={d.sourceUrl} target="_blank" rel="noreferrer noopener">abrir</a></> : null}</div></>;
}

function needsMore(card) {
  if (!card.ok || !card.data) return false;
  if (card.kind === 'liturgy' || card.kind === 'inspiration' || card.kind === 'votd' || card.kind === 'wisdom') return true;
  return String(card.data.text || '').length > 200;
}

function Art({ kind }) {
  const Icon = (META[kind] || META.liturgy).icon;
  return (
    <div className="dcs-art" aria-hidden="true">
      <i style={{ width: 120, height: 120, right: -30, top: -34 }} />
      <i style={{ width: 70, height: 70, right: 40, bottom: 22 }} />
      <Icon size={112} strokeWidth={1.25} />
    </div>
  );
}

export default function DailyCards({ onConfigure, reloadKey }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState(() => { try { return localStorage.getItem('pt-daily-sel') || ''; } catch { return ''; } });
  const [reading, setReading] = useState(false);
  const [shared, setShared] = useState(false);
  const chipsRef = useRef(null);

  useEffect(() => {
    let alive = true;
    apiGet('/api/daily').then((r) => { if (alive) { setData(r); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [reloadKey]);

  const activeKind = data && data.cards && data.cards.length ? ((data.cards.find((c) => c.kind === sel) || data.cards[0]).kind) : '';
  useEffect(() => {
    const box = chipsRef.current;
    const el = box && box.querySelector('.dcs-chip[aria-pressed="true"]');
    if (box && el) box.scrollLeft = Math.max(0, el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2);
  }, [activeKind, data]);

  if (failed || !data || data.enabled === false) return null;

  if (data.cards.length === 0) {
    return (
      <section className="dcs" aria-label="Mensagem do dia">
        <style>{CSS}</style>
        <div className="dcs-empty">
          <div><b>Monte o seu dia</b><div className="dcs-muted">Evangelho, versículo, horóscopo, inspiração… escolha o que você quer ver aqui quando entrar.</div></div>
          <button type="button" className="dcs-btn" onClick={onConfigure}>Escolher agora</button>
        </div>
      </section>
    );
  }

  const card = data.cards.find((c) => c.kind === sel) || data.cards[0];
  const meta = META[card.kind] || META.liturgy;
  const HeadIcon = meta.icon;
  const info = card.ok && card.data ? describe(card) : null;
  function pick(kind) { setSel(kind); setShared(false); try { localStorage.setItem('pt-daily-sel', kind); } catch { /* sem storage */ } }

  async function share() {
    const text = shareText(card);
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      setShared(true); setTimeout(() => setShared(false), 2500);
    } catch { /* cancelou o compartilhamento ou sem permissão */ }
  }

  return (
    <section className="dcs" aria-label="Mensagem do dia">
      <style>{CSS}</style>
      <p className="dcs-greet">{meta.greet}</p>
      <span className="dcs-rule" aria-hidden="true" />
      <div className="dcs-card">
        <div className="dcs-top">
          <div className="dcs-head">
            <div className="dcs-badge"><HeadIcon size={22} /></div>
            <div style={{ minWidth: 0 }}>
              <div className="dcs-kicker">Mensagem do dia</div>
              <div className="dcs-sub-h">{meta.sub}</div>
            </div>
          </div>
          <button type="button" className="dcs-conf" onClick={onConfigure}><Settings2 size={15} /> <span>Personalizar</span></button>
        </div>

        {data.cards.length > 1 && (
          <div className="dcs-chips" role="group" aria-label="Escolha a mensagem" ref={chipsRef}>
            {data.cards.map((c) => {
              const Icon = (META[c.kind] || META.liturgy).icon;
              return <button key={c.kind} type="button" className="dcs-chip" aria-pressed={c.kind === card.kind} onClick={() => pick(c.kind)}><Icon size={16} />{(META[c.kind] || {}).short || c.title}</button>;
            })}
          </div>
        )}

        <div className="dcs-main">
          <div className="dcs-body">
            {card.needsBirth && <><div className="dcs-muted">Falta a sua data de nascimento para este conteúdo.</div><button type="button" className="dcs-more" onClick={onConfigure}>Informar agora <ChevronRight size={13} /></button></>}
            {!card.ok && !card.needsBirth && <div className="dcs-muted">{card.error || 'Indisponível agora.'}</div>}
            {info && (
              <>
                {info.quote ? <div className="dcs-quote">{info.quote}</div> : <div className="dcs-title">{info.title}</div>}
                {info.quote && <div className="dcs-author">{info.author}{info.ref ? ` · ${info.ref}` : ''}</div>}
                {info.tag && <span className="dcs-tag"><Leaf size={13} />{info.tag}</span>}
                {!info.quote && info.ref && <div className="dcs-ref">{info.ref}</div>}
                {info.text && <div className={`dcs-text clamp${card.kind === 'votd' || card.kind === 'wisdom' ? ' big' : ''}`}>{info.text}</div>}
                <div className="dcs-actions">
                  {needsMore(card) && <button type="button" className="dcs-read" onClick={() => setReading(true)}>Ler completo <ChevronRight size={16} /></button>}
                  <button type="button" className="dcs-icon-btn" aria-label={shared ? 'Copiado' : 'Compartilhar'} title={shared ? 'Copiado' : 'Compartilhar'} onClick={share}>{shared ? <Check size={18} /> : <Share2 size={18} />}</button>
                </div>
              </>
            )}
          </div>
          <Art kind={card.kind} />
        </div>
      </div>

      {reading && (
        <DialogOverlay className="dcs-overlay" onClose={() => setReading(false)} label={card.title}>
          <div className="dcs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dcs-mhead">
              <div className="dcs-kicker" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><HeadIcon size={15} /> {card.title}</div>
              <button type="button" className="dcs-x" aria-label="Fechar" onClick={() => setReading(false)}><X size={18} /></button>
            </div>
            <div className="dcs-mbody"><Full card={card} onConfigure={onConfigure} /></div>
          </div>
        </DialogOverlay>
      )}
    </section>
  );
}
