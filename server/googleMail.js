// Caixa de e-mail (2026-11-02, Fase 1: ler e organizar). O painel é só um "cliente" do Gmail da pessoa, como o
// Outlook: nada é copiado para o nosso banco; cada tela pede ao Google na hora. Usa o mesmo login do Google da agenda
// (`google_calendar_connections`), com o escopo `gmail.modify` acrescentado pela própria tela de E-mail.
// Funções puras (endereços, partes MIME, higienização, pastas) ficam aqui para serem testadas sem o Google.

import { google } from 'googleapis';
import sanitizeHtml from 'sanitize-html';
import { getAuthedClientForUser, GMAIL_SCOPE, GMAIL_SETTINGS_SCOPE, googleConfigured } from './googleCalendar.js';

// Pastas fixas da tela. `label` = marcador do Gmail; `q` = pesquisa (o "Arquivo" do Gmail não é um marcador).
export const FOLDERS = {
  INBOX: { label: 'INBOX', name: 'Caixa de entrada' },
  STARRED: { label: 'STARRED', name: 'Com estrela' },
  SENT: { label: 'SENT', name: 'Enviados' },
  DRAFT: { label: 'DRAFT', name: 'Rascunhos' },
  ARCHIVE: { q: '-in:inbox -in:spam -in:trash -in:drafts -in:sent -in:chats', name: 'Arquivo' },
  SPAM: { label: 'SPAM', name: 'Spam' },
  TRASH: { label: 'TRASH', name: 'Lixeira' },
};

export function folderQuery(folder, q) {
  const f = FOLDERS[folder];
  const text = String(q || '').trim().slice(0, 300);
  if (f) return { labelIds: f.label ? [f.label] : undefined, q: [f.q, text].filter(Boolean).join(' ') || undefined, includeSpamTrash: folder === 'SPAM' || folder === 'TRASH' };
  if (/^Label_[\w-]+$/.test(String(folder || ''))) return { labelIds: [folder], q: text || undefined, includeSpamTrash: false };
  return { labelIds: text ? undefined : ['INBOX'], q: text || undefined, includeSpamTrash: false };
}

export function headerMap(headers) {
  const out = {};
  for (const h of headers || []) {
    const k = String(h.name || '').toLowerCase();
    if (!(k in out)) out[k] = h.value || '';
  }
  return out;
}

// "Fulano de Tal" <fulano@x.com>, outro@y.com → [{ name, email }]
export function parseAddressList(value) {
  const out = [];
  const s = String(value || '');
  let buf = '', quoted = false, angle = false;
  const push = () => {
    const t = buf.trim(); buf = '';
    if (!t) return;
    const m = t.match(/^(.*?)<([^>]+)>\s*$/);
    if (m) out.push({ name: m[1].trim().replace(/^"|"$/g, '').replace(/\\"/g, '"').trim(), email: m[2].trim() });
    else out.push({ name: '', email: t.replace(/^"|"$/g, '') });
  };
  for (const ch of s) {
    if (ch === '"' && !angle) quoted = !quoted;
    if (ch === '<' && !quoted) angle = true;
    if (ch === '>' && !quoted) angle = false;
    if (ch === ',' && !quoted && !angle) { push(); continue; }
    buf += ch;
  }
  push();
  return out;
}

function charsetOf(part) {
  const ct = headerMap(part.headers)['content-type'] || '';
  const m = ct.match(/charset\s*=\s*"?([\w.:-]+)"?/i);
  return m ? m[1].toLowerCase() : 'utf-8';
}

export function decodeBody(data, charset = 'utf-8') {
  if (!data) return '';
  const buf = Buffer.from(data, 'base64url');
  try { return new TextDecoder(charset === 'us-ascii' ? 'utf-8' : charset).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

// Percorre as partes MIME: o primeiro text/html e o primeiro text/plain viram o corpo; o resto com nome ou
// Content-ID vira anexo (as imagens "cid:" do corpo apontam para eles).
export function walkParts(payload) {
  const res = { html: '', text: '', attachments: [] };
  const visit = (part) => {
    if (!part) return;
    const mime = String(part.mimeType || '').toLowerCase();
    const h = headerMap(part.headers);
    const body = part.body || {};
    const cid = (h['content-id'] || '').replace(/^<|>$/g, '');
    const isAttachment = !!part.filename || /attachment/i.test(h['content-disposition'] || '');
    if (mime.startsWith('multipart/')) { (part.parts || []).forEach(visit); return; }
    if (!isAttachment && mime === 'text/html' && !res.html && body.data) { res.html = decodeBody(body.data, charsetOf(part)); return; }
    if (!isAttachment && mime === 'text/plain' && !res.text && body.data) { res.text = decodeBody(body.data, charsetOf(part)); return; }
    if (body.attachmentId || body.data) {
      res.attachments.push({
        id: body.attachmentId || null,
        partId: part.partId || null,
        filename: part.filename || (cid ? `imagem-${cid.split('@')[0]}` : 'anexo'),
        mimeType: mime || 'application/octet-stream',
        size: body.size || 0,
        contentId: cid || null,
        inline: !!cid && (!part.filename || /inline/i.test(h['content-disposition'] || '')),
      });
    }
  };
  visit(payload);
  return res;
}

const MAIL_TAGS = ['a', 'abbr', 'b', 'big', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'tt', 'u', 'ul', 'wbr'];
const MAIL_ATTRS = ['align', 'valign', 'width', 'height', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan', 'dir', 'lang', 'title', 'style', 'color', 'face', 'size', 'class'];

// Higieniza o HTML recebido (nada de script, formulário, iframe, evento ou CSS que busca coisa de fora) e prende as
// imagens externas: o endereço vai para `data-pt-src` e só volta para `src` se a pessoa pedir ("Mostrar imagens"),
// como no Outlook — abrir o e-mail não avisa ao remetente que foi lido. `cidUrl(cid)` resolve as imagens embutidas.
export function sanitizeMailHtml(html, { cidUrl = () => null } = {}) {
  let remote = 0;
  const clean = sanitizeHtml(String(html || ''), {
    allowedTags: MAIL_TAGS,
    allowedAttributes: { '*': MAIL_ATTRS, a: ['href', 'name', 'target', 'rel', ...MAIL_ATTRS], img: ['src', 'alt', 'data-pt-src', ...MAIL_ATTRS] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'title', 'head'],
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }),
      img: (tagName, attribs) => {
        const a = { ...attribs };
        const src = String(a.src || '').trim();
        if (/^cid:/i.test(src)) {
          const url = cidUrl(src.slice(4).replace(/^<|>$/g, ''));
          if (url) a.src = url; else delete a.src;
        } else if (/^https?:/i.test(src)) {
          remote += 1;
          a['data-pt-src'] = src;
          delete a.src;
        } else if (!/^data:image\/(png|jpe?g|gif|webp);/i.test(src)) delete a.src;
        return { tagName, attribs: a };
      },
    },
  });
  // CSS com url(), expression() ou @import puxaria coisa de fora (rastreio) — sai o atributo inteiro.
  const noRemoteCss = clean.replace(/\sstyle="([^"]*)"/gi, (m, css) => (/url\s*\(|expression\s*\(|@import|behavior\s*:/i.test(css.replace(/&quot;|&#x27;|&#39;/g, '')) ? '' : m));
  return { html: noRemoteCss, remoteImages: remote };
}

export function textToHtml(text) {
  const esc = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linked = esc.replace(/\bhttps?:\/\/[^\s<>"]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  return `<div style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:14px">${linked}</div>`;
}

export function threadSummary(thread) {
  const msgs = thread.messages || [];
  const last = msgs[msgs.length - 1] || {};
  const lh = headerMap(last.payload && last.payload.headers);
  const first = headerMap(msgs[0] && msgs[0].payload && msgs[0].payload.headers);
  const labels = new Set(msgs.flatMap((m) => m.labelIds || []));
  const people = [];
  for (const m of msgs) {
    const h = headerMap(m.payload && m.payload.headers);
    const isSent = (m.labelIds || []).includes('SENT');
    const who = isSent ? { name: 'Eu', email: '' } : parseAddressList(h.from)[0];
    if (who && !people.some((p) => (p.email && p.email === who.email) || p.name === who.name)) people.push(who);
  }
  const sentTo = parseAddressList(lh.to);
  return {
    id: thread.id,
    subject: first.subject || lh.subject || '(sem assunto)',
    snippet: decodeEntities(last.snippet || thread.snippet || ''),
    from: people.slice(-3),
    to: sentTo.slice(0, 3),
    date: last.internalDate ? new Date(Number(last.internalDate)).toISOString() : null,
    count: msgs.length,
    unread: labels.has('UNREAD'),
    starred: labels.has('STARRED'),
    important: labels.has('IMPORTANT'),
    hasAttachment: msgs.some((m) => walkParts(m.payload).attachments.some((a) => !a.inline)),
    labelIds: [...labels].filter((l) => l.startsWith('Label_')),
  };
}

function decodeEntities(s) {
  return String(s).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// --- chamadas ao Google -------------------------------------------------------

const scopeCache = new Map(); // userId -> { ok, email, at }

export function forgetMailScope(userId) { scopeCache.delete(userId); }

export async function gmailFor(userId) {
  if (!googleConfigured()) return null;
  const client = await getAuthedClientForUser(userId);
  return client ? { client, gmail: google.gmail({ version: 'v1', auth: client }) } : null;
}

export async function mailStatus(userId) {
  if (!googleConfigured()) return { configured: false, connected: false, mail: false };
  const g = await gmailFor(userId);
  if (!g) return { configured: true, connected: false, mail: false };
  const hit = scopeCache.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return { configured: true, connected: true, mail: hit.ok, email: hit.email, rules: hit.rules };
  try {
    const { token } = await g.client.getAccessToken();
    const info = await g.client.getTokenInfo(token);
    const ok = (info.scopes || []).includes(GMAIL_SCOPE);
    const rules = (info.scopes || []).includes(GMAIL_SETTINGS_SCOPE);
    const email = ok ? (await g.gmail.users.getProfile({ userId: 'me' })).data.emailAddress : (info.email || null);
    scopeCache.set(userId, { ok, email, rules, at: Date.now() });
    return { configured: true, connected: true, mail: ok, email, rules };
  } catch (e) {
    return { configured: true, connected: true, mail: false, error: friendlyMailError(e) };
  }
}

export function friendlyMailError(e) {
  const status = e && (e.code || (e.response && e.response.status));
  const msg = String((e && e.message) || '');
  if (/invalid_grant/i.test(msg)) return 'O Google desconectou a sua conta. Clique em "Conectar o Gmail" para entrar de novo.';
  if (status === 403 && /insufficient|scope/i.test(msg)) return 'Falta autorizar o Gmail. Clique em "Conectar o Gmail".';
  if (status === 403 && /has not been used|disabled/i.test(msg)) return 'A API do Gmail não está ligada no Google Cloud do painel. Avise o Rafael.';
  if (status === 429 || /rate limit|quota/i.test(msg)) return 'O Google pediu uma pausa (muitas leituras seguidas). Espere alguns segundos e tente de novo.';
  if (status === 413 || /too large|exceeds/i.test(msg)) return 'O Gmail recusou o e-mail por ser grande demais. Tire algum anexo ou mande um link do Google Drive.';
  if (status === 400 && /invalid (to|cc|bcc|from) header|recipient address/i.test(msg)) return 'O Gmail recusou algum destinatário. Confira os endereços e tente de novo.';
  if (status === 404) return 'Esse e-mail não existe mais (foi apagado ou movido em outro lugar). Atualize a lista.';
  return 'Não consegui falar com o Gmail agora. Tente de novo em instantes.';
}

// Roda as tarefas com no máximo `n` ao mesmo tempo (o Gmail limita leituras por segundo por pessoa).
export async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
