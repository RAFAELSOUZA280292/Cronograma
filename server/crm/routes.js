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
import { crmCan, crmCapabilities } from './permissions.js';
import { onlyDigits } from './text.js';
import { isValidCnpj } from './cnpj.js';
import { findCompanyDuplicates, findContactDuplicates } from './duplicates.js';
import * as S from './service.js';
import * as Q from './queries.js';
import * as I from './importer.js';
import * as BS from './bootstrap.js';
import * as D from './deals.js';
import * as DQ from './dealQueries.js';
import * as P from './products.js';
import { mapCnpjSuggestion } from './cnpjSuggestion.js';

const need = (cap) => (req, res, next) => {
  if (!crmCan(req.user, cap)) return res.status(403).json({ message: 'Você não tem permissão pra isso no CRM.' });
  return next();
};

const h = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); } catch (e) {
    if (e instanceof CrmError) return res.status(e.status).json({ message: e.message, ...e.extra });
    return next(e);
  }
};

const orgOf = (req) => effectiveOrgId(req);
const actorOf = (req) => ({ id: req.user.id, name: req.user.name || req.user.username });

export function createCrmRouter({ auth = [requireAuth] } = {}) {
  const router = Router();
  router.use(...auth);
  router.use(need('read'));

  router.get('/me', (req, res) => res.json({ capabilities: crmCapabilities(req.user) }));
  router.get('/options', h(async (req, res) => res.json(await Q.options(orgOf(req)))));
  router.get('/overview', h(async (req, res) => res.json(await Q.overview(orgOf(req)))));
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
  router.get('/companies/:id', h(async (req, res) => res.json(await Q.getCompanyOverview(orgOf(req), req.params.id))));
  router.patch('/companies/:id', need('write'), h(async (req, res) => {
    const { force, ...input } = req.body || {};
    res.json({ company: await S.updateCompany(orgOf(req), actorOf(req), req.params.id, input, { force: !!force }) });
  }));
  router.delete('/companies/:id', need('remove'), h(async (req, res) => res.json(await S.deleteCompany(orgOf(req), actorOf(req), req.params.id))));
  router.post('/companies/:id/restore', need('admin'), h(async (req, res) => res.json({ company: await S.restoreCompany(orgOf(req), actorOf(req), req.params.id) })));
  router.get('/companies/:id/timeline', h(async (req, res) => res.json({ events: await Q.listTimeline(orgOf(req), req.params.id, { limit: req.query.limit, before: req.query.before || null }) })));
  router.get('/companies/:id/audit', need('remove'), h(async (req, res) => res.json({ logs: await Q.listAudit(orgOf(req), 'company', req.params.id) })));
  router.post('/companies/:id/projects', need('write'), h(async (req, res) => res.json(await S.linkProject(orgOf(req), actorOf(req), req.params.id, String((req.body || {}).projectId || '')))));
  router.delete('/companies/:id/projects/:projectId', need('write'), h(async (req, res) => res.json(await S.unlinkProject(orgOf(req), actorOf(req), req.params.id, req.params.projectId))));

  // Projetos do cronograma que ainda não estão ligados a nenhuma empresa do CRM (pra ligar na mão).
  router.get('/projects-available', need('write'), h(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT p.id, p.data->'company'->>'name' AS name, p.data->'company'->>'cnpj' AS cnpj FROM projects p
       WHERE p.org_id=$1 AND NOT EXISTS (SELECT 1 FROM crm_company_projects cp WHERE cp.project_id = p.id) ORDER BY lower(p.data->'company'->>'name')`, [orgOf(req)]);
    res.json({ projects: rows.map((r) => ({ id: r.id, name: r.name || 'Projeto', cnpj: r.cnpj || '' })) });
  }));

  // ---- contatos
  router.get('/contacts', h(async (req, res) => res.json(await Q.listContacts(orgOf(req), req.query))));
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
  router.delete('/contacts/:id', need('write'), h(async (req, res) => res.json(await S.deleteContact(orgOf(req), actorOf(req), req.params.id))));

  // ---- negócios / pipeline (Fase 2)
  router.get('/pipeline', h(async (req, res) => res.json(await DQ.getPipeline(orgOf(req)))));
  router.get('/board', h(async (req, res) => res.json(await DQ.getBoard(orgOf(req), req.query))));
  router.get('/deals', h(async (req, res) => res.json(await DQ.listDeals(orgOf(req), req.query))));
  router.post('/deals', need('write'), h(async (req, res) => res.status(201).json({ deal: await D.createDeal(orgOf(req), actorOf(req), req.body || {}) })));
  router.get('/deals/:id', h(async (req, res) => res.json(await DQ.getDealDetail(orgOf(req), req.params.id))));
  router.patch('/deals/:id', need('write'), h(async (req, res) => res.json({ deal: await D.updateDeal(orgOf(req), actorOf(req), req.params.id, req.body || {}, { canEditClosed: crmCan(req.user, 'remove') }) })));
  router.post('/deals/:id/move', need('write'), h(async (req, res) => res.json({ deal: await D.moveDeal(orgOf(req), actorOf(req), req.params.id, req.body || {}) })));
  router.delete('/deals/:id', need('remove'), h(async (req, res) => res.json(await D.deleteDeal(orgOf(req), actorOf(req), req.params.id))));
  router.get('/deals/:id/audit', need('remove'), h(async (req, res) => res.json({ logs: await Q.listAudit(orgOf(req), 'deal', req.params.id) })));

  // ---- produtos (catálogo): todos leem; quem define o que se vende é gestor+
  router.get('/products', h(async (req, res) => res.json({ products: await P.listProducts(orgOf(req), { includeInactive: req.query.all === 'true' && crmCan(req.user, 'catalog') }) })));
  router.post('/products', need('catalog'), h(async (req, res) => res.status(201).json({ product: await P.createProduct(orgOf(req), actorOf(req), req.body || {}) })));
  router.patch('/products/:id', need('catalog'), h(async (req, res) => res.json({ product: await P.updateProduct(orgOf(req), actorOf(req), req.params.id, req.body || {}) })));
  router.delete('/products/:id', need('catalog'), h(async (req, res) => res.json(await P.deleteProduct(orgOf(req), actorOf(req), req.params.id))));

  // ---- notas
  router.post('/notes', need('write'), h(async (req, res) => res.status(201).json({ note: await S.addNote(orgOf(req), actorOf(req), req.body || {}) })));
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
  router.get('/bootstrap/preview', need('import'), h(async (req, res) => res.json(await BS.previewBootstrap(orgOf(req)))));
  router.post('/bootstrap/commit', need('import'), h(async (req, res) => {
    const { keys, withContacts } = req.body || {};
    res.json(await BS.commitBootstrap(orgOf(req), actorOf(req), { keys: Array.isArray(keys) ? keys : [], withContacts: withContacts !== false }));
  }));

  return router;
}

export const router = createCrmRouter();
