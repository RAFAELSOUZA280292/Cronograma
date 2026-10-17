// Notificações push (2026-10-17). O sino já existia (tabela `notifications`); aqui cada notificação nova também vira um aviso no celular/computador de
// quem ativou, mesmo com o app fechado. Protocolo Web Push (VAPID) via `web-push`; o navegador entrega pelo serviço do próprio fabricante.
// Regras importantes (leia antes de mudar):
//  • Só funciona com as 3 variáveis de ambiente VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e (opcional) VAPID_SUBJECT. Sem elas, tudo aqui fica desligado e o app
//    segue igual — o sino não depende disto.
//  • O servidor faz uma requisição HTTP para o `endpoint` que o navegador informa: por isso só aceitamos endereços https dos serviços de push conhecidos
//    (FCM, Mozilla, Apple, Windows). Sem essa lista, um usuário logado poderia apontar o servidor para um endereço interno (SSRF).
//  • O aviso respeita as categorias que a pessoa silenciou no sino e só sai se a notificação ainda não foi lida.
//  • O texto do aviso aparece na tela bloqueada: é o mesmo título/corpo do sino.
//  • Falha definitiva do serviço (404/410: aparelho desinstalou ou revogou) apaga a inscrição.
import express from 'express';
import webpush from 'web-push';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { NOTIFICATION_CATEGORIES, readMuted } from './notificationPrefs.js';

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'https://painel.pricetax.com.br';
const CONFIGURED = !!(PUBLIC_KEY && PRIVATE_KEY);
if (CONFIGURED) {
  try { webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY); } catch (e) { console.error('push: chaves VAPID inválidas —', e.message); }
}

export const pushEnabled = () => CONFIGURED;

// Serviços de push conhecidos. PUSH_EXTRA_HOSTS (lista separada por vírgula) existe só para teste local com um servidor falso.
const HOST_RULES = [
  /^fcm\.googleapis\.com$/i,
  /^updates\.push\.services\.mozilla\.com$/i,
  /^[a-z0-9.-]*\.push\.services\.mozilla\.com$/i,
  /^[a-z0-9.-]*\.push\.apple\.com$/i,
  /^[a-z0-9.-]*\.notify\.windows\.com$/i,
];
export function endpointAllowed(endpoint) {
  let u;
  try { u = new URL(String(endpoint || '')); } catch { return false; }
  const extra = (process.env.PUSH_EXTRA_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (extra.includes(u.host)) return true;
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  return HOST_RULES.some((r) => r.test(u.hostname));
}

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 10); }

// Para onde o toque no aviso leva (o módulo certo; o app não abre o item exato por endereço).
export function urlForNotification(type, target) {
  const t = String(type || '');
  if (t.startsWith('xflow_')) return '/xflow';
  if (t.startsWith('crm_')) return '/crm';
  if (t.startsWith('parecer_')) return '/pareceres';
  if (t.startsWith('modelo_')) return '/modelos';
  if (t.startsWith('personal_')) return '/gestao-atividades';
  if (t.startsWith('activity_') || t.startsWith('todo_')) return '/empresas';
  void target;
  return '/';
}

export function isMutedType(type, muted) {
  const t = String(type || '');
  return NOTIFICATION_CATEGORIES.some((c) => muted.includes(c.key) && c.prefixes.some((p) => t.startsWith(p)));
}

function clip(s, n) { const x = String(s || ''); return x.length > n ? x.slice(0, n - 1) + '…' : x; }

async function sendTo(sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24, urgency: 'normal', timeout: 10000 },
    );
    await pool.query('UPDATE push_subscriptions SET last_ok_at=now(), last_error=\'\' WHERE id=$1', [sub.id]);
    return { ok: true };
  } catch (e) {
    const status = e && e.statusCode;
    if (status === 404 || status === 410) {
      await pool.query('DELETE FROM push_subscriptions WHERE id=$1', [sub.id]).catch(() => {});
      return { ok: false, gone: true, status };
    }
    await pool.query('UPDATE push_subscriptions SET last_error=$2 WHERE id=$1', [sub.id, clip(`${status || ''} ${e && e.message}`, 300)]).catch(() => {});
    return { ok: false, status, error: e && e.message };
  }
}

export async function sendToUser(userId, payload) {
  if (!CONFIGURED) return { sent: 0, failed: 0, gone: 0 };
  const { rows } = await pool.query('SELECT * FROM push_subscriptions WHERE user_id=$1', [userId]);
  let sent = 0; let failed = 0; let gone = 0;
  for (const sub of rows) {
    const r = await sendTo(sub, payload);
    if (r.ok) sent += 1; else if (r.gone) gone += 1; else failed += 1;
  }
  return { sent, failed, gone };
}

// Chamado por createNotification (server/notifications.js) logo depois do INSERT. Espera 1,5 s e confere no banco: se quem chamou estava numa
// transação que foi desfeita, a notificação não existe mais e nada é enviado. Nunca lança.
export function schedulePushForNotification(id) {
  if (!CONFIGURED || !id) return;
  setTimeout(() => { deliverNotificationPush(id).catch((e) => console.error('push:', e.message)); }, 1500);
}

export async function deliverNotificationPush(id) {
  const { rows } = await pool.query(
    `SELECT n.id, n.type, n.title, n.body, n.target, n.read, u.preferences, u.blocked
       FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.id=$1`, [id]);
  const n = rows[0];
  if (!n || n.read || n.blocked) return { skipped: true };
  if (isMutedType(n.type, readMuted(n.preferences))) return { skipped: true };
  const userId = (await pool.query('SELECT user_id FROM notifications WHERE id=$1', [id])).rows[0].user_id;
  return sendToUser(userId, { title: clip(n.title, 80), body: clip(n.body, 160), url: urlForNotification(n.type, n.target), tag: n.id });
}

// ---------- rotas ----------
export const router = express.Router();
const lastTest = new Map();

router.get('/config', requireAuth, (req, res) => {
  res.json({ enabled: CONFIGURED, publicKey: CONFIGURED ? PUBLIC_KEY : '' });
});

router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT endpoint FROM push_subscriptions WHERE user_id=$1', [req.user.id]);
    res.json({ enabled: CONFIGURED, endpoints: rows.map((r) => r.endpoint) });
  } catch (e) { next(e); }
});

router.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    if (!CONFIGURED) return res.status(503).json({ message: 'Notificações no celular ainda não estão ativadas no servidor.' });
    const b = req.body || {};
    const endpoint = String(b.endpoint || '');
    const p256dh = String(b.keys && b.keys.p256dh || '');
    const auth = String(b.keys && b.keys.auth || '');
    if (!endpoint || endpoint.length > 1000 || !p256dh || p256dh.length > 200 || !auth || auth.length > 100) return res.status(400).json({ message: 'Inscrição inválida.' });
    if (!endpointAllowed(endpoint)) return res.status(400).json({ message: 'Este navegador usa um serviço de notificação que o sistema não aceita.' });
    const ua = clip(req.headers['user-agent'] || '', 200);
    await pool.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, ua)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, ua=EXCLUDED.ua, last_error=''`,
      [uid('psub'), req.user.id, endpoint, p256dh, auth, ua]);
    // no máximo 10 aparelhos por pessoa: os mais antigos saem
    await pool.query(
      `DELETE FROM push_subscriptions WHERE user_id=$1 AND id NOT IN (SELECT id FROM push_subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10)`,
      [req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    const endpoint = String(req.body && req.body.endpoint || '');
    if (!endpoint) return res.status(400).json({ message: 'Informe o aparelho.' });
    await pool.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2', [req.user.id, endpoint]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/test', requireAuth, async (req, res, next) => {
  try {
    if (!CONFIGURED) return res.status(503).json({ message: 'Notificações no celular ainda não estão ativadas no servidor.' });
    const now = Date.now();
    if (now - (lastTest.get(req.user.id) || 0) < 8000) return res.status(429).json({ message: 'Aguarde alguns segundos para enviar outro teste.' });
    lastTest.set(req.user.id, now);
    const r = await sendToUser(req.user.id, { title: 'PRICETAX', body: 'Teste: as notificações neste aparelho estão funcionando.', url: '/', tag: 'push-test' });
    if (!r.sent) return res.status(502).json({ message: r.gone ? 'Este aparelho não está mais inscrito. Ative as notificações de novo.' : 'Nenhum aparelho recebeu o teste. Confira se as notificações estão ativas neste aparelho.', ...r });
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});
