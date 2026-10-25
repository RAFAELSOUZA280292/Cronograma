// Migração PipeRun → CRM (§84): PRÉVIA (não grava) e IMPORTAÇÃO (fases em ordem, cada registro na sua transação: um erro não derruba os outros).
// Fonte: a cópia bruta em piperun_raw (extract.js). Repetível: o mapa piperun_map (+ crm_deals.external_id) impede duplicar. Reaproveita o que o CRM já tem: createCompany/createContact
// (validação, auditoria, timeline), o importador de negócios (funis, etapas, histórico, promoção a cliente) e as mesmas regras de duplicidade.
import { randomUUID } from 'node:crypto';
import { pool } from '../../db.js';
import { companyNameKey, personNameKey, similarity, onlyDigits } from '../text.js';
import { createCompany, createContact, addNote } from '../service.js';
import { classifyCompanies } from '../importer.js';
import { commitDealImport, SOURCE_SYSTEM } from '../dealImporter.js';
import { listPipelines } from '../funnels.js';
import { loadRaw } from './extract.js';
import * as T from './transform.js';

const todayBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const ISSUE_CAP = 400;

// ---------- apoio ----------
async function mapAll(orgId, entity) {
  const { rows } = await pool.query('SELECT pid, crm_id, note FROM piperun_map WHERE org_id=$1 AND entity=$2', [orgId, entity]);
  return new Map(rows.map((r) => [r.pid, { id: r.crm_id, note: r.note }]));
}
async function mapSet(orgId, entity, pid, crmId, note = '') {
  await pool.query(`INSERT INTO piperun_map (org_id, entity, pid, crm_id, note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (org_id, entity, pid) DO UPDATE SET crm_id=EXCLUDED.crm_id, note=EXCLUDED.note`, [orgId, entity, String(pid), String(crmId), note]);
}

async function crmUsers(orgId) {
  const { rows } = await pool.query(`SELECT id, name, email FROM users WHERE org_id=$1 AND role <> 'cliente' AND blocked = false ORDER BY name`, [orgId]);
  return rows;
}
// e-mail exato, nome exato e, por último, nome muito parecido com UM só usuário (ex.: "Maurício Lamdim" × "Maurício Landim").
export function matchUser(users, name, email) {
  const em = String(email || '').trim().toLowerCase();
  if (em) { const hit = users.find((u) => String(u.email || '').toLowerCase() === em); if (hit) return { user: hit, how: 'e-mail' }; }
  const key = personNameKey(name);
  if (!key) return null;
  const exact = users.filter((u) => personNameKey(u.name) === key);
  if (exact.length === 1) return { user: exact[0], how: 'nome' };
  const near = users.filter((u) => similarity(personNameKey(u.name), key) >= 0.88);
  return near.length === 1 ? { user: near[0], how: 'nome parecido' } : null;
}
const personKey = (name, email) => String(email || name || '').trim().toLowerCase();

function collectPeople(ctx, plan, notes, acts, users, ownerMap = {}) {
  const map = new Map();
  const add = (name, email, kind) => {
    const key = personKey(name, email); if (!key) return;
    const p = map.get(key) || { key, name: String(name || '').trim(), email: String(email || '').trim(), deals: 0, activities: 0, notes: 0 };
    p[kind] += 1; if (!p.name && name) p.name = String(name).trim(); if (!p.email && email) p.email = String(email).trim(); map.set(key, p);
  };
  plan.rows.forEach((r) => add(r.ownerName, r.ownerEmail, 'deals'));
  acts.forEach((a) => add(a.ownerName, a.ownerEmail, 'activities'));
  notes.forEach((n) => add(n.authorName, n.authorEmail, 'notes'));
  return [...map.values()].map((p) => {
    const m = matchUser(users, p.name, p.email);
    const chosen = ownerMap[p.key] || '';
    const userId = chosen && users.some((u) => u.id === chosen) ? chosen : (m ? m.user.id : '');
    return { ...p, suggestedUserId: m ? m.user.id : '', how: m ? m.how : '', userId };
  }).sort((a, b) => (b.deals + b.activities + b.notes) - (a.deals + a.activities + a.notes));
}

async function loadCompanyIndex(orgId) {
  const { rows } = await pool.query('SELECT id, legal_name, cnpj, name_norm FROM crm_companies WHERE org_id=$1 AND deleted_at IS NULL', [orgId]);
  const byCnpj = new Map(); const byName = new Map();
  rows.forEach((r) => { if (r.cnpj) byCnpj.set(onlyDigits(r.cnpj), r); String(r.name_norm || '').split('|').filter(Boolean).forEach((k) => byName.set(k, [...(byName.get(k) || []), r])); });
  return { rows, byCnpj, byName };
}
const findCompanyId = (idx, { cnpj, name }) => {
  const d = onlyDigits(cnpj);
  if (d.length === 14 && idx.byCnpj.has(d)) return idx.byCnpj.get(d).id;
  const hits = idx.byName.get(companyNameKey(name)) || [];
  return hits.length === 1 ? hits[0].id : null;
};

export function prepare(raw) {
  const ctx = T.buildContext(raw);
  const plan = T.dealPlan(ctx, todayBR());
  return { ctx, plan, companies: T.companyRows(ctx), contacts: T.contactRows(ctx), notes: T.noteRows(ctx), acts: T.activityRows(ctx), files: T.fileRows(ctx) };
}

// ---------- prévia (não grava nada) ----------
export async function previewMigration(orgId, { ownerMap = {} } = {}) {
  const raw = await loadRaw(orgId);
  if (!raw.deals || !raw.deals.length) return { ready: false, message: 'Ainda não há dados extraídos do PipeRun. Faça a extração primeiro.' };
  const P = prepare(raw);
  const users = await crmUsers(orgId);
  const idx = await loadCompanyIndex(orgId);
  const usable = P.companies.filter((c) => c.usable);
  const cls = usable.length ? await classifyCompanies(orgId, usable.map((c) => c.row)) : [];
  const c = { new: 0, duplicate: 0, possible_duplicate: 0, invalid: 0 };
  cls.forEach((r) => { c[r.status] += 1; });
  const [mCompanies, mContacts, mNotes, mActs, mFiles] = await Promise.all(['company', 'contact', 'note', 'activity', 'file'].map((e) => mapAll(orgId, e)));
  const { rows: ex } = await pool.query(`SELECT external_id FROM crm_deals WHERE org_id=$1 AND external_source=$2 AND external_id <> ''`, [orgId, SOURCE_SYSTEM]);
  const have = new Set(ex.map((r) => r.external_id));
  const pipes = await listPipelines(orgId);
  const pipeKeys = new Set(pipes.map((p) => personNameKey(p.name)));
  const funnels = [...new Set(P.plan.rows.map((r) => r.pipelineName))].map((n) => ({ name: n, exists: pipeKeys.has(personNameKey(n)), deals: P.plan.rows.filter((r) => r.pipelineName === n).length }));
  const compNames = new Set(cls.filter((r) => r.status === 'new' || r.status === 'possible_duplicate').flatMap((r) => [r.input.legalName, r.input.tradeName]).map(companyNameKey).filter(Boolean));
  const provExisting = P.plan.provisional.filter((p) => idx.byName.has(p.key) || compNames.has(p.key)).length;
  const sit = {}; P.plan.rows.forEach((r) => { sit[r.situation] = (sit[r.situation] || 0) + 1; });
  const orphanPersons = P.contacts.filter((x) => !x.companyPid && !P.plan.personCompany.has(x.pid)).length;
  const docs = P.files.docs;
  return {
    ready: true, fetchedFrom: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.length])),
    companies: { raw: P.companies.length, refused: P.companies.length - usable.length, toCreate: c.new + c.possible_duplicate, alreadyInCrm: c.duplicate, invalid: c.invalid, possibleDuplicates: c.possible_duplicate, alreadyMigrated: mCompanies.size },
    provisional: { total: P.plan.provisional.length, fromPerson: P.plan.provisional.filter((p) => p.fromPerson).length, fromTitle: P.plan.provisional.filter((p) => !p.fromPerson).length, linkToExisting: provExisting, toCreate: P.plan.provisional.length - provExisting, sample: P.plan.provisional.slice(0, 12).map((p) => p.name) },
    contacts: { raw: P.contacts.length, withCompany: P.contacts.filter((x) => x.companyPid).length, viaDeal: P.contacts.filter((x) => !x.companyPid && P.plan.personCompany.has(x.pid)).length, withoutAnyCompany: orphanPersons, alreadyMigrated: mContacts.size },
    deals: { total: P.plan.stats.total, trashed: P.plan.stats.trashed, toImport: P.plan.rows.length, alreadyImported: P.plan.rows.filter((r) => have.has(r.externalId)).length, bySituation: sit, funnels },
    notes: { total: (raw.notes || []).length, willImport: T.importableNotes(P.notes, P.plan).filter((n) => n.kind === 'note').length, ofTrashedDeals: P.notes.length - T.importableNotes(P.notes, P.plan).length, empty: (raw.notes || []).length - P.notes.filter((n) => n.kind === 'note').length, proposals: P.notes.filter((n) => n.kind === 'proposal').length, alreadyMigrated: mNotes.size },
    activities: { total: P.acts.length, withoutDeal: P.acts.filter((a) => !a.dealPid).length, alreadyMigrated: mActs.size },
    files: { total: P.files.total, documents: docs.length, ignored: P.files.total - docs.length, ignoredByFormat: P.files.skipped, alreadyMigrated: mFiles.size },
    people: collectPeople(P.ctx, P.plan, P.notes, P.acts, users, ownerMap), crmUsers: users.map((u) => ({ id: u.id, name: u.name })),
  };
}

// ---------- importação ----------
export async function runMigration(orgId, actor, { ownerMap = {}, includeFiles = true, fetchImpl = fetch, maxFiles = Infinity, onProgress = () => {} } = {}) {
  const raw = await loadRaw(orgId);
  if (!raw.deals || !raw.deals.length) throw new Error('Não há dados extraídos do PipeRun. Faça a extração primeiro.');
  const P = prepare(raw);
  const users = await crmUsers(orgId);
  const people = collectPeople(P.ctx, P.plan, P.notes, P.acts, users, ownerMap);
  const userOfKey = new Map(people.map((p) => [p.key, p.userId || null]));
  const userFor = (name, email) => userOfKey.get(personKey(name, email)) || null;
  const issues = []; const issue = (phase, pid, title, message) => { if (issues.length < ISSUE_CAP) issues.push({ phase, pid: String(pid || ''), title: String(title || ''), message }); };
  const result = { companies: {}, provisional: {}, contacts: {}, deals: {}, notes: {}, activities: {}, files: {}, issues };
  const step = (phase, done, total) => onProgress({ phase, done, total });

  // 1) empresas (as que existem no PipeRun e têm nome/CNPJ)
  const mComp = await mapAll(orgId, 'company');
  const usable = P.companies.filter((c) => c.usable && !mComp.has(c.pid));
  const cls = usable.length ? await classifyCompanies(orgId, usable.map((c) => c.row)) : [];
  let created = 0; let existing = 0; const possible = [];
  for (let i = 0; i < usable.length; i += 1) {
    const c = usable[i]; const r = cls[i];
    step('Empresas', i, usable.length);
    try {
      if (r.status === 'duplicate' && r.existingId) { await mapSet(orgId, 'company', c.pid, r.existingId); existing += 1; continue; }
      if (r.status === 'invalid') {
        const cnpjBad = (r.messages || []).some((m) => /cnpj/i.test(m));
        if (!cnpjBad) { issue('Empresas', c.pid, c.row.legalName, (r.messages || []).join(' ')); continue; }
      }
      const input = r.status === 'invalid' ? { ...r.input, cnpj: '' } : r.input;
      const co = await createCompany(orgId, actor, input, { force: true, timelineSummary: `${actor.name} importou a empresa do PipeRun.`, timelineData: { source: 'piperun', piperunId: c.pid } });
      await mapSet(orgId, 'company', c.pid, co.id); created += 1;
      if (r.status === 'possible_duplicate') possible.push({ id: co.id, name: c.row.legalName, similarTo: (r.messages || [])[0] || '' });
      const extra = [r.status === 'invalid' ? `CNPJ informado no PipeRun e recusado pelo CRM: ${c.row.cnpj}` : '', c.extra].filter(Boolean).join('\n');
      if (extra) await addNote(orgId, actor, { entityType: 'company', entityId: co.id, body: `Importado do PipeRun:\n${extra}`.slice(0, 5000) });
    } catch (e) { issue('Empresas', c.pid, c.row.legalName, e.message); }
  }
  result.companies = { created, linkedToExisting: existing, possibleDuplicates: possible, refused: P.companies.length - P.companies.filter((c) => c.usable).length, alreadyMigrated: mComp.size };

  // 2) empresas provisórias (negócios sem empresa no PipeRun)
  let idx = await loadCompanyIndex(orgId);
  const mProv = await mapAll(orgId, 'provisional');
  let provCreated = 0; let provLinked = 0;
  for (let i = 0; i < P.plan.provisional.length; i += 1) {
    const p = P.plan.provisional[i];
    step('Empresas provisórias', i, P.plan.provisional.length);
    try {
      let id = mProv.has(p.key) ? mProv.get(p.key).id : null;
      if (!id) id = findCompanyId(idx, { name: p.name });
      if (id) { provLinked += 1; await mapSet(orgId, 'provisional', p.key, id); continue; }
      const co = await createCompany(orgId, actor, { legalName: p.name.slice(0, 200), relationship: 'prospect' },
        { force: true, allowInvalidCnpj: true, timelineSummary: `${actor.name} criou a empresa provisória a partir do PipeRun (negócio sem empresa).`, timelineData: { source: 'piperun', provisional: true } });
      await addNote(orgId, actor, { entityType: 'company', entityId: co.id, body: `Empresa PROVISÓRIA criada na migração do PipeRun: o negócio dela não tinha empresa lá, então o nome veio ${p.fromPerson ? 'da pessoa de contato' : 'do título do negócio'}. Completar o cadastro (razão social e CNPJ).` });
      await mapSet(orgId, 'provisional', p.key, co.id); provCreated += 1;
      idx.byName.set(p.key, [{ id: co.id }]);
    } catch (e) { issue('Empresas provisórias', p.key, p.name, e.message); }
  }
  result.provisional = { created: provCreated, linkedToExisting: provLinked };

  // 3) contatos
  idx = await loadCompanyIndex(orgId);
  const compMap = await mapAll(orgId, 'company');
  const mContact = await mapAll(orgId, 'contact');
  let cCreated = 0; let cLinked = 0; let cSkipped = 0; let extraEmails = 0;
  const contactCompany = new Map();
  for (let i = 0; i < P.contacts.length; i += 1) {
    const k = P.contacts[i];
    step('Contatos', i, P.contacts.length);
    if (mContact.has(k.pid)) { contactCompany.set(k.pid, mContact.get(k.pid).note); continue; }
    try {
      let companyId = k.companyPid && compMap.has(k.companyPid) ? compMap.get(k.companyPid).id : null;
      if (!companyId) { const viaDeal = P.plan.personCompany.get(k.pid); if (viaDeal) companyId = findCompanyId(idx, viaDeal); }
      if (!companyId) { cSkipped += 1; issue('Contatos', k.pid, `${k.row.firstName} ${k.row.lastName}`.trim(), 'Pessoa sem empresa e sem negócio — não importada (continua no backup).'); continue; }
      const nameKey = personNameKey(`${k.row.firstName} ${k.row.lastName}`);
      const { rows: hit } = await pool.query(
        `SELECT id FROM crm_contacts WHERE org_id=$1 AND company_id=$2 AND deleted_at IS NULL AND (lower(email) = NULLIF($3::text,'') OR ($4::text <> '' AND name_norm = $4::text)) LIMIT 1`, [orgId, companyId, k.row.email, nameKey]);
      let id = hit[0] ? hit[0].id : null;
      if (id) cLinked += 1;
      else {
        try { id = (await createContact(orgId, actor, { companyId, ...k.row }, { force: true })).id; } catch (e) {
          id = (await createContact(orgId, actor, { companyId, firstName: k.row.firstName, lastName: k.row.lastName, jobTitle: k.row.jobTitle, email: k.row.email }, { force: true })).id;
          issue('Contatos', k.pid, `${k.row.firstName} ${k.row.lastName}`.trim(), `Telefone/LinkedIn não aceitos pelo CRM (${e.message}); contato criado sem eles.`);
        }
        cCreated += 1;
      }
      extraEmails += k.extraEmails;
      await mapSet(orgId, 'contact', k.pid, id, companyId); contactCompany.set(k.pid, companyId);
      if (k.observation && !hit[0]) await addNote(orgId, actor, { entityType: 'contact', entityId: id, body: `Observação importada do PipeRun: ${k.observation}`.slice(0, 5000) }).catch(() => {});
    } catch (e) { issue('Contatos', k.pid, `${k.row.firstName} ${k.row.lastName}`.trim(), e.message); }
  }
  result.contacts = { created: cCreated, linkedToExisting: cLinked, skippedWithoutCompany: cSkipped, additionalEmailsNotStored: extraEmails };

  // 4) negócios (reaproveita o importador de negócios: funis, etapas na ordem real, histórico, promoção a cliente)
  step('Negócios', 0, P.plan.rows.length);
  const ownerMapForDeals = {}; people.forEach((p) => { if (p.userId) ownerMapForDeals[p.key] = p.userId; });
  const dealRes = await commitDealImport(orgId, actor, P.plan.rows, { ownerMap: ownerMapForDeals, stageHints: P.plan.stageHints });
  dealRes.failed.forEach((f) => issue('Negócios', '', f.title, f.message));
  dealRes.skipped.forEach((sk) => issue('Negócios', sk.externalId, sk.title, `${sk.status}: não importado.`));
  result.deals = { created: dealRes.created, alreadyImported: dealRes.alreadyImported, failed: dealRes.failed.length, skipped: dealRes.skipped.length, createdFunnels: dealRes.createdFunnels, createdStages: dealRes.createdStages.length, promotedCompanies: dealRes.promotedCompanies };
  const { rows: dealsInCrm } = await pool.query(`SELECT id, company_id, external_id FROM crm_deals WHERE org_id=$1 AND external_source=$2 AND external_id = ANY($3::text[])`, [orgId, SOURCE_SYSTEM, P.plan.rows.map((r) => r.externalId)]);
  const byHash = new Map(dealsInCrm.map((r) => [r.external_id, r]));
  const dealMap = new Map();
  for (const r of P.plan.rows) { const d = byHash.get(r.externalId); if (d) { dealMap.set(r.pid, { id: d.id, companyId: d.company_id }); await mapSet(orgId, 'deal', r.pid, d.id, d.company_id); } }

  // 5) notas + propostas (como nota do negócio)
  const contactIds = await mapAll(orgId, 'contact');
  const mNote = await mapAll(orgId, 'note');
  let nCreated = 0; let nSkipped = 0; const pendingNotes = P.notes.filter((n) => !mNote.has(n.pid));
  for (let i = 0; i < pendingNotes.length; i += 100) {
    const chunk = pendingNotes.slice(i, i + 100); step('Notas', i, pendingNotes.length);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      for (const n of chunk) {
        let target = null;
        if (n.dealPid && dealMap.has(n.dealPid)) target = { type: 'deal', id: dealMap.get(n.dealPid).id, company: dealMap.get(n.dealPid).companyId };
        else if (n.companyPid && compMap.has(n.companyPid)) target = { type: 'company', id: compMap.get(n.companyPid).id, company: compMap.get(n.companyPid).id };
        else if (n.personPid && contactCompany.has(n.personPid)) target = { type: 'contact', id: contactIds.get(n.personPid).id, company: contactCompany.get(n.personPid) };
        if (!target) { nSkipped += 1; issue('Notas', n.pid, n.text.slice(0, 60), 'A nota aponta para um negócio/empresa/pessoa que não foi importado.'); continue; }
        const uid = userFor(n.authorName, n.authorEmail);
        const body = (uid || !n.authorName ? n.text : `${n.text}\n\n— ${n.authorName} (PipeRun)`).slice(0, 10000);
        const id = randomUUID();
        await c.query(
          `INSERT INTO crm_notes (id, org_id, entity_type, entity_id, company_id, body, created_at, created_by, updated_at, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6, COALESCE(NULLIF($7::text,'')::timestamp AT TIME ZONE 'America/Sao_Paulo', now()), $8, COALESCE(NULLIF($7::text,'')::timestamp AT TIME ZONE 'America/Sao_Paulo', now()), $8)`,
          [id, orgId, target.type, target.id, target.company, body, n.createdAt, uid || actor.id || null]);
        await c.query(`INSERT INTO piperun_map (org_id, entity, pid, crm_id, note) VALUES ($1,'note',$2,$3,$4) ON CONFLICT DO NOTHING`, [orgId, n.pid, id, target.company]);
        nCreated += 1;
      }
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); issue('Notas', '', `lote ${i}`, e.message); } finally { c.release(); }
  }
  result.notes = { created: nCreated, skipped: nSkipped, alreadyMigrated: mNote.size, emptyIgnored: (raw.notes || []).length - P.notes.filter((n) => n.kind === 'note').length };

  // 6) atividades
  const mAct = await mapAll(orgId, 'activity');
  const today = todayBR(); let aCreated = 0; let aSkipped = 0;
  const pendingActs = P.acts.filter((a) => !mAct.has(a.pid));
  for (let i = 0; i < pendingActs.length; i += 1) {
    const a = pendingActs[i]; step('Atividades', i, pendingActs.length);
    const d = a.dealPid ? dealMap.get(a.dealPid) : null;
    if (!d) { aSkipped += 1; issue('Atividades', a.pid, a.title, a.dealPid ? 'O negócio da atividade não foi importado.' : 'Atividade sem negócio no PipeRun — não importada (continua no backup).'); continue; }
    try {
      const owner = userFor(a.ownerName, a.ownerEmail) || actor.id || null;
      const id = randomUUID(); const done = a.state === 'done';
      await pool.query(
        `INSERT INTO crm_activities (id, org_id, company_id, deal_id, activity_type, title, description, due_date, due_time, priority, status, owner_id, completed_at, completed_by, outcome, due_notified_at, created_at, created_by, updated_at, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,
                 CASE WHEN $11::text='done' THEN COALESCE(NULLIF($13::text,'')::timestamp AT TIME ZONE 'America/Sao_Paulo', now()) END,
                 CASE WHEN $11::text='done' THEN $12::text END, $14, CASE WHEN $11::text <> 'open' OR $8::date <= $15::date THEN now() END,
                 COALESCE(NULLIF($16::text,'')::timestamp AT TIME ZONE 'America/Sao_Paulo', now()), $17, COALESCE(NULLIF($16::text,'')::timestamp AT TIME ZONE 'America/Sao_Paulo', now()), $17)`,
        [id, orgId, d.companyId, d.id, a.activityType, a.title.slice(0, 300), a.description.slice(0, 5000), a.dueDate, a.dueTime, a.priority, a.state, owner, done ? a.completedAt : '', a.outcome, today, a.createdAt, actor.id || null]);
      await mapSet(orgId, 'activity', a.pid, id, d.companyId); aCreated += 1;
    } catch (e) { issue('Atividades', a.pid, a.title, e.message); }
  }
  result.activities = { created: aCreated, skipped: aSkipped, alreadyMigrated: mAct.size };

  // 7) documentos (PDF, DOCX…): baixa do PipeRun e guarda no CRM; imagens e áudios ficam só no backup
  const mFile = await mapAll(orgId, 'file');
  let fCreated = 0; let fFailed = 0; let fSkipped = 0;
  const docs = includeFiles ? P.files.docs.filter((f) => !mFile.has(f.pid)).slice(0, maxFiles) : [];
  for (let i = 0; i < docs.length; i += 1) {
    const f = docs[i]; step('Arquivos', i, docs.length);
    const d = dealMap.get(f.dealPid);
    if (!d) { fSkipped += 1; issue('Arquivos', f.pid, f.name, 'O negócio do arquivo não foi importado.'); continue; }
    try {
      const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 90000);
      let buf;
      try {
        const res = await fetchImpl(f.url, { signal: ac.signal });
        if (!res.ok) throw new Error(`o PipeRun respondeu ${res.status}`);
        const len = Number(res.headers.get('content-length'));
        if (Number.isFinite(len) && len > MAX_FILE_BYTES) throw new Error(`arquivo grande demais (${Math.round(len / 1048576)} MB; limite 30 MB)`);
        buf = Buffer.from(await res.arrayBuffer());
      } finally { clearTimeout(to); }
      if (buf.length > MAX_FILE_BYTES) throw new Error('arquivo grande demais (limite 30 MB)');
      if (!buf.length) throw new Error('arquivo vazio');
      const id = randomUUID();
      await pool.query(
        `INSERT INTO crm_deal_files (id, org_id, deal_id, company_id, name, mime, size, data, source, external_id, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'piperun',$9,$10, COALESCE(NULLIF($11::text,'')::timestamp AT TIME ZONE 'America/Sao_Paulo', now()))`,
        [id, orgId, d.id, d.companyId, f.name, f.mime, buf.length, buf, f.pid, actor.id || null, f.createdAt]);
      await mapSet(orgId, 'file', f.pid, id, d.companyId); fCreated += 1;
    } catch (e) { fFailed += 1; issue('Arquivos', f.pid, f.name, e.message); }
  }
  result.files = { created: fCreated, failed: fFailed, skipped: fSkipped, alreadyMigrated: mFile.size, documents: P.files.docs.length, imagesAndAudioKeptOnlyInBackup: P.files.total - P.files.docs.length, includeFiles };
  step('Concluído', 1, 1);
  return result;
}
