// Cota do Gmail por pessoa (2026-11-03; Rafael abriu um e-mail e viu "O Google pediu uma pausa"). O Google limita cada caixa a
// 15.000 "unidades" por minuto, somando TUDO o que o painel lê dela: a Caixa, a varredura das conversas da equipe, a arrumação de
// convites, a RENATA e as leituras de colegas (sócio abrindo a conversa). Aqui:
// - cada chamada é contada no medidor da pessoa, por origem (o que aparece no log quando a cota estoura: dá para ver o culpado);
// - a Caixa (o que a pessoa clicou) repete sozinha quando o Google pede pausa, com espera crescente, como o Google recomenda;
// - tarefas de fundo (varredura, convites) não começam quando a pessoa já gastou boa parte da cota no último minuto.
// Custos: https://developers.google.com/gmail/api/reference/quota

const COST = {
  'messages.send': 100, 'drafts.send': 100, 'messages.batchModify': 50, 'messages.batchDelete': 50, 'messages.import': 25, 'messages.insert': 25,
  'threads.get': 10, 'threads.list': 10, 'threads.modify': 10, 'threads.trash': 10, 'threads.untrash': 10, 'threads.delete': 20,
  'drafts.create': 10, 'drafts.update': 15, 'drafts.delete': 10, 'drafts.get': 5, 'drafts.list': 5,
  'messages.get': 5, 'messages.list': 5, 'messages.modify': 5, 'messages.trash': 5, 'messages.untrash': 5, 'messages.attachments.get': 5,
  'history.list': 2, 'labels.get': 1, 'labels.list': 1, 'labels.create': 5, 'labels.update': 5, 'labels.patch': 5, 'labels.delete': 5, getProfile: 1,
};
const costOf = (method) => COST[method] ?? (method.startsWith('settings.') ? 5 : 5);

export const LIMIT_PER_MIN = 15000;
const WINDOW = 60 * 1000;
// Fundo só começa abaixo disto: sobra folga para o que a pessoa está clicando.
export const BACKGROUND_CEILING = 6000;

const meters = new Map(); // userId -> [{ at, units, source }]
function prune(list, now) { while (list.length && now - list[0].at > WINDOW) list.shift(); }
export function record(userId, source, units, now = Date.now()) {
  let list = meters.get(userId);
  if (!list) { list = []; meters.set(userId, list); }
  prune(list, now);
  list.push({ at: now, units, source });
}
export function usage(userId, now = Date.now()) {
  const list = meters.get(userId) || [];
  prune(list, now);
  const bySource = {};
  let total = 0;
  for (const e of list) { total += e.units; bySource[e.source] = (bySource[e.source] || 0) + e.units; }
  return { total, bySource };
}
export function resetMeters() { meters.clear(); lastWarn.clear(); }

export const isQuotaError = (e) => {
  const status = e && (e.code || (e.response && e.response.status));
  const msg = String((e && e.message) || '');
  return status === 429 || (status === 403 && /quota|rate ?limit|rateLimitExceeded|userRateLimitExceeded/i.test(msg));
};

const lastWarn = new Map();
function warn(userId, method) {
  const now = Date.now();
  if (now - (lastWarn.get(userId) || 0) < WINDOW) return;
  lastWarn.set(userId, now);
  const u = usage(userId, now);
  const parts = Object.entries(u.bySource).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ');
  console.warn(`Gmail: cota da pessoa ${userId} estourou em ${method}; último minuto ${u.total} unidades (${parts || 'nada medido neste processo'})`);
}

export class BackgroundBusy extends Error {
  constructor() { super('A caixa desta pessoa está com muitas leituras agora; a tarefa de fundo fica para a próxima rodada.'); this.code = 'GMAIL_BUSY'; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Envolve o `gmail` do googleapis: gmail.users.threads.get(...) etc. passam pelo medidor. `background`: recusa começar acima do teto
// e não repete (a próxima rodada tenta de novo); interativo: repete até 3 vezes (1 s, 2 s, 4 s + sorteio) quando o Google pede pausa.
export function meteredGmail(gmail, userId, { source = 'caixa', background = false, delays = [1000, 2000, 4000] } = {}) {
  const wrap = (obj, path) => new Proxy(obj, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof prop !== 'string' || prop === 'context' || prop.startsWith('_')) return v;
      const p = path ? `${path}.${prop}` : prop;
      if (typeof v === 'function') {
        return async (...args) => {
          const units = costOf(p);
          for (let attempt = 0; ; attempt += 1) {
            if (background && usage(userId).total + units > BACKGROUND_CEILING) throw new BackgroundBusy();
            record(userId, source, units);
            try { return await v.apply(target, args); } catch (e) {
              if (!isQuotaError(e)) throw e;
              warn(userId, p);
              if (background || attempt >= delays.length) throw e;
              await sleep(delays[attempt] + Math.floor(Math.random() * 300));
            }
          }
        };
      }
      return v && typeof v === 'object' ? wrap(v, p) : v;
    },
  });
  return { ...gmail, users: wrap(gmail.users, '') };
}
