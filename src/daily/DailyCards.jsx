import React, { useEffect, useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { apiGet } from '../lib/api.js';

const CSS = `
  .dcs { margin:0 0 22px; font-family:'Inter', sans-serif; text-align:left; }
  .dcs-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
  .dcs-title { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--text-2); background:none; border:none; padding:6px 0; cursor:pointer; font-family:inherit; min-height:36px; white-space:nowrap; }
  .dcs-title small { white-space:normal; text-transform:none; letter-spacing:0; font-weight:600; color:var(--text-5); font-size:12px; }
  .dcs-conf { display:inline-flex; align-items:center; gap:6px; font-family:inherit; font-size:12px; font-weight:700; color:var(--text-3); background:transparent; border:1px solid var(--border-2); border-radius:999px; padding:7px 12px; cursor:pointer; min-height:34px; }
  .dcs-conf:hover { background:var(--bg-3); }
  .dcs-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px; }
  .dcs-card { border:1px solid var(--border-1); background:var(--bg-2); border-radius:14px; padding:14px 15px; display:flex; flex-direction:column; gap:8px; min-width:0; }
  .dcs-kicker { font-size:10.5px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--ui-accent-text); display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .dcs-sub { font-size:13.5px; font-weight:700; color:var(--text-1); line-height:1.35; }
  .dcs-text { font-size:13px; line-height:1.6; color:var(--text-3); white-space:pre-line; overflow-wrap:anywhere; }
  .dcs-text.clamp { display:-webkit-box; -webkit-line-clamp:5; -webkit-box-orient:vertical; overflow:hidden; }
  .dcs-more { align-self:flex-start; background:none; border:none; color:var(--text-4); font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; padding:4px 0; min-height:30px; display:inline-flex; align-items:center; gap:4px; }
  .dcs-more:hover { color:var(--text-1); }
  .dcs-foot { font-size:11px; line-height:1.45; color:var(--text-5); white-space:pre-line; }
  .dcs-muted { font-size:12.5px; color:var(--text-5); line-height:1.5; }
  .dcs-empty { border:1px dashed var(--border-3); border-radius:14px; padding:16px; display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; background:var(--bg-2); }
  .dcs-empty b { font-size:14px; color:var(--text-1); }
  .dcs-btn { font-family:inherit; font-size:13px; font-weight:700; border-radius:10px; padding:10px 16px; cursor:pointer; border:1px solid #F5C400; background:#F5C400; color:#111; min-height:40px; }
  .dcs-btn:hover { background:#ffd21f; }
`;

function Expandable({ text, lines = 5 }) {
  const [open, setOpen] = useState(false);
  const long = String(text).length > 260;
  return (
    <>
      <div className={`dcs-text${long && !open ? ' clamp' : ''}`}>{text}</div>
      {long && <button type="button" className="dcs-more" onClick={() => setOpen(!open)}>{open ? 'Mostrar menos' : 'Ler mais'}</button>}
    </>
  );
}

function Liturgy({ d }) {
  const [more, setMore] = useState(false);
  return (
    <>
      <div className="dcs-sub">{d.title}{d.color ? ` · cor ${d.color.toLowerCase()}` : ''}</div>
      <div className="dcs-text" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{d.gospel.reference} — {d.gospel.title}</div>
      <Expandable text={d.gospel.text} />
      {(d.firstReading || d.psalm || d.secondReading) && (
        <>
          <button type="button" className="dcs-more" onClick={() => setMore(!more)}>{more ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Outras leituras</button>
          {more && [d.firstReading, d.psalm, d.secondReading].filter(Boolean).map((r, i) => (
            <div key={i}>
              <div className="dcs-text" style={{ fontWeight: 700, color: 'var(--text-2)' }}>{r.reference}{r.refrain ? ` — ${r.refrain}` : ''}</div>
              <div className="dcs-text">{r.text}</div>
            </div>
          ))}
        </>
      )}
      <div className="dcs-foot">Fonte: Liturgia Diária (API comunitária, não oficial da CNBB). Confira na sua liturgia antes de citar.</div>
    </>
  );
}

function Body({ card, onConfigure }) {
  if (card.needsBirth) return <><div className="dcs-muted">Falta a sua data de nascimento para este conteúdo.</div><button type="button" className="dcs-more" onClick={onConfigure}>Informar agora</button></>;
  if (!card.ok) return <div className="dcs-muted">{card.error || 'Indisponível agora.'}</div>;
  const d = card.data;
  if (card.kind === 'liturgy') return <Liturgy d={d} />;
  if (card.kind === 'votd' || card.kind === 'wisdom') return (<><div className="dcs-sub">{d.reference}</div><div className="dcs-text">“{d.text}”</div><div className="dcs-foot">{d.credit}</div></>);
  if (card.kind === 'horoscope') return (<><div className="dcs-sub">{d.sign}</div><Expandable text={d.text} /><div className="dcs-foot">Entretenimento. Fonte: AstroWay.</div></>);
  if (card.kind === 'chinese') return (<><div className="dcs-sub">{d.animal} de {d.element} · ano {d.year}</div><div className="dcs-text">{d.text}</div><div className="dcs-foot">Texto gerado por IA, para entretenimento.</div></>);
  if (card.kind === 'inspiration') return (<><div className="dcs-text" style={{ fontSize: 14, color: 'var(--text-2)' }}>{d.text}</div><div className="dcs-foot">Escrito pela RENATA. Não é citação de ninguém.</div></>);
  return null;
}

export default function DailyCards({ onConfigure, reloadKey }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('pt-daily-open') !== '0'; } catch { return true; } });

  useEffect(() => {
    let alive = true;
    apiGet('/api/daily').then((r) => { if (alive) { setData(r); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [reloadKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem('pt-daily-open', next ? '1' : '0'); } catch { /* sem storage */ }
  }

  if (failed || !data) return null;
  if (data.enabled === false) return null;
  const dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' });

  return (
    <section className="dcs" aria-label="Meu dia">
      <style>{CSS}</style>
      {data.cards.length === 0 ? (
        <div className="dcs-empty">
          <div><b>Monte o seu dia</b><div className="dcs-muted">Evangelho, versículo, horóscopo, inspiração… escolha o que você quer ver aqui quando entrar.</div></div>
          <button type="button" className="dcs-btn" onClick={onConfigure}>Escolher agora</button>
        </div>
      ) : (
        <>
          <div className="dcs-head">
            <button type="button" className="dcs-title" aria-expanded={open} onClick={toggle}>
              {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} <Sparkles size={14} /> Meu dia <small>{dateLabel}</small>
            </button>
            <button type="button" className="dcs-conf" onClick={onConfigure}><Settings2 size={13} /> Personalizar</button>
          </div>
          {open && (
            <div className="dcs-grid">
              {data.cards.map((c) => (
                <article key={c.kind} className="dcs-card">
                  <div className="dcs-kicker">{c.title}</div>
                  <Body card={c} onConfigure={onConfigure} />
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
