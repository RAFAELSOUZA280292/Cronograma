// Banco do cronograma padrão versionado (2026-10-19). Por organização: versões imutáveis (1.0, 2.0, 3.0…) e um rascunho compartilhado.
// A versão mais recente é a que TODA empresa nova segue (`instantiateStandard`, chamada por POST /api/projects). A semente (1.0 = modelo antigo, 2.0 = proposta
// do guia) é criada na primeira vez que a organização usa o padrão. Salvar uma versão nova é sempre uma ação explícita; o rascunho só guarda o que está sendo editado.
import { pool } from './db.js';
import {
  V1_NOTE, V2_NOTE, V2_NOTE_ORIGINAL, buildV1, buildV2, buildV3, countTemplate, diffTemplates, instantiateTemplate, purgeDeleted, sameTemplate, templateFromProject, templateValid,
} from './standardTemplate.js';

export const STD_PLAN_ID = 'std-plan';
const lockKey = (orgId) => `standard-plan:${orgId}`;
const labelOf = (n) => `${n}.0`;

async function seedIfEmpty(client, orgId) {
  const { rows } = await client.query('SELECT 1 FROM standard_plan_versions WHERE org_id=$1 LIMIT 1', [orgId]);
  if (rows.length) return;
  const v1 = buildV1(); const v2 = buildV2();
  const ins = (n, data, note, summary) => client.query(
    `INSERT INTO standard_plan_versions (org_id, version, data, note, summary, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,'','Sistema')`,
    [orgId, n, JSON.stringify(data), note, JSON.stringify(summary)],
  );
  await ins(1, v1, V1_NOTE, { counts: countTemplate(v1), seed: true });
  await ins(2, v2, V2_NOTE, { counts: countTemplate(v2), seed: true, diff: diffTemplates(v1, v2) });
}

// Executa `fn(client)` numa transação com trava por organização (duas pessoas salvando ao mesmo tempo não geram o mesmo número de versão).
async function withOrgLock(orgId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey(orgId)]);
    await seedIfEmpty(client, orgId);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignora */ }
    throw e;
  } finally { client.release(); }
}

const metaOf = (r) => ({
  version: r.version, label: labelOf(r.version), createdAt: r.created_at, createdBy: r.created_by_name || 'Sistema', note: r.note || '',
  counts: (r.summary && r.summary.counts) || null, diff: (r.summary && r.summary.diff) || null, seed: !!(r.summary && r.summary.seed),
});

async function latestRow(client, orgId) {
  const { rows } = await client.query('SELECT * FROM standard_plan_versions WHERE org_id=$1 ORDER BY version DESC LIMIT 1', [orgId]);
  return rows[0];
}

// 2026-10-19 (pedido do Rafael): a 2.0 é provisória até a 3.0. Atualiza SÓ a nota da 2.0 e só se ainda for o texto original da semente; idempotente.
export async function markV2Provisional() {
  const r = await pool.query('UPDATE standard_plan_versions SET note=$1 WHERE version=2 AND note=$2', [V2_NOTE, V2_NOTE_ORIGINAL]);
  return r.rowCount;
}

export async function listVersions(orgId) {
  return withOrgLock(orgId, async (c) => {
    const { rows } = await c.query('SELECT version, note, summary, created_by_name, created_at FROM standard_plan_versions WHERE org_id=$1 ORDER BY version DESC', [orgId]);
    return rows.map((r, i) => ({ ...metaOf(r), current: i === 0 }));
  });
}

// Rascunho + versão atual. Sem rascunho ainda, ele nasce igual à versão atual.
export async function getDraft(orgId) {
  return withOrgLock(orgId, async (c) => {
    const cur = await latestRow(c, orgId);
    let { rows } = await c.query('SELECT data, updated_by_name, updated_at FROM standard_plan_draft WHERE org_id=$1', [orgId]);
    if (!rows.length) {
      await c.query('INSERT INTO standard_plan_draft (org_id, data) VALUES ($1,$2)', [orgId, JSON.stringify(cur.data)]);
      rows = [{ data: cur.data, updated_by_name: '', updated_at: new Date() }];
    }
    return { current: metaOf(cur), draft: rows[0].data, dirty: !sameTemplate(rows[0].data, cur.data), updatedBy: rows[0].updated_by_name, updatedAt: rows[0].updated_at };
  });
}

// O que mudou do rascunho em relação à versão atual (mostrado antes de salvar uma versão nova).
export async function draftDiff(orgId) {
  return withOrgLock(orgId, async (c) => {
    const cur = await latestRow(c, orgId);
    const { rows } = await c.query('SELECT data FROM standard_plan_draft WHERE org_id=$1', [orgId]);
    const draft = rows.length ? purgeDeleted(templateFromProject(rows[0].data)) : cur.data;
    return { next: cur.version + 1, nextLabel: labelOf(cur.version + 1), diff: diffTemplates(cur.data, draft), counts: countTemplate(draft) };
  });
}

export async function saveDraft(orgId, user, body) {
  const t = templateFromProject(body);
  const bad = templateValid(t);
  if (bad) { const e = new Error(bad); e.status = 400; throw e; }
  return withOrgLock(orgId, async (c) => {
    const cur = await latestRow(c, orgId);
    await c.query(
      `INSERT INTO standard_plan_draft (org_id, data, updated_by, updated_by_name, updated_at) VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (org_id) DO UPDATE SET data=EXCLUDED.data, updated_by=EXCLUDED.updated_by, updated_by_name=EXCLUDED.updated_by_name, updated_at=now()`,
      [orgId, JSON.stringify(t), user.id, user.name || ''],
    );
    return { dirty: !sameTemplate(t, cur.data) };
  });
}

export async function discardDraft(orgId) {
  return withOrgLock(orgId, async (c) => { await c.query('DELETE FROM standard_plan_draft WHERE org_id=$1', [orgId]); });
}

// Salva o rascunho como a próxima versão (N+1) e o descarta (o próximo rascunho nasce igual a ela).
export async function saveVersion(orgId, user, note) {
  return withOrgLock(orgId, async (c) => {
    const cur = await latestRow(c, orgId);
    const { rows } = await c.query('SELECT data FROM standard_plan_draft WHERE org_id=$1', [orgId]);
    if (!rows.length || sameTemplate(rows[0].data, cur.data)) { const e = new Error('Não há alterações para salvar.'); e.status = 400; throw e; }
    const next = purgeDeleted(templateFromProject(rows[0].data));
    const bad = templateValid(next);
    if (bad) { const e = new Error(bad); e.status = 400; throw e; }
    const n = cur.version + 1;
    const summary = { counts: countTemplate(next), diff: diffTemplates(cur.data, next) };
    await c.query(
      `INSERT INTO standard_plan_versions (org_id, version, data, note, summary, created_by, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orgId, n, JSON.stringify(next), String(note || '').trim().slice(0, 500), JSON.stringify(summary), user.id, user.name || ''],
    );
    await c.query('DELETE FROM standard_plan_draft WHERE org_id=$1', [orgId]);
    return { version: n, label: labelOf(n) };
  });
}

// Propostas que ainda não são versão (hoje só a v3 de 19/10/2026): contagem para mostrar no histórico e carga no rascunho.
export const PROPOSALS = { v3: { label: 'Proposta v3', description: 'Cronograma de 8 meses contados da assinatura do contrato, em duas trilhas (diagnóstico PRICETAX e implementação no cliente), com e-mail de boas-vindas no primeiro dia, prioridade, limite da norma e predecessoras. Rascunho para validação; não vira versão até alguém salvar.' } };
export const listProposals = () => Object.entries(PROPOSALS).map(([key, p]) => ({ key, ...p, counts: countTemplate(buildV3()) }));
export async function loadProposal(orgId, user, key) {
  if (key !== 'v3') { const e = new Error('Proposta não encontrada.'); e.status = 404; throw e; }
  const data = buildV3();
  return withOrgLock(orgId, async (c) => {
    await c.query(
      `INSERT INTO standard_plan_draft (org_id, data, updated_by, updated_by_name, updated_at) VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (org_id) DO UPDATE SET data=EXCLUDED.data, updated_by=EXCLUDED.updated_by, updated_by_name=EXCLUDED.updated_by_name, updated_at=now()`,
      [orgId, JSON.stringify(data), user.id, user.name || ''],
    );
  });
}

// Carrega uma versão antiga no rascunho (para virar a próxima versão ao salvar). Não altera nenhuma versão salva.
export async function restoreVersion(orgId, user, n) {
  return withOrgLock(orgId, async (c) => {
    const { rows } = await c.query('SELECT data FROM standard_plan_versions WHERE org_id=$1 AND version=$2', [orgId, n]);
    if (!rows.length) { const e = new Error('Versão não encontrada.'); e.status = 404; throw e; }
    await c.query(
      `INSERT INTO standard_plan_draft (org_id, data, updated_by, updated_by_name, updated_at) VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (org_id) DO UPDATE SET data=EXCLUDED.data, updated_by=EXCLUDED.updated_by, updated_by_name=EXCLUDED.updated_by_name, updated_at=now()`,
      [orgId, JSON.stringify(rows[0].data), user.id, user.name || ''],
    );
  });
}

// Cronograma de empresa nova pela versão mais recente da organização. Não cria a semente: organização que nunca abriu o cronograma padrão continua
// recebendo o modelo de sempre (devolve null e quem chama usa blankProject), e só passa a seguir o padrão versionado depois que alguém o abre.
export async function instantiateStandard(orgId, kickoffISO) {
  if (!orgId) return null;
  const { rows } = await pool.query('SELECT data, version FROM standard_plan_versions WHERE org_id=$1 ORDER BY version DESC LIMIT 1', [orgId]);
  if (!rows.length) return null;
  return { ...instantiateTemplate(rows[0].data, kickoffISO), version: rows[0].version };
}

// Prévia para o cadastro da empresa: o que acontece com este kickoff (sem criar nada). Null se a organização ainda não usa o padrão versionado.
export async function previewInstantiate(orgId, kickoffISO) {
  const r = await instantiateStandard(orgId, kickoffISO);
  if (!r) return null;
  return { version: r.version, label: labelOf(r.version), summary: r.summary };
}
