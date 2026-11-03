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
import { blockReason, zipEntryNames } from '../shared/mailAttachments.js';
export { zipEntryNames };

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

// O editor (Tiptap) produz <p>, <strong>, <em>, <u>, <s>, listas, links, citação, <span> com cor/tamanho e <img>. Aqui sai
// qualquer outra coisa e cada tag ganha o estilo inline que o Outlook respeita; parágrafo sem margem (Enter = linha nova).
const OUT_STYLE = {
  p: 'margin:0;padding:0',
  ul: 'margin:0 0 0 24px;padding:0',
  ol: 'margin:0 0 0 24px;padding:0',
  li: 'margin:0;padding:0',
  blockquote: QUOTE_STYLE,
  a: 'color:#1155cc;text-decoration:underline',
};
export const FONT_SIZES = { small: '12px', large: '18px' };
export const MAX_IMAGE_WIDTH = 600;
const hex2 = (n) => Math.max(0, Math.min(255, Number(n) || 0)).toString(16).padStart(2, '0');

// Pacote de personalização (2026-11-02): do estilo do <span> só passam cor (#hex ou rgb(), que o navegador devolve ao
// reabrir o rascunho) e tamanho de 10 a 32 px; o resto (fundo, posição, fonte de fora…) é descartado.
export function cleanSpanStyle(style) {
  const out = [];
  const css = String(style || '');
  const color = css.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  if (color) {
    const v = color[1].trim().toLowerCase();
    const rgb = v.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
    if (/^#[0-9a-f]{6}$/.test(v)) out.push(`color:${v}`);
    else if (/^#[0-9a-f]{3}$/.test(v)) out.push(`color:#${v.slice(1).split('').map((c) => c + c).join('')}`);
    else if (rgb) out.push(`color:#${hex2(rgb[1])}${hex2(rgb[2])}${hex2(rgb[3])}`);
  }
  const size = css.match(/(?:^|;)\s*font-size\s*:\s*(\d{1,2})px/i);
  if (size && Number(size[1]) >= 10 && Number(size[1]) <= 32) out.push(`font-size:${Number(size[1])}px;line-height:1.4`);
  return out.join(';');
}

const IMG_SRC = /^(cid:[A-Za-z0-9._@-]{1,120}|data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+)$/;
// Imagem do corpo: só embutida (cid: no envio; data: na janela de escrita) e com largura em atributo, que o Outlook respeita.
function outImage(tagName, attribs) {
  const src = String(attribs.src || '').trim();
  if (!IMG_SRC.test(src)) return { tagName: 'span', attribs: {} };
  const w = Math.round(Number(attribs.width) || 0);
  const width = w > 0 ? Math.min(w, MAX_IMAGE_WIDTH) : 0;
  const h = Math.round(Number(attribs.height) || 0);
  const height = width && h > 0 && w > 0 ? Math.round((h * width) / w) : 0;
  const out = { src, alt: oneLine(attribs.alt).slice(0, 200) || 'imagem', style: `display:block;border:0;outline:none;max-width:100%;height:auto${width ? `;width:${width}px` : ''}` };
  if (width) out.width = String(width);
  if (height) out.height = String(height);
  return { tagName, attribs: out };
}

export function sanitizeOutgoingHtml(html) {
  const styled = Object.fromEntries(Object.entries(OUT_STYLE).map(([tag, style]) => [tag, (tagName, attribs) => ({
    tagName, attribs: tag === 'a' ? { href: attribs.href, target: '_blank', style } : { style },
  })]));
  const bare = (tagName) => ({ tagName, attribs: {} });
  const span = (tagName, attribs) => { const style = cleanSpanStyle(attribs.style); return { tagName, attribs: style ? { style } : {} }; };
  const clean = sanitizeHtml(String(html || ''), {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'a', 'ul', 'ol', 'li', 'blockquote', 'span', 'div', 'img'],
    allowedAttributes: { a: ['href', 'target', 'style'], p: ['style'], ul: ['style'], ol: ['style'], li: ['style'], blockquote: ['style'], span: ['style'], img: ['src', 'alt', 'width', 'height', 'style'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['cid', 'data'] },
    allowProtocolRelative: false,
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'title', 'head'],
    transformTags: { ...styled, span, div: bare, img: outImage },
  });
  return clean.replace(/<p style="margin:0;padding:0"><\/p>/g, '<p style="margin:0;padding:0"><br></p>');
}

// Imagens coladas/arrastadas no corpo chegam como data: (base64). No e-mail elas viram partes embutidas (multipart/related,
// Content-ID), como o logo: link externo vem bloqueado no Outlook e data: não abre no Gmail nem no Outlook.
export const BODY_IMAGE_PREFIX = 'img-';
export const MAX_BODY_IMAGES = 20;
export function extractInlineImages(html) {
  const images = [];
  const out = String(html || '').replace(/(<img\b[^>]*?\bsrc=")data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)(")/gi, (m, pre, type, b64, post) => {
    if (images.length >= MAX_BODY_IMAGES) return `${pre}${post}`;
    const cid = `${BODY_IMAGE_PREFIX}${images.length + 1}-${crypto.randomBytes(6).toString('hex')}@pricetax.com.br`;
    images.push({ cid, mimeType: `image/${type.toLowerCase()}`, data: Buffer.from(b64, 'base64') });
    return `${pre}cid:${cid}${post}`;
  });
  return { html: out, images };
}

// Reabrir rascunho: as imagens do corpo (cid:) voltam a ser data: para aparecer no editor. `parts` = [{ cid, mimeType, data }].
export function restoreInlineImages(html, parts) {
  const byCid = new Map((parts || []).map((p) => [p.cid, p]));
  return String(html || '').replace(/(<img\b[^>]*?\bsrc=")cid:([^"]+)(")/gi, (m, pre, cid, post) => {
    const p = byCid.get(cid);
    return p ? `${pre}data:${p.mimeType};base64,${Buffer.from(p.data).toString('base64')}${post}` : m;
  });
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

// HTML do e-mail original pronto para citar: higienizado como na leitura e com as imagens externas de volta (quem recebe decide
// se mostra). Imagem EMBUTIDA no original (cid:, ex.: print colado no corpo, logo da assinatura) segue junto (§160; até 03/11/2026
// saía e o encaminhado chegava sem o print): cada uma ganha um Content-ID novo, listado em `images` ({ cid, partId, mimeType }) —
// quem envia busca os bytes no Gmail e embute de novo. Sem a lista (prévia na tela), a imagem embutida fica de fora.
const QUOTE_IMG = 'https://pt-quote.invalid/';
const QUOTE_IMG_TYPES = /^image\/(png|jpe?g|gif|webp)$/;
export const MAX_QUOTE_IMAGES = 20;
const normCid = (c) => String(c || '').trim().replace(/^<|>$/g, '').toLowerCase();
export function quoteSourceHtml(original, images) {
  if (!original.html) return `<div style="white-space:pre-wrap">${escapeHtml(original.text || '')}</div>`;
  const parts = original.parts || [];
  const cidUrl = (cid) => {
    if (!images) return null;
    const a = parts.find((x) => x.contentId && x.partId && normCid(x.contentId) === normCid(cid) && QUOTE_IMG_TYPES.test(String(x.mimeType || '').toLowerCase()));
    if (!a) return null;
    let hit = images.find((i) => i.partId === a.partId);
    if (!hit) {
      if (images.length >= MAX_QUOTE_IMAGES) return null;
      hit = { cid: `pt-q${images.length + 1}-${crypto.randomBytes(4).toString('hex')}@pricetax`, partId: a.partId, mimeType: String(a.mimeType).toLowerCase() };
      images.push(hit);
    }
    return QUOTE_IMG + hit.cid;
  };
  return sanitizeMailHtml(original.html, { cidUrl }).html.replace(/ data-pt-src="/g, ' src="').split(QUOTE_IMG).join('cid:');
}

// original = { from, to, cc, date, subject, html, text, parts? } → { html, text, images }
export function buildQuote(original, mode) {
  const images = [];
  const body = quoteSourceHtml(original, images);
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
      images,
    };
  }
  const intro = `Em ${fmtQuoteDate(original.date)}, ${personText(original.from)} escreveu:`;
  return {
    html: `<div style="${TEXT_STYLE}">${escapeHtml(intro)}<br></div><blockquote style="${QUOTE_STYLE}">${body}</blockquote>`,
    text: `${intro}\n${plain.split('\n').map((l) => `> ${l}`).join('\n')}`,
    images,
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

// Imagem própria da assinatura (foto, banner ou selo; pacote de personalização, 2026-11-02). Fica no
// users.preferences.mail.signature junto com os campos, por isso o limite é pequeno; a tela já reduz antes de subir.
export const SIG_IMAGE_CID = 'assinatura-pricetax@pricetax.com.br';
export const SIG_IMAGE_MAX_BYTES = 200 * 1024;
export const SIG_IMAGE_WIDTH = [40, 600];
const SIG_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

export function cleanSignatureImage(img) {
  if (!img || typeof img !== 'object') return null;
  const mimeType = String(img.mimeType || '').toLowerCase();
  const data = String(img.data || '').replace(/\s+/g, '');
  if (!SIG_IMAGE_TYPES.includes(mimeType) || !/^[A-Za-z0-9+/=]+$/.test(data)) return null;
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > SIG_IMAGE_MAX_BYTES) return null;
  const width = Math.round(Number(img.width) || 0);
  const height = Math.round(Number(img.height) || 0);
  if (width < SIG_IMAGE_WIDTH[0] || width > SIG_IMAGE_WIDTH[1] || height < 10 || height > 600) return null;
  return { mimeType, data: bytes.toString('base64'), width, height, alt: oneLine(img.alt).slice(0, 80) };
}

// Mensagem para a tela quando a imagem foi recusada (a limpeza acima só devolve null).
export function signatureImageError(img) {
  if (!img || typeof img !== 'object') return null;
  if (!SIG_IMAGE_TYPES.includes(String(img.mimeType || '').toLowerCase())) return 'A imagem da assinatura precisa ser PNG, JPG ou GIF.';
  if (Buffer.byteLength(String(img.data || ''), 'base64') > SIG_IMAGE_MAX_BYTES) return 'A imagem da assinatura passou de 200 KB. Use uma imagem menor ou diminua a largura.';
  return cleanSignatureImage(img) ? null : `A largura da imagem precisa ficar entre ${SIG_IMAGE_WIDTH[0]} e ${SIG_IMAGE_WIDTH[1]} px.`;
}

// Dois tipos (pedido do Rafael, 02/11/2026: "as assinaturas na PriceTax não são texto escrito, são imagens"): `image` = só o
// banner pronto; `text` = campos (nome, cargo, contatos) com logo. Os dois aceitam a despedida livre (`closing`, ex.:
// "Atenciosamente,") acima, com negrito opcional. Assinatura salva antes disso não tem `mode` e continua como texto.
// Nome de quem envia (cabeçalho From). É o nome da CONTA no painel; o campo "Nome" da assinatura só serve se a conta não tiver nome e a
// assinatura for de texto. Até 03/11/2026 vinha da assinatura primeiro, e o "Atenciosamente," guardado ali (assinatura de imagem, da
// versão anterior da tela) saiu como nome do Rafael para a KUHN (§154).
export function senderName(user, sig) {
  const own = oneLine(user && user.name).slice(0, 120);
  if (own) return own;
  const fromSig = sig && sig.mode !== 'image' ? oneLine(sig.name).slice(0, 120) : '';
  return /^(atenciosamente|att|abra[cç]os|cordialmente|grato|grata|obrigad[oa])\b/i.test(fromSig) ? '' : fromSig;
}

export function cleanSignature(input) {
  const s = input && typeof input === 'object' ? input : {};
  const out = { enabled: s.enabled !== false, logo: s.logo !== false, mode: s.mode === 'image' ? 'image' : 'text' };
  out.closing = oneLine(s.closing).slice(0, 120);
  out.closingBold = s.closingBold === true;
  for (const k of SIGNATURE_FIELDS) out[k] = oneLine(s[k]).slice(0, k === 'extra' ? 200 : 120);
  out.image = cleanSignatureImage(s.image);
  out.imagePos = s.imagePos === 'top' ? 'top' : 'bottom';
  return out;
}

export function signatureHasContent(sig) {
  if (!sig) return false;
  if (sig.mode === 'image' && sig.image) return true;
  return !!(sig.closing || SIGNATURE_FIELDS.some((k) => sig[k]) || sig.image);
}

const siteHref = (site) => (/^https?:\/\//i.test(site) ? site : `https://${site}`);

// Tabela de uma coluna, tudo inline, Arial. Logo e imagem própria vão com width/height fixos (o Outlook ignora o max-width).
// `imageSrc` padrão = cid da imagem própria; a prévia na tela usa data: (nada sai do painel).
export function signatureHtml(sig, { logoSrc = `cid:${LOGO_CID}`, imageSrc = `cid:${SIG_IMAGE_CID}` } = {}) {
  if (!signatureHasContent(sig)) return '';
  const td = (style, inner) => `<tr><td style="${FONT};${style}">${inner}</td></tr>`;
  const rows = [];
  const img = sig.image && imageSrc
    ? td('padding:0 0 8px 0', `<img src="${escapeHtml(imageSrc)}" width="${sig.image.width}" height="${sig.image.height}" alt="${escapeHtml(sig.image.alt || sig.name || 'Assinatura')}" style="display:block;border:0;outline:none;text-decoration:none;width:${sig.image.width}px;height:${sig.image.height}px">`)
    : '';
  if (sig.closing) {
    rows.push(td('font-size:13px;line-height:18px;color:#222222;padding:0 0 8px 0',
      sig.closingBold ? `<strong style="${FONT};font-size:13px;color:#111111">${escapeHtml(sig.closing)}</strong>` : escapeHtml(sig.closing)));
  }
  // Tipo Imagem sem banner salvo cai no texto (nome e contatos): senão o e-mail saía só com "Atenciosamente,".
  if (sig.mode === 'image' && img) {
    rows.push(img.replace('padding:0 0 8px 0', 'padding:0'));
    return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${FONT};color:#222222">${rows.join('')}</table>`;
  }
  if (img && sig.imagePos === 'top') rows.push(img);
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
  if (img && sig.imagePos !== 'top') rows.push(img.replace('padding:0 0 8px 0', 'padding:8px 0 0 0'));
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${FONT};color:#222222">${rows.join('')}</table>`;
}

export function signatureText(sig) {
  if (!signatureHasContent(sig)) return '';
  if (sig.mode === 'image' && sig.image) return [sig.closing, sig.image.alt || ''].filter(Boolean).join('\n');
  return [sig.closing, sig.name, sig.role, sig.logo !== false ? 'PriceTax' : '', [sig.phone && `Tel. ${sig.phone}`, sig.mobile && `Cel. ${sig.mobile}`].filter(Boolean).join(' | '),
    [sig.email, sig.site].filter(Boolean).join(' | '), sig.extra].filter(Boolean).join('\n');
}

// --- corpo completo -----------------------------------------------------------------

// Junta o que a pessoa escreveu + assinatura + citação num HTML (documento inteiro, sem <style>) e no texto puro.
// `images` = imagens do corpo que viram partes embutidas (extractInlineImages); o texto da pessoa é cortado em 2 MB sem elas.
export function composeBody({ html, signature, quote }) {
  const extracted = extractInlineImages(html);
  const userHtml = sanitizeOutgoingHtml(extracted.html.slice(0, 2_000_000));
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
  const images = extracted.images.filter((i) => userHtml.includes(`cid:${i.cid}`));
  return { html: doc, text, usesLogo: !!sigHtml && !(signature.mode === 'image' && signature.image) && signature.logo !== false, usesSigImage: !!sigHtml && !!signature.image, images };
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

// --- Sugestão de destinatário (pacote de personalização, 2026-11-02) ----------------------------------------------------
// "ra" traz primeiro quem COMEÇA com ra (Rafael, rafael@…), depois quem tem uma palavra do nome começando com ra (Ana Ramos)
// e só então quem apenas contém (Clara). Dentro de cada grupo vale a ordem recebida (quem você mais escreve vem antes).
export const foldText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function contactRank(c, q) {
  const name = foldText(c.name);
  const email = String(c.email || '').toLowerCase();
  if (!q) return 3;
  if (name.startsWith(q) || email.startsWith(q)) return 0;
  if (name.split(/[\s.'-]+/).some((w) => w.startsWith(q)) || email.split(/[@._-]+/).some((w) => w.startsWith(q))) return 1;
  if (name.includes(q) || email.includes(q)) return 2;
  return 3;
}

export function rankContacts(list, query, limit = 8) {
  const q = foldText(query).trim();
  return (list || []).map((c, i) => ({ c, i, r: contactRank(c, q) })).filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || a.i - b.i).slice(0, limit).map((x) => x.c);
}

// --- Anexos bloqueados pelo Gmail (2026-11-02) -------------------------------------------------------------------------
// Motivo (frase pronta) para recusar um anexo antes de mandar ao Gmail, ou null. a = { filename, data:Buffer }.
export const attachmentBlockReason = (a) => blockReason(String((a && a.filename) || ''), a && a.data);
