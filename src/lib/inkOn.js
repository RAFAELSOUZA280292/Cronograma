// Cor de texto (preto ou branco) com mais contraste sobre um fundo colorido qualquer (2026-10-30). Para iniciais/selos pintados com a cor
// de uma pessoa ou de uma fase: texto fixo #111 reprovava em fundos escuros (magenta #D6249F = 3,7:1). Aceita "#rgb", "#rrggbb" e "rgb(...)".
// Fundo que não dá para ler (variável CSS, nome de cor) devolve o preto de sempre.
const INK_DARK = '#111';
const INK_LIGHT = '#fff';

function toRgb(c) {
  const s = String(c || '').trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split('').map((h) => parseInt(h + h, 16));
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

const lum = ([r, g, b]) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

export function inkOn(bg) {
  const rgb = toRgb(bg);
  if (!rgb) return INK_DARK;
  const l = lum(rgb);
  const vsDark = (l + 0.05) / (lum([17, 17, 17]) + 0.05);
  const vsLight = (1.05) / (l + 0.05);
  return vsLight > vsDark ? INK_LIGHT : INK_DARK;
}
