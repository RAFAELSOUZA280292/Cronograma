// Registro de erros do navegador no log do servidor (Railway). Duas origens:
//  • kind "boundary": falha de renderização capturada por um limite de erro (src/ui/SafeBoundary.jsx);
//  • kind "global": erro que NINGUÉM tratou — `window.onerror` (exceção em clique/timer/evento) e `unhandledrejection` (promessa rejeitada sem
//    catch). Esses não deixam tela em branco, mas sem o registro eram invisíveis (2026-10-16).
// Só registro: nada aqui muda o que a pessoa vê. Nunca lança, nunca bloqueia a tela. A rota exige login (sem login = 401, ignorado).
// Cada erro igual vai uma vez por sessão (até 20 por origem) e o servidor ainda limita por pessoa — as duas origens têm cotas SEPARADAS.
const sent = { boundary: new Set(), global: new Set() };
const MAX_PER_KIND = 20;

// Ruído que não é defeito nosso: extensões/scripts de terceiros, "Script error." opaco, ResizeObserver, queda de rede/abortos,
// chunk que não carrega por versão nova publicada (o `lazyRetry` já avisa a pessoa) e sessão expirada (401).
const NETWORK = /failed to fetch|load failed|networkerror when attempting|network request failed|network connection was lost|the user aborted|request aborted|\bcancell?ed\b/i;
const CHUNK = /dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|loading css chunk/i;
export function shouldIgnore(info, origin) {
  const message = String((info && info.message) || '');
  const name = String((info && info.name) || '');
  const filename = String((info && info.filename) || '');
  if (!message && !name) return true;
  if (/^script error\.?$/i.test(message.trim())) return true;
  if (/ResizeObserver loop/i.test(message)) return true;
  if (filename && origin && !filename.startsWith(origin)) return true;
  if (name === 'AbortError' || NETWORK.test(message) || CHUNK.test(message)) return true;
  if (info && info.status === 401) return true;
  return false;
}

export function reportClientError(where, error, componentStack, extra) {
  try {
    const kind = extra && extra.kind === 'global' ? 'global' : 'boundary';
    const message = String((error && error.message) || error || 'erro').slice(0, 300);
    const key = `${where}|${message}`;
    const seen = sent[kind];
    if (seen.has(key) || seen.size >= MAX_PER_KIND) return;
    seen.add(key);
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        kind,
        where: String(where || '').slice(0, 80),
        message,
        stack: String((error && error.stack) || '').slice(0, 1500),
        componentStack: String(componentStack || '').slice(0, 1200),
        path: window.location.pathname,
        source: extra && extra.source ? String(extra.source).slice(0, 200) : '',
        status: extra && Number.isFinite(extra.status) ? extra.status : undefined,
        ua: String((navigator && navigator.userAgent) || '').slice(0, 160),
      }),
    }).catch(() => {});
  } catch (e) { /* ignora */ }
}

let installed = false;
export function installGlobalErrorCapture() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (ev) => {
    try {
      const err = ev.error;
      const message = ev.message || (err && err.message) || '';
      const filename = ev.filename || '';
      if (shouldIgnore({ message, name: err && err.name, filename, status: err && err.status }, window.location.origin)) return;
      reportClientError('window-error', err || new Error(message), '', {
        kind: 'global', source: filename ? `${filename}:${ev.lineno || 0}:${ev.colno || 0}` : '', status: err && err.status,
      });
    } catch (e) { /* ignora */ }
  });
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const r = ev.reason;
      const message = r && typeof r === 'object' ? (r.message || '') : String(r == null ? '' : r);
      if (shouldIgnore({ message, name: r && r.name, status: r && r.status }, window.location.origin)) return;
      reportClientError('unhandled-rejection', r instanceof Error ? r : new Error(message || 'promessa rejeitada sem motivo'), '', {
        kind: 'global', status: r && r.status,
      });
    } catch (e) { /* ignora */ }
  });
}
