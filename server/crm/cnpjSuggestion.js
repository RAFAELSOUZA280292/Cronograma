// Traduz o retorno de lookupCnpj (server/cnpjLookup.js, BrasilAPI/ReceitaWS com
// cache) em sugestões de preenchimento pro cadastro rápido — o usuário digita o
// CNPJ e o resto vem sozinho (PRD 51/70: não pedir o que dá pra inferir).
import { TAX_REGIMES } from './service.js';

const SIZE_MAP = { 'MICRO EMPRESA': 'Micro', 'EMPRESA DE PEQUENO PORTE': 'Pequeno', MEI: 'MEI' };

export function mapCnpjSuggestion(r) {
  const regime = TAX_REGIMES.includes(r.regimeTributario) ? r.regimeTributario : '';
  return {
    legalName: r.razaoSocial || '',
    tradeName: r.nomeFantasia || '',
    cnpj: r.cnpj || '',
    city: r.municipio || '',
    state: r.uf || '',
    cnae: r.cnaePrincipal || '',
    segment: r.descricaoCnae || '',
    taxRegime: regime,
    companySize: SIZE_MAP[String(r.porte || '').toUpperCase()] || '',
    situacaoCadastral: r.situacaoCadastral || '',
  };
}
