// Caixa de e-mail, Fase 2 (2026-11-02): montar o e-mail que SAI do painel. Tudo aqui é puro (testado em
// scripts/mail-compose.test.mjs, sem Google). O requisito central é abrir bem no Outlook (Windows) e no celular:
//   multipart/alternative (texto puro + HTML), HTML só com estilo inline (Outlook ignora <style>, classe e flex),
//   assinatura em <table> com Arial, logo embutido por Content-ID (multipart/related; link externo vem bloqueado),
//   cabeçalhos com acento em RFC 2047 (UTF-8, base64), corpo em quoted-printable e anexos em base64, linhas com CRLF.
// Estrutura final: mixed[ alternative[ text/plain, related[ text/html, logo ] ], anexos… ] — a mesma do Gmail e do
// Apple Mail; o Outlook e o Mail do iPhone mostram o logo dentro da assinatura e não como anexo solto.

import crypto from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { parseAddressList, sanitizeMailHtml } from './googleMail.js';

export const MAX_ATTACH_BYTES = 20 * 1024 * 1024;
export const MAX_RECIPIENTS = 100;
const FONT = 'font-family:Arial,Helvetica,sans-serif';
const TEXT_STYLE = `${FONT};font-size:14px;line-height:1.5;color:#222222`;
export const QUOTE_STYLE = 'margin:0 0 0 0.8ex;border-left:1px solid #cccccc;padding-left:1ex';

const oneLine = (s) => String(s == null ? '' : s).replace(/[\r\n\t\0]+/g, ' ').trim();
export const escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- cabeçalhos ----------------------------------------------------------------

// RFC 2047: texto com acento vira =?UTF-8?B?…?=, em pedaços que não partem um caractere ao meio e cabem em 75 colunas.
export function encodeHeaderWord(value) {
  const s = oneLine(value);
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words = [];
  let chunk = '';
  for (const ch of s) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) { words.push(chunk); chunk = ''; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export const isEmail = (s) => typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s);

export function formatAddress({ name, email }) {
  const n = oneLine(name).replace(/[<>]/g, '');
  if (!n || n.toLowerCase() === String(email).toLowerCase()) return email;
  if (/^[\x20-\x7e]*$/.test(n)) return `"${n.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" <${email}>`;
  return `${encodeHeaderWord(n)} <${email}>`;
}

// Aceita texto ("Ana <ana@x.com>; bia@y.com") ou lista de { name, email }. Devolve os válidos (sem repetir) e os inválidos.
export function parseRecipients(input) {
  const list = Array.isArray(input)
    ? input.map((x) => (typeof x === 'string' ? parseAddressList(x) : [x])).flat()
    : parseAddressList(String(input || '').replace(/;/g, ','));
  const valid = []; const invalid = [];
  for (const a of list) {
    const email = oneLine(a && a.email).replace(/^mailto:/i, '');
    if (!email) continue;
    if (!isEmail(email)) { invalid.push(email); continue; }
    if (!valid.some((v) => v.email.toLowerCase() === email.toLowerCase())) valid.push({ name: oneLine(a.name), email });
  }
  return { valid, invalid };
}

// --- codificação do corpo ---------------------------------------------------------

export function qpEncode(str) {
  return String(str).replace(/\r\n|\r/g, '\n').split('\n').map((line) => {
    const bytes = Buffer.from(line, 'utf8');
    let out = ''; let cur = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      const last = i === bytes.length - 1;
      const tok = (b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !last) ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, '0')}`;
      if (cur.length + tok.length > 75) { out += `${cur}=\r\n`; cur = ''; }
      cur += tok;
    }
    return out + cur;
  }).join('\r\n');
}

export const base64Lines = (buf) => Buffer.from(buf).toString('base64').replace(/.{76}(?=.)/g, '$&\r\n');

// --- HTML de saída ---------------------------------------------------------------

// O editor (Tiptap) produz <p>, <strong>, <em>, <u>, <s>, listas, links e citação. Aqui sai qualquer outra coisa e cada
// tag ganha o estilo inline que o Outlook respeita; parágrafo sem margem (Enter = linha nova, como no Gmail).
const OUT_STYLE = {
  p: 'margin:0;padding:0',
  ul: 'margin:0 0 0 24px;padding:0',
  ol: 'margin:0 0 0 24px;padding:0',
  li: 'margin:0;padding:0',
  blockquote: QUOTE_STYLE,
  a: 'color:#1155cc;text-decoration:underline',
};
export function sanitizeOutgoingHtml(html) {
  const styled = Object.fromEntries(Object.entries(OUT_STYLE).map(([tag, style]) => [tag, (tagName, attribs) => ({
    tagName, attribs: tag === 'a' ? { href: attribs.href, target: '_blank', style } : { style },
  })]));
  const bare = (tagName) => ({ tagName, attribs: {} });
  const clean = sanitizeHtml(String(html || ''), {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'a', 'ul', 'ol', 'li', 'blockquote', 'span', 'div'],
    allowedAttributes: { a: ['href', 'target', 'style'], p: ['style'], ul: ['style'], ol: ['style'], li: ['style'], blockquote: ['style'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'title', 'head'],
    transformTags: { ...styled, span: bare, div: bare },
  });
  return clean.replace(/<p style="margin:0;padding:0"><\/p>/g, '<p style="margin:0;padding:0"><br></p>');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ' };
function decodeEntities(s) {
  return String(s).replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m, k) => ENTITIES[k])
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)));
}

// Versão em texto puro (a parte text/plain; também é o que relógios, filtros e leitores de tela usam).
export function htmlToText(html) {
  let s = String(html || '')
    .replace(/<(style|script|head|title)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
      const label = inner.replace(/<[^>]+>/g, '').trim();
      const url = decodeEntities(href).replace(/^mailto:/i, '');
      return !label || decodeEntities(label) === url ? url : `${label} (${url})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|tr|h[1-6]|ul|ol|table|blockquote)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// --- citação (responder / encaminhar) -----------------------------------------------

const TZ = 'America/Sao_Paulo';
export function fmtQuoteDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  return `${date} às ${time}`;
}

const personText = (p) => (p && p.name ? `${p.name} <${p.email}>` : (p && p.email) || '');
const peopleText = (list) => (list || []).map(personText).join(', ');

export function replySubject(subject, mode) {
  const s = oneLine(subject) || '(sem assunto)';
  if (mode === 'forward') return /^(enc|fwd?|tr)\s*:/i.test(s) ? s : `Enc: ${s}`;
  return /^(re|res|resp)\s*:/i.test(s) ? s : `Re: ${s}`;
}

// HTML do e-mail original pronto para citar: higienizado como na leitura, sem imagem embutida (cid: não viaja) e
// com as imagens externas de volta (quem recebe decide se mostra).
export function quoteSourceHtml(original) {
  if (original.html) return sanitizeMailHtml(original.html).html.replace(/ data-pt-src="/g, ' src="');
  return `<div style="white-space:pre-wrap">${escapeHtml(original.text || '')}</div>`;
}

// original = { from, to, cc, date, subject, html, text }
export function buildQuote(original, mode) {
  const body = quoteSourceHtml(original);
  const plain = original.text || htmlToText(original.html || '');
  if (mode === 'forward') {
    const rows = [
      ['De', personText(original.from)], ['Data', fmtQuoteDate(original.date)], ['Assunto', original.subject || ''],
      ['Para', peopleText(original.to)], ['Cc', peopleText(original.cc)],
    ].filter(([, v]) => v);
    const head = `<div style="${TEXT_STYLE}">---------- Mensagem encaminhada ---------<br>${rows.map(([k, v]) => `${k}: ${escapeHtml(v)}`).join('<br>')}</div><br>`;
    return {
      html: `<div style="${TEXT_STYLE}">${head}${body}</div>`,
      text: `---------- Mensagem encaminhada ---------\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${plain}`,
    };
  }
  const intro = `Em ${fmtQuoteDate(original.date)}, ${personText(original.from)} escreveu:`;
  return {
    html: `<div style="${TEXT_STYLE}">${escapeHtml(intro)}<br></div><blockquote style="${QUOTE_STYLE}">${body}</blockquote>`,
    text: `${intro}\n${plain.split('\n').map((l) => `> ${l}`).join('\n')}`,
  };
}

// Para quem vai a resposta. `me` = e-mail da própria pessoa (não responde a si mesma; se a mensagem original é dela,
// responde aos destinatários originais, como o Gmail).
export function replyRecipients(original, me, mode) {
  const mine = (p) => p && p.email && String(p.email).toLowerCase() === String(me || '').toLowerCase();
  const fromMe = mine(original.from);
  let to = fromMe ? (original.to || []) : ((original.replyTo && original.replyTo.length ? original.replyTo : [original.from]).filter(Boolean));
  let cc = [];
  if (mode === 'replyAll') cc = [...(fromMe ? [] : original.to || []), ...(original.cc || [])];
  const seen = new Set();
  const keep = (p) => {
    const k = p && p.email && p.email.toLowerCase();
    if (!k || mine(p) || seen.has(k)) return false;
    seen.add(k); return true;
  };
  to = to.filter(keep); cc = cc.filter(keep);
  if (!to.length && fromMe && original.to && original.to.length) to = original.to.slice(0, 1);
  return { to, cc };
}

// --- assinatura -----------------------------------------------------------------

export const LOGO_CID = 'logo-pricetax@pricetax.com.br';
export const SIGNATURE_FIELDS = ['name', 'role', 'phone', 'mobile', 'email', 'site', 'extra'];

export function cleanSignature(input) {
  const s = input && typeof input === 'object' ? input : {};
  const out = { enabled: s.enabled !== false, logo: s.logo !== false };
  for (const k of SIGNATURE_FIELDS) out[k] = oneLine(s[k]).slice(0, k === 'extra' ? 200 : 120);
  return out;
}

export function signatureHasContent(sig) {
  return !!sig && SIGNATURE_FIELDS.some((k) => sig[k]);
}

const siteHref = (site) => (/^https?:\/\//i.test(site) ? site : `https://${site}`);

// Tabela de uma coluna, tudo inline, Arial. O logo vai com width/height fixos (o Outlook ignora o max-width).
export function signatureHtml(sig, { logoSrc = `cid:${LOGO_CID}` } = {}) {
  if (!signatureHasContent(sig)) return '';
  const td = (style, inner) => `<tr><td style="${FONT};${style}">${inner}</td></tr>`;
  const rows = [];
  if (sig.name || sig.role) {
    rows.push(td('font-size:13px;line-height:18px;color:#222222;padding:0 0 8px 0',
      [sig.name ? `<strong style="${FONT};font-size:14px;color:#111111">${escapeHtml(sig.name)}</strong>` : '', sig.role ? `<span style="${FONT};color:#555555">${escapeHtml(sig.role)}</span>` : ''].filter(Boolean).join('<br>')));
  }
  if (sig.logo !== false && logoSrc) {
    rows.push(td('padding:0 0 8px 0', `<img src="${escapeHtml(logoSrc)}" width="140" height="40" alt="PriceTax" style="display:block;border:0;outline:none;text-decoration:none;width:140px;height:40px">`));
  }
  const phones = [sig.phone ? `Tel. ${escapeHtml(sig.phone)}` : '', sig.mobile ? `Cel. ${escapeHtml(sig.mobile)}` : ''].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const links = [
    sig.email && isEmail(sig.email) ? `<a href="mailto:${escapeHtml(sig.email)}" style="color:#1155cc;text-decoration:none">${escapeHtml(sig.email)}</a>` : (sig.email ? escapeHtml(sig.email) : ''),
    sig.site ? `<a href="${escapeHtml(siteHref(sig.site))}" target="_blank" style="color:#1155cc;text-decoration:none">${escapeHtml(sig.site.replace(/^https?:\/\//i, ''))}</a>` : '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const contact = [phones, links, sig.extra ? escapeHtml(sig.extra) : ''].filter(Boolean).join('<br>');
  if (contact) rows.push(td('font-size:12px;line-height:18px;color:#555555', contact));
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${FONT};color:#222222">${rows.join('')}</table>`;
}

export function signatureText(sig) {
  if (!signatureHasContent(sig)) return '';
  return [sig.name, sig.role, sig.logo !== false ? 'PriceTax' : '', [sig.phone && `Tel. ${sig.phone}`, sig.mobile && `Cel. ${sig.mobile}`].filter(Boolean).join(' | '),
    [sig.email, sig.site].filter(Boolean).join(' | '), sig.extra].filter(Boolean).join('\n');
}

// --- corpo completo -----------------------------------------------------------------

// Junta o que a pessoa escreveu + assinatura + citação num HTML (documento inteiro, sem <style>) e no texto puro.
export function composeBody({ html, signature, quote }) {
  const userHtml = sanitizeOutgoingHtml(html);
  const sigHtml = signature ? signatureHtml(signature) : '';
  // Os marcadores em comentário deixam reabrir o rascunho com só o texto da pessoa (sem assinatura e citação), ver `draftBodyHtml`.
  const parts = [`<div style="${TEXT_STYLE}"><!--pt-body-->${userHtml || '<br>'}<!--/pt-body--></div>`];
  if (sigHtml) parts.push(`<br><div style="${TEXT_STYLE}">${sigHtml}</div>`);
  if (quote) parts.push(`<br><div>${quote.html}</div>`);
  const doc = '<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"></head>'
    + `<body style="margin:0;padding:0;${TEXT_STYLE}">${parts.join('')}</body></html>`;
  const sigText = signature ? signatureText(signature) : '';
  const text = [htmlToText(userHtml), sigText ? `-- \n${sigText}` : '', quote ? quote.text : ''].filter(Boolean).join('\n\n');
  return { html: doc, text, usesLogo: !!sigHtml && signature.logo !== false };
}

// --- MIME --------------------------------------------------------------------------

const boundary = (tag) => `=_pt_${tag}_${crypto.randomBytes(12).toString('hex')}`;
const CRLF = '\r\n';

function attachmentHeaders(a) {
  const name = encodeHeaderWord(oneLine(a.filename).replace(/["\\]/g, '_') || 'anexo');
  const type = /^[\w.+-]+\/[\w.+-]+$/.test(a.mimeType || '') ? a.mimeType : 'application/octet-stream';
  return [`Content-Type: ${type}; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`, 'Content-Transfer-Encoding: base64'];
}

// msg = { from:{name,email}, to:[], cc:[], bcc:[], subject, html, text, inReplyTo, references, inline:[{cid,mimeType,data}], attachments:[{filename,mimeType,data}] }
export function buildMime(msg) {
  const head = [`From: ${formatAddress(msg.from)}`];
  if (msg.to && msg.to.length) head.push(`To: ${msg.to.map(formatAddress).join(`,${CRLF} `)}`);
  if (msg.cc && msg.cc.length) head.push(`Cc: ${msg.cc.map(formatAddress).join(`,${CRLF} `)}`);
  if (msg.bcc && msg.bcc.length) head.push(`Bcc: ${msg.bcc.map(formatAddress).join(`,${CRLF} `)}`);
  head.push(`Subject: ${encodeHeaderWord(msg.subject || '')}`);
  head.push(`Date: ${(msg.date || new Date()).toUTCString().replace('GMT', '+0000')}`);
  const ref = (s) => oneLine(s).split(/\s+/).filter((x) => /^<[^<>\s]+>$/.test(x));
  if (msg.inReplyTo && ref(msg.inReplyTo).length) head.push(`In-Reply-To: ${ref(msg.inReplyTo)[0]}`);
  if (msg.references && ref(msg.references).length) head.push(`References: ${ref(msg.references).slice(-20).join(`${CRLF} `)}`);
  for (const [k, v] of msg.headers || []) if (/^X-[A-Za-z0-9-]{1,40}$/.test(k)) head.push(`${k}: ${oneLine(v).slice(0, 900)}`);
  head.push('MIME-Version: 1.0');

  const textPart = ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: quoted-printable', '', qpEncode(msg.text || '')].join(CRLF);
  const htmlPart = ['Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: quoted-printable', '', qpEncode(msg.html || '')].join(CRLF);
  const multipart = (type, parts, extra = '') => {
    const b = boundary(type.split('/')[1].slice(0, 3));
    return { header: `Content-Type: ${type}; boundary="${b}"${extra}`, body: `${parts.map((p) => `--${b}${CRLF}${p}`).join(CRLF)}${CRLF}--${b}--` };
  };
  const asPart = (m) => `${m.header}${CRLF}${CRLF}${m.body}`;

  let htmlSide = htmlPart;
  if (msg.inline && msg.inline.length) {
    const imgs = msg.inline.map((i) => [`Content-Type: ${i.mimeType}`, 'Content-Transfer-Encoding: base64', `Content-ID: <${i.cid}>`, `X-Attachment-Id: ${i.cid.split('@')[0]}`, 'Content-Disposition: inline', '', base64Lines(i.data)].join(CRLF));
    htmlSide = asPart(multipart('multipart/related', [htmlPart, ...imgs], '; type="text/html"'));
  }
  let top = multipart('multipart/alternative', [textPart, htmlSide]);
  if (msg.attachments && msg.attachments.length) {
    const atts = msg.attachments.map((a) => [...attachmentHeaders(a), '', base64Lines(a.data)].join(CRLF));
    top = multipart('multipart/mixed', [asPart(top), ...atts]);
  }
  return `${head.join(CRLF)}${CRLF}${top.header}${CRLF}${CRLF}${top.body}${CRLF}`;
}

export function attachmentsSize(list) {
  return (list || []).reduce((n, a) => n + (a.size != null ? Number(a.size) || 0 : Buffer.byteLength(a.data || '')), 0);
}

export function sizeError(bytes) {
  if (bytes <= MAX_ATTACH_BYTES) return null;
  const mb = (bytes / 1024 / 1024).toFixed(1).replace('.', ',');
  return `Os anexos somam ${mb} MB e o limite é 20 MB por e-mail. Tire algum arquivo ou mande um link do Google Drive.`;
}

// --- Rascunhos (2026-11-02, pacote de produtividade) -----------------------------------------------------------------
// O rascunho fica no Gmail (aparece em Rascunhos no Gmail e no celular) e já leva assinatura e citação montadas. Para o painel
// reabrir na mesma janela, o modo/mensagem original vão num cabeçalho próprio e o texto da pessoa entre marcadores.
export const DRAFT_HEADER = 'X-PT-Compose';

export function draftMeta({ mode, messageId, includeQuote, signature }) {
  const m = ['new', 'reply', 'replyAll', 'forward'].includes(mode) ? mode : 'new';
  return Buffer.from(JSON.stringify({ m, o: m === 'new' ? '' : String(messageId || '').slice(0, 64), q: includeQuote !== false, s: signature !== false })).toString('base64url');
}

export function parseDraftMeta(value) {
  try {
    const j = JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
    const mode = ['new', 'reply', 'replyAll', 'forward'].includes(j.m) ? j.m : 'new';
    return { mode, messageId: mode === 'new' ? '' : String(j.o || ''), includeQuote: j.q !== false, signature: j.s !== false };
  } catch { return null; }
}

export function draftBodyHtml(html) {
  const s = String(html || '');
  const m = s.match(/<!--pt-body-->([\s\S]*?)<!--\/pt-body-->/);
  if (m) return m[1] === '<br>' ? '' : m[1];
  const body = s.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return body ? body[1] : s;
}
