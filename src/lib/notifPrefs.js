// Quais categorias de notificação o usuário quer ver (2026-10-06). Estado único do app (sino, painel Hoje) e salvo
// no servidor por usuário — a lista de categorias e os prefixos de tipo vêm do servidor (fonte única).
import { useSyncExternalStore } from 'react';
import { apiGet, apiPut } from './api.js';

let state = { categories: [], todaySources: [], briefingRules: [], loaded: false, saving: false, savedAt: null, error: '', wantSettings: false };
const listeners = new Set();
function set(patch) { state = { ...state, ...patch }; listeners.forEach((l) => l()); }
function refreshNotifications() { try { window.dispatchEvent(new Event('notifications:refresh')); } catch (e) { /* ignora */ } }

export function useNotifPrefs() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

export function loadNotifPrefs() {
  return apiGet('/api/notifications/preferences').then((r) => set({ categories: r.categories || [], todaySources: r.todaySources || [], briefingRules: r.briefingRules || [], loaded: true })).catch(() => {});
}
export function resetNotifPrefs() { set({ categories: [], todaySources: [], briefingRules: [], loaded: false, saving: false, savedAt: null, error: '', wantSettings: false }); }

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

// Origens (card/activity/todo/meeting) que o usuário escondeu das listas do painel Hoje.
export function hiddenTodaySources(todaySources = state.todaySources) {
  return (todaySources || []).filter((x) => x.hidden).map((x) => x.source);
}

export async function setTodaySourceHidden(source, hidden) {
  const before = state.todaySources;
  const next = before.map((x) => (x.source === source ? { ...x, hidden } : x));
  set({ todaySources: next, saving: true, error: '' });
  try {
    const r = await apiPut('/api/notifications/preferences', { todayHidden: hiddenTodaySources(next) });
    set({ todaySources: r.todaySources || next, saving: false, savedAt: Date.now() });
  } catch (e) {
    set({ todaySources: before, saving: false, error: 'Não foi possível salvar. Tente de novo.' });
  }
}

// Regras do briefing diário que a pessoa desligou (as quatro vêm ligadas).
export async function setBriefingRuleOff(key, off) {
  const before = state.briefingRules;
  const next = before.map((x) => (x.key === key ? { ...x, off } : x));
  set({ briefingRules: next, saving: true, error: '' });
  try {
    const r = await apiPut('/api/notifications/preferences', { briefingOff: next.filter((x) => x.off).map((x) => x.key) });
    set({ briefingRules: r.briefingRules || next, saving: false, savedAt: Date.now() });
    try { window.dispatchEvent(new Event('briefing:refresh')); } catch (e) { /* ignora */ }
  } catch (e) {
    set({ briefingRules: before, saving: false, error: 'Não foi possível salvar. Tente de novo.' });
  }
}
