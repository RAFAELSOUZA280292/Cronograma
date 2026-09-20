// CRM — consultas (somente leitura). Ver service.js pras escritas.
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { onlyDigits, companyNameKey, personNameKey } from './text.js';
import { companyCompleteness } from './completeness.js';
import { projectSummary } from './projectSummary.js';
import { dealsForCompany, dealsOverview, searchDeals } from './dealQueries.js';
import { listProducts, BILLING } from './products.js';
import { DEAL_TYPE_LABELS, LOST_REASONS } from './pipeline.js';
import { COMPANY_SELECT, CONTACT_SELECT, mapCompany, mapContact, isUuid, todayBR, SOURCES, TAX_REGIMES, COMPANY_SIZES, ENUMS, RELATIONSHIP_LABELS } from './service.js';

const SP_DATE = `to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date,'YYYY-MM-DD')`;

export function daysSince(dateStr) {
  if (!dateStr) return null;
  const a = new Date(`${todayBR()}T12:00:00Z`).getTime();
  const b = new Date(`${String(dateStr).slice(0, 10)}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((a - b) / 86400000));
}

// Estatísticas por empresa numa tacada só (lista e ficha usam a mesma coisa).
// "Última interação" (Fase 1) = a mais recente entre uma nota registrada e uma
// reunião JÁ realizada nos projetos vinculados; atividades/e-mails/ligações
// entram nas fases seguintes.
export async function companyStats(db, orgId, ids) {
  const out = new Map();
  if (!ids.length) return out;
  ids.forEach((id) => out.set(id, { contactsCount: 0, hasPrimaryContact: false, hasDecisionMaker: false, primaryContactName: '', projectsCount: 0, notesCount: 0, lastInteractionAt: null }));
  const { rows: contacts } = await db.query(
    `SELECT company_id, count(*)::int AS n, bool_or(is_primary) AS has_primary, bool_or(decision_role = 'decisor') AS has_decisor,
            max(CASE WHEN is_primary THEN trim(first_name || ' ' || last_name) END) AS primary_name
     FROM crm_contacts WHERE org_id=$1 AND company_id = ANY($2::uuid[]) AND deleted_at IS NULL GROUP BY company_id`, [orgId, ids]);
  contacts.forEach((r) => Object.assign(out.get(r.company_id), { contactsCount: r.n, hasPrimaryContact: !!r.has_primary, hasDecisionMaker: !!r.has_decisor, primaryContactName: r.primary_name || '' }));
  const { rows: projects } = await db.query('SELECT company_id, count(*)::int AS n FROM crm_company_projects WHERE company_id = ANY($1::uuid[]) GROUP BY company_id', [ids]);
  projects.forEach((r) => { out.get(r.company_id).projectsCount = r.n; });
  const { rows: notes } = await db.query(
    `SELECT company_id, count(*)::int AS n, to_char(max(created_at) AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS last_note
     FROM crm_notes WHERE org_id=$1 AND company_id = ANY($2::uuid[]) AND deleted_at IS NULL GROUP BY company_id`, [orgId, ids]);
  notes.forEach((r) => { const s = out.get(r.company_id); s.notesCount = r.n; s.lastInteractionAt = r.last_note; });
  const { rows: meets } = await db.query(
    `SELECT cp.company_id, max(m->>'date') AS last_meeting
     FROM crm_company_projects cp JOIN projects pr ON pr.id = cp.project_id
     CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(pr.data->'meetings') = 'array' THEN pr.data->'meetings' ELSE '[]'::jsonb END) m
     WHERE cp.company_id = ANY($1::uuid[]) AND COALESCE((m->>'deleted')::boolean,false) = false
       AND (m->>'date') ~ '^\\d{4}-\\d{2}-\\d{2}$' AND (m->>'date') <= ${SP_DATE}
     GROUP BY cp.company_id`, [ids]);
  meets.forEach((r) => { const s = out.get(r.company_id); if (r.last_meeting && (!s.lastInteractionAt || r.last_meeting > s.lastInteractionAt)) s.lastInteractionAt = r.last_meeting; });
  return out;
}

function withStats(company, stats) {
  const s = stats || {};
  return { ...company, stats: { ...s, daysSinceInteraction: daysSince(s.lastInteractionAt) }, completeness: companyCompleteness(company, s) };
}

export async function listCompanies(orgId, f = {}) {
  const where = ['c.org_id=$1', f.deleted ? 'c.deleted_at IS NOT NULL' : 'c.deleted_at IS NULL'];
  const params = [orgId];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  if (f.relationship) where.push(`c.relationship=${add(f.relationship)}`);
  if (f.ownerId === 'none') where.push('c.owner_id IS NULL'); else if (f.ownerId) where.push(`c.owner_id=${add(f.ownerId)}`);
  if (f.segment) where.push(`lower(c.segment) LIKE ${add(`%${String(f.segment).toLowerCase()}%`)}`);
  if (f.state) where.push(`c.state=${add(String(f.state).toUpperCase())}`);
  if (f.taxRegime) where.push(`c.tax_regime=${add(f.taxRegime)}`);
  if (f.source) where.push(`c.source=${add(f.source)}`);
  const q = String(f.q || '').trim();
  if (q) {
    const key = companyNameKey(q);
    const digits = onlyDigits(q);
    const ors = [];
    if (key) ors.push(`c.name_norm LIKE ${add(`%${key}%`)}`);
    if (digits.length >= 3) ors.push(`c.cnpj LIKE ${add(`${digits}%`)}`);
    ors.push(`lower(c.city) LIKE ${add(`%${q.toLowerCase()}%`)}`);
    where.push(`(${ors.join(' OR ')})`);
  }
  const order = f.sort === 'recent' ? 'c.updated_at DESC' : 'lower(c.legal_name) ASC';
  const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 200);
  const offset = Math.max(Number(f.offset) || 0, 0);
  const { rows } = await pool.query(
    `SELECT ${COMPANY_SELECT}, count(*) OVER() AS total FROM crm_companies c WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params);
  const stats = await companyStats(pool, orgId, rows.map((r) => r.id));
  return { total: rows[0] ? Number(rows[0].total) : 0, items: rows.map((r) => withStats(mapCompany(r), stats.get(r.id))) };
}

export async function getCompanyOverview(orgId, id) {
  if (!isUuid(id)) throw new CrmError(404, 'Empresa não encontrada.');
  const { rows } = await pool.query(`SELECT ${COMPANY_SELECT} FROM crm_companies c WHERE c.id=$1 AND c.org_id=$2`, [id, orgId]);
  if (!rows[0]) throw new CrmError(404, 'Empresa não encontrada.');
  const stats = await companyStats(pool, orgId, [id]);
  const company = withStats(mapCompany(rows[0]), stats.get(id));
  const contacts = await listContacts(orgId, { companyId: id, limit: 200 });
  const { rows: links } = await pool.query(
    `SELECT cp.project_id, cp.linked_at, pr.data FROM crm_company_projects cp JOIN projects pr ON pr.id = cp.project_id WHERE cp.company_id=$1 ORDER BY cp.linked_at`, [id]);
  const today = todayBR();
  const projects = links.map((l) => ({ ...projectSummary(l.project_id, l.data, today), linkedAt: l.linked_at }));
  const notes = await listNotes(orgId, id);
  const deals = await dealsForCompany(orgId, id);
  const openDeals = deals.filter((d) => d.status === 'open');
  const kpis = {
    openDeals: openDeals.length,
    openDealsValue: openDeals.reduce((n, d) => n + d.value, 0),
    daysSinceInteraction: company.stats.daysSinceInteraction,
    contacts: company.stats.contactsCount,
    projects: projects.length,
    notes: company.stats.notesCount,
    openTodos: projects.reduce((n, p) => n + p.openTodos, 0),
    overdueTodos: projects.reduce((n, p) => n + p.overdueTodos, 0),
    meetings: projects.reduce((n, p) => n + p.meetings.count, 0),
  };
  return { company, contacts: contacts.items, projects, notes, deals, kpis };
}

export async function listNotes(orgId, companyId, { limit = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT n.id, n.entity_type, n.entity_id, n.body, n.created_at, n.created_by, u.name AS created_by_name,
            CASE WHEN n.entity_type = 'contact' THEN (SELECT trim(k.first_name || ' ' || k.last_name) FROM crm_contacts k WHERE k.id = n.entity_id) END AS contact_name,
            CASE WHEN n.entity_type = 'deal' THEN (SELECT d.title FROM crm_deals d WHERE d.id = n.entity_id) END AS deal_title
     FROM crm_notes n LEFT JOIN users u ON u.id = n.created_by
     WHERE n.org_id=$1 AND n.company_id=$2 AND n.deleted_at IS NULL ORDER BY n.created_at DESC LIMIT $3`, [orgId, companyId, limit]);
  return rows.map((r) => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, body: r.body, createdAt: r.created_at, createdBy: r.created_by, createdByName: r.created_by_name || '', contactName: r.contact_name || '', dealTitle: r.deal_title || '' }));
}

export async function listContacts(orgId, f = {}) {
  const where = ['k.org_id=$1', 'k.deleted_at IS NULL', 'c.deleted_at IS NULL'];
  const params = [orgId];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  if (f.companyId) { if (!isUuid(f.companyId)) return { total: 0, items: [] }; where.push(`k.company_id=${add(f.companyId)}`); }
  if (f.decisionRole) where.push(`k.decision_role=${add(f.decisionRole)}`);
  const q = String(f.q || '').trim();
  if (q) {
    const key = personNameKey(q);
    const digits = onlyDigits(q);
    const ors = [`k.name_norm LIKE ${add(`%${key}%`)}`, `lower(k.email) LIKE ${add(`%${q.toLowerCase()}%`)}`, `c.name_norm LIKE ${add(`%${companyNameKey(q)}%`)}`];
    if (digits.length >= 4) ors.push(`regexp_replace(k.phone || k.whatsapp,'\\D','','g') LIKE ${add(`%${digits}%`)}`);
    where.push(`(${ors.join(' OR ')})`);
  }
  const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 500);
  const offset = Math.max(Number(f.offset) || 0, 0);
  const { rows } = await pool.query(
    `SELECT ${CONTACT_SELECT}, count(*) OVER() AS total FROM crm_contacts k JOIN crm_companies c ON c.id = k.company_id
     WHERE ${where.join(' AND ')} ORDER BY k.is_primary DESC, lower(k.first_name) ASC LIMIT ${limit} OFFSET ${offset}`, params);
  return { total: rows[0] ? Number(rows[0].total) : 0, items: rows.map(mapContact) };
}

export async function listTimeline(orgId, companyId, { limit = 50, before = null } = {}) {
  if (!isUuid(companyId)) throw new CrmError(404, 'Empresa não encontrada.');
  const { rows } = await pool.query(
    `SELECT id, entity_type, entity_id, event_type, summary, data, actor_name, occurred_at FROM crm_timeline_events
     WHERE org_id=$1 AND company_id=$2 AND ($3::timestamptz IS NULL OR occurred_at < $3::timestamptz)
     ORDER BY occurred_at DESC, created_at DESC LIMIT $4`, [orgId, companyId, before, Math.min(Number(limit) || 50, 200)]);
  return rows.map((r) => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, eventType: r.event_type, summary: r.summary, data: r.data, actorName: r.actor_name, occurredAt: r.occurred_at }));
}

export async function listAudit(orgId, entityType, entityId, { limit = 100 } = {}) {
  if (!isUuid(entityId)) throw new CrmError(404, 'Registro não encontrado.');
  const { rows } = await pool.query(
    `SELECT id, action, changes, actor_name, created_at FROM crm_audit_logs WHERE org_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY created_at DESC LIMIT $4`,
    [orgId, entityType, entityId, limit]);
  return rows.map((r) => ({ id: r.id, action: r.action, changes: r.changes, actorName: r.actor_name, createdAt: r.created_at }));
}

// Busca global (PRD 38) — Fase 1: empresas e contatos.
export async function search(orgId, qRaw) {
  const q = String(qRaw || '').trim();
  if (q.length < 2) return { companies: [], contacts: [], deals: [] };
  const key = companyNameKey(q);
  const digits = onlyDigits(q);
  const cParams = [orgId];
  const cOr = [];
  if (key) { cParams.push(`%${key}%`); cOr.push(`c.name_norm LIKE $${cParams.length}`); }
  if (digits.length >= 3) { cParams.push(`${digits}%`); cOr.push(`c.cnpj LIKE $${cParams.length}`); }
  const companies = cOr.length ? (await pool.query(
    `SELECT c.id, c.legal_name, c.trade_name, c.cnpj, c.relationship, c.city, c.state FROM crm_companies c
     WHERE c.org_id=$1 AND c.deleted_at IS NULL AND (${cOr.join(' OR ')}) ORDER BY lower(c.legal_name) LIMIT 8`, cParams)).rows : [];
  const kParams = [orgId, `%${personNameKey(q)}%`, `%${q.toLowerCase()}%`];
  let phoneClause = '';
  if (digits.length >= 4) { kParams.push(`%${digits}%`); phoneClause = ` OR regexp_replace(k.phone || k.whatsapp,'\\D','','g') LIKE $${kParams.length}`; }
  const contacts = (await pool.query(
    `SELECT k.id, k.first_name, k.last_name, k.email, k.job_title, k.company_id, c.legal_name AS company_name FROM crm_contacts k JOIN crm_companies c ON c.id = k.company_id
     WHERE k.org_id=$1 AND k.deleted_at IS NULL AND c.deleted_at IS NULL AND (k.name_norm LIKE $2 OR lower(k.email) LIKE $3${phoneClause}) ORDER BY lower(k.first_name) LIMIT 8`, kParams)).rows;
  const deals = await searchDeals(orgId, q);
  return {
    deals,
    companies: companies.map((r) => ({ id: r.id, legalName: r.legal_name, tradeName: r.trade_name, cnpj: r.cnpj, relationship: r.relationship, city: r.city, state: r.state })),
    contacts: contacts.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}`.trim(), email: r.email, jobTitle: r.job_title, companyId: r.company_id, companyName: r.company_name })),
  };
}

export async function options(orgId) {
  const { rows: segs } = await pool.query(`SELECT DISTINCT segment FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL AND segment <> '' ORDER BY segment LIMIT 100`, [orgId]);
  const { rows: owners } = await pool.query(
    `SELECT id, name FROM users WHERE org_id=$1 AND role <> 'cliente' AND blocked = false AND (role = 'master' OR is_super_admin OR crm_role <> '') ORDER BY lower(name)`, [orgId]);
  return {
    relationships: Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => ({ value, label })),
    sources: SOURCES, taxRegimes: TAX_REGIMES, companySizes: COMPANY_SIZES, enums: ENUMS,
    segments: segs.map((r) => r.segment), owners,
    products: await listProducts(orgId),
    lostReasons: Object.entries(LOST_REASONS).map(([value, label]) => ({ value, label })),
    dealTypes: Object.entries(DEAL_TYPE_LABELS).map(([value, label]) => ({ value, label })),
    billing: Object.entries(BILLING).map(([value, label]) => ({ value, label })),
  };
}

// Visão Geral (Fase 1): o que já dá pra responder só com empresas/contatos —
// pipeline/receita entram na Fase 2. Sem gráficos: números e listas de atenção.
export async function overview(orgId) {
  const { rows: byRel } = await pool.query(`SELECT relationship, count(*)::int AS n FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL GROUP BY relationship`, [orgId]);
  const { rows: cc } = await pool.query(`SELECT count(*)::int AS n FROM crm_contacts k JOIN crm_companies c ON c.id=k.company_id WHERE k.org_id=$1 AND k.deleted_at IS NULL AND c.deleted_at IS NULL`, [orgId]);
  const { rows: all } = await pool.query(`SELECT ${COMPANY_SELECT} FROM crm_companies c WHERE c.org_id=$1 AND c.deleted_at IS NULL`, [orgId]);
  const stats = await companyStats(pool, orgId, all.map((r) => r.id));
  const list = all.map((r) => withStats(mapCompany(r), stats.get(r.id)));
  const avgCompleteness = list.length ? Math.round(list.reduce((n, c) => n + c.completeness.percent, 0) / list.length) : 0;
  const stale = list.filter((c) => ['client', 'prospect'].includes(c.relationship) && (c.stats.daysSinceInteraction == null || c.stats.daysSinceInteraction > 30))
    .sort((a, b) => (b.stats.daysSinceInteraction ?? 9999) - (a.stats.daysSinceInteraction ?? 9999));
  const { rows: recent } = await pool.query(
    `SELECT t.id, t.company_id, t.summary, t.actor_name, t.occurred_at, c.legal_name FROM crm_timeline_events t JOIN crm_companies c ON c.id = t.company_id
     WHERE t.org_id=$1 AND c.deleted_at IS NULL ORDER BY t.occurred_at DESC LIMIT 12`, [orgId]);
  const brief = (c) => ({ id: c.id, legalName: c.legalName, tradeName: c.tradeName, relationship: c.relationship, daysSinceInteraction: c.stats.daysSinceInteraction, completeness: c.completeness.percent });
  const deals = await dealsOverview(orgId);
  return {
    deals,
    companiesByRelationship: Object.fromEntries(['prospect', 'client', 'former_client', 'partner'].map((k) => [k, (byRel.find((r) => r.relationship === k) || { n: 0 }).n])),
    totalCompanies: list.length, totalContacts: cc[0].n, avgCompleteness,
    noCnpj: list.filter((c) => !c.cnpj).length,
    noPrimaryContact: list.filter((c) => !c.stats.hasPrimaryContact).length,
    staleCount: stale.length,
    staleCompanies: stale.slice(0, 6).map(brief),
    incompleteCompanies: list.slice().sort((a, b) => a.completeness.percent - b.completeness.percent).slice(0, 6).map(brief),
    recentActivity: recent.map((r) => ({ id: r.id, companyId: r.company_id, companyName: r.legal_name, summary: r.summary, actorName: r.actor_name, occurredAt: r.occurred_at })),
  };
}
