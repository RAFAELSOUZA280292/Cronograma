// Rotas de conexão com o Google Calendar (2026-08) — cada usuário conecta a
// própria conta pelo botão em "Meu perfil". Ver server/googleCalendar.js
// pro helper de fato e PROJECT_CONTEXT.md §21 pro desenho completo.

import { Router } from 'express';
import { requireAuth } from './auth.js';
import { getAuthUrl, exchangeCodeForTokens, saveConnection, disconnectUser, getConnectionStatus, googleConfigured } from './googleCalendar.js';

export const router = Router();

router.get('/status', requireAuth, async (req, res, next) => {
  try {
    if (!googleConfigured()) return res.json({ connected: false, connectedAt: null, configured: false });
    const status = await getConnectionStatus(req.user.id);
    res.json({ ...status, configured: true });
  } catch (e) { next(e); }
});

// GET (não POST) de propósito — é pra ser um redirect direto de
// window.location.href, não uma chamada fetch().
router.get('/oauth/start', requireAuth, (req, res) => {
  if (!googleConfigured()) return res.status(400).send('Integração com Google Calendar não configurada no servidor.');
  res.redirect(getAuthUrl());
});

// O cookie de sessão (SameSite=Lax) sobrevive à ida-e-volta pro domínio do
// Google numa navegação de topo (GET), então req.user já está disponível
// aqui igual em qualquer outra rota autenticada — não precisa de `state`
// carregando o id do usuário.
router.get('/oauth/callback', requireAuth, async (req, res) => {
  const base = process.env.APP_BASE_URL || '';
  try {
    const { code, error } = req.query;
    if (error || !code) return res.redirect(`${base}/#google-calendar-error`);
    const tokens = await exchangeCodeForTokens(code);
    await saveConnection(req.user.id, tokens);
    res.redirect(`${base}/#google-calendar-connected`);
  } catch (e) {
    console.error('Falha no callback OAuth do Google', e.message);
    res.redirect(`${base}/#google-calendar-error`);
  }
});

router.post('/disconnect', requireAuth, async (req, res, next) => {
  try {
    await disconnectUser(req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
