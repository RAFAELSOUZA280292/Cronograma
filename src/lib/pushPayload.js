// Funções puras do aviso push (2026-10-17), usadas pelo service worker (src/sw.js) e testáveis em Node.
// O servidor (server/push.js) envia JSON {title, body, url, tag}. Qualquer coisa fora disso vira um aviso genérico — o navegador exige que todo push
// mostre alguma notificação, então nunca devolvemos vazio.
export function parsePush(text) {
  let d = null;
  try { d = text ? JSON.parse(text) : null; } catch { d = null; }
  const o = d && typeof d === 'object' ? d : {};
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    title: s(o.title, 120) || 'PRICETAX',
    body: s(o.body, 300) || 'Você tem uma nova notificação.',
    url: safePath(o.url),
    tag: s(o.tag, 80) || 'pricetax',
  };
}

// Só caminho do próprio sistema ("/empresas"); qualquer outra coisa (outro domínio, esquema estranho) vira a página inicial.
export function safePath(u) {
  if (typeof u !== 'string') return '/';
  const t = u.trim();
  if (!t.startsWith('/') || t.startsWith('//') || /[\s\\]/.test(t) || t.length > 200) return '/';
  return t;
}

export function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
