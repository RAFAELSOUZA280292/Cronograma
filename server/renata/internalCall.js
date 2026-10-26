// Chamada interna (loopback) às rotas do próprio servidor, em nome de um usuário (§101). Devolve {status, json} — nunca lança por status HTTP:
// quem chama decide o que fazer com 403/404/409/400 (a IA lê a mensagem do servidor e corrige o pedido).
import { internalHeaders } from './internalAuth.js';

let serverPort = null;
export function setServerPort(p) { serverPort = Number(p) || null; }
const port = () => serverPort || Number(process.env.PORT) || 3001;

export async function callInternal({ userId, commandId, method = 'GET', path, query, body, timeoutMs = 25000 }) {
  const url = new URL(`http://127.0.0.1:${port()}${path}`);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const hasBody = body !== undefined && !['GET', 'HEAD'].includes(method);
  const res = await fetch(url, {
    method,
    headers: { ...internalHeaders(userId, commandId), ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
    body: hasBody ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 500) }; }
  return { status: res.status, json };
}
