import { pool } from './db.js';

const CACHE_DAYS = 60;
const BRASILAPI_URL = 'https://brasilapi.com.br/api/cnpj/v1/';
const RECEITAWS_URL = 'https://www.receitaws.com.br/v1/cnpj/';

const UF_REGIAO = {
  AC: 'Norte', AP: 'Norte', AM: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste', PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
};

export function cleanCnpj(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function formatCnpj(cnpj) {
  if (!cnpj || cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`;
}

function isValidCnpj(cnpj) {
  return /^\d{14}$/.test(cnpj);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PricetaxCronograma/1.0; +https://painel.pricetax.com.br)',
        Accept: 'application/json',
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(fn, attempts, baseDelayMs) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn();
      if (result !== null) return result;
      lastError = new Error('empty result');
    } catch (e) {
      lastError = e;
    }
    if (i < attempts - 1) {
      const delay = baseDelayMs * (i + 1) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError || new Error('falha desconhecida');
}

async function fetchBrasilApi(cnpj) {
  return withRetry(async () => {
    const res = await fetchWithTimeout(BRASILAPI_URL + cnpj, 15000);
    if (res.status === 429 || !res.ok) return null;
    return res.json();
  }, 3, 2000);
}

async function fetchReceitaWs(cnpj) {
  return withRetry(async () => {
    const res = await fetchWithTimeout(RECEITAWS_URL + cnpj, 15000);
    if (res.status === 429 || !res.ok) return null;
    const data = await res.json();
    if (data && data.status === 'ERROR') return null;
    return data;
  }, 2, 3000);
}

function extrairRegimeBrasilApi(data) {
  const hoje = new Date();
  const dataExclusao = data.data_exclusao_do_simples ? new Date(data.data_exclusao_do_simples) : null;
  const excluidoDoSimples = dataExclusao && dataExclusao < hoje && !data.opcao_pelo_mei;

  if (!excluidoDoSimples) {
    if (data.opcao_pelo_mei === true) return { regime: 'MEI', fonte: 'opcao_pelo_mei' };
    if (data.opcao_pelo_simples === true) return { regime: 'Simples Nacional', fonte: 'opcao_pelo_simples' };
  }

  const historico = Array.isArray(data.regime_tributario) ? data.regime_tributario : [];
  if (historico.length > 0) {
    const maisRecente = historico.reduce((a, b) => (Number(b.ano) > Number(a.ano) ? b : a));
    const forma = String(maisRecente.forma_de_tributacao || '').toUpperCase();
    if (forma.includes('REAL')) return { regime: 'Lucro Real', fonte: 'regime_tributario' };
    if (forma.includes('PRESUMIDO')) return { regime: 'Lucro Presumido', fonte: 'regime_tributario' };
    if (forma.includes('SIMPLES')) return { regime: 'Simples Nacional', fonte: 'regime_tributario' };
    if (forma.includes('ARBITRADO')) return { regime: 'Lucro Arbitrado', fonte: 'regime_tributario' };
    if (maisRecente.forma_de_tributacao) return { regime: maisRecente.forma_de_tributacao, fonte: 'regime_tributario' };
  }

  return { regime: 'Não identificado', fonte: 'sem_sinal_explicito' };
}

function extrairRegimeReceitaWs(data) {
  const simples = data.simples || {};
  const hoje = new Date();
  const dataExclusao = simples.data_exclusao ? new Date(simples.data_exclusao.split('/').reverse().join('-')) : null;
  const excluidoDoSimples = dataExclusao && dataExclusao < hoje;

  if (!excluidoDoSimples && simples.optante === true) {
    return { regime: 'Simples Nacional', fonte: 'simples_optante' };
  }
  if (data.mei && data.mei.optante === true) {
    return { regime: 'MEI', fonte: 'mei_optante' };
  }
  return { regime: 'Não identificado', fonte: 'sem_sinal_explicito' };
}

function normalizeFromBrasilApi(cnpjLimpo, data) {
  const { regime, fonte } = extrairRegimeBrasilApi(data);
  return {
    cnpj: cnpjLimpo,
    cnpjFormatado: formatCnpj(cnpjLimpo),
    razaoSocial: data.razao_social || null,
    nomeFantasia: data.nome_fantasia || null,
    uf: data.uf || null,
    municipio: data.municipio || null,
    regiao: UF_REGIAO[data.uf] || null,
    cep: data.cep || null,
    cnaePrincipal: data.cnae_fiscal ? String(data.cnae_fiscal) : null,
    descricaoCnae: data.cnae_fiscal_descricao || null,
    cnaesSecundarios: (data.cnaes_secundarios || []).map((c) => ({ codigo: String(c.codigo), descricao: c.descricao })),
    porte: data.porte || null,
    situacaoCadastral: data.descricao_situacao_cadastral || null,
    dataAbertura: data.data_inicio_atividade || null,
    capitalSocial: data.capital_social != null ? Number(data.capital_social) : null,
    naturezaJuridica: data.descricao_natureza_juridica || null,
    logradouro: [data.descricao_tipo_de_logradouro, data.logradouro].filter(Boolean).join(' ') || null,
    numero: data.numero || null,
    complemento: data.complemento || null,
    bairro: data.bairro || null,
    telefone: data.ddd_telefone_1 || null,
    qsa: (data.qsa || []).map((s) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })),
    regimeTributario: regime,
    fonteRegime: fonte,
    fonteApi: 'RFB',
    erro: null,
  };
}

function normalizeFromReceitaWs(cnpjLimpo, data) {
  const { regime, fonte } = extrairRegimeReceitaWs(data);
  const atividadePrincipal = (data.atividade_principal || [])[0] || {};
  return {
    cnpj: cnpjLimpo,
    cnpjFormatado: formatCnpj(cnpjLimpo),
    razaoSocial: data.nome || null,
    nomeFantasia: data.fantasia || null,
    uf: data.uf || null,
    municipio: data.municipio || null,
    regiao: UF_REGIAO[data.uf] || null,
    cep: data.cep || null,
    cnaePrincipal: atividadePrincipal.code ? atividadePrincipal.code.replace(/\D/g, '') : null,
    descricaoCnae: atividadePrincipal.text || null,
    cnaesSecundarios: (data.atividades_secundarias || []).map((c) => ({ codigo: (c.code || '').replace(/\D/g, ''), descricao: c.text })),
    porte: data.porte || null,
    situacaoCadastral: data.situacao || null,
    dataAbertura: data.abertura || null,
    capitalSocial: data.capital_social ? Number(String(data.capital_social).replace(/\./g, '').replace(',', '.')) : null,
    naturezaJuridica: data.natureza_juridica || null,
    logradouro: data.logradouro || null,
    numero: data.numero || null,
    complemento: data.complemento || null,
    bairro: data.bairro || null,
    telefone: data.telefone || null,
    qsa: (data.qsa || []).map((s) => ({ nome: s.nome, qualificacao: s.qual })),
    regimeTributario: regime,
    fonteRegime: fonte,
    fonteApi: 'RFB (fallback)',
    erro: null,
  };
}

async function getCached(cnpj) {
  const { rows } = await pool.query('SELECT * FROM cnpj_cache WHERE cnpj = $1', [cnpj]);
  const row = rows[0];
  if (!row) return null;
  const ageMs = Date.now() - new Date(row.fetched_at).getTime();
  const validoPorIdade = ageMs < CACHE_DAYS * 24 * 60 * 60 * 1000;
  if (!validoPorIdade) return null;
  return row.data;
}

async function saveCache(cnpj, data) {
  await pool.query(
    `INSERT INTO cnpj_cache (cnpj, data, fetched_at) VALUES ($1, $2, now())
     ON CONFLICT (cnpj) DO UPDATE SET data = $2, fetched_at = now()`,
    [cnpj, JSON.stringify(data)]
  );
}

export async function lookupCnpj(rawCnpj) {
  const cnpj = cleanCnpj(rawCnpj);
  if (!isValidCnpj(cnpj)) {
    return { erro: 'CNPJ inválido. Informe os 14 dígitos.', cnpj: rawCnpj };
  }

  const cached = await getCached(cnpj);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  let result = null;
  try {
    const brasilApiData = await fetchBrasilApi(cnpj);
    result = normalizeFromBrasilApi(cnpj, brasilApiData);
  } catch (e) {
    try {
      const receitaWsData = await fetchReceitaWs(cnpj);
      result = normalizeFromReceitaWs(cnpj, receitaWsData);
    } catch (e2) {
      return { erro: 'CNPJ não encontrado na base da Receita Federal. Preencha os dados manualmente.', cnpj, cnpjFormatado: formatCnpj(cnpj) };
    }
  }

  await saveCache(cnpj, result);
  return { ...result, fromCache: false };
}
