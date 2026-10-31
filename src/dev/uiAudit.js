// Auditor de leitura e acessibilidade de uma tela (2026-10-30, Onda 1 / Q1). SÓ para desenvolvimento: `main.jsx` o carrega apenas com
// `import.meta.env.DEV` e o Vite o tira do pacote de produção. Uso no console do navegador (ou por um robô de teste):
//   await window.__uiAudit()                 → audita a tela inteira, no tema atual
//   await window.__uiAudit({ root: el })     → só uma parte (gaveta, modal)
//   await window.__uiAudit({ themes: ['light','dark'] })  → alterna o tema e junta os resultados (restaura o original)
// Mede: contraste do texto (AA: 4,5:1; texto grande 3:1), fonte menor que 12 px, botão/link só com ícone e sem nome, alvo de toque < 24 px.
// NÃO mede: contraste de ícones e bordas, foco visível, ordem de tabulação, leitor de tela de verdade. Cores que o navegador não entrega em RGB
// (lab/oklch) entram em `naoMedidos`, nunca como “passou”.

const clamp = (v) => Math.min(255, Math.max(0, v));

// Aceita `rgb()`, `rgba()` e `color(srgb r g b / a)` (como o navegador devolve color-mix). Outro formato → null.
export function parseColor(str) {
  const s = String(str || '').trim();
  let m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith('%') ? (parseFloat(x) / 100) : parseFloat(x)));
    if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null;
    return { r: clamp(p[0]), g: clamp(p[1]), b: clamp(p[2]), a: p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1 };
  }
  m = s.match(/^color\(srgb\s+([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null;
    return { r: clamp(p[0] * 255), g: clamp(p[1] * 255), b: clamp(p[2] * 255), a: p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1 };
  }
  return null;
}

export function luminance({ r, g, b }) {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a, b) {
  const x = luminance(a); const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Pinta `fg` (com transparência) sobre `bg` opaco.
export function composite(fg, bg) {
  const a = fg.a == null ? 1 : fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

// Texto grande (WCAG): ≥ 24 px, ou ≥ 18,66 px em negrito (700+). O mínimo cai de 4,5 para 3.
export function minContrastFor(fontSizePx, fontWeight) {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && Number(fontWeight) >= 700);
  return large ? 3 : 4.5;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION', 'TEMPLATE']);

function effectiveBackground(el, doc) {
  const layers = [];
  let e = el;
  let opaque = false;
  while (e) {
    const c = parseColor(getComputedStyle(e).backgroundColor);
    if (c && c.a > 0) { layers.push(c); if (c.a >= 1) { opaque = true; break; } }
    e = e.parentElement;
  }
  let base = { r: 255, g: 255, b: 255, a: 1 };
  if (!opaque) { const b = parseColor(getComputedStyle(doc.body).backgroundColor); if (b && b.a >= 1) base = b; }
  else base = { r: 0, g: 0, b: 0, a: 1 };
  for (let i = layers.length - 1; i >= 0; i -= 1) base = composite(layers[i], base);
  return base;
}

function nameOf(el) {
  return (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent || '').trim();
}

const label = (el) => {
  const cls = el.className && typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
};

export function auditOnce(root, doc = document) {
  const problems = new Map();
  const add = (kind, el, detail) => {
    const k = `${kind}|${label(el)}`;
    const p = problems.get(k) || { tipo: kind, onde: label(el), n: 0, pior: null, exemplo: '' };
    p.n += 1;
    if (detail && (p.pior == null || detail.valor < p.pior)) p.pior = detail.valor;
    if (!p.exemplo) p.exemplo = `${(detail && detail.texto) || nameOf(el) || ''}`.slice(0, 40);
    problems.set(k, p);
  };
  let medidos = 0; let naoMedidos = 0;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent.trim();
    const el = node.parentElement;
    // Só emoji/ícone-texto (sem letra nem número): a cor do glifo não é texto lido, não entra na conta.
    if (!text || !/[\p{L}\p{N}]/u.test(text) || !el || seen.has(el) || SKIP_TAGS.has(el.tagName)) continue;
    seen.add(el);
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const fg = parseColor(cs.color);
    const bgRaw = effectiveBackground(el, doc);
    if (!fg || !bgRaw) { naoMedidos += 1; continue; }
    medidos += 1;
    const ratio = contrastRatio(composite(fg, bgRaw), bgRaw);
    const fs = parseFloat(cs.fontSize);
    if (ratio < minContrastFor(fs, cs.fontWeight)) add('contraste', el, { valor: Math.round(ratio * 100) / 100, texto: text });
    if (fs < 12) add('fonte<12px', el, { valor: fs, texto: text });
  }
  root.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, textarea').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') return;
    const isField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
    const hasLabel = isField ? !!(el.labels && el.labels.length) || !!nameOf(el) || !!el.getAttribute('placeholder') : !!nameOf(el);
    if (!hasLabel) add('sem-nome', el, { valor: 0, texto: `${el.type || el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.name ? `[${el.name}]` : ''}` });
    if (!isField && (r.width < 24 || r.height < 24)) add('alvo<24px', el, { valor: Math.round(Math.min(r.width, r.height)) });
  });
  return { medidos, naoMedidos, problemas: [...problems.values()].sort((a, b) => b.n - a.n) };
}

export async function auditUi(opts = {}) {
  const doc = document;
  const root = opts.root || doc.body;
  const themes = opts.themes && opts.themes.length ? opts.themes : [null];
  const original = doc.documentElement.getAttribute('data-theme');
  const saida = {};
  // Transições de cor ficam "no meio do caminho" (e, com a aba em segundo plano, nunca terminam): medir assim lê a cor do tema anterior.
  const freeze = doc.createElement('style');
  freeze.setAttribute('data-ui-audit', '1');
  freeze.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
  doc.head.appendChild(freeze);
  try {
    for (const t of themes) {
      if (t) { doc.documentElement.setAttribute('data-theme', t); await new Promise((r) => setTimeout(r, 400)); void doc.body.offsetHeight; }
      saida[t || original || 'atual'] = auditOnce(root, doc);
    }
  } finally {
    freeze.remove();
    if (themes[0]) { if (original == null) doc.documentElement.removeAttribute('data-theme'); else doc.documentElement.setAttribute('data-theme', original); }
  }
  const resumo = Object.entries(saida).map(([tema, r]) => `${tema}: ${r.medidos} textos, ${r.problemas.length} tipos de problema${r.naoMedidos ? `, ${r.naoMedidos} não medidos` : ''}`);
  return { resumo, ...saida };
}

export function installUiAudit() { if (typeof window !== 'undefined') window.__uiAudit = auditUi; }
