// Tabelas do WhatsApp (Fase 1, 2026-11-02) — ver server/whatsapp.js. Só aditivo; chamado por initDb().
// Caixas (2026-11-02, decisão do Rafael): cada número é uma caixa — "compartilhada" (lista de membros, ex.: Comercial da Eduarda)
// ou "pessoal" (só o dono vê; número pessoal em coexistência com o app do celular). Conteúdo das mensagens cifrado (server/secretBox.js).

export async function ensureWhatsappSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS wa_inboxes (
      id              TEXT PRIMARY KEY,
      org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      kind            TEXT NOT NULL CHECK (kind IN ('shared','personal')),
      owner_id        TEXT REFERENCES users(id) ON DELETE CASCADE,
      phone_number_id TEXT NOT NULL UNIQUE,
      display_phone   TEXT NOT NULL DEFAULT '',
      token_enc       TEXT NOT NULL DEFAULT '',
      active          BOOLEAN NOT NULL DEFAULT true,
      authorized_at   TIMESTAMPTZ,
      created_by      TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Intermediário (2026-11-02, decisão do Rafael: testar a Dualhook com o número pessoal dele). 'meta' = API da Meta direto;
  // 'dualhook' = runtime da Dualhook (mesmo formato da Graph API, chave dh_live_). Na Dualhook a assinatura do webhook é do app DELES e não
  // pode ser conferida: cada caixa recebe num endereço secreto próprio (hook_hash = sha256 da chave) e o painel confere conta e número.
  // O identificador do número só é conhecido depois do cadastro na Meta: pode ficar vazio e é aprendido no 1º evento do endereço secreto.
  await db.query(`ALTER TABLE wa_inboxes ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta'`);
  await db.query(`ALTER TABLE wa_inboxes ADD COLUMN IF NOT EXISTS waba_id TEXT NOT NULL DEFAULT ''`);
  await db.query(`ALTER TABLE wa_inboxes ADD COLUMN IF NOT EXISTS hook_hash TEXT UNIQUE`);
  await db.query(`ALTER TABLE wa_inboxes ALTER COLUMN phone_number_id DROP NOT NULL`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS wa_inbox_members (
      inbox_id TEXT NOT NULL REFERENCES wa_inboxes(id) ON DELETE CASCADE,
      user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (inbox_id, user_id)
    )
  `);
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
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.query(`ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS inbox_id TEXT REFERENCES wa_inboxes(id) ON DELETE CASCADE`);
  // A 1ª versão (mesmo dia, nunca ligada em produção: sem as chaves o webhook respondia 404) tinha UMA conversa por número de cliente na
  // organização. Com várias caixas, o mesmo cliente pode falar com duas caixas: a chave passa a ser (caixa, cliente). A tabela estava
  // vazia; só a restrição antiga sai.
  await db.query(`ALTER TABLE wa_conversations DROP CONSTRAINT IF EXISTS wa_conversations_org_id_wa_id_key`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS wa_conversations_inbox_wa_idx ON wa_conversations(inbox_id, wa_id)`);
  await db.query(`DROP INDEX IF EXISTS wa_conversations_list_idx`);
  await db.query(`CREATE INDEX IF NOT EXISTS wa_conversations_inbox_list_idx ON wa_conversations(inbox_id, last_message_at DESC)`);
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
  // Arquivo recebido: a Meta só guarda por 30 dias, então baixamos assim que chega (até 25 MB), cifrado (sealBytes).
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
