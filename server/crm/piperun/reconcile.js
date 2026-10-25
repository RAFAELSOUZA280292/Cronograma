// Conferência PipeRun × CRM (§84): contagens, soma de valores por situação e por funil, e a lista do que ficou divergente. Compara a cópia bruta (a verdade do PipeRun no momento da
// extração) com o que de fato está no CRM; não confia em contadores de execução. Roda quantas vezes quiser, sem gravar nada.
import { pool } from '../../db.js';
import { personNameKey } from '../text.js';
import { loadRaw } from './extract.js';
import { prepare } from './migrate.js';
import { importableNotes, historyEvents } from './transform.js';
import { SOURCE_SYSTEM } from '../dealImporter.js';

const money = (n) => Math.round(Number(n || 0) * 100) / 100;
const kindOf = (sit) => (sit === 'Ganha' ? 'won' : sit === 'Perdida' ? 'lost' : 'open');
const KIND_LABEL = { open: 'Abertas (inclui congeladas)', won: 'Ganhas', lost: 'Perdidas' };

async function mapSet(orgId, entity) {
  const { rows } = await pool.query('SELECT pid, crm_id FROM piperun_map WHERE org_id=$1 AND entity=$2', [orgId, entity]);
  return new Map(rows.map((r) => [r.pid, r.crm_id]));
}

export async function reconcile(orgId) {
  const raw = await loadRaw(orgId);
  if (!raw.deals || !raw.deals.length) return { ready: false, message: 'Não há dados extraídos do PipeRun para conferir.' };
  const P = prepare(raw);
  const [mComp, mProv, mContact, mNote, mAct, mFile, mHist] = await Promise.all(['company', 'provisional', 'contact', 'note', 'activity', 'file', 'history'].map((e) => mapSet(orgId, e)));
  const hashes = P.plan.rows.map((r) => r.externalId);
  const { rows: crmDeals } = await pool.query(
    `SELECT d.id, d.external_id, d.value, d.status, d.title, d.deleted_at, p.name AS pipeline FROM crm_deals d JOIN crm_pipelines p ON p.id = d.pipeline_id
     WHERE d.org_id=$1 AND d.external_source=$2 AND d.external_id = ANY($3::text[])`, [orgId, SOURCE_SYSTEM, hashes]);
  const live = crmDeals.filter((d) => !d.deleted_at);
  const crmByHash = new Map(live.map((d) => [d.external_id, d]));
  const divergences = []; const div = (type, pid, title, detail) => divergences.push({ type, pid: String(pid || ''), title: String(title || '').slice(0, 120), detail });

  // negócios: existência, situação, valor e funil, um a um
  for (const r of P.plan.rows) {
    const d = crmByHash.get(r.externalId);
    if (!d) { div('Negócio ausente no CRM', r.pid, r.title, `${r.situation} · ${r.pipelineName} › ${r.stageName}`); continue; }
    const want = kindOf(r.situation);
    if (d.status !== want) div('Situação diferente', r.pid, r.title, `PipeRun: ${r.situation} · CRM: ${d.status}`);
    if (money(d.value) !== money(r.value)) div('Valor diferente', r.pid, r.title, `PipeRun: ${money(r.value)} · CRM: ${money(d.value)}`);
    if (personNameKey(d.pipeline) !== personNameKey(r.pipelineName)) div('Funil diferente', r.pid, r.title, `PipeRun: ${r.pipelineName} · CRM: ${d.pipeline}`);
  }
  const miss = (list, map, type, label, pidOf = (x) => x.pid) => list.filter((x) => !map.has(pidOf(x))).forEach((x) => div(type, pidOf(x), label(x), 'Não foi importado.'));
  const usableCompanies = P.companies.filter((c) => c.usable);
  miss(usableCompanies, mComp, 'Empresa não importada', (c) => c.row.legalName);
  miss(P.plan.provisional, mProv, 'Empresa provisória não criada', (p) => p.name, (p) => p.key);
  const importableContacts = P.contacts.filter((c) => c.companyPid || P.plan.personCompany.has(c.pid));
  miss(importableContacts, mContact, 'Contato não importado', (c) => `${c.row.firstName} ${c.row.lastName}`.trim());
  const notesOk = importableNotes(P.notes, P.plan);
  miss(notesOk, mNote, 'Nota/proposta não importada', (n) => n.text.slice(0, 80));
  const dealPids = new Set(P.plan.rows.map((r) => r.pid));
  const histMap = historyEvents(P.ctx, P.plan);
  const importableActs = P.acts.filter((a) => a.dealPid && dealPids.has(a.dealPid));
  const docs = P.files.docs.filter((f) => dealPids.has(f.dealPid));
  miss(importableActs, mAct, 'Atividade não importada', (a) => a.title);
  miss(docs, mFile, 'Documento não importado', (f) => f.name);
  const withHist = P.plan.rows.filter((r) => histMap.has(r.pid));
  miss(withHist, mHist, 'Histórico de etapas não aplicado', (r) => r.title);

  // totais por situação e por funil (somente negócios da migração)
  const bySituation = ['open', 'won', 'lost'].map((k) => {
    const pr = P.plan.rows.filter((r) => kindOf(r.situation) === k); const cr = live.filter((d) => d.status === k);
    return { label: KIND_LABEL[k], piperun: pr.length, crm: cr.length, piperunValue: money(pr.reduce((n, r) => n + Number(r.value || 0), 0)), crmValue: money(cr.reduce((n, d) => n + Number(d.value || 0), 0)) };
  });
  const byFunnel = [...new Set(P.plan.rows.map((r) => r.pipelineName))].map((n) => ({ label: n, piperun: P.plan.rows.filter((r) => r.pipelineName === n).length, crm: live.filter((d) => personNameKey(d.pipeline) === personNameKey(n)).length }));

  const row = (label, piperun, crm, note = '') => ({ label, piperun, crm, ok: piperun === crm, note });
  const summary = [
    row('Empresas com cadastro', usableCompanies.length, usableCompanies.filter((c) => mComp.has(c.pid)).length, 'sem os registros "Nome não informado" (vazios no PipeRun)'),
    row('Empresas provisórias (negócio sem empresa)', P.plan.provisional.length, P.plan.provisional.filter((p) => mProv.has(p.key)).length, 'a completar: razão social e CNPJ'),
    row('Contatos (com empresa, direta ou pelo negócio)', importableContacts.length, importableContacts.filter((c) => mContact.has(c.pid)).length, `${P.contacts.length - importableContacts.length} pessoas sem empresa e sem negócio ficam só no backup`),
    row('Negócios (sem a lixeira)', P.plan.rows.length, live.length, `${P.plan.stats.trashed} na lixeira do PipeRun não entram`),
    row('Histórico real de etapas (negócios com eventos)', P.plan.rows.filter((r) => histMap.has(r.pid)).length, P.plan.rows.filter((r) => histMap.has(r.pid) && mHist.has(r.pid)).length, 'percurso pelas etapas com data e autor reais'),
    row('Notas e propostas (com texto, de negócios que entram)', notesOk.length, notesOk.filter((n) => mNote.has(n.pid)).length, `${P.notes.length - notesOk.length} eram de negócios na lixeira do PipeRun; notas vazias não entram`),
    row('Atividades (com negócio)', importableActs.length, importableActs.filter((a) => mAct.has(a.pid)).length, `${P.acts.length - importableActs.length} sem negócio ficam só no backup`),
    row('Documentos (PDF, DOCX…)', docs.length, docs.filter((f) => mFile.has(f.pid)).length, 'imagens e áudios ficam só no backup'),
  ];
  const provIds = [...mProv.values()];
  const { rows: pend } = provIds.length ? await pool.query(`SELECT id, legal_name FROM crm_companies WHERE org_id=$1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL AND COALESCE(cnpj,'') = '' ORDER BY legal_name`, [orgId, provIds]) : { rows: [] };
  const ok = summary.every((x) => x.ok) && bySituation.every((x) => x.piperun === x.crm && x.piperunValue === x.crmValue) && byFunnel.every((x) => x.piperun === x.crm) && !divergences.length;
  return { ready: true, ok, summary, bySituation, byFunnel, divergences: divergences.slice(0, 1000), divergenceCount: divergences.length, provisionalToComplete: pend.map((r) => ({ id: r.id, name: r.legal_name })) };
}
