// Isolamento de pareceres por cliente (2026-10-04, §70): um parecer "Cliente específico" só pode ser usado — no
// chat da RENATA e na sugestão de reunião — dentro da empresa a que ele pertence. "Geral" vale em qualquer uma.
// Regra FECHADA por padrão: na dúvida (nome que não bate, sem vínculo), o parecer NÃO é usado fora de casa.
// O escopo é lido do parecer NA HORA de usar (nunca copiado pro fato), então editar a tag do parecer vale
// imediatamente.

const COMPANY_STOP = new Set([
  'ltda', 'sa', 'eireli', 'me', 'epp', 'do', 'da', 'de', 'dos', 'das', 'e', 'brasil', 'cia', 'companhia',
]);

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function companyTokens(name) {
  return new Set(norm(name).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !COMPANY_STOP.has(w)));
}

function isSubset(a, b) {
  if (!a.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// `identity` = { id, names: [razão social, nome fantasia] } da empresa onde a RENATA está sendo usada.
export function parecerUsableFor(parecer, identity) {
  if (!parecer || parecer.scope !== 'cliente') return !!parecer;
  if (!identity) return false;
  const linked = parecer.company_project_id || parecer.companyProjectId;
  if (linked) return linked === identity.id;
  const wanted = companyTokens(parecer.company_name || parecer.companyName);
  if (!wanted.size) return false;
  return (identity.names || []).some((n) => {
    const t = companyTokens(n);
    return t.size > 0 && (isSubset(wanted, t) || isSubset(t, wanted));
  });
}

export async function loadProjectIdentity(pool, projectId) {
  if (!projectId) return null;
  const { rows } = await pool.query(
    `SELECT id, data->'company'->>'name' AS name, data->'company'->>'nomeFantasia' AS fantasia FROM projects WHERE id=$1`,
    [projectId],
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, names: [rows[0].name, rows[0].fantasia].filter(Boolean) };
}
