// Login da Microsoft (Microsoft 365 / Outlook.com) para a Agenda (§128, 2026-11-02). Mesmo desenho do server/google.js: `state`
// aleatório em cookie próprio (o retorno só vale no navegador que começou) e a conta é gravada como agenda extra da pessoa logada.

import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from './auth.js';
import { microsoftConfigured, msAuthUrl, msExchangeCode, msIdentity } from './microsoftGraph.js';
import { upsertOAuthAccount } from './calendarAccounts.js';

export const router = Router();
const STATE_COOKIE = 'ms_oauth_state';

router.get('/oauth/start', requireAuth, (req, res) => {
  if (!microsoftConfigured()) return res.status(400).send('A conexão com a Microsoft ainda não foi configurada no servidor.');
  const state = `m${crypto.randomBytes(24).toString('hex')}`;
  res.cookie(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/api/microsoft' });
  res.redirect(msAuthUrl(state));
});

router.get('/oauth/callback', requireAuth, async (req, res) => {
  const base = process.env.APP_BASE_URL || '';
  try {
    const { code, error, state } = req.query;
    const expected = req.cookies && req.cookies[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/api/microsoft' });
    if (!expected || typeof state !== 'string' || state.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected))) {
      return res.redirect(`${base}/agenda#agenda-account-error`);
    }
    // Empresa que exige aprovação do administrador volta com AADSTS65001/90094 (consent_required / admin_consent_required).
    if (error) return res.redirect(`${base}/agenda#${/consent/i.test(String(error) + String(req.query.error_description || '')) ? 'agenda-account-admin' : 'agenda-account-error'}`);
    if (!code) return res.redirect(`${base}/agenda#agenda-account-error`);
    const t = await msExchangeCode(code);
    const who = msIdentity(t.id_token);
    await upsertOAuthAccount(req.user.id, {
      provider: 'microsoft', email: who.email, label: who.email,
      secret: { access_token: t.access_token, refresh_token: t.refresh_token, expiry: Date.now() + (Number(t.expires_in) || 3600) * 1000, personal: who.personal },
    });
    res.redirect(`${base}/agenda#agenda-account-connected`);
  } catch (e) {
    console.error('Falha no callback OAuth da Microsoft', String(e.message).slice(0, 200));
    res.redirect(`${base}/agenda#${e.status === 400 && /No máximo/.test(e.message) ? 'agenda-account-limit' : 'agenda-account-error'}`);
  }
});
