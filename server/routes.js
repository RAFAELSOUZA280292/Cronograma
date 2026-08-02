import { Router } from 'express';
import { pool, blankProject } from './db.js';
import {
  hashPassword, comparePassword, signToken, setAuthCookie, clearAuthCookie,
  rowToUser, findUserByUsername, findUserById, requireAuth, requireMaster, requireMasterOrPricetax, toISODateSafe,
} from './auth.js';
import { lookupCnpj, cleanCnpj, formatCnpj } from './cnpjLookup.js';

function uid(p) {
  return p + '-' + Math.random().toString(36).slice(2, 9);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function canAccessProject(user, project) {
  if (!user || !project) return false;
  if (user.role === 'master') return true;
  const cnpj = project.company && project.company.cnpj;
  if (!cnpj) return false;
  if (user.role === 'pricetax') return (user.allowedCnpjs || []).includes(cnpj);
  if (user.role === 'cliente') return user.cnpj === cnpj;
  return false;
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

// ---------- Users (master only) ----------

router.get('/users', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
    res.json({ users: rows.map(rowToUser) });
  } catch (e) { next(e); }
});

router.post('/users', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { username, password, name, email, role, cnpj, allowedCnpjs, avatar } = req.body || {};
    if (!username || !password || !name || !role) {
      return res.status(400).json({ message: 'Usuário, senha, nome e papel são obrigatórios.' });
    }
    const existing = await findUserByUsername(username);
    if (existing) return res.status(409).json({ message: 'Usuário já existe.' });

    const hash = await hashPassword(password);
    const id = uid('user');
    const { rows } = await pool.query(
      `INSERT INTO users (id, username, password_hash, name, email, role, cnpj, allowed_cnpjs, avatar)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, username, hash, name, email || '', role, cnpj || '', JSON.stringify(allowedCnpjs || []), avatar || '']
    );
    res.status(201).json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.patch('/users/:id', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    const patch = req.body || {};
    const target = await findUserById(id);
    if (!target) return res.status(404).json({ message: 'Usuário não encontrado.' });

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
    };
    const { rows } = await pool.query(
      `UPDATE users SET username=$1, name=$2, email=$3, role=$4, cnpj=$5, allowed_cnpjs=$6, expires_at=$7, avatar=$8, updated_at=now()
       WHERE id=$9 RETURNING *`,
      [next_.username, next_.name, next_.email, next_.role, next_.cnpj, next_.allowed_cnpjs, next_.expires_at, next_.avatar, id]
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
    const { rows } = await pool.query(
      `UPDATE users SET blocked=$1, block_reason=$2, updated_at=now() WHERE id=$3 RETURNING *`,
      [!!blocked, blocked ? (blockReason || 'Bloqueado manualmente') : '', id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Usuário não encontrado.' });
    res.json({ user: rowToUser(rows[0]) });
  } catch (e) { next(e); }
});

router.post('/users/:id/renew', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    const days = Number(req.body && req.body.days) || 30;
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    const iso = newDate.toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `UPDATE users SET expires_at=$1, blocked=false, block_reason='', updated_at=now() WHERE id=$2 RETURNING *`,
      [iso, id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Usuário não encontrado.' });
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
    const hash = await hashPassword(newPassword);
    const { rowCount } = await pool.query(
      `UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2`,
      [hash, id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Usuário não encontrado.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/users/:id', requireAuth, requireMaster, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ message: 'Você não pode remover a si mesmo.' });

    const target = await findUserById(id);
    if (!target) return res.status(404).json({ message: 'Usuário não encontrado.' });

    if (target.role === 'master') {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role='master'`);
      if (rows[0].n <= 1) return res.status(400).json({ message: 'Deixe pelo menos um administrador.' });
    }
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Projects ----------

router.get('/projects', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT data FROM projects ORDER BY created_at ASC');
    const all = rows.map((r) => r.data);
    const visible = all.filter((p) => canAccessProject(req.user, p));
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

    await pool.query('INSERT INTO projects (id, data) VALUES ($1, $2)', [project.id, JSON.stringify(project)]);

    if (req.user.role === 'pricetax' && project.company.cnpj) {
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

router.patch('/projects/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT data FROM projects WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ message: 'Projeto não encontrado.' });
    const current = rows[0].data;
    if (!canAccessProject(req.user, current)) {
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
