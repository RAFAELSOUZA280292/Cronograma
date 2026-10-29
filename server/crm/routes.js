// CRM PRICETAX — rotas (/api/crm). Fase 1 (2026-09-20, PROJECT_CONTEXT.md §54).
// Router criado por fábrica: em produção usa requireAuth; nos testes uma
// função de autenticação falsa entra no lugar — assim as rotas são testadas de
// ponta a ponta sem fabricar sessão. Nenhuma rota escreve SQL: tudo passa por
// service.js (escrita, com auditoria+timeline) e queries.js (leitura).
import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { effectiveOrgId } from '../routes.js';
import { lookupCnpj } from '../cnpjLookup.js';
import { CrmError } from './errors.js';
import { crmCan, crmCapabilities, crmLenses } from './permissions.js';
import { onlyDigits } from './text.js';
import { isValidCnpj } from './cnpj.js';
import { findCompanyDuplicates, findContactDuplicates } from './duplicates.js';
import * as S from './service.js';
import * as Q from './queries.js';
import * as I from './importer.js';
import * as BS from './bootstrap.js';
import * as D from './deals.js';
import * as DQ from './dealQueries.js';
import { exportDealsXlsx } from './dealExport.js';
import * as P from './products.js';
import * as A from './activities.js';
import * as AQ from './activityQueries.js';
import * as F from './funnels.js';
import * as X from './extras.js';
import * as V from './views.js';
import * as DB from './dashboards.js';
import * as DI from './dealImporter.js';
import './googleSync.js'; // registra o espelho das atividades no Google Calendar do responsável
import { mapCnpjSuggestion } from './cnpjSuggestion.js';
import { registerPiperunRoutes } from './piperun/routes.js';

const need = (cap) => (req, res, next) => {
  if (!crmCan(req.user, cap)) return res.status(403).json({ message: 'Você não tem permissão pra isso no CRM.' });
  return next();
};

// Editar, concluir, cancelar ou reabrir uma atividade: só o responsável, quem a criou ou a gestão (`remove`) — M8, 2026-10-29. Atividade inexistente segue para o 404 de sempre.
const ownActivity = async (req, res, next) => {
  try {
    if (crmCan(req.user, 'remove')) return next();
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id || '')) return next();
    const { rows } = await pool.query('SELECT owner_id, created_by FROM crm_activities WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL', [req.params.id, orgOf(req)]);
    if (!rows[0] || rows[0].owner_id === req.user.id || rows[0].created_by === req.user.id) return next();
    return res.status(403).json({ message: 'Só o responsável pela atividade, quem a criou ou a gestão pode alterá-la.' });
  } catch (e) { return next(e); }
};

const h = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); } catch (e) {
    if (e instanceof CrmError) return res.status(e.status).json({ message: e.message, ...e.extra });
    return next(e);
  }
};

const orgOf = (req) => effectiveOrgId(req);
// `req.crmActor` só existe na entrada por chave de API (/api/connect/crm, §99): a ação fica registrada como "Claude Code (por <dono da chave>)".
const actorOf = (req) => (req.crmActor ? { ...req.crmActor, skipGoogle: !(req.body && req.body.syncGoogle === true) } : null) || (req.renataCommandId !== undefined
  ? { id: req.user.id, name: `RENATA (IA, a pedido de ${req.user.name || req.user.username})`, viaApi: true }
  : { id: req.user.id, name: req.user.name || req.user.username });

export function createCrmRouter({ auth = [requireAuth] } = {}) {
  const router = Router();
  router.use(...auth);
  router.use(need('read'));

  router.get('/me', (req, res) => res.json({ capabilities: crmCapabilities(req.user) }));
  router.get('/options', h(async (req, res) => res.json(await Q.options(orgOf(req)))));
  router.get('/overview', h(async (req, res) => {
    const lens = String(req.query.lens || '');
    if (!lens) return res.json(await Q.overview(orgOf(req), req.user.id));
    if (!V.LENSES.includes(lens)) throw new CrmError(400, 'Painel inválido.');
    if (!crmLenses(req.user).includes(lens)) throw new CrmError(403, 'Este painel não faz parte do seu perfil.');
    return res.json(lens === 'accounts' ? { lens, ...(await Q.overview(orgOf(req), req.user.id)) } : await DB.lensOverview(orgOf(req), req.user.id, lens));
  }));

  // Visões salvas (filtros de Negócios) e página inicial por pessoa (§98). Pessoal: qualquer um que lê; compartilhada: quem tem 'funnel'.
  router.get('/views', h(async (req, res) => res.json({ views: await V.listViews(orgOf(req), req.user.id, req.query.scope || 'deals'), defaults: await V.getDefaults(orgOf(req), req.user.id) })));
  router.post('/views', h(async (req, res) => res.status(201).json({ view: await V.createView(orgOf(req), req.user, req.body || {}, { canShare: crmCan(req.user, 'funnel') }) })));
  router.put('/views-default', h(async (req, res) => res.json(await V.setDefault(orgOf(req), req.user, (req.body || {}).scope, (req.body || {}).ref))));
  router.patch('/views/:id', h(async (req, res) => res.json({ view: await V.updateView(orgOf(req), req.user, req.params.id, req.body || {}, { canShare: crmCan(req.user, 'funnel') }) })));
  router.delete('/views/:id', h(async (req, res) => res.json(await V.deleteView(orgOf(req), req.user, req.params.id, { canShare: crmCan(req.user, 'funnel') }))));
  router.get('/search', h(async (req, res) => res.json(await Q.search(orgOf(req), req.query.q))));

  // Cadastro rápido: digita o CNPJ, o resto vem da Receita (com cache) — e já diz se é duplicado.
  router.get('/cnpj/:cnpj', need('write'), h(async (req, res) => {
    const digits = onlyDigits(req.params.cnpj);
    if (!isValidCnpj(digits)) throw new CrmError(400, 'CNPJ inválido. Confira os 14 dígitos.');
    const duplicates = await findCompanyDuplicates(pool, orgOf(req), { cnpj: digits });
    const r = await lookupCnpj(digits);
    if (r.erro) return res.json({ found: false, message: r.erro, duplicates });
    return res.json({ found: true, suggestion: mapCnpjSuggestion(r), duplicates, fromCache: !!r.fromCache });
  }));

  // ---- empresas
  router.get('/companies', h(async (req, res) => {
    if (req.query.deleted === 'true' && !crmCan(req.user, 'admin')) throw new CrmError(403, 'Só administradores veem empresas excluídas.');
    res.json(await Q.listCompanies(orgOf(req), { ...req.query, deleted: req.query.deleted === 'true' }));
  }));
  router.post('/companies/check-duplicates', need('write'), h(async (req, res) => {
    const b = req.body || {};
    res.json(await findCompanyDuplicates(pool, orgOf(req), { cnpj: b.cnpj, legalName: b.legalName, tradeName: b.tradeName, excludeId: S.isUuid(b.excludeId) ? b.excludeId : null }));
  }));
  router.post('/companies', need('write'), h(async (req, res) => {
    const { force, ...input } = req.body || {};
    res.status(201).json({ company: await S.createCompany(orgOf(req), actorOf(req), input, { force: !!force }) });
  }));
  router.get('/companies/:id', h(async (req, res) => {
    const out = await Q.getCompanyOverview(orgOf(req), req.params.id);
    // Empresa excluída só abre para o administrador (a tela de restaurar precisa dela); para os demais é como se não existisse (M8).
    if (out && out.company && out.company.deletedAt && !crmCan(req.user, 'admin')) throw new CrmError(404, 'Empresa não encontrada.');
    res.json(out);
  }));
  router.patch('/companies/:id', need('write'), h(async (req, res) => {
    const { force, ...input } = req.body || {};
    res.json({ company: await S.updateCompany(orgOf(req), actorOf(req), req.params.id, input, { force: !!force }) });
  }));
  router.delete('/companies/:id', need('remove'), h(async (req, res) => res.json(await S.deleteCompany(orgOf(req), actorOf(req), req.params.id))));
  router.post('/companies/:id/restore', need('admin'), h(async (req, res) => res.json({ company: await S.restoreCompany(orgOf(req), actorOf(req), req.params.id) })));
  router.post('/companies/:id/merge', need('remove'), h(async (req, res) => res.json(await S.mergeCompanies(orgOf(req), actorOf(req), req.params.id, (req.body || {}).intoId))));
  router.get('/companies/:id/timeline', h(async (req, res) => res.json({ events: await Q.listTimeline(orgOf(req), req.params.id, { limit: req.query.limit, before: req.query.before || null }) })));
  router.get('/companies/:id/audit', need('remove'), h(async (req, res) => res.json({ logs: await Q.listAudit(orgOf(req), 'company', req.params.id) })));
  router.post('/companies/:id/projects', need('write'), h(async (req, res) => res.json(await S.linkProject(orgOf(req), actorOf(req), req.params.id, String((req.body || {}).projectId || '')))));
  router.delete('/companies/:id/projects/:projectId', need('write'), h(async (req, res) => res.json(await S.unlinkProject(orgOf(req), actorOf(req), req.params.id, req.params.projectId))));

  // Projetos do cronograma que ainda não estão ligados a nenhuma empresa do CRM (pra ligar na mão).
  // Empresa do CRM a partir do projeto do cronograma (Onda 5): alimenta "Abrir no CRM". 404 = esse projeto ainda não está no CRM.
  router.get('/companies/by-project/:projectId', h(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.legal_name, c.trade_name FROM crm_company_projects cp JOIN crm_companies c ON c.id = cp.company_id
       WHERE cp.project_id=$1 AND c.org_id=$2 AND c.deleted_at IS NULL ORDER BY cp.linked_at LIMIT 1`, [String(req.params.projectId).slice(0, 80), orgOf(req)]);
    if (!rows[0]) return res.status(404).json({ message: 'Esta empresa ainda não está no CRM.' });
    res.json({ company: { id: rows[0].id, name: rows[0].trade_name || rows[0].legal_name } });
  }));
  router.get('/projects-available', need('write'), h(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT p.id, p.data->'company'->>'name' AS name, p.data->'company'->>'cnpj' AS cnpj FROM projects p
       WHERE p.org_id=$1 AND NOT EXISTS (SELECT 1 FROM crm_company_projects cp WHERE cp.project_id = p.id) ORDER BY lower(p.data->'company'->>'name')`, [orgOf(req)]);
    res.json({ projects: rows.map((r) => ({ id: r.id, name: r.name || 'Projeto', cnpj: r.cnpj || '' })) });
  }));

  // ---- contatos
  router.get('/contacts', h(async (req, res) => res.json(await Q.listContacts(orgOf(req), req.query))));
  router.get('/contacts/:id', h(async (req, res) => res.json({ contact: await Q.getContact(orgOf(req), req.params.id) })));
  router.post('/contacts/check-duplicates', need('write'), h(async (req, res) => {
    const b = req.body || {};
    res.json({ contacts: await findContactDuplicates(pool, orgOf(req), { email: b.email, phone: b.phone, whatsapp: b.whatsapp, excludeId: S.isUuid(b.excludeId) ? b.excludeId : null }) });
  }));
  router.post('/contacts', need('write'), h(async (req, res) => {
    const { force, ...input } = req.body || {};
    res.status(201).json({ contact: await S.createContact(orgOf(req), actorOf(req), input, { force: !!force }) });
  }));
  router.patch('/contacts/:id', need('write'), h(async (req, res) => {
    const { force, ...input } = req.body || {};
    res.json({ contact: await S.updateContact(orgOf(req), actorOf(req), req.params.id, input, { force: !!force }) });
  }));
  router.delete('/contacts/:id', need('remove'), h(async (req, res) => res.json(await S.deleteContact(orgOf(req), actorOf(req), req.params.id))));

  // ---- negócios / pipeline (Fase 2)
  router.get('/pipeline', h(async (req, res) => res.json(await DQ.getPipeline(orgOf(req), req.query.pipelineId || null))));

  // ---- funis e etapas (Fase 2b): todos leem; gestor+ configura
  router.get('/pipelines', h(async (req, res) => res.json({ pipelines: await F.listPipelines(orgOf(req)) })));
  router.post('/pipelines', need('funnel'), h(async (req, res) => res.status(201).json({ pipelines: await F.createPipeline(orgOf(req), actorOf(req), req.body || {}) })));
  router.patch('/pipelines/:id', need('funnel'), h(async (req, res) => res.json({ pipelines: await F.updatePipeline(orgOf(req), actorOf(req), req.params.id, req.body || {}) })));
  router.delete('/pipelines/:id', need('funnel'), h(async (req, res) => res.json({ pipelines: await F.deletePipeline(orgOf(req), actorOf(req), req.params.id) })));
  router.post('/pipelines/:id/stages', need('funnel'), h(async (req, res) => res.json({ pipelines: await F.saveStages(orgOf(req), actorOf(req), req.params.id, (req.body || {}).stages) })));
  router.get('/board', h(async (req, res) => res.json(await DQ.getBoard(orgOf(req), req.query))));
  router.get('/deals', h(async (req, res) => res.json(await DQ.listDeals(orgOf(req), req.query))));
  router.post('/deals', need('write'), h(async (req, res) => {
    const deal = await D.createDeal(orgOf(req), actorOf(req), req.body || {});
    res.status(201).json({ deal, cadence: (req.body || {}).skipCadence ? { scheduled: null, cancelled: 0, skipped: true } : await X.cadenceAfterMove(orgOf(req), actorOf(req), deal) });
  }));
  // Excel dos negócios com os mesmos filtros da tela (§116c). Vem antes de /deals/:id para "export.xlsx" não virar um id.
  router.get('/deals/export.xlsx', need('export'), h(async (req, res) => {
    const q = req.query || {};
    const r = await exportDealsXlsx(orgOf(req), { q: q.q, type: q.type, ownerId: q.ownerId, source: q.source, tag: q.tag, attention: q.attention, status: q.status, pipelineId: q.pipelineId, stageId: q.stageId });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"; filename*=UTF-8''${encodeURIComponent(r.filename)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Export-Count', String(r.count)); res.setHeader('X-Export-Total', String(r.total));
    res.send(r.buffer);
  }));
  router.get('/deals/:id', h(async (req, res) => res.json(await DQ.getDealDetail(orgOf(req), req.params.id))));
  router.patch('/deals/:id', need('write'), h(async (req, res) => res.json({ deal: await D.updateDeal(orgOf(req), actorOf(req), req.params.id, req.body || {}, { canEditClosed: crmCan(req.user, 'remove') }) })));
  router.post('/leads', need('write'), h(async (req, res) => res.status(201).json(await X.quickLead(orgOf(req), actorOf(req), req.body || {}))));
  // Conteúdo de um anexo de nota (imagem/PDF), sob demanda: a lista de notas vem só com nome/tipo/tamanho e esta `url`.
  router.get('/notes/:noteId/attachments/:attId', need('read'), h(async (req, res) => {
    S.requireUuid(req.params.noteId, 'Nota');
    const { rows } = await pool.query(`SELECT attachments FROM crm_notes WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`, [req.params.noteId, orgOf(req)]);
    const att = rows[0] && (rows[0].attachments || []).find((a) => a.id === req.params.attId);
    const m = att && /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(String(att.dataUrl || ''));
    if (!m) throw new CrmError(404, 'Anexo não encontrado.');
    const type = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i.test(m[1]) ? m[1].toLowerCase() : 'application/octet-stream';
    res.set({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400', 'Content-Security-Policy': "default-src 'none'; sandbox",
      ...(type === 'application/octet-stream' || type === 'application/pdf' ? { 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.name || 'anexo')}` } : {}) });
    res.send(m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3])));
  }));
  router.get('/cadences', h(async (req, res) => res.json({ cadences: await X.listCadences(orgOf(req)) })));
  router.post('/cadences', need('funnel'), h(async (req, res) => res.status(201).json({ cadence: await X.saveCadence(orgOf(req), actorOf(req), req.body || {}) })));
  router.patch('/cadences/:id', need('funnel'), h(async (req, res) => res.json({ cadence: await X.saveCadence(orgOf(req), actorOf(req), req.body || {}, req.params.id) })));
  router.delete('/cadences/:id', need('funnel'), h(async (req, res) => res.json(await X.deleteCadence(orgOf(req), actorOf(req), req.params.id))));
  router.get('/tags', h(async (req, res) => res.json({ tags: await X.listTags(orgOf(req)) })));
  router.put('/deals/:id/tags', need('write'), h(async (req, res) => res.json({ tags: await X.setDealTags(orgOf(req), actorOf(req), req.params.id, (req.body || {}).tags) })));
  router.post('/deals/:id/move', need('write'), h(async (req, res) => {
    const deal = await D.moveDeal(orgOf(req), actorOf(req), req.params.id, req.body || {}, { canEditClosed: crmCan(req.user, 'remove') });
    res.json({ deal, cadence: await X.cadenceAfterMove(orgOf(req), actorOf(req), deal) });
  }));
  router.delete('/deals/:id', need('remove'), h(async (req, res) => res.json(await D.deleteDeal(orgOf(req), actorOf(req), req.params.id))));
  router.get('/deals/:id/audit', need('remove'), h(async (req, res) => res.json({ logs: await Q.listAudit(orgOf(req), 'deal', req.params.id) })));

  // ---- atividades / follow-ups (Fase 3). ownerId=me vira o usuário logado.
  router.get('/activities', h(async (req, res) => res.json(await AQ.listActivities(orgOf(req), { ...req.query, ownerId: req.query.ownerId === 'me' ? req.user.id : req.query.ownerId }))));
  router.get('/activities/:id', h(async (req, res) => {
    S.requireUuid(req.params.id, 'Atividade');
    const row = await A.loadActivity(pool, orgOf(req), req.params.id);
    if (!row) throw new CrmError(404, 'Atividade não encontrada.');
    res.json({ activity: A.mapActivity(row) });
  }));
  router.post('/activities', need('write'), h(async (req, res) => {
    const { alreadyDone, ...input } = req.body || {};
    res.status(201).json({ activity: await A.createActivity(orgOf(req), actorOf(req), input, { alreadyDone: !!alreadyDone }) });
  }));
  router.patch('/activities/:id', need('write'), ownActivity, h(async (req, res) => {
    // `silentNotify:true` (só pela chave de API) reatribui sem disparar o aviso "atividade atribuída a você" — para transferências em lote.
    const quiet = !!((req.crmActor || req.renataCommandId !== undefined) && req.body && req.body.silentNotify === true);
    res.json({ activity: await A.updateActivity(orgOf(req), quiet ? { ...actorOf(req), silentNotify: true } : actorOf(req), req.params.id, req.body || {}) });
  }));
  router.post('/activities/:id/complete', need('write'), ownActivity, h(async (req, res) => {
    const activity = await A.completeActivity(orgOf(req), actorOf(req), req.params.id, req.body || {});
    res.json({ activity, next: await X.cadenceAfterComplete(orgOf(req), actorOf(req), activity.id) });
  }));
  router.post('/activities/:id/cancel', need('write'), ownActivity, h(async (req, res) => res.json({ activity: await A.cancelActivity(orgOf(req), actorOf(req), req.params.id) })));
  router.post('/activities/:id/reopen', need('write'), ownActivity, h(async (req, res) => res.json({ activity: await A.reopenActivity(orgOf(req), actorOf(req), req.params.id) })));
  router.delete('/activities/:id', need('remove'), h(async (req, res) => res.json(await A.deleteActivity(orgOf(req), actorOf(req), req.params.id))));

  // ---- produtos (catálogo): todos leem; quem define o que se vende é gestor+
  router.get('/products', h(async (req, res) => res.json({ products: await P.listProducts(orgOf(req), { includeInactive: req.query.all === 'true' && crmCan(req.user, 'catalog') }) })));
  router.post('/products', need('catalog'), h(async (req, res) => res.status(201).json({ product: await P.createProduct(orgOf(req), actorOf(req), req.body || {}) })));
  router.patch('/products/:id', need('catalog'), h(async (req, res) => res.json({ product: await P.updateProduct(orgOf(req), actorOf(req), req.params.id, req.body || {}) })));
  router.delete('/products/:id', need('catalog'), h(async (req, res) => res.json(await P.deleteProduct(orgOf(req), actorOf(req), req.params.id))));

  // ---- notas
  router.post('/notes', need('write'), h(async (req, res) => res.status(201).json({ note: await S.addNote(orgOf(req), actorOf(req), req.body || {}) })));
  router.patch('/notes/:id', need('write'), h(async (req, res) => res.json({ note: await S.updateNote(orgOf(req), actorOf(req), req.params.id, req.body || {}) })));
  router.delete('/notes/:id', need('write'), h(async (req, res) => res.json(await S.deleteNote(orgOf(req), actorOf(req), req.params.id, { canModerate: crmCan(req.user, 'remove') }))));

  // ---- importação (planilha) e clientes atuais do painel
  router.get('/import/fields', need('import'), (req, res) => res.json({ companies: I.COMPANY_IMPORT_FIELDS, contacts: I.CONTACT_IMPORT_FIELDS, maxRows: I.MAX_IMPORT_ROWS }));
  router.post('/import/preview', need('import'), h(async (req, res) => {
    const { target, rows } = req.body || {};
    res.json(await I.previewImport(orgOf(req), target === 'contacts' ? 'contacts' : 'companies', rows));
  }));
  router.post('/import/commit', need('import'), h(async (req, res) => {
    const { target, rows, includePossibleDuplicates } = req.body || {};
    res.json(await I.commitImport(orgOf(req), actorOf(req), target === 'contacts' ? 'contacts' : 'companies', rows, { includePossibleDuplicates: !!includePossibleDuplicates }));
  }));
  router.get('/import/deals/fields', need('import'), (req, res) => res.json({ fields: DI.DEAL_IMPORT_FIELDS, maxRows: I.MAX_IMPORT_ROWS }));
  router.post('/import/deals/preview', need('import'), h(async (req, res) => res.json(await DI.previewDealImport(orgOf(req), (req.body || {}).rows))));
  router.post('/import/deals/commit', need('import'), h(async (req, res) => {
    const { rows, ownerMap } = req.body || {};
    res.json(await DI.commitDealImport(orgOf(req), actorOf(req), rows, { ownerMap: ownerMap && typeof ownerMap === 'object' ? ownerMap : {} }));
  }));
  router.get('/bootstrap/preview', need('import'), h(async (req, res) => res.json(await BS.previewBootstrap(orgOf(req)))));
  router.post('/bootstrap/commit', need('import'), h(async (req, res) => {
    const { keys, withContacts } = req.body || {};
    res.json(await BS.commitBootstrap(orgOf(req), actorOf(req), { keys: Array.isArray(keys) ? keys : [], withContacts: withContacts !== false }));
  }));

  registerPiperunRoutes(router, { need, h, orgOf, actorOf }); // migração PipeRun → CRM (§84)

  return router;
}

export const router = createCrmRouter();
