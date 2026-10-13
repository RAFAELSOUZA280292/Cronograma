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
