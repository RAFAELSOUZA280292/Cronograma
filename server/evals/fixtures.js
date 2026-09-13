// RENATA Eval Harness — Fase 1 (2026-09-13, ver docs/RENATA_P0_P1_IMPLEMENTATION_PLAN.md
// e docs/RENATA_EVAL_BASELINE.md). Fixture de um projeto sintético, INSPIRADO em
// padrões reais já vividos nesta base (o caso real do rateio de seguro de vida
// documentado em PROJECT_CONTEXT.md §40, dependência bloqueando entrega, decisão
// atualizada depois) — mas com nome de cliente, pessoas e números FICTÍCIOS, de
// propósito: nunca comprometemos dado real de cliente num arquivo de teste
// versionado no repositório.
//
// Toda a seed usa CÓDIGO REAL de produção, nunca uma reimplementação:
// reindexProjectMemory (server/memoryIngest.js) gera os chunks exatamente como
// a ingestão de reunião de verdade faz; saveKnowledgeFact (server/knowledgeFacts.js)
// grava os fatos de conhecimento exatamente como o fluxo de confirmação do
// usuário faz. Isso garante que a Fase 1 mede o pipeline real, não uma cópia dele.
import { reindexProjectMemory } from '../memoryIngest.js';
import { saveKnowledgeFact } from '../knowledgeFacts.js';

export const EVAL_ORG_ID = 'eval-org-renata';
export const EVAL_USER_ID = 'eval-user-renata';
export const EVAL_PROJECT_ID = 'eval-proj-fixturecorp';

// IDs de reunião/atividade são estáveis (não gerados por uid() aleatório) —
// é isso que permite os casos em eval/evalCases.js referenciar "a decisão da
// reunião m2" de forma legível, em vez de um id de chunk aleatório (que muda
// a cada reindexação). Ver server/evals/evidenceKeys.js pra como isso vira
// uma chave de evidência estável mesmo depois do chunk existir no banco.
export const MEETINGS = [
  {
    id: 'm1',
    title: 'Reunião de Abertura',
    date: '2026-07-01',
    participants: ['Ana Martins', 'Felipe Dal Santo'],
    transcript: [
      '00:00',
      'Ana Martins',
      'Bom dia Felipe, vamos alinhar o início do diagnóstico tributário da Fixture Corp.',
      '',
      '00:01',
      'Felipe Dal Santo',
      'Bom dia Ana. Vou revisar o markup dos produtos importados com a equipe fiscal antes da próxima reunião.',
      '',
      '00:03',
      'Ana Martins',
      'Perfeito. Vamos combinar que o cronograma de diagnóstico começa em agosto.',
    ].join('\n'),
    summary: 'Reunião de abertura do projeto. Definido que o cronograma de diagnóstico começa em agosto. Felipe ficou responsável por revisar o markup dos produtos importados antes da próxima reunião.',
    decisions: '1) Cronograma de diagnóstico começa em agosto.',
    actionItems: [
      { id: 'ti-1', title: 'Revisar markup dos produtos importados', responsible: 'Felipe Dal Santo', owner: 'cliente', status: 'concluida', dueDate: '2026-07-15' },
    ],
  },
  {
    id: 'm2',
    title: 'Reunião de Alinhamento Fiscal',
    date: '2026-07-20',
    participants: ['Ana Martins', 'Felipe Dal Santo', 'Camila Souza'],
    transcript: [
      '00:00',
      'Felipe Dal Santo',
      'Sobre o markup, decidi que vamos aplicar 8% sobre os produtos da linha B, conforme conversamos.',
      '',
      '00:02',
      'Ana Martins',
      'Combinado. Vou registrar isso como decisão do projeto.',
      '',
      '00:04',
      'Camila Souza',
      'Certo, eu aviso o pessoal do comercial sobre a linha B.',
    ].join('\n'),
    summary: 'Definido o markup de 8% para os produtos da linha B, a pedido do Felipe.',
    decisions: '1) Markup da linha B definido em 8%.',
    actionItems: [],
  },
  {
    id: 'm3',
    title: 'Reunião de Revisão de Benefícios',
    date: '2026-08-05',
    participants: ['Ana Martins', 'Camila Souza'],
    transcript: [
      '00:00',
      'Ana Martins',
      'Vamos revisar os benefícios de RH. Como está o rateio do seguro de vida hoje?',
      '',
      '00:02',
      'Camila Souza',
      'Pelo nosso resumo interno, a empresa paga 90% e o funcionário paga 10%.',
    ].join('\n'),
    summary: 'Revisão dos benefícios de RH. O resumo registra o rateio do seguro de vida como empresa 90% e funcionário 10%.',
    decisions: '',
    actionItems: [],
  },
  {
    // Contradiz m3 sobre o MESMO assunto (rateio do seguro de vida), sem
    // nenhuma palavra de negação textual explícita ("não é", "nunca") —
    // inspirado no caso real do PROJECT_CONTEXT.md §40.
    id: 'm4',
    title: 'Reunião de Follow-up RH',
    date: '2026-08-18',
    participants: ['Camila Souza', 'Bruno Ferreira'],
    transcript: [
      '10:18',
      'Bruno Ferreira',
      'Camila, confirma pra mim o rateio do seguro de vida?',
      '',
      '10:20',
      'Camila Souza',
      'Na verdade a maior parte é paga pelo funcionário. Acho que é o contrário do que foi registrado antes.',
    ].join('\n'),
    summary: 'Camila trouxe uma informação diferente sobre o rateio do seguro de vida em relação ao resumo da reunião anterior.',
    decisions: '',
    actionItems: [],
  },
  {
    // Atividade atrasada por dependência — caso CAUSAL/MULTI_HOP: a resposta
    // certa cruza reunião (m6) + atividade do cronograma oficial (act-1).
    id: 'm6',
    title: 'Reunião de Status do Diagnóstico',
    date: '2026-08-22',
    participants: ['Bruno Ferreira', 'Camila Souza'],
    transcript: [
      '00:00',
      'Bruno Ferreira',
      'A entrega do diagnóstico fiscal atrasou porque o documento de estrutura societária não chegou do cliente.',
      '',
      '00:02',
      'Camila Souza',
      'Vou verificar com o jurídico e assumo essa pendência.',
    ].join('\n'),
    summary: 'A entrega do diagnóstico fiscal está atrasada porque o documento de estrutura societária não chegou. Camila assumiu a pendência de resolver isso com o jurídico.',
    decisions: '',
    actionItems: [
      { id: 'ti-2', title: 'Enviar estrutura societária para a PRICETAX', responsible: 'Camila Souza', owner: 'cliente', status: 'em-andamento', dueDate: '2026-08-29' },
    ],
  },
  {
    // Atualização temporal da decisão de m2 — mesmo assunto (markup da
    // linha B), data posterior, SEM negação textual (é uma revisão, não
    // uma contradição) — caso TEMPORAL/DECISION.
    id: 'm5',
    title: 'Reunião de Revisão de Preços',
    date: '2026-09-05',
    participants: ['Ana Martins', 'Felipe Dal Santo'],
    transcript: [
      '00:00',
      'Felipe Dal Santo',
      'Precisamos revisar o markup da linha B por causa do aumento de custo de importação.',
      '',
      '00:02',
      'Ana Martins',
      'Concordo. Vamos revisar o markup da linha B para 12%.',
    ].join('\n'),
    summary: 'Revisado o markup da linha B para 12%, por causa do aumento de custo de importação.',
    decisions: '1) Markup da linha B revisado para 12%.',
    actionItems: [],
  },
  {
    // Termo do usuário ("subiu") não aparece literalmente no chunk
    // ("majorar") — caso de retrieval que exige a perna semântica, não só
    // full-text lexical.
    id: 'm7',
    title: 'Reunião de Precificação',
    date: '2026-07-10',
    participants: ['Felipe Dal Santo', 'Ana Martins'],
    transcript: [
      '00:00',
      'Felipe Dal Santo',
      'Decidimos majorar o valor de venda dos produtos importados pra absorver o custo extra da importação.',
      '',
      '00:02',
      'Ana Martins',
      'Entendido, vou registrar isso no projeto.',
    ].join('\n'),
    summary: 'Definido reajuste no valor de venda dos produtos importados por causa do custo extra de importação.',
    decisions: '1) Valor de venda dos produtos importados foi majorado.',
    actionItems: [],
  },
];

export const ACTIVITIES = [
  { id: 'act-1', title: 'Entrega do Diagnóstico Fiscal', phase: 'f2', date: '2026-08-25', status: 'em-andamento', responsible: 'Bruno Ferreira' },
  { id: 'act-2', title: 'Revisão de Markup Linha B', phase: 'f2', date: '2026-09-20', status: 'nao-iniciado', responsible: 'Ana Martins' },
];

export function buildFixtureProjectData() {
  return {
    company: {
      name: 'Fixture Indústria e Comércio LTDA',
      nomeFantasia: 'Fixture Corp',
      cnpj: '12.345.678/0001-90',
      regimeTributario: 'Lucro Real',
      clientType: 'diagnostico-consultoria',
      status: 'ativo',
    },
    team: ['Ana Martins', 'Bruno Ferreira'],
    externalContacts: [
      { name: 'Felipe Dal Santo', email: 'felipe@fixturecorp.example' },
      { name: 'Camila Souza', email: 'camila@fixturecorp.example' },
    ],
    phases: [
      { id: 'f1', name: 'Diagnóstico' },
      { id: 'f2', name: 'Execução' },
    ],
    activities: ACTIVITIES,
    meetings: MEETINGS,
  };
}

// Pares de fatos de CONHECIMENTO seedados via saveKnowledgeFact (código
// real, não reimplementado) — dão dois casos TEMPORAL/CONFLICT extras que
// não dependem de reunião nenhuma, testando loadRelevantFacts/classifyRelation
// diretamente. Cada entrada é aplicada em ORDEM (a segunda é avaliada contra
// a primeira já salva).
export const KNOWLEDGE_FACT_SEEDS = [
  {
    key: 'fiscalResponsible-v1',
    subject: 'responsável fiscal da Fixture Corp',
    content: 'Felipe Dal Santo é o responsável fiscal da Fixture Corp.',
    knowledgeType: 'FACT',
    scope: 'project',
    validFrom: '2026-07-01',
  },
  {
    // Mesmo assunto, validFrom posterior — deve classificar como 'update'
    // (o mecanismo de vigência temporal já existe e já é exercitado aqui).
    key: 'fiscalResponsible-v2',
    subject: 'responsável fiscal da Fixture Corp',
    content: 'Camila Souza passou a ser a responsável fiscal da Fixture Corp a partir de 01/09/2026.',
    knowledgeType: 'FACT',
    scope: 'project',
    validFrom: '2026-09-01',
  },
  {
    key: 'deadline-v1',
    subject: 'prazo de entrega do diagnóstico fiscal',
    content: 'O prazo de entrega do diagnóstico fiscal é 25/08/2026.',
    knowledgeType: 'FACT',
    scope: 'project',
    validFrom: null,
  },
  {
    // Mesmo assunto, valor DIFERENTE, sem validFrom (não é uma "atualização"
    // temporal do ponto de vista do mecanismo atual) e sem nenhuma negação
    // textual — é exatamente o ponto cego já documentado no gap analysis
    // (item 9, Conflict Engine 2.0): classifyRelation hoje provavelmente
    // classifica isso como 'complement', não 'conflict'. O objetivo da
        // Fase 1 é REGISTRAR esse resultado como baseline, não corrigi-lo.
    key: 'deadline-v2',
    subject: 'prazo de entrega do diagnóstico fiscal',
    content: 'O prazo de entrega do diagnóstico fiscal é 10/09/2026.',
    knowledgeType: 'FACT',
    scope: 'project',
    validFrom: null,
  },
];

async function ensureOrgUserProject(pool) {
  await pool.query(
    `INSERT INTO organizations (id, slug, name, display_name)
     VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
    [EVAL_ORG_ID, 'eval-org-renata', 'PRICETAX (Eval)', 'PRICETAX (Eval)'],
  );
  await pool.query(
    `INSERT INTO users (id, username, password_hash, name, email, role, org_id)
     VALUES ($1,$2,$3,$4,$5,'pricetax',$6) ON CONFLICT (id) DO NOTHING`,
    [EVAL_USER_ID, 'eval-user-renata', 'eval-not-a-real-hash', 'Usuário de Avaliação RENATA', 'eval@pricetax.example', EVAL_ORG_ID],
  );
  const data = buildFixtureProjectData();
  await pool.query(
    `INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)
     ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=now()`,
    [EVAL_PROJECT_ID, JSON.stringify(data), EVAL_ORG_ID],
  );
  return data;
}

// Idempotente: pode ser chamado quantas vezes for preciso (reseed limpa e
// recria os chunks de cada reunião — mesmo comportamento de reindexMeetingMemory
// em produção). Fatos de conhecimento SÓ são semeados na primeira vez (checagem
// por subject) — rodar saveKnowledgeFact de novo sobre um fato já existente
// mudaria a classificação de relação (viraria 'duplicate'), o que não é o que
// queremos num reseed de rotina.
export async function seedFixtures(pool) {
  const projectData = await ensureOrgUserProject(pool);
  const { chunksCreated, meetingsIndexed } = await reindexProjectMemory(pool, EVAL_ORG_ID, EVAL_PROJECT_ID, projectData);

  const { rows: existingFacts } = await pool.query(
    `SELECT subject FROM ai_knowledge_facts WHERE project_id=$1 OR (scope='project' AND project_id IS NULL)`,
    [EVAL_PROJECT_ID],
  );
  const existingSubjects = new Set(existingFacts.map((r) => r.subject));
  const factSeedResults = [];
  if (!existingSubjects.has(KNOWLEDGE_FACT_SEEDS[0].subject)) {
    for (const seed of KNOWLEDGE_FACT_SEEDS) {
      // eslint-disable-next-line no-await-in-loop -- ordem importa (a 2ª é comparada contra a 1ª já salva)
      const result = await saveKnowledgeFact(pool, {
        orgId: EVAL_ORG_ID, projectId: EVAL_PROJECT_ID, scope: seed.scope, subject: seed.subject,
        content: seed.content, knowledgeType: seed.knowledgeType, validFrom: seed.validFrom,
        sourceUserId: EVAL_USER_ID, sourceConversationId: null, origin: 'conversation',
      });
      factSeedResults.push({ key: seed.key, subject: seed.subject, ...result });
    }
  } else {
    const { rows } = await pool.query(
      `SELECT id, subject, status FROM ai_knowledge_facts WHERE project_id=$1 ORDER BY created_at ASC`,
      [EVAL_PROJECT_ID],
    );
    rows.forEach((r) => factSeedResults.push({ key: '(já existia)', subject: r.subject, id: r.id, status: r.status }));
  }

  const { rows: updatedProject } = await pool.query('SELECT updated_at FROM projects WHERE id=$1', [EVAL_PROJECT_ID]);

  return {
    projectData, chunksCreated, meetingsIndexed, factSeedResults,
    projectUpdatedAt: updatedProject[0].updated_at,
  };
}

// Remove TUDO que a fixture criou, na ordem correta de FK — usado só quando
// alguém pedir explicitamente pra limpar (nunca chamado automaticamente
// pelo runner, pra permitir inspecionar o estado semeado no Postgres local
// depois de uma execução).
export async function teardownFixtures(pool) {
  await pool.query('DELETE FROM ai_knowledge_fact_entities WHERE fact_id IN (SELECT id FROM ai_knowledge_facts WHERE project_id=$1)', [EVAL_PROJECT_ID]);
  await pool.query('DELETE FROM ai_knowledge_facts WHERE project_id=$1', [EVAL_PROJECT_ID]);
  await pool.query('DELETE FROM ai_answer_cache WHERE project_id=$1', [EVAL_PROJECT_ID]);
  await pool.query('DELETE FROM ai_messages WHERE conversation_id IN (SELECT id FROM ai_conversations WHERE project_id=$1)', [EVAL_PROJECT_ID]);
  await pool.query('DELETE FROM ai_conversations WHERE project_id=$1', [EVAL_PROJECT_ID]);
  await pool.query('DELETE FROM project_memory_chunks WHERE project_id=$1', [EVAL_PROJECT_ID]);
  await pool.query('DELETE FROM projects WHERE id=$1', [EVAL_PROJECT_ID]);
  await pool.query('DELETE FROM users WHERE id=$1', [EVAL_USER_ID]);
  await pool.query('DELETE FROM organizations WHERE id=$1', [EVAL_ORG_ID]);
}

// Reseta só a CONVERSA (mensagens + cache) entre casos, mantendo
// org/user/project/chunks/fatos intactos — cada caso do eval precisa
// começar sem histórico de conversa de um caso anterior "vazando" pra
// dentro de resolveQuery (resolução de pronome incorreta), a não ser que o
// próprio caso peça turnos anteriores de propósito (ver seedPriorTurns).
export async function resetConversation(pool) {
  await pool.query('DELETE FROM ai_messages WHERE conversation_id IN (SELECT id FROM ai_conversations WHERE project_id=$1 AND user_id=$2)', [EVAL_PROJECT_ID, EVAL_USER_ID]);
}

export async function clearAnswerCache(pool) {
  await pool.query('DELETE FROM ai_answer_cache WHERE project_id=$1', [EVAL_PROJECT_ID]);
}

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

// Insere turnos anteriores DIRETO na conversa (mesmo shape de INSERT que
// askProjectAssistant usa) — só pra casos AMBIGUOUS_REFERENCE, que precisam
// de um histórico real pra resolveQuery resolver "ele"/"depois" contra.
export async function seedPriorTurns(pool, turns) {
  const { rows } = await pool.query(
    `INSERT INTO ai_conversations (id, org_id, project_id, user_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (project_id, user_id) DO NOTHING RETURNING id`,
    [uid('aic'), EVAL_ORG_ID, EVAL_PROJECT_ID, EVAL_USER_ID],
  );
  const conv = rows[0] || (await pool.query('SELECT id FROM ai_conversations WHERE project_id=$1 AND user_id=$2', [EVAL_PROJECT_ID, EVAL_USER_ID])).rows[0];
  for (const turn of turns) {
    // eslint-disable-next-line no-await-in-loop -- ordem cronológica importa
    await pool.query(
      `INSERT INTO ai_messages (id, conversation_id, role, content) VALUES ($1,$2,$3,$4)`,
      [uid('aim'), conv.id, turn.role, turn.content],
    );
  }
}
