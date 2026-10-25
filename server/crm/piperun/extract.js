// Extração PipeRun → cópia bruta (§84). Só leitura na API; grava em piperun_raw (um registro por id, atualizado se rodar de novo). O token fica só na memória desta execução.
import { pool } from '../../db.js';
import { createClient } from './client.js';

// recurso da API -> parâmetros. Campos "with" validados na conta real (camelCase: contactEmails, customFields…).
export const RESOURCES = [
  ['users', 'users', {}], ['pipelines', 'pipelines', {}], ['stages', 'stages', {}], ['origins', 'origins', {}], ['lostReasons', 'lostReasons', {}], ['activityTypes', 'activityTypes', {}],
  ['customFields', 'customFields', {}], ['segments', 'segments', {}], ['tags', 'tags', {}], ['items', 'items', {}],
  ['companies', 'companies', { with: 'city,contactEmails,contactPhones,customFields' }],
  ['persons', 'persons', { with: 'contactEmails,contactPhones,customFields' }],
  ['deals', 'deals', { with: 'customFields,tags' }],
  ['activities', 'activities', {}], ['notes', 'notes', {}], ['proposals', 'proposals', { with: 'items' }], ['files', 'files', {}], ['emails', 'emails', {}], ['histories', 'histories', {}],
];

export async function storeRaw(orgId, entity, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).filter((r) => r && r.id !== undefined && r.id !== null);
    if (!chunk.length) continue;
    const params = [orgId, entity]; const tuples = chunk.map((r, j) => { params.push(String(r.id), JSON.stringify(r)); return `($1,$2,$${j * 2 + 3},$${j * 2 + 4}::jsonb)`; });
    await pool.query(`INSERT INTO piperun_raw (org_id, entity, pid, payload) VALUES ${tuples.join(',')} ON CONFLICT (org_id, entity, pid) DO UPDATE SET payload=EXCLUDED.payload, fetched_at=now()`, params);
  }
}

// Acrescenta as tags a negócios já extraídos sem elas (a 1ª extração não pedia `tags`); só mexe na chave `tags` do negócio.
export async function patchRawDealTags(orgId, rows) {
  let n = 0;
  for (const r of rows) {
    const tags = (Array.isArray(r.tags) ? r.tags : []).map((t) => ({ name: String(typeof t === 'string' ? t : (t && t.name) || '').trim() })).filter((t) => t.name);
    const u = await pool.query(`UPDATE piperun_raw SET payload = payload || jsonb_build_object('tags', $3::jsonb) WHERE org_id=$1 AND entity='deals' AND pid=$2`, [orgId, String(r.id), JSON.stringify(tags)]);
    n += u.rowCount;
  }
  return n;
}

export async function loadRaw(orgId) {
  const { rows } = await pool.query('SELECT entity, payload FROM piperun_raw WHERE org_id=$1', [orgId]);
  const out = {};
  for (const r of rows) (out[r.entity] = out[r.entity] || []).push(r.payload);
  return out;
}
export async function rawCounts(orgId) {
  const { rows } = await pool.query('SELECT entity, count(*)::int AS n, max(fetched_at) AS at FROM piperun_raw WHERE org_id=$1 GROUP BY entity', [orgId]);
  return { counts: Object.fromEntries(rows.map((r) => [r.entity, r.n])), fetchedAt: rows.length ? new Date(Math.max(...rows.map((r) => new Date(r.at)))).toISOString() : null };
}

export async function runExtract(orgId, token, { onProgress = () => {}, clientOptions = {} } = {}) {
  const client = createClient(token, clientOptions);
  const totals = {};
  const steps = RESOURCES.length + 1;
  let step = 0;
  for (const [entity, path, params] of RESOURCES) {
    step += 1;
    onProgress({ phase: 'extract', label: entity, step, steps, got: 0, total: null, counts: totals });
    const { rows, total } = await client.listAll(path, params, { onPage: (p) => onProgress({ phase: 'extract', label: entity, step, steps, got: p.got, total: p.total, counts: totals }) });
    await storeRaw(orgId, entity, rows);
    totals[entity] = rows.length;
    if (total != null && rows.length !== total) throw new Error(`${entity}: a API disse ter ${total} registros, mas vieram ${rows.length}. Rode a extração de novo.`);
  }
  // CNAE vem só como id: busca os códigos usados (uma chamada por CNAE distinto).
  step += 1;
  const { rows: ids } = await pool.query(`SELECT DISTINCT payload->>'cnae_id' AS id FROM piperun_raw WHERE org_id=$1 AND entity='companies' AND payload->>'cnae_id' IS NOT NULL`, [orgId]);
  const cnaes = [];
  for (let i = 0; i < ids.length; i += 1) {
    onProgress({ phase: 'extract', label: 'cnaes', step, steps, got: i, total: ids.length, counts: totals });
    try { const d = await client.get(`cnaes/${ids[i].id}`); if (d && d.data) cnaes.push(d.data); } catch (e) { if (e.status !== 404) throw e; }
  }
  await storeRaw(orgId, 'cnaes', cnaes);
  totals.cnaes = cnaes.length;
  return { counts: totals, apiCalls: client.calls() };
}

// Apaga a cópia bruta (dados pessoais) depois da virada. O mapa de ids (piperun_map) fica: é ele que impede duplicar se alguém reimportar.
export async function purgeRaw(orgId) {
  const r = await pool.query('DELETE FROM piperun_raw WHERE org_id=$1', [orgId]);
  return r.rowCount;
}
