// CRM — importação de NEGÓCIOS a partir de planilha (Fase 2b, 2026-09-20, PROJECT_CONTEXT.md §58).
// Pensado no export "Oportunidades" do PipeRun, mas o mapeamento de colunas é do assistente.
// Mesmo desenho do importador de empresas: PREVIEW (não grava) e COMMIT (reclassifica; nunca confia
// no preview do navegador). Regras acordadas com o Rafael:
//  · negócio SEM empresa fica de fora e volta numa lista; empresa que não está no CRM idem (importe
//    as empresas primeiro);
//  · situação "Lixeira" é descartada; "Congelada" entra como negócio EM ABERTO (marcado na descrição);
//  · perdido sem motivo (o PipeRun não exporta) entra com o motivo "Não informado (importado)";
//  · ganho promove a empresa a cliente com a data do fechamento (não "hoje");
//  · datas originais (cadastro/fechamento) e há quantos dias está na etapa são preservados;
//  · idempotente: o ID do PipeRun (Hash) impede duplicar ao reimportar o mesmo arquivo.
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { CrmError } from './errors.js';
import { onlyDigits, companyNameKey, personNameKey, parseDateBR, firstEmail } from './text.js';
import { tx, addAudit, addTimeline, parseNumberBR, todayBR, createContact, RELATIONSHIP_LABELS } from './service.js';
import { listPipelines, createPipelineTx, appendOpenStageTx } from './funnels.js';
import { MAX_IMPORT_ROWS, isPlaceholderName } from './importer.js';
import { brl } from './deals.js';

export const SOURCE_SYSTEM = 'piperun';

export const DEAL_IMPORT_FIELDS = [
  ['externalId', 'ID da oportunidade (Hash)'], ['title', 'Título'], ['pipelineName', 'Funil'], ['stageName', 'Etapa'], ['situation', 'Situação (Aberta/Ganha/Perdida/Congelada/Lixeira)'],
  ['value', 'Valor'], ['createdAt', 'Data de cadastro'], ['closedAt', 'Data de fechamento'], ['stageDays', 'Dias na etapa atual'],
  ['ownerEmail', 'Dono (e-mail)'], ['ownerName', 'Dono (nome)'], ['source', 'Origem'], ['notes', 'Observações'], ['description', 'Descrição'], ['tags', 'Tags'],
  ['companyCnpj', 'CNPJ da empresa'], ['companyName', 'Nome da empresa'], ['personName', 'Pessoa de contato (nome)'], ['personEmail', 'Pessoa de contato (e-mail)'],
].map(([key, label]) => ({ key, label }));

// Ordem provável das etapas quando o funil é criado pela importação (o export não traz a ordem):
// o que não está aqui vai depois, em ordem alfabética — o Rafael reordena na tela de funis.
const STAGE_ORDER = ['suspect', 'leads', 'lead', 'cadencia iniciada', 'conexao', 'reuniao agendada', 'mapeamento', 'reuniao de levantamento de informacoes para simulacao',
  'apresentacao do programa pricetax', 'acesso teste', 'oportunidade estruturada', 'proposta', 'negociacao', 'contrato', 'ganhos'];
export function orderStageNames(names) {
  const idx = (n) => { const i = STAGE_ORDER.indexOf(personNameKey(n)); return i < 0 ? 999 : i; };
  return [...names].sort((a, b) => idx(a) - idx(b) || String(a).localeCompare(String(b), 'pt'));
}

const SIT = { aberta: 'open', congelada: 'open', ganha: 'won', perdida: 'lost' };
const SIT_LABEL = { open: 'em aberto', won: 'ganho', lost: 'perdido' };
const RESERVED_STAGE = new Set(['ganho', 'perdido']);
const stageLabel = (n) => (RESERVED_STAGE.has(personNameKey(n)) ? `${String(n).trim()} (PipeRun)` : String(n).trim());

function assertRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new CrmError(400, 'Nenhuma linha para importar.');
  if (rows.length > MAX_IMPORT_ROWS) throw new CrmError(400, `Limite de ${MAX_IMPORT_ROWS} linhas por importação — divida a planilha.`);
}

function addDaysISO(dateStr, n) { return new Date(new Date(`${dateStr}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10); }

async function loadContext(orgId) {
  const [pipelines, comps, users, ext] = await Promise.all([
    listPipelines(orgId),
    pool.query('SELECT id, legal_name, trade_name, cnpj, name_norm, relationship FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL', [orgId]),
    pool.query(`SELECT id, name, email FROM users WHERE org_id=$1 AND role <> 'cliente' AND blocked = false`, [orgId]),
    pool.query(`SELECT external_id FROM crm_deals WHERE org_id=$1 AND external_source=$2 AND external_id <> ''`, [orgId, SOURCE_SYSTEM]),
  ]);
  const byCnpj = new Map();
  comps.rows.forEach((r) => { if (r.cnpj) byCnpj.set(r.cnpj, r); });
  return { pipelines, companies: comps.rows, byCnpj, users: users.rows, existing: new Set(ext.rows.map((r) => r.external_id)) };
}

function findCompany(ctx, raw) {
  let cnpj = onlyDigits(raw.companyCnpj);
  if (/^\d{12,13}$/.test(cnpj)) cnpj = cnpj.padStart(14, '0');
  const name = String(raw.companyName || '').trim();
  // "Nome não informado" é o registro vazio que o PipeRun cria — não é uma empresa.
  if (name && isPlaceholderName(name) && cnpj.length !== 14) return { none: true, placeholder: name };
  if (!cnpj && !name) return { none: true };
  let hit = cnpj.length === 14 ? ctx.byCnpj.get(cnpj) : null;
  if (!hit && name) {
    const key = companyNameKey(name);
    const hits = ctx.companies.filter((c) => String(c.name_norm || '').split('|').includes(key));
    if (hits.length > 1) return { ambiguous: hits.length, name };
    [hit] = hits;
  }
  return hit ? { company: hit } : { missing: true, name, cnpj };
}

function findOwner(ctx, raw) {
  const email = firstEmail(raw.ownerEmail);
  const name = String(raw.ownerName || '').trim();
  const key = (email || name).toLowerCase();
  if (!key) return { key: '' };
  const byEmail = email ? ctx.users.find((u) => String(u.email || '').toLowerCase() === email) : null;
  const byName = !byEmail && name ? ctx.users.find((u) => personNameKey(u.name) === personNameKey(name)) : null;
  const u = byEmail || byName;
  return { key, email, name, userId: u ? u.id : null };
}

export async function classifyDeals(orgId, rows) {
  assertRows(rows);
  const ctx = await loadContext(orgId);
  const seen = new Set();
  const today = todayBR();
  const results = rows.map((raw, i) => {
    const messages = [];
    const line = i + 2;
    const title = String(raw.title || '').trim() || String(raw.companyName || raw.personName || '').trim();
    const externalId = String(raw.externalId || '').trim();
    const sitKey = personNameKey(raw.situation);
    const base = {
      index: i, line, externalId, title: title || '(sem título)', pipeline: String(raw.pipelineName || '').trim(), stage: String(raw.stageName || '').trim(), situation: String(raw.situation || '').trim(),
      company: String(raw.companyName || '').trim() || String(raw.companyCnpj || '').trim(), person: String(raw.personName || '').trim(), personEmail: String(raw.personEmail || '').trim(),
    };
    if (sitKey === 'lixeira') return { ...base, status: 'discarded', messages: ['Estava na Lixeira do PipeRun — descartada.'] };
    const kind = SIT[sitKey];
    if (!kind) return { ...base, status: 'invalid', messages: [`Situação "${raw.situation || ''}" não reconhecida (use Aberta, Ganha, Perdida, Congelada ou Lixeira).`] };
    if (!externalId) return { ...base, status: 'invalid', messages: ['Sem o ID da oportunidade (Hash) — sem ele não dá pra evitar duplicar ao reimportar.'] };
    if (seen.has(externalId)) return { ...base, status: 'invalid', messages: ['ID repetido na planilha.'] };
    seen.add(externalId);
    if (ctx.existing.has(externalId)) return { ...base, status: 'already', messages: ['Já importado antes.'] };
    if (!title) return { ...base, status: 'invalid', messages: ['Sem título.'] };
    if (!base.pipeline) return { ...base, status: 'invalid', messages: ['Sem funil.'] };
    if (!base.stage) return { ...base, status: 'invalid', messages: ['Sem etapa.'] };
    const co = findCompany(ctx, raw);
    if (co.none) return { ...base, status: 'no_company', messages: [co.placeholder ? `A empresa veio como "${co.placeholder}" (registro vazio no PipeRun) — fica de fora. Complete lá e reexporte.` : 'Sem empresa no PipeRun — fica de fora (complete lá e reexporte).'] };
    if (co.ambiguous) return { ...base, status: 'invalid', messages: [`Empresa "${co.name}" ambígua no CRM (${co.ambiguous} cadastros) — informe o CNPJ.`] };
    if (co.missing) return { ...base, status: 'company_not_found', messages: [`Empresa "${co.name || co.cnpj}" não está no CRM — importe as empresas primeiro.`] };
    let created = parseDateBR(raw.createdAt);
    if (created === null) { messages.push(`Data de cadastro "${raw.createdAt}" não reconhecida — usei hoje.`); created = today; }
    if (!created) created = today;
    let closed = parseDateBR(raw.closedAt);
    if (closed === null) { messages.push(`Data de fechamento "${raw.closedAt}" não reconhecida — usei a data de cadastro.`); closed = ''; }
    if (kind !== 'open' && !closed) { closed = created; if (!raw.closedAt) messages.push('Sem data de fechamento — usei a data de cadastro.'); }
    if (closed && closed < created) created = closed;
    const v = parseNumberBR(raw.value);
    if (Number.isNaN(v)) messages.push(`Valor "${raw.value}" inválido — usei zero.`);
    const days = Number(String(raw.stageDays || '').replace(/\D/g, ''));
    let stageEntered = kind === 'open' ? (Number.isFinite(days) && String(raw.stageDays || '').trim() !== '' ? addDaysISO(today, -days) : created) : closed;
    if (stageEntered < created) stageEntered = created;
    const owner = findOwner(ctx, raw);
    return {
      ...base, status: 'new', messages, kind, frozen: sitKey === 'congelada', companyId: co.company.id, companyName: co.company.legal_name, companyRelationship: co.company.relationship,
      value: Number.isFinite(v) && v > 0 ? v : 0, created, closed: kind === 'open' ? null : closed, stageEntered, owner,
      source: String(raw.source || '').trim().slice(0, 200), notes: String(raw.notes || '').trim(), description: String(raw.description || '').trim(), tags: String(raw.tags || '').trim(),
      personName: base.person, personEmail: base.personEmail,
    };
  });
  return { ctx, results };
}

function summarize(ctx, results) {
  const counts = { new: 0, already: 0, no_company: 0, company_not_found: 0, discarded: 0, invalid: 0 };
  results.forEach((r) => { counts[r.status] += 1; });
  const news = results.filter((r) => r.status === 'new');
  const owners = new Map();
  news.forEach((r) => {
    if (!r.owner.key) return;
    const o = owners.get(r.owner.key) || { key: r.owner.key, label: r.owner.name || r.owner.email, email: r.owner.email || '', count: 0, userId: r.owner.userId };
    o.count += 1; owners.set(r.owner.key, o);
  });
  const pipeByKey = new Map(ctx.pipelines.map((p) => [personNameKey(p.name), p]));
  const funnels = new Map();
  news.forEach((r) => {
    const k = personNameKey(r.pipeline);
    const f = funnels.get(k) || { name: r.pipeline, exists: pipeByKey.has(k), count: 0, stages: new Set() };
    f.count += 1; f.stages.add(stageLabel(r.stage)); funnels.set(k, f);
  });
  const funnelList = [...funnels.entries()].map(([k, f]) => {
    const p = pipeByKey.get(k);
    const have = new Set(p ? p.stages.map((s) => personNameKey(s.name)) : []);
    const newStages = orderStageNames([...f.stages]).filter((n) => !have.has(personNameKey(n)));
    return { name: p ? p.name : f.name, exists: f.exists, count: f.count, newStages };
  });
  const promote = new Set(news.filter((r) => r.kind === 'won' && ['prospect', 'former_client'].includes(r.companyRelationship)).map((r) => r.companyId));
  return { counts, owners: [...owners.values()], funnels: funnelList, willPromote: promote.size };
}

const skippedRow = (r) => ({ line: r.line, externalId: r.externalId, title: r.title, pipeline: r.pipeline, stage: r.stage, situation: r.situation, company: r.company, person: r.person, personEmail: r.personEmail, status: r.status, reason: r.messages.join(' ') });

export async function previewDealImport(orgId, rows) {
  const { ctx, results } = await classifyDeals(orgId, rows);
  const sum = summarize(ctx, results);
  return {
    ...sum, total: results.length,
    rows: results.map((r) => ({ index: r.index, line: r.line, title: r.title, status: r.status, messages: r.messages, companyName: r.companyName || r.company || '', pipeline: r.pipeline, stage: r.stage, situation: r.situation })),
    skipped: results.filter((r) => r.status !== 'new' && r.status !== 'already').map(skippedRow),
  };
}

async function resolveContact(orgId, actor, companyId, name, emailRaw, cache) {
  const email = firstEmail(emailRaw);
  const nm = String(name || '').trim();
  if (!nm && !email) return null;
  const nameKey = personNameKey(nm);
  const ck = `${companyId}|${email || nameKey}`;
  if (cache.has(ck)) return cache.get(ck);
  const { rows } = await pool.query(
    `SELECT id FROM crm_contacts WHERE org_id=$1 AND company_id=$2 AND deleted_at IS NULL
       AND (lower(email) = NULLIF($3::text, '') OR ($4::text <> '' AND name_norm = $4::text)) LIMIT 1`, [orgId, companyId, email, nameKey]);
  let id = rows[0] ? rows[0].id : null;
  if (!id) {
    const parts = (nm || email.split('@')[0]).split(/\s+/);
    const c = await createContact(orgId, actor, { companyId, firstName: parts.shift() || '-', lastName: parts.join(' '), email }, { force: true });
    id = c.id;
  }
  cache.set(ck, id);
  return id;
}

async function insertDeal(c, orgId, actor, r, pipeline, stageId, etapaStageId, ownerId, contactId) {
  const id = randomUUID();
  const ts = (d) => `($${d}::date + time '12:00') AT TIME ZONE 'America/Sao_Paulo'`;
  const lost = r.kind === 'lost';
  const descParts = [r.description, r.tags ? `Tags no PipeRun: ${r.tags}` : '', r.frozen ? 'Congelada no PipeRun — importada como em aberto (parada).' : ''].filter(Boolean);
  const { rows: ord } = await c.query('SELECT COALESCE(max(board_order),0)+1 AS n FROM crm_deals WHERE stage_id=$1 AND deleted_at IS NULL', [stageId]);
  await c.query(
    `INSERT INTO crm_deals (id, org_id, company_id, pipeline_id, stage_id, title, deal_type, value, owner_id, primary_contact_id, source, description, status, lost_reason, lost_detail,
                            closed_at, stage_entered_at, board_order, created_at, created_by, updated_at, updated_by, external_source, external_id)
     VALUES ($1,$2,$3,$4,$5,$6,'new',$7,$8,$9,$10,$11,$12,$13,$14,
             (NULLIF($15::text, '')::date + time '12:00') AT TIME ZONE 'America/Sao_Paulo', ${ts(16)}, $17, ${ts(18)}, $19, ${ts(20)}, $19, $21, $22)`,
    [id, orgId, r.companyId, pipeline.id, stageId, r.title.slice(0, 400), r.value, ownerId, contactId, r.source, descParts.join('\n').slice(0, 3000), r.kind,
      lost ? 'nao_informado' : '', lost ? 'Importado do PipeRun — o motivo da perda não vem no export.' : '',
      r.closed || '', r.stageEntered, Number(ord[0].n), r.created, actor.id || null, r.closed || r.stageEntered, SOURCE_SYSTEM, r.externalId]);
  // Histórico de etapas: só o que o export permite afirmar (etapa atual/última + fechamento).
  const hist = async (fromId, fromName, toId, toName, when) => c.query(
    `INSERT INTO crm_deal_stage_history (id, org_id, deal_id, company_id, from_stage_id, to_stage_id, from_stage_name, to_stage_name, days_in_from, actor_id, actor_name, moved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10, ${ts(11)})`, [randomUUID(), orgId, id, r.companyId, fromId, toId, fromName, toName, actor.id || null, actor.name || '', when]);
  if (r.kind === 'open') await hist(null, '', stageId, r.stageLabel, r.stageEntered);
  else { await hist(null, '', etapaStageId, r.stageLabel, r.created); await hist(etapaStageId, r.stageLabel, stageId, r.closedStageName, r.closed); }
  await addAudit(c, { orgId, entityType: 'deal', entityId: id, action: 'create', actor, changes: [
    { field: 'origem', label: 'Origem do registro', from: null, to: `Importado do PipeRun (ID ${r.externalId})` }, { field: 'title', label: 'Título', from: null, to: r.title },
    { field: 'stage', label: 'Etapa', from: null, to: r.kind === 'open' ? r.stageLabel : `${r.stageLabel} → ${r.closedStageName}` }, ...(r.value ? [{ field: 'value', label: 'Valor', from: null, to: r.value }] : [])] });
  await addTimeline(c, { orgId, companyId: r.companyId, entityType: 'deal', entityId: id, eventType: 'deal_created', actor,
    summary: `${actor.name} importou do PipeRun o negócio "${r.title}" (${SIT_LABEL[r.kind]}${r.kind === 'open' ? `, etapa ${r.stageLabel}` : ''}${r.value ? `, ${brl(r.value)}` : ''}).`, data: { dealId: id, imported: true, source: SOURCE_SYSTEM } });
  if (r.notes) {
    const nid = randomUUID();
    await c.query(`INSERT INTO crm_notes (id, org_id, entity_type, entity_id, company_id, body, created_by, updated_by) VALUES ($1,$2,'deal',$3,$4,$5,$6,$6)`,
      [nid, orgId, id, r.companyId, `Observação importada do PipeRun: ${r.notes}`.slice(0, 5000), actor.id || null]);
    await addAudit(c, { orgId, entityType: 'note', entityId: nid, action: 'create', changes: [{ field: 'body', label: 'Nota', from: null, to: r.notes }], actor });
  }
  let promoted = false;
  if (r.kind === 'won') {
    const { rows: co } = await c.query('SELECT relationship FROM crm_companies WHERE id=$1 FOR UPDATE', [r.companyId]);
    if (co[0] && ['prospect', 'former_client'].includes(co[0].relationship)) {
      await c.query(`UPDATE crm_companies SET relationship='client', client_since=COALESCE(client_since, $2::date), updated_at=now(), updated_by=$3 WHERE id=$1`, [r.companyId, r.closed, actor.id || null]);
      await addAudit(c, { orgId, entityType: 'company', entityId: r.companyId, action: 'update', actor, changes: [{ field: 'relationship', label: 'Relação', from: co[0].relationship, to: 'client' }] });
      await addTimeline(c, { orgId, companyId: r.companyId, entityType: 'company', entityId: r.companyId, eventType: 'relationship_changed', actor,
        summary: `Relação alterada de ${RELATIONSHIP_LABELS[co[0].relationship]} para Cliente (negócio "${r.title}" ganho, importado do PipeRun).`, data: { from: co[0].relationship, to: 'client', automatic: true, imported: true, dealId: id } });
      promoted = true;
    }
  }
  return { id, promoted };
}

export async function commitDealImport(orgId, actor, rows, { ownerMap = {} } = {}) {
  const { ctx, results } = await classifyDeals(orgId, rows);
  const news = results.filter((r) => r.status === 'new');
  const out = { created: 0, alreadyImported: 0, failed: [], createdFunnels: [], createdStages: [], promotedCompanies: 0, skipped: results.filter((r) => r.status !== 'new' && r.status !== 'already').map(skippedRow),
    counts: summarize(ctx, results).counts };
  const validUsers = new Set(ctx.users.map((u) => u.id));

  // 1) funis e etapas que faltam (cada funil na sua transação)
  const groups = new Map();
  news.forEach((r) => { const k = personNameKey(r.pipeline); (groups.get(k) || groups.set(k, { name: r.pipeline, stages: new Set() }).get(k)).stages.add(stageLabel(r.stage)); });
  const pipeByKey = new Map(ctx.pipelines.map((p) => [personNameKey(p.name), p]));
  for (const [k, g] of groups) {
    const existing = pipeByKey.get(k);
    if (!existing) {
      await tx((c) => createPipelineTx(c, orgId, actor, { name: g.name, openStageNames: orderStageNames([...g.stages]) }));
      out.createdFunnels.push(g.name); g.stages.forEach((n) => out.createdStages.push(`${g.name} › ${n}`));
    } else {
      const have = new Set(existing.stages.map((s) => personNameKey(s.name)));
      for (const n of orderStageNames([...g.stages]).filter((x) => !have.has(personNameKey(x)))) {
        await tx((c) => appendOpenStageTx(c, orgId, existing.id, n));
        out.createdStages.push(`${existing.name} › ${n}`);
      }
    }
  }
  const pipelines = await listPipelines(orgId);
  const pKey = new Map(pipelines.map((p) => [personNameKey(p.name), p]));

  // 2) negócios (cada um na sua transação; um erro não derruba os demais)
  const contactCache = new Map();
  for (const r of news) {
    try {
      const pipe = pKey.get(personNameKey(r.pipeline));
      const etapaName = stageLabel(r.stage);
      const etapa = pipe.stages.find((s) => personNameKey(s.name) === personNameKey(etapaName) && s.kind === 'open');
      const closedStage = pipe.stages.find((s) => s.kind === r.kind);
      const target = r.kind === 'open' ? etapa : closedStage;
      if (!target || !etapa) throw new Error('etapa do funil não encontrada');
      const wanted = r.owner.userId || ownerMap[r.owner.key] || null;
      const ownerId = wanted && validUsers.has(wanted) ? wanted : null;
      const contactId = await resolveContact(orgId, actor, r.companyId, r.personName, r.personEmail, contactCache);
      const res = await tx((c) => insertDeal(c, orgId, actor, { ...r, stageLabel: etapaName, closedStageName: closedStage ? closedStage.name : '' }, pipe, target.id, etapa.id, ownerId, contactId));
      out.created += 1;
      if (res.promoted) out.promotedCompanies += 1;
    } catch (e) {
      if (e && e.code === '23505') out.alreadyImported += 1;
      else out.failed.push({ line: r.line, title: r.title, message: e.message });
    }
  }
  out.alreadyImported += results.filter((r) => r.status === 'already').length;
  return out;
}
