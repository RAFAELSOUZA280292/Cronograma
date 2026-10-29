// Limite de tentativas de login (A2, 2026-10-29). Em memória: reinicia com o servidor, o que basta para barrar tentativa em série.
// Três janelas de 15 min: usuário+IP (6 erros), usuário (20 erros) e IP (40 erros). Acerto limpa só a janela usuário+IP.
import { clientIp } from './accessLog.js';

const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { userIp: 6, user: 20, ip: 40 };
const fails = new Map();

function keys(username, req) {
  const u = String(username || '').trim().toLowerCase().slice(0, 80);
  const ip = clientIp(req) || 'sem-ip';
  return { userIp: `ui:${u}|${ip}`, user: `u:${u}`, ip: `i:${ip}` };
}

function recent(key, now) {
  const arr = (fails.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length) fails.set(key, arr); else fails.delete(key);
  return arr;
}

// Devolve os segundos de espera quando o limite estourou; 0 quando pode tentar.
export function loginBlockedFor(username, req, now = Date.now()) {
  const k = keys(username, req);
  let wait = 0;
  for (const name of Object.keys(LIMITS)) {
    const arr = recent(k[name], now);
    if (arr.length >= LIMITS[name]) wait = Math.max(wait, Math.ceil((arr[0] + WINDOW_MS - now) / 1000));
  }
  return wait;
}

export function noteLoginFailure(username, req, now = Date.now()) {
  const k = keys(username, req);
  for (const name of Object.keys(k)) fails.set(k[name], [...recent(k[name], now), now]);
  if (fails.size > 5000) for (const key of fails.keys()) recent(key, now);
}

export function noteLoginSuccess(username, req) {
  fails.delete(keys(username, req).userIp);
}

export function _resetLoginLimit() {
  fails.clear();
}

export const MIN_PASSWORD = 8;
export const passwordTooShort = (p) => !p || String(p).length < MIN_PASSWORD;
export const PASSWORD_MSG = `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
