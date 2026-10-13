// Vínculo tarefa → atividade para os registros que JÁ EXISTEM na base (pedido do Rafael, 2026-10-13: "funcione já para reuniões, para
// registros que temos na base, não somente para as novas"). Duas peças: (1) VARREDURA em segundo plano (só administrador, custo de IA
// estimado e confirmado antes): sugere a atividade das tarefas sem vínculo de todas as empresas acessíveis, uma chamada por reunião (o
// resumo da reunião ajuda a IA); (2) REVISÃO central: lista as sugestões pendentes de todas as empresas e confirma/troca/dispensa sem
// abrir empresa por empresa. NADA é vinculado sozinho: a varredura só grava `activityLink.status = 'suggested'`.
// Gravação server-side por empresa, em transação (FOR UPDATE) e só nas tarefas que continuam elegíveis — mesmo padrão do inventoryEdit.js.
// Não reindexa a memória da RENATA: o vínculo não entra nos trechos indexados, e reindexar centenas de reuniões estouraria a cota da Voyage.
import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool } from './db.js';
import { canAccessProject, effectiveOrgId } from './routes.js';
import { logMetric } from './metrics.js';
import { suggestActivityLinks, HIGH_CONFIDENCE } from './taskLinkSuggest.js';
import { loadLedgerExamples } from './taskLinkLearn.js';
import { eligibleTasks, ledgerRow, recordDecision } from './taskLinks.js';

export const router = Router();
const isAdmin = (u) => !!u && (u.isSuperAdmin || u.role === 'master');
const labelOf = (data) => (data && data.company && (data.company.nomeFantasia || data.company.name)) || 'Empresa';

// ---------- Funções puras (testáveis) ----------

// Elegíveis agrupadas por reunião: [{ projectId, meetingId, meetingTitle, summary, tasks: [...] }].
export function eligibleByMeeting(data) {
  const byMeeting = new Map();
  for (const t of eligibleTasks(data)) {
    const e = byMeeting.get(t.meetingId) || { meetingId: t.meetingId, meetingTitle: t.meetingTitle, summary: t.summary, tasks: [] };
    e.tasks.push(t); byMeeting.set(t.meetingId, e);
  }
  return [...byMeeting.values()];
}

// Aplica sugestões em `data` só nas tarefas que continuam elegíveis (sem vínculo, sem "nenhuma", sem sugestão válida). Devolve {data, count}.
export function applySuggestionsToData(data, suggestions) {
  const live = new Set(((data && data.activities) || []).filter((a) => a && !a.deleted).map((a) => a.id));
  let count = 0;
  const meetings = ((data && data.meetings) || []).map((m) => {
    if (!m || m.deleted || !(m.actionItems || []).some((it) => suggestions[it.id])) return m;
    return { ...m, actionItems: m.actionItems.map((it) => {
      const s = suggestions[it.id];
      if (!s || it.deleted || it.activityId || !live.has(s.activityId)) return it;
      const l = it.activityLink;
      if (l && (l.status === 'confirmed' || l.status === 'none' || (l.status === 'suggested' && live.has(l.suggestedId)))) return it;
      count += 1;
      return { ...it, activityLink: { status: 'suggested', suggestedId: s.activityId, confidence: s.confidence, reason: s.reason, source: s.source } };
    }) };
  });
  return { data: { ...data, meetings }, count };
}

// Sugestões pendentes e válidas de uma empresa (a atividade sugerida ainda existe).
export function pendingOf(project) {
  const data = project.data || {};
  const acts = new Map(((data.activities) || []).filter((a) => a && !a.deleted).map((a) => [a.id, a.title]));
  const out = [];
  for (const m of data.meetings || []) {
    if (!m || m.deleted) continue;
    for (const it of m.actionItems || []) {
      const l = it && !it.deleted && !it.activityId && it.activityLink;
      if (!l || l.status !== 'suggested' || !acts.has(l.suggestedId)) continue;
      out.push({
        projectId: project.id, company: labelOf(data), meetingId: m.id, meetingTitle: m.title || '', taskId: it.id, title: it.title || '',
        suggestedId: l.suggestedId, suggestedTitle: acts.get(l.suggestedId), confidence: Number(l.confidence) || 0, source: l.source || '', reason: l.reason || '',
        status: it.status || '',
      });
    }
  }
  return out;
}

// Decide uma sugestão pendente (função pura): `choice` = id de atividade, ou null para "nenhuma se aplica".
export function applyDecision(data, taskId, choice, who, now = new Date().toISOString()) {
  let found = null;
  const meetings = (data.meetings || []).map((m) => {
    if (!m || m.deleted || !(m.actionItems || []).some((it) => it && it.id === taskId)) return m;
    return { ...m, actionItems: m.actionItems.map((it) => {
      if (it.id !== taskId || it.deleted) return it;
      const l = it.activityLink;
      if (it.activityId || !l || l.status !== 'suggested') return it; // mudou enquanto a tela estava aberta: não sobrescreve
      const base = { confirmedBy: who, confirmedAt: now, source: 'sugestao', suggestedId: l.suggestedId, confidence: l.confidence };
      found = { item: it, suggestion: l };
      return choice ? { ...it, activityId: choice, activityLink: { status: 'confirmed', ...base } } : { ...it, activityId: '', activityLink: { status: 'none', ...base } };
    }) };
  });
  return found ? { data: { ...data, meetings }, found } : null;
}

// ---------- Gravação por empresa (transação) ----------
async function withProject(projectId, mutate) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT id, org_id, data FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
    const row = cur.rows[0];
    if (!row) { await client.query('ROLLBACK'); return null; }
    const res = await mutate(row);
    if (!res || !res.data) { await client.query('ROLLBACK'); return res || null; }
    await client.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(res.data), projectId]);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* conexão já encerrada */ }
    throw e;
  } finally { client.release(); }
}
const withLog = (data, text, who) => ({ ...data, log: [{ ts: new Date().toISOString(), action: text, user: who, activityId: null }, ...(data.log || [])].slice(0, 300) });

async function accessibleProjects(user, orgId) {
  const { rows } = await pool.query('SELECT id, org_id, data FROM projects WHERE org_id=$1', [orgId]);
  return rows.filter((r) => canAccessProject(user, r.data, r.org_id));
}

// ---------- Varredura em segundo plano ----------
const jobs = new Map(); // orgId -> estado (em memória: se o servidor reiniciar, rodar de novo é seguro — só entra o que ainda não tem sugestão)
const MAX_CONSECUTIVE_AI_FAILURES = 5;

export function estimate(projects) {
  let tasks = 0; let meetings = 0; let companies = 0;
  for (const p of projects) {
    const groups = eligibleByMeeting(p.data || {});
    if (groups.length) companies += 1;
    meetings += groups.length;
    tasks += groups.reduce((a, g) => a + g.tasks.length, 0);
  }
  return { tasks, meetings, companies, aiCalls: meetings };
}

async function runJob(job, user, orgId, projects) {
  try {
    const examples = await loadLedgerExamples(pool, orgId).catch(() => []);
    const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
    let failStreak = 0;
    for (const p of projects) {
      if (job.cancel) break;
      const groups = eligibleByMeeting(p.data || {});
      const merged = {};
      for (const g of groups) {
        if (job.cancel) break;
        const sug = await suggestActivityLinks({
          client, activities: p.data.activities, phases: p.data.phases, tasks: g.tasks,
          meeting: { title: g.meetingTitle, summary: g.summary }, learn: { examples, projectId: p.id, data: p.data },
        });
        job.tasks += g.tasks.length; job.meetingsDone += 1;
        if (sug.usedAI) job.aiCalls += 1;
        if (sug.aiError) { job.aiFailed += 1; failStreak += 1; } else if (sug.usedAI) failStreak = 0;
        job.inputTokens += sug.usage.input; job.outputTokens += sug.usage.output; job.learned += sug.learned || 0;
        Object.assign(merged, sug.suggestions);
        if (failStreak >= MAX_CONSECUTIVE_AI_FAILURES) { job.status = 'stopped'; job.message = `Parei: a IA falhou ${MAX_CONSECUTIVE_AI_FAILURES} vezes seguidas (${sug.aiError}). O que já foi sugerido foi mantido.`; break; }
      }
      if (Object.keys(merged).length) {
        const res = await withProject(p.id, (row) => {
          const { data, count } = applySuggestionsToData(row.data, merged);
          if (!count) return null;
          return { data: withLog(data, `RENATA sugeriu a atividade do cronograma para ${count} tarefa${count === 1 ? '' : 's'} já existentes (varredura da base; a confirmar)`, user.name || 'RENATA'), count };
        });
        if (res) job.suggested += res.count;
      }
      job.projectsDone += 1;
      if (job.status === 'stopped') break;
    }
    if (job.status === 'running') job.status = job.cancel ? 'cancelled' : 'done';
  } catch (e) {
    console.error('Varredura vínculo tarefa→atividade falhou', e.message);
    job.status = 'error'; job.message = String(e.message || e).slice(0, 200);
  } finally {
    job.finishedAt = new Date().toISOString();
    logMetric(pool, { orgId, projectId: null, eventType: 'task_link_suggest', metadata: { origin: 'varredura', tasks: job.tasks, suggested: job.suggested, learned: job.learned, usedAI: job.aiCalls > 0, aiError: job.aiFailed ? `${job.aiFailed} falha(s)` : undefined, inputTokens: job.inputTokens, outputTokens: job.outputTokens, status: job.status } }).catch(() => {});
  }
}

router.use(requireAuth, requireMasterOrPricetax);

router.get('/backfill/estimate', async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Só administradores rodam a varredura.' });
    res.json({ ...estimate(await accessibleProjects(req.user, effectiveOrgId(req))), mode: process.env.TASK_LINK_MODE || 'normal', aiConfigured: !!process.env.ANTHROPIC_API_KEY });
  } catch (e) { next(e); }
});

router.post('/backfill', async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Só administradores rodam a varredura.' });
    if (process.env.TASK_LINK_MODE === 'off') return res.status(409).json({ message: 'As sugestões estão desligadas neste ambiente (TASK_LINK_MODE=off).' });
    const orgId = effectiveOrgId(req);
    const running = jobs.get(orgId);
    if (running && running.status === 'running') return res.status(409).json({ message: 'Já existe uma varredura em andamento.', job: running });
    const projects = (await accessibleProjects(req.user, orgId)).filter((p) => eligibleByMeeting(p.data || {}).length);
    const est = estimate(projects);
    const job = { id: `bf-${Date.now().toString(36)}`, status: 'running', startedAt: new Date().toISOString(), finishedAt: '', startedBy: req.user.name || '', projectsTotal: projects.length, projectsDone: 0, meetingsTotal: est.meetings, meetingsDone: 0, tasksTotal: est.tasks, tasks: 0, suggested: 0, learned: 0, aiCalls: 0, aiFailed: 0, inputTokens: 0, outputTokens: 0, message: '', cancel: false };
    jobs.set(orgId, job);
    runJob(job, req.user, orgId, projects).catch(() => {});
    res.status(202).json({ job });
  } catch (e) { next(e); }
});

router.get('/backfill/status', (req, res) => {
  const job = jobs.get(effectiveOrgId(req)) || null;
  res.json({ job });
});

router.post('/backfill/cancel', (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ message: 'Só administradores.' });
  const job = jobs.get(effectiveOrgId(req));
  if (job && job.status === 'running') job.cancel = true;
  res.json({ job: job || null });
});

// ---------- Revisão central ----------
router.get('/pending', async (req, res, next) => {
  try {
    const projects = await accessibleProjects(req.user, effectiveOrgId(req));
    const all = projects.flatMap(pendingOf).sort((a, b) => b.confidence - a.confidence || a.company.localeCompare(b.company, 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR'));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const rows = all.slice(0, limit);
    const options = {};
    for (const id of new Set(rows.map((r) => r.projectId))) {
      const p = projects.find((x) => x.id === id);
      options[id] = ((p && p.data.activities) || []).filter((a) => a && !a.deleted && a.title).map((a) => ({ id: a.id, title: a.title }));
    }
    res.json({ total: all.length, high: all.filter((r) => r.confidence >= HIGH_CONFIDENCE).length, rows, options });
  } catch (e) { next(e); }
});

// Decide UMA sugestão pendente (ou várias, agrupadas por empresa): { decisions: [{ projectId, taskId, activityId|null }] }.
async function decide(user, decisions) {
  const byProject = new Map();
  for (const d of decisions) (byProject.get(d.projectId) || byProject.set(d.projectId, []).get(d.projectId)).push(d);
  const result = { done: 0, skipped: 0 };
  for (const [projectId, list] of byProject) {
    const ledger = [];
    const res = await withProject(projectId, (row) => {
      if (!canAccessProject(user, row.data, row.org_id)) return { skip: list.length };
      let data = row.data; let n = 0;
      for (const d of list) {
        const act = d.activityId ? (data.activities || []).find((a) => a && !a.deleted && a.id === d.activityId) : null;
        if (d.activityId && !act) continue;
        const r = applyDecision(data, d.taskId, act ? act.id : null, user.name || 'Equipe', undefined);
        if (!r) continue;
        const built = ledgerRow({ project: { id: row.id, org_id: row.org_id, data }, taskId: d.taskId, decision: act ? 'escolheu' : 'nenhuma', chosenActivityId: act ? act.id : undefined, suggestedActivityId: r.found.suggestion.suggestedId, source: r.found.suggestion.source || 'ia', confidence: r.found.suggestion.confidence, userId: user.id });
        if (built.row) ledger.push(built.row);
        data = r.data; n += 1;
      }
      if (!n) return null;
      return { data: withLog(data, `${user.name || 'Equipe'} decidiu ${n} sugestão(ões) de atividade do cronograma na revisão central`, user.name || 'Equipe'), n };
    });
    if (res && res.skip) { result.skipped += res.skip; continue; }
    result.done += (res && res.n) || 0; result.skipped += list.length - ((res && res.n) || 0);
    for (const r of ledger) await recordDecision(pool, r).catch((e) => console.error('Livro-razão (revisão central):', e.message));
  }
  return result;
}

router.post('/decide', async (req, res, next) => {
  try {
    const list = (Array.isArray(req.body && req.body.decisions) ? req.body.decisions : []).slice(0, 200)
      .filter((d) => d && typeof d.projectId === 'string' && typeof d.taskId === 'string' && (d.activityId === null || typeof d.activityId === 'string'));
    if (!list.length) return res.status(400).json({ message: 'Nada para decidir.' });
    res.json(await decide(req.user, list));
  } catch (e) { next(e); }
});

router.post('/confirm-high', async (req, res, next) => {
  try {
    const projects = await accessibleProjects(req.user, effectiveOrgId(req));
    const hi = projects.flatMap(pendingOf).filter((r) => r.confidence >= HIGH_CONFIDENCE).slice(0, 500);
    res.json({ ...(await decide(req.user, hi.map((r) => ({ projectId: r.projectId, taskId: r.taskId, activityId: r.suggestedId })))), requested: hi.length });
  } catch (e) { next(e); }
});
