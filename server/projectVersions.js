import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { canAccessProject, effectiveOrgId } from './routes.js';
import { syncProjectMemoryFromDiff } from './memoryIngest.js';
import { diffSchedules, restoreSchedule, scheduleOf, statsOf } from '../shared/scheduleVersion.js';

// Histórico de versões do cronograma (§83): consultar, comparar, criar ponto de restauração, restaurar (com backup automático do estado atual) e recuperar empresa excluída.
// Ver: Master e PRICETAX com acesso à empresa. Restaurar e recuperar empresa excluída: só Master (ou superadmin). Cliente nunca vê histórico.
export const router = Router();
router.use(requireAuth);

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const canView = (u) => !!u && (u.role === 'master' || u.role === 'pricetax' || u.isSuperAdmin);
const canRestore = (u) => !!u && (u.role === 'master' || u.isSuperAdmin);
const actorName = (u) => u.name || u.username || '';
const KINDS = new Set(['auto', 'manual', 'pre_restore', 'pre_delete']);

function guard(req, res, { restore = false } = {}) {
  if (restore ? !canRestore(req.user) : !canView(req.user)) {
    res.status(403).json({ message: restore ? 'Só administradores (Master) restauram versões.' : 'Sem permissão para ver o histórico de versões.' });
    return false;
  }
  return true;
}

async function loadProject(req, res, client) {
  const run = client || pool;
  const { rows } = await run.query(`SELECT data, org_id FROM projects WHERE id=$1${client ? ' FOR UPDATE' : ''}`, [req.params.id]);
  const r = rows[0];
  if (!r || !canAccessProject(req.user, r.data, r.org_id)) { res.status(404).json({ message: 'Empresa não encontrada.' }); return null; }
  return r;
}

const META_COLS = 'id, created_at, kind, label, actor_name, origin, company_name, stats, touched, restored_from, last_write_at';
const metaOf = (r) => ({
  id: Number(r.id), createdAt: r.created_at, kind: r.kind, label: r.label, actorName: r.actor_name, origin: r.origin, stats: r.stats, touched: r.touched,
  restoredFrom: r.restored_from == null ? null : Number(r.restored_from), lastWriteAt: r.last_write_at,
});

const KIND_NAMES = { auto: 'Automática', manual: 'Ponto de restauração', pre_restore: 'Backup antes de restaurar', pre_delete: 'Antes de excluir a empresa' };

router.get('/:id/versions', async (req, res, next) => {
  try {
    if (!guard(req, res)) return;
    const p = await loadProject(req, res); if (!p) return;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const before = Number(req.query.before) || null;
    const kind = KINDS.has(String(req.query.kind)) ? String(req.query.kind) : null;
    const params = [req.params.id, p.org_id]; let where = 'project_id=$1 AND org_id IS NOT DISTINCT FROM $2';
    if (before) { params.push(before); where += ` AND id < $${params.length}`; }
    if (kind) { params.push(kind); where += ` AND kind = $${params.length}`; }
    params.push(limit + 1);
    const { rows } = await pool.query(`SELECT ${META_COLS} FROM project_versions WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`, params);
    res.json({ versions: rows.slice(0, limit).map(metaOf), hasMore: rows.length > limit, current: statsOf(p.data), canRestore: canRestore(req.user), kindNames: KIND_NAMES });
  } catch (e) { next(e); }
});

async function resolveRef(ref, projectData, projectId, orgId) {
  if (ref === 'current') return { snapshot: scheduleOf(projectData), label: 'Estado atual' };
  const id = Number(ref);
  if (!Number.isInteger(id)) return null;
  const { rows } = await pool.query(`SELECT ${META_COLS}, snapshot FROM project_versions WHERE id=$1 AND project_id=$2 AND org_id IS NOT DISTINCT FROM $3`, [id, projectId, orgId]);
  if (!rows[0]) return null;
  return { snapshot: scheduleOf(rows[0].snapshot), meta: metaOf(rows[0]), label: `Versão #${id}` };
}

// Comparar duas versões (ou uma versão com o estado atual): ?from=<id|current>&to=<id|current>. "from" é o antes, "to" é o depois.
router.get('/:id/diff', async (req, res, next) => {
  try {
    if (!guard(req, res)) return;
    const p = await loadProject(req, res); if (!p) return;
    const from = await resolveRef(String(req.query.from || ''), p.data, req.params.id, p.org_id);
    const to = await resolveRef(String(req.query.to || 'current'), p.data, req.params.id, p.org_id);
    if (!from || !to) return res.status(404).json({ message: 'Versão não encontrada.' });
    res.json({ from: { label: from.label, meta: from.meta || null, stats: statsOf(from.snapshot) }, to: { label: to.label, meta: to.meta || null, stats: statsOf(to.snapshot) }, diff: diffSchedules(from.snapshot, to.snapshot) });
  } catch (e) { next(e); }
});

router.post('/:id/versions', async (req, res, next) => {
  try {
    if (!guard(req, res)) return;
    const p = await loadProject(req, res); if (!p) return;
    const label = clip(req.body && req.body.label, 120).trim();
    if (!label) return res.status(400).json({ message: 'Dê um nome ao ponto de restauração (ex.: "Antes de reorganizar a fase 2").' });
    const snap = scheduleOf(p.data);
    const { rows } = await pool.query(
      `INSERT INTO project_versions (project_id, org_id, kind, label, actor_id, actor_name, origin, company_name, snapshot, stats, last_write_at)
       VALUES ($1,$2,'manual',$3,$4,$5,'Ponto de restauração manual',$6,$7,$8,now()) RETURNING ${META_COLS}`,
      [req.params.id, p.org_id, label, req.user.id, actorName(req.user), clip((p.data.company && (p.data.company.nomeFantasia || p.data.company.name)) || '', 120), JSON.stringify(snap), JSON.stringify(statsOf(snap))]);
    res.status(201).json({ version: metaOf(rows[0]) });
  } catch (e) { next(e); }
});

// Restaurar: tudo-ou-nada, dentro de uma transação, com o estado atual salvo antes (`pre_restore`) para poder desfazer.
//   { dryRun: true }  -> só mostra o que mudaria (e avisos), sem gravar;
//   { confirm: true } -> grava. Sem a confirmação explícita nada é gravado.
//   { activityIds: [...] } -> restauração parcial: só essas atividades voltam à versão.
router.post('/:id/versions/:vid/restore', async (req, res, next) => {
  if (!guard(req, res, { restore: true })) return;
  const vid = Number(req.params.vid);
  if (!Number.isInteger(vid)) return res.status(400).json({ message: 'Versão inválida.' });
  const body = req.body || {};
  const dryRun = body.dryRun === true;
  if (!dryRun && body.confirm !== true) return res.status(400).json({ message: 'Confirme a restauração (confirm: true). Nada foi alterado.' });
  const activityIds = Array.isArray(body.activityIds) ? body.activityIds.map((x) => clip(x, 80)).filter(Boolean).slice(0, 200) : null;
  const note = clip(body.note, 200);
  const client = await pool.connect();
  let committed = null;
  try {
    await client.query('BEGIN');
    const p = await loadProject(req, res, client);
    if (!p) { await client.query('ROLLBACK'); return; }
    const v = await client.query(`SELECT ${META_COLS}, snapshot FROM project_versions WHERE id=$1 AND project_id=$2 AND org_id IS NOT DISTINCT FROM $3`, [vid, req.params.id, p.org_id]);
    if (!v.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Versão não encontrada.' }); }
    if (v.rows[0].kind === 'pre_delete') { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Esta versão é de uma empresa excluída. Use "Empresas excluídas" para recriá-la.' }); }
    const who = actorName(req.user);
    const out = restoreSchedule(p.data, v.rows[0].snapshot, { activityIds, by: `Restauração da versão #${vid} (${who})`, now: new Date().toISOString() });
    if (out.report.errors.length) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'A restauração foi bloqueada para proteger os vínculos do cronograma. Nada foi alterado.', errors: out.report.errors }); }
    const diff = diffSchedules(scheduleOf(p.data), scheduleOf(out.data));
    if (dryRun) { await client.query('ROLLBACK'); return res.json({ dryRun: true, version: metaOf(v.rows[0]), report: out.report, diff }); }
    const cur = scheduleOf(p.data);
    const label = `Antes de restaurar a versão #${vid}${activityIds ? ` (${activityIds.length} atividade(s))` : ''}${note ? ` — ${note}` : ''}`;
    const backup = await client.query(
      `INSERT INTO project_versions (project_id, org_id, kind, label, actor_id, actor_name, origin, company_name, snapshot, stats, restored_from, last_write_at)
       VALUES ($1,$2,'pre_restore',$3,$4,$5,'Restauração de versão',$6,$7,$8,$9,now()) RETURNING id`,
      [req.params.id, p.org_id, label, req.user.id, who, clip((p.data.company && (p.data.company.nomeFantasia || p.data.company.name)) || '', 120), JSON.stringify(cur), JSON.stringify(statsOf(cur)), vid]);
    const backupId = Number(backup.rows[0].id);
    const entry = { ts: new Date().toISOString(), action: `Versão #${vid} restaurada${activityIds ? ` (parcial: ${activityIds.length} atividade(s))` : ''} por ${who}. Backup do estado anterior: versão #${backupId}.${note ? ` Motivo: ${note}` : ''}`, user: who, activityId: null };
    out.data.log = [entry, ...(Array.isArray(out.data.log) ? out.data.log : [])].slice(0, 300);
    await client.query(`SELECT set_config('app.version_skip', '1', true)`); // o backup acima já é o ponto desta gravação
    await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(out.data), req.params.id]);
    await client.query('COMMIT');
    committed = { p, data: out.data };
    res.json({ ok: true, restoredVersion: vid, backupVersionId: backupId, report: out.report, diff: diff.summary });
  } catch (e) { try { await client.query('ROLLBACK'); } catch { /* já encerrada */ } next(e); } finally { client.release(); }
  if (committed) syncProjectMemoryFromDiff(pool, committed.p.org_id, req.params.id, committed.p.data, committed.data).catch((e) => console.error('Falha ao reindexar memória após restauração', e.message));
});

// ---- Empresas excluídas (só Master): a última versão `pre_delete` de cada empresa que não existe mais.
router.get('/deleted/list', async (req, res, next) => {
  try {
    if (!guard(req, res, { restore: true })) return;
    const orgId = effectiveOrgId(req);
    const sql = `SELECT DISTINCT ON (v.project_id) v.id, v.project_id, v.created_at, v.actor_name, v.company_name, v.stats FROM project_versions v
                 WHERE v.kind='pre_delete' AND ${req.user.isSuperAdmin && !orgId ? 'true' : 'v.org_id = $1'} AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = v.project_id)
                 ORDER BY v.project_id, v.id DESC`;
    const { rows } = await pool.query(sql, req.user.isSuperAdmin && !orgId ? [] : [orgId]);
    res.json({ deleted: rows.map((r) => ({ versionId: Number(r.id), projectId: r.project_id, deletedAt: r.created_at, deletedBy: r.actor_name, companyName: r.company_name, stats: r.stats })).sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)) });
  } catch (e) { next(e); }
});

router.post('/deleted/:vid/restore', async (req, res, next) => {
  try {
    if (!guard(req, res, { restore: true })) return;
    if (!(req.body && req.body.confirm === true)) return res.status(400).json({ message: 'Confirme a recriação da empresa (confirm: true). Nada foi alterado.' });
    const vid = Number(req.params.vid);
    const orgId = effectiveOrgId(req);
    const { rows } = await pool.query(`SELECT id, project_id, org_id, kind, snapshot FROM project_versions WHERE id=$1`, [Number.isInteger(vid) ? vid : -1]);
    const v = rows[0];
    if (!v || v.kind !== 'pre_delete' || !(req.user.isSuperAdmin || v.org_id === orgId)) return res.status(404).json({ message: 'Versão de empresa excluída não encontrada.' });
    const exists = await pool.query('SELECT 1 FROM projects WHERE id=$1', [v.project_id]);
    if (exists.rows[0]) return res.status(409).json({ message: 'Esta empresa já existe. Nada foi alterado.' });
    const who = actorName(req.user);
    const data = v.snapshot;
    data.log = [{ ts: new Date().toISOString(), action: `Empresa recriada a partir da versão #${vid} por ${who}.`, user: who, activityId: null }, ...(Array.isArray(data.log) ? data.log : [])].slice(0, 300);
    await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [v.project_id, JSON.stringify(data), v.org_id]);
    res.status(201).json({ ok: true, projectId: v.project_id, note: 'O documento da empresa (cronograma, reuniões, tarefas, comentários) voltou. Links públicos, dossiês e reservas de agenda dessa empresa foram apagados junto com a exclusão e precisam ser refeitos.' });
  } catch (e) { next(e); }
});

// ---- Retenção: tudo por 2 anos (VERSIONS_KEEP_DAYS); automáticas com mais de 90 dias (VERSIONS_FULL_DAYS) ficam uma por semana; empresa excluída por 1 ano.
export const VERSION_RETENTION = {
  fullDays: Math.max(7, Number(process.env.VERSIONS_FULL_DAYS) || 90),
  keepDays: Math.max(90, Number(process.env.VERSIONS_KEEP_DAYS) || 730),
  deletedDays: Math.max(30, Number(process.env.VERSIONS_DELETED_DAYS) || 365),
};

export async function pruneProjectVersions(r = VERSION_RETENTION) {
  const old = await pool.query(`DELETE FROM project_versions WHERE created_at < now() - ($1 || ' days')::interval`, [String(r.keepDays)]);
  const del = await pool.query(`DELETE FROM project_versions WHERE kind='pre_delete' AND created_at < now() - ($1 || ' days')::interval`, [String(r.deletedDays)]);
  const thin = await pool.query(
    `DELETE FROM project_versions WHERE id IN (
       SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY project_id, date_trunc('week', created_at) ORDER BY id DESC) rn
                       FROM project_versions WHERE kind='auto' AND created_at < now() - ($1 || ' days')::interval) t WHERE rn > 1)`, [String(r.fullDays)]);
  return { expired: old.rowCount, deletedCompanies: del.rowCount, thinned: thin.rowCount };
}

export function startVersionRetentionJob() {
  const run = () => pruneProjectVersions().then((x) => { if (x.expired || x.deletedCompanies || x.thinned) console.log(`Versões do cronograma: ${x.thinned} automáticas antigas condensadas, ${x.expired} expiradas, ${x.deletedCompanies} de empresas excluídas removidas.`); }).catch((e) => console.error('Retenção de versões: falha', e.message));
  setTimeout(run, 90000).unref();
  setInterval(run, 24 * 3600 * 1000).unref();
}
