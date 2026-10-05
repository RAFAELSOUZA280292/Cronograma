// Endereços de cada módulo (2026-10-05, pedido do Rafael: "não consigo favoritar direto minha Gestão de
// Atividades"). O app continua sem roteador: a navegação por dentro segue por estado + pushState; o que muda é que
// o pushState agora grava também a URL do módulo, e a abertura direta (favorito, link) escolhe o módulo certo.
// Módulo puro, sem dependência do App.jsx — testável em Node.
export const MODE_PATHS = {
  personal: '/gestao-atividades',
  company: '/empresas',
  xflow: '/xflow',
  agenda: '/agenda',
  macro: '/visao-geral',
  knowledge: '/conhecimento',
  pareceres: '/pareceres',
  modelos: '/modelos',
  crm: '/crm',
  users: '/usuarios',
};

// Variantes que a pessoa pode digitar (sem hífen, nome antigo); sempre normalizadas pro endereço oficial.
const ALIASES = {
  '/gestaoatividades': 'personal', '/gestao-de-atividades': 'personal', '/atividades': 'personal',
  '/visaogeral': 'macro', '/visao-geral-empresas': 'macro',
  '/usuario': 'users', '/gestao-usuarios': 'users', '/gestao-de-usuarios': 'users',
};

const norm = (p) => String(p || '/').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\/+$/, '') || '/';

export function pathForMode(mode) {
  return (mode && MODE_PATHS[mode]) || '/';
}

// 'company:select', 'company:users'… → 'company'; 'gate' → null.
export function modeForTag(tag) {
  const base = String(tag || '').split(':')[0];
  return base && base !== 'gate' && MODE_PATHS[base] ? base : null;
}

export function pathForTag(tag) {
  return pathForMode(modeForTag(tag));
}

export function modeForPath(pathname) {
  const p = norm(pathname);
  for (const [mode, path] of Object.entries(MODE_PATHS)) if (p === path) return mode;
  return ALIASES[p] || null;
}

// Mesmas regras que o App usa pra montar a tela inicial (e o servidor, nas rotas). Uma só definição pra não
// divergir: quem não tem acesso a um módulo nunca cai nele por URL.
export function canOpenMode(mode, user) {
  if (!user || !mode) return false;
  const isStaff = user.role === 'master' || user.role === 'pricetax';
  switch (mode) {
    case 'company': return !!user.companiesAccess;
    case 'personal': return !!user.personalAccess;
    case 'xflow': return !!user.xflowRole;
    case 'agenda': return true;
    case 'macro': return !!user.companiesAccess && !!user.allCompaniesAccess;
    case 'knowledge': return isStaff;
    case 'pareceres': return isStaff;
    case 'modelos': return isStaff;
    case 'crm': return !!user.crmAccess;
    case 'users': return user.role === 'master';
    default: return false;
  }
}
