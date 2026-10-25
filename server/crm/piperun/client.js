// Cliente da API do PipeRun (§84) — SÓ LEITURA (GET). O token vem de quem pediu a extração, fica na memória durante a execução e nunca é gravado nem registrado em log.
// Limite medido na conta: 120 requisições (cabeçalho X-RateLimit-Limit/Remaining), páginas de até 200. Respeita o limite e espera quando o PipeRun responde 429.
export const BASE = 'https://api.pipe.run/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class PipeRunError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createClient(token, { base = BASE, fetchImpl = fetch, minGapMs = 350, log = () => {} } = {}) {
  if (!/^[A-Za-z0-9._-]{16,128}$/.test(String(token || ''))) throw new PipeRunError(400, 'O token do PipeRun parece inválido (esperado um código de letras e números, sem espaços).');
  let last = 0; let calls = 0;
  async function get(path, params = {}) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
    const url = `${base}/${path}${q ? `?${q}` : ''}`;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const wait = last + minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now(); calls += 1;
      let res;
      try { res = await fetchImpl(url, { headers: { token, Accept: 'application/json' } }); } catch (e) { if (attempt === 5) throw new PipeRunError(0, `Sem conexão com o PipeRun (${e.message}).`); await sleep(1500 * (attempt + 1)); continue; }
      const remaining = Number(res.headers.get('X-RateLimit-Remaining'));
      if (res.status === 429) { const ra = Number(res.headers.get('Retry-After')) || 20; log(`PipeRun pediu para esperar ${ra}s`); await sleep(ra * 1000); continue; }
      if (res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
      if (res.status === 401 || res.status === 403) throw new PipeRunError(res.status, 'O PipeRun recusou o token (401/403). Confira se o token está certo e ativo.');
      if (res.status === 404) throw new PipeRunError(404, 'Recurso não encontrado no PipeRun.');
      if (!res.ok) throw new PipeRunError(res.status, `O PipeRun respondeu ${res.status}.`);
      if (Number.isFinite(remaining) && remaining <= 3) await sleep(15000);
      return res.json();
    }
    throw new PipeRunError(429, 'O PipeRun continua limitando as requisições. Tente de novo em alguns minutos.');
  }
  async function listAll(resource, params = {}, { show = 200, onPage = () => {} } = {}) {
    const out = []; let page = 1; let total = null;
    for (;;) {
      const d = await get(resource, { ...params, show, page });
      const rows = Array.isArray(d.data) ? d.data : [];
      out.push(...rows);
      const meta = d.meta || {};
      total = meta.total ?? total;
      onPage({ resource, page, got: out.length, total });
      if (!rows.length || page >= (meta.total_pages || 1)) break;
      page += 1;
    }
    return { rows: out, total };
  }
  return { get, listAll, calls: () => calls };
}
