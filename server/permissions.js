// Central de Conhecimento — helper de permissão (Fase 8, 2026-09-11).
// `canAccessProject` (server/routes.js) decide "este usuário pode ver
// ESTE projeto?" — a Central de Conhecimento é uma área cross-projeto
// (um usuário PRICETAX pode ter acesso a várias empresas ao mesmo
// tempo), então toda busca/listagem ali precisa do CONJUNTO de projetos
// acessíveis, não uma checagem um a um. Em vez de reimplementar a regra
// em SQL (ex.: `data->'company'->>'cnpj' = ANY(...)`, que duplicaria a
// lógica e podia divergir dela com o tempo), carrega os projetos da org
// e reusa `canAccessProject` linha a linha — a MESMA função, nunca uma
// segunda versão da regra de acesso.
import { canAccessProject } from './routes.js';

export async function listAccessibleProjectIds(pool, user, orgId) {
  if (!user || !orgId) return [];
  const { rows } = await pool.query('SELECT id, data, org_id FROM projects WHERE org_id=$1', [orgId]);
  return rows.filter((r) => canAccessProject(user, r.data, r.org_id)).map((r) => r.id);
}
