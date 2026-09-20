// Traduz o retorno de lookupCnpj (server/cnpjLookup.js, BrasilAPI/ReceitaWS com
// cache) em sugestões de preenchimento pro cadastro rápido — o usuário digita o
// CNPJ e o resto vem sozinho (PRD 51/70: não pedir o que dá pra inferir).
import { TAX_REGIMES } from './service.js';
import { formatPhonesBR, normalizeZip, parseDateBR } from './text.js';

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
    phone: formatPhonesBR(r.telefone), zipCode: normalizeZip(r.cep), street: r.logradouro || '', streetNumber: r.numero || '', complement: r.complemento || '', district: r.bairro || '',
    foundedAt: parseDateBR(r.dataAbertura) || '', shareCapital: r.capitalSocial != null && Number.isFinite(r.capitalSocial) ? r.capitalSocial : '',
  };
}
