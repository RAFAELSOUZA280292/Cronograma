// Quais categorias de notificação o usuário quer ver (2026-10-06). Estado único do app (sino, painel Hoje) e salvo
// no servidor por usuário — a lista de categorias e os prefixos de tipo vêm do servidor (fonte única).
import { useSyncExternalStore } from 'react';
import { apiGet, apiPut } from './api.js';

let state = { categories: [], loaded: false, saving: false, savedAt: null, error: '', wantSettings: false };
const listeners = new Set();
function set(patch) { state = { ...state, ...patch }; listeners.forEach((l) => l()); }
function refreshNotifications() { try { window.dispatchEvent(new Event('notifications:refresh')); } catch (e) { /* ignora */ } }

export function useNotifPrefs() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

export function loadNotifPrefs() {
  return apiGet('/api/notifications/preferences').then((r) => set({ categories: r.categories || [], loaded: true })).catch(() => {});
}
export function resetNotifPrefs() { set({ categories: [], loaded: false, saving: false, savedAt: null, error: '', wantSettings: false }); }

export function requestNotifSettings(v = true) { set({ wantSettings: v }); }

export function isNotificationHidden(n, categories = state.categories) {
  const type = String((n && n.type) || '');
  return categories.some((c) => c.muted && c.prefixes.some((p) => type.startsWith(p)));
}
export function visibleNotifications(list, categories = state.categories) {
  return (list || []).filter((n) => !isNotificationHidden(n, categories));
}

// Salva na hora (sem botão "Salvar"): some/volta na tela imediatamente e o servidor passa a filtrar a lista.
export async function setCategoryMuted(key, muted) {
  const before = state.categories;
  const next = before.map((c) => (c.key === key ? { ...c, muted } : c));
  set({ categories: next, saving: true, error: '' });
  try {
    const r = await apiPut('/api/notifications/preferences', { muted: next.filter((c) => c.muted).map((c) => c.key) });
    set({ categories: r.categories || next, saving: false, savedAt: Date.now() });
    refreshNotifications();
  } catch (e) {
    set({ categories: before, saving: false, error: 'Não foi possível salvar. Tente de novo.' });
  }
}
