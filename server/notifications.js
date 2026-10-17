// Central de Notificações (2026-08) — helper de escrita compartilhado entre
// server/xflow.js (menção em comentário, definição de responsável) e
// server/routes.js (menção/vínculo em atividade de empresa). Ver
// PROJECT_CONTEXT.md §20 pro desenho completo (schema, geração, leitura).

import { schedulePushForNotification } from './push.js';

function uid(p) {
  return p + '-' + Math.random().toString(36).slice(2, 9);
}

// `client` pode ser o pool direto ou um client de transação já aberto
// (BEGIN/COMMIT feito por quem chama) — mesma convenção de logEvent() no
// XFlow.
export async function createNotification(client, { orgId, userId, type, title, body, actorName, target }) {
  const id = uid('ntf');
  await client.query(
    `INSERT INTO notifications (id, org_id, user_id, type, title, body, actor_name, target)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, orgId, userId, type, title, body, actorName || '', JSON.stringify(target || {})]
  );
  schedulePushForNotification(id); // aviso no celular (só se o servidor tiver as chaves VAPID); confere no banco antes de enviar
  return id;
}

export function rowToNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    actorName: row.actor_name,
    target: row.target,
    read: row.read,
    createdAt: row.created_at,
  };
}
