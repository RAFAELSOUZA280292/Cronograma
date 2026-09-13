// RENATA Eval Harness — Fase 1. Casos de teste controlados contra a
// fixture única definida em server/evals/fixtures.js ("Fixture Corp",
// inspirada em padrões reais já vividos neste projeto — nomes/números
// fictícios de propósito). Cada caso usa SÓ os campos de `expected` que
// fazem sentido pra ele (nenhum campo é obrigatório em todos).
//
// Cobertura: FACTUAL, PERSON, MEETING, ACTIVITY, DECISION, TEMPORAL,
// CONFLICT, CAUSAL, EXECUTIVE, NO_EVIDENCE, AMBIGUOUS_REFERENCE, MULTI_HOP —
// com dificuldade crescente dentro de cada categoria onde fizer sentido.
export const EVAL_CASES = [
  // ------------------------------------------------------------------ FACTUAL
  {
    id: 'factual-01-easy',
    category: 'FACTUAL',
    difficulty: 'easy',
    question: 'Qual o CNPJ do cliente?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      answerFacts: ['12.345.678/0001-90'],
    },
  },
  {
    id: 'factual-02-medium',
    category: 'FACTUAL',
    difficulty: 'medium',
    question: 'Quantas reuniões já foram registradas neste projeto?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      answerFacts: ['7'],
    },
  },

  // ------------------------------------------------------------------- PERSON
  {
    id: 'person-01-easy',
    category: 'PERSON',
    difficulty: 'easy',
    question: 'Quem participou da Reunião de Alinhamento Fiscal?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      meetingId: 'm2',
      shouldHaveEvidence: true,
      answerFacts: ['Ana Martins', 'Felipe Dal Santo', 'Camila Souza'],
      evidence: { chunkKeys: ['chunk:m2#meeting_summary#0'] },
    },
  },
  {
    id: 'person-02-medium',
    category: 'PERSON',
    difficulty: 'medium',
    // Pessoa mencionada em VÁRIAS reuniões (m1, m2, m5, m7) — testa se a
    // busca agrega o histórico inteiro, não só a menção mais recente.
    question: 'O que o Felipe falou sobre o markup dos produtos?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      entities: ['Felipe Dal Santo'],
      shouldHaveEvidence: true,
      answerFacts: ['8%', 'linha B'],
      evidence: { chunkKeys: ['chunk:m2#transcript_segment#0', 'chunk:m2#meeting_decision#0'] },
    },
  },

  // ------------------------------------------------------------------ MEETING
  {
    id: 'meeting-01-easy',
    category: 'MEETING',
    difficulty: 'easy',
    question: 'Resuma a Reunião de Abertura.',
    expected: {
      intent: 'pergunta_sobre_projeto',
      meetingId: 'm1',
      shouldHaveEvidence: true,
      answerFacts: ['diagnóstico', 'agosto', 'markup'],
      evidence: { chunkKeys: ['chunk:m1#meeting_summary#0'] },
    },
  },
  {
    id: 'meeting-02-hard',
    category: 'MEETING',
    difficulty: 'hard',
    question: 'Resuma a última reunião registrada.',
    expected: {
      intent: 'pergunta_sobre_projeto',
      meetingId: 'm5', // data mais recente (2026-09-05) — exige comparar datas, não pegar a última da lista por ordem de criação
      shouldHaveEvidence: true,
      answerFacts: ['markup', '12%'],
    },
  },

  // ----------------------------------------------------------------- ACTIVITY
  {
    id: 'activity-01-easy',
    category: 'ACTIVITY',
    difficulty: 'easy',
    question: 'Qual o status da atividade "Entrega do Diagnóstico Fiscal"?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      answerFacts: ['em andamento', 'Bruno Ferreira'],
    },
  },
  {
    id: 'activity-02-hard',
    category: 'ACTIVITY',
    difficulty: 'hard',
    question: 'Não estou entendendo a atividade "Enviar estrutura societária para a PRICETAX" só pelo título — me dá mais contexto.',
    expected: {
      intent: 'pergunta_sobre_projeto',
      kind: 'activity',
      meetingId: 'm6',
      shouldHaveEvidence: true,
      answerFacts: ['documento de estrutura societária', 'jurídico'],
      evidence: { chunkKeys: ['chunk:m6#activity#0'] },
    },
  },

  // ----------------------------------------------------------------- DECISION
  {
    id: 'decision-01-easy',
    category: 'DECISION',
    difficulty: 'easy',
    question: 'O que ficou decidido sobre o cronograma na reunião de abertura?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      meetingId: 'm1',
      shouldHaveEvidence: true,
      answerFacts: ['cronograma de diagnóstico começa em agosto'],
      evidence: { chunkKeys: ['chunk:m1#meeting_decision#0'] },
    },
  },
  {
    id: 'decision-02-medium',
    category: 'DECISION',
    difficulty: 'medium',
    question: 'Qual foi a decisão sobre o markup da linha B?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      // Ambíguo de propósito: existem DUAS decisões sobre o mesmo assunto
      // (8% em m2, depois 12% em m5) — o esperado é que a resposta reflita
      // a mais RECENTE (12%) como a decisão vigente, sem negar a anterior.
      answerFacts: ['12%'],
    },
  },

  // ----------------------------------------------------------------- TEMPORAL
  {
    id: 'temporal-01-medium',
    category: 'TEMPORAL',
    difficulty: 'medium',
    question: 'Quem é o responsável fiscal da Fixture Corp hoje?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      answerFacts: ['Camila Souza'],
      evidence: { factKeys: ['fact:responsável fiscal da Fixture Corp#v2'] },
    },
  },
  {
    id: 'temporal-02-hard',
    category: 'TEMPORAL',
    difficulty: 'hard',
    // Gap JÁ CONHECIDO (docs/RENATA_COGNITIVE_ARCHITECTURE_GAP_ANALYSIS.md,
    // item 9): resolveQuery não extrai uma data-alvo da pergunta, então não
    // existe hoje nenhum caminho pra responder "antes de X" corretamente —
    // ESPERA-SE que este caso feche como FALHA. Isso é o objetivo da Fase 1:
    // registrar o erro como baseline, nunca corrigir aqui.
    question: 'Quem era o responsável fiscal da Fixture Corp antes de setembro de 2026?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      forbiddenClaims: ['Camila Souza'], // resposta correta seria Felipe — se disser Camila sem qualificar, é o erro temporal esperado
      answerFacts: ['Felipe Dal Santo'],
    },
  },
  {
    id: 'temporal-03-hard',
    category: 'TEMPORAL',
    difficulty: 'hard',
    question: 'Qual era o markup da linha B antes da reunião de revisão de preços de 05/09?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      forbiddenClaims: ['12%'], // valor vigente APÓS a revisão — se a resposta usar esse valor pra "antes", é o mesmo gap temporal
      answerFacts: ['8%'],
    },
  },

  // ----------------------------------------------------------------- CONFLICT
  {
    id: 'conflict-01-medium',
    category: 'CONFLICT',
    difficulty: 'medium',
    // Inspirado no caso real do PROJECT_CONTEXT.md §40 — duas falas
    // contraditórias sobre o MESMO assunto, sem negação textual explícita.
    question: 'Qual o rateio do seguro de vida na Fixture Corp?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      expectConflictDetected: true,
      answerFacts: ['90%', 'funcionário'],
      evidence: { chunkKeys: ['chunk:m3#meeting_summary#0', 'chunk:m4#transcript_segment#0'] },
    },
  },
  {
    id: 'conflict-02-hard',
    category: 'CONFLICT',
    difficulty: 'hard',
    // Informação COMPLEMENTAR (não conflito) — mesmo tópico (markup), mas
    // uma reunião não contradiz a outra, é uma atualização no tempo.
    // Verifica false positive do mecanismo de conflito.
    question: 'O markup da linha B mudou de valor em algum momento?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      expectConflictDetected: false,
      answerFacts: ['8%', '12%'],
    },
  },

  // -------------------------------------------------------------------CAUSAL
  {
    id: 'causal-01-medium',
    category: 'CAUSAL',
    difficulty: 'medium',
    question: 'Por que a entrega do diagnóstico fiscal atrasou?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      answerFacts: ['documento de estrutura societária', 'não chegou'],
      evidence: { chunkKeys: ['chunk:m6#meeting_summary#0'] },
    },
  },
  {
    id: 'causal-02-hard',
    category: 'CAUSAL',
    difficulty: 'hard',
    // Multi-hop de verdade: atividade atrasou -> por causa do documento ->
    // relatado na reunião -> responsável assumiu a pendência. Sem Planner
    // (fora de escopo da Fase 1), espera-se desempenho PIOR aqui — é o
    // baseline "antes do Planner" pedido explicitamente.
    question: 'A entrega do diagnóstico fiscal está atrasada por causa de quê, e quem ficou responsável por resolver isso?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      answerFacts: ['estrutura societária', 'Camila Souza'],
      evidence: { chunkKeys: ['chunk:m6#meeting_summary#0', 'chunk:m6#activity#0'] },
    },
  },

  // ---------------------------------------------------------------- EXECUTIVE
  {
    id: 'executive-01-hard',
    category: 'EXECUTIVE',
    difficulty: 'hard',
    question: 'Qual é a situação atual do projeto?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      // Cobertura parcial é aceitável/esperada aqui (snapshot fixo de hoje,
      // sem Adaptive Context) — o valor deste caso é medir RUÍDO/cobertura
      // pra servir de referência futura, não um pass/fail rígido.
      answerFacts: ['diagnóstico fiscal', 'atrasad'],
    },
  },
  {
    id: 'executive-02-hard',
    category: 'EXECUTIVE',
    difficulty: 'hard',
    question: 'O que merece atenção da diretoria neste projeto agora?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      answerFacts: ['diagnóstico fiscal'],
    },
  },

  // ------------------------------------------------------------- NO_EVIDENCE
  {
    id: 'no-evidence-01-easy',
    category: 'NO_EVIDENCE',
    difficulty: 'easy',
    question: 'Qual a política de home office da Fixture Corp?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: false,
      forbiddenClaims: ['home office'],
    },
  },
  {
    id: 'no-evidence-02-medium',
    category: 'NO_EVIDENCE',
    difficulty: 'medium',
    // FALSO NEGATIVO potencial: a evidência EXISTE (m7, "majorar o valor de
    // venda"), mas usa um termo bem diferente do da pergunta — testa se a
    // busca lexical+semântica encontra mesmo sem overlap de palavra.
    question: 'Os produtos importados tiveram algum reajuste de preço?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true, // a evidência EXISTE — se vier false, é um false_negative real
      answerFacts: ['majorar', 'importação'],
      evidence: { chunkKeys: ['chunk:m7#meeting_decision#0'] },
    },
  },

  // ----------------------------------------------------------- AMBIGUOUS_REFERENCE
  {
    id: 'ambiguous-ref-01-hard',
    category: 'AMBIGUOUS_REFERENCE',
    difficulty: 'hard',
    priorTurns: [
      { role: 'user', content: 'O que o Felipe decidiu sobre o markup na reunião de julho?' },
      { role: 'assistant', content: 'Na Reunião de Alinhamento Fiscal (20/07), Felipe decidiu aplicar 8% de markup sobre os produtos da linha B.' },
    ],
    question: 'E o que ele falou depois, na reunião de setembro?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      resolvedTerms: ['Felipe', 'markup'],
      shouldHaveEvidence: true,
      answerFacts: ['12%'],
      evidence: { chunkKeys: ['chunk:m5#transcript_segment#0'] },
    },
  },

  // ------------------------------------------------------------------ MULTI_HOP
  {
    id: 'multi-hop-01-hard',
    category: 'MULTI_HOP',
    difficulty: 'hard',
    // Exige cruzar 2 reuniões (m2 decide 8%, m5 revisa pra 12%) MAIS a
    // atividade oficial do cronograma (act-2, "Revisão de Markup Linha B").
    question: 'Qual a atividade do cronograma relacionada à revisão de markup, e como o valor do markup evoluiu até agora?',
    expected: {
      intent: 'pergunta_sobre_projeto',
      shouldHaveEvidence: true,
      answerFacts: ['Revisão de Markup Linha B', '8%', '12%'],
      evidence: { chunkKeys: ['chunk:m2#meeting_decision#0', 'chunk:m5#meeting_decision#0'] },
    },
  },
];

export const CATEGORIES = Array.from(new Set(EVAL_CASES.map((c) => c.category)));
