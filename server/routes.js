import { Router } from 'express';
import { pool, blankProject, blankPersonalBoard } from './db.js';
import {
  hashPassword, comparePassword, signToken, setAuthCookie, clearAuthCookie,
  rowToUser, findUserByUsername, findUserById, requireAuth, requireMaster, requireMasterOrPricetax, requireSuperAdmin, optionalAuth, toISODateSafe,
} from './auth.js';
import { lookupCnpj, cleanCnpj, formatCnpj } from './cnpjLookup.js';

function uid(p) {
  return p + '-' + Math.random().toString(36).slice(2, 9);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function canAccessProject(user, project, orgId) {
  if (!user || !project) return false;
  if (user.isSuperAdmin) return true;
  if (user.orgId !== orgId) return false;
  if (!user.companiesAccess) return false;
  if (user.allCompaniesAccess) return true;
  const cnpj = project.company && project.company.cnpj;
  return !!cnpj && (user.allowedCnpjs || []).includes(cnpj);
}

function sameOrg(req, targetOrgId) {
  return req.user.isSuperAdmin || req.user.orgId === targetOrgId;
}

// Super Admin pode "entrar" numa organização específica passando ?asOrg=<id>
// (só respeitado quando isSuperAdmin — qualquer outro usuário sempre usa a própria org).
function effectiveOrgId(req) {
  if (req.user.isSuperAdmin && req.query.asOrg) return req.query.asOrg;
  return req.user.orgId;
}

export const router = Router();

// ---------- Auth ----------

router.post('/auth/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Informe usuário e senha.' });
    }
    const row = await findUserByUsername(username);
    if (!row) return res.status(401).json({ message: 'Usuário ou senha inválidos.' });

    if (!row.blocked && row.expires_at && toISODateSafe(row.expires_at) < todayISO()) {
      await pool.query(
        `UPDATE users SET blocked = true, block_reason = 'Acesso expirado', updated_at = now() WHERE id = $1`,
        [row.id]
      );
      return res.status(403).json({ message: 'Acesso expirado. Fale com um PRICETAX Master para renovar.' });
    }
    if (row.blocked) {
      return res.status(403).json({ message: row.block_reason || 'Acesso bloqueado. Fale com um PRICETAX Master.' });
    }

    const ok = await comparePassword(password, row.password_hash);
    if (!ok) return res.status(401).json({ message: 'Usuário ou senha inválidos.' });

    const token = signToken(row.id);
    setAuthCookie(res, token);
    res.json({ user: rowToUser(row) });
  } catch (e) { next(e); }
});

router.post('/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({});
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.patch('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const { avatar } = req.body || {};
    if (typeof avatar !== 'string' || avatar.length > 16) {
      return res.status(400).json({ message: 'Avatar inválido.' });
    }
    const { rows } = await pool.query(
      `UPDATE users SET avatar=$1, updated_at=now() WHERE id=$2 RETURNING *`,
      [avatar, req.user.id]
    );
    res.json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/auth/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ message: 'A nova senha precisa ter pelo menos 4 caracteres.' });
    }
    const row = await findUserById(req.user.id);
    const ok = await comparePassword(currentPassword || '', row.password_hash);
    if (!ok) return res.status(401).json({ message: 'Senha atual incorreta.' });
    const hash = await hashPassword(newPassword);
    await pool.query(`UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2`, [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Users (master only) ----------

router.get('/users', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const sql = req.user.isSuperAdmin && !orgId
      ? 'SELECT * FROM users ORDER BY created_at ASC'
      : 'SELECT * FROM users WHERE org_id=$1 ORDER BY created_at ASC';
    const params = req.user.isSuperAdmin && !orgId ? [] : [orgId];
    const { rows } = await pool.query(sql, params);
    res.json({ users: rows.map(rowToUser) });
  } catch (e) { next(e); }
});

router.post('/users', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { username, password, name, email, role, cnpj, allowedCnpjs, avatar, personalOnly, xflowRole, companiesAccess, allCompaniesAccess, personalAccess } = req.body || {};
    if (!username || !password || !name || !role) {
      return res.status(400).json({ message: 'Usuário, senha, nome e papel são obrigatórios.' });
    }
    const existing = await findUserByUsername(username);
    if (existing) return res.status(409).json({ message: 'Usuário já existe.' });

    const hash = await hashPassword(password);
    const id = uid('user');
    const { rows } = await pool.query(
      `INSERT INTO users (id, username, password_hash, name, email, role, cnpj, allowed_cnpjs, avatar, personal_only, org_id, xflow_role, companies_access, all_companies_access, personal_access)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [id, username, hash, name, email || '', role, cnpj || '', JSON.stringify(allowedCnpjs || []), avatar || '', !!personalOnly, effectiveOrgId(req), xflowRole || '', !!companiesAccess, !!allCompaniesAccess, personalAccess !== undefined ? !!personalAccess : true]
    );
    res.status(201).json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.patch('/users/:id', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    const patch = req.body || {};
    const target = await findUserById(id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });

    if (patch.username && patch.username !== target.username) {
      const dup = await findUserByUsername(patch.username);
      if (dup) return res.status(409).json({ message: 'Usuário já existe.' });
    }

    const next_ = {
      username: patch.username ?? target.username,
      name: patch.name ?? target.name,
      email: patch.email ?? target.email,
      role: patch.role ?? target.role,
      cnpj: patch.cnpj ?? target.cnpj,
      allowed_cnpjs: JSON.stringify(patch.allowedCnpjs !== undefined ? patch.allowedCnpjs : (target.allowed_cnpjs || [])),
      expires_at: patch.expiresAt !== undefined ? (patch.expiresAt || null) : target.expires_at,
      avatar: patch.avatar !== undefined ? patch.avatar : target.avatar,
      personal_only: patch.personalOnly !== undefined ? !!patch.personalOnly : target.personal_only,
      xflow_role: patch.xflowRole !== undefined ? (patch.xflowRole || '') : target.xflow_role,
      companies_access: patch.companiesAccess !== undefined ? !!patch.companiesAccess : target.companies_access,
      all_companies_access: patch.allCompaniesAccess !== undefined ? !!patch.allCompaniesAccess : target.all_companies_access,
      personal_access: patch.personalAccess !== undefined ? !!patch.personalAccess : target.personal_access,
    };
    const { rows } = await pool.query(
      `UPDATE users SET username=$1, name=$2, email=$3, role=$4, cnpj=$5, allowed_cnpjs=$6, expires_at=$7, avatar=$8, personal_only=$9, xflow_role=$10, companies_access=$11, all_companies_access=$12, personal_access=$13, updated_at=now()
       WHERE id=$14 RETURNING *`,
      [next_.username, next_.name, next_.email, next_.role, next_.cnpj, next_.allowed_cnpjs, next_.expires_at, next_.avatar, next_.personal_only, next_.xflow_role, next_.companies_access, next_.all_companies_access, next_.personal_access, id]
    );
    res.json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/users/:id/block', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { blocked, blockReason } = req.body || {};
    if (id === req.user.id && blocked) {
      return res.status(400).json({ message: 'Você não pode bloquear a si mesmo.' });
    }
    const target = await findUserById(id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });
    const { rows } = await pool.query(
      `UPDATE users SET blocked=$1, block_reason=$2, updated_at=now() WHERE id=$3 RETURNING *`,
      [!!blocked, blocked ? (blockReason || 'Bloqueado manualmente') : '', id]
    );
    res.json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/users/:id/renew', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    const target = await findUserById(id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });
    const days = Number(req.body && req.body.days) || 30;
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    const iso = newDate.toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `UPDATE users SET expires_at=$1, blocked=false, block_reason='', updated_at=now() WHERE id=$2 RETURNING *`,
      [iso, id]
    );
    res.json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/users/:id/reset-password', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ message: 'Senha muito curta.' });
    }
    const target = await findUserById(id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });
    const hash = await hashPassword(newPassword);
    await pool.query(
      `UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2`,
      [hash, id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/users/:id', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ message: 'Você não pode remover a si mesmo.' });

    const target = await findUserById(id);
    if (!target || !sameOrg(req, target.org_id)) return res.status(404).json({ message: 'Usuário não encontrado.' });

    if (target.role === 'master') {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role='master' AND org_id=$1`, [target.org_id]);
      if (rows[0].n <= 1) return res.status(400).json({ message: 'Deixe pelo menos um administrador.' });
    }
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Projects ----------

router.get('/projects', requireAuth, async (req, res, next) => {
  try {
    const orgId = effectiveOrgId(req);
    const sql = req.user.isSuperAdmin && !orgId
      ? 'SELECT data, org_id FROM projects ORDER BY created_at ASC'
      : 'SELECT data, org_id FROM projects WHERE org_id=$1 ORDER BY created_at ASC';
    const params = req.user.isSuperAdmin && !orgId ? [] : [orgId];
    const { rows } = await pool.query(sql, params);
    const visible = rows.filter((r) => canAccessProject(req.user, r.data, r.org_id)).map((r) => r.data);
    res.json({ projects: visible });
  } catch (e) { next(e); }
});

router.post('/projects', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const project = blankProject();
    const company = (req.body && req.body.company) || {};
    if (company.cnpj) {
      const digits = cleanCnpj(company.cnpj);
      company.cnpj = digits.length === 14 ? formatCnpj(digits) : company.cnpj;
    }
    project.company = { ...project.company, ...company };

    if (Array.isArray(req.body.activities)) project.activities = req.body.activities;
    if (Array.isArray(req.body.phases)) project.phases = req.body.phases;
    if (Array.isArray(req.body.team)) project.team = req.body.team;
    if (Array.isArray(req.body.log)) project.log = req.body.log;

    await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1, $2, $3)', [project.id, JSON.stringify(project), effectiveOrgId(req)]);

    if (req.user.companiesAccess && !req.user.allCompaniesAccess && project.company.cnpj) {
      const cnpj = project.company.cnpj;
      const { rows } = await pool.query('SELECT allowed_cnpjs FROM users WHERE id=$1', [req.user.id]);
      const current = (rows[0] && rows[0].allowed_cnpjs) || [];
      if (!current.includes(cnpj)) {
        await pool.query('UPDATE users SET allowed_cnpjs=$1, updated_at=now() WHERE id=$2', [JSON.stringify([...current, cnpj]), req.user.id]);
      }
    }

    res.status(201).json({ project });
  } catch (e) { next(e); }
});

router.post('/cnpj/lookup', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const { cnpj } = req.body || {};
    const result = await lookupCnpj(cnpj);
    res.json(result);
  } catch (e) { next(e); }
});

router.delete('/projects/:id', requireAuth, requireMasterOrPricetax, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Projeto não encontrado.' });
    if (!canAccessProject(req.user, rows[0].data, rows[0].org_id)) {
      return res.status(403).json({ message: 'Sem acesso a este projeto.' });
    }
    await pool.query('DELETE FROM projects WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/projects/:id/team-candidates', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Projeto não encontrado.' });
    const project = rows[0].data;
    if (!canAccessProject(req.user, project, rows[0].org_id)) {
      return res.status(403).json({ message: 'Sem acesso a este projeto.' });
    }
    const cnpj = (project.company && project.company.cnpj) || '';
    const { rows: userRows } = await pool.query(
      `SELECT id, name, role, username FROM users WHERE org_id=$1 AND (role IN ('master','pricetax') OR (role='cliente' AND cnpj=$2)) ORDER BY name ASC`,
      [rows[0].org_id, cnpj]
    );
    res.json({ users: userRows });
  } catch (e) { next(e); }
});

router.patch('/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Projeto não encontrado.' });
    const current = rows[0].data;
    if (!canAccessProject(req.user, current, rows[0].org_id)) {
      return res.status(403).json({ message: 'Sem acesso a este projeto.' });
    }
    const next_ = req.body && req.body.project;
    if (!next_ || next_.id !== id) {
      return res.status(400).json({ message: 'Payload de projeto inválido.' });
    }
    await pool.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(next_), id]);
    res.json({ project: next_ });
  } catch (e) { next(e); }
});

// ---------- Personal board (per-user, not tied to any company) ----------

router.get('/personal-board', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT data FROM personal_boards WHERE user_id=$1', [req.user.id]);
    if (rows[0]) return res.json({ board: rows[0].data });
    const board = blankPersonalBoard();
    await pool.query('INSERT INTO personal_boards (user_id, data) VALUES ($1,$2)', [req.user.id, JSON.stringify(board)]);
    res.json({ board });
  } catch (e) { next(e); }
});

router.patch('/personal-board', requireAuth, async (req, res, next) => {
  try {
    const board = req.body && req.body.board;
    if (!board) return res.status(400).json({ message: 'Payload inválido.' });
    await pool.query(
      `INSERT INTO personal_boards (user_id, data) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET data=$2, updated_at=now()`,
      [req.user.id, JSON.stringify(board)]
    );
    res.json({ board });
  } catch (e) { next(e); }
});

// ---------- Public board sharing (per-board link; anonymous = read-only, logged-in = full edit) ----------
// Nenhuma tabela nova: cada board dentro do JSONB carrega seu próprio shareToken/visibility.
// A busca abaixo varre todas as linhas de personal_boards (poucas dezenas de usuários hoje) —
// não escala pra milhares de usuários, mas evita criar um índice relacional só pra isso.

async function findBoardByShareToken(token) {
  const { rows } = await pool.query('SELECT user_id, data FROM personal_boards');
  for (const row of rows) {
    const boards = (row.data && row.data.boards) || [];
    const idx = boards.findIndex((b) => b.shareToken && b.shareToken === token);
    if (idx !== -1) return { ownerId: row.user_id, ownerData: row.data, boardIndex: idx, board: boards[idx] };
  }
  return null;
}

router.get('/public-board/:token', optionalAuth, async (req, res, next) => {
  try {
    const found = await findBoardByShareToken(req.params.token);
    if (!found || found.board.visibility !== 'public') {
      return res.status(404).json({ message: 'Link inválido ou o quadro não é mais público.' });
    }
    let ownerName = '';
    if (req.user && req.user.id === found.ownerId) {
      ownerName = req.user.name;
    } else {
      const ownerRow = await findUserById(found.ownerId);
      ownerName = ownerRow ? ownerRow.name : '';
    }
    res.json({ board: found.board, canEdit: !!req.user, ownerName });
  } catch (e) { next(e); }
});

router.patch('/public-board/:token', requireAuth, async (req, res, next) => {
  try {
    const patchedBoard = req.body && req.body.board;
    if (!patchedBoard) return res.status(400).json({ message: 'Payload inválido.' });
    const found = await findBoardByShareToken(req.params.token);
    if (!found || found.board.visibility !== 'public') {
      return res.status(404).json({ message: 'Link inválido ou o quadro não é mais público.' });
    }
    if (patchedBoard.id !== found.board.id) {
      return res.status(400).json({ message: 'Quadro inválido.' });
    }
    const nextData = {
      ...found.ownerData,
      boards: found.ownerData.boards.map((b, i) => (i === found.boardIndex ? patchedBoard : b)),
    };
    await pool.query('UPDATE personal_boards SET data=$1, updated_at=now() WHERE user_id=$2', [JSON.stringify(nextData), found.ownerId]);
    res.json({ board: patchedBoard });
  } catch (e) { next(e); }
});

// ---------- Organizations (Super Admin only) ----------

function rowToOrg(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    displayName: row.display_name,
    logoLight: row.logo_light,
    logoDark: row.logo_dark,
    favicon: row.favicon,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    loginBackground: row.login_background,
    status: row.status,
    plan: row.plan,
    maxUsers: row.max_users,
    maxCompanies: row.max_companies,
    createdAt: row.created_at,
  };
}

function slugify(s) {
  return (s || '')
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

router.get('/organizations', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.*,
        (SELECT COUNT(*)::int FROM users WHERE org_id = o.id) AS user_count,
        (SELECT COUNT(*)::int FROM projects WHERE org_id = o.id) AS project_count
      FROM organizations o ORDER BY created_at ASC
    `);
    res.json({ organizations: rows.map((r) => ({ ...rowToOrg(r), userCount: r.user_count, projectCount: r.project_count })) });
  } catch (e) { next(e); }
});

router.post('/organizations', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { name, slug } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'Nome da organização é obrigatório.' });
    const finalSlug = slugify(slug || name);
    if (!finalSlug) return res.status(400).json({ message: 'Não foi possível gerar um identificador (slug) válido.' });
    const { rows: dup } = await pool.query('SELECT id FROM organizations WHERE slug=$1', [finalSlug]);
    if (dup[0]) return res.status(409).json({ message: 'Já existe uma organização com esse identificador.' });
    const { rows } = await pool.query(
      `INSERT INTO organizations (id, slug, name, display_name) VALUES ($1,$2,$3,$4) RETURNING *`,
      [uid('org'), finalSlug, name.trim(), name.trim()]
    );
    res.status(201).json({ organization: rowToOrg(rows[0]) });
  } catch (e) { next(e); }
});

router.patch('/organizations/:id', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: existingRows } = await pool.query('SELECT * FROM organizations WHERE id=$1', [id]);
    const target = existingRows[0];
    if (!target) return res.status(404).json({ message: 'Organização não encontrada.' });
    const patch = req.body || {};
    const next_ = {
      name: patch.name !== undefined ? patch.name : target.name,
      display_name: patch.displayName !== undefined ? patch.displayName : target.display_name,
      logo_light: patch.logoLight !== undefined ? patch.logoLight : target.logo_light,
      logo_dark: patch.logoDark !== undefined ? patch.logoDark : target.logo_dark,
      favicon: patch.favicon !== undefined ? patch.favicon : target.favicon,
      primary_color: patch.primaryColor !== undefined ? patch.primaryColor : target.primary_color,
      secondary_color: patch.secondaryColor !== undefined ? patch.secondaryColor : target.secondary_color,
      login_background: patch.loginBackground !== undefined ? patch.loginBackground : target.login_background,
      status: patch.status !== undefined ? patch.status : target.status,
    };
    if (!['active', 'suspended', 'blocked'].includes(next_.status)) {
      return res.status(400).json({ message: 'Status inválido.' });
    }
    const { rows } = await pool.query(
      `UPDATE organizations SET name=$1, display_name=$2, logo_light=$3, logo_dark=$4, favicon=$5,
        primary_color=$6, secondary_color=$7, login_background=$8, status=$9, updated_at=now()
       WHERE id=$10 RETURNING *`,
      [next_.name, next_.display_name, next_.logo_light, next_.logo_dark, next_.favicon,
        next_.primary_color, next_.secondary_color, next_.login_background, next_.status, id]
    );
    res.json({ organization: rowToOrg(rows[0]) });
  } catch (e) { next(e); }
});
