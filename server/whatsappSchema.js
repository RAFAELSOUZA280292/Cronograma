// Tabelas do WhatsApp (Fase 1, 2026-11-02) — ver server/whatsapp.js. Só aditivo; chamado por initDb().

export async function ensureWhatsappSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS wa_conversations (
      id              TEXT PRIMARY KEY,
      org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      wa_id           TEXT NOT NULL,
      profile_name    TEXT NOT NULL DEFAULT '',
      last_message_at TIMESTAMPTZ,
      last_inbound_at TIMESTAMPTZ,
      last_preview    TEXT NOT NULL DEFAULT '',
      last_direction  TEXT NOT NULL DEFAULT '',
      unread          INT  NOT NULL DEFAULT 0,
      archived_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (org_id, wa_id)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS wa_conversations_list_idx ON wa_conversations(org_id, last_message_at DESC)`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS wa_messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
      wa_message_id   TEXT UNIQUE,
      direction       TEXT NOT NULL CHECK (direction IN ('in','out')),
      kind            TEXT NOT NULL DEFAULT 'text',
      body            TEXT NOT NULL DEFAULT '',
      media           JSONB,
      status          TEXT NOT NULL DEFAULT '',
      error           TEXT NOT NULL DEFAULT '',
      via             TEXT NOT NULL DEFAULT '',
      sent_by         TEXT,
      sent_by_name    TEXT NOT NULL DEFAULT '',
      reply_to        TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS wa_messages_conv_idx ON wa_messages(conversation_id, created_at)`);
  // Arquivo recebido: a Meta só guarda por 30 dias, então baixamos assim que chega (até 25 MB).
  await db.query(`
    CREATE TABLE IF NOT EXISTS wa_media (
      message_id TEXT PRIMARY KEY REFERENCES wa_messages(id) ON DELETE CASCADE,
      mime       TEXT NOT NULL DEFAULT '',
      filename   TEXT NOT NULL DEFAULT '',
      size       INT  NOT NULL DEFAULT 0,
      data       BYTEA NOT NULL
    )
  `);
}
