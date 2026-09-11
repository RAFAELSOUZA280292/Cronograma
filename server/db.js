import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

function uid(p) {
  return p + '-' + Math.random().toString(36).slice(2, 9);
}

const PHASE_COLORS = ['#F5C400', '#3ea6ff', '#3ecf6e', '#e2574c', '#b98af5', '#ff9f40'];

function defaultPhases() {
  return [
    { id: 1, name: 'Leitura Real', sub: 'Captura dos documentos e devolução do número geral', color: '#F5C400' },
    { id: 2, name: 'Mão na Massa por Área', sub: 'Cada mês traduz o número em decisão de uma área', color: '#3ea6ff' },
    { id: 3, name: 'Consolidação', sub: 'Sistemas ajustados, pendências fechadas, ciclo encerrado', color: '#3ecf6e' },
  ];
}

function defaultTeam() {
  return ['PRICETAX', 'Compras', 'Comercial', 'Financeiro', 'Fiscal', 'Jurídico', 'Logística', 'Controladoria', 'TI', 'Diretoria', 'Todas'];
}

function normalizeActivity(a) {
  return {
    subactivities: [],
    notes: '',
    attachments: [],
    comments: [],
    transcript: '',
    endDate: a && a.date ? a.date : '',
    durationDays: '',
    required: false,
    ...a,
  };
}

function defaultActivities() {
  return [
    { id: 'm1', month: 1, phase: 1, title: 'Kickoff único no cliente', desc: 'Mapeamento + captura de documentos + validação inicial, tudo em uma só visita', responsible: 'PRICETAX', date: '2026-08-07', endDate: '2026-08-11', status: 'nao-iniciado', required: true, notes: '', attachments: [],
      subactivities: [
        { id: uid('s'), title: 'Mapear processos e sistemas', done: false },
        { id: uid('s'), title: 'Coletar documentos fiscais', done: false },
        { id: uid('s'), title: 'Validar dados coletados', done: false },
      ] },
    { id: 'm2', month: 2, phase: 1, title: 'Retorno com o número geral', desc: 'Impacto real em preço de compra, preço de venda, DRE e caixa', responsible: 'PRICETAX', date: '2026-09-18', endDate: '2026-09-18', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm3', month: 3, phase: 2, title: 'Compras', desc: 'Fornecedores que vão subir e descer de preço, item por item', responsible: 'Compras', date: '2026-10-16', endDate: '2026-10-16', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm4', month: 4, phase: 2, title: 'Vendas', desc: 'Novos preços de venda por produto, cliente e canal', responsible: 'Comercial', date: '2026-11-13', endDate: '2026-11-13', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm5', month: 5, phase: 2, title: 'Financeiro', desc: 'Nota de débito, nota de crédito, adaptação da área financeira e do caixa', responsible: 'Financeiro', date: '2026-12-11', endDate: '2026-12-11', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm6', month: 6, phase: 2, title: 'Fiscal / Tributário', desc: 'cClassTrib e CST — coincide com a virada da CBS plena', responsible: 'Fiscal', date: '2027-01-15', endDate: '2027-01-15', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm7', month: 7, phase: 2, title: 'Jurídico', desc: 'Contratos e cláusulas de repactuação', responsible: 'Jurídico', date: '2027-02-12', endDate: '2027-02-12', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm8', month: 8, phase: 2, title: 'Logística', desc: 'Malha, centros de distribuição e rotas', responsible: 'Logística', date: '2027-03-12', endDate: '2027-03-12', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm9', month: 9, phase: 2, title: 'Controladoria', desc: 'DRE reformada e indicadores executivos', responsible: 'Controladoria', date: '2027-04-09', endDate: '2027-04-09', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm10', month: 10, phase: 3, title: 'Adaptação de sistemas', desc: 'Parametrização e homologação final do ERP', responsible: 'TI', date: '2027-05-14', endDate: '2027-05-14', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
    { id: 'm11', month: 11, phase: 3, title: 'Tira-dúvidas geral', desc: 'Todas as áreas juntas para fechar pendências soltas', responsible: 'Todas', date: '2027-06-11', endDate: '2027-06-11', status: 'nao-iniciado', required: false, subactivities: [], notes: '', attachments: [] },
    { id: 'm12', month: 12, phase: 3, title: 'Encerramento', desc: 'Retrospectiva do ano e plano do Ano 2', responsible: 'Diretoria', date: '2027-07-09', endDate: '2027-07-09', status: 'nao-iniciado', required: true, subactivities: [], notes: '', attachments: [] },
  ];
}

export function blankProject() {
  return {
    id: uid('proj'),
    company: { cnpj: '', name: '', logo: '', color: '', areas: [] },
    phases: defaultPhases(),
    activities: defaultActivities().map(normalizeActivity),
    team: defaultTeam(),
    log: [],
    meetings: [],
    externalContacts: [],
  };
}

function defaultDemoProject() {
  const p = blankProject();
  p.company = { cnpj: '12.345.678/0001-90', name: 'Empresa Demonstração', logo: '', areas: [] };
  return p;
}

export function nextPhaseColor(count) {
  return PHASE_COLORS[count % PHASE_COLORS.length];
}

export function blankPersonalBoard() {
  return {
    boards: [
      {
        id: uid('board'),
        name: 'Minhas atividades',
        visibility: 'private',
        shareToken: '',
        log: [],
        columns: [
          { id: uid('col'), name: 'A fazer', cards: [] },
          { id: uid('col'), name: 'Em andamento', cards: [] },
          { id: uid('col'), name: 'Concluído', cards: [] },
        ],
      },
    ],
  };
}

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id               TEXT PRIMARY KEY,
      slug             TEXT UNIQUE NOT NULL,
      name             TEXT NOT NULL,
      display_name     TEXT NOT NULL DEFAULT '',
      logo_light       TEXT NOT NULL DEFAULT '',
      logo_dark        TEXT NOT NULL DEFAULT '',
      favicon          TEXT NOT NULL DEFAULT '',
      primary_color    TEXT NOT NULL DEFAULT '#F5C400',
      secondary_color  TEXT NOT NULL DEFAULT '',
      login_background TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','blocked')),
      plan             TEXT NOT NULL DEFAULT 'default',
      max_users        INT,
      max_companies    INT,
      settings         JSONB NOT NULL DEFAULT '{}',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL DEFAULT '',
      role          TEXT NOT NULL CHECK (role IN ('master','pricetax','cliente')),
      cnpj          TEXT NOT NULL DEFAULT '',
      allowed_cnpjs JSONB NOT NULL DEFAULT '[]',
      blocked       BOOLEAN NOT NULL DEFAULT false,
      block_reason  TEXT NOT NULL DEFAULT '',
      expires_at    DATE,
      avatar        TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_only BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES organizations(id)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS xflow_role TEXT NOT NULL DEFAULT ''`);
  // 3 acessos independentes (Empresas/Gestão de Atividades/XFlow, 2026-08)
  // — substitui o acesso a empresas implícito no `role`. `personal_only`
  // e `cnpj` ficam no banco sem uso, migrados pra cá (ver migrateAccessModel).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS companies_access BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS all_companies_access BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_access BOOLEAN NOT NULL DEFAULT true`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES organizations(id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cnpj_cache (
      cnpj       TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personal_boards (
      user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xflow_tickets (
      id            TEXT PRIMARY KEY,
      ticket_number SERIAL,
      org_id        TEXT NOT NULL REFERENCES organizations(id),
      title         TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'aberta',
      severity      TEXT NOT NULL DEFAULT '',
      priority      TEXT NOT NULL DEFAULT '',
      product       TEXT NOT NULL DEFAULT '',
      reporter_id   TEXT REFERENCES users(id),
      assignee_id   TEXT REFERENCES users(id),
      data          JSONB NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // v2: colunas de operação (tempo, SLA, quem-está-com-a-bola, contadores).
  // Detecta se é a primeira vez que essas colunas são adicionadas para poder
  // rodar o backfill de status_entered_at/ball_holder_* só uma vez (ver abaixo).
  const { rows: xflowV2Check } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='xflow_tickets' AND column_name='status_entered_at'`
  );
  const xflowV2AlreadyMigrated = xflowV2Check.length > 0;

  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS suggested_priority TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS status_entered_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS time_breakdown JSONB NOT NULL DEFAULT '{}'`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS ball_holder_type TEXT NOT NULL DEFAULT 'triage_queue'`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS ball_holder_user_id TEXT REFERENCES users(id)`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS waiting_on_type TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS reopen_count INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS homolog_reject_count INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS sla_first_response_due_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS sla_first_response_met_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS sla_resolution_due_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS sla_resolution_met_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS sla_paused_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS sla_paused_seconds INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS deleted_by TEXT REFERENCES users(id)`);
  // Posição manual no Quadro (2026-08) — número fracionário (padrão
  // Trello/Linear), recalculado no cliente a cada arraste, servidor só
  // grava. Backfill em migrateXflowBoardOrder() dá a ordem inicial
  // (ordem de criação) pros tickets que ainda estão em 0 (nunca tocados).
  await pool.query(`ALTER TABLE xflow_tickets ADD COLUMN IF NOT EXISTS board_order DOUBLE PRECISION NOT NULL DEFAULT 0`);
  await pool.query(`CREATE INDEX IF NOT EXISTS xflow_tickets_deleted_idx ON xflow_tickets(org_id, deleted)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS xflow_events (
      id          TEXT PRIMARY KEY,
      ticket_id   TEXT NOT NULL REFERENCES xflow_tickets(id) ON DELETE CASCADE,
      org_id      TEXT NOT NULL REFERENCES organizations(id),
      type        TEXT NOT NULL,
      field       TEXT,
      old_value   TEXT,
      new_value   TEXT,
      note        TEXT,
      user_id     TEXT REFERENCES users(id),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS xflow_events_ticket_idx ON xflow_events(ticket_id, created_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS xflow_events_org_idx ON xflow_events(org_id, created_at)`);

  if (!xflowV2AlreadyMigrated) {
    // Backfill único: tickets já existentes não tinham status_entered_at nem
    // ball_holder_* — aproxima com o que dá pra inferir do estado atual, sem
    // tentar reconstruir tempo histórico (time_breakdown fica vazio, só passa
    // a acumular daqui pra frente, ver PROJECT_CONTEXT.md §18).
    await pool.query(`UPDATE xflow_tickets SET status_entered_at = updated_at`);
    await pool.query(`
      UPDATE xflow_tickets SET
        ball_holder_type = CASE
          WHEN status IN ('concluida','duplicada','nao_reproduzida','nao_e_bug','descartada') THEN 'none'
          WHEN status = 'bloqueada' THEN 'none'
          WHEN status = 'pausada' THEN 'none'
          WHEN status IN ('aguardando_informacoes','aguardando_usuario') THEN 'reporter'
          WHEN status = 'aguardando_terceiro' THEN 'terceiro'
          WHEN status = 'aguardando_gerencia' THEN 'gestao'
          WHEN status = 'aguardando_validacao_solicitante' THEN 'reporter'
          WHEN status IN ('aberta','triagem') AND assignee_id IS NULL THEN 'triage_queue'
          WHEN assignee_id IS NOT NULL THEN 'dev'
          ELSE 'triage_queue'
        END,
        ball_holder_user_id = CASE
          WHEN status = 'aguardando_validacao_solicitante' THEN reporter_id
          WHEN status IN ('aguardando_informacoes','aguardando_usuario') THEN reporter_id
          WHEN assignee_id IS NOT NULL AND status NOT IN ('concluida','duplicada','nao_reproduzida','nao_e_bug','descartada','bloqueada','pausada','aguardando_gerencia','aguardando_terceiro') THEN assignee_id
          ELSE NULL
        END
    `);
  }

  // Central de Notificações (2026-08) — @menção/citação/vínculo em
  // qualquer ponto do sistema (TASK do XFlow, atividade de empresa) gera
  // uma linha aqui. `target` guarda o suficiente pra navegar direto pro
  // lugar exato (não tem router real, ver PROJECT_CONTEXT.md §9) — formato
  // varia por `kind`: {kind:'xflow_ticket', ticketId} ou
  // {kind:'activity', projectId, activityId}. Relacional porque precisa de
  // leitura/escrita por linha (marcar lida uma a uma) e índice por
  // usuário+lida — não dá pra fazer isso bem com um blob JSONB.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          TEXT PRIMARY KEY,
      org_id      TEXT NOT NULL REFERENCES organizations(id),
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      actor_name  TEXT NOT NULL DEFAULT '',
      target      JSONB NOT NULL DEFAULT '{}',
      read        BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read, created_at DESC)`);

  // Sincronização com Google Calendar (2026-08) — cada usuário conecta a
  // própria conta (não existe "conexão única pra todo mundo"). Só guarda
  // os tokens; qual evento do Google corresponde a qual TASK fica em
  // `data.googleEventId` no próprio `xflow_tickets` (ver blankXflowTicketData
  // abaixo) — é 1:1 por ticket, não precisa de tabela própria pra isso.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS google_calendar_connections (
      user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      token_expiry  TIMESTAMPTZ NOT NULL,
      calendar_id   TEXT NOT NULL DEFAULT 'primary',
      connected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Caixa de transcrições (2026-09, pedido do Rafael) — "eu e meus sócios e
  // funcionários vão mandar transcrição, e o painel faz o input pra nós".
  // Fica de fora do JSONB do projeto de propósito: precisa existir com
  // status próprio (pending/processing/done/failed) antes mesmo de virar
  // uma reunião de verdade, e sobrevive independente do resultado do
  // processamento (falha fica registrada, não silenciosamente perdida).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_submissions (
      id            TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      submitted_by  TEXT NOT NULL REFERENCES users(id),
      transcript    TEXT NOT NULL,
      manual_date   TEXT NOT NULL DEFAULT '',
      manual_time   TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
      error_message TEXT NOT NULL DEFAULT '',
      meeting_id    TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at  TIMESTAMPTZ
    );
  `);

  // Memória do projeto (2026-09, Fase 1 do Assistente Inteligente de
  // Projetos) — não duplica a transcrição/reunião original (que continua
  // vivendo em `projects.data.meetings[]`, fonte de verdade); esta
  // tabela é um índice DERIVADO e recriável (apagar e reindexar nunca
  // perde dado de verdade) pra permitir busca textual rápida com filtro
  // por participante/reunião/data/tipo — sem precisar carregar e
  // deserializar o JSONB inteiro do projeto a cada pergunta. Ver
  // server/memoryIngest.js (quem escreve) e server/memoryRetrieval.js
  // (quem lê). `scope` já existe pensando na Fase 3 (Base de
  // Conhecimento Corporativa — valor 'org_knowledge'), mas nesta fase
  // só o valor 'project' é usado.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_memory_chunks (
      id            TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL REFERENCES organizations(id),
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      meeting_id    TEXT NOT NULL,
      kind          TEXT NOT NULL CHECK (kind IN (
                      'transcript_segment', 'meeting_summary', 'meeting_decision',
                      'meeting_highlight', 'meeting_topic', 'activity', 'activity_comment'
                    )),
      content       TEXT NOT NULL,
      participants  JSONB NOT NULL DEFAULT '[]',
      meeting_date  DATE,
      meeting_title TEXT NOT NULL DEFAULT '',
      time_ref      TEXT NOT NULL DEFAULT '',
      source_ref    JSONB NOT NULL DEFAULT '{}',
      scope         TEXT NOT NULL DEFAULT 'project',
      chunk_order   INT NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // `unaccent` é uma extensão padrão do Postgres (não é algo exótico
  // tipo pgvector — vem no contrib padrão, disponível em praticamente
  // todo Postgres gerenciado). Sem ela, "débito" e "debito" contam como
  // palavras diferentes pra busca — um problema real, já que transcrição
  // colada nem sempre vem com acentuação correta. `unaccent()` não é
  // IMMUTABLE por padrão (não pode entrar direto numa coluna gerada),
  // por isso o wrapper below — padrão documentado da própria Postgres.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS unaccent`);
  await pool.query(`
    CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text AS $$
      SELECT unaccent('unaccent', $1)
    $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  `);
  await pool.query(`ALTER TABLE project_memory_chunks ADD COLUMN IF NOT EXISTS content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', immutable_unaccent(content))) STORED`);
  await pool.query(`CREATE INDEX IF NOT EXISTS project_memory_chunks_tsv_idx ON project_memory_chunks USING GIN (content_tsv)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS project_memory_chunks_meeting_idx ON project_memory_chunks (project_id, meeting_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS project_memory_chunks_org_date_idx ON project_memory_chunks (org_id, project_id, meeting_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS project_memory_chunks_participants_idx ON project_memory_chunks USING GIN (participants jsonb_path_ops)`);
  // Fase 3 da RENATA (2026-09, ver PROJECT_CONTEXT.md) — busca
  // semântica híbrida. Guardado como JSONB (array de números), não
  // pgvector: evita depender de uma extensão que pode não estar
  // disponível no Postgres gerenciado do Railway; nesta escala de dados
  // (baixos milhares de chunks por projeto) calcular similaridade de
  // cosseno em JS é rápido o bastante (ver server/embeddings.js).
  // Nullable de propósito — chunk sem embedding (chave não configurada,
  // ou falha pontual na chamada) continua pesquisável por texto, só
  // fica fora do ranking semântico até a próxima reindexação.
  await pool.query(`ALTER TABLE project_memory_chunks ADD COLUMN IF NOT EXISTS embedding JSONB`);

  // Assistente do Projeto (2026-09, Fase 2 do Assistente Inteligente de
  // Projetos) — uma conversa contínua por usuário+empresa (índice único
  // garante isso no banco, não só por convenção de código). Cada
  // mensagem já nasce com colunas de observabilidade (modelo/tokens/
  // latência) e feedback — mais barato adicionar agora do que numa
  // segunda migration depois. `sources`/`scope` são JSONB porque variam
  // de forma (fonte pode ser trecho de transcrição, decisão, atividade
  // etc. — ver server/assistantRetrieval.js).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id          TEXT PRIMARY KEY,
      org_id      TEXT NOT NULL REFERENCES organizations(id),
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ai_conversations_user_project_uidx ON ai_conversations(project_id, user_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content         TEXT NOT NULL,
      sources         JSONB NOT NULL DEFAULT '[]',
      has_evidence    BOOLEAN,
      scope           JSONB NOT NULL DEFAULT '{}',
      feedback        TEXT CHECK (feedback IN ('up','down')),
      model           TEXT NOT NULL DEFAULT '',
      tokens_input    INT,
      tokens_output   INT,
      latency_ms      INT,
      error           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai_messages(conversation_id, created_at)`);

  // Agente executor (2026-09, pedido do Rafael: "ele precisa ser um
  // agente executor também... sempre trazendo pro usuário validar e
  // confirmar") — a IA só PROPÕE uma ação (`proposed_action`, ver
  // `server/assistantActions.js`); fica `action_status='pending'` até o
  // usuário confirmar ou rejeitar pelo painel (nunca executa sozinha).
  await pool.query(`ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS proposed_action JSONB`);
  await pool.query(`ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS action_status TEXT CHECK (action_status IN ('pending','executed','rejected'))`);

  // Resposta estruturada da RENATA (Fase 5, 2026-09-10) —
  // {introduction, sections, insights}, ver server/assistantRetrieval.js.
  // Nullable de propósito: mensagens antigas e as de conversa_geral
  // (saudação, que nunca passou pelo schema estruturado) ficam com isso
  // null — o front renderiza um balão de texto simples nesse caso, sem
  // quebrar nada do histórico já gravado. `content` continua sendo o
  // texto plano de sempre (introdução + bullets achatados), usado pro
  // histórico da conversa alimentar o prompt da IA.
  await pool.query(`ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS structured JSONB`);

  // Fase 8 (2026-09-11, Central de Conhecimento) — captura de utilização
  // e explicabilidade. `cited_fact_ids`: ids de ai_knowledge_facts que a
  // RENATA realmente citou nesta resposta (mesmo campo/validação de
  // `cited_fact_ids` em ai_answer_cache, ver lá) — é o que responde
  // "onde este conhecimento já foi usado" e "quais conhecimentos a
  // RENATA usou pra responder isso" (item 9/10 do pedido do Rafael).
  // Escolhido JSONB+GIN em vez de uma tabela de junção nova
  // (ai_message_facts) de propósito: é 1:N barato que já nasce dentro da
  // linha que de qualquer forma seria inserida, sem write extra, e
  // `jsonb_path_ops` responde rápido tanto "quais fatos esta resposta
  // usou" quanto o inverso "quais respostas usaram este fato"
  // (`cited_fact_ids @> '["<id>"]'`) — sem o custo de manutenção de mais
  // uma tabela pra uma relação que cabe inteira na própria mensagem.
  // `from_cache`: era implícito antes (cache hit só pulava
  // synthesizeAnswer), agora fica explícito na própria linha — vai
  // alimentar tanto a métrica de "cache hits" quanto o futuro painel
  // "Como a RENATA chegou nisso?" (deferido nesta fase, mas o dado já
  // fica pronto).
  await pool.query(`ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS cited_fact_ids JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS from_cache BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_messages_cited_facts_idx ON ai_messages USING GIN (cited_fact_ids jsonb_path_ops)`);

  // Aprendizados do Assistente do Projeto (2026-09, pedido do Rafael:
  // "gere aprendizado... memorize isso, não jogue no lixo") — fatos
  // duráveis extraídos das conversas (ver `synthesizeAnswer` em
  // `server/assistantRetrieval.js`), à parte de `ai_messages` de propósito:
  // sobrevivem a "Limpar conversa" (que só apaga `ai_messages`), porque um
  // aprendizado sobre o projeto não é conversa descartável.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_project_insights (
      id          TEXT PRIMARY KEY,
      org_id      TEXT NOT NULL REFERENCES organizations(id),
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      content     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_project_insights_project_idx ON ai_project_insights(project_id, created_at)`);

  // Fase 7 (2026-09-11) — substitui ai_project_insights como destino de
  // escrita (tabela antiga não é apagada, fica histórica; ver
  // migrateInsightsToKnowledgeFacts abaixo). Fato só é gravado depois de
  // confirmação explícita do usuário (mesmo fluxo de proposedAction já
  // usado pelas outras 6 ações da RENATA, ver server/knowledgeFacts.js)
  // — nunca automático. `project_id` nullable quando scope='org' (fato
  // válido pra organização inteira, não um projeto específico).
  // `status` começa sempre 'unvalidated' — não existe promoção
  // automática pra 'validated' nesta fase (documentado como próximo
  // passo em PROJECT_CONTEXT.md); 'conflicting' marca os DOIS lados de
  // uma divergência (nunca sobrescreve, nunca apaga — `superseded_by`
  // fica disponível pro futuro fluxo de resolução).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_knowledge_facts (
      id                      TEXT PRIMARY KEY,
      org_id                  TEXT NOT NULL REFERENCES organizations(id),
      project_id              TEXT REFERENCES projects(id) ON DELETE CASCADE,
      scope                   TEXT NOT NULL CHECK (scope IN ('project','org')),
      subject                 TEXT NOT NULL,
      content                 TEXT NOT NULL,
      status                  TEXT NOT NULL DEFAULT 'unvalidated' CHECK (status IN ('unvalidated','conflicting','superseded','rejected')),
      superseded_by           TEXT REFERENCES ai_knowledge_facts(id),
      source_user_id          TEXT REFERENCES users(id),
      source_conversation_id  TEXT REFERENCES ai_conversations(id),
      embedding               JSONB,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_knowledge_facts_org_idx ON ai_knowledge_facts(org_id, scope, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_knowledge_facts_project_idx ON ai_knowledge_facts(project_id, status)`);

  // Fase 7.1 (2026-09-11, endurecimento pedido pelo Rafael) — evolui
  // ai_knowledge_facts sem quebrar o que já está em produção.
  //
  // INCIDENTE REAL EM PRODUÇÃO (2026-09-11, causou crash-loop e
  // derrubou o serviço inteiro): a ordem original fazia a tradução dos
  // valores ANTES de derrubar a constraint antiga — mas a constraint
  // antiga só aceitava `('unvalidated','conflicting','superseded',
  // 'rejected')`, então o próprio `UPDATE ... SET status='active'
  // WHERE status='unvalidated'` já violava ELA MESMA (o valor NOVO
  // 'active' não existia no vocabulário antigo). Só não estourava
  // localmente porque o Postgres de dev não tinha nenhuma linha antiga
  // de verdade pra disparar a tradução. A ordem certa é: derrubar a
  // constraint antiga PRIMEIRO (sem constraint nenhuma, qualquer UPDATE
  // vale), traduzir os valores, só DEPOIS recriar a constraint já com o
  // vocabulário novo — assim ela valida a tabela já 100% traduzida.
  await pool.query(`ALTER TABLE ai_knowledge_facts DROP CONSTRAINT IF EXISTS ai_knowledge_facts_status_check`);
  await pool.query(`UPDATE ai_knowledge_facts SET status='active' WHERE status='unvalidated'`);
  await pool.query(`UPDATE ai_knowledge_facts SET status='disputed' WHERE status='conflicting'`);
  await pool.query(`UPDATE ai_knowledge_facts SET status='archived' WHERE status='rejected'`);
  // Rede de segurança adicional, idempotente: qualquer valor que as 3
  // traduções acima não reconheceram (dado inesperado, nunca deveria
  // acontecer mas não custa nada garantir) também cai pro default
  // seguro, antes da constraint nova validar a tabela inteira.
  await pool.query(`UPDATE ai_knowledge_facts SET status='active' WHERE status NOT IN ('active','disputed','superseded','pending_validation','archived')`);
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD CONSTRAINT ai_knowledge_facts_status_check CHECK (status IN ('active','disputed','superseded','pending_validation','archived'))`);
  await pool.query(`ALTER TABLE ai_knowledge_facts ALTER COLUMN status SET DEFAULT 'active'`);
  // scope ganha 'conversation' (memória de trabalho só daquela conversa)
  // e 'global' (reservado pra uma futura base compartilhada com a
  // IVANA — nenhuma ingestão nova usa isso ainda, ver §37/§38 do
  // PROJECT_CONTEXT.md) — 'project'/'org' continuam valendo como
  // sempre, nenhum dado existente precisa mudar de valor.
  await pool.query(`ALTER TABLE ai_knowledge_facts DROP CONSTRAINT IF EXISTS ai_knowledge_facts_scope_check`);
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD CONSTRAINT ai_knowledge_facts_scope_check CHECK (scope IN ('conversation','project','org','global'))`);
  // Classificação estruturada do conhecimento (pedido do Rafael: "nem
  // tudo é simplesmente um fato") — a IA sugere, sempre grava o que
  // vier (só valida a forma/enum, não o conteúdo). Default 'FACT'
  // preserva o comportamento de toda linha já existente.
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS knowledge_type TEXT NOT NULL DEFAULT 'FACT'`);
  await pool.query(`ALTER TABLE ai_knowledge_facts DROP CONSTRAINT IF EXISTS ai_knowledge_facts_knowledge_type_check`);
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD CONSTRAINT ai_knowledge_facts_knowledge_type_check CHECK (knowledge_type IN ('FACT','DECISION','PREFERENCE','RULE','HYPOTHESIS','PROCEDURE','DEFINITION'))`);
  // Vigência temporal — `valid_from`/`valid_until` nullable (null =
  // "desde sempre"/"ainda vale"). `superseded_by` já existia mas nunca
  // era preenchido; passa a ser usado de verdade quando uma atualização
  // temporal é detectada (ver server/knowledgeFacts.js `classifyRelation`).
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS valid_from DATE`);
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS valid_until DATE`);
  // Proveniência ampliada — prepara terreno pra uma futura base de
  // conhecimento validada compartilhada com a IVANA (legislação,
  // metodologia, pareceres) SEM criar uma tabela paralela incompatível.
  // `origin='conversation'` é o default — tudo que já existe (só vem de
  // conversa com usuário) continua se comportando exatamente igual.
  // Nenhuma ingestão nova usa os outros valores ainda.
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'conversation'`);
  await pool.query(`ALTER TABLE ai_knowledge_facts DROP CONSTRAINT IF EXISTS ai_knowledge_facts_origin_check`);
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD CONSTRAINT ai_knowledge_facts_origin_check CHECK (origin IN ('conversation','legislation','internal_document','methodology','best_practice','other'))`);
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS reference TEXT`);
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS source_date DATE`);
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()`);

  // Fase 8 (2026-09-11, Central de Conhecimento) — evolui
  // ai_knowledge_facts pra sustentar a tela de governança, sem tocar em
  // nenhum valor/constraint já existente (nenhum vocabulário de CHECK
  // muda nesta fase — todas as colunas abaixo são novas e aditivas).
  //
  // `conflicts_with`: quando saveKnowledgeFact detecta relation==='conflict'
  // (server/knowledgeFacts.js), hoje só marca o fato existente como
  // 'disputed' mas nunca grava QUAL fato causou isso — sem esse elo a
  // tela de Conflitos não tem como montar os pares. Preenchido nos dois
  // lados no momento da detecção.
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS conflicts_with TEXT REFERENCES ai_knowledge_facts(id)`);
  // `disputed_reviewed_at`/`by`: resolução "revisado, ainda sem decisão"
  // (um dos 6 desfechos possíveis de um conflito) — não muda `status`
  // (continua 'disputed', a RENATA continua tratando como divergente no
  // prompt), só marca que um humano já olhou e a tela de Conflitos para
  // de listar como pendente-nunca-visto.
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS disputed_reviewed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS disputed_reviewed_by TEXT REFERENCES users(id)`);
  // `supersede_reason`: motivo de uma edição manual ou resolução de
  // conflito, gravado na linha NOVA (nunca a antiga é tocada) — parte do
  // "nunca perder a história do conhecimento" pedido pelo Rafael.
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS supersede_reason TEXT`);
  // `source_meeting_id`: sem FK de propósito, mesmo padrão sem-FK de
  // project_memory_chunks.meeting_id — reuniões vivem dentro do JSONB de
  // projects.data, nunca foram uma tabela própria. Permite "Origem:
  // Reunião X" ser clicável no card/drawer (server/assistantRetrieval.js
  // já sabe o meetingId da reunião aberta quando a IA propõe salvar um
  // fato — só precisa ser propagado até aqui).
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS source_meeting_id TEXT`);
  // Busca lexical em Memórias — mesmo padrão exato (mesma função
  // immutable_unaccent, já criada acima pra project_memory_chunks) de
  // busca em português com fallback de acentuação.
  await pool.query(`ALTER TABLE ai_knowledge_facts ADD COLUMN IF NOT EXISTS content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', immutable_unaccent(content))) STORED`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_knowledge_facts_tsv_idx ON ai_knowledge_facts USING GIN (content_tsv)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_knowledge_facts_conflicts_idx ON ai_knowledge_facts(conflicts_with) WHERE conflicts_with IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_knowledge_facts_source_meeting_idx ON ai_knowledge_facts(project_id, source_meeting_id) WHERE source_meeting_id IS NOT NULL`);

  // Cache semântico de perguntas/respostas (Fase 7, 2026-09-11) — modo
  // "seguro" combinado com o Rafael: chave é a pergunta já RESOLVIDA
  // (participant/meeting_id/kind, saída de resolveQuery), não o texto
  // cru do usuário — evita reaproveitar resposta certa pra pergunta
  // parecida mas com intenção diferente. `data_fingerprint` (hash de
  // projects.updated_at + data de hoje, ver server/answerCache.js)
  // invalida tudo pra aquele projeto de uma vez quando qualquer coisa
  // muda — grosseiro mas seguro, mesmo espírito do reindex-needed
  // (Fase 6). Nunca grava resposta que tinha proposedAction (reaproveitar
  // uma ação fora de contexto é perigoso).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_answer_cache (
      id                TEXT PRIMARY KEY,
      org_id            TEXT NOT NULL REFERENCES organizations(id),
      project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      standalone_query  TEXT NOT NULL,
      query_embedding   JSONB NOT NULL,
      participant       TEXT,
      meeting_id        TEXT,
      kind              TEXT,
      structured        JSONB NOT NULL,
      cited_sources     JSONB NOT NULL DEFAULT '[]',
      has_evidence      BOOLEAN NOT NULL DEFAULT true,
      data_fingerprint  TEXT NOT NULL,
      hit_count         INT NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_answer_cache_lookup_idx ON ai_answer_cache(project_id, data_fingerprint)`);

  // Fase 7.1 (2026-09-11) — invalidação por DEPENDÊNCIA real, não só
  // fingerprint grosseiro: guarda quais reuniões e quais fatos
  // formaram aquela resposta específica, pra invalidar só quem
  // realmente depende do que mudou (ver isStillFresh em
  // server/answerCache.js). `tokens_input`/`tokens_output` gravados
  // aqui também — é o custo real da resposta original, usado depois
  // pra estimar "tokens economizados" a cada acerto de cache (métrica,
  // ver ai_metrics_events).
  await pool.query(`ALTER TABLE ai_answer_cache ADD COLUMN IF NOT EXISTS dependency_meeting_ids JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE ai_answer_cache ADD COLUMN IF NOT EXISTS dependency_fact_ids JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE ai_answer_cache ADD COLUMN IF NOT EXISTS tokens_input INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE ai_answer_cache ADD COLUMN IF NOT EXISTS tokens_output INT NOT NULL DEFAULT 0`);
  // Fase 8 — `cited_fact_ids` é o subconjunto ESTREITO de fatos que a IA
  // realmente citou pra formular a resposta (a RENATA declara isso, é
  // validado contra dependency_fact_ids antes de confiar — mesma defesa
  // em profundidade de citedChunkIds), bem diferente de
  // `dependency_fact_ids` acima (LARGO, tudo que foi injetado no prompt,
  // usado só pra invalidação de cache). Mesma distinção que já existe
  // entre dependency_meeting_ids (largo) e cited_sources (estreito).
  // Persistido aqui pra sobreviver a um acerto de cache futuro (ver
  // askProjectAssistant, ramo cachedAnswer).
  await pool.query(`ALTER TABLE ai_answer_cache ADD COLUMN IF NOT EXISTS cited_fact_ids JSONB NOT NULL DEFAULT '[]'`);

  // Métricas mensuráveis (Fase 7.1, pedido do Rafael: "não precisa de
  // dashboard agora, mas deixe esses eventos mensuráveis") — tabela
  // genérica, um evento por linha, consultável via SQL direto. Nunca
  // grava síncrono no caminho crítico (sempre fire-and-forget, ver
  // server/metrics.js `logMetric`) — uma falha aqui nunca derruba nem
  // atrasa uma resposta da RENATA.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_metrics_events (
      id          TEXT PRIMARY KEY,
      org_id      TEXT NOT NULL REFERENCES organizations(id),
      project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
      event_type  TEXT NOT NULL,
      metadata    JSONB NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_metrics_events_type_idx ON ai_metrics_events(org_id, event_type, created_at)`);

  // Fase 8 (2026-09-11, Central de Conhecimento) — grafo de entidades,
  // versão relacional (pedido do Rafael: "não precisa ser Neo4j agora,
  // pode continuar relacional, mas quero que a arquitetura comece a
  // identificar e conectar entidades"). Modelo de 2 tabelas escolhido em
  // vez de um array JSONB de menções direto em ai_knowledge_facts:
  // precisamos de find-or-create deduplicado por nome normalizado DENTRO
  // da org (índice único) e de lookup reverso indexável ("quais fatos
  // mencionam esta pessoa/empresa") — um JSONB solto não dá nenhum dos
  // dois de graça. `normalized_name` é calculado em JS com
  // normalizeName() (server/assistantContext.js, já usado pra
  // apelidos/nomes parciais no resto do app), não uma coluna gerada em
  // SQL. `linked_user_id`/`linked_project_id` são heurísticos e opcionais
  // (nunca bloqueiam a criação da entidade se a resolução falhar) —
  // ligam PERSON a um membro de equipe real e COMPANY/PROJECT ao projeto
  // de origem, quando dá pra resolver com confiança.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_knowledge_entities (
      id                TEXT PRIMARY KEY,
      org_id            TEXT NOT NULL REFERENCES organizations(id),
      type              TEXT NOT NULL CHECK (type IN ('PERSON','COMPANY','PROJECT','LAW','PRODUCT','TOPIC')),
      name              TEXT NOT NULL,
      normalized_name   TEXT NOT NULL,
      linked_user_id    TEXT REFERENCES users(id),
      linked_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      mention_count     INT NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_entities_org_type_name_uidx ON ai_knowledge_entities(org_id, type, normalized_name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_knowledge_entities_org_type_idx ON ai_knowledge_entities(org_id, type)`);

  // Tabela de junção — um fato pode mencionar várias entidades, uma
  // entidade aparece em vários fatos. `ON DELETE CASCADE` dos dois lados:
  // apagar um fato (nunca acontece hoje, mas por segurança) ou uma
  // entidade nunca deixa lixo órfão aqui.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_knowledge_fact_entities (
      id          TEXT PRIMARY KEY,
      fact_id     TEXT NOT NULL REFERENCES ai_knowledge_facts(id) ON DELETE CASCADE,
      entity_id   TEXT NOT NULL REFERENCES ai_knowledge_entities(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_fact_entities_uidx ON ai_knowledge_fact_entities(fact_id, entity_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ai_knowledge_fact_entities_entity_idx ON ai_knowledge_fact_entities(entity_id)`);
}

// Migração one-shot (Fase 7, 2026-09-11) — copia os aprendizados já
// gravados em ai_project_insights (texto livre, sem escopo/proveniência)
// pra ai_knowledge_facts (scope='project', status='active' — corrigido
// na Fase 8: o literal era 'unvalidated' até então, valor que a Fase 7.1
// removeu do vocabulário de status; inofensivo até agora porque nada
// mais escreve em ai_project_insights desde a Fase 7 (todo id já migrado
// cai no WHERE NOT EXISTS), mas ficaria quebrado se essa tabela antiga
// algum dia ganhasse uma linha nova). Idempotente: id determinístico a
// partir do id de origem, nunca duplica rodando de novo. Tabela antiga
// não é apagada nem deixa de existir — só para de ser usada pelo código
// novo.
export async function migrateInsightsToKnowledgeFacts() {
  await pool.query(`
    INSERT INTO ai_knowledge_facts (id, org_id, project_id, scope, subject, content, status, created_at, updated_at)
    SELECT 'akf-mig-' || i.id, i.org_id, i.project_id, 'project', left(i.content, 60), i.content, 'active', i.created_at, i.created_at
    FROM ai_project_insights i
    WHERE NOT EXISTS (SELECT 1 FROM ai_knowledge_facts k WHERE k.id = 'akf-mig-' || i.id)
  `);
}

export function blankXflowTicketData() {
  return {
    module: '', affectedUser: '', affectedCompany: '', environment: '',
    description: '', expectedResult: '', reproSteps: '', impact: '', frequency: '',
    occurredAt: '', evidence: [],
    capturedUrl: '', browser: '', os: '', appVersion: '', screenRes: '', sessionId: '',
    blockedReason: '', statusBeforeBlock: '',
    duplicateOfTicketId: '', spawnedFeatureTicketId: '', originatedFromTicketId: '',
    closureReason: '', closureJustification: '',
    solution: '', whatToTest: '',
    nextAction: '', dueDate: '',
    type: 'bug',
    archived: false,
    comments: [],
    history: [],
    linkedTicketIds: [],
    googleEventId: '',
  };
}

export const PRICETAX_ORG_SLUG = 'pricetax';

export async function migrateToPricetaxOrg() {
  const { rows } = await pool.query(
    `INSERT INTO organizations (id, slug, name, display_name, primary_color)
     VALUES ($1, $2, 'PRICETAX', 'PRICETAX', '#F5C400')
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
     RETURNING id`,
    [uid('org'), PRICETAX_ORG_SLUG]
  );
  const orgId = rows[0].id;
  await pool.query('UPDATE users SET org_id = $1 WHERE org_id IS NULL', [orgId]);
  await pool.query('UPDATE projects SET org_id = $1 WHERE org_id IS NULL', [orgId]);
  const seedUsername = process.env.SEED_ADMIN_USERNAME;
  if (seedUsername) {
    await pool.query('UPDATE users SET is_super_admin = true WHERE username = $1', [seedUsername]);
  }
  return orgId;
}

// Migra o acesso a empresas implícito no `role` (Master via todas,
// PRICETAX via `allowed_cnpjs`, Cliente via `cnpj` único) pro modelo de 3
// acessos independentes (2026-08, ver PROJECT_CONTEXT.md). Idempotente —
// as condições WHERE já refletem o estado pós-migração, seguro rodar em
// todo boot igual as outras migrações deste arquivo.
export async function migrateAccessModel() {
  await pool.query(`UPDATE users SET companies_access = true WHERE personal_only = false AND companies_access = false`);
  await pool.query(`UPDATE users SET all_companies_access = true WHERE role = 'master' AND companies_access = true AND all_companies_access = false`);
  await pool.query(`
    UPDATE users SET allowed_cnpjs = allowed_cnpjs || jsonb_build_array(cnpj)
    WHERE role = 'cliente' AND cnpj != '' AND NOT (allowed_cnpjs @> jsonb_build_array(cnpj))
  `);
}

// Ordem manual inicial do Quadro do XFlow (2026-08) = ordem de criação.
// Só toca tickets que ainda estão em board_order=0 (nunca reorganizados
// manualmente nem criados depois dessa migração) — idempotente.
export async function migrateXflowBoardOrder() {
  await pool.query(`
    UPDATE xflow_tickets t SET board_order = sub.rn
    FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY created_at ASC) AS rn FROM xflow_tickets) sub
    WHERE t.id = sub.id AND t.board_order = 0
  `);
}

export async function seedIfEmpty() {
  const { rows: userCount } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  if (userCount[0].n === 0) {
    const username = process.env.SEED_ADMIN_USERNAME;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!username || !password) {
      console.warn('[seed] SEED_ADMIN_USERNAME/SEED_ADMIN_PASSWORD não definidos — nenhum admin criado.');
    } else {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `INSERT INTO users (id, username, password_hash, name, role)
         VALUES ($1, $2, $3, $4, 'master')
         ON CONFLICT (username) DO NOTHING`,
        [uid('user'), username, hash, process.env.SEED_ADMIN_NAME || 'Administrador PRICETAX']
      );
      console.log('[seed] admin user created:', username);
    }
  }

  const { rows: projectCount } = await pool.query('SELECT COUNT(*)::int AS n FROM projects');
  if (projectCount[0].n === 0) {
    const demo = defaultDemoProject();
    await pool.query('INSERT INTO projects (id, data) VALUES ($1, $2)', [demo.id, JSON.stringify(demo)]);
    console.log('[seed] demo project created:', demo.id);
  }
}
