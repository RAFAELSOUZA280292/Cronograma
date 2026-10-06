import { beginSave } from './saveState.js';

async function rawRequest(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) {
    const message = (data && data.message) || 'Erro inesperado.';
    const err = new Error(message);
    err.status = res.status;
    err.message = message;
    err.data = data; // corpo completo do erro (ex.: lista de duplicados do CRM)
    throw err;
  }
  return data;
}

// Gravações automáticas (PATCH/PUT) alimentam o estado global "Salvando/Salvo/Falhou" (src/lib/saveState.js).
async function request(method, path, body) {
  if (method !== 'PATCH' && method !== 'PUT') return rawRequest(method, path, body);
  // "Tentar de novo" global só para gravação idempotente de documento inteiro (projeto). As demais (ações do XFlow, avatar,
  // preferências…) têm o próprio fluxo de erro/retry: reenviar o corpo cru não atualizaria o estado de quem chamou nem seria seguro.
  const retry = method === 'PATCH' && /^\/api\/projects\/[^/?]+$/.test(path) ? () => request(method, path, body) : null;
  const tracker = beginSave(`${method} ${path}`, retry);
  try {
    const data = await rawRequest(method, path, body);
    tracker.ok();
    return data;
  } catch (e) {
    if (e && e.status >= 400 && e.status < 500) tracker.rejected(); else tracker.fail(e);
    throw e;
  }
}

export const apiGet = (path) => request('GET', path);
export const apiPost = (path, body) => request('POST', path, body === undefined ? {} : body);
export const apiPatch = (path, body) => request('PATCH', path, body);
export const apiDelete = (path) => request('DELETE', path);
export const apiPut = (path, body) => request('PUT', path, body);
