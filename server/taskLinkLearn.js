// Aprendizado do vínculo tarefa → atividade (Fase 3 do plano, 2026-10-13; docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md). A matéria-prima é o
// livro-razão `task_activity_links` (cada Confirmar/Trocar/"nenhuma"/escolha manual). Método: vizinhos mais parecidos (palavras do título,
// mesma `titleTokens` do gaps.js) — determinístico e explicável, sem IA e sem gastar a cota da Voyage.
// CONFIDENCIALIDADE (regra do plano): dentro da MESMA empresa vale qualquer exemplo; entre empresas só conta como evidência quando
// ≥ MIN_FLOOR empresas DIFERENTES decidiram a mesma atividade-tipo para tarefas parecidas, e o resultado é só "qual atividade" + um
// motivo genérico — o texto da tarefa de um cliente nunca aparece para outro (nem na tela nem no prompt da IA).
import { titleTokens, jaccard, MIN_FLOOR } from './gaps.js';

export const activityKey = (title) => [...titleTokens(title)].sort().join(' ');
const SIM_SAME = 0.5;        // vizinho da mesma empresa
const SIM_CROSS = 0.4;       // vizinho de outra empresa
const KEY_MATCH = 0.7;       // duas chaves de atividade são o mesmo "tipo"
const LEARNED_MIN_SCORE = 1; // evidência mínima
const LEARNED_MARGIN = 1.5;  // 1ª precisa ser 1,5× a 2ª

// Uma decisão por (empresa, tarefa): a última vale (quem mudou de ideia não conta duas vezes).
export function collapseDecisions(rows) {
  const last = new Map();
  for (const r of rows || []) {
    const k = `${r.project_id}|${r.task_id}`;
    const cur = last.get(k);
    if (!cur || Number(r.id) > Number(cur.id)) last.set(k, r);
  }
  return [...last.values()];
}

export async function loadLedgerExamples(db, orgId) {
  const { rows } = await db.query(
    `SELECT id, project_id, task_id, task_text, task_area, chosen_activity_key, suggested_activity_key, decision, ignored
     FROM task_activity_links WHERE org_id=$1 ORDER BY id DESC LIMIT 5000`,
    [orgId],
  );
  // "Esquecer" (painel): a decisão mais recente de uma tarefa marcada como ignorada tira a tarefa do aprendizado (não ressuscita a anterior).
  return collapseDecisions(rows).filter((r) => !r.ignored).map((r) => ({
    projectId: r.project_id, taskId: r.task_id, text: r.task_text, area: r.task_area || '', chosenKey: r.chosen_activity_key || '',
    suggestedKey: r.suggested_activity_key || '', decision: r.decision,
  }));
}

const keySet = (key) => new Set(String(key || '').split(' ').filter(Boolean));

// Mapeia uma chave do livro-razão para a atividade desta empresa (exata ou parecida).
function activityForKey(key, byKey) {
  if (!key) return null;
  if (byKey.has(key)) return byKey.get(key);
  const ks = keySet(key);
  let best = null;
  for (const [k, a] of byKey) {
    const j = jaccard(ks, keySet(k));
    if (j >= KEY_MATCH && (!best || j > best.j)) best = { a, j };
  }
  return best ? best.a : null;
}

// Sugestão "aprendida" (função pura). Devolve { activityId, confidence, reason, source:'aprendido', support } ou null.
export function learnedSuggest(task, activities, examples, projectId) {
  const acts = (activities || []).filter((a) => a && !a.deleted && a.id && a.title);
  if (!acts.length || !(examples || []).length) return null;
  const byKey = new Map(acts.map((a) => [activityKey(a.title), a]));
  const tt = titleTokens(task.title);
  if (!tt.size) return null;
  const per = new Map(); // activityId -> { same: sum, projects: Map<projectId,maxSim>, neg: sum }
  const slot = (id) => { if (!per.has(id)) per.set(id, { same: 0, projects: new Map(), neg: 0 }); return per.get(id); };
  for (const e of examples) {
    if (e.projectId === projectId && e.taskId === task.id) continue;
    const sim = jaccard(tt, titleTokens(e.text)) + (task.area && e.area === task.area ? 0.05 : 0);
    const same = e.projectId === projectId;
    if (sim < (same ? SIM_SAME : SIM_CROSS)) continue;
    if (e.decision === 'escolheu' || e.decision === 'confirmou' || e.decision === 'corrigiu') {
      const a = activityForKey(e.chosenKey, byKey);
      if (!a) continue;
      const s = slot(a.id);
      if (same) s.same += sim; else s.projects.set(e.projectId, Math.max(s.projects.get(e.projectId) || 0, sim));
    }
    // Rejeição de uma sugestão parecida: "corrigiu"/"nenhuma" com sugestão → pesa contra aquela atividade.
    if ((e.decision === 'corrigiu' || e.decision === 'nenhuma') && e.suggestedKey) {
      const a = activityForKey(e.suggestedKey, byKey);
      if (a) slot(a.id).neg += sim;
    }
  }
  const scored = [];
  for (const [id, s] of per) {
    const crossOk = s.projects.size >= MIN_FLOOR;
    const cross = crossOk ? [...s.projects.values()].reduce((x, y) => x + y, 0) : 0;
    const support = (s.same > 0 ? 1 : 0) + (crossOk ? s.projects.size : 0);
    const score = s.same * 1.5 + cross - s.neg;
    if (score >= LEARNED_MIN_SCORE && support > 0) scored.push({ id, score, support, sameCompany: s.same > 0, crossCompanies: crossOk ? s.projects.size : 0 });
  }
  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || (second && best.score < second.score * LEARNED_MARGIN)) return null;
  const conf = Math.max(0.5, Math.min(0.95, 0.5 + 0.12 * best.support + (best.sameCompany ? 0.1 : 0)));
  const bits = [];
  if (best.sameCompany) bits.push('já vinculou tarefas parecidas desta empresa a esta atividade');
  if (best.crossCompanies) bits.push(`${best.crossCompanies} empresas vincularam tarefas parecidas a este tipo de atividade`);
  return { activityId: best.id, confidence: Math.round(conf * 100) / 100, reason: `Aprendido: ${bits.join('; ')}.`, source: 'aprendido', support: best.support };
}

// Exemplos da PRÓPRIA empresa para o prompt da IA: tarefas já vinculadas (título → atividade), as mais parecidas com as tarefas do lote.
export function sameCompanyExamples(data, tasks, max = 8) {
  const acts = new Map(((data && data.activities) || []).filter((a) => a && !a.deleted).map((a) => [a.id, a.title]));
  const pool = [];
  for (const m of (data && data.meetings) || []) {
    if (!m || m.deleted) continue;
    for (const it of m.actionItems || []) {
      if (it && !it.deleted && it.activityId && acts.has(it.activityId) && it.title) pool.push({ title: it.title, activity: acts.get(it.activityId), tokens: titleTokens(it.title) });
    }
  }
  if (!pool.length) return [];
  const qs = tasks.map((t) => titleTokens(t.title));
  return pool
    .map((p) => ({ p, s: Math.max(0, ...qs.map((q) => jaccard(q, p.tokens))) }))
    .sort((a, b) => b.s - a.s || a.p.title.localeCompare(b.p.title))
    .slice(0, max)
    .map((x) => ({ title: x.p.title, activity: x.p.activity }));
}
