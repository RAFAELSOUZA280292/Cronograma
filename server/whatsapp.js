// WhatsApp (Fase 1, 2026-11-02): conversas do WhatsApp no painel pela API oficial da Meta (Cloud API).
// Cada número é uma CAIXA (decisão do Rafael, 2026-11-02):
//   - compartilhada: número profissional (ex.: "Comercial" da Eduarda); só os MEMBROS escolhidos veem e respondem;
//   - pessoal: número pessoal de um sócio em coexistência com o app do celular; só o DONO vê, nunca outra pessoa (nem o master),
//     e nada é guardado até o próprio dono clicar em "Autorizo" no painel. Desautorizar apaga o que foi guardado.
// A Meta avisa por webhook (mensagem recebida, status de entrega, eco do celular); o conteúdo vai cifrado para o banco (secretBox).
// Liga com WHATSAPP_APP_SECRET e WHATSAPP_VERIFY_TOKEN (um app da Meta); cada caixa guarda o próprio identificador do número e a chave
// de acesso (cifrada), cadastrados pelo master em "Configurar caixas". Regras puras em server/whatsappCore.js.

import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { pool } from './db.js';
import { createNotification } from './notifications.js';
import { seal, open, sealBytes, openBytes } from './secretBox.js';
import { verifySignature, parseWebhook, nextStatus, previewOf, windowOpen, windowEndsAt, formatPhone, friendlyGraphError, validateText, attachmentError, sendTypeFor, MAX_MEDIA_BYTES } from './whatsappCore.js';

export const router = Router();
export const publicRouter = Router();

const ENV_KEYS = ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'];
const cfg = () => ({
  appSecret: process.env.WHATSAPP_APP_SECRET || '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  version: /^v\d{2}\.\d$/.test(process.env.WHATSAPP_GRAPH_VERSION || '') ? process.env.WHATSAPP_GRAPH_VERSION : 'v24.0',
});
export const whatsappEnabled = () => ENV_KEYS.every((k) => !!process.env[k]);
// Só para teste local (servidor falso da Meta); em produção é sempre a Graph API.
const graphBase = () => (process.env.NODE_ENV !== 'production' && process.env.WHATSAPP_GRAPH_BASE) || 'https://graph.facebook.com';

const uid = (p) => `${p}-${crypto.randomBytes(8).toString('hex')}`;
const ID_RE = /^wa[cmi]-[a-f0-9]{16}$/;
const PHONE_ID_RE = /^\d{6,25}$/;
const plain = (v) => { const t = open(v); return t === null ? '[conteúdo ilegível: a chave de cifra do servidor mudou]' : t || ''; };

async function graph(inbox, path, { method = 'GET', json, form } = {}) {
  const token = open(inbox.token_enc);
  if (!token) { const e = new Error('Esta caixa está sem a chave de acesso da Meta. Avise o administrador.'); e.graph = { code: 190 }; e.status = 409; throw e; }
  const res = await fetch(`${graphBase()}/${cfg().version}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
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

async function downloadMedia(inbox, messageRowId, media) {
  try {
    const info = await graph(inbox, encodeURIComponent(media.id));
    if (!info.url || !mediaUrlAllowed(info.url)) throw new Error('endereço de arquivo inesperado');
    if (Number(info.file_size) > MAX_MEDIA_BYTES) {
      await pool.query(`UPDATE wa_messages SET media = media || '{"tooBig":true}'::jsonb WHERE id = $1`, [messageRowId]);
      return;
    }
    const res = await fetch(info.url, { headers: { Authorization: `Bearer ${open(inbox.token_enc)}` }, redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_MEDIA_BYTES) throw new Error('arquivo grande demais');
    await pool.query(
      `INSERT INTO wa_media (message_id, mime, filename, size, data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (message_id) DO NOTHING`,
      [messageRowId, String(info.mime_type || media.mime || ''), media.filename || '', buf.length, sealBytes(buf)]
    );
    await pool.query(`UPDATE wa_messages SET media = media || jsonb_build_object('stored', true, 'size', $2::int) WHERE id = $1`, [messageRowId, buf.length]);
  } catch (e) {
    console.error('WhatsApp: não consegui baixar o arquivo', messageRowId, String(e.message).slice(0, 160));
  }
}

// Só caixa compartilhada avisa (os membros). A pessoal não: o app do celular do dono já avisa, e o texto não sai da caixa dele.
async function notifyMembers(inbox, conv, name, preview) {
  if (inbox.kind !== 'shared') return;
  const { rows } = await pool.query(
    `SELECT u.id FROM wa_inbox_members m JOIN users u ON u.id = m.user_id
     WHERE m.inbox_id = $1 AND NOT u.blocked AND (u.expires_at IS NULL OR u.expires_at > now())`,
    [inbox.id]
  );
  for (const u of rows) {
    await createNotification(pool, {
      orgId: inbox.org_id, userId: u.id, type: 'whatsapp_message', title: `WhatsApp ${inbox.name}: ${name}`, body: preview,
      actorName: name, target: { kind: 'whatsapp', conversationId: conv.id, inboxId: inbox.id },
    }).catch((e) => console.error('WhatsApp: aviso não criado', e.message));
  }
}

// Caixa pessoal só recebe depois que o dono autorizou; caixa desligada não recebe nada.
const accepting = (inbox) => inbox.active && (inbox.kind === 'shared' || !!inbox.authorized_at);

// Grava o que a Meta mandou. Idempotente: a Meta reenvia o mesmo evento se não recebe 200 a tempo.
export async function ingestEvents(events, inboxesByPhone) {
  for (const ev of events) {
    const inbox = inboxesByPhone.get(ev.phoneNumberId);
    if (!inbox || !accepting(inbox)) continue;
    if (ev.type === 'status') {
      const { rows } = await pool.query(
        `SELECT m.id, m.status FROM wa_messages m JOIN wa_conversations c ON c.id = m.conversation_id WHERE m.wa_message_id = $1 AND c.inbox_id = $2`,
        [ev.waMessageId, inbox.id]
      );
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
        `INSERT INTO wa_conversations (id, org_id, inbox_id, wa_id, profile_name) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (inbox_id, wa_id) DO UPDATE SET profile_name = CASE WHEN EXCLUDED.profile_name <> '' THEN EXCLUDED.profile_name ELSE wa_conversations.profile_name END
         RETURNING *`,
        [uid('wac'), inbox.org_id, inbox.id, ev.waId, seal(ev.profileName || '')]
      );
      conv = up.rows[0];
      wasQuiet = inbound && (conv.unread === 0 || !!conv.archived_at);
      const ins = await client.query(
        `INSERT INTO wa_messages (id, conversation_id, wa_message_id, direction, kind, body, media, status, via, reply_to, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (wa_message_id) DO NOTHING RETURNING id`,
        [uid('wam'), conv.id, ev.waMessageId, ev.direction, ev.kind, seal(ev.body), ev.media ? JSON.stringify(ev.media) : null, inbound ? 'received' : 'sent', ev.via || '', ev.replyTo || '', ev.createdAt]
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
          [conv.id, ev.createdAt, seal(preview), ev.direction, inbound, ev.kind]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
    if (!msgId) continue;
    if (ev.media && ev.media.id) downloadMedia(inbox, msgId, ev.media);
    if (inbound && wasQuiet && ev.kind !== 'reaction') await notifyMembers(inbox, conv, ev.profileName || plain(conv.profile_name) || formatPhone(ev.waId), preview);
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
  try {
    const all = parseWebhook(body);
    const ids = [...new Set(all.map((e) => e.phoneNumberId))];
    if (ids.length) {
      const { rows } = await pool.query('SELECT * FROM wa_inboxes WHERE phone_number_id = ANY($1)', [ids]);
      if (rows.length) await ingestEvents(all, new Map(rows.map((r) => [r.phone_number_id, r])));
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('WhatsApp: falha ao gravar o webhook', e.message);
    res.status(500).json({ message: 'Falha ao gravar.' }); // a Meta tenta de novo
  }
});

// ---- Rotas da equipe ----

router.use(requireAuth, requireMasterOrPricetax);

// Caixas que a pessoa pode LER: a pessoal só pelo dono; a compartilhada só pelos membros. Ser master não dá leitura.
async function readableInboxes(user) {
  const { rows } = await pool.query(
    `SELECT i.* FROM wa_inboxes i
     WHERE i.org_id = $1 AND i.active
       AND ((i.kind = 'personal' AND i.owner_id = $2)
         OR (i.kind = 'shared' AND EXISTS (SELECT 1 FROM wa_inbox_members m WHERE m.inbox_id = i.id AND m.user_id = $2)))
     ORDER BY (i.kind = 'personal') DESC, i.name`,
    [user.orgId, user.id]
  );
  return rows;
}

async function loadInbox(req, res, id) {
  if (!ID_RE.test(id || '')) { res.status(400).json({ message: 'Caixa inválida.' }); return null; }
  const inbox = (await readableInboxes(req.user)).find((i) => i.id === id);
  if (!inbox) { res.status(404).json({ message: 'Caixa não encontrada ou sem acesso.' }); return null; }
  return inbox;
}

async function loadConv(req, res) {
  if (!ID_RE.test(req.params.id || '')) { res.status(400).json({ message: 'Conversa inválida.' }); return null; }
  const { rows } = await pool.query('SELECT * FROM wa_conversations WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  const conv = rows[0];
  const inbox = conv && (await readableInboxes(req.user)).find((i) => i.id === conv.inbox_id);
  if (!conv || !inbox) { res.status(404).json({ message: 'Conversa não encontrada.' }); return null; }
  return { conv, inbox };
}

function convOut(r) {
  return {
    id: r.id, inboxId: r.inbox_id, waId: r.wa_id, phone: formatPhone(r.wa_id), name: plain(r.profile_name), lastMessageAt: r.last_message_at,
    lastPreview: plain(r.last_preview), lastDirection: r.last_direction, unread: r.unread, archived: !!r.archived_at,
    windowOpen: windowOpen(r.last_inbound_at), windowEndsAt: windowEndsAt(r.last_inbound_at),
  };
}

function msgOut(r) {
  const m = r.media || null;
  return {
    id: r.id, direction: r.direction, kind: r.kind, body: plain(r.body), status: r.status, error: r.error, via: r.via,
    sentByName: r.sent_by_name, replyTo: r.reply_to, createdAt: r.created_at,
    media: m ? { mime: m.mime || '', filename: m.filename || '', voice: !!m.voice, stored: !!m.stored, tooBig: !!m.tooBig, size: m.size || 0 } : null,
  };
}

router.get('/status', async (req, res, next) => {
  try {
    const inboxes = await readableInboxes(req.user);
    const unread = inboxes.length ? (await pool.query(
      `SELECT inbox_id, COALESCE(SUM(unread),0)::int AS n FROM wa_conversations WHERE inbox_id = ANY($1) AND archived_at IS NULL GROUP BY inbox_id`,
      [inboxes.map((i) => i.id)]
    )).rows : [];
    const by = Object.fromEntries(unread.map((u) => [u.inbox_id, u.n]));
    res.json({
      enabled: whatsappEnabled(),
      isMaster: req.user.role === 'master',
      missing: req.user.role === 'master' ? ENV_KEYS.filter((k) => !process.env[k]) : [],
      inboxes: inboxes.map((i) => ({
        id: i.id, name: i.name, kind: i.kind, displayPhone: i.display_phone, unread: by[i.id] || 0,
        authorized: i.kind === 'shared' || !!i.authorized_at, ready: !!i.token_enc,
      })),
    });
  } catch (e) { next(e); }
});

router.get('/conversations', async (req, res, next) => {
  try {
    const inbox = await loadInbox(req, res, String(req.query.inbox || '')); if (!inbox) return;
    const archived = req.query.archived === '1';
    const { rows } = await pool.query(
      `SELECT * FROM wa_conversations WHERE inbox_id = $1 AND archived_at IS ${archived ? 'NOT ' : ''}NULL AND last_message_at IS NOT NULL
       ORDER BY last_message_at DESC LIMIT 500`,
      [inbox.id]
    );
    // Nome e prévia ficam cifrados no banco: a busca é feita aqui, depois de abrir.
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 80);
    const digits = q.replace(/\D/g, '');
    let list = rows.map(convOut);
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || (digits && c.waId.includes(digits)));
    res.json({ conversations: list.slice(0, 200) });
  } catch (e) { next(e); }
});

router.get('/conversations/:id', async (req, res, next) => {
  try {
    const found = await loadConv(req, res); if (!found) return;
    const { rows } = await pool.query(
      `SELECT * FROM (SELECT * FROM wa_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 300) t ORDER BY created_at`,
      [found.conv.id]
    );
    res.json({ conversation: convOut(found.conv), messages: rows.map(msgOut) });
  } catch (e) { next(e); }
});

// Marca como lida no painel e manda a confirmação de leitura (os dois tiques azuis) da última mensagem do cliente.
router.post('/conversations/:id/read', async (req, res, next) => {
  try {
    const found = await loadConv(req, res); if (!found) return;
    const { conv, inbox } = found;
    await pool.query('UPDATE wa_conversations SET unread = 0 WHERE id = $1', [conv.id]);
    await pool.query(`UPDATE notifications SET read = true WHERE user_id = $1 AND type = 'whatsapp_message' AND target->>'conversationId' = $2`, [req.user.id, conv.id]).catch(() => {});
    if (conv.unread > 0 && whatsappEnabled()) {
      const { rows } = await pool.query(`SELECT wa_message_id FROM wa_messages WHERE conversation_id = $1 AND direction = 'in' ORDER BY created_at DESC LIMIT 1`, [conv.id]);
      if (rows[0]) graph(inbox, `${inbox.phone_number_id}/messages`, { method: 'POST', json: { messaging_product: 'whatsapp', status: 'read', message_id: rows[0].wa_message_id } })
        .catch((e) => console.error('WhatsApp: confirmação de leitura falhou', e.message));
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/conversations/:id/archive', async (req, res, next) => {
  try {
    const found = await loadConv(req, res); if (!found) return;
    const on = req.body.archived !== false;
    await pool.query(`UPDATE wa_conversations SET archived_at = ${on ? 'now()' : 'NULL'}, unread = ${on ? '0' : 'unread'} WHERE id = $1`, [found.conv.id]);
    res.json({ ok: true, archived: on });
  } catch (e) { next(e); }
});

async function recordOutgoing(conv, user, { waMessageId, kind, body, media }) {
  const id = uid('wam');
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO wa_messages (id, conversation_id, wa_message_id, direction, kind, body, media, status, via, sent_by, sent_by_name, created_at)
     VALUES ($1,$2,$3,'out',$4,$5,$6,'sent','painel',$7,$8,$9)`,
    [id, conv.id, waMessageId, kind, seal(body), media ? JSON.stringify(media) : null, user.id, user.name || user.username || '', now]
  );
  await pool.query(`UPDATE wa_conversations SET last_message_at = $2, last_preview = $3, last_direction = 'out', unread = 0 WHERE id = $1`, [conv.id, now, seal(previewOf(kind, body))]);
  return id;
}

router.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    if (!whatsappEnabled()) return res.status(503).json({ message: 'O WhatsApp ainda não foi ligado ao painel.' });
    const found = await loadConv(req, res); if (!found) return;
    const { conv, inbox } = found;
    if (!windowOpen(conv.last_inbound_at)) return res.status(409).json({ message: 'Passaram mais de 24 horas desde a última mensagem do cliente. Agora só é possível enviar um modelo aprovado pela Meta (Fase 3).', code: 'window_closed' });
    const att = req.body.attachment;
    const text = String(req.body.text || '').trim();
    const to = conv.wa_id;
    if (!att) {
      const err = validateText(text);
      if (err) return res.status(400).json({ message: err });
      const data = await graph(inbox, `${inbox.phone_number_id}/messages`, { method: 'POST', json: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text, preview_url: false } } });
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
    const up = await graph(inbox, `${inbox.phone_number_id}/media`, { method: 'POST', form });
    const payload = t.kind === 'image' ? { id: up.id, ...(text ? { caption: text } : {}) } : { id: up.id, filename, ...(text ? { caption: text } : {}) };
    const data = await graph(inbox, `${inbox.phone_number_id}/messages`, { method: 'POST', json: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: t.kind, [t.kind]: payload } });
    const id = await recordOutgoing(conv, req.user, { waMessageId: data.messages && data.messages[0] && data.messages[0].id, kind: t.kind, body: text, media: { id: up.id, mime: t.mime, filename, stored: true, size: buf.length } });
    await pool.query('INSERT INTO wa_media (message_id, mime, filename, size, data) VALUES ($1,$2,$3,$4,$5)', [id, t.mime, filename, buf.length, sealBytes(buf)]);
    res.json({ ok: true, id });
  } catch (e) {
    if (e.graph) { console.error('WhatsApp: envio recusado', e.status, JSON.stringify(e.graph).slice(0, 300)); return res.status(e.status === 409 ? 409 : 502).json({ message: e.message }); }
    next(e);
  }
});

const INLINE_OK = /^(image\/(jpeg|png|webp)|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp))$/;
router.get('/media/:id', async (req, res, next) => {
  try {
    if (!ID_RE.test(req.params.id || '')) return res.status(400).json({ message: 'Arquivo inválido.' });
    const { rows } = await pool.query(
      `SELECT md.mime, md.filename, md.data, c.inbox_id FROM wa_media md JOIN wa_messages m ON m.id = md.message_id JOIN wa_conversations c ON c.id = m.conversation_id
       WHERE md.message_id = $1 AND c.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (!rows[0] || !(await readableInboxes(req.user)).some((i) => i.id === rows[0].inbox_id)) return res.status(404).json({ message: 'Arquivo ainda não baixado ou indisponível.' });
    const data = openBytes(rows[0].data);
    if (!data) return res.status(410).json({ message: 'Arquivo ilegível: a chave de cifra do servidor mudou.' });
    const mime = String(rows[0].mime || '').split(';')[0].trim().toLowerCase();
    const inline = INLINE_OK.test(mime) && req.query.download !== '1';
    const name = (rows[0].filename || `arquivo-whatsapp.${(mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '')}`).replace(/["\r\n]/g, '_');
    res.set('Content-Type', inline ? mime : 'application/octet-stream');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, no-store');
    res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(data);
  } catch (e) { next(e); }
});

// ---- Caixa pessoal: só o dono autoriza ou desliga ----

async function ownPersonal(req, res) {
  if (!ID_RE.test(req.params.id || '')) { res.status(400).json({ message: 'Caixa inválida.' }); return null; }
  const { rows } = await pool.query(`SELECT * FROM wa_inboxes WHERE id = $1 AND org_id = $2 AND kind = 'personal' AND owner_id = $3`, [req.params.id, req.user.orgId, req.user.id]);
  if (!rows[0]) { res.status(404).json({ message: 'Só o dono desta caixa pode fazer isso.' }); return null; }
  return rows[0];
}

router.post('/inboxes/:id/authorize', async (req, res, next) => {
  try {
    const inbox = await ownPersonal(req, res); if (!inbox) return;
    await pool.query('UPDATE wa_inboxes SET authorized_at = now() WHERE id = $1', [inbox.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Desautorizar: para de guardar e APAGA tudo o que foi guardado desta caixa (conversas, mensagens e arquivos, em cascata).
router.post('/inboxes/:id/revoke', async (req, res, next) => {
  try {
    const inbox = await ownPersonal(req, res); if (!inbox) return;
    await pool.query('UPDATE wa_inboxes SET authorized_at = NULL WHERE id = $1', [inbox.id]);
    const { rowCount } = await pool.query('DELETE FROM wa_conversations WHERE inbox_id = $1', [inbox.id]);
    res.json({ ok: true, removed: rowCount });
  } catch (e) { next(e); }
});

// ---- Configuração das caixas (só master). Nunca devolve conteúdo de conversa nem a chave. ----

const requireMaster = (req, res, next) => (req.user.role === 'master' ? next() : res.status(403).json({ message: 'Só o master configura as caixas do WhatsApp.' }));

async function adminList(orgId) {
  const { rows } = await pool.query(
    `SELECT i.*, o.name AS owner_name,
       COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name) ORDER BY u.name) FROM wa_inbox_members m JOIN users u ON u.id = m.user_id WHERE m.inbox_id = i.id), '[]') AS members
     FROM wa_inboxes i LEFT JOIN users o ON o.id = i.owner_id WHERE i.org_id = $1 ORDER BY i.kind, i.name`,
    [orgId]
  );
  return rows.map((i) => ({
    id: i.id, name: i.name, kind: i.kind, ownerId: i.owner_id, ownerName: i.owner_name || '', phoneNumberId: i.phone_number_id,
    displayPhone: i.display_phone, active: i.active, tokenSet: !!i.token_enc, authorized: i.kind === 'shared' || !!i.authorized_at,
    members: i.kind === 'shared' ? i.members : [],
  }));
}

router.get('/admin/inboxes', requireMaster, async (req, res, next) => {
  try {
    const users = await pool.query(
      `SELECT id, name FROM users WHERE org_id = $1 AND role IN ('master','pricetax') AND NOT blocked ORDER BY name`,
      [req.user.orgId]
    );
    res.json({ inboxes: await adminList(req.user.orgId), users: users.rows, webhookReady: whatsappEnabled() });
  } catch (e) { next(e); }
});

function inboxInput(b, creating) {
  const out = {};
  if (creating || b.name !== undefined) {
    out.name = String(b.name || '').trim().slice(0, 60);
    if (!out.name) return { error: 'Dê um nome à caixa (ex.: Comercial).' };
  }
  if (creating || b.phoneNumberId !== undefined) {
    out.phoneNumberId = String(b.phoneNumberId || '').trim();
    if (!PHONE_ID_RE.test(out.phoneNumberId)) return { error: 'O identificador do número (Phone number ID) tem só dígitos; copie do painel da Meta.' };
  }
  if (b.displayPhone !== undefined) out.displayPhone = String(b.displayPhone || '').trim().slice(0, 30);
  if (b.token !== undefined && String(b.token).trim()) {
    const t = String(b.token).trim();
    if (t.length < 20 || t.length > 2000 || /\s/.test(t)) return { error: 'A chave de acesso parece incompleta. Copie de novo do painel da Meta.' };
    out.token = t;
  }
  if (b.active !== undefined) out.active = !!b.active;
  return out;
}

async function setMembers(client, inboxId, orgId, ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 50);
  const { rows } = await client.query(`SELECT id FROM users WHERE org_id = $1 AND role IN ('master','pricetax') AND id = ANY($2)`, [orgId, list]);
  await client.query('DELETE FROM wa_inbox_members WHERE inbox_id = $1', [inboxId]);
  for (const r of rows) await client.query('INSERT INTO wa_inbox_members (inbox_id, user_id) VALUES ($1,$2)', [inboxId, r.id]);
}

router.post('/admin/inboxes', requireMaster, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const kind = req.body.kind === 'personal' ? 'personal' : 'shared';
    const v = inboxInput(req.body, true);
    if (v.error) return res.status(400).json({ message: v.error });
    let ownerId = null;
    if (kind === 'personal') {
      const { rows } = await pool.query(`SELECT id FROM users WHERE id = $1 AND org_id = $2 AND role IN ('master','pricetax')`, [String(req.body.ownerId || ''), req.user.orgId]);
      if (!rows[0]) return res.status(400).json({ message: 'Escolha o dono do número pessoal.' });
      ownerId = rows[0].id;
    }
    const dup = await pool.query('SELECT 1 FROM wa_inboxes WHERE phone_number_id = $1', [v.phoneNumberId]);
    if (dup.rows[0]) return res.status(409).json({ message: 'Este número já está cadastrado em outra caixa.' });
    const id = uid('wai');
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO wa_inboxes (id, org_id, name, kind, owner_id, phone_number_id, display_phone, token_enc, active, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, req.user.orgId, v.name, kind, ownerId, v.phoneNumberId, v.displayPhone || '', v.token ? seal(v.token) : '', v.active !== false, req.user.id]
    );
    if (kind === 'shared') await setMembers(client, id, req.user.orgId, req.body.memberIds);
    await client.query('COMMIT');
    res.json({ ok: true, id, inboxes: await adminList(req.user.orgId) });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

router.patch('/admin/inboxes/:id', requireMaster, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!ID_RE.test(req.params.id || '')) return res.status(400).json({ message: 'Caixa inválida.' });
    const { rows } = await pool.query('SELECT * FROM wa_inboxes WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
    const inbox = rows[0];
    if (!inbox) return res.status(404).json({ message: 'Caixa não encontrada.' });
    const v = inboxInput(req.body, false);
    if (v.error) return res.status(400).json({ message: v.error });
    if (v.phoneNumberId && v.phoneNumberId !== inbox.phone_number_id) {
      const dup = await pool.query('SELECT 1 FROM wa_inboxes WHERE phone_number_id = $1', [v.phoneNumberId]);
      if (dup.rows[0]) return res.status(409).json({ message: 'Este número já está cadastrado em outra caixa.' });
    }
    await client.query('BEGIN');
    await client.query(
      `UPDATE wa_inboxes SET name = COALESCE($2, name), phone_number_id = COALESCE($3, phone_number_id), display_phone = COALESCE($4, display_phone),
         token_enc = COALESCE($5, token_enc), active = COALESCE($6, active) WHERE id = $1`,
      [inbox.id, v.name ?? null, v.phoneNumberId ?? null, v.displayPhone ?? null, v.token ? seal(v.token) : null, v.active ?? null]
    );
    if (inbox.kind === 'shared' && req.body.memberIds !== undefined) await setMembers(client, inbox.id, req.user.orgId, req.body.memberIds);
    await client.query('COMMIT');
    res.json({ ok: true, inboxes: await adminList(req.user.orgId) });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});
