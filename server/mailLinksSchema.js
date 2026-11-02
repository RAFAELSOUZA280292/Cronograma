// E-mail ligado ao CRM e às Empresas (§130, 2026-11-02). Só aditivo; chamado por initDb(). O índice guarda SÓ metadados (ids, assunto,
// datas, participantes, chaves): o texto do e-mail continua no Gmail de quem trocou e é lido sob demanda.

export async function ensureMailLinksSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mail_thread_index (
      id             BIGSERIAL PRIMARY KEY,
      org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      thread_id      TEXT NOT NULL,
      conv_key       TEXT NOT NULL,
      subject        TEXT NOT NULL DEFAULT '',
      participants   JSONB NOT NULL DEFAULT '[]'::jsonb,
      keys           TEXT[] NOT NULL DEFAULT '{}',
      team_replied   BOOLEAN NOT NULL DEFAULT false,
      has_attachment BOOLEAN NOT NULL DEFAULT false,
      msg_count      INT NOT NULL DEFAULT 0,
      first_at       TIMESTAMPTZ,
      last_at        TIMESTAMPTZ,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, thread_id)
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS mail_thread_index_keys_idx ON mail_thread_index USING GIN (keys)');
  await db.query('CREATE INDEX IF NOT EXISTS mail_thread_index_org_idx ON mail_thread_index (org_id, last_at DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS mail_thread_index_conv_idx ON mail_thread_index (org_id, conv_key)');
  // Classificação manual por domínio (ou e-mail inteiro de provedor público), vale para a organização inteira e para sempre.
  // kind vazio + reported_* = Operações avisou o comercial, ainda sem decisão.
  await db.query(`
    CREATE TABLE IF NOT EXISTS mail_domain_marks (
      org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      key           TEXT NOT NULL,
      kind          TEXT CHECK (kind IS NULL OR kind IN ('cliente','prospect','parceiro','fornecedor','ignorar')),
      label         TEXT NOT NULL DEFAULT '',
      set_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
      set_at        TIMESTAMPTZ,
      reported_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
      reported_at   TIMESTAMPTZ,
      reported_note JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (org_id, key)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS mail_index_state (
      user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      full_at    TIMESTAMPTZ,
      scan_at    TIMESTAMPTZ,
      last_error TEXT NOT NULL DEFAULT ''
    )
  `);
  // Registro de cada leitura do TEXTO de uma conversa da caixa de outra pessoa (sócio abrindo pela aba E-mails).
  await db.query(`
    CREATE TABLE IF NOT EXISTS mail_index_reads (
      id         BIGSERIAL PRIMARY KEY,
      org_id     TEXT NOT NULL,
      reader_id  TEXT NOT NULL,
      owner_id   TEXT NOT NULL,
      thread_id  TEXT NOT NULL,
      read_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}
