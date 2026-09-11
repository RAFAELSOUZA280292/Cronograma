// Central de Conhecimento — rotas (Fase 8, 2026-09-11). Área
// administrativa de governança da memória da RENATA — visibilidade
// restrita a PRICETAX (master/pricetax), nunca a usuários 'cliente'
// (decisão confirmada com o Rafael; eles continuam conversando com a
// RENATA normalmente, só não veem esta tela). Toda rota resolve
// `orgId`/`accessibleProjectIds` do mesmo jeito que o resto do admin já
// resolve (`effectiveOrgId`/`canAccessProject`, nunca uma regra
// paralela) — ver server/permissions.js.
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { effectiveOrgId } from './routes.js';
import { listAccessibleProjectIds } from './permissions.js';
import {
  getOverview, searchKnowledgeFacts, getFactDetail, editFactVersioned,
  listConflicts, resolveConflict, getMetrics, checkFactMutationPermission,
} from './knowledgeCenter.js';
import { listEntities, getEntityDetail, linkFactEntities, unlinkFactEntity } from './knowledgeEntities.js';

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

async function context(req) {
  const orgId = effectiveOrgId(req);
  const accessibleProjectIds = await listAccessibleProjectIds(pool, req.user, orgId);
  return { orgId, accessibleProjectIds };
}

router.get('/overview', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    res.json(await getOverview(pool, { orgId, accessibleProjectIds }));
  } catch (e) { next(e); }
});

router.get('/facts', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    const { q, knowledgeType, status, scope, projectId, origin, personEntityId, dateFrom, dateTo, limit, offset } = req.query;
    const rows = await searchKnowledgeFacts(pool, {
      orgId, accessibleProjectIds, q,
      filters: { knowledgeType, status, scope, projectId, origin, personEntityId, dateFrom, dateTo },
      limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined,
    });
    res.json({ facts: rows });
  } catch (e) { next(e); }
});

router.get('/facts/:id', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    const detail = await getFactDetail(pool, { orgId, accessibleProjectIds, factId: req.params.id });
    if (!detail) return res.status(404).json({ message: 'Conhecimento não encontrado.' });
    res.json(detail);
  } catch (e) { next(e); }
});

router.post('/facts/:id/edit', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    const detail = await getFactDetail(pool, { orgId, accessibleProjectIds, factId: req.params.id });
    if (!detail) return res.status(404).json({ message: 'Conhecimento não encontrado.' });
    if (!checkFactMutationPermission(req.user, detail.fact, accessibleProjectIds)) {
      return res.status(403).json({ message: 'Você não tem permissão pra editar este conhecimento.' });
    }
    const { content, knowledgeType, validFrom, origin, reference, sourceDate, reason } = req.body || {};
    const result = await editFactVersioned(pool, {
      orgId, factId: req.params.id, actingUser: req.user,
      newContent: content, newKnowledgeType: knowledgeType, newValidFrom: validFrom,
      newOrigin: origin, newReference: reference, newSourceDate: sourceDate, reason,
    });
    res.json(result);
  } catch (e) {
    if (/não encontrado|Informe o motivo/i.test(e.message || '')) return res.status(400).json({ message: e.message });
    next(e);
  }
});

router.post('/facts/:id/entities', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    const detail = await getFactDetail(pool, { orgId, accessibleProjectIds, factId: req.params.id });
    if (!detail) return res.status(404).json({ message: 'Conhecimento não encontrado.' });
    if (!checkFactMutationPermission(req.user, detail.fact, accessibleProjectIds)) {
      return res.status(403).json({ message: 'Você não tem permissão pra editar este conhecimento.' });
    }
    const { name, type } = req.body || {};
    if (!name || !type) return res.status(400).json({ message: 'Informe nome e tipo da entidade.' });
    let projectData = null;
    if (detail.fact.project_id) {
      const { rows } = await pool.query('SELECT data FROM projects WHERE id=$1', [detail.fact.project_id]);
      projectData = rows[0] && rows[0].data;
    }
    const linked = await linkFactEntities(pool, {
      factId: req.params.id, orgId, entityMentions: [{ name, type }], projectData, projectId: detail.fact.project_id,
    });
    res.json({ entityId: linked[0] || null });
  } catch (e) { next(e); }
});

router.delete('/facts/:id/entities/:entityId', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    const detail = await getFactDetail(pool, { orgId, accessibleProjectIds, factId: req.params.id });
    if (!detail) return res.status(404).json({ message: 'Conhecimento não encontrado.' });
    if (!checkFactMutationPermission(req.user, detail.fact, accessibleProjectIds)) {
      return res.status(403).json({ message: 'Você não tem permissão pra editar este conhecimento.' });
    }
    await unlinkFactEntity(pool, { factId: req.params.id, entityId: req.params.entityId });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/conflicts', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    const rows = await listConflicts(pool, { orgId, accessibleProjectIds, includeReviewed: req.query.includeReviewed === 'true' });
    res.json({ conflicts: rows });
  } catch (e) { next(e); }
});

router.post('/conflicts/resolve', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    const { factIdA, factIdB, resolution, olderFactId, reason } = req.body || {};
    if (!factIdA || !factIdB || !resolution) return res.status(400).json({ message: 'Informe os dois fatos e a resolução.' });
    const [detailA, detailB] = await Promise.all([
      getFactDetail(pool, { orgId, accessibleProjectIds, factId: factIdA }),
      getFactDetail(pool, { orgId, accessibleProjectIds, factId: factIdB }),
    ]);
    if (!detailA || !detailB) return res.status(404).json({ message: 'Conhecimento não encontrado.' });
    if (!checkFactMutationPermission(req.user, detailA.fact, accessibleProjectIds) || !checkFactMutationPermission(req.user, detailB.fact, accessibleProjectIds)) {
      return res.status(403).json({ message: 'Você não tem permissão pra resolver este conflito.' });
    }
    const result = await resolveConflict(pool, { orgId, factIdA, factIdB, resolution, olderFactId, actingUser: req.user, reason });
    res.json(result);
  } catch (e) {
    if (/não encontrado|Resolução inválida|Informe qual|não estão marcados/i.test(e.message || '')) return res.status(400).json({ message: e.message });
    next(e);
  }
});

router.get('/entities', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    const rows = await listEntities(pool, { orgId, accessibleProjectIds, type: req.query.type, query: req.query.q });
    res.json({ entities: rows });
  } catch (e) { next(e); }
});

router.get('/entities/:id', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    const detail = await getEntityDetail(pool, { orgId, accessibleProjectIds, entityId: req.params.id });
    if (!detail) return res.status(404).json({ message: 'Entidade não encontrada.' });
    res.json(detail);
  } catch (e) { next(e); }
});

router.get('/metrics', async (req, res, next) => {
  try {
    const { orgId, accessibleProjectIds } = await context(req);
    const { dateFrom, dateTo } = req.query;
    res.json(await getMetrics(pool, { orgId, accessibleProjectIds, dateFrom, dateTo }));
  } catch (e) { next(e); }
});
