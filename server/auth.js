import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

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

export function signToken(userId) {
  return jwt.sign({ sub: userId }, requireSecret(), { expiresIn: TOKEN_TTL });
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
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ message: 'Sessão inválida. Faça login novamente.' });
    let payload;
    try {
      payload = jwt.verify(token, requireSecret());
    } catch {
      return res.status(401).json({ message: 'Sessão inválida. Faça login novamente.' });
    }
    const row = await findUserById(payload.sub);
    if (!row) return res.status(401).json({ message: 'Sessão inválida. Faça login novamente.' });
    req.userRow = row;
    req.user = rowToUser(row);
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
