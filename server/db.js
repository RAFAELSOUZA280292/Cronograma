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
