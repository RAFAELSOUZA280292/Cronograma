// Vínculo tarefa de reunião → atividade do cronograma (plano em docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md, Fase 1, 2026-10-13).
// O campo `activityId`/`activityLink` mora dentro da tarefa (meetings[].actionItems[]) e é gravado pelo cliente junto com o
// projeto, como qualquer outra edição de tarefa. Esta rota só registra a DECISÃO humana no livro-razão `task_activity_links`
// (append-only), que é a matéria-prima do aprendizado da RENATA (Fases 2-3). Só equipe PRICETAX; só empresas acessíveis.
import { Router } from 'express';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool } from './db.js';
import { canAccessProject } from './routes.js';
import { norm } from './inventory.js';
import Anthropic from '@anthropic-ai/sdk';
import { activityKey as keyOf, loadLedgerExamples } from './taskLinkLearn.js';
import { suggestActivityLinks } from './taskLinkSuggest.js';
import { logMetric } from './metrics.js';
import { runTaskLinkEval } from './evals/taskLinkEval.js';

export const DECISIONS = ['escolheu', 'confirmou', 'corrigiu', 'nenhuma'];
const clip = (s, n) => String(s || '').slice(0, n);

// Chave estável da "espécie" de atividade (vale entre empresas, onde o id muda): tokens do título, ordenados.
export const activityKey = keyOf;

export function findTask(data, taskId) {
  for (const m of (data && data.meetings) || []) {
    if (!m || m.deleted) continue;
    for (const it of m.actionItems || []) if (it && !it.deleted && it.id === taskId) return it;
  }
  return null;
}
export function findActivity(data, activityId) {
  if (!activityId) return null;
  return ((data && data.activities) || []).find((a) => a && !a.deleted && a.id === activityId) || null;
}

// Linha do livro-razão a partir do que o servidor VÊ no projeto (nunca confia no texto vindo do cliente).
export function ledgerRow({ project, taskId, decision, chosenActivityId, suggestedActivityId, source, confidence, userId }) {
  const task = findTask(project.data, taskId);
  if (!task) return { error: 'Tarefa não encontrada.' };
  if (!DECISIONS.includes(decision)) return { error: 'Decisão inválida.' };
  const chosen = findActivity(project.data, chosenActivityId);
  const suggested = findActivity(project.data, suggestedActivityId);
  if (decision !== 'nenhuma' && !chosen) return { error: 'Atividade não encontrada neste cronograma.' };
  // A decisão é derivada aqui (não do que o cliente diz): com sugestão, igual = confirmou, diferente = corrigiu; sem sugestão = escolheu.
  const final = decision === 'nenhuma' ? 'nenhuma' : !suggested ? 'escolheu' : suggested.id === chosen.id ? 'confirmou' : 'corrigiu';
  return {
    row: {
      orgId: project.org_id, projectId: project.id, taskId,
      taskText: clip(norm(task.title), 300), taskArea: clip(task.area, 40), ownerSide: task.owner === 'cliente' ? 'cliente' : 'pricetax',
      suggestedKey: suggested ? activityKey(suggested.title) : '', chosenKey: chosen ? activityKey(chosen.title) : '',
      decision: final, source: clip(source || 'manual', 20), userId: clip(userId, 80),
      confidence: suggested && Number.isFinite(Number(confidence)) ? Math.max(0, Math.min(1, Number(confidence))) : null,
    },
  };
}

export async function recordDecision(db, row) {
  await db.query(
    `INSERT INTO task_activity_links (org_id, project_id, task_id, task_text, task_area, owner_side, suggested_activity_key, chosen_activity_key, decision, source, user_id, confidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [row.orgId, row.projectId, row.taskId, row.taskText, row.taskArea, row.ownerSide, row.suggestedKey, row.chosenKey, row.decision, row.source, row.userId, row.confidence],
  );
}

export const router = Router();

router.post('/', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const { projectId, taskId, decision, activityId, suggestedActivityId, source, confidence } = req.body || {};
    if (typeof projectId !== 'string' || typeof taskId !== 'string') return res.status(400).json({ message: 'Informe a empresa e a tarefa.' });
    const { rows } = await pool.query('SELECT id, org_id, data FROM projects WHERE id=$1', [projectId]);
    const project = rows[0];
    if (!project || !canAccessProject(req.user, project.data, project.org_id)) return res.status(404).json({ message: 'Empresa não encontrada.' });
    const built = ledgerRow({ project, taskId, decision, chosenActivityId: activityId, suggestedActivityId, source, confidence, userId: req.user.id });
    if (built.error) return res.status(400).json({ message: built.error });
    await recordDecision(pool, built.row);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Sugerir para tarefas que já existem ("Vincular pendentes", Fase 3) ----------
// Elegível = viva, sem vínculo, sem "nenhuma atividade se aplica" e sem sugestão ainda válida (atividade sugerida existente).
export function eligibleTasks(data) {
  const live = new Set(((data && data.activities) || []).filter((a) => a && !a.deleted).map((a) => a.id));
  const out = [];
  for (const m of (data && data.meetings) || []) {
    if (!m || m.deleted) continue;
    for (const it of m.actionItems || []) {
      if (!it || it.deleted || !it.title || it.activityId) continue;
      const l = it.activityLink;
      if (l && l.status === 'none') continue;
      if (l && l.status === 'suggested' && live.has(l.suggestedId)) continue;
      out.push({ id: it.id, title: it.title, area: it.area || '', owner: it.owner, responsible: it.responsible || '', meetingId: m.id, meetingTitle: m.title || '', summary: m.summary || '' });
    }
  }
  return out;
}

const MAX_SUGGEST_TASKS = 80;
const rate = new Map(); // userId -> instantes (ms) das últimas chamadas; guarda contra clique repetido gastando IA
function tooMany(userId, now = Date.now()) {
  const recent = (rate.get(userId) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 8) { rate.set(userId, recent); return true; }
  rate.set(userId, [...recent, now]);
  return false;
}

router.post('/suggest', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const { projectId, taskIds } = req.body || {};
    if (typeof projectId !== 'string') return res.status(400).json({ message: 'Informe a empresa.' });
    const { rows } = await pool.query('SELECT id, org_id, data FROM projects WHERE id=$1', [projectId]);
    const project = rows[0];
    if (!project || !canAccessProject(req.user, project.data, project.org_id)) return res.status(404).json({ message: 'Empresa não encontrada.' });
    if (tooMany(req.user.id)) return res.status(429).json({ message: 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.' });
    const want = Array.isArray(taskIds) ? new Set(taskIds.filter((x) => typeof x === 'string')) : null;
    const eligible = eligibleTasks(project.data).filter((t) => !want || want.has(t.id));
    const batch = eligible.slice(0, MAX_SUGGEST_TASKS);
    const t0 = Date.now();
    const sug = await suggestActivityLinks({
      client: process.env.ANTHROPIC_API_KEY ? new Anthropic() : null,
      activities: project.data.activities, phases: project.data.phases,
      tasks: batch, meeting: { title: 'Tarefas pendentes de vínculo' },
      learn: { examples: await loadLedgerExamples(pool, project.org_id), projectId: project.id, data: project.data },
    });
    logMetric(pool, { orgId: project.org_id, projectId: project.id, eventType: 'task_link_suggest', metadata: { origin: 'pendentes', tasks: batch.length, suggested: Object.keys(sug.suggestions).length, learned: sug.learned || 0, usedAI: sug.usedAI, aiError: sug.aiError || undefined, ms: Date.now() - t0 } }).catch(() => {});
    res.json({ suggestions: sug.suggestions, considered: batch.length, remaining: eligible.length - batch.length, usedAI: sug.usedAI, learned: sug.learned || 0 });
  } catch (e) { next(e); }
});

// ---------- Painel "O que a RENATA aprendeu" (Fase 4) ----------
const GATE = { minDecisions: 100, minRate: 0.9, band: 0.8 }; // critério do plano para CONSIDERAR (não ativa nada) aplicar sozinha
const isAdmin = (u) => !!u && (u.isSuperAdmin || u.role === 'master');
const ratio = (conf, n) => (n ? Math.round((conf / n) * 1000) / 1000 : null);

// Taxa de acerto = confirmou ÷ (confirmou + corrigiu + nenhuma) sobre decisões em que HAVIA uma sugestão. Função pura (testável).
export function learningStats(rows, now = new Date()) {
  const withSug = rows.filter((r) => r.suggested_activity_key && ['confirmou', 'corrigiu', 'nenhuma'].includes(r.decision));
  const hit = (r) => r.decision === 'confirmou';
  const agg = (list) => ({ n: list.length, rate: ratio(list.filter(hit).length, list.length) });
  const bySource = {};
  for (const src of ['ia', 'aprendido', 'regra']) bySource[src] = agg(withSug.filter((r) => r.source === src));
  const high = withSug.filter((r) => Number(r.confidence) >= GATE.band);
  const low = withSug.filter((r) => !(Number(r.confidence) >= GATE.band));
  // Semanas (segunda a domingo, em UTC a partir do carimbo) — as últimas 12, incluindo as vazias.
  const monday = (d) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
  const start = monday(now); start.setUTCDate(start.getUTCDate() - 11 * 7);
  const weeks = Array.from({ length: 12 }, (_, i) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + i * 7); return { week: d.toISOString().slice(0, 10), n: 0, confirmed: 0 }; });
  for (const r of withSug) {
    const w = monday(new Date(r.created_at)).toISOString().slice(0, 10);
    const slot = weeks.find((x) => x.week === w);
    if (slot) { slot.n += 1; if (hit(r)) slot.confirmed += 1; }
  }
  const all = agg(withSug);
  return {
    totals: {
      decisions: rows.length, withSuggestion: withSug.length, confirmed: withSug.filter(hit).length,
      corrected: withSug.filter((r) => r.decision === 'corrigiu').length, dismissed: withSug.filter((r) => r.decision === 'nenhuma').length,
      manual: rows.filter((r) => !r.suggested_activity_key).length,
    },
    accuracy: { overall: all.rate, n: all.n, bySource, byBand: { high: agg(high), low: agg(low) } },
    weekly: weeks.map((w) => ({ week: w.week, n: w.n, confirmed: w.confirmed, rate: ratio(w.confirmed, w.n) })),
    gate: { ...GATE, high: agg(high), ready: high.length >= GATE.minDecisions && (ratio(high.filter(hit).length, high.length) || 0) >= GATE.minRate },
  };
}

// Padrões mais fortes por atividade-tipo. Palavras só aparecem se estiverem em ≥ MIN_FLOOR empresas diferentes (mesma regra do aprendizado).
export function learningPatterns(rows, labelOfKey, floor = 3) {
  const per = new Map();
  for (const r of rows) {
    if (r.ignored || !r.chosen_activity_key || !['escolheu', 'confirmou', 'corrigiu'].includes(r.decision)) continue;
    const e = per.get(r.chosen_activity_key) || { key: r.chosen_activity_key, decisions: 0, projects: new Set(), words: new Map() };
    e.decisions += 1; e.projects.add(r.project_id);
    for (const w of new Set(String(r.task_text || '').split(' ').filter((x) => x.length > 3))) {
      const set = e.words.get(w) || e.words.set(w, new Set()).get(w); set.add(r.project_id);
    }
    per.set(r.chosen_activity_key, e);
  }
  return [...per.values()].sort((a, b) => b.decisions - a.decisions || a.key.localeCompare(b.key)).slice(0, 12).map((e) => ({
    activity: labelOfKey(e.key), decisions: e.decisions, companies: e.projects.size,
    words: [...e.words.entries()].filter(([, ps]) => ps.size >= floor).sort((a, b) => b[1].size - a[1].size).slice(0, 6).map(([w]) => w),
  }));
}

// Custo e erros dos últimos 30 dias (métricas `task_link_suggest`/`task_link_eval` já gravadas). Função pura.
export function opsStats(events) {
  const sug = events.filter((e) => e.event_type === 'task_link_suggest');
  const sum = (k) => sug.reduce((a, e) => a + (Number((e.metadata || {})[k]) || 0), 0);
  const evals = events.filter((e) => e.event_type === 'task_link_eval');
  const last = evals[0];
  return {
    runs: sug.length, tasks: sum('tasks'), suggested: sum('suggested'), learned: sum('learned'),
    aiRuns: sug.filter((e) => (e.metadata || {}).usedAI).length, aiFailed: sug.filter((e) => (e.metadata || {}).aiError).length,
    inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'),
    lastEval: last ? { at: last.created_at.toISOString(), passed: !!last.metadata.passed, precision: last.metadata.precision ?? null, coverage: last.metadata.coverage ?? null, falsePositive: last.metadata.falsePositive ?? null, usedAI: !!last.metadata.usedAI } : null,
  };
}

router.get('/learning', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const orgId = req.user.isSuperAdmin && req.query.asOrg ? req.query.asOrg : req.user.orgId;
    const { rows: projs } = await pool.query('SELECT id, org_id, data FROM projects WHERE org_id=$1', [orgId]);
    const mine = projs.filter((p) => canAccessProject(req.user, p.data, p.org_id));
    const ids = mine.map((p) => p.id);
    const nameOf = new Map(mine.map((p) => [p.id, (p.data.company && (p.data.company.nomeFantasia || p.data.company.name)) || 'Empresa']));
    const { rows } = await pool.query(
      `SELECT id, project_id, task_id, task_text, chosen_activity_key, suggested_activity_key, decision, source, confidence, ignored, created_at
       FROM task_activity_links WHERE org_id=$1 AND project_id = ANY($2) ORDER BY id DESC LIMIT 5000`, [orgId, ids]);
    // Rótulo legível de uma chave: o título de atividade mais comum, entre as empresas que o usuário vê, cuja chave é essa.
    const labels = new Map();
    for (const p of mine) for (const a of p.data.activities || []) {
      if (!a || a.deleted || !a.title) continue;
      const k = keyOf(a.title); const m = labels.get(k) || labels.set(k, new Map()).get(k); m.set(a.title, (m.get(a.title) || 0) + 1);
    }
    const labelOfKey = (k) => { const m = labels.get(k); return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : (k || '—'); };
    // Situação atual das tarefas de reunião (vinculada / a confirmar / "nenhuma" / sem vínculo).
    const state = { linked: 0, pending: 0, none: 0, unlinked: 0 };
    for (const p of mine) for (const m of p.data.meetings || []) {
      if (!m || m.deleted) continue;
      const live = new Set((p.data.activities || []).filter((a) => a && !a.deleted).map((a) => a.id));
      for (const it of m.actionItems || []) {
        if (!it || it.deleted || it.status === 'nao-relevante') continue;
        const l = it.activityLink;
        if (it.activityId && live.has(it.activityId)) state.linked += 1;
        else if (l && l.status === 'none') state.none += 1;
        else if (l && l.status === 'suggested' && live.has(l.suggestedId)) state.pending += 1;
        else state.unlinked += 1;
      }
    }
    const recent = rows.slice(0, 40).map((r) => ({
      id: String(r.id), company: nameOf.get(r.project_id) || 'Empresa', text: r.task_text, decision: r.decision, source: r.source,
      chosen: r.chosen_activity_key ? labelOfKey(r.chosen_activity_key) : '', suggested: r.suggested_activity_key ? labelOfKey(r.suggested_activity_key) : '',
      confidence: r.confidence == null ? null : Number(r.confidence), ignored: !!r.ignored, at: r.created_at.toISOString(),
    }));
    const { rows: ev } = await pool.query(
      `SELECT event_type, metadata, created_at FROM ai_metrics_events WHERE org_id=$1 AND event_type IN ('task_link_suggest','task_link_eval') AND created_at > now() - interval '30 days' ORDER BY created_at DESC LIMIT 1000`, [orgId]);
    res.json({ ...learningStats(rows), state, patterns: learningPatterns(rows, labelOfKey), recent, canForget: isAdmin(req.user), ops: opsStats(ev), mode: process.env.TASK_LINK_MODE || 'normal' });
  } catch (e) { next(e); }
});

router.post('/forget', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Só administradores podem esquecer um aprendizado.' });
    const { id, ignored } = req.body || {};
    if (!/^\d+$/.test(String(id || ''))) return res.status(400).json({ message: 'Informe a decisão.' });
    const { rows } = await pool.query('SELECT id, org_id, project_id FROM task_activity_links WHERE id=$1', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Decisão não encontrada.' });
    const { rows: pr } = await pool.query('SELECT id, org_id, data FROM projects WHERE id=$1', [row.project_id]);
    if (!pr[0] || !canAccessProject(req.user, pr[0].data, pr[0].org_id) || pr[0].org_id !== row.org_id) return res.status(404).json({ message: 'Decisão não encontrada.' });
    await pool.query('UPDATE task_activity_links SET ignored=$2 WHERE id=$1', [id, ignored !== false]);
    res.json({ ok: true, ignored: ignored !== false });
  } catch (e) { next(e); }
});

// Avaliação de qualidade (Fase 5): roda os casos sintéticos de server/evals/taskLinkEval.js pelo MESMO caminho de produção, com a IA real
// do ambiente. Só administrador; não lê nem grava dado de empresa; no máximo 3 por hora por usuário (cada rodada = 1 chamada de IA).
const evalRate = new Map();
router.post('/eval', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Só administradores podem rodar a avaliação.' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ message: 'IA não configurada neste ambiente (falta ANTHROPIC_API_KEY).' });
    const now = Date.now();
    const recent = (evalRate.get(req.user.id) || []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= 3) return res.status(429).json({ message: 'Limite de 3 avaliações por hora. Tente mais tarde.' });
    evalRate.set(req.user.id, [...recent, now]);
    const report = await runTaskLinkEval({ client: process.env.TASK_LINK_MODE === 'sem-ia' ? null : new Anthropic() });
    const m = report.metrics;
    logMetric(pool, { orgId: req.user.orgId, projectId: null, eventType: 'task_link_eval', metadata: { passed: report.passed, precision: m.precision, coverage: m.coverage, falsePositive: m.falsePositive, high: m.high, usedAI: report.usedAI, aiError: report.aiError || undefined, inputTokens: report.usage.input, outputTokens: report.usage.output, ms: report.ms, mode: process.env.TASK_LINK_MODE || 'normal' } }).catch(() => {});
    res.json(report);
  } catch (e) { next(e); }
});
