// Execuções da migração (§84): uma linha em piperun_runs por extração/importação, com progresso para a tela acompanhar. Nunca guarda o token.
import { pool } from '../../db.js';

const STALE_MIN = 45;

export async function startRun(orgId, kind, actor) {
  const { rows: busy } = await pool.query(
    `SELECT id FROM piperun_runs WHERE org_id=$1 AND status='running' AND started_at > now() - ($2 || ' minutes')::interval`, [orgId, String(STALE_MIN)]);
  if (busy[0]) return { busy: Number(busy[0].id) };
  await pool.query(`UPDATE piperun_runs SET status='failed', error='Interrompida (o servidor reiniciou ou demorou demais).', finished_at=now() WHERE org_id=$1 AND status='running'`, [orgId]);
  const { rows } = await pool.query(`INSERT INTO piperun_runs (org_id, kind, started_by) VALUES ($1,$2,$3) RETURNING id`, [orgId, kind, String(actor.name || actor.id || '')]);
  return { id: Number(rows[0].id) };
}

export function progressWriter(runId, { everyMs = 1200 } = {}) {
  let last = 0; let pending = null;
  const flush = async () => { const p = pending; pending = null; if (p) await pool.query('UPDATE piperun_runs SET progress=$1 WHERE id=$2', [JSON.stringify(p), runId]).catch(() => {}); };
  return {
    set: (p) => { pending = p; if (Date.now() - last >= everyMs) { last = Date.now(); return flush(); } return Promise.resolve(); },
    flush,
  };
}

export async function finishRun(runId, result) {
  await pool.query(`UPDATE piperun_runs SET status='done', result=$1, finished_at=now() WHERE id=$2`, [JSON.stringify(result || {}), runId]);
}
export async function failRun(runId, message) {
  await pool.query(`UPDATE piperun_runs SET status='failed', error=$1, finished_at=now() WHERE id=$2`, [String(message || 'Erro').slice(0, 500), runId]);
}

const mapRun = (r) => ({ id: Number(r.id), kind: r.kind, status: r.status, progress: r.progress, result: r.result, error: r.error, startedBy: r.started_by, startedAt: r.started_at, finishedAt: r.finished_at });
export async function latestRuns(orgId, limit = 6) {
  const { rows } = await pool.query('SELECT * FROM piperun_runs WHERE org_id=$1 ORDER BY id DESC LIMIT $2', [orgId, limit]);
  return rows.map(mapRun);
}
export async function getRun(orgId, id) {
  const { rows } = await pool.query('SELECT * FROM piperun_runs WHERE org_id=$1 AND id=$2', [orgId, id]);
  return rows[0] ? mapRun(rows[0]) : null;
}
