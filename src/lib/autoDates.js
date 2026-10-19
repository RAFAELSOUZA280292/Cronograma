// "Ajustar datas automaticamente" (2026-10-19): liga/desliga POR EMPRESA e por pessoa (neste navegador). Fica fora do projeto de propósito: é uma preferência de
// quem está editando, não um dado compartilhado (ligado por engano em um aparelho não muda o que outra pessoa vê). Começa DESLIGADO.
import { useEffect, useState } from 'react';

const key = (pid) => `cron:autoDates:${pid}`;
const EVT = 'cron:autoDates';
export function isAutoDatesOn(pid) {
  try { return window.localStorage.getItem(key(pid)) === '1'; } catch { return false; }
}
export function setAutoDates(pid, on) {
  try { if (on) window.localStorage.setItem(key(pid), '1'); else window.localStorage.removeItem(key(pid)); } catch { /* sem armazenamento: fica só na sessão */ memory[pid] = !!on; }
  window.dispatchEvent(new CustomEvent(EVT, { detail: { pid } }));
}
const memory = {};
export const readAutoDates = (pid) => (memory[pid] !== undefined ? memory[pid] : isAutoDatesOn(pid));
export function useAutoDates(pid) {
  const [on, setOn] = useState(() => readAutoDates(pid));
  useEffect(() => {
    setOn(readAutoDates(pid));
    const h = (e) => { if (!e.detail || e.detail.pid === pid) setOn(readAutoDates(pid)); };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, [pid]);
  return [on, (v) => setAutoDates(pid, v)];
}
