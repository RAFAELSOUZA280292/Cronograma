// CRM — catálogo de produtos/serviços (Fase 2). Sem timeline (não pertence a uma
// empresa), mas com auditoria completa. "Excluir" = soft delete; produto que já
// foi vendido pode ser só desativado (active=false) e continua nos negócios antigos.
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { companyNameKey } from './text.js';
import { sanitize, tx, addAudit, diffApi, mapBySpec, requireUuid } from './service.js';

export const BILLING = { one_time: 'Projeto (pontual)', recurring: 'Recorrente (mensal)' };

const PRODUCT_SPEC = [
  { key: 'name', col: 'name', label: 'Nome', type: 'text' },
  { key: 'category', col: 'category', label: 'Categoria', type: 'text' },
  { key: 'description', col: 'description', label: 'Descrição', type: 'text' },
  { key: 'listPrice', col: 'list_price', label: 'Preço de tabela', type: 'number' },
  { key: 'billing', col: 'billing', label: 'Cobrança', type: 'enum', values: Object.keys(BILLING) },
  { key: 'active', col: 'active', label: 'Ativo', type: 'bool' },
];

const SELECT = 'id, org_id, name, category, description, list_price, billing, active, created_at, updated_at';

export function mapProduct(row) {
  if (!row) return null;
  return { id: row.id, ...mapBySpec(PRODUCT_SPEC, row), createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listProducts(orgId, { includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `SELECT ${SELECT} FROM crm_products WHERE org_id=$1 AND deleted_at IS NULL ${includeInactive ? '' : 'AND active'} ORDER BY lower(category), lower(name)`, [orgId]);
  return rows.map(mapProduct);
}

async function load(db, orgId, id, lock = false) {
  const { rows } = await db.query(`SELECT ${SELECT} FROM crm_products WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL ${lock ? 'FOR UPDATE' : ''}`, [id, orgId]);
  return rows[0] || null;
}

async function assertUniqueName(db, orgId, name, excludeId) {
  const { rows } = await db.query('SELECT id, name FROM crm_products WHERE org_id=$1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR id<>$2)', [orgId, excludeId || null]);
  const key = companyNameKey(name) || name.toLowerCase();
  if (rows.some((r) => (companyNameKey(r.name) || r.name.toLowerCase()) === key)) throw new CrmError(409, 'Já existe um produto com este nome.', { blocking: true });
}

export async function createProduct(orgId, actor, input) {
  const { values, errors } = sanitize(PRODUCT_SPEC, input);
  if (!values.name) errors.push('Informe o nome do produto.');
  if (errors.length) throw new CrmError(400, errors.join(' '));
  if (!('active' in (input || {}))) values.active = true;
  await assertUniqueName(pool, orgId, values.name, null);
  const id = randomUUID();
  return tx(async (c) => {
    const names = Object.keys(values);
    await c.query(
      `INSERT INTO crm_products (id, org_id, ${names.join(', ')}, created_by, updated_by) VALUES ($1,$2, ${names.map((_, i) => `$${i + 3}`).join(', ')}, $${names.length + 3}, $${names.length + 3})`,
      [id, orgId, ...names.map((n) => values[n]), actor.id || null]);
    const api = mapProduct(await load(c, orgId, id));
    await addAudit(c, { orgId, entityType: 'product', entityId: id, action: 'create', actor,
      changes: PRODUCT_SPEC.filter((f) => api[f.key] != null && api[f.key] !== '').map((f) => ({ field: f.key, label: f.label, from: null, to: api[f.key] })) });
    return api;
  });
}

export async function updateProduct(orgId, actor, id, input) {
  requireUuid(id, 'Produto');
  const { values, errors } = sanitize(PRODUCT_SPEC, input, { partial: true });
  if ('name' in values && !values.name) errors.push('O nome do produto não pode ficar vazio.');
  if (errors.length) throw new CrmError(400, errors.join(' '));
  return tx(async (c) => {
    const beforeRow = await load(c, orgId, id, true);
    if (!beforeRow) throw new CrmError(404, 'Produto não encontrado.');
    const before = mapProduct(beforeRow);
    const after = { ...before };
    PRODUCT_SPEC.forEach((f) => { if (f.col in values) after[f.key] = values[f.col]; });
    const changes = diffApi(PRODUCT_SPEC, before, after);
    if (!changes.length) return before;
    if (changes.some((ch) => ch.field === 'name')) await assertUniqueName(c, orgId, after.name, id);
    const sets = [];
    const params = [];
    changes.forEach((ch) => { const f = PRODUCT_SPEC.find((x) => x.key === ch.field); params.push(after[ch.field] === '' && f.type === 'number' ? null : after[ch.field]); sets.push(`${f.col}=$${params.length}`); });
    params.push(actor.id || null); sets.push(`updated_by=$${params.length}`);
    params.push(id);
    await c.query(`UPDATE crm_products SET ${sets.join(', ')}, updated_at=now() WHERE id=$${params.length}`, params);
    await addAudit(c, { orgId, entityType: 'product', entityId: id, action: 'update', changes, actor });
    return mapProduct(await load(c, orgId, id));
  });
}

export async function deleteProduct(orgId, actor, id) {
  requireUuid(id, 'Produto');
  return tx(async (c) => {
    const row = await load(c, orgId, id, true);
    if (!row) throw new CrmError(404, 'Produto não encontrado.');
    await c.query('UPDATE crm_products SET deleted_at=now(), deleted_by=$1, updated_at=now(), updated_by=$1 WHERE id=$2', [actor.id || null, id]);
    await addAudit(c, { orgId, entityType: 'product', entityId: id, action: 'delete', actor });
    return { ok: true };
  });
}
