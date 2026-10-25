// Medição de experiência (§97): fluxo, resultado e duração — nunca conteúdo, mouse nem tempo de tela; só a equipe é medida (decide o servidor).
// `flow(nome)` marca o começo e devolve a função que registra o resultado. A nota de satisfação (1 clique) só é pedida depois de algumas
// execuções bem-sucedidas e respeitando a frequência que o SERVIDOR controla (no máximo 1 pedido a cada 14 dias por pessoa).
import { FLOWS, routeGroup } from '../../shared/experienceFlows.js';

const queue = [];
const doneInSession = new Map();
let askedInSession = false;
let timer = null;

function send(events, keepalive = false) {
  if (!events.length) return;
  try { fetch('/api/experience/events', { method: 'POST', credentials: 'include', keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) }).catch(() => {}); } catch { /* sem rede: perde a medição, nunca atrapalha */ }
}
export function flush(keepalive = false) { clearTimeout(timer); timer = null; send(queue.splice(0, 30), keepalive); if (queue.length) timer = setTimeout(() => flush(), 1000); }
function enqueue(e) { if (queue.length < 100) queue.push(e); if (!timer) timer = setTimeout(() => flush(), 20000); }

export function trackFlow(flowName, outcome = 'ok', durationMs = 0) {
  if (!(flowName in FLOWS)) return;
  enqueue({ flow: flowName, outcome, durationMs: Math.round(durationMs) });
  if (outcome === 'ok') {
    const n = (doneInSession.get(flowName) || 0) + 1; doneInSession.set(flowName, n);
    if (n === FLOWS[flowName].askAfter && !askedInSession) maybeAsk(flowName);
  }
}
export function startFlow(flowName) {
  const t0 = Date.now();
  return (outcome = 'ok') => trackFlow(flowName, outcome, Date.now() - t0);
}
// Erro de API (sem rede, 4xx/5xx): só o "tipo" de rota e o status; sem corpo, sem ids.
export function reportApiError(method, path, status) {
  if (String(path).startsWith('/api/experience')) return;
  const route = `${String(method || 'get').toLowerCase()}:${routeGroup(path)}`;
  enqueue({ flow: 'erro_api', outcome: status === 0 || status >= 500 ? 'error' : 'rejected', route, status });
}

async function maybeAsk(flowName) {
  try {
    // O servidor decide pela contagem registrada: manda o que está na fila ANTES de perguntar se vale pedir a nota.
    clearTimeout(timer); timer = null;
    const pending = queue.splice(0, 30);
    if (pending.length) await fetch('/api/experience/events', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: pending }) }).catch(() => {});
    const r = await (await fetch(`/api/experience/csat/eligible?flow=${encodeURIComponent(flowName)}`, { credentials: 'include' })).json();
    if (r && r.ask) { askedInSession = true; window.dispatchEvent(new CustomEvent('ptx:csat', { detail: { flow: flowName, label: r.label || FLOWS[flowName].label } })); }
  } catch { /* sem rede: sem pergunta */ }
}
export async function answerCsat(flowName, score, comment = '') {
  try { await fetch('/api/experience/csat', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flow: flowName, score, comment }) }); } catch { /* não incomoda */ }
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => flush(true));
