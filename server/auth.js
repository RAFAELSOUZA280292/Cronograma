import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { originOf, setActor } from './projectAudit.js';
import { readInternal } from './renata/internalAuth.js';

const COOKIE_NAME = 'cronograma_token';
const TOKEN_TTL = '7d';

function requireSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não definido');
  return secret;
}

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// `pv` = impressão curta do hash da senha: trocar/redefinir a senha derruba as sessões abertas (tokens antigos, sem `pv`, seguem valendo até vencer).
function passwordTag(passwordHash) {
  return crypto.createHash('sha256').update(String(passwordHash || '')).digest('hex').slice(0, 12);
}

export function signToken(userId, passwordHash) {
  const payload = { sub: userId };
  if (passwordHash) payload.pv = passwordTag(passwordHash);
  return jwt.sign(payload, requireSecret(), { expiresIn: TOKEN_TTL });
}

// Sessão aberta só vale enquanto o usuário existe, não está bloqueado, não expirou e não trocou a senha desde a emissão do cookie.
function sessionProblem(row, payload) {
  if (!row) return 'Sessão inválida. Faça login novamente.';
  if (row.blocked) return row.block_reason || 'Acesso bloqueado. Fale com um PRICETAX Master.';
  if (row.expires_at && toISODateSafe(row.expires_at) < new Date().toISOString().slice(0, 10)) return 'Acesso expirado. Fale com um PRICETAX Master para renovar.';
  if (payload && payload.pv && payload.pv !== passwordTag(row.password_hash)) return 'Senha alterada. Faça login novamente.';
  return '';
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function toISODateSafe(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    role: row.role,
    cnpj: row.cnpj,
    allowedCnpjs: row.allowed_cnpjs || [],
    blocked: row.blocked,
    blockReason: row.block_reason,
    expiresAt: toISODateSafe(row.expires_at) || '',
    avatar: row.avatar || '',
    personalOnly: !!row.personal_only,
    orgId: row.org_id || null,
    isSuperAdmin: !!row.is_super_admin,
    xflowRole: row.xflow_role || '',
    companiesAccess: !!row.companies_access,
    allCompaniesAccess: !!row.all_companies_access,
    personalAccess: !!row.personal_access,
    onboardingDone: !!row.onboarding_done_at,
    // CRM (2026-09-20): master/super admin têm acesso de administrador
    // automaticamente; os demais precisam de crm_role; 'cliente' nunca.
    crmRole: row.crm_role || '',
    crmAccess: row.role !== 'cliente' && (row.role === 'master' || !!row.is_super_admin || !!row.crm_role),
  };
}

export { rowToUser };

export async function findUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function findUserByUsername(username) {
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return rows[0] || null;
}

export async function requireAuth(req, res, next) {
  try {
    // Chamada interna da RENATA (§101): mesma identidade e mesmas permissões de quem pediu; só vale por loopback com o segredo do processo.
    const internal = readInternal(req);
    if (internal) {
      const irow = await findUserById(internal.userId);
      if (!irow || irow.blocked || (irow.expires_at && new Date(irow.expires_at) < new Date())) return res.status(403).json({ message: 'Acesso do usuário indisponível.' });
      req.userRow = irow;
      req.user = rowToUser(irow);
      req.renataCommandId = internal.commandId;
      setActor({ id: req.user.id, name: `RENATA (IA, a pedido de ${req.user.name || req.user.username})`, origin: 'RENATA' });
      return next();
    }
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ message: 'Sessão inválida. Faça login novamente.' });
    let payload;
    try {
      payload = jwt.verify(token, requireSecret());
    } catch {
      return res.status(401).json({ message: 'Sessão inválida. Faça login novamente.' });
    }
    const row = await findUserById(payload.sub);
    const problem = sessionProblem(row, payload);
    if (problem) {
      clearAuthCookie(res);
      return res.status(401).json({ message: problem });
    }
    req.userRow = row;
    req.user = rowToUser(row);
    setActor({ id: req.user.id, name: req.user.name || req.user.username, origin: originOf(req) });
    next();
  } catch (e) {
    next(e);
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return next();
    let payload;
    try {
      payload = jwt.verify(token, requireSecret());
    } catch {
      return next();
    }
    const row = await findUserById(payload.sub);
    if (row && !sessionProblem(row, payload)) {
      req.userRow = row;
      req.user = rowToUser(row);
      setActor({ id: req.user.id, name: req.user.name || req.user.username, origin: originOf(req) });
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireMaster(req, res, next) {
  if (!req.user || req.user.role !== 'master') {
    return res.status(403).json({ message: 'Apenas administradores podem fazer isso.' });
  }
  next();
}

export function requireMasterOrPricetax(req, res, next) {
  if (!req.user || (req.user.role !== 'master' && req.user.role !== 'pricetax')) {
    return res.status(403).json({ message: 'Apenas Master ou PRICETAX podem cadastrar empresas.' });
  }
  next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user || !req.user.isSuperAdmin) {
    return res.status(403).json({ message: 'Apenas o Super Administrador pode fazer isso.' });
  }
  next();
}

export function requireXflowAccess(req, res, next) {
  if (!req.user || !req.user.xflowRole) {
    return res.status(403).json({ message: 'Você não tem acesso ao XFlow.' });
  }
  next();
}
