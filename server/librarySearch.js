// Busca da paleta (Ctrl+K) em Pareceres, Modelos e Conhecimento (Onda 2, U4). Só master/pricetax, como as três telas.
// Texto simples em SQL (sem embeddings): a paleta consulta a cada pausa na digitação e não pode custar chamada de IA.
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { effectiveOrgId } from './routes.js';
import { listAccessibleProjectIds } from './permissions.js';

const MAX_TERMS = 5;
const PER_GROUP = 6;

export function searchTerms(q) {
  return String(q || '').toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, MAX_TERMS);
}

// Casa o termo no INÍCIO de uma palavra ("onda" acha "Onda 3", não "Honda"): o termo entra como regex, então os metacaracteres são escapados.
export function wordStartPattern(term) {
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cada termo precisa aparecer em algum dos campos (E entre termos, OU entre campos), sem diferenciar acento nem caixa.
export function termConditions(fields, terms, firstParam) {
  const params = [];
  const clauses = terms.map((t, i) => {
    params.push(wordStartPattern(t));
    const ref = `$${firstParam + i}`;
    return `(${fields.map((f) => `immutable_unaccent(lower(${f})) ~ ('(^|[^[:alnum:]])' || immutable_unaccent(${ref}))`).join(' OR ')})`;
  });
  return { sql: clauses.join(' AND '), params };
}

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

router.get('/', async (req, res, next) => {
  try {
    const terms = searchTerms(req.query.q);
    if (!terms.length) return res.json({ pareceres: [], modelos: [], facts: [] });
    const orgId = effectiveOrgId(req);
    const accessible = await listAccessibleProjectIds(pool, req.user, orgId);
    const projects = accessible && accessible.length ? accessible : ['__none__'];

    const pc = termConditions(['title', 'description', 'company_name', 'file_name'], terms, 2);
    const tc = termConditions(['t.title', 't.description', 't.category'], terms, 2);
    const fc = termConditions(['f.subject', 'f.content'], terms, 3);

    const [pareceres, modelos, facts] = await Promise.all([
      pool.query(
        `SELECT id, title, scope, company_name, file_name FROM pareceres WHERE org_id=$1 AND ${pc.sql} ORDER BY created_at DESC LIMIT ${PER_GROUP}`,
        [orgId, ...pc.params],
      ),
      pool.query(
        `SELECT t.id, t.title, t.category FROM document_templates t WHERE t.org_id=$1 AND ${tc.sql} ORDER BY t.created_at DESC LIMIT ${PER_GROUP}`,
        [orgId, ...tc.params],
      ),
      pool.query(
        `SELECT f.id, f.subject, f.knowledge_type, f.scope, f.project_id FROM ai_knowledge_facts f
         WHERE f.org_id=$1 AND (f.scope = 'org' OR (f.scope IN ('project','conversation') AND f.project_id = ANY($2::text[])))
           AND f.status NOT IN ('archived','superseded') AND (f.valid_until IS NULL OR f.valid_until >= CURRENT_DATE) AND ${fc.sql}
         ORDER BY f.created_at DESC LIMIT ${PER_GROUP}`,
        [orgId, projects, ...fc.params],
      ),
    ]);
    res.json({ pareceres: pareceres.rows, modelos: modelos.rows, facts: facts.rows });
  } catch (e) { next(e); }
});
