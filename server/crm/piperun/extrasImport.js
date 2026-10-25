// Migração PipeRun → CRM, 2ª leva (§85): funis completos (etapas sem negócio + prazo/SLA), catálogo de produtos, catálogo de tags e, por negócio, MRR, previsão de fechamento e tags.
// Repetível: funis/produtos/tags casam pelo nome; os campos do negócio são aplicados UMA vez (marca em piperun_map, entidade 'extras'), para não pisar em edição feita depois no CRM.
import { randomUUID } from 'node:crypto';
import { pool } from '../../db.js';
import { personNameKey } from '../text.js';
import { listPipelines, createPipelineTx, saveStages } from '../funnels.js';
import { tx } from '../service.js';
import { ensureTag, tagKey } from '../extras.js';

// Cada funil do PipeRun existe no CRM com TODAS as etapas na ordem do PipeRun; o prazo (days_limit) vira o SLA da etapa.
export async function completeFunnels(orgId, actor, defs) {
  const out = { createdFunnels: [], createdStages: [], stagesWithSla: 0 };
  for (const def of defs) {
    const key = personNameKey(def.name);
    let pipes = await listPipelines(orgId);
    let pipe = pipes.find((p) => personNameKey(p.name) === key);
    if (!pipe) {
      await tx((c) => createPipelineTx(c, orgId, actor, { name: def.name, openStageNames: def.stages.map((x) => x.name) }));
      out.createdFunnels.push(def.name); def.stages.forEach((x) => out.createdStages.push(`${def.name} › ${x.name}`));
      pipes = await listPipelines(orgId); pipe = pipes.find((p) => personNameKey(p.name) === key);
    }
    const opens = pipe.stages.filter((x) => x.kind === 'open');
    const byKey = new Map(opens.map((x) => [personNameKey(x.name), x]));
    const list = []; const used = new Set();
    def.stages.forEach((w, i) => {
      const k = personNameKey(w.name); const ex = byKey.get(k);
      if (used.has(k)) return;
      used.add(k);
      if (ex) list.push({ id: ex.id, name: ex.name, probability: ex.probability, slaDays: ex.slaDays || w.slaDays || null });
      else { list.push({ name: w.name, probability: Math.min(80, 10 + i * 10), slaDays: w.slaDays || null }); out.createdStages.push(`${pipe.name} › ${w.name}`); }
    });
    opens.filter((x) => !used.has(personNameKey(x.name))).forEach((x) => list.push({ id: x.id, name: x.name, probability: x.probability, slaDays: x.slaDays || null }));
    const same = list.length === opens.length && list.every((x, i) => x.id === opens[i].id && (x.slaDays || null) === (opens[i].slaDays || null));
    if (!same) await saveStages(orgId, actor, pipe.id, list);
    out.stagesWithSla += list.filter((x) => x.slaDays).length;
  }
  out.createdStages = [...new Set(out.createdStages)];
  return out;
}

export async function importProducts(orgId, actor, rows) {
  let created = 0; let existing = 0;
  const { rows: have } = await pool.query('SELECT id, name FROM crm_products WHERE org_id=$1 AND deleted_at IS NULL', [orgId]);
  const byName = new Map(have.map((r) => [personNameKey(r.name), r.id]));
  for (const p of rows) {
    if (byName.has(personNameKey(p.name))) { existing += 1; continue; }
    const id = randomUUID();
    await pool.query('INSERT INTO crm_products (id, org_id, name, description, billing, active, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)', [id, orgId, p.name.slice(0, 200), (p.description || '').slice(0, 2000), p.billing, p.active, actor.id || null]);
    byName.set(personNameKey(p.name), id); created += 1;
  }
  return { created, existing, total: rows.length };
}

// Tags do catálogo do PipeRun + MRR, previsão de fechamento e tags de cada negócio (uma vez por negócio).
export async function importDealExtras(orgId, tagCatalog, planRows, dealMap, applied, markApplied) {
  const res = { tagsInCatalog: 0, deals: 0, mrr: 0, expected: 0, tagLinks: 0, alreadyApplied: 0 };
  for (const t of tagCatalog) { await ensureTag(pool, orgId, t.name, t.color); res.tagsInCatalog += 1; }
  for (const r of planRows) {
    const d = dealMap.get(r.pid); if (!d) continue;
    if (applied.has(r.pid)) { res.alreadyApplied += 1; continue; }
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      if (r.mrr > 0) { await c.query('UPDATE crm_deals SET mrr=$2 WHERE id=$1 AND org_id=$3 AND mrr=0', [d.id, r.mrr, orgId]); res.mrr += 1; }
      if (r.expectedDate) { await c.query('UPDATE crm_deals SET expected_close_date=$2::date WHERE id=$1 AND org_id=$3 AND expected_close_date IS NULL', [d.id, r.expectedDate, orgId]); res.expected += 1; }
      for (const n of [...new Map([...r.tagNames].reverse().map((x) => [tagKey(x), x])).values()].reverse()) {
        const t = await ensureTag(c, orgId, n);
        await c.query('INSERT INTO crm_deal_tags (org_id, deal_id, tag_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [orgId, d.id, t.id]); res.tagLinks += 1;
      }
      await c.query('COMMIT');
      await markApplied(r.pid, d.id); res.deals += 1;
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  }
  return res;
}

// Formulário respondido / assinatura na linha do tempo (com a data original), anotação com a trilha da assinatura e comentário livre do motivo de perda. Cada item uma vez (piperun_map).
export async function importExtraHistory(orgId, { events, sigNotes, planRows, dealMap, userByName, done, mark }) {
  const res = { timeline: 0, signatureNotes: 0, reasonClose: 0 };
  for (const e of events) {
    const d = dealMap.get(e.dealPid); if (!d || done.has(`tl:${e.hid}`)) continue;
    await pool.query(
      `INSERT INTO crm_timeline_events (id, org_id, company_id, entity_type, entity_id, event_type, summary, data, actor_id, actor_name, occurred_at) VALUES ($1,$2,$3,'deal',$4,$5,$6,$7,$8,$9,$10::timestamptz)`,
      [randomUUID(), orgId, d.companyId, d.id, e.type, `${e.actorName} ${e.summary}`.slice(0, 500), JSON.stringify({ dealId: d.id, imported: true, source: 'piperun' }), userByName.get(personNameKey(e.actorName)) || null, e.actorName, e.at]);
    await mark(`tl:${e.hid}`, d.id); res.timeline += 1;
  }
  for (const n of sigNotes) {
    const d = dealMap.get(n.dealPid); if (!d || done.has(n.pid)) continue;
    const id = randomUUID();
    await pool.query(`INSERT INTO crm_notes (id, org_id, entity_type, entity_id, company_id, body, created_at, updated_at, author_name) VALUES ($1,$2,'deal',$3,$4,$5,$6::timestamptz,$6::timestamptz,'PipeRun')`, [id, orgId, d.id, d.companyId, n.text.slice(0, 5000), n.at]);
    await mark(n.pid, id); res.signatureNotes += 1;
  }
  for (const r of planRows) {
    const d = dealMap.get(r.pid); const key = `rc:${r.pid}`;
    if (!d || !r.reasonClose || !/[\p{L}\p{N}]/u.test(r.reasonClose) || done.has(key)) continue;
    await pool.query(`UPDATE crm_deals SET lost_detail = CASE WHEN lost_detail = '' THEN $2 ELSE left(lost_detail || ' — ' || $2, 2000) END WHERE id=$1 AND org_id=$3 AND status='lost' AND position($2 in lost_detail) = 0`, [d.id, r.reasonClose, orgId]);
    await mark(key, d.id); res.reasonClose += 1;
  }
  return res;
}
