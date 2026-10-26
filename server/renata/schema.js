// Tabelas da RENATA operacional (§101): conversa (continua entre telas e sessões) e registro de auditoria de TODA ação (inclusive recusas e
// cancelamentos). O registro não se apaga (gatilho) e só muda para fechar uma ação pendente ou marcar que ela foi desfeita.
export async function ensureRenataSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS renata_conversations (
      id         TEXT PRIMARY KEY,
      org_id     TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT '',
      messages   JSONB NOT NULL DEFAULT '[]'::jsonb,
      context    JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await db.query(`CREATE INDEX IF NOT EXISTS renata_conversations_user_idx ON renata_conversations(user_id, updated_at DESC)`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS renata_actions (
      id              TEXT PRIMARY KEY,
      org_id          TEXT NOT NULL,
      conversation_id TEXT,
      tool_use_id     TEXT NOT NULL DEFAULT '',
      executor        TEXT NOT NULL DEFAULT 'RENATA (Inteligência Artificial)',
      requester_id    TEXT NOT NULL,
      requester_name  TEXT NOT NULL DEFAULT '',
      command         TEXT NOT NULL DEFAULT '',
      requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      executed_at     TIMESTAMPTZ,
      module          TEXT NOT NULL DEFAULT '',
      tool            TEXT NOT NULL,
      risk            TEXT NOT NULL DEFAULT 'read',
      summary         TEXT NOT NULL DEFAULT '',
      input           JSONB NOT NULL DEFAULT '{}'::jsonb,
      before          JSONB,
      after           JSONB,
      autorizacao     JSONB NOT NULL DEFAULT '{}'::jsonb,
      status          TEXT NOT NULL CHECK (status IN ('pending','success','failed','partial','cancelled','denied')),
      error           TEXT NOT NULL DEFAULT '',
      undo            JSONB,
      undone_at       TIMESTAMPTZ,
      idem_key        TEXT NOT NULL DEFAULT ''
    )`);
  await db.query(`CREATE INDEX IF NOT EXISTS renata_actions_org_idx ON renata_actions(org_id, requested_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS renata_actions_user_idx ON renata_actions(requester_id, requested_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS renata_actions_idem_idx ON renata_actions(requester_id, idem_key, requested_at DESC) WHERE idem_key <> ''`);
  // Função e gatilho só são criados se não existirem (CREATE OR REPLACE concorrente entre dois processos subindo ao mesmo tempo dá "tuple concurrently updated").
  const fn = await db.query(`SELECT 1 FROM pg_proc WHERE proname='renata_actions_guard'`);
  if (!fn.rows[0]) {
    await db.query(`
      CREATE FUNCTION renata_actions_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'O registro de ações da RENATA não se apaga'; END IF;
        IF OLD.status <> 'pending' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.input IS DISTINCT FROM OLD.input OR NEW.before IS DISTINCT FROM OLD.before
           OR NEW.after IS DISTINCT FROM OLD.after OR NEW.command IS DISTINCT FROM OLD.command OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
           OR NEW.autorizacao IS DISTINCT FROM OLD.autorizacao OR NEW.executed_at IS DISTINCT FROM OLD.executed_at) THEN
          RAISE EXCEPTION 'Ação da RENATA já fechada não pode ser alterada';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`).catch((e) => { if (!/already exists|concurrently/.test(e.message)) throw e; });
  }
  const tg = await db.query(`SELECT 1 FROM pg_trigger WHERE tgname='renata_actions_guard_t'`);
  if (!tg.rows[0]) await db.query(`CREATE TRIGGER renata_actions_guard_t BEFORE UPDATE OR DELETE ON renata_actions FOR EACH ROW EXECUTE FUNCTION renata_actions_guard()`).catch((e) => { if (!/already exists|concurrently/.test(e.message)) throw e; });
}
