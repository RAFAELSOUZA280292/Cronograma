// Métricas mensuráveis da RENATA (Fase 7.1, 2026-09-11, pedido do
// Rafael) — sem dashboard nesta fase, só eventos graváveis/consultáveis
// via SQL direto em `ai_metrics_events`. Sempre fire-and-forget: uma
// falha ao gravar métrica NUNCA pode atrasar nem derrubar uma resposta
// real da RENATA — por isso quem chama nunca dá `await` nisso (só
// `.catch()`).
function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

export function logMetric(pool, { orgId, projectId, eventType, metadata }) {
  return pool.query(
    `INSERT INTO ai_metrics_events (id, org_id, project_id, event_type, metadata) VALUES ($1,$2,$3,$4,$5)`,
    [uid('ame'), orgId, projectId || null, eventType, JSON.stringify(metadata || {})],
  );
}
