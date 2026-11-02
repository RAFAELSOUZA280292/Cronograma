// Rotas da Caixa de e-mail (2026-11-02, Fase 1). Só leitura e organização do Gmail da própria pessoa: cada chamada usa o
// token do Google DELA (nunca o de outra pessoa) e nada é guardado no nosso banco. Ver server/googleMail.js.

import { Router } from 'express';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FOLDERS, folderQuery, headerMap, parseAddressList, walkParts, sanitizeMailHtml, textToHtml, threadSummary, gmailFor, mailStatus, friendlyMailError, forgetMailScope, mapLimit } from './googleMail.js';
import { parseRecipients, replyRecipients, replySubject, buildQuote, composeBody, buildMime, cleanSignature, signatureHtml, signatureHasContent, sizeError, attachmentsSize, LOGO_CID, MAX_RECIPIENTS } from './mailCompose.js';
import { pool } from './db.js';

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp)$/;

async function withGmail(req, res) {
  const g = await gmailFor(req.user.id);
  if (!g) { res.status(409).json({ message: 'Conecte o seu Gmail para usar a caixa de e-mail.', code: 'mail_not_connected' }); return null; }
  return g.gmail;
}

function fail(res, e) {
  const status = e && (e.code || (e.response && e.response.status));
  const msg = friendlyMailError(e);
  if (status !== 404 && status !== 429) console.error('Gmail:', status, String(e && e.message).slice(0, 200));
  if (status === 403 && /insufficient|scope/i.test(String(e && e.message))) return res.status(409).json({ message: msg, code: 'mail_not_connected' });
  if (/invalid_grant/i.test(String(e && e.message))) return res.status(409).json({ message: msg, code: 'mail_not_connected' });
  res.status([400, 404, 413, 429].includes(status) ? status : 502).json({ message: msg });
}

router.get('/status', async (req, res, next) => {
  try {
    if (req.query.fresh === '1') forgetMailScope(req.user.id);
    res.json(await mailStatus(req.user.id));
  } catch (e) { next(e); }
});

router.get('/labels', async (req, res) => {
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { data } = await gmail.users.labels.list({ userId: 'me' });
    const user = (data.labels || []).filter((l) => l.type === 'user' && l.labelListVisibility !== 'labelHide').slice(0, 60);
    const ids = ['INBOX', 'DRAFT', 'SPAM', ...user.map((l) => l.id)];
    const details = await mapLimit(ids, 8, (id) => gmail.users.labels.get({ userId: 'me', id }).then((r) => r.data).catch(() => null));
    const byId = Object.fromEntries(details.filter(Boolean).map((l) => [l.id, l]));
    const folders = Object.entries(FOLDERS).map(([id, f]) => ({
      id, name: f.name,
      unread: id === 'INBOX' || id === 'SPAM' ? (byId[id] && byId[id].messagesUnread) || 0 : 0,
      total: id === 'DRAFT' ? (byId[id] && byId[id].messagesTotal) || 0 : null,
    }));
    const labels = user.map((l) => ({ id: l.id, name: l.name, unread: (byId[l.id] && byId[l.id].threadsUnread) || 0, color: l.color ? l.color.backgroundColor : null }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ folders, labels });
  } catch (e) { fail(res, e); }
});

router.get('/threads', async (req, res) => {
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { labelIds, q, includeSpamTrash } = folderQuery(String(req.query.folder || 'INBOX'), req.query.q);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.length < 200 ? req.query.pageToken : undefined;
    const { data } = await gmail.users.threads.list({ userId: 'me', labelIds, q, includeSpamTrash, maxResults: 30, pageToken });
    const list = data.threads || [];
    const full = await mapLimit(list, 6, (t) => gmail.users.threads.get({
      userId: 'me', id: t.id, format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    }).then((r) => r.data).catch(() => null));
    res.json({ threads: full.filter(Boolean).map(threadSummary), nextPageToken: data.nextPageToken || null, estimate: data.resultSizeEstimate || 0 });
  } catch (e) { fail(res, e); }
});

router.get('/threads/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ message: 'Identificador de conversa inválido.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { data } = await gmail.users.threads.get({ userId: 'me', id: req.params.id, format: 'full' });
    const messages = (data.messages || []).map((m) => {
      const h = headerMap(m.payload && m.payload.headers);
      const parts = walkParts(m.payload);
      const cidUrl = (cid) => {
        const a = parts.attachments.find((x) => x.contentId === cid && x.id && INLINE_IMAGE.test(x.mimeType));
        return a ? `/api/mail/messages/${m.id}/attachments/${encodeURIComponent(a.id)}?inline=1&type=${encodeURIComponent(a.mimeType)}` : null;
      };
      const body = parts.html ? sanitizeMailHtml(parts.html, { cidUrl }) : { html: textToHtml(parts.text), remoteImages: 0 };
      return {
        id: m.id,
        from: parseAddressList(h.from)[0] || { name: '', email: '' },
        to: parseAddressList(h.to),
        cc: parseAddressList(h.cc),
        replyTo: parseAddressList(h['reply-to']),
        subject: h.subject || '',
        date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
        snippet: m.snippet || '',
        unread: (m.labelIds || []).includes('UNREAD'),
        sent: (m.labelIds || []).includes('SENT'),
        html: body.html,
        remoteImages: body.remoteImages,
        attachments: parts.attachments.filter((a) => a.id && !a.inline).map(({ id, partId, filename, mimeType, size }) => ({ id, partId, filename, mimeType, size })),
      };
    });
    const labels = new Set((data.messages || []).flatMap((m) => m.labelIds || []));
    res.json({
      id: data.id,
      subject: (messages[0] && messages[0].subject) || '(sem assunto)',
      starred: labels.has('STARRED'), inInbox: labels.has('INBOX'), inTrash: labels.has('TRASH'), inSpam: labels.has('SPAM'),
      messages,
    });
  } catch (e) { fail(res, e); }
});

router.get('/messages/:mid/attachments/:aid', async (req, res) => {
  const { mid, aid } = req.params;
  if (!ID_RE.test(mid) || !/^[A-Za-z0-9_-]{10,1200}$/.test(aid)) return res.status(400).json({ message: 'Anexo inválido.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { data } = await gmail.users.messages.attachments.get({ userId: 'me', messageId: mid, id: aid });
    const buf = Buffer.from(data.data || '', 'base64url');
    const type = String(req.query.type || '').toLowerCase();
    const name = String(req.query.name || 'anexo').replace(/[\r\n"\\/]/g, '_').slice(0, 180);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (req.query.inline === '1' && INLINE_IMAGE.test(type)) {
      res.setHeader('Content-Type', type);
      res.setHeader('Content-Disposition', 'inline');
    } else {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    }
    res.send(buf);
  } catch (e) { fail(res, e); }
});

// Ações sobre a conversa inteira, como no Gmail. Lixeira do Gmail apaga sozinha em 30 dias; aqui não existe "excluir de vez".
const ACTIONS = {
  read: { removeLabelIds: ['UNREAD'] },
  unread: { addLabelIds: ['UNREAD'] },
  star: { addLabelIds: ['STARRED'] },
  unstar: { removeLabelIds: ['STARRED'] },
  archive: { removeLabelIds: ['INBOX'] },
  inbox: { addLabelIds: ['INBOX'], removeLabelIds: ['SPAM'] },
  spam: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
};

router.post('/threads/modify', async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.filter((x) => typeof x === 'string' && ID_RE.test(x)).slice(0, 50) : [];
  const action = req.body && req.body.action;
  if (!ids.length) return res.status(400).json({ message: 'Escolha ao menos uma conversa.' });
  if (!ACTIONS[action] && action !== 'trash' && action !== 'untrash') return res.status(400).json({ message: 'Ação desconhecida.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    await mapLimit(ids, 5, (id) => (action === 'trash' ? gmail.users.threads.trash({ userId: 'me', id })
      : action === 'untrash' ? gmail.users.threads.untrash({ userId: 'me', id })
        : gmail.users.threads.modify({ userId: 'me', id, requestBody: ACTIONS[action] })));
    res.json({ ok: true, count: ids.length });
  } catch (e) { fail(res, e); }
});

// --- Fase 2 (2026-11-02): escrever, responder, encaminhar, assinatura ----------------------------------------
// Montagem do e-mail em server/mailCompose.js (puro). O envio vai pelo próprio Gmail da pessoa (users.messages.send,
// upload como message/rfc822, até 35 MB no Google; aqui o limite é 20 MB de anexos) e aparece em Enviados no Gmail e no celular.

const LOGO = fs.readFileSync(fileURLToPath(new URL('./assets/mail-logo-pricetax.png', import.meta.url)));
const MODES = ['new', 'reply', 'replyAll', 'forward'];

function findPart(part, partId) {
  if (!part) return null;
  if (part.partId === partId) return part;
  for (const p of part.parts || []) { const hit = findPart(p, partId); if (hit) return hit; }
  return null;
}

async function loadOriginal(gmail, messageId) {
  const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const h = headerMap(data.payload && data.payload.headers);
  const parts = walkParts(data.payload);
  return {
    id: data.id, threadId: data.threadId, payload: data.payload,
    from: parseAddressList(h.from)[0] || { name: '', email: '' },
    to: parseAddressList(h.to), cc: parseAddressList(h.cc), replyTo: parseAddressList(h['reply-to']),
    subject: h.subject || '', date: data.internalDate ? new Date(Number(data.internalDate)).toISOString() : null,
    messageIdHeader: h['message-id'] || '', references: h.references || '',
    html: parts.html, text: parts.text,
    attachments: parts.attachments.filter((a) => !a.inline && a.partId),
  };
}

async function myAddress(req, gmail) {
  const st = await mailStatus(req.user.id);
  if (st && st.email) return st.email;
  return (await gmail.users.getProfile({ userId: 'me' })).data.emailAddress;
}

async function readSignature(user) {
  const { rows } = await pool.query("SELECT preferences->'mail'->'signature' AS sig FROM users WHERE id=$1", [user.id]);
  const saved = rows[0] && rows[0].sig;
  if (saved) return { signature: cleanSignature(saved), saved: true };
  return { signature: cleanSignature({ name: user.name || '', email: user.email || '', site: 'www.pricetax.com.br' }), saved: false };
}

const LOGO_URL = '/api/mail/signature/logo.png';

router.get('/signature', async (req, res, next) => {
  try {
    const r = await readSignature(req.user);
    if (!r.saved && !r.signature.email) {
      const st = await mailStatus(req.user.id).catch(() => null);
      if (st && st.email) r.signature.email = st.email;
    }
    res.json({ ...r, previewHtml: signatureHtml(r.signature, { logoSrc: LOGO_URL }) });
  } catch (e) { next(e); }
});

router.post('/signature/preview', (req, res) => {
  res.json({ previewHtml: signatureHtml(cleanSignature(req.body && req.body.signature), { logoSrc: LOGO_URL }) });
});

router.put('/signature', async (req, res, next) => {
  try {
    const sig = cleanSignature(req.body && req.body.signature);
    await pool.query(
      "UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('mail', COALESCE(preferences->'mail', '{}'::jsonb) || jsonb_build_object('signature', $1::jsonb)) WHERE id=$2",
      [JSON.stringify(sig), req.user.id],
    );
    res.json({ signature: sig, saved: true, previewHtml: signatureHtml(sig, { logoSrc: LOGO_URL }) });
  } catch (e) { next(e); }
});

router.get('/signature/logo.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(LOGO);
});

// Dados para abrir a janela de resposta/encaminhamento: destinatários, assunto, prévia da citação e anexos originais.
router.get('/compose', async (req, res) => {
  const mode = String(req.query.mode || '');
  const messageId = String(req.query.messageId || '');
  if (!MODES.includes(mode) || mode === 'new' || !ID_RE.test(messageId)) return res.status(400).json({ message: 'Pedido de resposta inválido.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const [orig, me] = await Promise.all([loadOriginal(gmail, messageId), myAddress(req, gmail)]);
    const recipients = mode === 'forward' ? { to: [], cc: [] } : replyRecipients(orig, me, mode);
    const quote = buildQuote(orig, mode === 'forward' ? 'forward' : 'reply');
    res.json({
      mode, messageId, threadId: orig.threadId, ...recipients,
      subject: replySubject(orig.subject, mode),
      quotePreview: sanitizeMailHtml(quote.html).html,
      attachments: mode === 'forward' ? orig.attachments.map(({ partId, filename, mimeType, size }) => ({ partId, filename, mimeType, size })) : [],
    });
  } catch (e) { fail(res, e); }
});

router.post('/send', async (req, res) => {
  const b = req.body || {};
  const mode = MODES.includes(b.mode) ? b.mode : 'new';
  const to = parseRecipients(b.to); const cc = parseRecipients(b.cc); const bcc = parseRecipients(b.bcc);
  const invalid = [...to.invalid, ...cc.invalid, ...bcc.invalid];
  if (invalid.length) return res.status(400).json({ message: `Endereço de e-mail inválido: ${invalid.slice(0, 3).join(', ')}. Confira e tente de novo.` });
  const count = to.valid.length + cc.valid.length + bcc.valid.length;
  if (!count) return res.status(400).json({ message: 'Informe ao menos um destinatário.' });
  if (count > MAX_RECIPIENTS) return res.status(400).json({ message: `São ${count} destinatários; o limite é ${MAX_RECIPIENTS} por e-mail.` });
  if (mode !== 'new' && !ID_RE.test(String(b.messageId || ''))) return res.status(400).json({ message: 'Não achei a mensagem original desta resposta.' });
  const uploads = (Array.isArray(b.attachments) ? b.attachments : []).slice(0, 50).map((a) => ({
    filename: String((a && a.filename) || 'anexo').slice(0, 200), mimeType: String((a && a.mimeType) || ''), data: Buffer.from(String((a && a.data) || ''), 'base64'),
  }));
  const tooBig = sizeError(attachmentsSize(uploads));
  if (tooBig) return res.status(413).json({ message: tooBig });

  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const me = await myAddress(req, gmail);
    const orig = mode === 'new' ? null : await loadOriginal(gmail, b.messageId);
    let forwarded = [];
    if (mode === 'forward') {
      const keep = new Set((Array.isArray(b.forwardParts) ? b.forwardParts : []).map(String));
      const picked = orig.attachments.filter((a) => keep.has(a.partId));
      const err = sizeError(attachmentsSize(uploads) + attachmentsSize(picked));
      if (err) return res.status(413).json({ message: err });
      forwarded = await mapLimit(picked, 4, async (a) => {
        const part = findPart(orig.payload, a.partId) || {};
        const body = part.body || {};
        const data = body.attachmentId
          ? (await gmail.users.messages.attachments.get({ userId: 'me', messageId: orig.id, id: body.attachmentId })).data.data
          : body.data;
        return { filename: a.filename, mimeType: a.mimeType, data: Buffer.from(data || '', 'base64url') };
      });
    }
    const { signature } = b.signature === false ? { signature: null } : await readSignature(req.user);
    const sig = signature && signature.enabled && signatureHasContent(signature) ? signature : null;
    const quote = orig && b.includeQuote !== false ? buildQuote(orig, mode === 'forward' ? 'forward' : 'reply') : null;
    const body = composeBody({ html: String(b.html || '').slice(0, 2_000_000), signature: sig, quote });
    const threaded = orig && mode !== 'forward';
    const raw = buildMime({
      from: { name: (sig && sig.name) || req.user.name || '', email: me },
      to: to.valid, cc: cc.valid, bcc: bcc.valid,
      subject: String(b.subject || '').slice(0, 500) || (orig ? replySubject(orig.subject, mode) : ''),
      html: body.html, text: body.text,
      inReplyTo: threaded ? orig.messageIdHeader : '',
      references: threaded ? `${orig.references} ${orig.messageIdHeader}` : '',
      inline: body.usesLogo ? [{ cid: LOGO_CID, mimeType: 'image/png', data: LOGO }] : [],
      attachments: [...forwarded, ...uploads],
    });
    const { data } = await gmail.users.messages.send({
      userId: 'me',
      requestBody: threaded ? { threadId: orig.threadId } : {},
      media: { mimeType: 'message/rfc822', body: raw },
    });
    res.json({ ok: true, id: data.id, threadId: data.threadId });
  } catch (e) { fail(res, e); }
});
