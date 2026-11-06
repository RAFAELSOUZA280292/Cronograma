// Descrição do compromisso legível (2026-11-06, §168; Rafael, print da "Pricetax - Financeiro" com a descrição crua do Outlook/Teams).
// O convite do Outlook chega em texto com o endereço repetido entre <…> depois de cada link ("Precisa de ajuda?<https://aka.ms/…>"),
// marcadores de imagem ("[Icon email]", "[Tecumseh Logo]") e linhas de sublinhado. Tira isso e mantém o resto (ID e senha do Teams).
// Puro, para teste: scripts/agenda-describe.test.mjs.
export function tidyDescription(text) {
  let s = String(text || '').replace(/\r\n?/g, '\n');
  s = s.replace(/<(?:https?:\/\/|mailto:)[^<>\s]*>/gi, '');
  s = s.replace(/\[(?:[^\]\n]{0,40}\b)?(?:logo|icon|ícone|image|imagem|cid:[^\]\n]*)(?:\b[^\]\n]{0,40})?\][ \t]?/gi, '');
  s = s.replace(/^[ \t]*[_—–=~-]{8,}[ \t]*$/gm, '');
  s = s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
