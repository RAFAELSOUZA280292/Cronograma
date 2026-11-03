// Memória curta da Caixa de e-mail (Fase 2 da varredura de 02/11, velocidade). Só na memória do processo, nunca no banco:
// - conversa (metadados) guardada por (pessoa, id, historyId): o Gmail troca o historyId a cada mudança na conversa (mensagem nova,
//   lida, pasta), então a mesma chave devolve sempre o mesmo conteúdo e a lista de 30 deixa de pedir 30 conversas a cada minuto;
// - pastas (contadores) por 60 s, esquecidas a cada gravação da própria pessoa (ler, mover, enviar).

export function createCache({ max = 5000, ttlMs = 0, now = () => Date.now() } = {}) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (ttlMs && now() - hit.at > ttlMs) { map.delete(key); return undefined; }
      map.delete(key); map.set(key, hit); // mais recente vai para o fim (o mais antigo sai primeiro)
      return hit.value;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, { value, at: now() });
      while (map.size > max) map.delete(map.keys().next().value);
    },
    deletePrefix(prefix) { for (const k of [...map.keys()]) if (k.startsWith(prefix)) map.delete(k); },
    get size() { return map.size; },
  };
}

export const threadKey = (userId, id, historyId) => (historyId ? `${userId}:${id}:${historyId}` : null);

// Busca os metadados das conversas da lista reaproveitando as que não mudaram. `fetchOne(id)` só roda para as que faltam.
export async function cachedThreads(cache, userId, list, fetchOne, mapLimit, limit = 6) {
  const out = new Array(list.length).fill(null);
  const missing = [];
  list.forEach((t, i) => {
    const k = threadKey(userId, t.id, t.historyId);
    const hit = k && cache.get(k);
    if (hit) out[i] = hit; else missing.push(i);
  });
  const fetched = await mapLimit(missing, limit, (i) => fetchOne(list[i].id).catch(() => null));
  missing.forEach((i, j) => {
    const data = fetched[j];
    out[i] = data;
    const k = data && threadKey(userId, data.id, data.historyId || list[i].historyId);
    if (k) cache.set(k, data);
  });
  return { threads: out, fetched: missing.length };
}
