// RENATA geral (2026-10-06): o painel de conversa disponível de QUALQUER tela (botão na barra do topo e item "Falar com a RENATA" na
// busca Ctrl+K), sem estar presa a uma empresa. Responde com o que a pessoa já vê (quadro pessoal, atividades e tarefas dela, reuniões
// da semana, agenda) e com o conhecimento acumulado da organização (pareceres estudados). Para detalhes de uma empresa, abre a RENATA
// da empresa. A conversa fica no navegador (sessionStorage), por usuário; nada novo é gravado no servidor.
import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, RotateCcw, Building2 } from 'lucide-react';
import { apiPost } from '../lib/api.js';
import { Drawer } from '../ui/dialog.jsx';
import { Button } from '../ui/index.jsx';

const SUGGESTIONS = [
  'O que preciso fazer hoje?',
  'Como estão as minhas empresas?',
  'Quais reuniões e compromissos tenho esta semana?',
  'O que os pareceres dizem sobre ',
];

const CSS = `
.rnh { display: flex; flex-direction: column; gap: 12px; font-family: 'Inter', sans-serif; }
.rnh-hello { font-size: 13.5px; line-height: 1.55; color: var(--text-3); }
.rnh-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.rnh-chip { padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border-2); background: var(--bg-2); color: var(--text-2); font: inherit; font-size: 13px; cursor: pointer; text-align: left; }
.rnh-chip:hover { background: var(--bg-3); border-color: var(--border-3); }
.rnh-msg { max-width: 92%; padding: 10px 13px; border-radius: 14px; font-size: 13.5px; line-height: 1.55; overflow-wrap: anywhere; }
.rnh-msg.user { align-self: flex-end; background: var(--ui-accent, #F5C400); color: #111; border-bottom-right-radius: 4px; white-space: pre-wrap; }
.rnh-msg.bot { align-self: flex-start; background: var(--bg-2); border: 1px solid var(--border-1); color: var(--text-1); border-bottom-left-radius: 4px; }
.rnh-msg p { margin: 0 0 8px; } .rnh-msg p:last-child { margin-bottom: 0; }
.rnh-msg ul { margin: 0 0 8px; padding-left: 18px; } .rnh-msg li { margin-bottom: 3px; }
.rnh-think { align-self: flex-start; font-size: 12.5px; color: var(--text-4); padding: 6px 2px; }
.rnh-company { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px 12px; border: 1px dashed var(--border-3); border-radius: 12px; }
.rnh-company select { flex: 1 1 180px; min-width: 0; min-height: 44px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border-3); background: var(--bg-4); color: var(--text-1); font: inherit; font-size: 14px; }
.rnh-compose { display: flex; gap: 8px; align-items: flex-end; width: 100%; }
.rnh-compose textarea { flex: 1; min-width: 0; resize: none; min-height: 44px; max-height: 140px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-3); background: var(--bg-4); color: var(--text-1); font: inherit; font-size: 14px; }
.rnh-compose textarea:focus { outline: none; border-color: var(--ui-accent, #F5C400); }
.rnh-err { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(226,87,76,.4); background: var(--ui-danger-bg); font-size: 13px; color: var(--text-1); }
`;

// Formatação mínima da resposta: parágrafos, listas com "- " e **negrito** (nada de HTML vindo do modelo: tudo vira nó React).
function inline(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) => (/^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}
function Formatted({ text }) {
  const blocks = String(text || '').split(/\n{2,}/);
  return blocks.map((b, i) => {
    const lines = b.split('\n').filter((l) => l.trim());
    if (lines.length && lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
      return <ul key={i}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-•*]\s+/, ''))}</li>)}</ul>;
    }
    return <p key={i}>{lines.map((l, k) => <React.Fragment key={k}>{k > 0 && <br />}{inline(l)}</React.Fragment>)}</p>;
  });
}

const storeKey = (userId) => `renata-home:${userId || 'anon'}`;
function loadChat(userId) {
  try { const v = JSON.parse(window.sessionStorage.getItem(storeKey(userId)) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function saveChat(userId, msgs) {
  try { window.sessionStorage.setItem(storeKey(userId), JSON.stringify(msgs.slice(-40))); } catch (e) { /* ignora */ }
}

export default function RenataHome({ userId, userName, projects, initialQuestion, onClose, onOpenCompany }) {
  const [msgs, setMsgs] = useState(() => loadChat(userId));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [company, setCompany] = useState('');
  const endRef = useRef(null);
  const taRef = useRef(null);
  const sentInitial = useRef(false);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;

  useEffect(() => { saveChat(userId, msgs); if (endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  useEffect(() => { if (taRef.current) taRef.current.focus(); }, []);

  async function ask(text, base) {
    const q = String(text || '').trim();
    if (!q || busy) return;
    const history = (base || msgsRef.current).map((m) => ({ role: m.role, text: m.text }));
    const next = [...(base || msgsRef.current), { role: 'user', text: q }];
    setMsgs(next); setInput(''); setBusy(true); setError('');
    try {
      const r = await apiPost('/api/assistant/general/ask', { question: q, history });
      setMsgs([...next, { role: 'assistant', text: r.answer }]);
    } catch (e) {
      setError((e && e.message) || 'Não consegui responder agora. Tente de novo.');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (initialQuestion && !sentInitial.current) { sentInitial.current = true; ask(initialQuestion); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    const last = [...msgsRef.current].reverse().find((m) => m.role === 'user');
    if (!last) return;
    const base = msgsRef.current.slice(0, msgsRef.current.lastIndexOf(last));
    ask(last.text, base);
  }
  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input); }
  }

  const first = (userName || '').split(' ')[0];
  const footer = (
    <div className="rnh-compose">
      <textarea ref={taRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} aria-label="Pergunte algo à RENATA" placeholder="Pergunte à RENATA…" disabled={busy} />
      <Button variant="primary" icon={Send} onClick={() => ask(input)} loading={busy} disabled={!input.trim()} disabledReason="Escreva a pergunta">Perguntar</Button>
    </div>
  );

  return (
    <Drawer title="RENATA" subtitle="Assistente da PRICETAX — responde com o que você já vê e com o conhecimento da casa." onClose={onClose} footer={footer} label="RENATA, assistente da PRICETAX">
      <style>{CSS}</style>
      <div className="rnh">
        {msgs.length === 0 && (
          <>
            <div className="rnh-hello">Oi{first ? `, ${first}` : ''}! Pergunte sobre o seu dia, as suas empresas, reuniões e compromissos — ou sobre o que os pareceres da PRICETAX dizem. Para detalhes de uma empresa específica, abra a RENATA dela abaixo.</div>
            <div className="rnh-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="rnh-chip" onClick={() => (s.endsWith(' ') ? (setInput(s), taRef.current && taRef.current.focus()) : ask(s))}>{s}</button>
              ))}
            </div>
          </>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`rnh-msg ${m.role === 'user' ? 'user' : 'bot'}`}>{m.role === 'user' ? m.text : <Formatted text={m.text} />}</div>
        ))}
        {busy && <div className="rnh-think" role="status">A RENATA está pensando…</div>}
        {error && (
          <div className="rnh-err" role="alert">{error} <Button size="sm" icon={RotateCcw} onClick={retry}>Tentar de novo</Button></div>
        )}
        <div ref={endRef} />
        {(projects || []).length > 0 && (
          <div className="rnh-company">
            <Building2 size={15} aria-hidden="true" />
            <select value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Empresa para perguntar à RENATA">
              <option value="">Perguntar sobre uma empresa…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button size="sm" icon={Sparkles} onClick={() => company && onOpenCompany(company)} disabled={!company} disabledReason="Escolha uma empresa">Abrir a RENATA da empresa</Button>
          </div>
        )}
        {msgs.length > 0 && !busy && (
          <div><Button size="sm" icon={RotateCcw} onClick={() => { setMsgs([]); setError(''); }}>Nova conversa</Button></div>
        )}
      </div>
    </Drawer>
  );
}
