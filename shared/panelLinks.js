// Links internos do painel (02/11/2026, pedido do Rafael: "falta a possibilidade de poder clicar e ir até as pendências"). A RENATA
// escreve [título](/empresas?empresa=…&atividade=…) e o chat desenha um botão que abre o registro ali mesmo (App.jsx, evento
// `pt:open-link`); o mesmo endereço colado no navegador também abre. Uma fonte só para montar (servidor) e ler (tela).

const ID = /^[\w-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export const linkToActivity = (pid, activityId) => `/empresas?${q({ empresa: pid, atividade: activityId })}`;
export const linkToMeeting = (pid, meetingId, todoId) => `/empresas?${q({ empresa: pid, reuniao: meetingId, tarefa: todoId })}`;
export const linkToCompany = (pid) => `/empresas?${q({ empresa: pid })}`;
export const linkToDeal = (dealId) => `/crm?${q({ negocio: dealId })}`;
export const linkToCrmCompany = (companyId) => `/crm?${q({ empresa: companyId })}`;

const MODULE_PATHS = { '/agenda': 'agenda', '/email': 'mail', '/gestao-atividades': 'personal', '/crm': 'crm', '/empresas': 'company', '/xflow': 'xflow' };

// Só caminhos do próprio painel; qualquer outra coisa (http://, javascript:, //host) devolve null.
export function parsePanelLink(href) {
  const s = String(href || '').trim();
  if (!/^\/(?!\/)/.test(s) || s.length > 400) return null;
  let u;
  try { u = new URL(s, 'https://painel.local'); } catch { return null; }
  if (u.origin !== 'https://painel.local') return null;
  const p = u.searchParams;
  const get = (k) => (ID.test(p.get(k) || '') ? p.get(k) : '');
  if (['empresa', 'atividade', 'reuniao', 'tarefa', 'negocio'].some((k) => p.has(k) && !get(k) && !(k === 'negocio' || (k === 'empresa' && u.pathname === '/crm')))) return null;
  if (u.pathname === '/empresas' && get('empresa')) {
    const pid = get('empresa');
    if (get('atividade')) return { kind: 'activity', pid, activityId: get('atividade') };
    if (get('reuniao')) return { kind: get('tarefa') ? 'todo' : 'meeting', pid, meetingId: get('reuniao'), todoId: get('tarefa') };
    return { kind: 'company', pid };
  }
  if (u.pathname === '/crm') {
    if (UUID.test(p.get('negocio') || '')) return { kind: 'deal', dealId: p.get('negocio') };
    if (UUID.test(p.get('empresa') || '')) return { kind: 'crmCompany', companyId: p.get('empresa') };
  }
  const mode = MODULE_PATHS[u.pathname];
  return mode ? { kind: 'module', mode } : null;
}
