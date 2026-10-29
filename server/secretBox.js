// Cofre simples para segredos guardados no banco (M2, 2026-10-29): AES-256-GCM com chave derivada de TOKEN_ENC_KEY (ou, na falta, do JWT_SECRET).
// Valores gravados antes disso (texto puro) continuam legíveis: `open` devolve o próprio texto quando não tem o prefixo `enc1:`.
// Trocar o segredo torna os valores já cifrados ilegíveis (`open` devolve null) — a pessoa só reconecta a integração.
import crypto from 'node:crypto';

const PREFIX = 'enc1:';
const key = () => crypto.createHash('sha256').update(`secret-box|${process.env.TOKEN_ENC_KEY || process.env.JWT_SECRET || ''}`).digest();

export const isSealed = (v) => typeof v === 'string' && v.startsWith(PREFIX);

export function seal(text) {
  if (text === null || text === undefined || text === '') return text;
  if (isSealed(text)) return text;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function open(blob) {
  if (blob === null || blob === undefined || blob === '') return blob;
  if (!isSealed(blob)) return blob;
  try {
    const [iv, tag, data] = blob.slice(PREFIX.length).split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return null; }
}
