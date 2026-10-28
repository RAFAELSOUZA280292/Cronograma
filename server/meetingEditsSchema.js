// Histórico das correções de reunião feitas pela API (§116e). O versionamento do cronograma (`project_versions`, §83) só enxerga atividades, fases e equipe — não reuniões —,
// então cada correção guarda aqui o que mudou (antes → depois) e o corpo que a desfaz. Gravado na MESMA transação da correção.
export async function ensureMeetingEditsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_edits (
      id          TEXT PRIMARY KEY,
      org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      meeting_id  TEXT NOT NULL,
      token_id    TEXT NOT NULL DEFAULT '',
      actor_name  TEXT NOT NULL DEFAULT '',
      note        TEXT NOT NULL DEFAULT '',
      changes     JSONB NOT NULL DEFAULT '[]',
      undo        JSONB NOT NULL DEFAULT '{}',
      undone_at   TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS meeting_edits_meeting_idx ON meeting_edits(project_id, meeting_id, created_at DESC)');
}
