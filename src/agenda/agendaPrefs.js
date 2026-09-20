// Preferências pessoais da leitura da agenda (2026-09-20, pedido do Rafael). Hoje: só o horário de
// almoço — padrão 12:00–13:00, que cada pessoa pode mudar. Ficam NESTE navegador (localStorage), como o
// tema e as outras preferências pessoais do app; sem banco. Módulo puro (a parte de storage é
// protegida por try/catch e some sem localStorage, ex.: Node/testes).
import { WORK, hhmm } from './dayLoad.js';

const KEY = 'pricetax-agenda-prefs-v1';
export const DEFAULT_PREFS = { lunchStart: WORK.lunchStart, lunchEnd: WORK.lunchEnd };
export const LUNCH_LIMITS = { earliest: 6 * 60, latest: 20 * 60, minLen: 15, maxLen: 180 };

// "12:30" -> 750 · inválido -> null
export function parseHHMM(v) {
  const m = String(v == null ? '' : v).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Devolve '' quando o almoço é válido, ou a mensagem do que está errado.
export function validateLunch(start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return 'Informe o início e o fim do almoço.';
  if (start < LUNCH_LIMITS.earliest || end > LUNCH_LIMITS.latest) return `O almoço precisa ficar entre ${hhmm(LUNCH_LIMITS.earliest)} e ${hhmm(LUNCH_LIMITS.latest)}.`;
  if (end <= start) return 'O fim do almoço precisa ser depois do início.';
  if (end - start < LUNCH_LIMITS.minLen) return `O almoço precisa ter pelo menos ${LUNCH_LIMITS.minLen} minutos.`;
  if (end - start > LUNCH_LIMITS.maxLen) return `O almoço não pode passar de ${LUNCH_LIMITS.maxLen / 60} horas.`;
  return '';
}

// Lê do storage e nunca devolve algo inválido: qualquer problema volta ao padrão.
export function loadPrefs(storage) {
  try {
    const st = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
    const raw = st && st.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw);
    return validateLunch(p.lunchStart, p.lunchEnd) ? { ...DEFAULT_PREFS } : { lunchStart: p.lunchStart, lunchEnd: p.lunchEnd };
  } catch { return { ...DEFAULT_PREFS }; }
}

// Grava só se for válido. Devolve { ok, error }.
export function savePrefs(prefs, storage) {
  const error = validateLunch(prefs.lunchStart, prefs.lunchEnd);
  if (error) return { ok: false, error };
  try {
    const st = storage !== undefined ? storage : (typeof window !== 'undefined' ? window.localStorage : null);
    if (st) st.setItem(KEY, JSON.stringify({ lunchStart: prefs.lunchStart, lunchEnd: prefs.lunchEnd }));
  } catch { /* sem storage: vale só até recarregar a página */ }
  return { ok: true, error: '' };
}

export const isDefaultLunch = (p) => p.lunchStart === DEFAULT_PREFS.lunchStart && p.lunchEnd === DEFAULT_PREFS.lunchEnd;
