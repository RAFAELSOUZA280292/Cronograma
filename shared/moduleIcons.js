// Ícone de cada módulo (2026-11-03, §158): o servidor põe o do endereço aberto no index.html (o Safari tira o ícone do favorito da
// página, sem rodar o app) e o App troca o da aba ao mudar de módulo. Arquivos gerados por scripts/gen-module-icons.mjs.
// A tela inicial e o que não for módulo ficam com o X da marca (/apple-touch-icon.png, /favicon.png).
export const MODULE_ICONS = {
  company: 'Empresas', personal: 'Gestão de Atividades', xflow: 'XFlow', agenda: 'Agenda', mail: 'E-mail', whatsapp: 'WhatsApp',
  macro: 'Visão Geral', knowledge: 'Conhecimento', crm: 'CRM', pareceres: 'Pareceres', modelos: 'Modelos', users: 'Usuários', ops: 'Inteligência',
};
// Endereço de cada módulo (o mesmo de src/lib/routes.js MODE_PATHS; o teste confere que batem).
export const MODULE_URLS = {
  company: '/empresas', personal: '/gestao-atividades', xflow: '/xflow', agenda: '/agenda', mail: '/email', whatsapp: '/whatsapp',
  macro: '/visao-geral', knowledge: '/conhecimento', crm: '/crm', pareceres: '/pareceres', modelos: '/modelos', users: '/usuarios', ops: '/inteligencia',
};
export const moduleManifestUrl = (mode) => (mode && MODULE_ICONS[mode] ? `/m/${mode}.webmanifest` : '/manifest.webmanifest');
export const moduleIcon = (mode, size) => (mode && MODULE_ICONS[mode] ? `/icons/m-${mode}-${size}.png` : size === 180 ? '/apple-touch-icon.png' : '/favicon.png');

// index.html de um endereço de módulo: ícone de favorito/aba, nome para a tela de início e título já certos ANTES do app rodar
// (Safari e "Adicionar à Tela de Início" leem do HTML). Sem módulo, devolve o HTML como veio.
export function withModuleHead(html, mode) {
  const name = mode && MODULE_ICONS[mode];
  if (!name) return html;
  const title = `${name} · PRICETAX`;
  return String(html)
    .replace(/<link rel="icon" type="image\/png" href="[^"]*" \/>/, `<link rel="icon" type="image/png" href="${moduleIcon(mode, 64)}" />`)
    .replace(/<link rel="apple-touch-icon" href="[^"]*" \/>/, `<link rel="apple-touch-icon" href="${moduleIcon(mode, 180)}" />`)
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*" \/>/, `<meta name="apple-mobile-web-app-title" content="${title}" />`)
    .replace(/<link rel="manifest" href="[^"]*">/, `<link rel="manifest" href="${moduleManifestUrl(mode)}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
}

// Manifesto de app de um módulo (§158): "Adicionar ao Dock" (Safari no Mac) e "Instalar" (Chrome) usam o manifesto, não o
// apple-touch-icon — com o manifesto único (id e início "/") a Agenda e o E-mail virariam o MESMO app, abrindo na tela inicial.
// Aqui cada módulo é um app próprio (id e início no endereço dele, nome e ícone dele); o escopo segue "/" para navegar no painel todo.
export function moduleManifest(base, mode) {
  const name = MODULE_ICONS[mode];
  if (!name) return null;
  const url = MODULE_URLS[mode];
  return {
    ...base,
    id: url, start_url: url, name: `${name} · PRICETAX`, short_name: name,
    icons: [{ src: moduleIcon(mode, 180), sizes: '180x180', type: 'image/png', purpose: 'any' }, { src: `/icons/m-${mode}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' }],
    shortcuts: undefined,
  };
}
