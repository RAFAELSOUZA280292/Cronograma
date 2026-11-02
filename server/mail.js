// Rotas da Caixa de e-mail (2026-11-02, Fase 1). Só leitura e organização do Gmail da própria pessoa: cada chamada usa o
// token do Google DELA (nunca o de outra pessoa) e nada é guardado no nosso banco. Ver server/googleMail.js.

import { Router } from 'express';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import { FOLDERS, folderQuery, headerMap, parseAddressList, walkParts, sanitizeMailHtml, textToHtml, threadSummary, gmailFor, mailStatus, friendlyMailError, forgetMailScope, mapLimit } from './googleMail.js';

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp)$/;

async function withGmail(req, res) {
  const g = await gmailFor(req.user.id);
  if (!g) { res.status(409).json({ error: 'Conecte o seu Gmail para usar a caixa de e-mail.', code: 'mail_not_connected' }); return null; }
  return g.gmail;
}

function fail(res, e) {
  const status = e && (e.code || (e.response && e.response.status));
  const msg = friendlyMailError(e);
  if (status !== 404 && status !== 429) console.error('Gmail:', status, String(e && e.message).slice(0, 200));
  if (status === 403 && /insufficient|scope/i.test(String(e && e.message))) return res.status(409).json({ error: msg, code: 'mail_not_connected' });
  if (/invalid_grant/i.test(String(e && e.message))) return res.status(409).json({ error: msg, code: 'mail_not_connected' });
  res.status(status === 404 ? 404 : status === 429 ? 429 : 502).json({ error: msg });
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
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Identificador de conversa inválido.' });
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
        attachments: parts.attachments.filter((a) => a.id && !a.inline).map(({ id, filename, mimeType, size }) => ({ id, filename, mimeType, size })),
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
  if (!ID_RE.test(mid) || !/^[A-Za-z0-9_-]{10,1200}$/.test(aid)) return res.status(400).json({ error: 'Anexo inválido.' });
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
  if (!ids.length) return res.status(400).json({ error: 'Escolha ao menos uma conversa.' });
  if (!ACTIONS[action] && action !== 'trash' && action !== 'untrash') return res.status(400).json({ error: 'Ação desconhecida.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    await mapLimit(ids, 5, (id) => (action === 'trash' ? gmail.users.threads.trash({ userId: 'me', id })
      : action === 'untrash' ? gmail.users.threads.untrash({ userId: 'me', id })
        : gmail.users.threads.modify({ userId: 'me', id, requestBody: ACTIONS[action] })));
    res.json({ ok: true, count: ids.length });
  } catch (e) { fail(res, e); }
});
