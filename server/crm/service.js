// CRM PRICETAX — camada de serviço (Fase 1, 2026-09-20, PROJECT_CONTEXT.md §54).
//
// REGRA: nenhuma rota escreve SQL solto. Toda mutação passa por aqui, dentro de
// UMA transação que grava (1) o dado, (2) a auditoria campo-a-campo e (3) o
// evento de timeline — é isso que garante PRD 9/43/55/57 (histórico completo,
// nada some, quem/quando). Excluir é sempre soft delete (deleted_at/by).
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { onlyDigits, companyNameKey, personNameKey } from './text.js';
import { isValidCnpj } from './cnpj.js';
import { findCompanyDuplicates, findContactDuplicates } from './duplicates.js';
import { companyCompleteness } from './completeness.js';
import { projectSummary } from './projectSummary.js';

export const ENUMS = {
  relationship: ['prospect', 'client', 'former_client', 'partner'],
  branchType: ['', 'matriz', 'filial'],
  strategicLevel: ['', 'alto', 'medio', 'baixo'],
  influence: ['', 'alta', 'media', 'baixa'],
  decisionRole: ['', 'decisor', 'influenciador', 'usuario', 'comprador', 'financeiro', 'juridico', 'tecnico', 'sponsor', 'bloqueador'],
  relationshipStrength: ['', 'forte', 'medio', 'fraco'],
};

export const RELATIONSHIP_LABELS = { prospect: 'Prospect', client: 'Cliente', former_client: 'Ex-cliente', partner: 'Parceiro' };
export const SOURCES = ['indicacao', 'evento', 'inbound', 'outbound', 'parceiro', 'linkedin', 'site', 'whatsapp', 'cliente_atual', 'outro'];
export const TAX_REGIMES = ['Lucro Real', 'Lucro Presumido', 'Simples Nacional', 'MEI', 'Outro'];
export const COMPANY_SIZES = ['MEI', 'Micro', 'Pequeno', 'Médio', 'Grande'];

const COMPANY_SPEC = [
  { key: 'legalName', col: 'legal_name', label: 'Razão social', type: 'text' },
  { key: 'tradeName', col: 'trade_name', label: 'Nome fantasia', type: 'text' },
  { key: 'cnpj', col: 'cnpj', label: 'CNPJ', type: 'cnpj' },
  { key: 'economicGroup', col: 'economic_group', label: 'Grupo econômico', type: 'text' },
  { key: 'branchType', col: 'branch_type', label: 'Matriz/Filial', type: 'enum', values: ENUMS.branchType },
  { key: 'website', col: 'website', label: 'Site', type: 'text' },
  { key: 'segment', col: 'segment', label: 'Segmento', type: 'text' },
  { key: 'cnae', col: 'cnae', label: 'CNAE', type: 'text' },
  { key: 'city', col: 'city', label: 'Cidade', type: 'text' },
  { key: 'state', col: 'state', label: 'Estado', type: 'uf' },
  { key: 'country', col: 'country', label: 'País', type: 'text' },
  { key: 'relationship', col: 'relationship', label: 'Relação', type: 'enum', values: ENUMS.relationship },
  { key: 'source', col: 'source', label: 'Origem', type: 'text' },
  { key: 'ownerId', col: 'owner_id', label: 'Responsável', type: 'user' },
  { key: 'enteredAt', col: 'entered_at', label: 'Data de entrada', type: 'date' },
  { key: 'clientSince', col: 'client_since', label: 'Cliente desde', type: 'date' },
  { key: 'companySize', col: 'company_size', label: 'Porte', type: 'text' },
  { key: 'taxRegime', col: 'tax_regime', label: 'Regime tributário', type: 'text' },
  { key: 'revenueEstimate', col: 'revenue_estimate', label: 'Faturamento estimado', type: 'number' },
  { key: 'employees', col: 'employees', label: 'Nº de funcionários', type: 'int' },
  { key: 'erp', col: 'erp', label: 'ERP', type: 'text' },
  { key: 'strategicLevel', col: 'strategic_level', label: 'Nível estratégico', type: 'enum', values: ENUMS.strategicLevel },
];

const CONTACT_SPEC = [
  { key: 'firstName', col: 'first_name', label: 'Nome', type: 'text' },
  { key: 'lastName', col: 'last_name', label: 'Sobrenome', type: 'text' },
  { key: 'jobTitle', col: 'job_title', label: 'Cargo', type: 'text' },
  { key: 'department', col: 'department', label: 'Departamento', type: 'text' },
  { key: 'email', col: 'email', label: 'E-mail', type: 'email' },
  { key: 'phone', col: 'phone', label: 'Telefone', type: 'text' },
  { key: 'whatsapp', col: 'whatsapp', label: 'WhatsApp', type: 'text' },
  { key: 'linkedin', col: 'linkedin', label: 'LinkedIn', type: 'text' },
  { key: 'influence', col: 'influence', label: 'Nível de influência', type: 'enum', values: ENUMS.influence },
  { key: 'decisionRole', col: 'decision_role', label: 'Papel na decisão', type: 'enum', values: ENUMS.decisionRole },
  { key: 'relationshipStrength', col: 'relationship_strength', label: 'Força do relacionamento', type: 'enum', values: ENUMS.relationshipStrength },
  { key: 'isPrimary', col: 'is_primary', label: 'Contato principal', type: 'bool' },
];

// ---------- sanitização ----------

export function parseNumberBR(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v).replace(/R\$|\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function sanitizeValue(field, raw, errors, opts) {
  const { type, label } = field;
  if (type === 'text') return String(raw == null ? '' : raw).trim().slice(0, 400);
  if (type === 'longtext') return String(raw == null ? '' : raw).trim().slice(0, 3000);
  if (type === 'cnpj') {
    const d = onlyDigits(raw);
    if (!d) return '';
    if (d.length !== 14 || (!opts.allowInvalidCnpj && !isValidCnpj(d))) { errors.push('CNPJ inválido.'); return ''; }
    return d;
  }
  if (type === 'uf') {
    const v = String(raw || '').trim().toUpperCase();
    if (v && !/^[A-Z]{2}$/.test(v)) { errors.push('Estado deve ter 2 letras (ex.: SP).'); return ''; }
    return v;
  }
  if (type === 'email') {
    const v = String(raw || '').trim().toLowerCase();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { errors.push('E-mail inválido.'); return ''; }
    return v;
  }
  if (type === 'enum') {
    const v = String(raw == null ? '' : raw).trim();
    if (!field.values.includes(v)) { errors.push(`${label} inválido(a).`); return field.values[0]; }
    return v;
  }
  if (type === 'date') {
    if (raw == null || raw === '') return null;
    const v = String(raw).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T12:00:00Z`).getTime())) { errors.push(`${label}: data inválida.`); return null; }
    return v;
  }
  if (type === 'number') {
    const n = parseNumberBR(raw);
    if (n !== null && Number.isNaN(n)) { errors.push(`${label}: número inválido.`); return null; }
    if (n !== null && n < 0) { errors.push(`${label} não pode ser negativo.`); return null; }
    return n;
  }
  if (type === 'int') {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) { errors.push(`${label}: número inteiro inválido.`); return null; }
    return n;
  }
  if (type === 'bool') return raw === true || raw === 'true' || raw === 1;
  if (type === 'user') return raw ? String(raw) : null;
  return raw;
}

export function sanitize(spec, input, { partial = false, allowInvalidCnpj = false } = {}) {
  const errors = [];
  const values = {};
  const src = input || {};
  spec.forEach((f) => {
    if (partial && !(f.key in src)) return;
    // Enum sem opção vazia (ex.: relação) e campo ausente na criação = usa o padrão (1º valor).
    if (!(f.key in src) && f.type === 'enum' && !f.values.includes('')) { values[f.col] = f.values[0]; return; }
    values[f.col] = sanitizeValue(f, src[f.key], errors, { allowInvalidCnpj });
  });
  return { values, errors: [...new Set(errors)] };
}

// ---------- mapeamento linha <-> API ----------

export const COMPANY_SELECT = `c.id, c.org_id, c.legal_name, c.trade_name, c.cnpj, c.economic_group, c.branch_type, c.website, c.segment, c.cnae, c.city, c.state, c.country,
  c.relationship, c.source, c.owner_id, to_char(c.entered_at,'YYYY-MM-DD') AS entered_at, to_char(c.client_since,'YYYY-MM-DD') AS client_since,
  c.company_size, c.tax_regime, c.revenue_estimate, c.employees, c.erp, c.strategic_level,
  c.created_at, c.created_by, c.updated_at, c.updated_by, c.deleted_at, c.deleted_by,
  (SELECT name FROM users u WHERE u.id = c.owner_id) AS owner_name`;

export const CONTACT_SELECT = `k.id, k.org_id, k.company_id, k.first_name, k.last_name, k.job_title, k.department, k.email, k.phone, k.whatsapp, k.linkedin,
  k.influence, k.decision_role, k.relationship_strength, k.is_primary, k.created_at, k.updated_at, k.deleted_at, c.legal_name AS company_name, c.trade_name AS company_trade_name`;

export function mapBySpec(spec, row) {
  const out = {};
  spec.forEach((f) => {
    let v = row[f.col];
    if (f.type === 'number' && v != null) v = Number(v);
    if (v === undefined) v = null;
    out[f.key] = v;
  });
  return out;
}

export function mapCompany(row) {
  if (!row) return null;
  return {
    id: row.id, ...mapBySpec(COMPANY_SPEC, row), ownerName: row.owner_name || '',
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at || null,
  };
}

export function mapContact(row) {
  if (!row) return null;
  return {
    id: row.id, companyId: row.company_id, companyName: row.company_name || '', ...mapBySpec(CONTACT_SPEC, row),
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at || null,
  };
}

function nameNorm(legal, trade) {
  return [...new Set([companyNameKey(legal), companyNameKey(trade)].filter(Boolean))].join('|');
}

function fullName(c) { return `${c.firstName || ''} ${c.lastName || ''}`.trim(); }

// ---------- transação / auditoria / timeline ----------

export async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function addAudit(c, { orgId, entityType, entityId, action, changes = [], actor }) {
  await c.query(
    `INSERT INTO crm_audit_logs (id, org_id, entity_type, entity_id, action, changes, actor_id, actor_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), orgId, entityType, entityId, action, JSON.stringify(changes), actor.id || null, actor.name || ''],
  );
}

export async function addTimeline(c, { orgId, companyId, entityType, entityId = null, eventType, summary, data = {}, actor }) {
  await c.query(
    `INSERT INTO crm_timeline_events (id, org_id, company_id, entity_type, entity_id, event_type, summary, data, actor_id, actor_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [randomUUID(), orgId, companyId, entityType, entityId, eventType, summary, JSON.stringify(data), actor.id || null, actor.name || ''],
  );
}

export function diffApi(spec, before, after) {
  const changes = [];
  spec.forEach((f) => {
    const a = before[f.key] == null ? '' : before[f.key];
    const b = after[f.key] == null ? '' : after[f.key];
    if (String(a) !== String(b)) changes.push({ field: f.key, label: f.label, from: before[f.key] == null ? null : before[f.key], to: after[f.key] == null ? null : after[f.key] });
  });
  return changes;
}

function fmtChangeValue(f, v) {
  if (v == null || v === '') return 'vazio';
  if (f === 'relationship') return RELATIONSHIP_LABELS[v] || v;
  return String(v);
}

export async function assertUserInOrg(db, orgId, userId) {
  if (!userId) return;
  const { rows } = await db.query('SELECT 1 FROM users WHERE id=$1 AND org_id=$2', [userId, orgId]);
  if (!rows[0]) throw new CrmError(400, 'Responsável inválido.');
}

export async function loadCompany(db, orgId, id, { lock = false, includeDeleted = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${COMPANY_SELECT} FROM crm_companies c WHERE c.id=$1 AND c.org_id=$2 ${includeDeleted ? '' : 'AND c.deleted_at IS NULL'} ${lock ? 'FOR UPDATE' : ''}`,
    [id, orgId],
  );
  return rows[0] || null;
}

export function isUuid(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '')); }
export function requireUuid(v, what = 'registro') { if (!isUuid(v)) throw new CrmError(404, `${what} não encontrado(a).`); }

function mapDbError(e) {
  if (e && e.code === '23505') return new CrmError(409, 'Já existe uma empresa com este CNPJ.', { blocking: true });
  return e;
}

export function todayBR() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }

// ---------- EMPRESAS ----------

export function changeSummary(spec, changes, limit = 5) {
  const parts = changes.slice(0, limit).map((ch) => `${ch.label} (de ${fmtChangeValue(ch.field, ch.from)} para ${fmtChangeValue(ch.field, ch.to)})`);
  return parts.join(', ') + (changes.length > limit ? ` e mais ${changes.length - limit}` : '');
}

export async function createCompany(orgId, actor, input, { force = false, allowInvalidCnpj = false, timelineSummary = null, timelineData = {} } = {}) {
  const { values, errors } = sanitize(COMPANY_SPEC, input, { allowInvalidCnpj });
  if (!values.legal_name && values.trade_name) values.legal_name = values.trade_name;
  if (!values.legal_name) errors.push('Informe o nome da empresa.');
  if (errors.length) throw new CrmError(400, errors.join(' '));
  await assertUserInOrg(pool, orgId, values.owner_id);
  const dups = await findCompanyDuplicates(pool, orgId, { cnpj: values.cnpj, legalName: values.legal_name, tradeName: values.trade_name });
  if (dups.exactCnpj) throw new CrmError(409, 'Já existe uma empresa com este CNPJ.', { blocking: true, duplicates: dups });
  if (dups.byName.length && !force) throw new CrmError(409, 'Possível registro duplicado.', { blocking: false, duplicates: dups });
  const cols = { ...values, relationship: values.relationship || 'prospect', country: values.country || 'Brasil', entered_at: values.entered_at || todayBR() };
  if (cols.relationship === 'client' && !cols.client_since) cols.client_since = cols.entered_at;
  const id = randomUUID();
  try {
    return await tx(async (c) => {
      const names = Object.keys(cols);
      await c.query(
        `INSERT INTO crm_companies (id, org_id, ${names.join(', ')}, name_norm, created_by, updated_by)
         VALUES ($1, $2, ${names.map((_, i) => `$${i + 3}`).join(', ')}, $${names.length + 3}, $${names.length + 4}, $${names.length + 4})`,
        [id, orgId, ...names.map((n) => cols[n]), nameNorm(cols.legal_name, cols.trade_name), actor.id || null],
      );
      const api = mapCompany(await loadCompany(c, orgId, id));
      await addAudit(c, {
        orgId, entityType: 'company', entityId: id, action: 'create', actor,
        changes: COMPANY_SPEC.filter((f) => api[f.key] != null && api[f.key] !== '').map((f) => ({ field: f.key, label: f.label, from: null, to: api[f.key] })),
      });
      await addTimeline(c, { orgId, companyId: id, entityType: 'company', entityId: id, eventType: 'company_created', summary: timelineSummary || `${actor.name} cadastrou a empresa.`, data: timelineData, actor });
      return api;
    });
  } catch (e) { throw mapDbError(e); }
}

export async function updateCompany(orgId, actor, id, input, { force = false } = {}) {
  requireUuid(id, 'Empresa');
  const { values, errors } = sanitize(COMPANY_SPEC, input, { partial: true });
  if ('legal_name' in values && !values.legal_name) errors.push('A razão social não pode ficar vazia.');
  if (errors.length) throw new CrmError(400, errors.join(' '));
  if ('owner_id' in values) await assertUserInOrg(pool, orgId, values.owner_id);
  try {
    return await tx(async (c) => {
      const beforeRow = await loadCompany(c, orgId, id, { lock: true });
      if (!beforeRow) throw new CrmError(404, 'Empresa não encontrada.');
      const before = mapCompany(beforeRow);
      const after = { ...before };
      COMPANY_SPEC.forEach((f) => { if (f.col in values) after[f.key] = values[f.col]; });
      // Virou cliente e ninguém informou desde quando: assume hoje (não pedir o que dá pra inferir).
      if (before.relationship !== 'client' && after.relationship === 'client' && !after.clientSince) after.clientSince = todayBR();
      const changes = diffApi(COMPANY_SPEC, before, after);
      if (!changes.length) return before;
      if (changes.some((ch) => ['cnpj', 'legalName', 'tradeName'].includes(ch.field))) {
        const dups = await findCompanyDuplicates(c, orgId, { cnpj: after.cnpj, legalName: after.legalName, tradeName: after.tradeName, excludeId: id });
        if (dups.exactCnpj) throw new CrmError(409, 'Já existe outra empresa com este CNPJ.', { blocking: true, duplicates: dups });
        if (dups.byName.length && !force && changes.some((ch) => ['legalName', 'tradeName'].includes(ch.field))) throw new CrmError(409, 'Possível registro duplicado.', { blocking: false, duplicates: dups });
      }
      const sets = [];
      const params = [];
      changes.forEach((ch) => {
        const f = COMPANY_SPEC.find((x) => x.key === ch.field);
        params.push(after[ch.field] === '' && ['date', 'number', 'int', 'user'].includes(f.type) ? null : after[ch.field]);
        sets.push(`${f.col}=$${params.length}`);
      });
      if (changes.some((ch) => ['legalName', 'tradeName'].includes(ch.field))) { params.push(nameNorm(after.legalName, after.tradeName)); sets.push(`name_norm=$${params.length}`); }
      params.push(actor.id || null); sets.push(`updated_by=$${params.length}`);
      params.push(id, orgId);
      await c.query(`UPDATE crm_companies SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length - 1} AND org_id=$${params.length}`, params);
      await addAudit(c, { orgId, entityType: 'company', entityId: id, action: 'update', changes, actor });
      const rel = changes.find((ch) => ch.field === 'relationship');
      if (rel) {
        await addTimeline(c, { orgId, companyId: id, entityType: 'company', entityId: id, eventType: 'relationship_changed', actor,
          summary: `${actor.name} alterou a relação da empresa de ${RELATIONSHIP_LABELS[rel.from] || rel.from} para ${RELATIONSHIP_LABELS[rel.to] || rel.to}.`, data: { from: rel.from, to: rel.to } });
      }
      const others = changes.filter((ch) => ch.field !== 'relationship' && !(rel && ch.field === 'clientSince' && rel.to === 'client'));
      if (others.length) {
        await addTimeline(c, { orgId, companyId: id, entityType: 'company', entityId: id, eventType: 'company_updated', actor,
          summary: `${actor.name} alterou o cadastro: ${changeSummary(COMPANY_SPEC, others)}.`, data: { changes: others } });
      }
      return mapCompany(await loadCompany(c, orgId, id));
    });
  } catch (e) { throw mapDbError(e); }
}

export async function deleteCompany(orgId, actor, id) {
  requireUuid(id, 'Empresa');
  return tx(async (c) => {
    const row = await loadCompany(c, orgId, id, { lock: true });
    if (!row) throw new CrmError(404, 'Empresa não encontrada.');
    await c.query(`UPDATE crm_companies SET deleted_at=now(), deleted_by=$1, updated_at=now(), updated_by=$1 WHERE id=$2`, [actor.id || null, id]);
    await addAudit(c, { orgId, entityType: 'company', entityId: id, action: 'delete', actor });
    await addTimeline(c, { orgId, companyId: id, entityType: 'company', entityId: id, eventType: 'company_deleted', summary: `${actor.name} excluiu a empresa (pode ser restaurada por um administrador).`, actor });
    return { ok: true };
  });
}

export async function restoreCompany(orgId, actor, id) {
  requireUuid(id, 'Empresa');
  try {
    return await tx(async (c) => {
      const row = await loadCompany(c, orgId, id, { lock: true, includeDeleted: true });
      if (!row || !row.deleted_at) throw new CrmError(404, 'Empresa excluída não encontrada.');
      await c.query(`UPDATE crm_companies SET deleted_at=NULL, deleted_by=NULL, updated_at=now(), updated_by=$1 WHERE id=$2`, [actor.id || null, id]);
      await addAudit(c, { orgId, entityType: 'company', entityId: id, action: 'restore', actor });
      await addTimeline(c, { orgId, companyId: id, entityType: 'company', entityId: id, eventType: 'company_restored', summary: `${actor.name} restaurou a empresa.`, actor });
      return mapCompany(await loadCompany(c, orgId, id));
    });
  } catch (e) { throw mapDbError(e); }
}

// ---------- vínculo com projetos do cronograma (somente referência) ----------

export async function linkProject(orgId, actor, companyId, projectId) {
  requireUuid(companyId, 'Empresa');
  return tx(async (c) => {
    const company = await loadCompany(c, orgId, companyId, { lock: true });
    if (!company) throw new CrmError(404, 'Empresa não encontrada.');
    const { rows: pr } = await c.query('SELECT id, data FROM projects WHERE id=$1 AND org_id=$2', [projectId, orgId]);
    if (!pr[0]) throw new CrmError(404, 'Projeto não encontrado.');
    const projName = (pr[0].data && pr[0].data.company && (pr[0].data.company.nomeFantasia || pr[0].data.company.name)) || 'Projeto';
    const { rows: ex } = await c.query('SELECT cp.company_id, co.legal_name FROM crm_company_projects cp JOIN crm_companies co ON co.id=cp.company_id WHERE cp.project_id=$1', [projectId]);
    if (ex[0] && ex[0].company_id === companyId) return { ok: true, already: true };
    if (ex[0]) throw new CrmError(409, `Este projeto já está ligado à empresa "${ex[0].legal_name}".`);
    await c.query('INSERT INTO crm_company_projects (company_id, project_id, linked_by) VALUES ($1,$2,$3)', [companyId, projectId, actor.id || null]);
    await addAudit(c, { orgId, entityType: 'company', entityId: companyId, action: 'link_project', changes: [{ field: 'project', label: 'Projeto vinculado', from: null, to: projName }], actor });
    await addTimeline(c, { orgId, companyId, entityType: 'project', eventType: 'project_linked', summary: `${actor.name} vinculou o projeto "${projName}" à empresa.`, data: { projectId, projectName: projName }, actor });
    // Empresa com projeto no cronograma é cliente — só promove quem ainda não era (prospect/ex-cliente).
    if (company.relationship === 'prospect' || company.relationship === 'former_client') {
      await c.query(`UPDATE crm_companies SET relationship='client', client_since=COALESCE(client_since, (now() AT TIME ZONE 'America/Sao_Paulo')::date), updated_at=now(), updated_by=$1 WHERE id=$2`, [actor.id || null, companyId]);
      await addAudit(c, { orgId, entityType: 'company', entityId: companyId, action: 'update', changes: [{ field: 'relationship', label: 'Relação', from: company.relationship, to: 'client' }], actor });
      await addTimeline(c, { orgId, companyId, entityType: 'company', entityId: companyId, eventType: 'relationship_changed', actor,
        summary: `Relação alterada de ${RELATIONSHIP_LABELS[company.relationship]} para Cliente (empresa com projeto vinculado).`, data: { from: company.relationship, to: 'client', automatic: true } });
    }
    return { ok: true, already: false };
  });
}

export async function unlinkProject(orgId, actor, companyId, projectId) {
  requireUuid(companyId, 'Empresa');
  return tx(async (c) => {
    const company = await loadCompany(c, orgId, companyId, { lock: true });
    if (!company) throw new CrmError(404, 'Empresa não encontrada.');
    const { rowCount } = await c.query('DELETE FROM crm_company_projects WHERE company_id=$1 AND project_id=$2', [companyId, projectId]);
    if (!rowCount) throw new CrmError(404, 'Vínculo não encontrado.');
    const { rows: pr } = await c.query('SELECT data FROM projects WHERE id=$1', [projectId]);
    const projName = (pr[0] && pr[0].data && pr[0].data.company && (pr[0].data.company.nomeFantasia || pr[0].data.company.name)) || 'Projeto';
    await addAudit(c, { orgId, entityType: 'company', entityId: companyId, action: 'unlink_project', changes: [{ field: 'project', label: 'Projeto vinculado', from: projName, to: null }], actor });
    await addTimeline(c, { orgId, companyId, entityType: 'project', eventType: 'project_unlinked', summary: `${actor.name} desvinculou o projeto "${projName}" da empresa.`, data: { projectId, projectName: projName }, actor });
    return { ok: true };
  });
}

// ---------- CONTATOS ----------

async function unsetOtherPrimaries(c, orgId, actor, companyId, exceptId) {
  const { rows } = await c.query(`SELECT id FROM crm_contacts WHERE org_id=$1 AND company_id=$2 AND is_primary AND deleted_at IS NULL AND id<>$3`, [orgId, companyId, exceptId]);
  for (const r of rows) {
    await c.query('UPDATE crm_contacts SET is_primary=false, updated_at=now(), updated_by=$1 WHERE id=$2', [actor.id || null, r.id]);
    await addAudit(c, { orgId, entityType: 'contact', entityId: r.id, action: 'update', changes: [{ field: 'isPrimary', label: 'Contato principal', from: true, to: false }], actor });
  }
}

async function loadContact(db, orgId, id, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${CONTACT_SELECT} FROM crm_contacts k JOIN crm_companies c ON c.id = k.company_id
     WHERE k.id=$1 AND k.org_id=$2 AND k.deleted_at IS NULL ${lock ? 'FOR UPDATE OF k' : ''}`,
    [id, orgId],
  );
  return rows[0] || null;
}

export async function createContact(orgId, actor, input, { force = false } = {}) {
  const { values, errors } = sanitize(CONTACT_SPEC, input);
  if (!values.first_name) errors.push('Informe o nome do contato.');
  requireUuid(input && input.companyId, 'Empresa');
  if (errors.length) throw new CrmError(400, errors.join(' '));
  const dups = await findContactDuplicates(pool, orgId, { email: values.email, phone: values.phone, whatsapp: values.whatsapp });
  if (dups.length && !force) throw new CrmError(409, 'Possível registro duplicado.', { blocking: false, duplicates: { contacts: dups } });
  const id = randomUUID();
  return tx(async (c) => {
    const company = await loadCompany(c, orgId, input.companyId, { lock: true });
    if (!company) throw new CrmError(404, 'Empresa não encontrada.');
    const { rows: prim } = await c.query('SELECT 1 FROM crm_contacts WHERE company_id=$1 AND is_primary AND deleted_at IS NULL', [company.id]);
    // Primeiro contato da empresa vira o principal sozinho.
    if (!prim[0]) values.is_primary = true;
    if (values.is_primary) await unsetOtherPrimaries(c, orgId, actor, company.id, id);
    const names = Object.keys(values);
    await c.query(
      `INSERT INTO crm_contacts (id, org_id, company_id, ${names.join(', ')}, name_norm, created_by, updated_by)
       VALUES ($1,$2,$3, ${names.map((_, i) => `$${i + 4}`).join(', ')}, $${names.length + 4}, $${names.length + 5}, $${names.length + 5})`,
      [id, orgId, company.id, ...names.map((n) => values[n]), personNameKey(`${values.first_name} ${values.last_name}`), actor.id || null],
    );
    const api = mapContact(await loadContact(c, orgId, id));
    await addAudit(c, { orgId, entityType: 'contact', entityId: id, action: 'create', actor,
      changes: CONTACT_SPEC.filter((f) => api[f.key] != null && api[f.key] !== '' && api[f.key] !== false).map((f) => ({ field: f.key, label: f.label, from: null, to: api[f.key] })) });
    await addTimeline(c, { orgId, companyId: company.id, entityType: 'contact', entityId: id, eventType: 'contact_added', actor,
      summary: `${actor.name} adicionou o contato ${fullName(api)}${api.jobTitle ? ` (${api.jobTitle})` : ''}${api.isPrimary ? ' como contato principal' : ''}.`, data: { contactId: id } });
    return api;
  });
}

export async function updateContact(orgId, actor, id, input, { force = false } = {}) {
  requireUuid(id, 'Contato');
  const { values, errors } = sanitize(CONTACT_SPEC, input, { partial: true });
  if ('first_name' in values && !values.first_name) errors.push('O nome do contato não pode ficar vazio.');
  if (errors.length) throw new CrmError(400, errors.join(' '));
  return tx(async (c) => {
    const beforeRow = await loadContact(c, orgId, id, { lock: true });
    if (!beforeRow) throw new CrmError(404, 'Contato não encontrado.');
    const before = mapContact(beforeRow);
    const after = { ...before };
    CONTACT_SPEC.forEach((f) => { if (f.col in values) after[f.key] = values[f.col]; });
    const changes = diffApi(CONTACT_SPEC, before, after);
    if (!changes.length) return before;
    if (changes.some((ch) => ['email', 'phone', 'whatsapp'].includes(ch.field)) && !force) {
      const dups = await findContactDuplicates(c, orgId, { email: after.email, phone: after.phone, whatsapp: after.whatsapp, excludeId: id });
      if (dups.length) throw new CrmError(409, 'Possível registro duplicado.', { blocking: false, duplicates: { contacts: dups } });
    }
    if (after.isPrimary && !before.isPrimary) await unsetOtherPrimaries(c, orgId, actor, before.companyId, id);
    const sets = [];
    const params = [];
    changes.forEach((ch) => { const f = CONTACT_SPEC.find((x) => x.key === ch.field); params.push(after[ch.field]); sets.push(`${f.col}=$${params.length}`); });
    if (changes.some((ch) => ['firstName', 'lastName'].includes(ch.field))) { params.push(personNameKey(fullName(after))); sets.push(`name_norm=$${params.length}`); }
    params.push(actor.id || null); sets.push(`updated_by=$${params.length}`);
    params.push(id);
    await c.query(`UPDATE crm_contacts SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length}`, params);
    await addAudit(c, { orgId, entityType: 'contact', entityId: id, action: 'update', changes, actor });
    await addTimeline(c, { orgId, companyId: before.companyId, entityType: 'contact', entityId: id, eventType: 'contact_updated', actor,
      summary: `${actor.name} atualizou o contato ${fullName(after)}: ${changeSummary(CONTACT_SPEC, changes)}.`, data: { contactId: id, changes } });
    return mapContact(await loadContact(c, orgId, id));
  });
}

export async function deleteContact(orgId, actor, id) {
  requireUuid(id, 'Contato');
  return tx(async (c) => {
    const row = await loadContact(c, orgId, id, { lock: true });
    if (!row) throw new CrmError(404, 'Contato não encontrado.');
    const api = mapContact(row);
    await c.query('UPDATE crm_contacts SET deleted_at=now(), deleted_by=$1, updated_at=now(), updated_by=$1 WHERE id=$2', [actor.id || null, id]);
    await addAudit(c, { orgId, entityType: 'contact', entityId: id, action: 'delete', actor });
    await addTimeline(c, { orgId, companyId: api.companyId, entityType: 'contact', entityId: id, eventType: 'contact_removed', actor,
      summary: `${actor.name} removeu o contato ${fullName(api)}.`, data: { contactId: id } });
    return { ok: true };
  });
}

// ---------- NOTAS (PRD 52: qualquer objeto aceita nota; a nota entra na timeline) ----------

export async function addNote(orgId, actor, { entityType, entityId, body }) {
  if (!['company', 'contact', 'deal'].includes(entityType)) throw new CrmError(400, 'Tipo de registro inválido para nota.');
  requireUuid(entityId);
  const text = String(body || '').trim();
  if (!text) throw new CrmError(400, 'Escreva a nota.');
  if (text.length > 5000) throw new CrmError(400, 'Nota muito longa (máximo 5.000 caracteres).');
  return tx(async (c) => {
    let companyId = entityId;
    let about = '';
    if (entityType === 'company') {
      if (!(await loadCompany(c, orgId, entityId))) throw new CrmError(404, 'Empresa não encontrada.');
    } else if (entityType === 'deal') {
      const { rows: dr } = await c.query('SELECT company_id, title FROM crm_deals WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL', [entityId, orgId]);
      if (!dr[0]) throw new CrmError(404, 'Negócio não encontrado.');
      companyId = dr[0].company_id;
      about = ` sobre o negócio "${dr[0].title}"`;
    } else {
      const k = await loadContact(c, orgId, entityId);
      if (!k) throw new CrmError(404, 'Contato não encontrado.');
      companyId = k.company_id;
      about = ` sobre ${`${k.first_name} ${k.last_name}`.trim()}`;
    }
    const id = randomUUID();
    await c.query(`INSERT INTO crm_notes (id, org_id, entity_type, entity_id, company_id, body, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
      [id, orgId, entityType, entityId, companyId, text, actor.id || null]);
    await addAudit(c, { orgId, entityType: 'note', entityId: id, action: 'create', changes: [{ field: 'body', label: 'Nota', from: null, to: text }], actor });
    const excerpt = text.length > 160 ? `${text.slice(0, 160)}…` : text;
    await addTimeline(c, { orgId, companyId, entityType: 'note', entityId: id, eventType: 'note_added', actor,
      summary: `${actor.name} registrou uma nota${about}: "${excerpt}"`, data: { noteId: id, refType: entityType, refId: entityId } });
    return { id, entityType, entityId, companyId, body: text, createdAt: new Date().toISOString(), createdByName: actor.name };
  });
}

export async function deleteNote(orgId, actor, id, { canModerate = false } = {}) {
  requireUuid(id, 'Nota');
  return tx(async (c) => {
    const { rows } = await c.query('SELECT id, company_id, created_by FROM crm_notes WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL FOR UPDATE', [id, orgId]);
    if (!rows[0]) throw new CrmError(404, 'Nota não encontrada.');
    if (!canModerate && rows[0].created_by !== actor.id) throw new CrmError(403, 'Você só pode remover as suas próprias notas.');
    await c.query('UPDATE crm_notes SET deleted_at=now(), deleted_by=$1, updated_at=now(), updated_by=$1 WHERE id=$2', [actor.id || null, id]);
    await addAudit(c, { orgId, entityType: 'note', entityId: id, action: 'delete', actor });
    await addTimeline(c, { orgId, companyId: rows[0].company_id, entityType: 'note', entityId: id, eventType: 'note_removed', actor, summary: `${actor.name} removeu uma nota.`, data: { noteId: id } });
    return { ok: true };
  });
}

// ---------- validação exposta (importação valida linha a linha sem gravar) ----------

export function validateCompanyInput(input, opts = {}) {
  const { values, errors } = sanitize(COMPANY_SPEC, input, opts);
  if (!values.legal_name && values.trade_name) values.legal_name = values.trade_name;
  if (!values.legal_name) errors.push('Informe o nome da empresa.');
  return { values, errors };
}

export function validateContactInput(input) {
  const { values, errors } = sanitize(CONTACT_SPEC, input);
  if (!values.first_name) errors.push('Informe o nome do contato.');
  return { values, errors };
}
