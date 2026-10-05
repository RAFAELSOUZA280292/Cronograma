import React, { useEffect, useState } from 'react';
import { Sparkles, Settings2, X, ChevronRight } from 'lucide-react';
import { apiGet } from '../lib/api.js';

const CSS = `
  .dcs { width:min(680px, 100%); margin:0 0 18px; font-family:'Inter', sans-serif; text-align:left; box-sizing:border-box; }
  .dcs-card { border:1px solid var(--border-1); background:var(--bg-2); border-radius:16px; padding:14px 16px 12px; display:flex; flex-direction:column; gap:10px; min-width:0; }
  .dcs-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .dcs-kicker { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:800; letter-spacing:.07em; text-transform:uppercase; color:var(--ui-accent-text); }
  .dcs-conf { display:inline-flex; align-items:center; gap:6px; font-family:inherit; font-size:12px; font-weight:700; color:var(--text-4); background:transparent; border:1px solid var(--border-2); border-radius:999px; padding:6px 11px; cursor:pointer; min-height:32px; }
  .dcs-conf:hover { background:var(--bg-3); color:var(--text-1); }
  .dcs-chips { display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
  .dcs-chips::-webkit-scrollbar { display:none; }
  .dcs-chip { flex-shrink:0; font-family:inherit; font-size:12px; font-weight:700; color:var(--text-4); background:var(--bg-3); border:1px solid var(--border-2); border-radius:999px; padding:6px 12px; cursor:pointer; min-height:32px; white-space:nowrap; }
  .dcs-chip[aria-pressed="true"] { color:#111; background:#F5C400; border-color:#F5C400; }
  .dcs-sub { font-size:14.5px; font-weight:800; color:var(--text-1); line-height:1.35; }
  .dcs-text { font-size:13.5px; line-height:1.6; color:var(--text-3); white-space:pre-line; overflow-wrap:anywhere; }
  .dcs-text.clamp { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .dcs-text.big { font-size:14.5px; color:var(--text-2); }
  .dcs-more { align-self:flex-start; display:inline-flex; align-items:center; gap:4px; background:none; border:none; font-family:inherit; font-size:12.5px; font-weight:800; color:var(--text-1); cursor:pointer; padding:4px 0; min-height:32px; }
  .dcs-more:hover { text-decoration:underline; }
  .dcs-foot { font-size:11px; line-height:1.45; color:var(--text-5); white-space:pre-line; }
  .dcs-muted { font-size:12.5px; color:var(--text-5); line-height:1.5; }
  .dcs-empty { border:1px dashed var(--border-3); border-radius:16px; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; background:var(--bg-2); }
  .dcs-empty b { font-size:14px; color:var(--text-1); }
  .dcs-btn { font-family:inherit; font-size:13px; font-weight:700; border-radius:10px; padding:10px 16px; cursor:pointer; border:1px solid #F5C400; background:#F5C400; color:#111; min-height:40px; }
  .dcs-btn:hover { background:#ffd21f; }
  .dcs-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:150; display:flex; align-items:center; justify-content:center; padding:16px; }
  .dcs-modal { width:620px; max-width:100%; max-height:92vh; background:var(--bg-1); border:1px solid var(--border-2); border-radius:16px; display:flex; flex-direction:column; overflow:hidden; font-family:'Inter', sans-serif; color:var(--text-1); }
  .dcs-mhead { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:16px 18px 8px; }
  .dcs-x { background:transparent; border:none; color:var(--text-5); cursor:pointer; display:flex; padding:8px; border-radius:8px; min-width:40px; min-height:40px; align-items:center; justify-content:center; }
  .dcs-x:hover { background:var(--bg-3); color:var(--text-2); }
  .dcs-mbody { padding:4px 18px 20px; overflow-y:auto; display:flex; flex-direction:column; gap:10px; }
  .dcs-rd { border-top:1px solid var(--border-1); padding-top:10px; display:flex; flex-direction:column; gap:6px; }
`;

const SHORT = { liturgy: 'Evangelho', votd: 'Versículo', wisdom: 'Sabedoria', horoscope: 'Horóscopo', chinese: 'Chinês', inspiration: 'Inspiração' };

function Preview({ card, onConfigure }) {
  if (card.needsBirth) return <><div className="dcs-muted">Falta a sua data de nascimento para este conteúdo.</div><button type="button" className="dcs-more" onClick={onConfigure}>Informar agora <ChevronRight size={13} /></button></>;
  if (!card.ok) return <div className="dcs-muted">{card.error || 'Indisponível agora.'}</div>;
  const d = card.data;
  if (card.kind === 'liturgy') return <><div className="dcs-sub">{d.title}{d.color ? ` · cor ${d.color.toLowerCase()}` : ''}</div><div className="dcs-text clamp">{d.gospel.reference} — {d.gospel.text}</div></>;
  if (card.kind === 'votd' || card.kind === 'wisdom') return <><div className="dcs-sub">{d.reference}</div><div className="dcs-text clamp">“{d.text}”</div></>;
  if (card.kind === 'horoscope') return <><div className="dcs-sub">{d.sign}</div><div className="dcs-text clamp">{d.text}</div></>;
  if (card.kind === 'chinese') return <><div className="dcs-sub">{d.animal} de {d.element}</div><div className="dcs-text clamp">{d.text}</div></>;
  return <div className="dcs-text clamp big">{d.text}</div>;
}

function Full({ card, onConfigure }) {
  if (card.needsBirth || !card.ok) return <Preview card={card} onConfigure={onConfigure} />;
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
  return <><div className="dcs-text big">{d.text}</div><div className="dcs-foot">Escrito pela RENATA. Não é citação de ninguém.</div></>;
}

function needsMore(card) {
  if (!card.ok || !card.data) return false;
  const d = card.data;
  if (card.kind === 'liturgy') return true;
  if (card.kind === 'votd' || card.kind === 'wisdom') return true;
  return String(d.text || '').length > 160;
}

export default function DailyCards({ onConfigure, reloadKey }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState(() => { try { return localStorage.getItem('pt-daily-sel') || ''; } catch { return ''; } });
  const [reading, setReading] = useState(false);

  useEffect(() => {
    let alive = true;
    apiGet('/api/daily').then((r) => { if (alive) { setData(r); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!reading) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setReading(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reading]);

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
  function pick(kind) { setSel(kind); try { localStorage.setItem('pt-daily-sel', kind); } catch { /* sem storage */ } }

  return (
    <section className="dcs" aria-label="Mensagem do dia">
      <style>{CSS}</style>
      <div className="dcs-card">
        <div className="dcs-top">
          <div className="dcs-kicker"><Sparkles size={13} /> Mensagem do dia</div>
          <button type="button" className="dcs-conf" onClick={onConfigure}><Settings2 size={13} /> Personalizar</button>
        </div>
        {data.cards.length > 1 && (
          <div className="dcs-chips" role="group" aria-label="Escolha a mensagem">
            {data.cards.map((c) => <button key={c.kind} type="button" className="dcs-chip" aria-pressed={c.kind === card.kind} onClick={() => pick(c.kind)}>{SHORT[c.kind] || c.title}</button>)}
          </div>
        )}
        <Preview card={card} onConfigure={onConfigure} />
        {needsMore(card) && <button type="button" className="dcs-more" onClick={() => setReading(true)}>Ler completo <ChevronRight size={13} /></button>}
      </div>

      {reading && (
        <div className="dcs-overlay" onClick={() => setReading(false)}>
          <div className="dcs-modal" role="dialog" aria-modal="true" aria-label={card.title} onClick={(e) => e.stopPropagation()}>
            <div className="dcs-mhead">
              <div className="dcs-kicker"><Sparkles size={13} /> {card.title}</div>
              <button type="button" className="dcs-x" aria-label="Fechar" onClick={() => setReading(false)}><X size={18} /></button>
            </div>
            <div className="dcs-mbody"><Full card={card} onConfigure={onConfigure} /></div>
          </div>
        </div>
      )}
    </section>
  );
}
