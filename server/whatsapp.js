// WhatsApp (Fase 1, 2026-11-02): caixa de conversas do número da PRICETAX pela API oficial da Meta (Cloud API).
// Um número para a equipe inteira (master/pricetax). A Meta avisa por webhook (mensagem recebida, status de entrega,
// eco do celular na coexistência); guardamos a conversa no banco para a equipe ler e responder pelo painel.
// Desligado sem WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET e WHATSAPP_VERIFY_TOKEN.
// Regras puras em server/whatsappCore.js.

import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool, PRICETAX_ORG_SLUG } from './db.js';
import { createNotification } from './notifications.js';
import { verifySignature, parseWebhook, nextStatus, previewOf, windowOpen, windowEndsAt, formatPhone, friendlyGraphError, validateText, attachmentError, sendTypeFor, MAX_MEDIA_BYTES } from './whatsappCore.js';

export const router = Router();
export const publicRouter = Router();

const ENV_KEYS = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'];
const cfg = () => ({
  token: process.env.WHATSAPP_TOKEN || '',
  phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  appSecret: process.env.WHATSAPP_APP_SECRET || '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  version: /^v\d{2}\.\d$/.test(process.env.WHATSAPP_GRAPH_VERSION || '') ? process.env.WHATSAPP_GRAPH_VERSION : 'v24.0',
});
export const whatsappEnabled = () => ENV_KEYS.every((k) => !!process.env[k]);
// Só para teste local (servidor falso da Meta); em produção é sempre a Graph API.
const graphBase = () => (process.env.NODE_ENV !== 'production' && process.env.WHATSAPP_GRAPH_BASE) || 'https://graph.facebook.com';

const uid = (p) => `${p}-${crypto.randomBytes(8).toString('hex')}`;

async function pricetaxOrgId() {
  const { rows } = await pool.query('SELECT id FROM organizations WHERE slug = $1', [PRICETAX_ORG_SLUG]);
  return rows[0] ? rows[0].id : null;
}

async function graph(path, { method = 'GET', json, form } = {}) {
  const c = cfg();
  const res = await fetch(`${graphBase()}/${c.version}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : form,
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(friendlyGraphError(data)); e.graph = data && data.error; e.status = res.status; throw e; }
  return data;
}

// Endereço de download que a Meta devolve para um arquivo: só os servidores dela (validação de SSRF, §16.1).
function mediaUrlAllowed(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  if (process.env.NODE_ENV !== 'production' && process.env.WHATSAPP_GRAPH_BASE && url.origin === new URL(process.env.WHATSAPP_GRAPH_BASE).origin) return true;
  return url.protocol === 'https:' && !url.port && /(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net)$/i.test(url.hostname);
}

async function downloadMedia(messageRowId, media) {
  try {
    const info = await graph(encodeURIComponent(media.id));
    if (!info.url || !mediaUrlAllowed(info.url)) throw new Error('endereço de arquivo inesperado');
    if (Number(info.file_size) > MAX_MEDIA_BYTES) {
      await pool.query(`UPDATE wa_messages SET media = media || '{"tooBig":true}'::jsonb WHERE id = $1`, [messageRowId]);
      return;
    }
    const res = await fetch(info.url, { headers: { Authorization: `Bearer ${cfg().token}` }, redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_MEDIA_BYTES) throw new Error('arquivo grande demais');
    await pool.query(
      `INSERT INTO wa_media (message_id, mime, filename, size, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (message_id) DO NOTHING`,
      [messageRowId, String(info.mime_type || media.mime || ''), media.filename || '', buf.length, buf]
    );
    await pool.query(`UPDATE wa_messages SET media = media || jsonb_build_object('stored', true, 'size', $2::int) WHERE id = $1`, [messageRowId, buf.length]);
  } catch (e) {
    console.error('WhatsApp: não consegui baixar o arquivo', messageRowId, String(e.message).slice(0, 160));
  }
}

async function notifyTeam(orgId, conv, preview) {
  const { rows } = await pool.query(`SELECT id FROM users WHERE org_id = $1 AND role IN ('master','pricetax') AND NOT blocked AND (expires_at IS NULL OR expires_at > now())`, [orgId]);
  const name = conv.profile_name || formatPhone(conv.wa_id);
  for (const u of rows) {
    await createNotification(pool, {
      orgId, userId: u.id, type: 'whatsapp_message', title: `WhatsApp: ${name}`, body: preview,
      actorName: name, target: { kind: 'whatsapp', conversationId: conv.id },
    }).catch((e) => console.error('WhatsApp: aviso não criado', e.message));
  }
}

// Grava o que a Meta mandou. Idempotente: a Meta reenvia o mesmo evento se não recebe 200 a tempo.
export async function ingestEvents(events, orgId) {
  for (const ev of events) {
    if (ev.type === 'status') {
      const { rows } = await pool.query('SELECT id, status FROM wa_messages WHERE wa_message_id = $1', [ev.waMessageId]);
      if (!rows[0]) continue;
      const st = nextStatus(rows[0].status, ev.status);
      if (st !== rows[0].status || ev.error) await pool.query('UPDATE wa_messages SET status = $2, error = CASE WHEN $3 <> \'\' THEN $3 ELSE error END WHERE id = $1', [rows[0].id, st, ev.error || '']);
      continue;
    }
    const preview = previewOf(ev.kind, ev.body);
    const inbound = ev.direction === 'in';
    const client = await pool.connect();
    let conv; let msgId = null; let wasQuiet = false;
    try {
      await client.query('BEGIN');
      const up = await client.query(
        `INSERT INTO wa_conversations (id, org_id, wa_id, profile_name) VALUES ($1,$2,$3,$4)
         ON CONFLICT (org_id, wa_id) DO UPDATE SET profile_name = CASE WHEN EXCLUDED.profile_name <> '' THEN EXCLUDED.profile_name ELSE wa_conversations.profile_name END
         RETURNING *`,
        [uid('wac'), orgId, ev.waId, ev.profileName || '']
      );
      conv = up.rows[0];
      wasQuiet = inbound && (conv.unread === 0 || !!conv.archived_at);
      const ins = await client.query(
        `INSERT INTO wa_messages (id, conversation_id, wa_message_id, direction, kind, body, media, status, via, reply_to, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (wa_message_id) DO NOTHING RETURNING id`,
        [uid('wam'), conv.id, ev.waMessageId, ev.direction, ev.kind, ev.body, ev.media ? JSON.stringify(ev.media) : null, inbound ? 'received' : 'sent', ev.via || '', ev.replyTo || '', ev.createdAt]
      );
      if (ins.rows[0]) {
        msgId = ins.rows[0].id;
        await client.query(
          `UPDATE wa_conversations SET
             last_message_at = GREATEST(COALESCE(last_message_at, $2), $2),
             last_preview = CASE WHEN last_message_at IS NULL OR $2 >= last_message_at THEN $3 ELSE last_preview END,
             last_direction = CASE WHEN last_message_at IS NULL OR $2 >= last_message_at THEN $4 ELSE last_direction END,
             last_inbound_at = CASE WHEN $5 THEN GREATEST(COALESCE(last_inbound_at, $2), $2) ELSE last_inbound_at END,
             unread = CASE WHEN $5 AND $6 <> 'reaction' THEN unread + 1 WHEN NOT $5 THEN 0 ELSE unread END,
             archived_at = CASE WHEN $5 THEN NULL ELSE archived_at END
           WHERE id = $1`,
          [conv.id, ev.createdAt, preview, ev.direction, inbound, ev.kind]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
    if (!msgId) continue;
    if (ev.media && ev.media.id) downloadMedia(msgId, ev.media);
    if (inbound && wasQuiet && ev.kind !== 'reaction') await notifyTeam(orgId, conv, preview);
  }
}

// ---- Webhook (público: quem autentica é a assinatura da Meta) ----

publicRouter.get('/webhook', (req, res) => {
  const c = cfg();
  if (!c.verifyToken) return res.status(404).json({ message: 'WhatsApp não configurado.' });
  const ok = req.query['hub.mode'] === 'subscribe' && typeof req.query['hub.verify_token'] === 'string'
    && req.query['hub.verify_token'].length === c.verifyToken.length
    && crypto.timingSafeEqual(Buffer.from(req.query['hub.verify_token']), Buffer.from(c.verifyToken));
  if (!ok) return res.status(403).json({ message: 'Verificação recusada.' });
  res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
});

publicRouter.post('/webhook', async (req, res) => {
  if (!whatsappEnabled()) return res.status(404).json({ message: 'WhatsApp não configurado.' });
  if (!verifySignature(req.body, req.get('X-Hub-Signature-256'), cfg().appSecret)) return res.status(401).json({ message: 'Assinatura inválida.' });
  let body;
  try { body = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ message: 'JSON inválido.' }); }
  const events = parseWebhook(body, cfg().phoneId);
  try {
    const orgId = await pricetaxOrgId();
    if (orgId && events.length) await ingestEvents(events, orgId);
    res.sendStatus(200);
  } catch (e) {
    console.error('WhatsApp: falha ao gravar o webhook', e.message);
    res.status(500).json({ message: 'Falha ao gravar.' }); // a Meta tenta de novo
  }
});

// ---- Rotas da equipe ----

router.use(requireAuth, requireMasterOrPricetax);

const ID_RE = /^wa[cm]-[a-f0-9]{16}$/;

function convOut(r) {
  return {
    id: r.id, waId: r.wa_id, phone: formatPhone(r.wa_id), name: r.profile_name || '', lastMessageAt: r.last_message_at,
    lastPreview: r.last_preview, lastDirection: r.last_direction, unread: r.unread, archived: !!r.archived_at,
    windowOpen: windowOpen(r.last_inbound_at), windowEndsAt: windowEndsAt(r.last_inbound_at),
  };
}

function msgOut(r) {
  const m = r.media || null;
  return {
    id: r.id, direction: r.direction, kind: r.kind, body: r.body, status: r.status, error: r.error, via: r.via,
    sentByName: r.sent_by_name, replyTo: r.reply_to, createdAt: r.created_at,
    media: m ? { mime: m.mime || '', filename: m.filename || '', voice: !!m.voice, stored: !!m.stored, tooBig: !!m.tooBig, size: m.size || 0 } : null,
  };
}

async function loadConv(req, res) {
  if (!ID_RE.test(req.params.id || '')) { res.status(400).json({ message: 'Conversa inválida.' }); return null; }
  const { rows } = await pool.query('SELECT * FROM wa_conversations WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!rows[0]) { res.status(404).json({ message: 'Conversa não encontrada.' }); return null; }
  return rows[0];
}

router.get('/status', (req, res) => {
  const enabled = whatsappEnabled();
  res.json({ enabled, phone: enabled ? process.env.WHATSAPP_DISPLAY_PHONE || '' : '', missing: req.user.role === 'master' ? ENV_KEYS.filter((k) => !process.env[k]) : [] });
});

router.get('/conversations', async (req, res, next) => {
  try {
    const archived = req.query.archived === '1';
    const q = String(req.query.q || '').trim().slice(0, 80);
    const params = [req.user.orgId];
    let where = `org_id = $1 AND archived_at IS ${archived ? 'NOT ' : ''}NULL AND last_message_at IS NOT NULL`;
    if (q) {
      params.push(`%${q.toLowerCase()}%`, `%${q.replace(/\D/g, '') || '§'}%`);
      where += ` AND (lower(profile_name) LIKE $2 OR wa_id LIKE $3)`;
    }
    const { rows } = await pool.query(`SELECT * FROM wa_conversations WHERE ${where} ORDER BY last_message_at DESC LIMIT 200`, params);
    const unread = await pool.query('SELECT COALESCE(SUM(unread),0)::int AS n FROM wa_conversations WHERE org_id = $1 AND archived_at IS NULL', [req.user.orgId]);
    res.json({ conversations: rows.map(convOut), unreadTotal: unread.rows[0].n });
  } catch (e) { next(e); }
});

router.get('/conversations/:id', async (req, res, next) => {
  try {
    const conv = await loadConv(req, res); if (!conv) return;
    const { rows } = await pool.query(
      `SELECT * FROM (SELECT * FROM wa_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 300) t ORDER BY created_at`,
      [conv.id]
    );
    res.json({ conversation: convOut(conv), messages: rows.map(msgOut) });
  } catch (e) { next(e); }
});

// Marca como lida no painel e manda a confirmação de leitura (os dois tiques azuis) da última mensagem do cliente.
router.post('/conversations/:id/read', async (req, res, next) => {
  try {
    const conv = await loadConv(req, res); if (!conv) return;
    await pool.query('UPDATE wa_conversations SET unread = 0 WHERE id = $1', [conv.id]);
    if (conv.unread > 0 && whatsappEnabled()) {
      const { rows } = await pool.query(`SELECT wa_message_id FROM wa_messages WHERE conversation_id = $1 AND direction = 'in' ORDER BY created_at DESC LIMIT 1`, [conv.id]);
      if (rows[0]) graph(`${cfg().phoneId}/messages`, { method: 'POST', json: { messaging_product: 'whatsapp', status: 'read', message_id: rows[0].wa_message_id } })
        .catch((e) => console.error('WhatsApp: confirmação de leitura falhou', e.message));
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/conversations/:id/archive', async (req, res, next) => {
  try {
    const conv = await loadConv(req, res); if (!conv) return;
    const on = req.body.archived !== false;
    await pool.query(`UPDATE wa_conversations SET archived_at = ${on ? 'now()' : 'NULL'}, unread = ${on ? '0' : 'unread'} WHERE id = $1`, [conv.id]);
    res.json({ ok: true, archived: on });
  } catch (e) { next(e); }
});

async function recordOutgoing(conv, user, { waMessageId, kind, body, media }) {
  const id = uid('wam');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO wa_messages (id, conversation_id, wa_message_id, direction, kind, body, media, status, via, sent_by, sent_by_name, created_at)
     VALUES ($1,$2,$3,'out',$4,$5,$6,'sent','painel',$7,$8,$9)`,
    [id, conv.id, waMessageId, kind, body, media ? JSON.stringify(media) : null, user.id, user.name || user.username || '', now]
  );
  await pool.query(`UPDATE wa_conversations SET last_message_at = $2, last_preview = $3, last_direction = 'out', unread = 0 WHERE id = $1`, [conv.id, now, previewOf(kind, body)]);
  return id;
}

router.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    if (!whatsappEnabled()) return res.status(503).json({ message: 'O WhatsApp ainda não foi ligado ao painel.' });
    const conv = await loadConv(req, res); if (!conv) return;
    if (!windowOpen(conv.last_inbound_at)) return res.status(409).json({ message: 'Passaram mais de 24 horas desde a última mensagem do cliente. Agora só é possível enviar um modelo aprovado pela Meta (Fase 3).', code: 'window_closed' });
    const att = req.body.attachment;
    const text = String(req.body.text || '').trim();
    if (!att) {
      const err = validateText(text);
      if (err) return res.status(400).json({ message: err });
      const data = await graph(`${cfg().phoneId}/messages`, { method: 'POST', json: { messaging_product: 'whatsapp', recipient_type: 'individual', to: conv.wa_id, type: 'text', text: { body: text, preview_url: false } } });
      const id = await recordOutgoing(conv, req.user, { waMessageId: data.messages && data.messages[0] && data.messages[0].id, kind: 'text', body: text });
      return res.json({ ok: true, id });
    }
    const filename = String(att.filename || '').replace(/[\\/\r\n"]/g, '_').slice(0, 120);
    const buf = Buffer.from(String(att.data || ''), 'base64');
    const err = attachmentError(filename, buf.length) || (text.length > 1024 ? 'A legenda do arquivo passa de 1.024 caracteres.' : '');
    if (err) return res.status(400).json({ message: err });
    const t = sendTypeFor(filename);
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', t.mime);
    form.append('file', new Blob([buf], { type: t.mime }), filename);
    const up = await graph(`${cfg().phoneId}/media`, { method: 'POST', form });
    const payload = t.kind === 'image' ? { id: up.id, ...(text ? { caption: text } : {}) } : { id: up.id, filename, ...(text ? { caption: text } : {}) };
    const data = await graph(`${cfg().phoneId}/messages`, { method: 'POST', json: { messaging_product: 'whatsapp', recipient_type: 'individual', to: conv.wa_id, type: t.kind, [t.kind]: payload } });
    const id = await recordOutgoing(conv, req.user, { waMessageId: data.messages && data.messages[0] && data.messages[0].id, kind: t.kind, body: text, media: { id: up.id, mime: t.mime, filename, stored: true, size: buf.length } });
    await pool.query('INSERT INTO wa_media (message_id, mime, filename, size, data) VALUES ($1,$2,$3,$4,$5)', [id, t.mime, filename, buf.length, buf]);
    res.json({ ok: true, id });
  } catch (e) {
    if (e.graph) { console.error('WhatsApp: envio recusado', e.status, JSON.stringify(e.graph).slice(0, 300)); return res.status(502).json({ message: e.message }); }
    next(e);
  }
});

const INLINE_OK = /^(image\/(jpeg|png|webp)|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp))$/;
router.get('/media/:id', async (req, res, next) => {
  try {
    if (!ID_RE.test(req.params.id || '')) return res.status(400).json({ message: 'Arquivo inválido.' });
    const { rows } = await pool.query(
      `SELECT md.mime, md.filename, md.data FROM wa_media md JOIN wa_messages m ON m.id = md.message_id JOIN wa_conversations c ON c.id = m.conversation_id
       WHERE md.message_id = $1 AND c.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Arquivo ainda não baixado ou indisponível.' });
    const mime = String(rows[0].mime || '').split(';')[0].trim().toLowerCase();
    const inline = INLINE_OK.test(mime) && req.query.download !== '1';
    const name = (rows[0].filename || `arquivo-whatsapp.${(mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '')}`).replace(/["\r\n]/g, '_');
    res.set('Content-Type', inline ? mime : 'application/octet-stream');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, max-age=86400');
    res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(rows[0].data);
  } catch (e) { next(e); }
});
