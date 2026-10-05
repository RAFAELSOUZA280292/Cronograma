import React from 'react';

export const CARD_INFO = {
  liturgy: { title: 'Evangelho do dia', desc: 'Liturgia católica: evangelho, primeira leitura e salmo.' },
  votd: { title: 'Versículo do dia', desc: 'Um versículo da Bíblia em português.' },
  wisdom: { title: 'Sabedoria do dia', desc: 'Um provérbio bíblico por dia.' },
  horoscope: { title: 'Horóscopo', desc: 'A previsão do seu signo. Entretenimento.', birth: true },
  chinese: { title: 'Horóscopo chinês', desc: 'Seu animal e o texto do dia, gerado por IA. Entretenimento.', birth: true },
  inspiration: { title: 'Inspiração', desc: 'Uma reflexão curta, escrita pela RENATA, sem frases de terceiros.' },
};

export const DAILY_CSS = `
  .dpf { font-family:'Inter', sans-serif; display:flex; flex-direction:column; gap:10px; }
  .dpf-row { display:flex; align-items:flex-start; gap:11px; border:1px solid var(--border-2); border-radius:12px; padding:12px 13px; background:var(--bg-2); cursor:pointer; min-height:44px; }
  .dpf-row.on { border-color:#F5C400; background:rgba(245,196,0,.08); }
  .dpf-row input { margin:3px 0 0; width:18px; height:18px; flex-shrink:0; accent-color:#F5C400; }
  .dpf-t { font-size:13.5px; font-weight:700; color:var(--text-1); }
  .dpf-d { font-size:12px; line-height:1.45; color:var(--text-4); margin-top:2px; }
  .dpf-birth { border:1px dashed var(--border-3); border-radius:12px; padding:12px 13px; }
  .dpf-birth label { display:block; font-size:12px; font-weight:700; color:var(--text-2); margin-bottom:6px; }
  .dpf-birth input { width:100%; box-sizing:border-box; }
  .dpf-hint { font-size:11.5px; line-height:1.45; color:var(--text-5); margin-top:6px; }
  .dpf-sign { font-size:12.5px; color:var(--text-2); margin-top:8px; font-weight:600; }
  .dpf-sw { display:flex; align-items:center; gap:10px; font-size:13px; font-weight:700; color:var(--text-1); cursor:pointer; min-height:36px; }
  .dpf-sw input { width:18px; height:18px; accent-color:#F5C400; }
`;

export default function DailyPrefs({ value, onChange, summary }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const toggle = (k) => set({ cards: value.cards.includes(k) ? value.cards.filter((c) => c !== k) : [...value.cards, k] });
  const needsBirth = value.cards.some((c) => CARD_INFO[c] && CARD_INFO[c].birth);
  return (
    <div className="dpf">
      <style>{DAILY_CSS}</style>
      <label className="dpf-sw">
        <input type="checkbox" checked={value.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Quero ver o conteúdo do dia na minha tela inicial
      </label>
      {value.enabled && (
        <>
          {Object.keys(CARD_INFO).map((k) => (
            <label key={k} className={`dpf-row${value.cards.includes(k) ? ' on' : ''}`}>
              <input type="checkbox" checked={value.cards.includes(k)} onChange={() => toggle(k)} />
              <div>
                <div className="dpf-t">{CARD_INFO[k].title}</div>
                <div className="dpf-d">{CARD_INFO[k].desc}</div>
              </div>
            </label>
          ))}
          {needsBirth && (
            <div className="dpf-birth">
              <label htmlFor="dpf-birth">Sua data de nascimento</label>
              <input id="dpf-birth" type="date" value={value.birthDate || ''} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ birthDate: e.target.value })} />
              <div className="dpf-hint">Só você vê. Serve apenas para descobrir o seu signo e o seu animal chinês.</div>
              {summary && (summary.westernSign || summary.chineseSign) && (
                <div className="dpf-sign">{[summary.westernSign && `Signo: ${summary.westernSign}`, summary.chineseSign && `Animal: ${summary.chineseSign}`].filter(Boolean).join(' · ')}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
