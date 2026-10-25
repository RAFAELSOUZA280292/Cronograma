import { beginSave } from './saveState.js';
import { reportApiError } from './experience.js';

// Mensagem em português claro para cada tipo de falha (§96): o que houve e o que a pessoa pode fazer. O servidor já manda mensagem boa nos
// erros que conhece (validação, permissão, 409…); aqui cobrimos o que não chega do servidor (sem rede, proxy fora do ar) e os casos sem texto.
const FALLBACK = {
  400: 'Não foi possível processar o que foi enviado. Confira os campos e tente de novo.',
  401: 'Sua sessão expirou. Entre de novo para continuar (o que você digitou nesta tela não foi enviado).',
  403: 'Você não tem permissão para fazer isso. Se precisar, peça acesso a um administrador.',
  404: 'Não encontramos esse registro. Ele pode ter sido removido — atualize a tela.',
  408: 'A conexão demorou demais. Tente de novo.',
  409: 'Essa alteração entrou em conflito com outra. Atualize a tela e tente de novo.',
  413: 'O conteúdo enviado é grande demais. Reduza o tamanho dos anexos e tente de novo.',
  429: 'Muitas ações em pouco tempo. Aguarde alguns segundos e tente de novo.',
  502: 'O servidor está reiniciando ou fora do ar. Aguarde um instante e tente de novo — o que já foi salvo está preservado.',
  503: 'O servidor está ocupado agora. Aguarde um instante e tente de novo.',
  504: 'O servidor demorou para responder. Tente de novo; se repetir, avise o suporte.',
};
export function friendlyMessage(status, serverMessage) {
  if (serverMessage) return serverMessage;
  return FALLBACK[status] || (status >= 500 ? 'Algo deu errado do nosso lado. Tente de novo; se repetir, avise o suporte.' : 'Não foi possível concluir. Tente de novo.');
}

async function rawRequest(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error(typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'Você está sem internet. Assim que a conexão voltar, tente de novo — nada foi perdido.'
      : 'Não conseguimos falar com o servidor. Confira sua internet e tente de novo.');
    err.status = 0; err.offline = true;
    reportApiError(method, path, 0);
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo (ou HTML de proxy) */ }
  if (!res.ok) {
    const message = friendlyMessage(res.status, data && data.message);
    const err = new Error(message);
    err.status = res.status;
    err.message = message;
    err.ref = (data && data.ref) || '';
    err.data = data; // corpo completo do erro (ex.: lista de duplicados do CRM)
    reportApiError(method, path, res.status);
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
