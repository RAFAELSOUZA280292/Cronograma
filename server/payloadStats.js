// Tamanho real do que as telas baixam (2026-10-30, Onda 1 / Q4). Antes de decidir qualquer paginação de `GET /projects` (devolve o JSON inteiro de
// TODAS as empresas) é preciso saber o tamanho em produção — só o banco local de teste (25 KB) existia como medida. Mede o `Content-Length` que o
// Express acabou de mandar (sem serializar de novo) e guarda, em memória, contagem/maior/último por rota; loga uma linha quando passa do limite
// (no máximo 1 por minuto por rota). Tamanho SEM compressão: o que trafega na rede pode ser menor (gzip do proxy). Zera a cada reinício/deploy.

const stats = new Map();
const WARN_BYTES = 500 * 1024;
const LOG_EVERY_MS = 60 * 1000;

export function recordPayload(name, bytes, ms, now = Date.now()) {
  const s = stats.get(name) || { name, count: 0, totalBytes: 0, maxBytes: 0, lastBytes: 0, lastMs: 0, maxMs: 0, lastAt: 0, lastLogAt: -Infinity };
  s.count += 1;
  s.totalBytes += bytes;
  s.maxBytes = Math.max(s.maxBytes, bytes);
  s.lastBytes = bytes;
  s.lastMs = ms;
  s.maxMs = Math.max(s.maxMs, ms);
  s.lastAt = now;
  stats.set(name, s);
  if (bytes >= WARN_BYTES && now - s.lastLogAt >= LOG_EVERY_MS) {
    s.lastLogAt = now;
    console.log(`[payload] ${name}: ${(bytes / 1024).toFixed(0)} KB em ${ms} ms (maior desde o início: ${(s.maxBytes / 1024).toFixed(0)} KB)`);
  }
  return s;
}

// Middleware: `router.get('/projects', requireAuth, payloadStats('GET /projects'), handler)`.
export function payloadStats(name) {
  return (req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      const bytes = Number(res.getHeader('content-length'));
      if (res.statusCode < 400 && Number.isFinite(bytes) && bytes > 0) recordPayload(name, bytes, Date.now() - t0);
    });
    next();
  };
}

const kb = (b) => Math.round(b / 102.4) / 10;

export function payloadSnapshot() {
  return [...stats.values()].map((s) => ({
    rota: s.name, chamadas: s.count, maiorKB: kb(s.maxBytes), ultimoKB: kb(s.lastBytes),
    mediaKB: s.count ? kb(s.totalBytes / s.count) : 0, maiorMs: s.maxMs, ultimoMs: s.lastMs, ultimaVez: s.lastAt ? new Date(s.lastAt).toISOString() : null,
  })).sort((a, b) => b.maiorKB - a.maiorKB);
}

export function resetPayloadStats() { stats.clear(); }
