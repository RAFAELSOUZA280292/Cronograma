// Erros de tela capturados pelos limites de erro do navegador (2026-10-16): uma linha JSON no log do servidor (Railway), para que uma tela
// que quebra em produção deixe rastro. Funções puras (testáveis em Node). A rota exige login e tem limite por pessoa para não virar spam de log.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map(); // `${userId}:${kind}` -> [timestamps]

// Duas origens com cotas SEPARADAS: 'boundary' (tela que falhou ao desenhar) e 'global' (erro que ninguém tratou). Assim uma enxurrada de
// erros globais de pouca importância não esgota a cota e esconde uma falha de tela. Qualquer outro valor vira 'boundary'.
export const kindOf = (k) => (k === 'global' ? 'global' : 'boundary');

export function allowReport(userId, kind, now = Date.now()) {
  const key = `${userId}:${kindOf(kind)}`;
  const arr = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) { hits.set(key, arr); return false; }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) { for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k); }
  return true;
}

const cut = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, n);

// Linha de log com tudo truncado e sem quebras de linha (JSON.stringify escapa o resto): ninguém consegue forjar outra linha de log.
export function formatClientError(user, body) {
  const b = body && typeof body === 'object' ? body : {};
  return JSON.stringify({
    kind: kindOf(b.kind), userId: cut(user && user.id, 60), orgId: cut(user && user.orgId, 60),
    where: cut(b.where, 80), message: cut(b.message, 300), path: cut(b.path, 120), source: cut(b.source, 200),
    status: Number.isInteger(b.status) ? b.status : undefined, ua: cut(b.ua, 160),
    stack: cut(b.stack, 1500), componentStack: cut(b.componentStack, 1200),
  });
}
