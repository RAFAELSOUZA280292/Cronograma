// Visão do usuário `cliente` sobre o JSON da empresa (A3/A4, 2026-10-29). A tela já escondia Log/Lixeira/Versões; aqui o SERVIDOR faz o mesmo:
//  - leitura: sem `log` e sem a transcrição bruta das reuniões (conteúdo interno);
//  - gravação: o que o cliente não pode decidir volta ao valor do servidor (CNPJ = chave de acesso, responsáveis da empresa, grupo, transcrições),
//    e o `log` só ganha as linhas novas (nunca é apagado nem reescrito).
export const isClientUser = (user) => !!user && user.role === 'cliente' && !user.isSuperAdmin;

export function projectForClient(data) {
  if (!data || typeof data !== 'object') return data;
  return {
    ...data,
    log: [],
    meetings: Array.isArray(data.meetings) ? data.meetings.map((m) => (m && typeof m === 'object' ? { ...m, transcript: '' } : m)) : data.meetings,
  };
}

const PROTECTED_TOP = ['ownerIds', 'principalOwnerId', 'involvedCompanyIds'];
const logKey = (e) => `${e && e.ts}|${e && e.action}`;

export function applyClientWrite(current, next) {
  const out = { ...next };
  out.company = { ...(next.company || {}) };
  if (current.company && current.company.cnpj !== undefined) out.company.cnpj = current.company.cnpj; else delete out.company.cnpj;
  for (const k of PROTECTED_TOP) { if (current[k] !== undefined) out[k] = current[k]; else delete out[k]; }
  const cur = new Map((Array.isArray(current.meetings) ? current.meetings : []).filter((m) => m && m.id).map((m) => [m.id, m]));
  if (Array.isArray(out.meetings)) out.meetings = out.meetings.map((m) => (m && cur.has(m.id) ? { ...m, transcript: cur.get(m.id).transcript } : m));
  const have = new Set((Array.isArray(current.log) ? current.log : []).map(logKey));
  const fresh = (Array.isArray(next.log) ? next.log : []).filter((e) => e && typeof e.ts === 'string' && typeof e.action === 'string' && !have.has(logKey(e)))
    .map((e) => ({ ...e, action: String(e.action).slice(0, 500) }));
  out.log = [...fresh, ...(Array.isArray(current.log) ? current.log : [])].slice(0, 300);
  return out;
}
