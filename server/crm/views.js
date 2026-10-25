// CRM — visões salvas de Negócios e página inicial por pessoa (§98).
// Visão = filtros + modo (quadro/lista) guardados no servidor: acompanham a pessoa em qualquer aparelho.
// Pessoal (só do dono) ou compartilhada com o time (criada por quem tem a capacidade 'funnel'). Exclusão é lógica.
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { isUuid } from './service.js';
import { personNameKey } from './text.js';

export const VIEW_SCOPES = ['deals'];
export const LENSES = ['mine', 'team', 'revenue', 'accounts'];
const BUILTIN_REFS = { deals: ['all', 'mine'], overview: LENSES };
const MAX_PER_USER = 30;
const ATTENTION = ['', 'late', 'nonext', 'stalled', 'overdue'];

export async function ensureViewsSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_saved_views (
      id         UUID PRIMARY KEY,
      org_id     TEXT NOT NULL REFERENCES organizations(id),
      scope      TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      name_key   TEXT NOT NULL,
      config     JSONB NOT NULL DEFAULT '{}'::jsonb,
      shared     BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ
    )`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_saved_views_shared_uidx ON crm_saved_views(org_id, scope, name_key) WHERE shared AND deleted_at IS NULL`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_saved_views_mine_uidx ON crm_saved_views(org_id, scope, user_id, name_key) WHERE NOT shared AND deleted_at IS NULL`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_view_defaults (
      org_id   TEXT NOT NULL REFERENCES organizations(id),
      user_id  TEXT NOT NULL,
      scope    TEXT NOT NULL,
      view_ref TEXT NOT NULL,
      PRIMARY KEY (org_id, user_id, scope)
    )`);
}

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// Só entra o que a tela de Negócios sabe aplicar; qualquer outra chave é descartada.
export function cleanConfig(scope, raw) {
  if (scope !== 'deals') throw new CrmError(400, 'Tipo de visão inválido.');
  const c = raw && typeof raw === 'object' ? raw : {};
  const pipe = clip(c.pipelineId, 40);
  const owner = clip(c.ownerId, 40);
  const attention = clip(c.attention, 20);
  const type = clip(c.type, 10);
  const status = clip(c.listStatus, 10);
  return {
    view: c.view === 'list' ? 'list' : 'board',
    pipelineId: pipe === 'all' || isUuid(pipe) ? pipe : '',
    q: clip(c.q, 100),
    type: ['new', 'upsell'].includes(type) ? type : '',
    ownerId: ['none', 'me'].includes(owner) || /^[A-Za-z0-9_.@:-]{1,64}$/.test(owner) ? owner : '', // users.id é texto livre, não UUID
    source: clip(c.source, 200),
    tag: clip(c.tag, 80),
    attention: ATTENTION.includes(attention) ? attention : '',
    listStatus: ['open', 'won', 'lost', 'all'].includes(status) ? status : 'open',
  };
}

function cleanName(v) {
  const name = clip(v, 60).replace(/\s+/g, ' ');
  if (!name) throw new CrmError(400, 'Dê um nome para a visão.');
  return name;
}

const out = (r, userId) => ({ id: r.id, scope: r.scope, name: r.name, config: r.config, shared: r.shared, mine: r.user_id === userId, ownerName: r.owner_name || '', updatedAt: r.updated_at });

export async function listViews(orgId, userId, scope = 'deals') {
  if (!VIEW_SCOPES.includes(scope)) throw new CrmError(400, 'Tipo de visão inválido.');
  const { rows } = await pool.query(
    `SELECT v.*, u.name AS owner_name FROM crm_saved_views v LEFT JOIN users u ON u.id = v.user_id
     WHERE v.org_id=$1 AND v.scope=$2 AND v.deleted_at IS NULL AND (v.shared OR v.user_id=$3)
     ORDER BY (v.user_id=$3) DESC, lower(v.name)`, [orgId, scope, userId]);
  return rows.map((r) => out(r, userId));
}

export async function getDefaults(orgId, userId) {
  const { rows } = await pool.query('SELECT scope, view_ref FROM crm_view_defaults WHERE org_id=$1 AND user_id=$2', [orgId, userId]);
  return Object.fromEntries(rows.map((r) => [r.scope, r.view_ref]));
}

async function loadVisible(c, orgId, userId, id) {
  if (!isUuid(id)) throw new CrmError(404, 'Visão não encontrada.');
  const { rows } = await c.query('SELECT * FROM crm_saved_views WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL AND (shared OR user_id=$3)', [id, orgId, userId]);
  if (!rows[0]) throw new CrmError(404, 'Visão não encontrada.');
  return rows[0];
}

function mapDup(e) {
  if (e && e.code === '23505') return new CrmError(409, 'Já existe uma visão com este nome. Escolha outro nome.');
  return e;
}

export async function createView(orgId, user, input, { canShare }) {
  const b = input || {};
  const scope = clip(b.scope || 'deals', 20);
  if (!VIEW_SCOPES.includes(scope)) throw new CrmError(400, 'Tipo de visão inválido.');
  const name = cleanName(b.name);
  const shared = !!b.shared;
  if (shared && !canShare) throw new CrmError(403, 'Só gestores compartilham visões com o time.');
  const config = cleanConfig(scope, b.config);
  const { rows: n } = await pool.query(
    shared ? 'SELECT count(*)::int AS n FROM crm_saved_views WHERE org_id=$1 AND scope=$2 AND shared AND deleted_at IS NULL' : 'SELECT count(*)::int AS n FROM crm_saved_views WHERE org_id=$1 AND scope=$2 AND NOT shared AND user_id=$3 AND deleted_at IS NULL',
    shared ? [orgId, scope] : [orgId, scope, user.id]);
  if (n[0].n >= MAX_PER_USER) throw new CrmError(400, `Limite de ${MAX_PER_USER} visões atingido. Exclua uma que não usa mais.`);
  const id = randomUUID();
  try {
    await pool.query('INSERT INTO crm_saved_views (id, org_id, scope, user_id, name, name_key, config, shared) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)', [id, orgId, scope, user.id, name, personNameKey(name), JSON.stringify(config), shared]);
  } catch (e) { throw mapDup(e); }
  return (await listViews(orgId, user.id, scope)).find((v) => v.id === id);
}

export async function updateView(orgId, user, id, input, { canShare }) {
  const b = input || {};
  const cur = await loadVisible(pool, orgId, user.id, id);
  const mine = cur.user_id === user.id;
  if (!mine && !(cur.shared && canShare)) throw new CrmError(403, 'Esta visão é de outra pessoa.');
  const name = b.name === undefined ? cur.name : cleanName(b.name);
  const config = b.config === undefined ? cur.config : cleanConfig(cur.scope, b.config);
  const shared = b.shared === undefined ? cur.shared : !!b.shared;
  if (shared !== cur.shared) {
    if (!canShare) throw new CrmError(403, 'Só gestores compartilham visões com o time.');
    if (!shared && !mine) throw new CrmError(403, 'Só quem criou a visão pode deixá-la de novo só para si.');
  }
  try {
    await pool.query('UPDATE crm_saved_views SET name=$2, name_key=$3, config=$4::jsonb, shared=$5, updated_at=now() WHERE id=$1', [id, name, personNameKey(name), JSON.stringify(config), shared]);
  } catch (e) { throw mapDup(e); }
  if (cur.shared && !shared) await pool.query(`DELETE FROM crm_view_defaults WHERE org_id=$1 AND scope=$2 AND view_ref=$3 AND user_id <> $4`, [orgId, cur.scope, id, user.id]);
  return (await listViews(orgId, user.id, cur.scope)).find((v) => v.id === id);
}

export async function deleteView(orgId, user, id, { canShare }) {
  const cur = await loadVisible(pool, orgId, user.id, id);
  if (cur.user_id !== user.id && !(cur.shared && canShare)) throw new CrmError(403, 'Esta visão é de outra pessoa.');
  await pool.query('UPDATE crm_saved_views SET deleted_at=now() WHERE id=$1', [id]);
  await pool.query('DELETE FROM crm_view_defaults WHERE org_id=$1 AND scope=$2 AND view_ref=$3', [orgId, cur.scope, id]);
  return { ok: true };
}

// scope: 'deals' (visão ao abrir Negócios) ou 'overview' (a página inicial do CRM). ref nulo volta ao padrão.
export async function setDefault(orgId, user, scope, ref) {
  if (!BUILTIN_REFS[scope]) throw new CrmError(400, 'Tipo de padrão inválido.');
  if (ref == null || ref === '') { await pool.query('DELETE FROM crm_view_defaults WHERE org_id=$1 AND user_id=$2 AND scope=$3', [orgId, user.id, scope]); return { scope, ref: null }; }
  const r = String(ref);
  if (!BUILTIN_REFS[scope].includes(r)) {
    if (scope !== 'deals') throw new CrmError(400, 'Opção inválida.');
    await loadVisible(pool, orgId, user.id, r);
  }
  await pool.query(`INSERT INTO crm_view_defaults (org_id, user_id, scope, view_ref) VALUES ($1,$2,$3,$4) ON CONFLICT (org_id, user_id, scope) DO UPDATE SET view_ref=EXCLUDED.view_ref`, [orgId, user.id, scope, r]);
  return { scope, ref: r };
}
