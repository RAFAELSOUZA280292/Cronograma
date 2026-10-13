// Vínculo tarefa de reunião → atividade do cronograma (plano em docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md, Fase 1, 2026-10-13).
// O campo `activityId`/`activityLink` mora dentro da tarefa (meetings[].actionItems[]) e é gravado pelo cliente junto com o
// projeto, como qualquer outra edição de tarefa. Esta rota só registra a DECISÃO humana no livro-razão `task_activity_links`
// (append-only), que é a matéria-prima do aprendizado da RENATA (Fases 2-3). Só equipe PRICETAX; só empresas acessíveis.
import { Router } from 'express';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool } from './db.js';
import { canAccessProject } from './routes.js';
import { norm } from './inventory.js';
import { titleTokens } from './gaps.js';

export const DECISIONS = ['escolheu', 'confirmou', 'corrigiu', 'nenhuma'];
const clip = (s, n) => String(s || '').slice(0, n);

// Chave estável da "espécie" de atividade (vale entre empresas, onde o id muda): tokens do título, ordenados.
export const activityKey = (title) => [...titleTokens(title)].sort().join(' ');

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
export function ledgerRow({ project, taskId, decision, chosenActivityId, suggestedActivityId, source, userId }) {
  const task = findTask(project.data, taskId);
  if (!task) return { error: 'Tarefa não encontrada.' };
  if (!DECISIONS.includes(decision)) return { error: 'Decisão inválida.' };
  const chosen = findActivity(project.data, chosenActivityId);
  const suggested = findActivity(project.data, suggestedActivityId);
  if (decision !== 'nenhuma' && !chosen) return { error: 'Atividade não encontrada neste cronograma.' };
  return {
    row: {
      orgId: project.org_id, projectId: project.id, taskId,
      taskText: clip(norm(task.title), 300), taskArea: clip(task.area, 40), ownerSide: task.owner === 'cliente' ? 'cliente' : 'pricetax',
      suggestedKey: suggested ? activityKey(suggested.title) : '', chosenKey: chosen ? activityKey(chosen.title) : '',
      decision, source: clip(source || 'manual', 20), userId: clip(userId, 80),
    },
  };
}

export async function recordDecision(db, row) {
  await db.query(
    `INSERT INTO task_activity_links (org_id, project_id, task_id, task_text, task_area, owner_side, suggested_activity_key, chosen_activity_key, decision, source, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [row.orgId, row.projectId, row.taskId, row.taskText, row.taskArea, row.ownerSide, row.suggestedKey, row.chosenKey, row.decision, row.source, row.userId],
  );
}

export const router = Router();

router.post('/', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const { projectId, taskId, decision, activityId, suggestedActivityId, source } = req.body || {};
    if (typeof projectId !== 'string' || typeof taskId !== 'string') return res.status(400).json({ message: 'Informe a empresa e a tarefa.' });
    const { rows } = await pool.query('SELECT id, org_id, data FROM projects WHERE id=$1', [projectId]);
    const project = rows[0];
    if (!project || !canAccessProject(req.user, project.data, project.org_id)) return res.status(404).json({ message: 'Empresa não encontrada.' });
    const built = ledgerRow({ project, taskId, decision, chosenActivityId: activityId, suggestedActivityId, source, userId: req.user.id });
    if (built.error) return res.status(400).json({ message: built.error });
    await recordDecision(pool, built.row);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});
