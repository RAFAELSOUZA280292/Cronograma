// Tela inicial personalizável e barra de favoritos (2026-11-02, §126): GET/PUT /api/home-prefs. Cada pessoa lê e grava só a
// sua, em users.preferences.home (mesmo padrão de personalExtras/notificações: JSONB por usuário, sem tabela nova). A validação
// é a de shared/homeLayout.js, a mesma que a tela usa.
import { Router } from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { readHome, buildHomePatch } from '../shared/homeLayout.js';

export const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT preferences FROM users WHERE id=$1', [req.user.id]);
    res.json(readHome(rows[0] && rows[0].preferences));
  } catch (e) { next(e); }
});

// Grava só as chaves enviadas (layout, spaces, favorites); as outras ficam como estão.
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const { patch, error } = buildHomePatch(req.body);
    if (error) return res.status(400).json({ message: error });
    const { rows } = await pool.query(
      `UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{home}',
         COALESCE(preferences->'home', '{}'::jsonb) || $1::jsonb, true) WHERE id=$2 RETURNING preferences`,
      [JSON.stringify(patch), req.user.id]
    );
    res.json(readHome(rows[0] && rows[0].preferences));
  } catch (e) { next(e); }
});
