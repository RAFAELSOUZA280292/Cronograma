// Rotas da migração PipeRun (§84), montadas dentro de /api/crm. Só o ADMINISTRADOR do CRM (master/superadmin) opera a migração; arquivos de negócio seguem a permissão de leitura do CRM.
// O token do PipeRun chega no corpo da extração, vive só na memória da execução e nunca é gravado nem aparece em resposta ou log.
import { pool } from '../../db.js';
import { CrmError } from '../errors.js';
import { requireUuid } from '../service.js';
import { rawCounts, runExtract, purgeRaw, storeRaw } from './extract.js';
import { previewMigration, runMigration } from './migrate.js';
import { reconcile } from './reconcile.js';
import { startRun, progressWriter, finishRun, failRun, latestRuns, getRun } from './runs.js';

export function registerPiperunRoutes(router, { need, h, orgOf, actorOf }) {
  router.get('/migration/piperun', need('admin'), h(async (req, res) => {
    const orgId = orgOf(req);
    res.json({ ...(await rawCounts(orgId)), runs: await latestRuns(orgId) });
  }));
  router.get('/migration/piperun/runs/:id', need('admin'), h(async (req, res) => {
    const run = await getRun(orgOf(req), Number(req.params.id));
    if (!run) throw new CrmError(404, 'Execução não encontrada.');
    res.json({ run });
  }));

  router.post('/migration/piperun/extract', need('admin'), h(async (req, res) => {
    const orgId = orgOf(req); const actor = actorOf(req);
    const token = String((req.body || {}).token || '').trim();
    if (!token) throw new CrmError(400, 'Informe o token do PipeRun.');
    const started = await startRun(orgId, 'extract', actor);
    if (started.busy) throw new CrmError(409, 'Já existe uma extração ou importação em andamento. Aguarde terminar.');
    const pw = progressWriter(started.id);
    res.status(202).json({ runId: started.id });
    runExtract(orgId, token, { onProgress: (p) => pw.set(p) })
      .then(async (r) => { await pw.flush(); await finishRun(started.id, r); })
      .catch(async (e) => { await pw.flush(); await failRun(started.id, e && e.message); });
  }));

  // Carrega na cópia bruta só o histórico (`histories`) vindo do backup em arquivo — evita refazer a extração (e digitar o token) para aplicar o percurso real.
  router.post('/migration/piperun/raw/histories', need('admin'), h(async (req, res) => {
    const rows = (req.body || {}).rows;
    if (!Array.isArray(rows) || !rows.length || rows.length > 20000) throw new CrmError(400, 'Envie a lista de eventos do histórico (rows).');
    const bad = rows.filter((r) => !r || typeof r !== 'object' || r.id === undefined || r.id === null || r.deal_id === undefined);
    if (bad.length) throw new CrmError(400, `${bad.length} evento(s) sem id ou sem negócio — nada foi gravado.`);
    await storeRaw(orgOf(req), 'histories', rows);
    res.json({ stored: rows.length });
  }));

  router.get('/migration/piperun/preview', need('admin'), h(async (req, res) => {
    let ownerMap = {};
    try { ownerMap = req.query.ownerMap ? JSON.parse(String(req.query.ownerMap)) : {}; } catch { ownerMap = {}; }
    res.json(await previewMigration(orgOf(req), { ownerMap }));
  }));

  router.post('/migration/piperun/import', need('admin'), h(async (req, res) => {
    const orgId = orgOf(req); const actor = actorOf(req);
    const { ownerMap, includeFiles } = req.body || {};
    const started = await startRun(orgId, 'import', actor);
    if (started.busy) throw new CrmError(409, 'Já existe uma extração ou importação em andamento. Aguarde terminar.');
    const pw = progressWriter(started.id);
    res.status(202).json({ runId: started.id });
    runMigration(orgId, actor, { ownerMap: ownerMap && typeof ownerMap === 'object' ? ownerMap : {}, includeFiles: includeFiles !== false, onProgress: (p) => pw.set(p) })
      .then(async (r) => { await pw.flush(); await finishRun(started.id, r); })
      .catch(async (e) => { await pw.flush(); await failRun(started.id, e && e.message); });
  }));

  router.get('/migration/piperun/report', need('admin'), h(async (req, res) => res.json(await reconcile(orgOf(req)))));

  router.post('/migration/piperun/purge', need('admin'), h(async (req, res) => {
    if (!(req.body && req.body.confirm === true)) throw new CrmError(400, 'Confirme a exclusão da cópia bruta (confirm: true). Nada foi apagado.');
    res.json({ deleted: await purgeRaw(orgOf(req)), note: 'A cópia bruta do PipeRun (dados pessoais) foi apagada do servidor. O mapa de IDs foi mantido para não duplicar numa reimportação.' });
  }));

  // Arquivos do negócio (documentos importados do PipeRun)
  router.get('/deals/:id/files', need('read'), h(async (req, res) => {
    requireUuid(req.params.id, 'Negócio');
    const { rows } = await pool.query(`SELECT id, name, mime, size, source, created_at FROM crm_deal_files WHERE org_id=$1 AND deal_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC`, [orgOf(req), req.params.id]);
    res.json({ files: rows.map((r) => ({ id: r.id, name: r.name, mime: r.mime, size: r.size, source: r.source, createdAt: r.created_at })) });
  }));
  router.get('/deal-files/:fileId/download', need('read'), h(async (req, res) => {
    requireUuid(req.params.fileId, 'Arquivo');
    const { rows } = await pool.query(`SELECT name, mime, data FROM crm_deal_files WHERE org_id=$1 AND id=$2 AND deleted_at IS NULL`, [orgOf(req), req.params.fileId]);
    if (!rows[0]) throw new CrmError(404, 'Arquivo não encontrado.');
    res.set({ 'Content-Type': rows[0].mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(rows[0].name)}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    res.send(rows[0].data);
  }));
}
