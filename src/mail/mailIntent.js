// Pedidos de outras telas para a Caixa de e-mail (sem prop drilling): abrir uma conversa (§130) ou escrever para alguém já
// mostrando as conversas com a pessoa — todo clique num e-mail do painel (link mailto:) cai aqui em vez do Outlook/Mail do
// computador (pedido do Rafael, 02/11/2026). A Caixa lê ao montar e também ouve o evento, se já estiver aberta.
export const mailIntent = { threadId: null, compose: null };
export const MAIL_INTENT_EVENT = 'pt:mail-intent';

// "mailto:a@x.com,b@y.com?subject=Oi&cc=c@z.com" → { to: [{ email }], subject } (ou null se não houver endereço válido).
export function parseMailto(href) {
  const raw = String(href || '').replace(/^mailto:/i, '');
  const [addr, qs = ''] = raw.split('?');
  const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  const to = dec(addr).split(/[,;]/).map((s) => s.trim()).filter((s) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s)).map((email) => ({ email }));
  if (!to.length) return null;
  const params = new URLSearchParams(qs);
  return { to, subject: (params.get('subject') || '').slice(0, 300) };
}

export function requestCompose({ to, subject = '' }) {
  mailIntent.compose = { to, subject, search: to.map((p) => p.email).join(' OR ') };
  window.dispatchEvent(new Event(MAIL_INTENT_EVENT));
}
