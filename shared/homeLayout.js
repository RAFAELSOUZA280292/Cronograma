// Tela inicial personalizável (2026-11-02, §126): ordem, largura e visibilidade dos blocos, blocos "Meu espaço" e a barra de
// favoritos, por pessoa (users.preferences.home). Módulo puro, usado pelo servidor (valida o PUT) e pela tela (mescla com os
// blocos que existirem depois). Quem nunca mexeu não tem nada salvo e vê o DEFAULT_LAYOUT, que é a tela de antes.
//
// Grade de 6 trilhos na tela larga (>= 1200 px): w = 2 (um terço), 3 (metade), 4 (dois terços) ou 6 (inteira). Na tela média
// (720–1199 px) a grade tem 2 trilhos e só o bloco de um terço fica lado a lado; no celular, uma coluna. A largura salva é uma só:
// a grade reflui sozinha conforme a tela.

export const WIDTHS = [2, 3, 4, 6];
export const WIDTH_LABEL = { 2: '1/3', 3: '1/2', 4: '2/3', 6: 'Inteira' };

export const BLOCKS = [
  { id: 'daily', title: 'Mensagem do dia', w: 3 },
  { id: 'briefing', title: 'Briefing da RENATA', w: 3 },
  { id: 'today', title: 'Hoje', w: 3 },
  { id: 'week', title: 'Sua semana', w: 3 },
  { id: 'continue', title: 'Continuar de onde parou', w: 3 },
  { id: 'agenda', title: 'Agenda', w: 6 },
  { id: 'mailRadar', title: 'Negócios fora do CRM', w: 6 },
  { id: 'modules', title: 'Onde você quer trabalhar', w: 6 },
];
const BLOCK_IDS = new Set(BLOCKS.map((b) => b.id));

export const MAX_SPACES = 6;
export const MAX_FAVORITES = 40;
const MAX_SPACE_LINKS = 12;
const MAX_NOTE = 4000;
const MAX_TITLE = 60;
const MAX_LABEL = 80;
const MAX_URL = 500;
const FAVORITE_KINDS = new Set(['module', 'company', 'activity', 'meeting', 'card', 'link']);

export const SPACE_PREFIX = 'space-';
export const isSpaceId = (id) => typeof id === 'string' && /^space-[a-z0-9]{4,20}$/.test(id);
export function newSpaceId(rand = Math.random) { return `${SPACE_PREFIX}${rand().toString(36).slice(2, 10).padEnd(6, '0')}`; }

export const DEFAULT_LAYOUT = { items: BLOCKS.map((b) => ({ id: b.id, w: b.w })) };

const oneLine = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

// Só http/https (nada de javascript:, data:, file:…). Sem esquema, assume https. Mesma regra de server/personalExtras.js.
export function cleanUrl(raw) {
  let s = String(raw || '').trim();
  if (!s || s.length > MAX_URL) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname || u.username || u.password) return null;
  return u.toString();
}

// Layout salvo → { items: [{ id, w, hidden? }] } sem lixo, sem repetidos e sem blocos que não existem. null se não for um layout.
export function cleanLayout(raw, spaceIds = null) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) return null;
  const seen = new Set();
  const items = [];
  for (const it of raw.items) {
    if (!it || typeof it !== 'object' || typeof it.id !== 'string' || seen.has(it.id)) continue;
    const known = BLOCK_IDS.has(it.id) || (isSpaceId(it.id) && (!spaceIds || spaceIds.has(it.id)));
    if (!known) continue;
    seen.add(it.id);
    const def = BLOCKS.find((b) => b.id === it.id);
    const w = WIDTHS.includes(it.w) ? it.w : (def ? def.w : 3);
    items.push(it.hidden === true ? { id: it.id, w, hidden: true } : { id: it.id, w });
    if (items.length >= BLOCKS.length + MAX_SPACES) break;
  }
  return { items };
}

// O que a tela desenha: o layout salvo (ou o padrão) + os blocos que surgiram depois de a pessoa salvar, cada um logo depois
// do vizinho que o precede no padrão (ou no começo). Bloco "Meu espaço" sem conteúdo salvo some. Nunca devolve repetidos.
export function mergeLayout(saved, spaces = {}) {
  const spaceIds = new Set(Object.keys(spaces || {}).filter(isSpaceId));
  const base = cleanLayout(saved, spaceIds) || { items: DEFAULT_LAYOUT.items.map((x) => ({ ...x })) };
  const items = base.items.slice();
  const has = new Set(items.map((x) => x.id));
  BLOCKS.forEach((b, i) => {
    if (has.has(b.id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j -= 1) {
      const k = items.findIndex((x) => x.id === BLOCKS[j].id);
      if (k >= 0) { at = k + 1; break; }
    }
    items.splice(at, 0, { id: b.id, w: b.w });
    has.add(b.id);
  });
  return { items };
}

export function isDefaultLayout(layout) {
  const a = (layout && layout.items) || [];
  const d = DEFAULT_LAYOUT.items;
  return a.length === d.length && a.every((x, i) => x.id === d[i].id && x.w === d[i].w && !x.hidden);
}

// Operações da tela (puras: devolvem um layout novo).
export function moveBlock(layout, id, delta) {
  const items = layout.items.slice();
  const i = items.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= items.length) return layout;
  const [it] = items.splice(i, 1);
  items.splice(j, 0, it);
  return { items };
}
export function moveBlockTo(layout, id, overId) {
  const from = layout.items.findIndex((x) => x.id === id);
  const to = layout.items.findIndex((x) => x.id === overId);
  if (from < 0 || to < 0 || from === to) return layout;
  return moveBlock(layout, id, to - from);
}
export function setBlockWidth(layout, id, w) {
  if (!WIDTHS.includes(w)) return layout;
  return { items: layout.items.map((x) => (x.id === id ? { ...x, w } : x)) };
}
export function setBlockHidden(layout, id, hidden) {
  return { items: layout.items.map((x) => {
    if (x.id !== id) return x;
    const { hidden: _h, ...rest } = x;
    return hidden ? { ...rest, hidden: true } : rest;
  }) };
}

// "Meu espaço": título, anotação (texto simples) e links.
export function cleanSpace(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const links = [];
  for (const l of Array.isArray(s.links) ? s.links : []) {
    const url = l && cleanUrl(l.url);
    if (!url) continue;
    links.push({ name: oneLine(l.name, MAX_LABEL) || new URL(url).hostname.replace(/^www\./, ''), url });
    if (links.length >= MAX_SPACE_LINKS) break;
  }
  return { title: oneLine(s.title, MAX_TITLE) || 'Meu espaço', note: String(s.note == null ? '' : s.note).slice(0, MAX_NOTE), links };
}
export function cleanSpaces(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const id of Object.keys(raw)) {
    if (!isSpaceId(id)) continue;
    out[id] = cleanSpace(raw[id]);
    if (Object.keys(out).length >= MAX_SPACES) break;
  }
  return out;
}

// Favorito: o que identifica o item (kind/id) + rótulo. 'link' é endereço próprio (id = url normalizada).
export const favKey = (f) => `${f.kind}:${f.id}`;
export function cleanFavorites(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const f of raw) {
    if (!f || typeof f !== 'object' || !FAVORITE_KINDS.has(f.kind)) continue;
    let id = oneLine(f.id, 200);
    if (f.kind === 'link') id = cleanUrl(f.id || f.url) || '';
    if (!id) continue;
    const k = `${f.kind}:${id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const label = oneLine(f.label, MAX_LABEL) || (f.kind === 'link' ? new URL(id).hostname.replace(/^www\./, '') : '');
    if (!label) continue;
    out.push({ kind: f.kind, id, label, ...(f.hint ? { hint: oneLine(f.hint, MAX_LABEL) } : {}) });
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

// Estado guardado → estado público. favorites: null = a pessoa nunca salvou (a tela migra os favoritos antigos do navegador).
export function readHome(prefs) {
  const h = prefs && typeof prefs === 'object' && prefs.home && typeof prefs.home === 'object' ? prefs.home : {};
  const spaces = cleanSpaces(h.spaces);
  return {
    layout: cleanLayout(h.layout, new Set(Object.keys(spaces))),
    spaces,
    favorites: Array.isArray(h.favorites) ? cleanFavorites(h.favorites) : null,
  };
}

// Corpo do PUT → { patch } ou { error }. layout: null volta ao padrão.
export function buildHomePatch(body) {
  const b = body && typeof body === 'object' ? body : {};
  const patch = {};
  if (b.spaces !== undefined) {
    if (!b.spaces || typeof b.spaces !== 'object' || Array.isArray(b.spaces)) return { error: 'Blocos "Meu espaço" inválidos.' };
    if (Object.keys(b.spaces).length > MAX_SPACES) return { error: `No máximo ${MAX_SPACES} blocos "Meu espaço".` };
    patch.spaces = cleanSpaces(b.spaces);
  }
  if (b.layout !== undefined) {
    if (b.layout === null) patch.layout = null;
    else {
      const l = cleanLayout(b.layout, patch.spaces ? new Set(Object.keys(patch.spaces)) : null);
      if (!l) return { error: 'Layout inválido.' };
      patch.layout = l;
    }
  }
  if (b.favorites !== undefined) {
    if (!Array.isArray(b.favorites)) return { error: 'Favoritos inválidos.' };
    if (b.favorites.length > MAX_FAVORITES) return { error: `No máximo ${MAX_FAVORITES} favoritos.` };
    patch.favorites = cleanFavorites(b.favorites);
  }
  if (!Object.keys(patch).length) return { error: 'Nada para salvar.' };
  return { patch };
}
