// RENATA operacional (§101): o painel de conversa disponível em qualquer tela. Você pede, ela executa pelas ferramentas do sistema (com as suas permissões),
// mostra o que fez, pede confirmação nas ações críticas/em lote e deixa tudo no registro de auditoria. A conversa fica no servidor e continua quando você
// navega para outra tela ou volta depois; o painel sabe em que módulo/registro você está.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Check, X, Undo2, ListChecks, MessageSquare, ShieldAlert, Loader2, MapPin, Trash2, RefreshCw } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api.js';
import ChatExport, { CHAT_EXPORT_CSS, CopyMessageButton } from '../assistant/ChatExport.jsx';
import { Drawer } from '../ui/dialog.jsx';
import { fromSimpleMessages } from '../assistant/chatExport.js';
import { Button } from '../ui/index.jsx';
import { notify, askConfirm } from '../ui/dialogs.jsx';
import { getScreenContext } from './screenContext.js';

const CSS = `
.rnc { display:flex; flex-direction:column; gap:var(--sp-3); font-family:'Inter', sans-serif; }
.rnc-tabs { display:flex; gap:6px; }
.rnc-tab { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border-radius:var(--r-pill); border:1px solid var(--border-2); background:transparent; color:var(--text-4); font:inherit; font-size:12.5px; font-weight:700; cursor:pointer; min-height:36px; }
.rnc-tab.on { background:var(--bg-3); color:var(--text-1); border-color:var(--border-3); }
.rnc-where { display:flex; align-items:center; gap:6px; font-size:var(--fs-xs); color:var(--text-4); background:var(--bg-2); border:1px solid var(--border-1); border-radius:var(--r-lg); padding:7px 10px; }
.rnc-focus { background:var(--bg-2); border:1px solid var(--border-1); border-radius:var(--r-lg); font-size:12.5px; color:var(--text-3); }
.rnc-focus summary { cursor:pointer; padding:8px 10px; min-height:32px; display:flex; align-items:center; gap:6px; color:var(--text-2); font-weight:500; overflow-wrap:anywhere; }
.rnc-focus summary::-webkit-details-marker { display:none; }
.rnc-focus summary::before { content:'▸'; content:'▸' / ''; color:var(--text-4); flex:none; }
.rnc-focus[open] summary::before { content:'▾'; content:'▾' / ''; }
.rnc-focus summary:focus-visible { outline:2px solid var(--ui-accent, #F5C400); outline-offset:2px; border-radius:var(--r-lg); }
.rnc-focus ul { margin:0; padding:0 12px 4px 28px; line-height:1.55; } .rnc-focus li { margin-bottom:5px; overflow-wrap:anywhere; }
.rnc-focus-note { margin:0; padding:0 12px 10px; font-size:var(--fs-xs); color:var(--text-4); }
@media (pointer:coarse) { .rnc-focus summary { min-height:44px; } }
.rnc-hello { font-size:13.5px; line-height:1.55; color:var(--text-3); }
.rnc-chips { display:flex; flex-wrap:wrap; gap:var(--sp-2); }
.rnc-chip { padding:8px 12px; border-radius:var(--r-pill); border:1px solid var(--border-2); background:var(--bg-2); color:var(--text-2); font:inherit; font-size:var(--fs-sm); cursor:pointer; min-height:36px; text-align:left; }
.rnc-chip:hover { background:var(--bg-3); border-color:var(--border-3); }
.rnc-msg { max-width:94%; padding:10px 13px; border-radius:14px; font-size:13.5px; line-height:1.55; overflow-wrap:anywhere; }
.rnc-msg.user { align-self:flex-end; background:var(--ui-accent, #F5C400); color:#111; border-bottom-right-radius:4px; white-space:pre-wrap; }
.rnc-msg.bot { align-self:flex-start; background:var(--bg-2); border:1px solid var(--border-1); color:var(--text-1); border-bottom-left-radius:4px; }
.rnc-msg p { margin:0 0 8px; } .rnc-msg p:last-child { margin-bottom:0; }
.rnc-msg ul { margin:0 0 8px; padding-left:18px; } .rnc-msg li { margin-bottom:3px; }
.rnc-steps { align-self:flex-start; width:94%; display:flex; flex-direction:column; gap:5px; }
.rnc-step { display:flex; align-items:flex-start; gap:var(--sp-2); font-size:12.5px; line-height:1.45; color:var(--text-3); padding:7px 10px; border-radius:var(--r-lg); background:var(--bg-2); border:1px solid var(--border-1); }
.rnc-step.ok svg.st { color:#3ecf6e; } .rnc-step.bad svg.st { color:#e2574c; } .rnc-step.warn svg.st { color:#ff9f40; }
.rnc-step .t { flex:1; min-width:0; overflow-wrap:anywhere; }
.rnc-step button { border:1px solid var(--border-3); background:transparent; color:var(--text-3); border-radius:var(--r-md); font:inherit; font-size:var(--fs-xs); padding:4px 8px; cursor:pointer; display:inline-flex; gap:var(--sp-1); align-items:center; min-height:30px; }
.rnc-step button:hover:not(:disabled) { color:var(--text-1); background:var(--bg-3); }
.rnc-bar { display:flex; gap:var(--sp-2); flex-wrap:wrap; justify-content:flex-end; }
.rnc-time { font-size:11px; color:var(--text-5); padding:0 4px; margin-top:-4px; font-variant-numeric:tabular-nums; }
.rnc-time.user { align-self:flex-end; } .rnc-time.bot { align-self:flex-start; }
.rnc-reads { align-self:flex-start; font-size:var(--fs-xs); color:var(--text-5); padding:0 4px; }
.rnc-think { align-self:flex-start; display:flex; align-items:center; gap:7px; font-size:12.5px; color:var(--text-4); padding:6px 2px; }
.rnc-spin { animation:rnc-spin 1s linear infinite; } @keyframes rnc-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .rnc-spin { animation:none; } }
.rnc-pend { border:1px solid #ff9f40; background:rgba(255,159,64,.08); border-radius:var(--r-xl); padding:12px; display:flex; flex-direction:column; gap:var(--sp-2); }
.rnc-pend h4 { margin:0; font-size:var(--fs-sm); font-weight:800; color:var(--text-1); display:flex; align-items:center; gap:6px; }
.rnc-pend .pv { font-size:var(--fs-sm); color:var(--text-2); line-height:1.5; overflow-wrap:anywhere; }
.rnc-pend dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:2px 10px; font-size:var(--fs-xs); color:var(--text-4); }
.rnc-pend dt { font-weight:700; } .rnc-pend dd { margin:0; overflow-wrap:anywhere; }
.rnc-pend .row { display:flex; gap:var(--sp-2); flex-wrap:wrap; }
.rnc-err { padding:10px 12px; border-radius:var(--r-lg); border:1px solid rgba(226,87,76,.4); background:var(--ui-danger-bg); font-size:var(--fs-sm); color:var(--text-1); }
.rnc-compose { display:flex; gap:var(--sp-2); align-items:flex-end; width:100%; }
.rnc-compose textarea { flex:1; min-width:0; resize:none; min-height:44px; max-height:140px; padding:10px 12px; border-radius:var(--r-lg); border:1px solid var(--border-3); background:var(--bg-4); color:var(--text-1); font:inherit; font-size:var(--fs-md); }
.rnc-compose textarea:focus { outline:none; border-color:var(--ui-accent, #F5C400); }
.rnc-log { display:flex; flex-direction:column; gap:var(--sp-2); }
.rnc-log-item { border:1px solid var(--border-1); background:var(--bg-2); border-radius:var(--r-lg); padding:9px 11px; font-size:12.5px; color:var(--text-3); display:flex; flex-direction:column; gap:3px; }
.rnc-log-item b { color:var(--text-1); } .rnc-log-item .meta { font-size:11.5px; color:var(--text-5); }
.rnc-badge { display:inline-block; padding:1px 8px; border-radius:var(--r-pill); font-size:11px; font-weight:800; border:1px solid var(--border-3); }
.rnc-badge.success { color:#3ecf6e; border-color:rgba(62,207,110,.5); } .rnc-badge.failed, .rnc-badge.denied { color:#e2574c; border-color:rgba(226,87,76,.5); }
.rnc-badge.pending { color:#ff9f40; border-color:rgba(255,159,64,.5); } .rnc-badge.cancelled { color:var(--text-5); } .rnc-badge.partial { color:#ff9f40; }
.rnc-log-item details summary { cursor:pointer; color:var(--text-4); min-height:28px; display:flex; align-items:center; }
.rnc-log-item pre { margin:6px 0 0; padding:8px; background:var(--bg-1); border-radius:var(--r-md); font-size:11px; overflow:auto; max-height:180px; color:var(--text-3); white-space:pre-wrap; word-break:break-word; }
`;

function inline(text) { return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) => (/^\*\*[^*]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part)); }
function Formatted({ text }) {
  return String(text || '').split(/\n{2,}/).map((b, i) => {
    const lines = b.split('\n').filter((l) => l.trim());
    if (lines.length && lines.every((l) => /^\s*[-•*]\s+/.test(l))) return <ul key={i}>{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-•*]\s+/, ''))}</li>)}</ul>;
    return <p key={i}>{lines.map((l, k) => <React.Fragment key={k}>{k > 0 && <br />}{inline(l)}</React.Fragment>)}</p>;
  });
}

const STATUS_PT = { success: 'feito', failed: 'não deu certo', denied: 'sem permissão', cancelled: 'cancelado', partial: 'parcial', pending: 'aguardando você', unknown: '' };
const BY_MODULE = {
  CRM: ['O que tenho para hoje no CRM?', 'Quais negócios estão parados ou sem próximo passo?', 'Cadastre um lead novo: '],
  Empresas: ['Quais atividades estão atrasadas neste cronograma?', 'Mostre as tarefas de reunião em aberto', 'Reorganize as atividades atrasadas e me mostre o que mudou'],
  'Gestão de Atividades': ['O que está atrasado ou vence hoje no meu quadro?', 'Crie um lembrete para '],
};
// Atalhos do registro aberto na tela: valem para "este negócio", "esta empresa" (a RENATA recebe o id e a ficha do registro). Terminando em espaço, só preenchem o campo.
const BY_ENTITY = {
  'negócio': ['Resuma este negócio e diga qual é o próximo passo', 'O que mudou neste negócio nos últimos dias?', 'Crie uma atividade de follow-up neste negócio para '],
  'empresa do CRM': ['Resuma esta empresa: contatos, negócios e o que está pendente', 'Quais negócios abertos e atividades atrasadas ela tem?', 'Registre uma nota nesta empresa: '],
  empresa: ['Quais atividades estão atrasadas neste cronograma e quem é o responsável?', 'Resuma a última reunião e as tarefas em aberto', 'Reorganize as atividades atrasadas e me mostre o que mudou'],
};
export const chipsFor = (screen) => (screen.entity && BY_ENTITY[screen.entity.type]) || BY_MODULE[screen.module] || DEFAULT_CHIPS;
const DEFAULT_CHIPS = ['O que preciso fazer hoje?', 'Mostre o que a minha equipe fez hoje e o que está atrasado', 'Crie uma tarefa para '];
// Horário das mensagens sempre em Brasília, com o GMT na etiqueta (hoje GMT-3; o próprio Intl informa se mudar).
const BR_TZ = 'America/Sao_Paulo';
function fmtBr(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('pt-BR', { timeZone: BR_TZ, day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('pt-BR', { timeZone: BR_TZ, hour: '2-digit', minute: '2-digit' });
  const gmt = (new Intl.DateTimeFormat('en-US', { timeZone: BR_TZ, timeZoneName: 'shortOffset' }).formatToParts(d).find((x) => x.type === 'timeZoneName') || {}).value || 'GMT-3';
  return `${day} ${time} · ${gmt}`;
}
// Respostas só de consulta, uma atrás da outra, viram uma linha ("Consultei 12 informações") em vez de uma linha por passo.
const mergeReads = (list) => list.reduce((acc, m) => {
  const prev = acc[acc.length - 1];
  if (m.role !== 'user' && !m.text && prev && prev.role !== 'user' && !prev.text) acc[acc.length - 1] = { ...prev, steps: [...(prev.steps || []), ...(m.steps || [])], at: m.at || prev.at };
  else acc.push(m);
  return acc;
}, []);
const fmtTs = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const keyOf = (userId) => `renata-conv:${userId || 'anon'}`;
const readConv = (userId) => { try { return window.localStorage.getItem(keyOf(userId)) || ''; } catch { return ''; } };
const writeConv = (userId, id) => { try { if (id) window.localStorage.setItem(keyOf(userId), id); else window.localStorage.removeItem(keyOf(userId)); } catch { /* sem storage */ } };

function Steps({ steps, onUndo, busyUndo }) {
  const acts = (steps || []).filter((s) => s.risk !== 'read');
  const reads = (steps || []).filter((s) => s.risk === 'read').length;
  if (!acts.length && !reads) return null;
  return (
    <>
      {reads > 0 && <div className="rnc-reads">Consultei {reads} {reads === 1 ? 'informação' : 'informações'} do sistema.</div>}
      {acts.length > 0 && (
        <div className="rnc-steps">
          {acts.map((s, i) => {
            const good = s.status === 'success'; const bad = ['failed', 'denied'].includes(s.status);
            const Icon = good ? Check : bad ? X : ShieldAlert;
            return (
              <div key={s.actionId || i} className={`rnc-step ${good ? 'ok' : bad ? 'bad' : 'warn'}`}>
                <Icon size={14} className="st" aria-hidden="true" />
                <span className="t">{s.summary || s.tool}{!good && STATUS_PT[s.status] ? ` — ${STATUS_PT[s.status]}` : ''}{s.undone ? ' (desfeito)' : ''}</span>
                {s.undoable && !s.undone && <button type="button" disabled={busyUndo === s.actionId} onClick={() => onUndo(s)} title="Desfazer esta ação"><Undo2 size={12} /> Desfazer</button>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function PendingCard({ p, onDecide, busy }) {
  const before = p.before && typeof p.before === 'object' ? Object.entries(p.before).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').slice(0, 6) : [];
  return (
    <div className="rnc-pend" role="group" aria-label="Confirmação necessária">
      <h4><ShieldAlert size={15} aria-hidden="true" /> {p.risk === 'critical' ? 'Ação crítica — preciso da sua confirmação' : 'Preciso da sua confirmação'}</h4>
      <div className="pv">{p.preview}</div>
      {before.length > 0 && (<dl aria-label="Como está agora">{before.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{String(v).slice(0, 120)}</dd></React.Fragment>)}</dl>)}
      <div className="row">
        <Button variant="primary" icon={Check} loading={busy} onClick={() => onDecide(p.actionId, 'confirm')}>Confirmar</Button>
        <Button icon={X} disabled={busy} disabledReason="Aguarde" onClick={() => onDecide(p.actionId, 'cancel')}>Cancelar</Button>
      </div>
    </div>
  );
}

function ActionLog({ isAdmin }) {
  const [rows, setRows] = useState(null); const [scope, setScope] = useState('mine'); const [err, setErr] = useState('');
  useEffect(() => { let off = false; setRows(null); apiGet(`/api/renata/actions?limit=80${scope === 'org' ? '&scope=org' : ''}`).then((r) => { if (!off) setRows(r.actions || []); }).catch((e) => { if (!off) setErr(e.message || 'Não consegui carregar o registro.'); }); return () => { off = true; }; }, [scope]);
  if (err) return <div className="rnc-err" role="alert">{err}</div>;
  if (!rows) return <div className="rnc-think" role="status"><Loader2 size={14} className="rnc-spin" /> Carregando o registro…</div>;
  return (
    <div className="rnc-log">
      {isAdmin && <div className="rnc-tabs" role="group" aria-label="Escopo do registro"><button type="button" className={`rnc-tab${scope === 'mine' ? ' on' : ''}`} onClick={() => setScope('mine')}>Meus pedidos</button><button type="button" className={`rnc-tab${scope === 'org' ? ' on' : ''}`} onClick={() => setScope('org')}>Toda a organização</button></div>}
      {rows.length === 0 && <div className="rnc-hello">Nenhuma ação registrada ainda.</div>}
      {rows.map((a) => (
        <div key={a.id} className="rnc-log-item">
          <div><span className={`rnc-badge ${a.status}`}>{STATUS_PT[a.status] || a.status}</span> <b>{a.summary || a.tool}</b></div>
          <div className="meta">{a.executor} · pedido por {a.requester_name} em {fmtTs(a.requested_at)}{a.executed_at ? ` · executado ${fmtTs(a.executed_at)}` : ''} · {a.module}</div>
          <div className="meta">Comando: “{String(a.command || '').slice(0, 160)}”</div>
          {a.authorization && a.authorization.mode && <div className="meta">Autorização: {a.authorization.mode}{a.authorization.confirmadaPor ? ` — ${a.authorization.confirmadaPor.replace(/\s*\(.*\)$/, '')} em ${fmtTs(a.authorization.confirmadaEm)}` : ''}</div>}
          {a.error && <div className="meta">Motivo: {a.error}</div>}
          {(a.before || a.after) && <details><summary>Antes e depois</summary><pre>{JSON.stringify({ antes: a.before, depois: a.after }, null, 1).slice(0, 2500)}</pre></details>}
        </div>
      ))}
    </div>
  );
}

// O que a RENATA lê do registro aberto (mesma ficha que o servidor envia a ela): a pessoa confere antes de pedir.
function FocusCard({ entity }) {
  const [card, setCard] = useState(null);
  const type = entity && entity.type; const id = entity && entity.id;
  useEffect(() => {
    let off = false; setCard(null);
    if (!type || !id) return undefined;
    apiGet(`/api/renata/context-card?${new URLSearchParams({ type, id })}`).then((r) => { if (!off) setCard(r.card || null); }).catch(() => {});
    return () => { off = true; };
  }, [type, id]);
  if (!card) return null;
  return (
    <details className="rnc-focus">
      <summary>Em foco: {card.type} · {card.title}</summary>
      <ul>{card.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p className="rnc-focus-note">É isso que a RENATA lê do registro aberto, com as suas permissões.</p>
    </details>
  );
}

export default function RenataChat({ userId, userName, isAdmin, initialQuestion, onClose }) {
  const [tab, setTab] = useState('chat');
  const [convId, setConvId] = useState(() => readConv(userId));
  const [msgs, setMsgs] = useState([]);
  const [pending, setPending] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyUndo, setBusyUndo] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!readConv(userId));
  const endRef = useRef(null); const taRef = useRef(null); const sentInitial = useRef(false);
  const screen = getScreenContext();

  const apply = useCallback((r, userText) => {
    if (r.conversationId) { setConvId(r.conversationId); writeConv(userId, r.conversationId); }
    setMsgs((m) => [...m, ...(r.reply || (r.steps && r.steps.length) ? [{ role: 'assistant', text: r.reply || '', steps: r.steps || [], at: r.at || new Date().toISOString() }] : [])]);
    setPending(r.pending || []);
    if (userText === undefined && r.executed && r.executed.length && !(r.reply)) setMsgs((m) => [...m, { role: 'assistant', text: '', steps: r.executed.map((e) => ({ actionId: e.actionId, tool: '', risk: 'write', status: e.ok ? 'success' : e.decision === 'cancel' ? 'cancelled' : 'failed', summary: e.summary, undoable: e.undoable })) }]);
  }, [userId]);

  useEffect(() => {
    if (!convId || loaded) return;
    apiGet(`/api/renata/conversations/${convId}`).then((r) => { setMsgs(r.messages || []); setPending(r.pending || []); }).catch(() => { writeConv(userId, ''); setConvId(''); }).finally(() => setLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: 'end' }); }, [msgs, pending, busy, tab]);
  useEffect(() => { if (taRef.current) taRef.current.focus(); }, [tab]);

  async function send(text) {
    const q = String(text || '').trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: q, at: new Date().toISOString() }]); setInput(''); setBusy(true); setError(''); setPending([]);
    try { apply(await apiPost('/api/renata/chat', { message: q, conversationId: convId || undefined, context: getScreenContext() }), q); }
    catch (e) { setError((e && e.message) || 'A RENATA não conseguiu agora. Tente de novo.'); }
    finally { setBusy(false); }
  }
  async function decide(actionId, decision) {
    setBusy(true); setError('');
    try {
      const r = await apiPost(`/api/renata/conversations/${convId}/decide`, { decisions: [{ actionId, decision }] });
      const done = new Map((r.executed || []).map((e) => [e.actionId, e]));
      setMsgs((m) => m.map((x) => (x.steps ? { ...x, steps: x.steps.map((s) => { const e = done.get(s.actionId); return e ? { ...s, status: e.ok ? 'success' : e.decision === 'cancel' ? 'cancelled' : 'failed', summary: e.summary || s.summary, undoable: !!e.undoable } : s; }) } : x)));
      if (r.waiting) setPending((p) => p.filter((x) => x.actionId !== actionId)); else apply(r);
      if (decision === 'confirm' && r.executed && r.executed[0] && !r.executed[0].ok) setError(r.executed[0].summary || 'Não deu certo.');
    } catch (e) { setError((e && e.message) || 'Não consegui registrar a sua decisão.'); }
    finally { setBusy(false); }
  }
  async function undo(step) {
    setBusyUndo(step.actionId);
    try {
      await apiPost(`/api/renata/actions/${step.actionId}/undo`, {});
      setMsgs((m) => m.map((x) => (x.steps ? { ...x, steps: x.steps.map((s) => (s.actionId === step.actionId ? { ...s, undone: true, undoable: false } : s)) } : x)));
      notify('Desfeito. O registro guarda as duas ações.', { tone: 'success' });
    } catch (e) { notify((e && e.message) || 'Não consegui desfazer.', { tone: 'error' }); }
    finally { setBusyUndo(''); }
  }
  async function refresh() {
    if (busy || refreshing) return;
    setError('');
    if (!convId) { notify('Nada para atualizar: a conversa ainda não começou.', { tone: 'info' }); return; }
    setRefreshing(true);
    try { const r = await apiGet(`/api/renata/conversations/${convId}`); setMsgs(r.messages || []); setPending(r.pending || []); notify('Conversa atualizada.', { tone: 'success' }); }
    catch (e) { setError((e && e.message) || 'Não consegui atualizar a conversa agora. Tente de novo.'); }
    finally { setRefreshing(false); }
  }
  async function clearConversation() {
    if (!(await askConfirm({ title: 'Limpar esta conversa?', message: 'A conversa some da tela e a RENATA começa do zero. O Registro de ações continua guardando tudo o que ela fez.', confirmLabel: 'Limpar conversa', danger: true }))) return;
    newConversation();
  }
  function newConversation() { writeConv(userId, ''); setConvId(''); setMsgs([]); setPending([]); setError(''); setLoaded(true); }
  useEffect(() => { if (initialQuestion && !sentInitial.current && loaded) { sentInitial.current = true; send(initialQuestion); } }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  function onKeyDown(e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input); } }

  const first = (userName || '').split(' ')[0];
  const chips = chipsFor(screen);
  const footer = tab === 'chat' ? (
    <div className="rnc-compose">
      <textarea ref={taRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} aria-label="Diga o que a RENATA deve fazer" placeholder={pending.length ? 'Decida o cartão acima ou escreva outra coisa…' : 'Peça o que precisa — ela faz.'} disabled={busy} />
      <Button variant="primary" icon={Send} onClick={() => send(input)} loading={busy} disabled={!input.trim()} disabledReason="Escreva o pedido">Enviar</Button>
    </div>
  ) : null;

  return (
    <Drawer above title="RENATA" subtitle="Colaboradora digital: você pede, ela executa no sistema, com as suas permissões, e deixa tudo registrado." onClose={onClose} footer={footer} label="RENATA, colaboradora digital da PRICETAX">
      <style>{CSS}</style>
      <style>{CHAT_EXPORT_CSS}</style>
      <div className="rnc">
        <div className="rnc-tabs" role="tablist" aria-label="Seções da RENATA">
          <button type="button" role="tab" aria-selected={tab === 'chat'} className={`rnc-tab${tab === 'chat' ? ' on' : ''}`} onClick={() => setTab('chat')}><MessageSquare size={13} /> Conversa</button>
          <button type="button" role="tab" aria-selected={tab === 'log'} className={`rnc-tab${tab === 'log' ? ' on' : ''}`} onClick={() => setTab('log')}><ListChecks size={13} /> Registro de ações</button>
        </div>
        {tab === 'log' && <ActionLog isAdmin={isAdmin} />}
        {tab === 'chat' && (
          <>
            <div className="rnc-bar" role="toolbar" aria-label="Ações da conversa">
              <Button size="sm" icon={RefreshCw} onClick={refresh} loading={refreshing} disabled={busy} disabledReason="Aguarde a RENATA terminar">Atualizar</Button>
              <Button size="sm" icon={Trash2} onClick={clearConversation} disabled={busy || (!msgs.length && !convId)} disabledReason={busy ? 'Aguarde a RENATA terminar' : 'Não há conversa para limpar'}>Limpar conversa</Button>
            </div>
            {(screen.module || screen.entity) && <div className="rnc-where"><MapPin size={13} aria-hidden="true" /> Você está em <b>{screen.module || 'Início'}</b>{screen.view ? ` › ${screen.view}` : ''}{screen.entity && screen.entity.title ? ` · ${screen.entity.title}` : ''}</div>}
            {screen.entity && <FocusCard entity={screen.entity} />}
            {loaded && msgs.length === 0 && !busy && (
              <>
                <div className="rnc-hello">Oi{first ? `, ${first}` : ''}! Diga o resultado que você quer e eu faço: criar e mexer em atividades, tarefas, cronogramas, negócios e contatos, registrar notas, consultar o que a equipe fez, em lote quando precisar. Peço a sua confirmação antes de qualquer coisa crítica e registro tudo em meu nome, com o seu pedido.</div>
                <div className="rnc-chips">{chips.map((s) => <button key={s} type="button" className="rnc-chip" onClick={() => (s.endsWith(' ') ? (setInput(s), taRef.current && taRef.current.focus()) : send(s))}>{s}</button>)}</div>
              </>
            )}
            {msgs.length > 0 && <ChatExport getData={() => ({ title: 'RENATA — conversa', subtitle: 'Colaboradora digital da PRICETAX', messages: fromSimpleMessages(msgs) })} />}
            {mergeReads(msgs).map((m, i) => (
              m.role === 'user'
                ? <React.Fragment key={i}><div className="cx-wrap user"><div className="rnc-msg user">{m.text}</div><CopyMessageButton message={fromSimpleMessages([m])[0]} /></div>{m.at && <div className="rnc-time user" title={`Enviada em ${fmtBr(m.at)}`}>{fmtBr(m.at)}</div>}</React.Fragment>
                : (<React.Fragment key={i}>{m.text && <div className="cx-wrap bot"><div className="rnc-msg bot"><Formatted text={m.text} /></div><CopyMessageButton message={fromSimpleMessages([{ ...m, steps: [] }])[0]} /></div>}{m.text && m.at && <div className="rnc-time bot" title={`Respondida em ${fmtBr(m.at)}`}>{fmtBr(m.at)}</div>}<Steps steps={m.steps} onUndo={undo} busyUndo={busyUndo} /></React.Fragment>)
            ))}
            {pending.map((p) => <PendingCard key={p.actionId} p={p} onDecide={decide} busy={busy} />)}
            {busy && <div className="rnc-think" role="status"><Loader2 size={14} className="rnc-spin" /> A RENATA está trabalhando…</div>}
            {error && <div className="rnc-err" role="alert">{error}</div>}
            <div ref={endRef} />
          </>
        )}
      </div>
    </Drawer>
  );
}
