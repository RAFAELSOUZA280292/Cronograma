// Cor da BOLINHA de um selo de status (2026-10-30). Os selos mostram o texto em cor neutra e a categoria só na bolinha: cor neon como cor de TEXTO
// reprovava no tema claro (amarelo 1,4:1; azul 2,4:1). Troca o neon do tema escuro pela variável `--tg-*` (index.html), que também lê bem no claro.
const SOFT_DOT = {
  '#3ea6ff': 'var(--tg-blue)', '#3ecf6e': 'var(--tg-green)', '#2ecc8f': 'var(--tg-green)', '#e2574c': 'var(--tg-risk)',
  '#b98af5': 'var(--tg-purple)', '#9b7af5': 'var(--tg-purple)', '#f5c400': 'var(--tg-yellow)', '#fedb00': 'var(--tg-yellow)',
  '#ff9f40': 'var(--tg-warn)', '#9a9a9a': 'var(--tg-gray)', '#999999': 'var(--tg-gray)', '#b8bcc8': 'var(--tg-gray)',
};
export const softDot = (c) => SOFT_DOT[String(c || '').toLowerCase()] || c || 'var(--text-6)';
