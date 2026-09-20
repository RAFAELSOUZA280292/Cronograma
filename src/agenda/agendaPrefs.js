// Preferências pessoais da leitura da agenda (2026-09-20, pedido do Rafael): o EXPEDIENTE (padrão 08:00–18:00)
// e o ALMOÇO (padrão 12:00–13:00), que cada pessoa pode mudar. "Livre" na tela é o tempo sem reunião aceita
// dentro do expediente. Ficam NESTE navegador (localStorage), como o tema e as outras preferências pessoais
// do app; sem banco. Módulo puro (a parte de storage é protegida por try/catch e some sem localStorage).
import { WORK, hhmm } from './dayLoad.js';

const KEY = 'pricetax-agenda-prefs-v1';
export const DEFAULT_PREFS = { workStart: WORK.start, workEnd: WORK.end, lunchStart: WORK.lunchStart, lunchEnd: WORK.lunchEnd };
export const LIMITS = { earliest: 4 * 60, latest: 23 * 60, minWork: 120, maxWork: 16 * 60, minLunch: 15, maxLunch: 180 };
const FIELDS = ['workStart', 'workEnd', 'lunchStart', 'lunchEnd'];

// "12:30" -> 750 · inválido -> null
export function parseHHMM(v) {
  const m = String(v == null ? '' : v).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Devolve '' quando tudo é válido, ou a mensagem do que está errado (uma só, a mais útil).
export function validatePrefs(p) {
  if (!p || FIELDS.some((k) => !Number.isInteger(p[k]))) return 'Informe o início e o fim do expediente e do almoço.';
  if (p.workStart < LIMITS.earliest || p.workEnd > LIMITS.latest) return `O expediente precisa ficar entre ${hhmm(LIMITS.earliest)} e ${hhmm(LIMITS.latest)}.`;
  if (p.workEnd <= p.workStart) return 'O fim do expediente precisa ser depois do início.';
  if (p.workEnd - p.workStart < LIMITS.minWork) return `O expediente precisa ter pelo menos ${LIMITS.minWork / 60} horas.`;
  if (p.workEnd - p.workStart > LIMITS.maxWork) return `O expediente não pode passar de ${LIMITS.maxWork / 60} horas.`;
  if (p.lunchEnd <= p.lunchStart) return 'O fim do almoço precisa ser depois do início.';
  if (p.lunchEnd - p.lunchStart < LIMITS.minLunch) return `O almoço precisa ter pelo menos ${LIMITS.minLunch} minutos.`;
  if (p.lunchEnd - p.lunchStart > LIMITS.maxLunch) return `O almoço não pode passar de ${LIMITS.maxLunch / 60} horas.`;
  if (p.lunchStart < p.workStart || p.lunchEnd > p.workEnd) return 'O almoço precisa ficar dentro do expediente.';
  return '';
}

const clean = (p) => ({ workStart: p.workStart, workEnd: p.workEnd, lunchStart: p.lunchStart, lunchEnd: p.lunchEnd });

// Lê do storage e nunca devolve algo inválido: qualquer problema volta ao padrão. Aceita o formato antigo
// (só almoço): o que faltar vem do padrão.
export function loadPrefs(storage) {
  try {
    const st = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
    const raw = st && st.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw);
    const merged = { ...DEFAULT_PREFS, ...(p && typeof p === 'object' ? p : {}) };
    return validatePrefs(merged) ? { ...DEFAULT_PREFS } : clean(merged);
  } catch { return { ...DEFAULT_PREFS }; }
}

// Grava só se for válido. Devolve { ok, error }.
export function savePrefs(prefs, storage) {
  const error = validatePrefs(prefs);
  if (error) return { ok: false, error };
  try {
    const st = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
    if (st) st.setItem(KEY, JSON.stringify(clean(prefs)));
  } catch { /* sem storage: vale só até recarregar a página */ }
  return { ok: true, error: '' };
}

export const isDefaultPrefs = (p) => FIELDS.every((k) => p[k] === DEFAULT_PREFS[k]);
