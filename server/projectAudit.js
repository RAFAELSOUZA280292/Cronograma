// Quem fez cada gravação em `projects` (§83). O gatilho do banco só enxerga o SQL; aqui a identidade da requisição (AsyncLocalStorage, preenchida por requireAuth e pela API de
// conectividade) é gravada em variáveis da sessão do Postgres (`app.actor_id`, `app.actor_name`, `app.origin`) imediatamente antes de qualquer UPDATE/DELETE em `projects`,
// e limpa logo depois. Só instrumenta essas duas instruções; o resto do tráfego do pool não muda.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();
export const setActor = (actor) => store.enterWith(actor);
export const getActor = () => store.getStore() || null;
export const runAs = (actor, fn) => store.run(actor, fn);

const WRITE_RE = /^\s*(UPDATE\s+projects\b|DELETE\s+FROM\s+projects\b)/i;
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const SET_SQL = `SELECT set_config('app.actor_id', $1, false), set_config('app.actor_name', $2, false), set_config('app.origin', $3, false)`;

export const originOf = (req) => clip(`${req.method} ${String(req.originalUrl || req.url || '').split('?')[0]}`, 160);

async function withActor(run, text, values) {
  const a = getActor() || {};
  await run(SET_SQL, [clip(a.id, 80), clip(a.name, 120), clip(a.origin, 160)]);
  try { return await run(text, values); } finally { try { await run(SET_SQL, ['', '', '']); } catch { /* transação abortada: o ROLLBACK desfaz a variável */ } }
}

export function installProjectAudit(pool) {
  const rawConnect = pool.connect.bind(pool);
  const rawQuery = pool.query.bind(pool);
  const patch = (client) => {
    if (client.__auditPatched) return client;
    const raw = client.query.bind(client);
    client.query = (text, values, ...rest) => (typeof text === 'string' && WRITE_RE.test(text) && typeof values !== 'function' && !rest.length
      ? withActor(raw, text, values) : raw(text, values, ...rest));
    client.__auditPatched = true;
    return client;
  };
  pool.connect = function connect(cb) {
    if (typeof cb === 'function') return rawConnect(cb);
    return rawConnect().then(patch);
  };
  pool.query = function query(text, values, ...rest) {
    if (typeof text === 'string' && WRITE_RE.test(text) && typeof values !== 'function' && !rest.length) {
      return rawConnect().then(async (client) => {
        try { return await withActor(client.query.bind(client), text, values); } finally { client.release(); }
      });
    }
    return rawQuery(text, values, ...rest);
  };
}
