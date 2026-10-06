// Navegação por teclado e pelo botão Voltar do navegador (Onda 1, §81). Módulo puro de React, sem dependência do App.
//
//  useEscClose(onClose, enabled)   — Esc fecha o item MAIS DE CIMA (pilha); respeita a guarda de quem passa requestClose.
//  useDialog(onClose, opts)        — props de acessibilidade para modal/gaveta: role, aria-modal, foco preso, Esc, e
//                                    (por padrão) o Voltar do navegador fecha em vez de sair do módulo.
//  useBackLayer(open, onClose)     — uma "camada" de histórico para gaveta/modal controlado por `open`.
//  useHistoryValue(key, v, set, f) — abas/páginas internas empilham no histórico; Voltar volta à aba anterior.
//  readHistoryValue(key, fallback) — valor inicial vindo do histórico (reabrir pelo Voltar restaura a aba).
// O App usa history.state = { navTag, detailActivity, ... }; tudo aqui só ACRESCENTA chaves ({...atual, chave}).
import { useEffect, useRef } from 'react';

function curState() {
  try { return window.history.state || {}; } catch (e) { return {}; }
}

// Estado de histórico sem a camada de modal/gaveta: use ao empilhar uma NAVEGAÇÃO (abrir atividade/reunião/cartão) em cima
// de uma camada, senão a camada, ao desmontar, acha que a entrada nova é dela e a desfaz com history.back().
export function withoutLayer(st) {
  const { backLayer, ...rest } = st || {};
  return rest;
}

export function readHistoryValue(key, fallback) {
  const v = curState()[key];
  return v === undefined ? fallback : v;
}

// ---------- Esc em pilha ----------
const escStack = [];
let escBound = false;
function onEscKey(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
  const top = escStack[escStack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  top.fn();
}
export function useEscClose(onClose, enabled = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!enabled) return undefined;
    const entry = { fn: () => ref.current && ref.current() };
    escStack.push(entry);
    if (!escBound) { window.addEventListener('keydown', onEscKey); escBound = true; }
    return () => {
      const i = escStack.indexOf(entry);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, [enabled]);
}

// ---------- Camada de histórico ----------
let layerSeq = 0;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// `open` controla a camada. Abrir empilha uma entrada no histórico; Voltar fecha (chama onClose) em vez de sair do
// módulo; fechar pelo X/Esc desempilha a entrada. Se onClose não fechar (guarda de alterações), a camada é reposta.
export function useBackLayer(open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;
  const pushed = useRef(null);
  const mounted = useRef(false);
  const skip = useRef(new Set());

  function push() {
    const id = 'L' + (++layerSeq);
    try { window.history.pushState({ ...curState(), backLayer: id }, '', window.location.href); pushed.current = id; } catch (e) { pushed.current = null; }
  }
  function pop() {
    const id = pushed.current;
    pushed.current = null;
    if (!id) return;
    if (curState().backLayer === id) {
      skip.current.add(id);
      try { window.history.back(); } catch (e) { /* ignora */ }
    }
  }

  useEffect(() => {
    mounted.current = true;
    if (open && !pushed.current) push();
    else if (!open && pushed.current) pop();
    return () => {
      mounted.current = false;
      // Desmontar de verdade desempilha; o ciclo simulado do StrictMode (monta de novo no mesmo tick) não.
      setTimeout(() => { if (!mounted.current && pushed.current) pop(); }, 0);
    };
  }, [open]);

  useEffect(() => {
    function onPop(e) {
      const id = pushed.current;
      if (!id) return;
      if (skip.current.has(id)) { skip.current.delete(id); return; }
      const top = e.state && e.state.backLayer;
      if (top === id) return;
      // Esta camada saiu da pilha: pede para fechar. Se a guarda segurar (continua aberta), repõe a entrada.
      pushed.current = null;
      closeRef.current && closeRef.current();
      setTimeout(() => { if (openRef.current && mounted.current && !pushed.current) push(); }, 0);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}

// ---------- Foco preso + a11y de modal/gaveta ----------
export function useDialog(onClose, opts) {
  const o = opts || {};
  const ref = useRef(null);
  useEscClose(onClose, o.esc !== false);
  useBackLayer(o.history !== false, onClose);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const prev = document.activeElement;
    const focusables = () => [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!el.contains(document.activeElement)) {
      const f = focusables();
      try { (f[0] || el).focus({ preventScroll: true }); } catch (e) { /* ignora */ }
    }
    function onKey(e) {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !el.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !el.contains(active))) { e.preventDefault(); first.focus(); }
    }
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      try { if (prev && prev !== document.body && document.contains(prev)) prev.focus({ preventScroll: true }); } catch (e) { /* ignora */ }
    };
  }, []);
  return { ref, role: 'dialog', 'aria-modal': true, tabIndex: -1 };
}

// ---------- Aba/página interna no histórico ----------
export function useHistoryValue(key, value, setValue, fallback) {
  const last = useRef(value);
  const setRef = useRef(setValue);
  setRef.current = setValue;
  useEffect(() => {
    if (last.current === value) return;
    last.current = value;
    const cur = curState();
    if (cur[key] === value) return; // veio do Voltar/Avançar
    try { window.history.pushState({ ...cur, [key]: value }, '', window.location.href); } catch (e) { /* ignora */ }
  }, [value]);
  useEffect(() => {
    function onPop(e) {
      const st = e.state || {};
      const v = st[key] === undefined ? fallback : st[key];
      last.current = v;
      setRef.current(v);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
