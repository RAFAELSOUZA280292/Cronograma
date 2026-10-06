// Recentes, favoritos e "onde eu parei" (Onda 5, §81). Tudo por PESSOA, no localStorage do navegador (chave com o id do
// usuário), sempre com try/catch: sem storage (janela privada, bloqueio) o app funciona igual, só não lembra.
// Guarda só o que identifica o item (kind/id + rótulo para exibir); QUEM reabre reconstrói a ação a partir dos dados
// atuais — item que não existe mais é ignorado. Módulo puro (sem React), testável em Node.
//
// kind: 'module' (id = chave do módulo) · 'company' (id = projectId) · 'activity' (id = "pid/activityId")
//       · 'meeting' (id = "pid/meetingId") · 'card' (id = id do cartão pessoal)
const MAX_RECENTS = 12;
const MAX_FAVORITES = 40;

let currentUserId = '';
export function setRecentsUser(userId) { currentUserId = userId ? String(userId) : ''; }

export const itemKey = (item) => `${item.kind}:${item.id}`;

function storageKey(kind) { return `ptx-${kind}:${currentUserId}`; }

function read(kind) {
  if (!currentUserId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => x && x.kind && x.id) : [];
  } catch (e) { return []; }
}
function write(kind, list) {
  if (!currentUserId) return;
  try { window.localStorage.setItem(storageKey(kind), JSON.stringify(list)); } catch (e) { /* sem storage */ }
}

function clean(item) {
  return {
    kind: String(item.kind), id: String(item.id), label: String(item.label || '').slice(0, 160), hint: String(item.hint || '').slice(0, 160),
    ...(item.meta && typeof item.meta === 'object' ? { meta: item.meta } : {}),
  };
}

export function getRecents() { return read('recents'); }
export function getFavorites() { return read('favorites'); }

// Registra no topo, sem duplicar (o mesmo item sobe, não aparece duas vezes).
export function recordRecent(item) {
  if (!item || !item.kind || !item.id || !currentUserId) return;
  const next = clean(item);
  const k = itemKey(next);
  const list = [next, ...read('recents').filter((x) => itemKey(x) !== k)].slice(0, MAX_RECENTS);
  write('recents', list);
}

export function isFavorite(item) {
  const k = itemKey(item);
  return read('favorites').some((x) => itemKey(x) === k);
}

// Devolve true se o item ficou favoritado, false se saiu dos favoritos.
export function toggleFavorite(item) {
  if (!item || !item.kind || !item.id) return false;
  const k = itemKey(item);
  const list = read('favorites');
  if (list.some((x) => itemKey(x) === k)) { write('favorites', list.filter((x) => itemKey(x) !== k)); return false; }
  write('favorites', [clean(item), ...list].slice(0, MAX_FAVORITES));
  return true;
}

// ---------- Última empresa(s) e aba da empresa ----------
// `scope` separa a organização em que o super admin está atuando (ids de empresa de outra org não valem aqui).
function lastKey(scope) { return `ptx-last-company:${currentUserId}:${scope || ''}`; }

export function loadLastWorkspace(scope) {
  if (!currentUserId) return null;
  try {
    const raw = window.localStorage.getItem(lastKey(scope));
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return null;
    return { ids: Array.isArray(v.ids) ? v.ids.filter((x) => typeof x === 'string') : [], view: typeof v.view === 'string' ? v.view : '' };
  } catch (e) { return null; }
}

export function saveLastWorkspace(scope, patch) {
  if (!currentUserId) return;
  const cur = loadLastWorkspace(scope) || { ids: [], view: '' };
  try { window.localStorage.setItem(lastKey(scope), JSON.stringify({ ...cur, ...patch })); } catch (e) { /* sem storage */ }
}
