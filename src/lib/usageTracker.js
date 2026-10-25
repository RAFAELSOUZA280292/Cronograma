// Rastreador de uso do app (Central de Inteligência Operacional). Conta, a cada 15 s, se a aba está visível (conectado) e se
// houve interação nos últimos 60 s (ativo), no módulo/tela/empresa atuais. Manda fatias agregadas ao servidor; nunca texto,
// nunca conteúdo. Lógica pura (testável em Node) + uma instância única pro app inteiro; só a equipe é medida (decide o servidor).
export const TICK_S = 15;
export const IDLE_AFTER_S = 60;
export const FLUSH_S = 60;
const MAX_SLICE_S = 120;

export class UsageTracker {
  constructor({ tickS = TICK_S, idleAfterS = IDLE_AFTER_S } = {}) { this.tickS = tickS; this.idleAfterS = idleAfterS; this.slices = new Map(); this.actions = []; }

  tick(ctx, { visible, lastInteractionMs, nowMs }) {
    if (!visible || !ctx || !ctx.module) return;
    const view = ctx.view || ''; const projectId = ctx.projectId || '';
    const key = `${ctx.module}|${view}|${projectId}`;
    const s = this.slices.get(key) || { module: ctx.module, view, projectId, connectedS: 0, activeS: 0, at: nowMs };
    s.connectedS += this.tickS;
    if (nowMs - lastInteractionMs <= this.idleAfterS * 1000) s.activeS += this.tickS;
    s.at = nowMs;
    this.slices.set(key, s);
  }

  action(action, ctx, nowMs = Date.now()) {
    if (this.actions.length < 20) this.actions.push({ action, module: (ctx && ctx.module) || '', projectId: (ctx && ctx.projectId) || '', at: nowMs });
  }

  // Esvazia o acumulado em fatias de até 120 s (o servidor recusa mais que isso por fatia).
  drain() {
    const slices = [];
    for (const s of this.slices.values()) {
      let c = s.connectedS; let a = s.activeS;
      while (c > 0) {
        const take = Math.min(MAX_SLICE_S, c); const act = Math.min(a, take);
        slices.push({ module: s.module, view: s.view, projectId: s.projectId, connectedS: take, activeS: act, at: new Date(s.at).toISOString() });
        c -= take; a -= act;
      }
    }
    const actions = this.actions.map((x) => ({ action: x.action, module: x.module, projectId: x.projectId }));
    this.slices = new Map(); this.actions = [];
    return { slices, actions };
  }

  get pending() { return this.slices.size > 0 || this.actions.length > 0; }
}

// ---- instância do app ----
export const usageTracker = new UsageTracker();
let currentCtx = { module: '', view: '', projectId: '' };
export const setUsageContext = (ctx) => { currentCtx = ctx; };
export const trackAction = (action) => { usageTracker.action(action, currentCtx); };

const sessionId = `s${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

export function startUsageTracking({ send, beacon }) {
  let last = Date.now();
  const mark = () => { last = Date.now(); };
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
  events.forEach((e) => window.addEventListener(e, mark, { capture: true, passive: true }));
  let moveAt = 0;
  const onMove = () => { const n = Date.now(); if (n - moveAt > 5000) { moveAt = n; last = n; } };
  window.addEventListener('mousemove', onMove, { capture: true, passive: true });
  const flush = (viaBeacon) => {
    if (!usageTracker.pending) return;
    const payload = { sessionId, ...usageTracker.drain() };
    if (viaBeacon && beacon) { beacon(payload); return; }
    send(payload).catch(() => { /* perde esta fatia; a próxima segue normal */ });
  };
  const tickTimer = setInterval(() => { usageTracker.tick(currentCtx, { visible: document.visibilityState === 'visible', lastInteractionMs: last, nowMs: Date.now() }); }, TICK_S * 1000);
  const flushTimer = setInterval(() => flush(false), FLUSH_S * 1000);
  const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
  const onPageHide = () => flush(true);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    clearInterval(tickTimer); clearInterval(flushTimer);
    events.forEach((e) => window.removeEventListener(e, mark, { capture: true }));
    window.removeEventListener('mousemove', onMove, { capture: true });
    document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onPageHide);
    flush(false);
  };
}
