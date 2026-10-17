// Envia ao servidor (log de produção) o erro que um limite de erro capturou — antes disso uma tela em branco não deixava rastro nenhum.
// Nunca lança, nunca bloqueia a tela; só vale com a pessoa logada (a rota exige login) e repete no máximo uma vez por erro igual na sessão.
const sent = new Set();

export function reportClientError(where, error, componentStack) {
  try {
    const message = String((error && error.message) || error || 'erro').slice(0, 300);
    const key = `${where}|${message}`;
    if (sent.has(key) || sent.size >= 20) return;
    sent.add(key);
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        where: String(where || '').slice(0, 80),
        message,
        stack: String((error && error.stack) || '').slice(0, 1500),
        componentStack: String(componentStack || '').slice(0, 1200),
        path: window.location.pathname,
      }),
    }).catch(() => {});
  } catch (e) { /* ignora */ }
}
