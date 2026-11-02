// Boas-vindas de lançamento (shared/launchTour.js): POST /api/tours/:id/done grava users.preferences.tours[id] = agora.
// Só a rodada vigente; a tela não tem "pular", então concluir é o único jeito de sair dela.
import { Router } from 'express';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { LAUNCH_TOUR_ID } from '../shared/launchTour.js';

export const router = Router();

router.post('/:id/done', requireAuth, async (req, res, next) => {
  try {
    if (req.params.id !== LAUNCH_TOUR_ID) return res.status(404).json({ message: 'Boas-vindas não encontrada.' });
    await pool.query(
      `UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{tours}',
         COALESCE(preferences->'tours', '{}'::jsonb) || jsonb_build_object($1::text, to_jsonb(now())), true) WHERE id=$2`,
      [LAUNCH_TOUR_ID, req.user.id]);
    res.json({ ok: true, id: LAUNCH_TOUR_ID });
  } catch (e) { next(e); }
});
