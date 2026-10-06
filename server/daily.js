// "Meu dia" (2026-10-05, §77): preferências de conteúdo diário + boas-vindas na primeira entrada. Só o próprio usuário
// lê e grava a sua (data de nascimento incluída, usada apenas para signo e animal chinês).
import { Router } from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { CARDS, SIGNS, loadCard, westernSign, chineseSign, today } from './dailyContent.js';

export const router = Router();

const DEFAULT_PREFS = { enabled: true, cards: [], birthDate: '' };

function readPrefs(row) {
  const p = (row && row.preferences) || {};
  const cards = Object.keys(CARDS).filter((c) => Array.isArray(p.cards) && p.cards.includes(c));
  return { ...DEFAULT_PREFS, enabled: p.enabled !== false, cards, birthDate: typeof p.birthDate === 'string' ? p.birthDate : '' };
}

function validBirth(s) {
  if (s === '' || s == null) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  if (d.getUTCFullYear() < 1900 || d > new Date()) return null;
  return s;
}

function describe(prefs) {
  const w = westernSign(prefs.birthDate);
  const c = chineseSign(prefs.birthDate);
  return { ...prefs, westernSign: w ? w.name : null, chineseSign: c ? `${c.name} de ${c.element}` : null };
}

router.get('/options', requireAuth, (req, res) => {
  res.json({ cards: CARDS, signs: SIGNS.map((s) => s.name) });
});

router.get('/preferences', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT preferences, onboarding_done_at FROM users WHERE id=$1', [req.user.id]);
    res.json({ ...describe(readPrefs(rows[0])), onboardingDone: !!(rows[0] && rows[0].onboarding_done_at) });
  } catch (e) { next(e); }
});

router.put('/preferences', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const cards = [...new Set(Array.isArray(body.cards) ? body.cards : [])];
    if (cards.some((c) => !Object.prototype.hasOwnProperty.call(CARDS, c))) return res.status(400).json({ message: 'Conteúdo desconhecido.' });
    const birth = validBirth(body.birthDate);
    if (birth === null) return res.status(400).json({ message: 'Data de nascimento inválida.' });
    const prefs = { enabled: body.enabled !== false, cards: Object.keys(CARDS).filter((c) => cards.includes(c)), birthDate: birth };
    await pool.query("UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) || $1::jsonb WHERE id=$2", [JSON.stringify(prefs), req.user.id]);
    res.json(describe(prefs));
  } catch (e) { next(e); }
});

router.post('/onboarding-complete', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE users SET onboarding_done_at=COALESCE(onboarding_done_at, now()) WHERE id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const { rows } = await pool.query('SELECT preferences FROM users WHERE id=$1', [req.user.id]);
    const prefs = readPrefs(rows[0]);
    if (!prefs.enabled) return res.json({ enabled: false, cards: [] });
    const day = today();
    const cards = await Promise.all(prefs.cards.map((kind) => loadCard(kind, { day, birthDate: prefs.birthDate })));
    res.json({ enabled: true, day, cards });
  } catch (e) { next(e); }
});
