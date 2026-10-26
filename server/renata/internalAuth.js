// Entrada interna da RENATA (§101): as ferramentas dela chamam as MESMAS rotas que a tela chama, por loopback (127.0.0.1) dentro do próprio
// servidor, com a identidade de quem pediu — então validação, regras de negócio e permissões são exatamente as da interface (nada é refeito
// nem contornado). A credencial é um segredo aleatório gerado a cada subida do processo, que só existe na memória: não é token, não vai ao
// navegador, não é gravada, e só vale em conexão que chegue do próprio servidor.
import crypto from 'node:crypto';

const SECRET = crypto.randomBytes(32).toString('hex');
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const H_SECRET = 'x-renata-internal';
export const H_USER = 'x-renata-user';
export const H_COMMAND = 'x-renata-command';

export function internalHeaders(userId, commandId) {
  return { [H_SECRET]: SECRET, [H_USER]: String(userId), [H_COMMAND]: String(commandId || '') };
}

// Devolve {userId, commandId} se a requisição é uma chamada interna legítima; senão null.
export function readInternal(req) {
  const given = String((req.headers && req.headers[H_SECRET]) || '');
  if (!given || given.length !== SECRET.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(SECRET))) return null;
  const addr = (req.socket && req.socket.remoteAddress) || '';
  if (!LOOPBACK.has(addr)) return null;
  const userId = String(req.headers[H_USER] || '');
  return userId ? { userId, commandId: String(req.headers[H_COMMAND] || '') } : null;
}
