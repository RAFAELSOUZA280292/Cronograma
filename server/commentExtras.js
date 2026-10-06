// Anexos, links e @menções de comentário (Onda 3, §81) — um só validador/notificador para Pareceres, Modelos e notas do CRM.
// O formato é o mesmo dos comentários de atividade: anexo { id, name, size, type, dataUrl } e link { id, label, url }.
import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { createNotification } from './notifications.js';

export class ExtrasError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

// Nunca confia no cliente: limita quantidade, tamanho (dataUrl em base64) e só aceita http(s) em link.
export function cleanCommentExtras(attachments, links, { maxAttachments = 5, maxFileChars = 4 * 1024 * 1024 } = {}) {
  const att = (Array.isArray(attachments) ? attachments : []).slice(0, maxAttachments).map((a) => ({
    id: String((a && a.id) || randomUUID()).slice(0, 60),
    name: String((a && a.name) || 'arquivo').slice(0, 200),
    size: Number(a && a.size) || 0,
    type: String((a && a.type) || '').slice(0, 100),
    dataUrl: String((a && a.dataUrl) || ''),
  })).filter((a) => a.dataUrl.startsWith('data:'));
  for (const a of att) {
    if (a.dataUrl.length > maxFileChars) throw new ExtrasError(`"${a.name}" é grande demais (limite de ${Math.round(maxFileChars * 0.75 / (1024 * 1024))} MB por arquivo neste lugar).`);
  }
  const lk = (Array.isArray(links) ? links : []).slice(0, 10).map((l) => ({
    id: String((l && l.id) || randomUUID()).slice(0, 60), label: String((l && l.label) || '').slice(0, 200), url: String((l && l.url) || '').slice(0, 2000),
  })).filter((l) => /^https?:\/\//i.test(l.url));
  return { attachments: att, links: lk };
}

// Notifica quem foi citado (só gente da mesma org, nunca o próprio autor). `client` pode ser pool ou transação.
export async function notifyMentions(client, { orgId, actor, mentions, title, body, target, type = 'mention' }) {
  const ids = [...new Set((Array.isArray(mentions) ? mentions : []).map(String))].filter((u) => u && u !== actor.id).slice(0, 20);
  if (!ids.length) return 0;
  const q = client || pool;
  const { rows } = await q.query('SELECT id FROM users WHERE org_id=$1 AND id = ANY($2::text[])', [orgId, ids]);
  for (const u of rows) {
    await createNotification(q, { orgId, userId: u.id, type, title, body, actorName: actor.name || actor.username || '', target });
  }
  return rows.length;
}
