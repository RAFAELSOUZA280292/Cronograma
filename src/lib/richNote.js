// Descrição formatada do cartão (2026-10-07): a string é texto simples (cartões antigos) ou HTML curto do editor — quem diz
// qual é o formato é `card.descFormat === 'html'`, nunca o conteúdo.
import DOMPurify from 'dompurify';

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sanitizeNote(html) {
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(https?:|mailto:)/i,
  });
}

// O que o editor recebe: HTML sanitizado; texto simples vira um parágrafo por linha.
export function noteToEditorHtml(value, format) {
  const v = String(value || '');
  if (!v.trim()) return '';
  if (format === 'html') return sanitizeNote(v);
  return v.split(/\r?\n/).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

// Texto puro (busca, prévias): sem etiquetas.
export function noteToPlain(value, format) {
  const v = String(value || '');
  if (format !== 'html') return v;
  const tmp = document.createElement('div');
  tmp.innerHTML = sanitizeNote(v.replace(/<\/(p|li)>/gi, '\n$&').replace(/<br\s*\/?>/gi, '\n'));
  return tmp.textContent.trim();
}
