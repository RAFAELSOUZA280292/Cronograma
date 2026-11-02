// Cores das pastas da Caixa de e-mail (2026-11-02, pacote de personalização). A pasta é um marcador do Gmail e o Gmail só
// aceita cores da paleta fixa dele (labels.create/patch devolvem 400 para qualquer outra); por isso a tela oferece só estas.
// Usado pela tela (src/mail/Folders.jsx) e conferido no servidor (server/mail.js).
export const LABEL_COLORS = [
  { bg: '#cc3a21', text: '#ffffff', name: 'Vermelho' },
  { bg: '#ffad47', text: '#ffffff', name: 'Laranja' },
  { bg: '#fad165', text: '#000000', name: 'Amarelo' },
  { bg: '#16a766', text: '#ffffff', name: 'Verde' },
  { bg: '#43d692', text: '#000000', name: 'Verde-claro' },
  { bg: '#4a86e8', text: '#ffffff', name: 'Azul' },
  { bg: '#285bac', text: '#ffffff', name: 'Azul-escuro' },
  { bg: '#a479e2', text: '#ffffff', name: 'Roxo' },
  { bg: '#e07798', text: '#ffffff', name: 'Rosa' },
  { bg: '#a46a21', text: '#ffffff', name: 'Marrom' },
  { bg: '#999999', text: '#ffffff', name: 'Cinza' },
  { bg: '#434343', text: '#ffffff', name: 'Grafite' },
];

// undefined = não mexer na cor; null = tirar a cor; objeto do Gmail = pôr a cor. Cor fora da paleta = erro (false).
export function labelColorFor(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const hit = LABEL_COLORS.find((c) => c.bg === String(value).toLowerCase());
  return hit ? { backgroundColor: hit.bg, textColor: hit.text } : false;
}
