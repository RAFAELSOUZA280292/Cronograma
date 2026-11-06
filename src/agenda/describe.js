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

// Divide o texto em pedaços de texto e de link (§168b; Rafael: "se eu quiser entrar nessa reunião vou precisar copiar o link e colar
// no navegador"). Endereço web vira link que abre em outra aba; e-mail vira mailto: (dentro do painel abre a Caixa). Pontuação no fim
// do endereço fica de fora.
const LINK_RE = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+\.[^\s<>"]+|[^\s<>"()@]+@[^\s<>"()@]+\.[a-z]{2,})/gi;
export function splitLinks(text) {
  const s = String(text || '');
  const out = [];
  let last = 0;
  for (const m of s.matchAll(LINK_RE)) {
    let raw = m[0];
    const trail = /[.,;:!?)\]]+$/.exec(raw);
    if (trail) raw = raw.slice(0, -trail[0].length);
    if (!raw) continue;
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    const isMail = !/^https?:|^www\./i.test(raw);
    out.push({ text: raw, href: isMail ? `mailto:${raw}` : /^www\./i.test(raw) ? `https://${raw}` : raw, mail: isMail });
    last = m.index + raw.length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
