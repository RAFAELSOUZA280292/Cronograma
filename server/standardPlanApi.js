// Padrão de cronograma aprimorado — empresas que JÁ existem (2026-10-15; docs/PLANO_APRIMORAMENTO_CRONOGRAMA_PADRAO.md). Prévia por empresa (equipe PRICETAX)
// e aplicação com confirmação (só administrador). O servidor RECALCULA o plano dentro da transação (FOR UPDATE) e só acrescenta: descrição que ainda era a do
// modelo antigo, subatividades que faltam e as atividades novas sem data. Nunca toca em data, status, responsável, fase, prioridade nem no que já foi
// concluído (rede de segurança em `applyPlanToData`). Log na empresa, sem notificação, sem reindexar a memória (nada disso entra nos trechos das reuniões).
import { Router } from 'express';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool, blankProject } from './db.js';
import { canAccessProject, effectiveOrgId } from './routes.js';
import { planForProject, applyPlanToData } from './standardPlan.js';
import { auditProject } from './standardAudit.js';
import { STD_PLAN_ID, discardDraft, draftDiff, getDraft, listVersions, restoreVersion, saveDraft, saveVersion } from './standardTemplateStore.js';

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);
const isAdmin = (u) => !!u && (u.isSuperAdmin || u.role === 'master');
const labelOf = (data) => (data && data.company && (data.company.nomeFantasia || data.company.name)) || 'Empresa';
const MAX_APPLY = 100;

async function accessible(user, orgId) {
  const { rows } = await pool.query('SELECT id, org_id, data FROM projects WHERE org_id=$1', [orgId]);
  return rows.filter((r) => canAccessProject(user, r.data, r.org_id));
}

const summarize = (plan) => [
  ...plan.descriptions.map((d) => `Descrição de "${d.title}"`),
  ...plan.subs.map((s) => `+${s.items.length} subatividade${s.items.length === 1 ? '' : 's'} em "${s.title}"`),
  ...plan.creates.map((c) => `Nova atividade "${c.title}" (sem data, ${c.subs} subatividades)`),
];

router.get('/preview', async (req, res, next) => {
  try {
    const rows = await accessible(req.user, effectiveOrgId(req));
    const companies = rows.map((r) => {
      const plan = planForProject(r.data || {});
      return { id: r.id, label: labelOf(r.data), paused: !!(r.data.company && r.data.company.status === 'pausado'), counts: plan.counts, pending: !plan.empty, items: summarize(plan), skipped: plan.skipped };
    }).sort((a, b) => Number(b.pending) - Number(a.pending) || a.label.localeCompare(b.label, 'pt-BR'));
    const sum = (k) => companies.reduce((n, c) => n + c.counts[k], 0);
    res.json({ canApply: isAdmin(req.user), totals: { companies: companies.length, pending: companies.filter((c) => c.pending).length, descriptions: sum('descriptions'), subs: sum('subs'), creates: sum('creates') }, companies });
  } catch (e) { next(e); }
});

// Auditoria de UMA empresa contra o padrão (2026-10-19): somente leitura, equipe PRICETAX/master. Ver server/standardAudit.js.
router.get('/audit/:id', async (req, res, next) => {
  try {
    const rows = await accessible(req.user, effectiveOrgId(req));
    const row = rows.find((r) => r.id === req.params.id);
    if (!row) return res.status(404).json({ message: 'Empresa não encontrada ou sem acesso.' });
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    res.json({ audit: { id: row.id, ...auditProject(row.data || {}, blankProject(), { today }) } });
  } catch (e) { next(e); }
});

router.post('/apply', async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Só administradores aplicam o padrão nas empresas.' });
    const ids = [...new Set(Array.isArray(req.body && req.body.projectIds) ? req.body.projectIds.filter((x) => typeof x === 'string') : [])];
    if (!ids.length) return res.status(400).json({ message: 'Escolha ao menos uma empresa.' });
    if (ids.length > MAX_APPLY) return res.status(400).json({ message: `Aplique em no máximo ${MAX_APPLY} empresas por vez.` });
    const allowed = new Map((await accessible(req.user, effectiveOrgId(req))).map((r) => [r.id, r]));
    const who = req.user.name || req.user.username || '';
    const results = [];
    for (const id of ids) {
      if (!allowed.has(id)) { results.push({ id, status: 'sem-acesso' }); continue; }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cur = await client.query('SELECT data FROM projects WHERE id=$1 FOR UPDATE', [id]);
        const before = cur.rows[0].data;
        const { data, counts, plan } = applyPlanToData(before);
        if (plan.empty) { await client.query('ROLLBACK'); results.push({ id, label: labelOf(before), status: 'em-dia' }); continue; }
        const next = { ...data, log: [{ ts: new Date().toISOString(), action: `Padrão de cronograma aprimorado aplicado, confirmado por ${who}: ${counts.descriptions} descrição(ões), ${counts.subs} subatividade(s) e ${counts.creates} atividade(s) nova(s) sem data. Datas, status e responsáveis não foram alterados.`, user: who, activityId: null }, ...(before.log || [])].slice(0, 300) };
        await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(next), id]);
        await client.query('COMMIT');
        results.push({ id, label: labelOf(before), status: 'aplicado', counts });
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ }
        console.error('Padrão aprimorado: falha na empresa', id, e.message);
        results.push({ id, status: 'erro', message: String(e.message || e).slice(0, 160) });
      } finally { client.release(); }
    }
    res.json({ results, applied: results.filter((r) => r.status === 'aplicado').length });
  } catch (e) { next(e); }
});


// ---------- Cronograma padrão versionado (2026-10-19) ----------
// A equipe (master/pricetax) edita um rascunho compartilhado na tela de empresa e salva versões (1.0, 2.0, 3.0…). Empresas novas seguem a versão mais recente.

const orgOf = (req, res) => {
  const orgId = effectiveOrgId(req);
  if (!orgId) { res.status(400).json({ message: 'Escolha uma organização para ver o cronograma padrão.' }); return null; }
  return orgId;
};
const fail = (res, next, e) => (e && e.status ? res.status(e.status).json({ message: e.message }) : next(e));

// Forma de "empresa" que a tela de empresa entende (id fixo; só vive na tela enquanto o padrão está aberto).
const asProject = (draft) => ({
  id: STD_PLAN_ID, isStandardTemplate: true, kickoffDate: draft.kickoffDate || '',
  company: { cnpj: '', name: 'Cronograma padrão', nomeFantasia: 'Cronograma padrão', logo: '', color: '#F5C400', areas: [], status: 'ativo' },
  phases: draft.phases, activities: draft.activities, team: draft.team, log: [], meetings: [], externalContacts: [],
});

router.get('/template/draft', async (req, res, next) => {
  try {
    const orgId = orgOf(req, res); if (!orgId) return;
    const d = await getDraft(orgId);
    res.json({ project: asProject(d.draft), current: d.current, dirty: d.dirty, updatedBy: d.updatedBy, updatedAt: d.updatedAt });
  } catch (e) { fail(res, next, e); }
});

router.get('/template/draft/diff', async (req, res, next) => {
  try {
    const orgId = orgOf(req, res); if (!orgId) return;
    res.json(await draftDiff(orgId));
  } catch (e) { fail(res, next, e); }
});

router.patch('/template/draft', async (req, res, next) => {
  try {
    const orgId = orgOf(req, res); if (!orgId) return;
    const r = await saveDraft(orgId, req.user, req.body && req.body.project);
    res.json(r);
  } catch (e) { fail(res, next, e); }
});

router.post('/template/draft/discard', async (req, res, next) => {
  try {
    const orgId = orgOf(req, res); if (!orgId) return;
    await discardDraft(orgId);
    res.json({ ok: true });
  } catch (e) { fail(res, next, e); }
});

router.get('/template/versions', async (req, res, next) => {
  try {
    const orgId = orgOf(req, res); if (!orgId) return;
    res.json({ versions: await listVersions(orgId) });
  } catch (e) { fail(res, next, e); }
});

router.post('/template/versions', async (req, res, next) => {
  try {
    const orgId = orgOf(req, res); if (!orgId) return;
    const saved = await saveVersion(orgId, req.user, req.body && req.body.note);
    res.status(201).json(saved);
  } catch (e) { fail(res, next, e); }
});

router.post('/template/restore/:version', async (req, res, next) => {
  try {
    const orgId = orgOf(req, res); if (!orgId) return;
    const n = Number(req.params.version);
    if (!Number.isInteger(n) || n < 1) return res.status(400).json({ message: 'Versão inválida.' });
    await restoreVersion(orgId, req.user, n);
    res.json({ ok: true });
  } catch (e) { fail(res, next, e); }
});
