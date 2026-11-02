// Rotas da Caixa de e-mail (2026-11-02, Fase 1). Só leitura e organização do Gmail da própria pessoa: cada chamada usa o
// token do Google DELA (nunca o de outra pessoa) e nada é guardado no nosso banco. Ver server/googleMail.js.

import { Router } from 'express';
import { requireAuth, requireMasterOrPricetax } from './auth.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { folderParam, unreadQuery, labelTree, labelDisplay, FOLDERS, folderQuery, headerMap, parseAddressList, walkParts, sanitizeMailHtml, textToHtml, threadSummary, gmailFor, mailStatus, friendlyMailError, forgetMailScope, mapLimit } from './googleMail.js';
import { parseRecipients, replyRecipients, replySubject, buildQuote, composeBody, buildMime, cleanSignature, signatureHtml, signatureHasContent, sizeError, attachmentsSize, LOGO_CID, MAX_RECIPIENTS, isEmail, sanitizeOutgoingHtml, DRAFT_HEADER, draftMeta, parseDraftMeta, draftBodyHtml, SIG_IMAGE_CID, signatureImageError, restoreInlineImages, BODY_IMAGE_PREFIX, rankContacts, contactRank, foldText, attachmentBlockReason } from './mailCompose.js';
import { labelColorFor } from '../shared/mailLabelColors.js';
import { isCalendarPart, parseIcs } from './calendarInvite.js';
import { findEventByICalUID, googleConfigured } from './googleCalendar.js';
import { crmRoleOf } from './crm/permissions.js';
import { pool } from './db.js';
import { annotateThreads, indexInBackground } from './mailLinks.js';

export const router = Router();
router.use(requireAuth, requireMasterOrPricetax);

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp)$/;
const LABEL_RE = /^Label_[A-Za-z0-9_-]{1,40}$/;
// Marcadores que a tela pode pôr/tirar livremente (mover para pasta, desfazer): os de sistema seguros + os do usuário.
const FREE_LABELS = new Set(['INBOX', 'UNREAD', 'STARRED', 'SPAM', 'IMPORTANT']);
const okLabel = (l) => typeof l === 'string' && (FREE_LABELS.has(l) || LABEL_RE.test(l));

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
    const user = (data.labels || []).filter((l) => l.type === 'user' && l.labelListVisibility !== 'labelHide').slice(0, 200);
    const ids = ['INBOX', 'DRAFT', 'SPAM', ...user.map((l) => l.id)];
    const details = await mapLimit(ids, 8, (id) => gmail.users.labels.get({ userId: 'me', id }).then((r) => r.data).catch(() => null));
    const byId = Object.fromEntries(details.filter(Boolean).map((l) => [l.id, l]));
    const folders = Object.entries(FOLDERS).map(([id, f]) => ({
      id, name: f.name,
      unread: id === 'INBOX' || id === 'SPAM' ? (byId[id] && byId[id].messagesUnread) || 0 : 0,
      total: id === 'DRAFT' ? (byId[id] && byId[id].messagesTotal) || 0 : null,
    }));
    const labels = labelTree(user.map((l) => ({ id: l.id, name: l.name, unread: (byId[l.id] && byId[l.id].threadsUnread) || 0, color: l.color ? l.color.backgroundColor : null, textColor: l.color ? l.color.textColor : null })));
    res.json({ folders, labels });
  } catch (e) { fail(res, e); }
});

router.get('/threads', async (req, res) => {
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { labelIds, q, includeSpamTrash } = folderQuery(folderParam(req.query.folder), req.query.q);
    const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.length < 200 ? req.query.pageToken : undefined;
    const { data } = await gmail.users.threads.list({ userId: 'me', labelIds, q, includeSpamTrash, maxResults: 30, pageToken });
    const list = data.threads || [];
    const full = await mapLimit(list, 6, (t) => gmail.users.threads.get({
      userId: 'me', id: t.id, format: 'metadata', metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID'],
    }).then((r) => r.data).catch(() => null));
    const raw = full.filter(Boolean);
    // Selo "Cliente · KUHN" / faixa "Empresa fora do CRM" (§130) e índice só de metadados para a aba E-mails do CRM.
    const links = await annotateThreads(req.user, raw);
    indexInBackground(req.user, raw);
    res.json({ threads: raw.map((t, i) => ({ ...threadSummary(t), link: links[i] })), nextPageToken: data.nextPageToken || null, estimate: data.resultSizeEstimate || 0 });
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
      const body = parts.html ? sanitizeMailHtml(parts.html, { cidUrl, keepStyles: true }) : { html: textToHtml(parts.text), remoteImages: 0 };
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
        draft: (m.labelIds || []).includes('DRAFT'),
        html: body.html,
        remoteImages: body.remoteImages,
        attachments: parts.attachments.filter((a) => a.id && !a.inline).map(({ id, partId, filename, mimeType, size }) => ({ id, partId, filename, mimeType, size })),
        invite: parts.attachments.some(isCalendarPart),
      };
    });
    const labels = new Set((data.messages || []).flatMap((m) => m.labelIds || []));
    const [link] = await annotateThreads(req.user, [data]);
    indexInBackground(req.user, [data]);
    res.json({
      id: data.id, link,
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

// Convite de reunião no e-mail (2026-11-02): lê o text/calendar (ou o .ics) e acha o evento na agenda da pessoa pelo UID, para o
// cartão com Sim/Talvez/Não, proposta de novo horário e "Ver na agenda". Agenda indisponível não derruba o cartão (event: null).
router.get('/messages/:mid/invite', async (req, res) => {
  if (!ID_RE.test(req.params.mid)) return res.status(400).json({ message: 'Mensagem inválida.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { data } = await gmail.users.messages.get({ userId: 'me', id: req.params.mid, format: 'full' });
    const cal = walkParts(data.payload).attachments.filter(isCalendarPart)
      .sort((a, b) => (a.mimeType === 'text/calendar' ? 0 : 1) - (b.mimeType === 'text/calendar' ? 0 : 1))[0];
    if (!cal) return res.status(404).json({ message: 'Este e-mail não traz convite de reunião.' });
    const part = cal.partId ? findPart(data.payload, cal.partId) : null;
    let raw = part && part.body && part.body.data;
    if (!raw && cal.id) raw = (await gmail.users.messages.attachments.get({ userId: 'me', messageId: data.id, id: cal.id })).data.data;
    const invite = raw ? parseIcs(Buffer.from(raw, 'base64url').toString('utf8')) : null;
    if (!invite) return res.status(422).json({ message: 'Não consegui ler o convite deste e-mail.' });
    let event = null; let calendarError = '';
    if (googleConfigured() && invite.uid) {
      try { event = await findEventByICalUID(req.user.id, invite.uid); } catch (e) {
        calendarError = e && e.status === 409 ? 'Conecte a sua agenda do Google para responder por aqui.' : 'Não consegui consultar a sua agenda agora.';
        if (!(e && e.status)) console.error('Convite: falha ao buscar o evento na agenda', String(e && e.message).slice(0, 200));
      }
    }
    res.json({ invite, event, calendarError, me: await myAddress(req, gmail).catch(() => '') });
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
  if (!ACTIONS[action] && action !== 'trash' && action !== 'untrash' && action !== 'labels') return res.status(400).json({ message: 'Ação desconhecida.' });
  // 'labels' = pôr/tirar marcadores (mover para pasta: põe a pasta e tira a Entrada; o Desfazer faz o inverso).
  let labelBody = null;
  if (action === 'labels') {
    const add = (Array.isArray(req.body.add) ? req.body.add : []).filter(okLabel).slice(0, 5);
    const remove = (Array.isArray(req.body.remove) ? req.body.remove : []).filter(okLabel).filter((l) => !add.includes(l)).slice(0, 5);
    if (!add.length && !remove.length) return res.status(400).json({ message: 'Escolha a pasta de destino.' });
    labelBody = { addLabelIds: add, removeLabelIds: remove };
  }
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    await mapLimit(ids, 5, (id) => (action === 'trash' ? gmail.users.threads.trash({ userId: 'me', id })
      : action === 'untrash' ? gmail.users.threads.untrash({ userId: 'me', id })
        : gmail.users.threads.modify({ userId: 'me', id, requestBody: labelBody || ACTIONS[action] })));
    res.json({ ok: true, count: ids.length });
  } catch (e) { fail(res, e); }
});

// Marcar todas como lidas (como o ⋮ do Gmail): todas as mensagens não lidas da pasta/pesquisa aberta, não só as
// carregadas na tela. Até 5.000 por clique (batchModify aceita 1.000 por chamada); o que passar disso fica para o próximo clique.
router.post('/read-all', async (req, res) => {
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { labelIds, q, includeSpamTrash } = unreadQuery(folderParam(req.body && req.body.folder), req.body && req.body.q);
    const ids = [];
    let pageToken;
    do {
      const { data } = await gmail.users.messages.list({ userId: 'me', labelIds, q, includeSpamTrash, maxResults: 500, pageToken });
      for (const m of data.messages || []) ids.push(m.id);
      pageToken = data.nextPageToken;
    } while (pageToken && ids.length < 5000);
    const todo = ids.slice(0, 5000);
    for (let i = 0; i < todo.length; i += 1000) {
      await gmail.users.messages.batchModify({ userId: 'me', requestBody: { ids: todo.slice(i, i + 1000), removeLabelIds: ['UNREAD'] } });
    }
    res.json({ ok: true, count: todo.length, more: ids.length > 5000 || !!pageToken });
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
    inline: parts.attachments.filter((a) => a.inline && a.partId && a.contentId),
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
  return { signature: cleanSignature({ mode: 'text', closing: 'Atenciosamente,', name: user.name || '', email: user.email || '', site: 'www.pricetax.com.br' }), saved: false };
}

const LOGO_URL = '/api/mail/signature/logo.png';
// Prévia na tela: a imagem própria vai como data: (no e-mail ela vai embutida por Content-ID).
const previewOf = (sig) => signatureHtml(sig, { logoSrc: LOGO_URL, imageSrc: sig.image ? `data:${sig.image.mimeType};base64,${sig.image.data}` : '' });

router.get('/signature', async (req, res, next) => {
  try {
    const r = await readSignature(req.user);
    if (!r.saved && !r.signature.email) {
      const st = await mailStatus(req.user.id).catch(() => null);
      if (st && st.email) r.signature.email = st.email;
    }
    res.json({ ...r, previewHtml: previewOf(r.signature) });
  } catch (e) { next(e); }
});

router.post('/signature/preview', (req, res) => {
  res.json({ previewHtml: previewOf(cleanSignature(req.body && req.body.signature)) });
});

router.put('/signature', async (req, res, next) => {
  try {
    const raw = (req.body && req.body.signature) || {};
    const imgErr = signatureImageError(raw.image);
    if (imgErr) return res.status(400).json({ message: imgErr });
    const sig = cleanSignature(raw);
    await pool.query(
      "UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('mail', COALESCE(preferences->'mail', '{}'::jsonb) || jsonb_build_object('signature', $1::jsonb)) WHERE id=$2",
      [JSON.stringify(sig), req.user.id],
    );
    res.json({ signature: sig, saved: true, previewHtml: previewOf(sig) });
  } catch (e) { next(e); }
});

// Preferências da caixa por pessoa (users.preferences.mail). showImages: imagens externas carregam direto, sem "Mostrar imagens";
// padrão ligado para todos (pedido do Rafael, 02/11/2026) — quem quiser volta a bloquear em Configurar → Imagens.
const readPrefs = (raw) => ({ showImages: !(raw && raw.showImages === false) });

router.get('/prefs', async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT preferences->'mail' AS m FROM users WHERE id=$1", [req.user.id]);
    res.json(readPrefs(rows[0] && rows[0].m));
  } catch (e) { next(e); }
});

router.put('/prefs', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (typeof b.showImages !== 'boolean') return res.status(400).json({ message: 'Informe showImages (verdadeiro ou falso).' });
    await pool.query(
      "UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('mail', COALESCE(preferences->'mail', '{}'::jsonb) || jsonb_build_object('showImages', $1::boolean)) WHERE id=$2",
      [b.showImages, req.user.id],
    );
    res.json(readPrefs({ showImages: b.showImages }));
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

// Monta o e-mail de saída (envio e rascunho usam o mesmo caminho, então o rascunho fica igual ao que seria enviado).
// `b.draftMessageId` + `b.draftParts`: anexos que já estão no rascunho salvo (não precisam subir de novo do navegador).
async function buildOutgoing(req, gmail, b, { draft = false } = {}) {
  const mode = MODES.includes(b.mode) ? b.mode : 'new';
  const to = parseRecipients(b.to); const cc = parseRecipients(b.cc); const bcc = parseRecipients(b.bcc);
  const invalid = [...to.invalid, ...cc.invalid, ...bcc.invalid];
  if (invalid.length && !draft) return { status: 400, message: `Endereço de e-mail inválido: ${invalid.slice(0, 3).join(', ')}. Confira e tente de novo.` };
  const count = to.valid.length + cc.valid.length + bcc.valid.length;
  if (!count && !draft) return { status: 400, message: 'Informe ao menos um destinatário.' };
  if (count > MAX_RECIPIENTS) return { status: 400, message: `São ${count} destinatários; o limite é ${MAX_RECIPIENTS} por e-mail.` };
  if (mode !== 'new' && !ID_RE.test(String(b.messageId || ''))) return { status: 400, message: 'Não achei a mensagem original desta resposta.' };
  const uploads = (Array.isArray(b.attachments) ? b.attachments : []).slice(0, 50).map((a) => ({
    filename: String((a && a.filename) || 'anexo').slice(0, 200), mimeType: String((a && a.mimeType) || ''), data: Buffer.from(String((a && a.data) || ''), 'base64'),
  }));
  const tooBig = sizeError(attachmentsSize(uploads));
  if (tooBig) return { status: 413, message: tooBig };
  const blocked = uploads.map(attachmentBlockReason).find(Boolean);
  if (blocked) return { status: 400, message: blocked };

  const me = await myAddress(req, gmail);
  const orig = mode === 'new' ? null : await loadOriginal(gmail, b.messageId);
  const pull = async (msg, partIds) => {
    const keep = new Set((Array.isArray(partIds) ? partIds : []).map(String));
    const picked = msg.attachments.filter((a) => keep.has(a.partId));
    return mapLimit(picked, 4, async (a) => {
      const part = findPart(msg.payload, a.partId) || {};
      const body = part.body || {};
      const data = body.attachmentId
        ? (await gmail.users.messages.attachments.get({ userId: 'me', messageId: msg.id, id: body.attachmentId })).data.data
        : body.data;
      return { filename: a.filename, mimeType: a.mimeType, data: Buffer.from(data || '', 'base64url') };
    });
  };
  const forwarded = mode === 'forward' ? await pull(orig, b.forwardParts) : [];
  const fromDraft = ID_RE.test(String(b.draftMessageId || '')) && Array.isArray(b.draftParts) && b.draftParts.length
    ? await pull(await loadOriginal(gmail, b.draftMessageId), b.draftParts) : [];
  const err = sizeError(attachmentsSize(uploads) + attachmentsSize(forwarded) + attachmentsSize(fromDraft));
  if (err) return { status: 413, message: err };

  const { signature } = b.signature === false ? { signature: null } : await readSignature(req.user);
  const sig = signature && signature.enabled && signatureHasContent(signature) ? signature : null;
  const quote = orig && b.includeQuote !== false ? buildQuote(orig, mode === 'forward' ? 'forward' : 'reply') : null;
  const body = composeBody({ html: String(b.html || ''), signature: sig, quote });
  const imgErr = sizeError(attachmentsSize(uploads) + attachmentsSize(forwarded) + attachmentsSize(fromDraft) + attachmentsSize(body.images));
  if (imgErr) return { status: 413, message: imgErr.replace('Os anexos somam', 'Anexos e imagens somam') };
  const threaded = orig && mode !== 'forward';
  const raw = buildMime({
    from: { name: (sig && sig.name) || req.user.name || '', email: me },
    to: to.valid, cc: cc.valid, bcc: bcc.valid,
    subject: String(b.subject || '').slice(0, 500) || (orig ? replySubject(orig.subject, mode) : ''),
    html: body.html, text: body.text,
    inReplyTo: threaded ? orig.messageIdHeader : '',
    references: threaded ? `${orig.references} ${orig.messageIdHeader}` : '',
    inline: [
      ...(body.usesLogo ? [{ cid: LOGO_CID, mimeType: 'image/png', data: LOGO }] : []),
      ...(body.usesSigImage ? [{ cid: SIG_IMAGE_CID, mimeType: sig.image.mimeType, data: Buffer.from(sig.image.data, 'base64') }] : []),
      ...body.images,
    ],
    attachments: [...fromDraft, ...forwarded, ...uploads],
    headers: draft ? [[DRAFT_HEADER, draftMeta({ mode, messageId: b.messageId, includeQuote: b.includeQuote, signature: b.signature })]] : [],
  });
  // Rascunho feito no Gmail dentro de uma conversa (sem o nosso cabeçalho): continua na mesma conversa.
  return { raw, threadId: threaded ? orig.threadId : (ID_RE.test(String(b.threadId || '')) ? b.threadId : null) };
}

router.post('/send', async (req, res) => {
  const b = req.body || {};
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const out = await buildOutgoing(req, gmail, b);
    if (out.message) return res.status(out.status).json({ message: out.message });
    const { data } = await gmail.users.messages.send({
      userId: 'me',
      requestBody: out.threadId ? { threadId: out.threadId } : {},
      media: { mimeType: 'message/rfc822', body: out.raw },
    });
    // Enviado a partir de um rascunho: o rascunho sai de Rascunhos (como no Gmail/Outlook). Falhar aqui não desfaz o envio.
    if (ID_RE.test(String(b.draftId || ''))) await gmail.users.drafts.delete({ userId: 'me', id: b.draftId }).catch(() => {});
    res.json({ ok: true, id: data.id, threadId: data.threadId });
  } catch (e) { fail(res, e); }
});

// --- Pacote de produtividade (2026-11-02): rascunhos, pastas, regras, contatos -----------------------------------

const draftAttachments = (msg) => msg.attachments.map(({ partId, filename, mimeType, size }) => ({ partId, filename, mimeType, size }));

// Salva (cria ou atualiza) o rascunho no Gmail e devolve o id da mensagem nova e os anexos que ficaram nele.
router.post('/drafts', async (req, res) => {
  const b = req.body || {};
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const out = await buildOutgoing(req, gmail, b, { draft: true });
    if (out.message) return res.status(out.status).json({ message: out.message });
    const params = { userId: 'me', requestBody: { message: out.threadId ? { threadId: out.threadId } : {} }, media: { mimeType: 'message/rfc822', body: out.raw } };
    const draftId = ID_RE.test(String(b.draftId || '')) ? b.draftId : null;
    const { data } = draftId ? await gmail.users.drafts.update({ ...params, id: draftId }) : await gmail.users.drafts.create(params);
    const msg = await loadOriginal(gmail, data.message.id);
    res.json({ draftId: data.id, draftMessageId: data.message.id, attachments: draftAttachments(msg) });
  } catch (e) {
    if ((e.code === 404 || (e.response && e.response.status === 404)) && b.draftId) return res.status(409).json({ message: 'Este rascunho foi apagado ou enviado em outro lugar (Gmail ou celular). Copie o texto se precisar.', code: 'draft_gone' });
    fail(res, e);
  }
});

// Acha o rascunho de uma conversa (a lista de Rascunhos mostra conversas; o Gmail guarda o rascunho com id próprio).
router.get('/drafts/by-thread/:threadId', async (req, res) => {
  if (!ID_RE.test(req.params.threadId)) return res.status(400).json({ message: 'Conversa inválida.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    let pageToken; let hit = null;
    for (let i = 0; i < 5 && !hit; i += 1) {
      const { data } = await gmail.users.drafts.list({ userId: 'me', maxResults: 100, pageToken });
      const all = (data.drafts || []).filter((d) => d.message && d.message.threadId === req.params.threadId);
      if (all.length) hit = all[all.length - 1];
      pageToken = data.nextPageToken; if (!pageToken) break;
    }
    if (!hit) return res.status(404).json({ message: 'Não achei o rascunho desta conversa. Atualize a lista.' });
    res.json({ draftId: hit.id });
  } catch (e) { fail(res, e); }
});

// Dados para reabrir o rascunho na janela de escrita.
router.get('/drafts/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ message: 'Rascunho inválido.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { data } = await gmail.users.drafts.get({ userId: 'me', id: req.params.id, format: 'full' });
    const msg = await loadOriginal(gmail, data.message.id);
    const h = headerMap(data.message.payload && data.message.payload.headers);
    const meta = parseDraftMeta(h[DRAFT_HEADER.toLowerCase()]) || { mode: 'new', messageId: '', includeQuote: false, signature: false };
    const ours = !!h[DRAFT_HEADER.toLowerCase()];
    let quotePreview = '';
    if (meta.mode !== 'new' && ID_RE.test(meta.messageId)) {
      const orig = await loadOriginal(gmail, meta.messageId).catch(() => null);
      if (orig) quotePreview = sanitizeMailHtml(buildQuote(orig, meta.mode === 'forward' ? 'forward' : 'reply').html).html;
      else meta.mode = 'new';
    }
    let bodyHtml = msg.html ? draftBodyHtml(msg.html) : (msg.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    // Imagens coladas no corpo (cid:img-…) voltam como data: para aparecer no editor; ao gravar de novo viram cid outra vez.
    const bodyImgs = msg.inline.filter((a) => a.contentId.startsWith(BODY_IMAGE_PREFIX) && bodyHtml.includes(`cid:${a.contentId}`)).slice(0, 20);
    if (bodyImgs.length) {
      const parts = await mapLimit(bodyImgs, 4, async (a) => {
        const part = findPart(msg.payload, a.partId) || {};
        const pb = part.body || {};
        const data = pb.attachmentId ? (await gmail.users.messages.attachments.get({ userId: 'me', messageId: msg.id, id: pb.attachmentId })).data.data : pb.data;
        return { cid: a.contentId, mimeType: a.mimeType, data: Buffer.from(data || '', 'base64url') };
      });
      bodyHtml = restoreInlineImages(bodyHtml, parts);
    }
    res.json({
      draftId: data.id, draftMessageId: data.message.id, threadId: ours ? null : data.message.threadId, ...meta, ours,
      to: msg.to, cc: msg.cc, bcc: parseAddressList(h.bcc), subject: msg.subject,
      html: sanitizeOutgoingHtml(bodyHtml), quotePreview, attachments: draftAttachments(msg),
    });
  } catch (e) { fail(res, e); }
});

// Descartar rascunho (o Gmail não tem lixeira para rascunho; a tela confirma antes).
router.delete('/drafts/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ message: 'Rascunho inválido.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    await gmail.users.drafts.delete({ userId: 'me', id: req.params.id });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

const cleanLabelName = (v) => String(v || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

const COLOR_ERROR = 'Escolha uma das cores da lista (o Gmail só aceita a paleta dele).';
const labelOut = (d) => ({ id: d.id, name: d.name, color: d.color ? d.color.backgroundColor : null, textColor: d.color ? d.color.textColor : null });

router.post('/labels', async (req, res) => {
  const name = cleanLabelName(req.body && req.body.name);
  const color = labelColorFor(req.body && req.body.color);
  if (!name) return res.status(400).json({ message: 'Dê um nome para a pasta.' });
  if (color === false) return res.status(400).json({ message: COLOR_ERROR });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { data } = await gmail.users.labels.create({ userId: 'me', requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show', ...(color ? { color } : {}) } });
    res.json(labelOut(data));
  } catch (e) {
    if ((e.code === 409 || (e.response && e.response.status === 409))) return res.status(409).json({ message: `Já existe uma pasta chamada “${name}”.` });
    fail(res, e);
  }
});

// Renomear e/ou mudar a cor. Tirar a cor (color: null) usa labels.update sem o campo color: o patch não apaga campo.
router.patch('/labels/:id', async (req, res) => {
  const b = req.body || {};
  const name = b.name === undefined ? undefined : cleanLabelName(b.name);
  const color = labelColorFor(b.color);
  if (!LABEL_RE.test(req.params.id)) return res.status(400).json({ message: 'Só dá para mudar pastas criadas por você.' });
  if (name === '' || (name === undefined && color === undefined)) return res.status(400).json({ message: 'Dê um nome para a pasta.' });
  if (color === false) return res.status(400).json({ message: COLOR_ERROR });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    let data;
    if (color === null) {
      const cur = (await gmail.users.labels.get({ userId: 'me', id: req.params.id })).data;
      ({ data } = await gmail.users.labels.update({ userId: 'me', id: req.params.id, requestBody: { id: cur.id, name: name || cur.name, labelListVisibility: cur.labelListVisibility, messageListVisibility: cur.messageListVisibility } }));
    } else {
      ({ data } = await gmail.users.labels.patch({ userId: 'me', id: req.params.id, requestBody: { ...(name ? { name } : {}), ...(color ? { color } : {}) } }));
    }
    res.json(labelOut(data));
  } catch (e) {
    if ((e.code === 409 || (e.response && e.response.status === 409))) return res.status(409).json({ message: `Já existe uma pasta chamada “${name}”.` });
    fail(res, e);
  }
});

// Regras = filtros do Gmail ("de: fulano" → pasta X, fora da Entrada). Valem mesmo com o painel fechado, no Gmail e no celular.
function rulesError(res, e) {
  const msg = String((e && e.message) || '');
  if ((e.code === 403 || (e.response && e.response.status === 403)) && /insufficient|scope/i.test(msg)) {
    return res.status(409).json({ message: 'Para criar regras, reconecte o Gmail uma vez (botão "Reconectar o Gmail") e aceite a permissão de configurações.', code: 'rules_not_allowed' });
  }
  if (/already exists/i.test(msg)) return res.status(409).json({ message: 'Já existe uma regra igual para esse remetente.' });
  return fail(res, e);
}

router.get('/rules', async (req, res) => {
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const [{ data: f }, { data: l }] = await Promise.all([gmail.users.settings.filters.list({ userId: 'me' }), gmail.users.labels.list({ userId: 'me' })]);
    const names = Object.fromEntries((l.labels || []).map((x) => [x.id, x.name]));
    const rules = (f.filter || []).map((x) => {
      const add = ((x.action && x.action.addLabelIds) || []).find((id) => LABEL_RE.test(id));
      const from = x.criteria && x.criteria.from;
      if (!add || !from) return null;
      return { id: x.id, from, labelId: add, labelName: names[add] ? labelDisplay(names[add]) : '(pasta apagada)', skipInbox: ((x.action && x.action.removeLabelIds) || []).includes('INBOX'), other: Object.keys(x.criteria).length > 1 };
    }).filter(Boolean);
    res.json({ rules });
  } catch (e) { rulesError(res, e); }
});

router.post('/rules', async (req, res) => {
  const from = String((req.body && req.body.from) || '').trim().toLowerCase();
  const labelId = String((req.body && req.body.labelId) || '');
  if (!isEmail(from)) return res.status(400).json({ message: 'Informe o e-mail do remetente.' });
  if (!LABEL_RE.test(labelId)) return res.status(400).json({ message: 'Escolha a pasta da regra.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { data } = await gmail.users.settings.filters.create({ userId: 'me', requestBody: { criteria: { from }, action: { addLabelIds: [labelId], removeLabelIds: ['INBOX'] } } });
    let moved = 0;
    if (req.body.applyExisting) {
      const { data: list } = await gmail.users.threads.list({ userId: 'me', q: `from:${from} in:inbox`, maxResults: 100 });
      const ids = (list.threads || []).map((t) => t.id);
      await mapLimit(ids, 5, (id) => gmail.users.threads.modify({ userId: 'me', id, requestBody: { addLabelIds: [labelId], removeLabelIds: ['INBOX'] } }));
      moved = ids.length;
    }
    res.json({ id: data.id, moved });
  } catch (e) { rulesError(res, e); }
});

router.delete('/rules/:id', async (req, res) => {
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(req.params.id)) return res.status(400).json({ message: 'Regra inválida.' });
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    await gmail.users.settings.filters.delete({ userId: 'me', id: req.params.id });
    res.json({ ok: true });
  } catch (e) { rulesError(res, e); }
});

// Sugestão de destinatários: para quem a pessoa mais escreveu (últimos 150 enviados, guardado 30 min em memória) + contatos do CRM.
const sentCache = new Map(); // userId -> { at, list: [{ name, email, n }] }
const SENT_TTL = 30 * 60 * 1000;

async function sentContacts(userId, gmail) {
  const hit = sentCache.get(userId);
  if (hit && Date.now() - hit.at < SENT_TTL) return hit.list;
  if (hit && hit.pending) return hit.pending;
  const pending = (async () => {
    const { data } = await gmail.users.messages.list({ userId: 'me', q: 'in:sent', maxResults: 150 });
    const msgs = await mapLimit(data.messages || [], 8, (m) => gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['To', 'Cc'] }).then((r) => r.data).catch(() => null));
    const byEmail = new Map();
    for (const m of msgs.filter(Boolean)) {
      const h = headerMap(m.payload && m.payload.headers);
      for (const p of [...parseAddressList(h.to), ...parseAddressList(h.cc)]) {
        const email = String(p.email || '').toLowerCase();
        if (!isEmail(email)) continue;
        const cur = byEmail.get(email) || { name: '', email, n: 0 };
        cur.n += 1; if (!cur.name && p.name && p.name !== email) cur.name = p.name;
        byEmail.set(email, cur);
      }
    }
    const list = [...byEmail.values()].sort((a, b) => b.n - a.n);
    sentCache.set(userId, { at: Date.now(), list });
    return list;
  })();
  sentCache.set(userId, { ...(hit || {}), at: 0, pending });
  try { return await pending; } catch (e) { sentCache.delete(userId); throw e; }
}

router.get('/contacts', async (req, res) => {
  const q = foldText(String(req.query.q || '').trim()).slice(0, 80);
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const sent = await sentContacts(req.user.id, gmail).catch(() => []);
    if (!q) return res.json({ contacts: [] });
    // Gmail (por frequência) e CRM entram juntos e a ordem final é a de rankContacts: quem começa com o que foi digitado vem antes.
    const cands = sent.filter((c) => contactRank(c, q) < 3).slice(0, 40).map((c) => ({ name: c.name, email: c.email, source: 'gmail' }));
    if (crmRoleOf(req.user) && req.user.orgId) {
      const typed = String(req.query.q).trim().slice(0, 80).replace(/[%_\\]/g, '');
      const { rows } = await pool.query(
        `SELECT first_name, last_name, email FROM crm_contacts WHERE org_id=$1 AND deleted_at IS NULL AND email <> ''
           AND (first_name ILIKE $2 OR last_name ILIKE $2 OR (first_name || ' ' || last_name) ILIKE $2 OR email ILIKE $2)
         ORDER BY (first_name ILIKE $3 OR email ILIKE $3) DESC, first_name LIMIT 20`,
        [req.user.orgId, `%${typed}%`, `${typed}%`],
      );
      for (const r of rows) {
        const email = String(r.email).trim().toLowerCase();
        if (!isEmail(email) || cands.some((c) => c.email === email)) continue;
        cands.push({ name: `${r.first_name} ${r.last_name}`.trim(), email, source: 'crm' });
      }
    }
    const out = rankContacts(cands, q);
    res.json({ contacts: out });
  } catch (e) { fail(res, e); }
});

// Aviso de e-mail novo: as 10 conversas não lidas mais recentes da Entrada (a tela compara com as que já conhecia).
router.get('/inbox-peek', async (req, res) => {
  const gmail = await withGmail(req, res); if (!gmail) return;
  try {
    const { data } = await gmail.users.threads.list({ userId: 'me', labelIds: ['INBOX', 'UNREAD'], maxResults: 10 });
    const full = await mapLimit(data.threads || [], 5, (t) => gmail.users.threads.get({ userId: 'me', id: t.id, format: 'metadata', metadataHeaders: ['From', 'Subject'] }).then((r) => r.data).catch(() => null));
    res.json({ threads: full.filter(Boolean).map(threadSummary).map(({ id, subject, from, date, snippet }) => ({ id, subject, from, date, snippet })) });
  } catch (e) { fail(res, e); }
});
