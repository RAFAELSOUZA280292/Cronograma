// Anotações rápidas e atalhos de cada pessoa na Gestão de Atividades (2026-10-16, visão 5). Ficam em users.preferences.personalExtras — e NÃO no
// quadro — porque o quadro pode ser compartilhado por link público; anotações e atalhos são só da pessoa. Funções puras (testáveis em Node).
import crypto from 'node:crypto';
import { sanitizeNoteHtml } from './richNote.js';

export const MAX_SHORTCUTS = 24;
const MAX_NAME = 40;
const MAX_URL = 500;

// Só http/https (nada de javascript:, data:, file:…). Sem esquema, assume https. Devolve a URL normalizada ou null.
export function cleanShortcutUrl(raw) {
  let s = String(raw || '').trim();
  if (!s || s.length > MAX_URL) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname || u.username || u.password) return null;
  return u.toString();
}

export function cleanShortcuts(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const url = cleanShortcutUrl(it.url);
    if (!url) continue;
    let id = typeof it.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(it.id) ? it.id : `sc-${crypto.randomBytes(5).toString('hex')}`;
    if (seen.has(id)) id = `sc-${crypto.randomBytes(5).toString('hex')}`;
    seen.add(id);
    const name = String(it.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || new URL(url).hostname.replace(/^www\./, '');
    out.push({ id, name, url });
    if (out.length >= MAX_SHORTCUTS) break;
  }
  return out;
}

// Estado público a partir do que está em preferences (tolera ausência/lixo).
export function readExtras(prefs) {
  const ex = prefs && typeof prefs === 'object' ? prefs.personalExtras : null;
  return {
    notes: ex && typeof ex.notes === 'string' ? ex.notes : '',
    shortcuts: (ex && cleanShortcuts(ex.shortcuts)) || [],
  };
}

// Valida o corpo do PUT e devolve { patch } ou { error }.
export function buildExtrasPatch(body) {
  const patch = {};
  const b = body && typeof body === 'object' ? body : {};
  if (b.notes !== undefined) {
    if (typeof b.notes !== 'string') return { error: 'Anotações inválidas.' };
    patch.notes = sanitizeNoteHtml(b.notes);
  }
  if (b.shortcuts !== undefined) {
    const s = cleanShortcuts(b.shortcuts);
    if (!s) return { error: 'Atalhos inválidos.' };
    if (Array.isArray(b.shortcuts) && b.shortcuts.length > MAX_SHORTCUTS) return { error: `No máximo ${MAX_SHORTCUTS} atalhos.` };
    if (b.shortcuts.some((x) => x && x.url && !cleanShortcutUrl(x.url))) return { error: 'Use endereços http ou https válidos.' };
    patch.shortcuts = s;
  }
  if (!Object.keys(patch).length) return { error: 'Nada para salvar.' };
  return { patch };
}
