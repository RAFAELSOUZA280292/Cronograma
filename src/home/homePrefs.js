// Preferências da tela inicial e favoritos (2026-11-02, §126), guardadas no servidor (GET/PUT /api/home-prefs) para valerem em
// qualquer computador. Um único estado por aba, carregado uma vez depois do login; quem usa assina com useHomePrefs().
// Gravação com espera curta (várias mudanças seguidas viram um PUT). Falha de gravação avisa e mantém o que está na tela.
import { useSyncExternalStore } from 'react';
import { apiGet, apiPut } from '../lib/api.js';
import { notify } from '../ui/dialogs.jsx';
import { cleanFavorites, favKey, MAX_FAVORITES } from '../../shared/homeLayout.js';

const EMPTY = { loaded: false, layout: null, spaces: {}, favorites: [] };
let state = EMPTY;
let userId = '';
const listeners = new Set();
let pending = {};
let timer = null;

function emit() { listeners.forEach((fn) => fn()); }
function set(next) { state = { ...state, ...next }; emit(); }

function legacyFavorites(uid) {
  try {
    const raw = window.localStorage.getItem(`ptx-favorites:${uid}`);
    return cleanFavorites(raw ? JSON.parse(raw) : []);
  } catch (e) { return []; }
}

// Chamado pelo App quando a pessoa logada muda. Favoritos antigos (só neste navegador, antes do §126) sobem uma vez.
export function loadHomePrefs(uid) {
  const id = uid ? String(uid) : '';
  if (id === userId) return;
  userId = id;
  pending = {};
  clearTimeout(timer);
  state = EMPTY;
  emit();
  if (!id) return;
  apiGet('/api/home-prefs').then((r) => {
    if (userId !== id) return;
    let favorites = r.favorites;
    if (favorites === null) {
      favorites = legacyFavorites(id);
      if (favorites.length) save({ favorites });
    }
    set({ loaded: true, layout: r.layout || null, spaces: r.spaces || {}, favorites: favorites || [] });
  }).catch(() => { if (userId === id) set({ loaded: true }); });
}

function flush() {
  const body = pending;
  pending = {};
  if (!Object.keys(body).length || !userId) return;
  const id = userId;
  apiPut('/api/home-prefs', body).catch((e) => {
    if (userId !== id) return;
    notify(`Não foi possível salvar a personalização: ${(e && e.message) || 'erro de rede'}. Ela vale só nesta tela até você recarregar.`, { tone: 'error' });
  });
}

export function save(patch) {
  pending = { ...pending, ...patch };
  clearTimeout(timer);
  timer = setTimeout(flush, 500);
}

export function updateHomePrefs(patch) {
  set(patch);
  save(patch);
}

export function getHomePrefs() { return state; }

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function useHomePrefs() { return useSyncExternalStore(subscribe, getHomePrefs, getHomePrefs); }

// ---------- Favoritos ----------
export function getFavorites() { return state.favorites; }
export function isFavorite(item) { const k = favKey(item); return state.favorites.some((f) => favKey(f) === k); }

// Devolve true se o item ficou favoritado, false se saiu.
export function toggleFavorite(item) {
  if (!item || !item.kind || !item.id) return false;
  const k = favKey(item);
  if (state.favorites.some((f) => favKey(f) === k)) {
    updateHomePrefs({ favorites: state.favorites.filter((f) => favKey(f) !== k) });
    return false;
  }
  if (state.favorites.length >= MAX_FAVORITES) { notify(`A barra de favoritos já tem ${MAX_FAVORITES} itens. Tire um para pôr outro.`, { tone: 'error' }); return false; }
  const clean = cleanFavorites([item]);
  if (!clean.length) return false;
  updateHomePrefs({ favorites: [...state.favorites, clean[0]] });
  return true;
}

export function setFavorites(list) { updateHomePrefs({ favorites: cleanFavorites(list) }); }
