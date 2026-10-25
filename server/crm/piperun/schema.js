// Migração PipeRun → CRM (§84). Só tabelas NOVAS (nada do CRM existente muda):
//  - piperun_raw  : cópia bruta (JSON) de tudo que veio da API — é o backup e a fonte da importação (dá para refazer sem chamar a API de novo);
//  - piperun_map  : id do PipeRun → id no CRM (empresa, contato, nota, atividade, arquivo, proposta); é o que torna a importação repetível sem duplicar;
//  - piperun_runs : andamento e resultado de cada extração/importação (progresso na tela, relatório);
//  - crm_deal_files: documentos do negócio (PDF, DOCX…) guardados no banco, como os Pareceres.
// Dados pessoais de clientes: acesso só do administrador do CRM; `purge` apaga a cópia bruta depois da virada.
export async function ensurePiperunSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS piperun_raw (
      org_id     TEXT NOT NULL REFERENCES organizations(id),
      entity     TEXT NOT NULL,
      pid        TEXT NOT NULL,
      payload    JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (org_id, entity, pid)
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS piperun_map (
      org_id     TEXT NOT NULL REFERENCES organizations(id),
      entity     TEXT NOT NULL,
      pid        TEXT NOT NULL,
      crm_id     TEXT NOT NULL,
      note       TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (org_id, entity, pid)
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS piperun_map_crm_idx ON piperun_map(org_id, entity, crm_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS piperun_runs (
      id          BIGSERIAL PRIMARY KEY,
      org_id      TEXT NOT NULL REFERENCES organizations(id),
      kind        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'running',
      progress    JSONB NOT NULL DEFAULT '{}'::jsonb,
      result      JSONB,
      error       TEXT NOT NULL DEFAULT '',
      started_by  TEXT NOT NULL DEFAULT '',
      started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS piperun_runs_org_idx ON piperun_runs(org_id, id DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_deal_files (
      id          UUID PRIMARY KEY,
      org_id      TEXT NOT NULL REFERENCES organizations(id),
      deal_id     UUID NOT NULL REFERENCES crm_deals(id),
      company_id  UUID NOT NULL REFERENCES crm_companies(id),
      name        TEXT NOT NULL,
      mime        TEXT NOT NULL DEFAULT 'application/octet-stream',
      size        INTEGER NOT NULL DEFAULT 0,
      data        BYTEA NOT NULL,
      source      TEXT NOT NULL DEFAULT '',
      external_id TEXT NOT NULL DEFAULT '',
      created_by  TEXT REFERENCES users(id),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at  TIMESTAMPTZ
    )`);
  // Autor de anotação importada cujo usuário não existe no CRM (nome do PipeRun). Aditivo: vazio = vale o usuário de created_by.
  await pool.query(`ALTER TABLE crm_notes ADD COLUMN IF NOT EXISTS author_name TEXT NOT NULL DEFAULT ''`);
  await pool.query(`CREATE INDEX IF NOT EXISTS crm_deal_files_deal_idx ON crm_deal_files(org_id, deal_id) WHERE deleted_at IS NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_deal_files_ext_uidx ON crm_deal_files(org_id, source, external_id) WHERE external_id <> '' AND deleted_at IS NULL`);
}
