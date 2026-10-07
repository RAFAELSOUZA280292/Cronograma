// Descrição formatada dos cartões do quadro pessoal (2026-10-07): o campo `desc` continua sendo uma string — texto simples
// (cartões antigos, API de conectividade) OU um HTML curto (negrito, itálico, listas, link) vindo do editor. Quem diz qual é
// é `card.descFormat === 'html'` (nunca o conteúdo: um texto simples com "<b>" literal continua sendo texto). HTML nunca é
// gravado sem passar por aqui, e quem lê como texto (API, busca) usa noteToText.
import sanitizeHtml from 'sanitize-html';

const MAX_NOTE = 50000;

export function sanitizeNoteHtml(html) {
  return sanitizeHtml(String(html || '').slice(0, MAX_NOTE), {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: attribs.href ? { href: attribs.href, target: '_blank', rel: 'noopener noreferrer nofollow' } : {},
      }),
    },
  });
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

// Texto puro de uma descrição (HTML ou não): quebras no fim de parágrafo/item, sem etiquetas.
export function noteToText(desc, format) {
  const s = String(desc || '');
  if (format !== 'html') return s;
  return s
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Passa por todos os cartões do quadro (um board ou { boards }) e higieniza as descrições que são HTML. Mexe no próprio objeto.
export function sanitizeBoardNotes(boardOrData) {
  const boards = Array.isArray(boardOrData && boardOrData.boards) ? boardOrData.boards : [boardOrData];
  for (const b of boards) {
    for (const col of (b && b.columns) || []) {
      for (const card of (col && col.cards) || []) {
        if (!card) continue;
        if (card.descFormat !== undefined && card.descFormat !== 'html') delete card.descFormat;
        if (card.descFormat === 'html' && typeof card.desc === 'string') card.desc = sanitizeNoteHtml(card.desc);
        else if (typeof card.desc === 'string' && card.desc.length > MAX_NOTE) card.desc = card.desc.slice(0, MAX_NOTE);
      }
    }
  }
  return boardOrData;
}
