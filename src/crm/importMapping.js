// Reconhecimento automático das colunas da planilha (Import Wizard). Módulo puro,
// sem React, pra ser testado com o arquivo real. O nome do cabeçalho é normalizado
// (sem acento/pontuação/caixa) e casa primeiro por igualdade, depois por "contém".
export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// A ORDEM importa: campos mais específicos primeiro (cnae antes de cnaeSecondary etc.); uma coluna nunca é usada duas vezes.
export const SYNONYMS = {
  companies: {
    legalName: ['razao social', 'nome da empresa', 'empresa', 'razao', 'nome'], tradeName: ['nome fantasia', 'fantasia'], cnpj: ['cnpj'],
    economicGroup: ['grupo economico', 'grupo'], website: ['site', 'website'], segment: ['segmento', 'setor'],
    cnae: ['cnae principal', 'cnae'], cnaeSecondary: ['cnaes secundarios', 'cnae secundario', 'cnaes secundario'],
    city: ['endereco cidade', 'cidade', 'municipio'], state: ['endereco estado uf', 'uf', 'estado'],
    zipCode: ['endereco cep', 'cep'], street: ['endereco logradouro', 'logradouro'], streetNumber: ['endereco numero', 'numero'],
    complement: ['endereco complemento', 'complemento'], district: ['endereco bairro', 'bairro'],
    relationship: ['relacao', 'status', 'tipo'], source: ['origem', 'fonte'], ownerName: ['responsavel pela conta', 'responsavel', 'vendedor'],
    clientSince: ['cliente desde'], foundedAt: ['data de fundacao', 'fundacao', 'data de abertura', 'abertura'], shareCapital: ['capital social'],
    phone: ['telefones', 'telefone', 'fone'], contactEmail: ['e mail de contato', 'email de contato', 'e mail', 'email'],
    companySize: ['porte'], taxRegime: ['regime tributario', 'forma de tributacao', 'regime'], revenueEstimate: ['faturamento', 'receita'], employees: ['funcionarios'], erp: ['erp'],
  },
  deals: {
    externalId: ['hash', 'id da oportunidade'], title: ['titulo', 'nome da oportunidade'], pipelineName: ['funil'], stageName: ['etapa'], situation: ['situacao'],
    value: ['valor de p s', 'valor'], createdAt: ['data de cadastro', 'data de criacao'], closedAt: ['data de fechamento'], stageDays: ['lead timing da etapa', 'dias na etapa'],
    ownerEmail: ['dono da oportunidade'], ownerName: ['nome do dono da oportunidade'], source: ['origem'], notes: ['observacoes'], description: ['descricao'], tags: ['tags'],
    companyCnpj: ['cnpj empresa'], companyName: ['nome fantasia empresa', 'razao social empresa', 'nome da empresa'], personName: ['nome completo pessoa'], personEmail: ['e mail pessoa'],
  },
  contacts: {
    fullName: ['nome completo', 'contato', 'nome'], firstName: ['primeiro nome'], lastName: ['sobrenome'], companyCnpj: ['cnpj'], companyName: ['empresa', 'razao social'],
    jobTitle: ['cargo'], department: ['departamento', 'area'], email: ['e mail', 'email'], phone: ['telefone', 'fone'], whatsapp: ['whatsapp', 'celular'],
    linkedin: ['linkedin'], decisionRole: ['papel na decisao', 'papel'], influence: ['influencia'], relationshipStrength: ['relacionamento'],
  },
};

export function guessMapping(target, headers) {
  const map = {};
  const used = new Set();
  const nh = headers.map(norm);
  Object.entries(SYNONYMS[target]).forEach(([field, syns]) => {
    for (const s of syns) {
      const i = nh.findIndex((h, idx) => !used.has(idx) && h === s);
      if (i >= 0) { map[field] = i; used.add(i); return; }
    }
    // "Contém" só vale pra cabeçalho curto (até 5 palavras) e por PALAVRA inteira: assim uma pergunta longa de
    // formulário ("...em relação ao número de clientes?") não é confundida com a coluna "Relação".
    for (const s of syns) {
      const i = nh.findIndex((h, idx) => !used.has(idx) && h.split(' ').length <= 5 && ` ${h} `.includes(` ${s} `));
      if (i >= 0) { map[field] = i; used.add(i); return; }
    }
  });
  return map;
}
