// Rotas de conexão com o Google Calendar (2026-08) — cada usuário conecta a
// própria conta pelo botão em "Meu perfil". Ver server/googleCalendar.js
// pro helper de fato e PROJECT_CONTEXT.md §21 pro desenho completo.

import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from './auth.js';
import { forgetMailScope } from './googleMail.js';
import { getAuthUrl, exchangeCodeForTokens, saveConnection, disconnectUser, getConnectionStatus, googleConfigured } from './googleCalendar.js';

export const router = Router();
const STATE_COOKIE = 'g_oauth_state';

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
  // `state` aleatório guardado em cookie: o retorno só vale se vier do mesmo navegador que começou (impede alguém vincular a agenda DELE à conta de outra pessoa).
  // Prefixo do state: 'm' = veio da Caixa de e-mail (pede também o Gmail e volta para /email); 'c' = agenda.
  const mail = req.query.mail === '1';
  const state = (mail ? 'm' : 'c') + crypto.randomBytes(24).toString('hex');
  res.cookie(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/api/google' });
  res.redirect(getAuthUrl(state, { mail }));
});

// O cookie de sessão (SameSite=Lax) sobrevive à ida-e-volta pro domínio do
// Google numa navegação de topo (GET), então req.user já está disponível
// aqui; o `state` (cookie próprio) prova que o retorno é do fluxo que ESTE navegador iniciou.
router.get('/oauth/callback', requireAuth, async (req, res) => {
  const base = process.env.APP_BASE_URL || '';
  try {
    const { code, error, state } = req.query;
    const expected = req.cookies && req.cookies[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/api/google' });
    if (!expected || typeof state !== 'string' || state.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
      return res.redirect(`${base}/#google-calendar-error`);
    }
    if (state[0] === 'm') {
      if (error || !code) return res.redirect(`${base}/email#google-mail-error`);
      await saveConnection(req.user.id, await exchangeCodeForTokens(code));
      forgetMailScope(req.user.id);
      return res.redirect(`${base}/email#google-mail-connected`);
    }
    if (error || !code) return res.redirect(`${base}/#google-calendar-error`);
    const tokens = await exchangeCodeForTokens(code);
    await saveConnection(req.user.id, tokens);
    forgetMailScope(req.user.id);
    res.redirect(`${base}/#google-calendar-connected`);
  } catch (e) {
    console.error('Falha no callback OAuth do Google', e.message);
    res.redirect(`${base}/#google-calendar-error`);
  }
});

router.post('/disconnect', requireAuth, async (req, res, next) => {
  try {
    await disconnectUser(req.user.id);
    forgetMailScope(req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
