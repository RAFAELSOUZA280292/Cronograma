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
