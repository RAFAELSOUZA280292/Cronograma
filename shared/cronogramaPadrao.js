// Cronograma padrão PRICETAX — PROPOSTA 0.1, rascunho para validação do Rafael (2026-10-19). NÃO alimenta ainda as empresas novas (isso continua em
// server/standardPlan.js + server/db.js) nem a Auditoria: só a tela "Ver cronograma padrão". Quando for validado, este passa a ser a fonte única.
// Origem: (1) as 87 ações do guia "Reforma Tributária 2027 · Guia por área" (texto limpo de casos de cliente), (2) as 15 atividades do modelo atual,
// (3) o fluxo real da Vellore. Prazos em dias a contar do kickoff (D+n; D0 = início da Mobilização do guia). Dado puro, sem dependências.
export const CRONOGRAMA_PADRAO = {
 "versao": "0.1",
 "status": "rascunho",
 "dataBase": "2026-10-07",
 "geradoEm": "2026-10-19",
 "fases": [
  {
   "id": 0,
   "nome": "Contínuo",
   "marco": "Acompanhamento recorrente ao longo de todo o projeto",
   "dia": null,
   "diaFim": null
  },
  {
   "id": 1,
   "nome": "Mobilização",
   "marco": "24/10: ambiente de homologação e cronograma do ERP recebidos",
   "dia": 0,
   "diaFim": 10
  },
  {
   "id": 2,
   "nome": "Desenho e parametrização",
   "marco": "14/11: regras fiscais aprovadas; NT e DANFE entregues pelo ERP",
   "dia": 13,
   "diaFim": 38
  },
  {
   "id": 3,
   "nome": "Homologação integrada",
   "marco": "12/12: testes aprovados por Fiscal, Contábil e Financeiro",
   "dia": 41,
   "diaFim": 66
  },
  {
   "id": 4,
   "nome": "Virada",
   "marco": "22/12: decisão de seguir ou não (go/no-go)",
   "dia": 69,
   "diaFim": 85
  },
  {
   "id": 5,
   "nome": "Operação assistida",
   "marco": "Fevereiro/2027: primeira apuração de CBS e IBS",
   "dia": 89,
   "diaFim": 175
  }
 ],
 "atividades": [
  {
   "key": "kickoff",
   "titulo": "Kickoff único no cliente",
   "responsavel": "PRICETAX",
   "origem": "modelo",
   "modeloKey": "kickoff",
   "descricao": "Mapeamento, captura de documentos e validação inicial numa só visita; nomeia o responsável de cada área e alinha o ERP.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "C0",
     "titulo": "Validar o regime tributário dos 15 principais fornecedores",
     "area": "Compras",
     "fase": 1,
     "dia": 2,
     "prazoGuia": "2026-10-09",
     "prio": "Alta",
     "exec": "PriceTax",
     "quem": "",
     "apoio": [
      "Cliente · Compras"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "G1",
     "titulo": "Nomear responsáveis por área, aprovar este cronograma e instituir reunião semanal de riscos e evidências",
     "area": "Diretoria e PMO",
     "fase": 1,
     "dia": 9,
     "prazoGuia": "2026-10-16",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Diretoria",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Responsáveis nomeados e painel de pendências ativo",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T1",
     "titulo": "Reunião de alinhamento com o ERP: homologação, campos de IBS/CBS, valor líquido, DANFE, recolhimento pelo adquirente, notas de débito e crédito e IPI zero",
     "area": "TI e ERP",
     "fase": 1,
     "dia": 10,
     "prazoGuia": "2026-10-17",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "TI e Fiscal",
     "apoio": [
      "ERP",
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "FN1",
     "titulo": "Extrair do ERP fornecedores, clientes, pagamentos e recebimentos com CNPJ, número da nota e datas",
     "area": "Financeiro",
     "fase": 1,
     "dia": 17,
     "prazoGuia": "2026-10-24",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Financeiro",
     "apoio": [
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T2",
     "titulo": "Disponibilizar ambiente de homologação com transmissão à SEFAZ de homologação, separado da produção",
     "area": "TI e ERP",
     "fase": 1,
     "dia": 17,
     "prazoGuia": "2026-10-24",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · TI"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T3",
     "titulo": "Entregar cronograma de versões com data por funcionalidade e registrar as versões e pacotes legais instalados por nota técnica",
     "area": "TI e ERP",
     "fase": 1,
     "dia": 17,
     "prazoGuia": "2026-10-24",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · TI"
     ],
     "recorrencia": "",
     "entrega": "Ambiente atualizado e versões registradas",
     "norma": {},
     "conferir": [],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "envio-dados",
   "titulo": "Envio dos dados",
   "responsavel": "Cliente",
   "origem": "fluxo-vellore",
   "modeloKey": null,
   "descricao": "O cliente envia as bases combinadas no kickoff (compras, vendas, cadastros). Existe no fluxo real da Vellore; ainda não está no modelo.",
   "validacao": "a-validar",
   "filhas": []
  },
  {
   "key": "analise-doc",
   "titulo": "Análise e validação documental",
   "responsavel": "PRICETAX",
   "origem": "fluxo-vellore",
   "modeloKey": null,
   "descricao": "A PRICETAX valida os documentos e as bases recebidas antes de calcular o cenário. Existe no fluxo real da Vellore; ainda não está no modelo.",
   "validacao": "a-validar",
   "filhas": []
  },
  {
   "key": "numero-geral",
   "titulo": "Retorno com o número geral",
   "responsavel": "PRICETAX",
   "origem": "modelo",
   "modeloKey": "numero-geral",
   "descricao": "Impacto em preço de compra, preço de venda, DRE e caixa. No guia, entra o estudo de fluxo de caixa.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "FN2",
     "titulo": "Fazer o estudo de fluxo de caixa com um mês-base: pagamentos, recebimentos, recolhimentos e compensações, com e sem recolhimento pelo adquirente, IPI zerado ou mantido",
     "area": "Financeiro",
     "fase": 2,
     "dia": 38,
     "prazoGuia": "2026-11-14",
     "prio": "Alta",
     "exec": "PriceTax",
     "quem": "",
     "apoio": [
      "Cliente · Financeiro"
     ],
     "recorrencia": "",
     "entrega": "Projeção de caixa e cenários para 2027",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "apresentacao-previa",
   "titulo": "Apresentação prévia dos cenários",
   "responsavel": "PRICETAX",
   "origem": "fluxo-vellore",
   "modeloKey": null,
   "descricao": "Apresentação do cenário antes do relatório final. Na Vellore são duas (cenário AR e AR e DR); aqui está como uma só, para você decidir.",
   "validacao": "a-validar",
   "filhas": []
  },
  {
   "key": "compras",
   "titulo": "Compras",
   "responsavel": "Compras",
   "origem": "modelo",
   "modeloKey": "compras",
   "descricao": "Regime do fornecedor, custo atual × novo, negociação e uso do recolhimento pelo adquirente.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "C1",
     "titulo": "Estender a curva ABC, o regime tributário (Simples, híbrido, Presumido, Real) e o CNAE aos demais fornecedores",
     "area": "Compras",
     "fase": 1,
     "dia": 24,
     "prazoGuia": "2026-10-31",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Compras",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "C2",
     "titulo": "Revisar cadastros críticos: regime do fornecedor como campo obrigatório, NCM/NBS de produtos e serviços e rotina de validação dos documentos recebidos",
     "area": "Compras",
     "fase": 2,
     "dia": 38,
     "prazoGuia": "2026-11-14",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Compras",
     "apoio": [
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "Cadastros críticos revisados e rotina de validação",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "C3",
     "titulo": "Simular por fornecedor e item o custo atual após créditos contra o novo custo com CBS/IBS",
     "area": "Compras",
     "fase": 2,
     "dia": 38,
     "prazoGuia": "2026-11-14",
     "prio": "Alta",
     "exec": "PriceTax",
     "quem": "",
     "apoio": [
      "Cliente · Compras"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "C5",
     "titulo": "Definir quando usar o recolhimento pelo adquirente conforme o risco do fornecedor",
     "area": "Compras",
     "fase": 3,
     "dia": 52,
     "prazoGuia": "2026-11-28",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Compras e Financeiro",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "C6",
     "titulo": "Avaliar adiar para janeiro as compras de itens com IPI não creditável",
     "area": "Compras",
     "fase": 3,
     "dia": 54,
     "prazoGuia": "2026-11-30",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Compras",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "C4",
     "titulo": "Negociar com base na simulação: redução com Lucro Real, contenção com Presumido, revisão dos fornecedores do Simples",
     "area": "Compras",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Compras",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Critérios de avaliação e comparativo de custo total",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "vendas",
   "titulo": "Vendas",
   "responsavel": "Comercial",
   "origem": "modelo",
   "modeloKey": "vendas",
   "descricao": "Formação de preço pelo valor líquido, política por tipo de cliente, contratos, comissões e comunicação.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "V1",
     "titulo": "Preparar o argumento comercial sobre o IPI e ajustar produção e estoque de dezembro",
     "area": "Vendas e Comercial",
     "fase": 1,
     "dia": 24,
     "prazoGuia": "2026-10-31",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Comercial e PCP",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "V2",
     "titulo": "Simular custos e margens e refazer a formação de preço na ferramenta definida em T14: valor líquido, IBS/CBS por fora e ICMS e ISS com IBS/CBS na base",
     "area": "Vendas e Comercial",
     "fase": 2,
     "dia": 38,
     "prazoGuia": "2026-11-14",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Comercial e Controladoria",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Análise de margem e cenários de preço por produto e serviço",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "V3",
     "titulo": "Definir política de preço por tipo de cliente: regime regular, Simples e consumidor final",
     "area": "Vendas e Comercial",
     "fase": 3,
     "dia": 45,
     "prazoGuia": "2026-11-21",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Comercial",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "V4",
     "titulo": "Identificar clientes que devem usar o recolhimento pelo adquirente e estimar o volume que passará a ser recebido líquido",
     "area": "Vendas e Comercial",
     "fase": 3,
     "dia": 45,
     "prazoGuia": "2026-11-21",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Comercial e Financeiro",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "V5",
     "titulo": "Definir o tratamento de adiantamentos recebidos em 2026 para entrega em 2027",
     "area": "Vendas e Comercial",
     "fase": 3,
     "dia": 52,
     "prazoGuia": "2026-11-28",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Fiscal e Financeiro",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "V6",
     "titulo": "Revisar tabelas, propostas e contratos de 2027 com cláusula tributária e de recolhimento pelo adquirente",
     "area": "Vendas e Comercial",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Comercial e Jurídico",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "V7",
     "titulo": "Redefinir a base de comissões e metas",
     "area": "Vendas e Comercial",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Comercial e RH",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "V8",
     "titulo": "Comunicar os clientes sobre a nova nota (valor líquido, IBS/CBS por fora, notas de débito e crédito, recolhimento pelo adquirente) e revisar cadastro e recebimento de documentos",
     "area": "Vendas e Comercial",
     "fase": 4,
     "dia": 69,
     "prazoGuia": "2026-12-15",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Comercial",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Comunicado e orientações aprovados",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "financeiro",
   "titulo": "Financeiro",
   "responsavel": "Financeiro",
   "origem": "modelo",
   "modeloKey": "financeiro",
   "descricao": "Orçamento de caixa do primeiro trimestre de 2027, títulos separados, guias e ressarcimento.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "FN4",
     "titulo": "Revisar contas a pagar e a receber: retenções, valores líquidos e brutos (recolhimento pelo adquirente), títulos separados e controle de créditos por documento",
     "area": "Financeiro",
     "fase": 3,
     "dia": 54,
     "prazoGuia": "2026-11-30",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Financeiro",
     "apoio": [
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "Procedimento de conferência e conciliação",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "FN3",
     "titulo": "Montar o orçamento de caixa de janeiro a março de 2027 e, se necessário, negociar capital de giro",
     "area": "Financeiro",
     "fase": 3,
     "dia": 59,
     "prazoGuia": "2026-12-05",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Financeiro",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "FN5",
     "titulo": "Desenhar o processo de guias do recolhimento pelo adquirente por documento, com controle contra pagamento em duplicidade",
     "area": "Financeiro",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Financeiro",
     "apoio": [
      "PriceTax",
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "FN6",
     "titulo": "Pedir ressarcimento dos saldos credores",
     "area": "Financeiro",
     "fase": 5,
     "dia": 175,
     "prazoGuia": "2027-03-31",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Financeiro e Fiscal",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "FN7",
     "titulo": "Acompanhar com bancos e credenciadoras a implantação do split payment e avaliar o grupo de vinculação do boleto ou Pix gerado antes da nota (facultativo)",
     "area": "Financeiro",
     "fase": 0,
     "dia": null,
     "prazoGuia": null,
     "prio": "Baixa",
     "exec": "Cliente",
     "quem": "Financeiro",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "Contínuo",
     "entrega": "",
     "norma": {
      "nt": "NT 2026.006 v1.00",
      "hom": "03/08/2026",
      "prod": "05/10/2026 (uso facultativo)"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "fiscal",
   "titulo": "Fiscal / Tributário",
   "responsavel": "Fiscal",
   "origem": "modelo",
   "modeloKey": "fiscal",
   "descricao": "Política de IBS/CBS na base, matriz de operações, parametrização de 2027, créditos, apuração e testes.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "F16",
     "titulo": "Validar as alíquotas de ISS, PIS e Cofins dos serviços prestados",
     "area": "Fiscal",
     "fase": 1,
     "dia": 2,
     "prazoGuia": "2026-10-09",
     "prio": "Alta",
     "exec": "PriceTax",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F11",
     "titulo": "Criar regra no configurador para todo NCM ativo ou bloquear o faturamento de item sem regra",
     "area": "Fiscal",
     "fase": 1,
     "dia": 17,
     "prazoGuia": "2026-10-24",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "ERP",
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": true,
     "nota": "Texto do guia trazia a situação de um cliente (\"hoje 13 de 30\"); removida.",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F1",
     "titulo": "Definir e registrar a política de cálculo do ICMS e do ISS com IBS/CBS na base",
     "area": "Fiscal",
     "fase": 2,
     "dia": 24,
     "prazoGuia": "2026-10-31",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal e Jurídico",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F12",
     "titulo": "Cadastrar no configurador as operações de compra nacional",
     "area": "Fiscal",
     "fase": 2,
     "dia": 24,
     "prazoGuia": "2026-10-31",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "ERP",
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F18",
     "titulo": "Parametrizar vendas para a Zona Franca de Manaus e áreas de livre comércio: CBS com alíquota zero e crédito presumido de IBS, com campos próprios na NF-e",
     "area": "Fiscal",
     "fase": 2,
     "dia": 24,
     "prazoGuia": "2026-10-31",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "ERP",
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2025.002-RTC (ZFM/ALC) v1.40+",
      "hom": "—",
      "prod": "já vigente"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial.",
      "Prazo sugerido no guia, não definido em norma."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F4",
     "titulo": "Classificar operações sem fornecimento ou não onerosas (remessa, transferência, amostra grátis, brinde, bonificação) e corrigir o IBS/CBS calculado indevidamente nos testes",
     "area": "Fiscal",
     "fase": 2,
     "dia": 24,
     "prazoGuia": "2026-10-31",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "PriceTax",
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F3",
     "titulo": "Publicar boletim com a decisão de cadastro de compras item a item ou por itens genéricos (por faixa de redução) e aplicar: insumos e revenda por item, despesas por faixa",
     "area": "Fiscal",
     "fase": 2,
     "dia": 31,
     "prazoGuia": "2026-11-07",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal e Contábil",
     "apoio": [
      "PriceTax",
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F13",
     "titulo": "Parametrizar e testar exportação (imunidade: grupo IBS/CBS sem tributo devido), importação (IBS/CBS cobrados no desembaraço pela Duimp, com crédito) e retorno de depósito",
     "area": "Fiscal",
     "fase": 2,
     "dia": 38,
     "prazoGuia": "2026-11-14",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "ERP",
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "LC 214 · IT 2025.002 · Ato Conjunto 4/2026 (Duimp)",
      "hom": "—",
      "prod": "exportação já vigente · importação 01/01/2027"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F14",
     "titulo": "Revisar a matriz de ICMS interestadual, alíquotas internas de DIFAL e FCP e a origem cadastrada de cada produto",
     "area": "Fiscal",
     "fase": 2,
     "dia": 38,
     "prazoGuia": "2026-11-14",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F5",
     "titulo": "Definir a parametrização de 2027 (PIS/Cofins desligados e IPI com CST de alíquota zero, sem excluir o tributo) e mapear por produto o risco de exceção pela Zona Franca de Manaus; o ERP aplica em T22",
     "area": "Fiscal",
     "fase": 2,
     "dia": 38,
     "prazoGuia": "2026-11-14",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F2",
     "titulo": "Mapear todas as operações (vendas, serviços, compras, devoluções, transferências, remessas, retornos, industrialização, importação, exportação e operações sem incidência) e definir CST e cClassTrib de cada uma no portal de regras",
     "area": "Fiscal",
     "fase": 3,
     "dia": 24,
     "prazoGuia": "2026-10-31",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "PriceTax",
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "Matriz fiscal por operação: CFOP, CST e cClassTrib",
     "norma": {
      "nt": "IT 2025.002 v1.70 · NT 2025.002-RTC",
      "hom": "validação nos testes (F6)",
      "prod": "obrigatório desde 03/08/2026"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F7",
     "titulo": "Definir quem trata cada evento da NF-e (crédito presumido, perda, uso pessoal, aceite de nota de crédito)",
     "area": "Fiscal",
     "fase": 3,
     "dia": 52,
     "prazoGuia": "2026-11-28",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F19",
     "titulo": "Validar a apuração de IBS/CBS: bases, alíquotas, reduções, créditos, exclusões e tratamentos específicos",
     "area": "Fiscal",
     "fase": 3,
     "dia": 54,
     "prazoGuia": "2026-11-30",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Memória de cálculo validada e aprovada",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F8",
     "titulo": "Conferir as notas recebidas: regime do emitente, destaque de IBS/CBS e notas de débito (finNFe 6) e de crédito (finNFe 5) de fornecedores, que ajustam o crédito",
     "area": "Fiscal",
     "fase": 3,
     "dia": 54,
     "prazoGuia": "2026-11-30",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2025.002-RTC · Ajuste SINIEF 49/25",
      "hom": "—",
      "prod": "recebimento desde 03/08/2026 · obrigatório para fornecedores em 01/01/2027"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial.",
      "Prazo sugerido no guia, não definido em norma."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F9",
     "titulo": "Levantar saldos credores de PIS/Cofins e IPI, retenções e compensações pendentes, e definir o procedimento de transição (EFD-Contribuições de dez/2026 até 31/01/2027)",
     "area": "Fiscal",
     "fase": 3,
     "dia": 54,
     "prazoGuia": "2026-11-30",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Relatório de saldos e procedimento de transição",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F6",
     "titulo": "Testar emissão e recebimento com as regras de 2027 (CBS cheia, sem PIS/Cofins, ICMS com IBS/CBS na base): venda, revenda, desconto, bonificação, devolução, remessa, importação, compra e notas de débito e crédito, conferindo XML, campos e rejeições",
     "area": "Fiscal",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "PriceTax",
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "Roteiro aprovado por Fiscal, TI e Comercial; evidências e plano para pendências",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F17",
     "titulo": "Acompanhar a publicação e carregar a alíquota da CBS de 2027 (alíquota de referência fixada pelo Senado menos 0,1 ponto percentual)",
     "area": "Fiscal",
     "fase": 4,
     "dia": 69,
     "prazoGuia": "2026-12-15",
     "prio": "Alta",
     "exec": "PriceTax",
     "quem": "",
     "apoio": [
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "LC 214, arts. 347, 349 e 353 · IT 2026.002",
      "hom": "30/10/2026 (TCU envia ao Senado)",
      "prod": "15/12/2026 (Senado) · vigência 01/01/2027"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F20",
     "titulo": "Confirmar obrigações acessórias, leiautes, declarações e prazos de 2027 aplicáveis ao regime e às operações da empresa",
     "area": "Fiscal",
     "fase": 4,
     "dia": 69,
     "prazoGuia": "2026-12-15",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Calendário fiscal 2027 atualizado",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F10",
     "titulo": "Acompanhar a lista de exceções do IPI e revisar a parametrização quando sair",
     "area": "Fiscal",
     "fase": 0,
     "dia": null,
     "prazoGuia": null,
     "prio": "Alta",
     "exec": "PriceTax",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "Semanal",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "F15",
     "titulo": "Repetir os testes de cálculo a cada nova versão do ERP ou da tabela de cClassTrib",
     "area": "Fiscal",
     "fase": 0,
     "dia": null,
     "prazoGuia": null,
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Fiscal",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "Por versão",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "contabil",
   "titulo": "Contábil",
   "responsavel": "Contábil",
   "origem": "novo-modelo",
   "modeloKey": "contabil",
   "descricao": "Plano de contas, contabilização, DRE, fechamento e inventário na virada.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "CT1",
     "titulo": "Ajustar o plano de contas, contas transitórias e de-para: CBS, IBS-UF e IBS-Município a recolher, a recuperar pendente e liberado, saldo credor",
     "area": "Contábil",
     "fase": 2,
     "dia": 31,
     "prazoGuia": "2026-11-07",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Contábil",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "De-para contábil e lançamentos homologados",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "CT2",
     "titulo": "Definir a contabilização de venda, compra, recolhimento pelo adquirente, notas de débito e crédito e devolução, ligada às regras fiscais",
     "area": "Contábil",
     "fase": 3,
     "dia": 45,
     "prazoGuia": "2026-11-21",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Contábil",
     "apoio": [
      "ERP",
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "CT4",
     "titulo": "Testar a contabilização em homologação com alíquotas cheias",
     "area": "Contábil",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Contábil",
     "apoio": [
      "ERP",
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "CT5",
     "titulo": "Criar o checklist mensal de fechamento: documentos fiscais, escrituração, apuração, razão contábil e conta corrente da Receita",
     "area": "Contábil",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Contábil e Fiscal",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Checklist mensal de fechamento",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "CT7",
     "titulo": "Definir o tratamento contábil dos saldos antigos de PIS/Cofins e dos ajustes de transição",
     "area": "Contábil",
     "fase": 4,
     "dia": 69,
     "prazoGuia": "2026-12-15",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Contábil",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Procedimento contábil formalizado",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "CT6",
     "titulo": "Fazer o inventário físico e valorizar o estoque sem tributos recuperáveis",
     "area": "Contábil",
     "fase": 4,
     "dia": 85,
     "prazoGuia": "2026-12-31",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Contábil e Logística",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "controladoria",
   "titulo": "Controladoria",
   "responsavel": "Controladoria",
   "origem": "modelo",
   "modeloKey": "controladoria",
   "descricao": "DRE com a receita sem os tributos cobrados por fora e a nova base de IRPJ/CSLL.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "CT3",
     "titulo": "Ajustar a DRE: receita sem tributos por fora, deduções e base de IRPJ/CSLL",
     "area": "Contábil",
     "fase": 3,
     "dia": 52,
     "prazoGuia": "2026-11-28",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Contábil",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "juridico",
   "titulo": "Jurídico",
   "responsavel": "Jurídico",
   "origem": "modelo",
   "modeloKey": "juridico",
   "descricao": "Tese de IBS/CBS na base do ICMS e do ISS, contratos e acompanhamento das normas.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "J1",
     "titulo": "Avaliar ação judicial para excluir IBS/CBS da base do ICMS e do ISS",
     "area": "Jurídico",
     "fase": 3,
     "dia": 54,
     "prazoGuia": "2026-11-30",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Jurídico",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "C7",
     "titulo": "Revisar contratos de longo prazo e cláusulas de \"impostos inclusos\"",
     "area": "Compras",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Compras e Jurídico",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "J2",
     "titulo": "Revisar contratos com clientes e fornecedores: cláusulas tributárias, recolhimento pelo adquirente e reequilíbrio",
     "area": "Jurídico",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Jurídico",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Lista de contratos prioritários e aditivos necessários",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "J3",
     "titulo": "Acompanhar normas: lista IPI/Zona Franca de Manaus, regulamento do recolhimento pelo adquirente, regras do Simples e novas versões das notas técnicas",
     "area": "Jurídico",
     "fase": 0,
     "dia": null,
     "prazoGuia": null,
     "prio": "Alta",
     "exec": "PriceTax",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "Semanal",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "logistica",
   "titulo": "Logística",
   "responsavel": "Logística",
   "origem": "modelo",
   "modeloKey": "logistica",
   "descricao": "Fluxos físicos e documentos fiscais: transferência, remessa, retorno, devolução e transporte.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "L1",
     "titulo": "Validar com o Fiscal os fluxos físicos e documentais: transferências, remessas, retornos, entregas, devoluções e transporte",
     "area": "Logística e Operações",
     "fase": 3,
     "dia": 54,
     "prazoGuia": "2026-11-30",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Logística",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Matriz operacional validada com o Fiscal",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "rh",
   "titulo": "RH, Folha e DP",
   "responsavel": "RH",
   "origem": "novo-modelo",
   "modeloKey": "rh",
   "descricao": "Retenções sobre serviços, créditos de benefícios, reoneração da folha e mão de obra própria × contratada.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "P2",
     "titulo": "Verificar quais benefícios podem gerar crédito e se há previsão em acordo coletivo",
     "area": "RH, Folha e DP",
     "fase": 3,
     "dia": 52,
     "prazoGuia": "2026-11-28",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "RH",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "P3",
     "titulo": "Simular a reoneração gradual da folha (CPRB), se aplicável",
     "area": "RH, Folha e DP",
     "fase": 3,
     "dia": 52,
     "prazoGuia": "2026-11-28",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "DP",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "P1",
     "titulo": "Retirar PIS/Cofins das retenções sobre serviços (CSRF) e ajustar a EFD-Reinf",
     "area": "RH, Folha e DP",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · DP"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "P4",
     "titulo": "Comparar mão de obra própria com serviço contratado, com avaliação de risco trabalhista",
     "area": "RH, Folha e DP",
     "fase": 5,
     "dia": 175,
     "prazoGuia": "2027-03-31",
     "prio": "Baixa",
     "exec": "Cliente",
     "quem": "RH e Jurídico",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "sistemas",
   "titulo": "Adaptação de sistemas",
   "responsavel": "TI",
   "origem": "modelo",
   "modeloKey": "sistemas",
   "descricao": "Ambiente de homologação, campos novos da nota, DANFE, notas de débito e crédito, eventos, EFD e virada de PIS/Cofins e IPI.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "T16",
     "titulo": "Carregar as tabelas oficiais de cClassTrib, CST e cCredPres, que definem quais grupos e campos cada nota precisa ter",
     "area": "TI e ERP",
     "fase": 1,
     "dia": 9,
     "prazoGuia": "2026-10-16",
     "prio": "Crítica",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "Informe Técnico 2025.002 v1.70",
      "hom": "—",
      "prod": "até 16/10/2026"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T12",
     "titulo": "Liberar a emissão de nota de serviço com cClassTrib correto, inclusive de redução",
     "area": "TI e ERP",
     "fase": 1,
     "dia": 17,
     "prazoGuia": "2026-10-24",
     "prio": "Crítica",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · TI"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [
      "Prazo sugerido no guia, não definido em norma."
     ],
     "foraDaFase": true,
     "nota": "Texto do guia trazia a limitação do ERP de um cliente; removida.",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T13",
     "titulo": "Confirmar se o ERP calcula a base do ISS com IBS/CBS embutidos; se não, obter a data de entrega",
     "area": "TI e ERP",
     "fase": 1,
     "dia": 17,
     "prazoGuia": "2026-10-24",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · TI"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [
      "Prazo sugerido no guia, não definido em norma."
     ],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T17",
     "titulo": "Confirmar em produção o grupo IBS, CBS e IS por item (com CST e cClassTrib) e os novos totais em NF-e e NFC-e",
     "area": "TI e ERP",
     "fase": 1,
     "dia": 17,
     "prazoGuia": "2026-10-24",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2025.002-RTC v1.52",
      "hom": "07/07/2025 (schema)",
      "prod": "10/11/2025 (schema)"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial.",
      "Prazo sugerido no guia, não definido em norma."
     ],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T4",
     "titulo": "Garantir CNPJ alfanumérico (inclusive na chave de acesso) em cadastros, validações e integrações",
     "area": "TI e ERP",
     "fase": 1,
     "dia": 17,
     "prazoGuia": "2026-10-24",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · TI"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2026.004 (NF-e) e NT Conjunta 2025.001 v1.01",
      "hom": "até 15/06/2026",
      "prod": "01/07/2026"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial.",
      "Prazo sugerido no guia, não definido em norma."
     ],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T19",
     "titulo": "Referenciar a nota original item a item na devolução (DFeReferenciado); o refNFe passa a ser proibido",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 19,
     "prazoGuia": "2026-10-26",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2025.002-RTC v1.52",
      "hom": "26/10/2026",
      "prod": "16/11/2026"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T20",
     "titulo": "Preparar a validação cadastral na Receita: a Sefaz passa a checar o CRT do emitente e o CNPJ do destinatário e dos locais de entrega e retirada; revisar o cadastro de clientes antes",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 19,
     "prazoGuia": "2026-10-26",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2026.007 v1.10",
      "hom": "26/10/2026",
      "prod": "16/11/2026"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T5",
     "titulo": "Implementar os campos de valor líquido e a composição do vProd com IBS, CBS e IS a partir de 2027, com IBS/CBS na base do ICMS e do ISS configurável",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 19,
     "prazoGuia": "2026-10-26",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2026.008 v1.00",
      "hom": "26/10/2026",
      "prod": "16/11/2026 (campos) · 01/01/2027 (composição)"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T14",
     "titulo": "Definir onde a precificação será feita (ERP ou PriceTax), mapeando antes onde ela ocorre atualmente: no ERP ou em planilha externa",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 24,
     "prazoGuia": "2026-10-31",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "TI",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [
      "Prazo sugerido no guia, não definido em norma."
     ],
     "foraDaFase": false,
     "nota": "Texto do guia descrevia a situação atual de um cliente; reescrita como pergunta de levantamento.",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T7",
     "titulo": "Emitir notas de débito (finNFe 6) e de crédito (finNFe 5) com tipo e referência à nota original: juros, multas, adiantamentos e ajustes",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 24,
     "prazoGuia": "2026-10-31",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2025.002-RTC v1.36+",
      "hom": "até 01/07/2026",
      "prod": "03/08/2026"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial.",
      "Prazo sugerido no guia, não definido em norma."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T10",
     "titulo": "NFS-e nacional: grupo IBS/CBS nas notas prestadas e leitura das tomadas pelo Ambiente de Dados Nacional (ADN), depois de liberado o cClassTrib de serviços (T12); acompanhar notas de ajuste, vAjusteBC e vinculação de pagamento",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 38,
     "prazoGuia": "2026-11-14",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NFS-e NT 004, NT 007 e NT 009",
      "hom": "10/12/2025",
      "prod": "05/01/2026 · NT 009 sem cronograma"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T18",
     "titulo": "Habilitar os eventos da Reforma do emitente e do destinatário: crédito, antecipação, perdas e imobilização",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 38,
     "prazoGuia": "2026-11-14",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2025.002-RTC, eventos v1.40",
      "hom": "—",
      "prod": "27/07/2026 (schema)"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial.",
      "Prazo sugerido no guia, não definido em norma."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T6",
     "titulo": "Atualizar o DANFE com o bloco de IBS, CBS e IS e os dados tributários por item",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 38,
     "prazoGuia": "2026-11-14",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2026.010 v1.00",
      "hom": "—",
      "prod": "01/12/2026"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T23",
     "titulo": "CT-e: ler o grupo IBS/CBS como tomadora de frete (e gerar, se emitir CT-e); em 2027 o frete inclui IBS/CBS; emitir o evento 211110 de crédito presumido no frete de autônomo ou MEI; fim do EPEC",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 40,
     "prazoGuia": "2026-11-16",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "CT-e NT 2025.001-RTC, 2026.002 e 2026.004-RTC",
      "hom": "13/10/2026 (bloco 1) · 16/11/2026 (bloco 2)",
      "prod": "16/11/2026 (bloco 1) · 14/12/2026 (evento 211110)"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T24",
     "titulo": "Ler faturas de energia, telecom, água e gás (NF3e, NFCom, NFAg, NFGas) com IBS/CBS para crédito; em 2027 o vProd inclui os tributos",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 40,
     "prazoGuia": "2026-11-16",
     "prio": "Média",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "NT 2025.001, 2026.002 e 2026.004",
      "hom": "13/10/2026",
      "prod": "16/11/2026"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T8",
     "titulo": "Carregar a tabela de alíquotas da CBS por vigência e a nova coluna indExcIBSCBS da tabela de CFOP, sem alíquota fixa no sistema",
     "area": "TI e ERP",
     "fase": 2,
     "dia": 40,
     "prazoGuia": "2026-11-16",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "IT 2026.002 v1.00 e IT 2023.002 v2.10",
      "hom": "01/09/2026 (CFOP)",
      "prod": "16/11/2026 (CFOP) · 01/01/2027 (alíquotas)"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": true,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T9",
     "titulo": "Separar nos títulos o valor da mercadoria e o do tributo, com baixa parcial por recolhimento pelo adquirente e guia por documento",
     "area": "TI e ERP",
     "fase": 3,
     "dia": 52,
     "prazoGuia": "2026-11-28",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Financeiro"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T26",
     "titulo": "Testar as integrações entre ERP, faturamento, compras, estoque, financeiro, contabilidade, portal de regras e PriceTax",
     "area": "TI e ERP",
     "fase": 3,
     "dia": 54,
     "prazoGuia": "2026-11-30",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · TI"
     ],
     "recorrencia": "",
     "entrega": "Evidências de integração e correção de erros críticos",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T11",
     "titulo": "Criar relatório de créditos por fornecedor e documento (apurado e liberado)",
     "area": "TI e ERP",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Média",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T25",
     "titulo": "Gerar a EFD ICMS/IPI no leiaute 021 de 2027, com CNPJ alfanumérico e indicador de benefício, validando no PVA 6.1.1",
     "area": "TI e ERP",
     "fase": 3,
     "dia": 66,
     "prazoGuia": "2026-12-12",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "EFD ICMS/IPI NT 2026.001",
      "hom": "PVA 6.1.1 (27/07/2026)",
      "prod": "01/01/2027"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial.",
      "Versão do leiaute e do PVA citadas no guia; conferir no Guia Prático da EFD.",
      "Prazo sugerido no guia, não definido em norma."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T22",
     "titulo": "Desligar PIS/Cofins e aplicar IPI com alíquota zero para fatos geradores a partir de 01/01/2027, mantendo as exceções da Zona Franca de Manaus definidas em F5",
     "area": "TI e ERP",
     "fase": 4,
     "dia": 69,
     "prazoGuia": "2026-12-15",
     "prio": "Alta",
     "exec": "ERP",
     "quem": "",
     "apoio": [
      "Cliente · Fiscal"
     ],
     "recorrencia": "",
     "entrega": "",
     "norma": {
      "nt": "EC 132 (ADCT art. 126) · LC 214, arts. 454 e 542",
      "hom": "testar até 15/12/2026",
      "prod": "31/12/2026"
     },
     "conferir": [
      "Datas e referências de norma do guia (NT, homologação, produção) ainda não conferidas na norma oficial."
     ],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "T27",
     "titulo": "Preparar plano de contingência para falha de emissão, atualização de tabelas ou indisponibilidade do ERP ou da Sefaz",
     "area": "TI e ERP",
     "fase": 4,
     "dia": 69,
     "prazoGuia": "2026-12-15",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "TI",
     "apoio": [
      "ERP"
     ],
     "recorrencia": "",
     "entrega": "Procedimento de contingência com responsáveis",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "treinamento",
   "titulo": "Tira-dúvidas geral e treinamento",
   "responsavel": "Todas",
   "origem": "modelo",
   "modeloKey": "duvidas",
   "descricao": "Todas as áreas juntas para fechar pendências e treinar as equipes nos novos procedimentos.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "P5",
     "titulo": "Treinar Fiscal, Compras, Faturamento, Financeiro, Contabilidade e Cadastro nos novos procedimentos",
     "area": "RH, Folha e DP",
     "fase": 4,
     "dia": 69,
     "prazoGuia": "2026-12-15",
     "prio": "Baixa",
     "exec": "Cliente",
     "quem": "RH",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Treinamentos realizados e materiais disponíveis",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "prontidao",
   "titulo": "Prontidão da virada (go/no-go)",
   "responsavel": "Diretoria",
   "origem": "novo-modelo",
   "modeloKey": "prontidao",
   "descricao": "Critérios mínimos de prontidão, plano de suporte de janeiro e a decisão de seguir ou não com a virada.",
   "validacao": "a-validar",
   "filhas": [
    {
     "id": "G2",
     "titulo": "Aprovar o plano de suporte de janeiro de 2027 e o escalonamento de incidentes",
     "area": "Diretoria e PMO",
     "fase": 4,
     "dia": 69,
     "prazoGuia": "2026-12-15",
     "prio": "Média",
     "exec": "Cliente",
     "quem": "Diretoria",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Escala de responsáveis, canais e critérios",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    },
    {
     "id": "G3",
     "titulo": "Decidir o go/no-go da virada com base nos critérios mínimos de prontidão",
     "area": "Diretoria e PMO",
     "fase": 4,
     "dia": 76,
     "prazoGuia": "2026-12-22",
     "prio": "Alta",
     "exec": "Cliente",
     "quem": "Diretoria",
     "apoio": [
      "PriceTax"
     ],
     "recorrencia": "",
     "entrega": "Ata da decisão e lista de pendências aceitas",
     "norma": {},
     "conferir": [],
     "foraDaFase": false,
     "nota": "",
     "origem": "guia",
     "validacao": "a-validar"
    }
   ]
  },
  {
   "key": "report-final",
   "titulo": "Report final e workshop",
   "responsavel": "PRICETAX",
   "origem": "fluxo-vellore",
   "modeloKey": null,
   "descricao": "Entrega do relatório final e workshop com a diretoria. Existe no fluxo real da Vellore; ainda não está no modelo.",
   "validacao": "a-validar",
   "filhas": []
  },
  {
   "key": "conselho",
   "titulo": "Reunião do Conselho — report de impactos",
   "responsavel": "Diretoria",
   "origem": "fluxo-vellore",
   "modeloKey": null,
   "descricao": "Apresentação dos impactos da reforma ao Conselho. Existe no fluxo real da Vellore; é opcional (depende do cliente).",
   "validacao": "a-validar",
   "filhas": []
  },
  {
   "key": "encerramento",
   "titulo": "Encerramento",
   "responsavel": "Diretoria",
   "origem": "modelo",
   "modeloKey": "encerramento",
   "descricao": "Retrospectiva do ciclo, balanço das pendências aceitas e plano do ano seguinte.",
   "validacao": "a-validar",
   "filhas": []
  }
 ],
 "pontos": [
  {
   "id": "duracao",
   "tema": "Duração do padrão",
   "situacao": "O guia é um plano de cerca de 6 meses (out/2026 a mar/2027), pensado para quem já está perto da virada. O modelo atual das empresas novas dura 12 meses (ago/2026 a jul/2027). Qual vale como padrão?",
   "sugestao": "Manter o ritmo do guia e usar prazos contados a partir do kickoff (D+n), para servir a qualquer empresa, não só às que começam em outubro."
  },
  {
   "id": "fases",
   "tema": "Fases",
   "situacao": "O guia tem 5 fases (Mobilização, Desenho e parametrização, Homologação integrada, Virada, Operação assistida). O modelo atual tem 3 (Leitura Real, Mão na Massa por Área, Consolidação).",
   "sugestao": "Usar as 5 do guia, com o diagnóstico da PRICETAX (kickoff, dados, número geral) dentro da Mobilização."
  },
  {
   "id": "granularidade",
   "tema": "Quantidade de atividades filhas",
   "situacao": "Este rascunho traz as 87 ações do guia como filhas. O modelo atual tem 15 atividades e cerca de 55 subatividades, resumindo as mesmas ações.",
   "sugestao": "Decidir se o padrão é completo (87) ou resumido; a empresa poderia começar no resumido e abrir o completo por área."
  },
  {
   "id": "fluxo-vellore",
   "tema": "Etapas do fluxo da Vellore",
   "situacao": "Envio dos dados, Análise e validação documental, Apresentação prévia, Report final e workshop e Reunião do Conselho existem no fluxo real da Vellore, mas não no modelo nem no guia. Entram sem filhas, porque não tenho o detalhe delas. A Vellore tem duas apresentações prévias (cenário AR e AR e DR); aqui está uma só.",
   "sugestao": "Dizer quais entram no padrão, se são obrigatórias ou opcionais, e quais são as filhas de cada uma."
  },
  {
   "id": "fora-da-fase",
   "tema": "Prazos fora da janela da fase",
   "situacao": "14 ações têm prazo fora da janela da fase em que o guia as colocou (FN1, T2, T3, C1, V1, F11, F2, T12, T13, T17, T4, T23, T24, T8). Estão marcadas em cada linha.",
   "sugestao": "Ajustar o prazo ou a fase de cada uma ao validar."
  },
  {
   "id": "conferir-norma",
   "tema": "Referências de norma do guia",
   "situacao": "21 ações trazem datas e referências de norma do guia (NT, homologação, produção): FN7, F18, F13, F2, F8, F17, T16, T17, T4, T19, T20, T5, T7, T10, T18, T6, T23, T24, T8, T25, T22. Não foram conferidas na norma oficial; entram marcadas \"a conferir\".",
   "sugestao": "Conferir no texto oficial (método IVANA) antes de o padrão ser aplicado a clientes."
  },
  {
   "id": "sugeridos",
   "tema": "Prazos sugeridos pelo guia",
   "situacao": "10 ações têm prazo que o próprio guia marca como sugerido, sem norma por trás: F18, F8, T12, T13, T17, T4, T14, T7, T18, T25.",
   "sugestao": "Confirmar ou ajustar."
  },
  {
   "id": "texto-cliente",
   "tema": "Textos que descreviam um cliente",
   "situacao": "Três ações do guia traziam a situação de um cliente (F11, T12, T14). O texto foi limpo para valer para qualquer empresa. Também troquei a sigla \"RAD\" por \"recolhimento pelo adquirente\" e \"ZFM\" por \"Zona Franca de Manaus\", como o modelo atual já faz.",
   "sugestao": "Conferir se a leitura dos três casos está certa."
  },
  {
   "id": "recorrentes",
   "tema": "Itens recorrentes",
   "situacao": "4 ações não têm prazo, e sim frequência (FN7, F10, F15, J3: semanal, por versão, contínuo).",
   "sugestao": "Decidir se viram atividade recorrente, lembrete ou ficam só como orientação."
  },
  {
   "id": "executor",
   "tema": "Quem executa",
   "situacao": "O guia separa quem executa (Cliente, ERP ou PriceTax). O cronograma de hoje tem um responsável por atividade, e o ERP não é uma pessoa da equipe.",
   "sugestao": "Decidir se \"ERP\" vira um responsável externo ou só um rótulo."
  },
  {
   "id": "vocabulario",
   "tema": "Vocabulário",
   "situacao": "O guia usa prioridade Crítica/Alta/Média/Baixa e a área \"Contábil\"; o app usa P1/P2/P3 e \"Controladoria\".",
   "sugestao": "Escolher um vocabulário e padronizar."
  },
  {
   "id": "aliquota",
   "tema": "Alíquota da CBS",
   "situacao": "O resumo do guia cita 9,3% para a CBS. Pelo Parecer 25/2026, o documento de 2027 traz CBS 9,20% e IBS 0,10%. Nenhuma ação deste rascunho cita percentual.",
   "sugestao": "Manter percentuais fora dos textos do padrão, ou usar o Parecer."
  },
  {
   "id": "aplicar",
   "tema": "Quando vira padrão de verdade",
   "situacao": "Este rascunho é só para visualizar. Empresas novas continuam recebendo o modelo de 12 atividades, e a Auditoria compara com ele.",
   "sugestao": "Depois da sua validação, o padrão aprovado passa a alimentar a empresa nova e a Auditoria."
  }
 ]
};
