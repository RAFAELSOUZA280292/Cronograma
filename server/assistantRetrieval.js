// RENATA — Assistente do Projeto (2026-09, Fase 2 do Assistente
// Inteligente de Projetos; identidade "RENATA" e princípios de atuação
// definidos 2026-09-10, ver PROJECT_CONTEXT.md §27) — pipeline de 2
// chamadas à IA em cima da memória já construída na Fase 1
// (server/memoryRetrieval.js): (1) resolve a pergunta do usuário —
// puxando pronomes/referências do turno anterior ("esse assunto") —
// numa busca concreta; (2) recebe os trechos recuperados e produz a
// resposta final, só podendo citar como fonte um trecho que realmente
// foi recuperado (validado depois pelo backend, não só por instrução de
// prompt — ver `askProjectAssistant`). Mesmo padrão de saída
// estruturada garantida já usado em server/meetingInbox.js
// (`client.messages.parse` + Zod).
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { searchProjectMemory, getMeetingTranscriptChunks } from './memoryRetrieval.js';
import { buildProjectSnapshot, buildPersonLookupText, todayIso } from './assistantContext.js';
import { executeProposedAction } from './assistantActions.js';
import { googleConfigured, getConnectionStatus, listEvents } from './googleCalendar.js';
import { loadRelevantFacts } from './knowledgeFacts.js';
import { voyageConfigured, embedTexts } from './embeddings.js';
import { computeFingerprint, lookupCachedAnswer, saveCachedAnswer } from './answerCache.js';
import { logMetric } from './metrics.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

// Retry único e curto pras duas chamadas à IA (resolveQuery/
// synthesizeAnswer) — cobre falhas transitórias (rate limit momentâneo,
// erro de rede, saída estruturada que não bateu no schema numa tentativa
// isolada) sem mascarar um erro persistente: se a segunda tentativa
// também falhar, o erro sobe normal pro catch de `askProjectAssistant`.
async function withRetry(fn, label) {
  try {
    return await fn();
  } catch (e) {
    console.error(`Assistente do Projeto: ${label} falhou na 1ª tentativa (${e.message}) — tentando de novo.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return await fn();
  }
}

const CHUNK_KINDS = ['transcript_segment', 'meeting_summary', 'meeting_decision', 'meeting_highlight', 'meeting_topic', 'activity', 'activity_comment'];

const ResolveQuerySchema = z.object({
  intent: z.enum(['pergunta_sobre_projeto', 'conversa_geral']).describe('"conversa_geral" pra saudações ("olá", "bom dia"), agradecimentos, perguntas sobre o que o assistente faz/como usar, ou qualquer mensagem que não pede um fato específico do histórico do projeto. "pergunta_sobre_projeto" pra qualquer pergunta real sobre reuniões, decisões, participantes, atividades, prazos, etc. deste projeto.'),
  directReply: z.string().nullable().describe('Preenchido SOMENTE quando intent="conversa_geral": uma resposta curta, calorosa e profissional em português (ex.: cumprimentar de volta e explicar em 1-2 frases que você pode responder perguntas sobre as reuniões/decisões/atividades deste projeto, sempre citando a fonte). null quando intent="pergunta_sobre_projeto".'),
  standaloneQuery: z.string().describe('Só relevante quando intent="pergunta_sobre_projeto": a pergunta do usuário reescrita como uma busca autossuficiente, resolvendo qualquer pronome ou referência ao turno anterior da conversa (ex.: "esse assunto", "ele", "isso") em texto concreto. Se a pergunta já for autossuficiente, repita-a como está. Se intent="conversa_geral", repita a pergunta original aqui mesmo sem uso.'),
  participant: z.string().nullable().describe('Nome (ou apenas primeiro nome/apelido) de uma pessoa específica, se a pergunta for sobre o que ela falou/fez/prometeu, ou sobre as pendências/atividades dela (ex.: "quais as pendências do Evanio?", "o que o Rafa está nos devendo?") — exatamente como o usuário escreveu, mesmo que seja só um pedaço do nome completo (a resolução pro nome completo é feita depois, à parte). null se a pergunta não for sobre uma pessoa específica.'),
  meetingScope: z.enum(['atual', 'projeto_inteiro']).describe('"atual" se o usuário está claramente perguntando só sobre a reunião que está aberta na tela agora; "projeto_inteiro" no caso contrário, incluindo quando o usuário pedir explicitamente pra expandir pra reuniões anteriores'),
  kind: z.enum([...CHUNK_KINDS, 'qualquer']).describe('Tipo de conteúdo mais provável de responder — "qualquer" se não for possível restringir com confiança. Marque "activity" sempre que o usuário pedir contexto/explicação sobre uma atividade ou pendência específica citando o título dela (ex.: "não to entendendo essa atividade pelo título, me dá mais contexto") — isso aciona uma busca mais profunda na transcrição da reunião de origem.'),
  targetMeetingId: z.string().nullable().describe('Preencha com o id exato de UMA reunião específica — veja a lista "REUNIÕES DISPONÍVEIS" no perfil do projeto — sempre que o usuário claramente pedir sobre uma reunião específica sem necessariamente estar com ela aberta na tela (ex.: "resuma a última reunião" → é a mais recente da lista; "o que foi discutido na reunião de 10/09?" → ache pela data; "a reunião sobre X" → ache pelo título). Isso aciona busca da transcrição INTEIRA daquela reunião, não só busca por relevância — essencial pra pedidos de resumo geral, que não têm palavra-chave forte pra achar o trecho certo por ranking textual. null se a pergunta não se referir a uma reunião específica identificável, ou se já houver uma reunião aberta no contexto (nesse caso ela já é considerada).'),
});

// Seis tipos de ação executável (ver server/assistantActions.js) — a IA
// só PROPÕE, nunca executa sozinha: fica pendente até o usuário
// confirmar pelo painel (server/assistant.js, POST /messages/:id/action).
// Objeto único e achatado (não `z.discriminatedUnion`) de propósito: um
// union quebrou a saída estruturada da Anthropic API em produção
// (2026-09-10) — toda pergunta passou a falhar, não só as de ação, porque
// `proposedAction` está dentro de `SynthesizeAnswerSchema`, usado por
// TODA resposta. O padrão comprovado no resto do sistema (aqui e em
// meetingInbox.js) sempre foi objeto achatado com campos nullable — cada
// tipo de ação usa só os campos que fazem sentido, os outros ficam null.
const ProposedActionSchema = z.object({
  type: z.enum([
    'create_meeting_todo', 'delete_meeting_todo', 'reschedule_activity',
    'create_schedule_activity', 'delete_schedule_activity', 'create_calendar_event',
    'save_knowledge_fact',
  ]).describe('Qual ação está sendo proposta.'),
  subject: z.string().nullable().describe('SÓ pra type="save_knowledge_fact": um rótulo curto do ASSUNTO do fato (ex.: "cargo do Felipe", não a frase inteira) — usado depois pra detectar se um fato novo conflita/atualiza/complementa um já existente sobre o mesmo assunto. null pros outros tipos.'),
  content: z.string().nullable().describe('SÓ pra type="save_knowledge_fact": o fato em si, como uma frase clara e autossuficiente (ex.: "Felipe é o CEO da PRICETAX"). null pros outros tipos.'),
  scope: z.enum(['conversation', 'project', 'org']).nullable().describe('SÓ pra type="save_knowledge_fact": sua MELHOR SUGESTÃO de escopo — o usuário ainda vai poder trocar antes de confirmar, então sugira com confiança, não precisa ficar em cima do muro. "conversation" se o fato só faz sentido pra guiar o restante DESTA conversa (ex.: "assume que é sobre o cliente X daqui pra frente"), não é conhecimento durável; "org" se o fato é sobre a PRICETAX em si (cargo, processo interno, conceito, produto — vale pra qualquer projeto); "project" se é específico deste cliente/projeto (a maioria dos casos). null pros outros tipos.'),
  knowledgeType: z.enum(['FACT', 'DECISION', 'PREFERENCE', 'RULE', 'HYPOTHESIS', 'PROCEDURE', 'DEFINITION']).nullable().describe('SÓ pra type="save_knowledge_fact": que TIPO de conhecimento é esse fato — FACT (um dado objetivo, ex.: "Felipe é o CEO"), DECISION (uma decisão tomada, ex.: "decidimos não levar a Unimed ao acordo coletivo"), PREFERENCE (uma preferência de alguém/do cliente, ex.: "esse cliente sempre prefere reunião às sextas"), RULE (uma regra/processo interno, ex.: "toda proposta de crédito acima de X precisa de validação da IVANA"), HYPOTHESIS (uma suposição ainda não confirmada, ex.: "acho que o atraso é por causa do fornecedor, mas não confirmei"), PROCEDURE (um passo a passo de como fazer algo), DEFINITION (o significado de um termo/sigla usado pelo cliente ou pela PRICETAX). null pros outros tipos.'),
  validFrom: z.string().nullable().describe('SÓ pra type="save_knowledge_fact", e só quando o usuário mencionar (ou for possível inferir com confiança) UMA DATA a partir da qual esse fato passou a valer (ex.: "Felipe deixou de ser CEO em 01/10/2026" → validFrom="2026-10-01") — formato YYYY-MM-DD. Isso é o que diferencia uma ATUALIZAÇÃO de um fato anterior de um CONFLITO com ele. null se não houver data explícita/inferível, ou se for outro tipo.'),
  meetingId: z.string().nullable().describe('Pra type="create_meeting_todo" ou "delete_meeting_todo": id de uma reunião real, exatamente como listado em "REUNIÕES DISPONÍVEIS" no perfil do projeto — nunca invente um id. Se o usuário não deixar claro qual reunião e nenhuma estiver aberta na tela, NÃO proponha ainda: pergunte antes. null pros outros tipos.'),
  todoItemId: z.string().nullable().describe('SÓ pra type="delete_meeting_todo": id exato da pendência a excluir, como listado nas TAREFAS DA REUNIÃO no perfil do projeto — nunca invente. Se não estiver claro qual pendência o usuário quer dizer, NÃO proponha ainda: pergunte antes citando o título que você acha que é. null pros outros tipos.'),
  title: z.string().nullable().describe('Pra type="create_meeting_todo", "create_schedule_activity" ou "create_calendar_event": título/nome curto e claro do que está sendo criado. null pros outros tipos.'),
  responsible: z.string().nullable().describe('Pra type="create_meeting_todo" ou "create_schedule_activity": nome da pessoa responsável, se mencionado pelo usuário; null se não especificado ou se for outro tipo.'),
  owner: z.enum(['pricetax', 'cliente']).nullable().describe('SÓ pra type="create_meeting_todo": de qual lado é essa entrega. null pros outros tipos.'),
  phaseName: z.string().nullable().describe('SÓ pra type="create_schedule_activity": nome de UMA fase do cronograma (veja "Fases" no perfil do projeto), se o usuário indicar em qual fase a atividade entra — mesmo que só aproximado, a resolução exata é feita depois, à parte. null se não especificado (cai na última fase automaticamente) ou se for outro tipo.'),
  dueDate: z.string().nullable().describe('Prazo/data em YYYY-MM-DD — pra "create_meeting_todo" e "create_schedule_activity" é o prazo da pendência/atividade (opcional); pra "create_calendar_event" é a data do evento (OBRIGATÓRIO nesse caso). null se não especificado ou se for outro tipo.'),
  startTime: z.string().nullable().describe('SÓ pra type="create_calendar_event": horário de início em HH:MM (24h), se o usuário mencionar um horário. null se não mencionado (assume 09:00) ou se for outro tipo.'),
  activityId: z.string().nullable().describe('Pra type="reschedule_activity" ou "delete_schedule_activity": id de uma atividade real, exatamente como listado em "ATIVIDADES DO CRONOGRAMA" no perfil do projeto — nunca invente um id. Se não estiver claro qual atividade o usuário quer dizer, NÃO proponha ainda: pergunte antes, citando o título exato que você acha que é, pra confirmar. null pros outros tipos.'),
  newDate: z.string().nullable().describe('SÓ pra type="reschedule_activity": nova data em YYYY-MM-DD. Se o pedido for relativo (ex.: "postergar pro final do cronograma"), calcule uma data depois da atividade mais distante já agendada. null pros outros tipos.'),
}).nullable();

// Seção de resposta estruturada (Fase 5, 2026-09-10) — objeto ÚNICO e
// achatado reaproveitado por TODO tipo de seção (mesmo cuidado de
// sempre: nunca `z.discriminatedUnion`, já quebrou a saída estruturada
// da Anthropic API em produção uma vez). `content` é usado por
// warning/recommendation (um parágrafo curto); `items` é usado por
// facts/impact/timeline (lista de bullets — timeline no formato "data —
// descrição" por item, mas isso é convenção de texto, não schema
// separado). "Informação conflitante" não é um tipo à parte — é uma
// seção `warning` com as versões divergentes em `items`.
const AnswerSectionSchema = z.object({
  type: z.enum(['warning', 'facts', 'impact', 'recommendation', 'timeline']).describe('warning = ponto de atenção/risco/informação conflitante (ícone vermelho suave); facts = como está registrado, direto de trecho ou do perfil do projeto (ícone azul); impact = por que isso importa pro projeto (ícone verde); recommendation = recomendação acionável da RENATA (ícone roxo); timeline = evolução cronológica de um assunto, cada item em "data — descrição".'),
  title: z.string().describe('Título curto da seção (ex.: "Ponto de atenção", "Como está registrado", "Por que isso importa no projeto", "Recomendação", "Linha do tempo") — pode variar o texto contanto que combine com o type.'),
  content: z.string().nullable().describe('Parágrafo curto — usado em warning/recommendation. null quando a seção usa items (facts/impact/timeline).'),
  items: z.array(z.string()).nullable().describe('Lista de bullets — usada em facts/impact/timeline (timeline no formato "data — descrição" por item). null quando a seção usa content (warning/recommendation).'),
});

const SynthesizeAnswerSchema = z.object({
  introduction: z.string().describe('1-2 frases de abertura antes dos blocos, direto ao ponto (ex.: "Com base na reunião e nos registros do projeto, aqui está o resumo sobre X:"). Se hasEvidence for false, esta deve ser literalmente "Não encontrei evidência suficiente nas reuniões ou documentos deste projeto." e sections/insights ficam vazios.'),
  sections: z.array(AnswerSectionSchema).describe('Blocos estruturados da resposta (ver AnswerSectionSchema) — quebre a resposta em blocos sempre que a pergunta tiver conteúdo pra isso (ponto de atenção, fatos, impacto, recomendação, linha do tempo). Pergunta simples/direta pode ter só 1-2 seções, ou até nenhuma (nesse caso a introduction sozinha já responde). Vazio se hasEvidence for false. Use **negrito** (markdown simples) pra destacar números, decisões e nomes importantes dentro de content/items — é a ÚNICA sintaxe markdown que o front-end interpreta.'),
  insights: z.array(z.string()).describe('Até 4 rótulos CURTOS clicáveis, específicos desta resposta (ex.: "Empresa paga 90%", "Validar com RH", "Impacto no acordo coletivo") — cada um vira um atalho que o usuário pode clicar pra aprofundar (reenvia o próprio rótulo como próxima pergunta, você recebe isso no histórico da conversa e interpreta em contexto). Vazio se a resposta não tiver desdobramentos óbvios pra sugerir (não force).'),
  citedChunkIds: z.array(z.string()).describe('IDs (campo "id" de cada trecho recebido) dos trechos que sustentam de fato a resposta — só inclua um id se ele realmente contém a informação usada na resposta. Vazio se a resposta veio do PERFIL DO PROJETO em vez de um trecho, ou se hasEvidence for false.'),
  hasEvidence: z.boolean().describe('true se os trechos OU o PERFIL DO PROJETO sustentam a resposta; false só quando nem os trechos recuperados nem o perfil do projeto respondem a pergunta com confiança — nesse caso NUNCA invente, admita explicitamente que não encontrou.'),
  proposedAction: ProposedActionSchema.describe('Preencha SOMENTE quando o usuário pedir explicitamente pra criar/excluir uma pendência, criar/reagendar/excluir uma atividade do cronograma, marcar um evento no Google Calendar, OU quando ele contar um fato durável que vale guardar (type="save_knowledge_fact" — ver descrição do campo type). Você NUNCA executa a ação — só propõe; o usuário confirma ou rejeita pelo painel depois. Se faltar informação pra ter certeza do alvo/conteúdo, NÃO proponha ainda — pergunte antes na própria resposta, com proposedAction=null, e proponha só no próximo turno depois que o usuário esclarecer. null na grande maioria das respostas.'),
});

async function resolveQuery({ question, history, context, projectSnapshot }) {
  const client = new Anthropic();
  const historyText = history.length
    ? history.map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`).join('\n')
    : '(sem turnos anteriores nesta conversa)';
  const contextText = context.meetingTitle
    ? `O usuário está com a reunião "${context.meetingTitle}" (${context.meetingDate || 'sem data'}) aberta na tela agora.`
    : `O usuário está na aba "${context.view === 'todo' ? 'Atividades' : 'Reuniões'}", sem nenhuma reunião específica aberta.`;
  const response = await client.messages.parse({
    // Fase 6 (2026-09-10, redução de custo): essa chamada só classifica
    // intenção e reformula a busca — não precisa do modelo mais caro.
    // Sonnet (não Haiku) porque essa etapa decide qual reunião/
    // participante a pergunta se refere; errar aqui propaga erro pro
    // resto do pipeline, então mantém precisão, só corta o modelo mais
    // caro. synthesizeAnswer (resposta final) continua em Opus.
    model: 'claude-sonnet-5',
    max_tokens: 500,
    // cache_control: o texto de instrução abaixo é IDÊNTICO em toda
    // chamada desta função, pra qualquer projeto/usuário — cachear ele
    // não muda a resposta em nada, só faz a Anthropic cobrar uma fração
    // do preço nas chamadas seguintes que reusarem o cache (~5min).
    system: [{
      type: 'text',
      text: [
        'Você é a RENATA — a Inteligência de Execução e Gestão de Projetos da PRICETAX (o nome representa Reforma, Execução, Negócios, Agilidade, Tecnologia e Ação). Você prepara o processamento de uma mensagem enviada por um consultor interno.',
        'Primeiro classifique a intenção: se for só uma saudação, agradecimento, ou pergunta sobre o que você mesmo faz/quem você é — não é uma pergunta sobre o projeto — marque intent="conversa_geral" e escreva você mesmo uma resposta curta e calorosa em directReply. Se perguntarem seu nome/quem você é, apresente-se como RENATA, a assistente de execução e gestão de projetos da PRICETAX, irmã da IVANA (a IA tributária da PRICETAX — a IVANA interpreta legislação e Reforma Tributária, você transforma isso em execução real dentro dos projetos).',
        'Se for uma pergunta real sobre o histórico do projeto, marque intent="pergunta_sobre_projeto" e reformule como uma busca autossuficiente, resolvendo qualquer referência ao que foi dito antes na conversa (inclusive "o cliente"/"a empresa", que pode ser resolvido pelo nome real no perfil do projeto abaixo) — nunca responda a pergunta em si nesse caso, isso é feito depois por outra etapa.',
        'Se a pergunta se referir a UMA reunião específica (ex.: "resuma a última reunião", "o que foi discutido na reunião de 10/09", "a reunião sobre o fornecedor X") — mesmo sem estar aberta na tela — resolva o id exato dela usando a lista "REUNIÕES DISPONÍVEIS" no perfil do projeto e preencha targetMeetingId. Isso é essencial pra pedidos de resumo geral, que não têm palavra-chave forte pra uma busca por relevância achar sozinha.',
      ].join(' '),
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{ role: 'user', content: `Perfil do projeto:\n${projectSnapshot}\n\nContexto: ${contextText}\n\nConversa até agora:\n${historyText}\n\nNova mensagem do usuário: ${question}` }],
    output_config: { format: zodOutputFormat(ResolveQuerySchema) },
  });
  if (!response.parsed_output) throw new Error('Falha ao interpretar a pergunta.');
  return { output: response.parsed_output, usage: response.usage };
}

async function synthesizeAnswer({ question, chunks, history, projectSnapshot, factsText, context, personLookupText, calendarContextText, googleConnected }) {
  const client = new Anthropic();
  const historyText = history.length
    ? history.map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`).join('\n')
    : '(sem turnos anteriores nesta conversa)';
  const chunksText = chunks.length
    ? chunks.map((c) => `[id=${c.id}] (${c.kind}, reunião "${c.meetingTitle}" em ${c.meetingDate || 'sem data'}${c.timeRef ? `, ${c.timeRef}` : ''})\n${c.content}`).join('\n\n---\n\n')
    : '(nenhum trecho relevante foi encontrado na memória de reuniões deste projeto — mas confira o PERFIL DO PROJETO abaixo antes de concluir que não há evidência: perguntas de identidade/cronograma são respondidas por ele, não por trecho de reunião)';
  const meetingContextText = context && context.meetingId
    ? `Reunião aberta agora na tela: id="${context.meetingId}", título="${context.meetingTitle || ''}" — se o usuário pedir pra criar uma pendência sem dizer qual reunião, essa é a escolha mais provável.`
    : 'Nenhuma reunião está aberta na tela agora — se o usuário pedir pra criar uma pendência, escolha a reunião certa entre as listadas em "REUNIÕES DISPONÍVEIS" no perfil do projeto (ex.: pelo que ele descrever, ou a mais recente se ele não especificar e isso fizer sentido) — só pergunte se realmente não der pra decidir com confiança.';
  const response = await client.messages.parse({
    model: 'claude-opus-5',
    // 1500 causava um bug real em produção (2026-09-10): perguntas que
    // sintetizam várias reuniões (ex.: "como funciona o Seguro de Vida
    // na Tecumseh?", que puxa de várias reuniões) geram uma resposta
    // longa o bastante pra CORTAR o JSON estruturado no meio (erro real
    // visto no log do Railway: "Unterminated string in JSON") — o
    // parser falha, a segunda tentativa do retry falha do mesmo jeito
    // (é determinístico, não uma falha transitória), e o usuário só via
    // "Não consegui processar essa pergunta agora." Aumentado com folga
    // de sobra pra nunca mais cortar no meio.
    max_tokens: 4000,
    // cache_control (Fase 6, 2026-09-10, redução de custo): esse bloco
    // de instrução é praticamente idêntico entre chamadas (só a frase
    // do Google Calendar varia com googleConnected, que fica estável
    // pra um mesmo usuário na maioria das perguntas) — cachear reduz o
    // custo de reenviar esse texto longo em toda pergunta, sem mudar a
    // resposta em nada.
    system: [{
      type: 'text',
      text: [
      'Você é a RENATA — a Inteligência de Execução e Gestão de Projetos da PRICETAX (Reforma, Execução, Negócios, Agilidade, Tecnologia e Ação). Você é irmã da IVANA, a IA tributária da PRICETAX: a IVANA interpreta legislação, Reforma Tributária, IBS/CBS e regras fiscais; você transforma reuniões e decisões em execução real — atividades, responsáveis, prazos, riscos, próximos passos. Seu princípio central: informação relevante vira conhecimento, conhecimento relevante vira decisão, decisão relevante vira ação.',
      'Você tem DUAS fontes de verdade, ambas confiáveis: (1) o PERFIL DO PROJETO — dado estruturado direto do cadastro/cronograma (identidade do cliente, participantes, fases, atividades, reuniões, pendências), sempre atual, pode responder direto com base nele sem citar chunkId; (2) os TRECHOS RECUPERADOS DA MEMÓRIA — texto literal de reuniões, só pode citar como fonte (citedChunkIds) um id que está realmente na lista recebida.',
      'Regra absoluta: nunca invente nome, data, decisão, compromisso, responsável ou fato que não esteja literalmente no PERFIL DO PROJETO ou nos trechos. Se nenhum dos dois sustentar uma resposta com confiança, hasEvidence deve ser false, introduction deve ser exatamente "Não encontrei evidência suficiente nas reuniões ou documentos deste projeto." e sections/insights ficam vazios — nunca tente adivinhar ou completar a lacuna. Sempre separe fato de interpretação: se algo parece uma atividade mas falta responsável ou prazo explícito nos trechos, diga isso diretamente (ex.: em uma seção "facts": "Identifiquei isso como uma possível atividade, mas a reunião não deixou explícito quem é responsável nem o prazo") em vez de supor um valor.',
      'Interprete a intenção por trás da fala, não só a letra — dentro dos trechos de reunião, frases como "vou verificar" costumam indicar um compromisso assumido, "depende do fornecedor/cliente" indica uma dependência, "não conseguimos fechar porque faltou X" indica um impedimento, "vamos implementar em [data]" pode indicar um marco do projeto. Ao responder, ajude a distinguir isso — não trate toda menção como se fosse uma tarefa formal.',
      'Como estruturar a resposta em sections: introduction é só a abertura (1-2 frases), o conteúdo de verdade vai nas sections. Se houver algo urgente/crítico/uma divergência entre fontes, isso vira a PRIMEIRA seção (type="warning"), nunca fica perdido no meio. Uma pergunta simples (ex.: "qual o CNPJ do cliente?") pode ter zero sections, a introduction já responde. Quando a resposta envolver várias reuniões ou atividades, ordene os itens de "facts"/"impact" da mais antiga pra mais atual (nunca por ordem de cadastro); se a pergunta for sobre a evolução de um assunto ao longo do tempo, use type="timeline" com um item por marco, formato "data — descrição".',
      'Quando responder com base num trecho de reunião, cite reunião e data pra ajudar o consultor a confiar na resposta (ex.: "Na reunião de 15/08, Rafael comentou que..."). Só inclua em citedChunkIds os ids dos trechos que você realmente usou — nunca cite um trecho pra sustentar um fato que na verdade veio do PERFIL DO PROJETO ou do CONHECIMENTO ACUMULADO.',
      'Se duas fontes (dois trechos, ou um trecho contra o PERFIL DO PROJETO) trouxerem informação DIVERGENTE sobre o mesmo fato, NUNCA escolha uma versão silenciosamente — sinalize isso explicitamente numa seção type="warning" com título "Informação conflitante", liste as duas versões em items, e recomende validar com a pessoa certa antes de usar o dado (isso pode virar a recomendação também).',
      'insights (até 4 rótulos curtos) só faz sentido quando a resposta abriu desdobramentos reais — um fato que merece validação, um risco que pode ser aprofundado, uma pergunta natural de continuação. Não force 4 só pra preencher; uma resposta simples pode não ter nenhum.',
      'Quando o usuário pedir contexto sobre uma atividade específica cujo título sozinho não explica nada (ex.: "não to entendendo essa atividade pelo título"), você recebe, além do chunk da própria atividade, TODOS os segmentos de transcrição da reunião de onde ela nasceu — leia essa transcrição de verdade e explique com suas palavras o que estava sendo discutido quando aquele item surgiu, não repita só os campos da atividade (responsável/prazo/status). O título foi escrito pela IA a partir da fala, então pode não usar as mesmas palavras da conversa original — procure o trecho certo pelo assunto, não por correspondência exata de texto.',
      'Se o assunto tocar uma questão tributária técnica que exige aprofundamento em legislação/base legal (ex.: interpretação de norma de IBS/CBS, fundamento jurídico), não tente concluir sozinha — sinalize que esse ponto merece uma análise tributária dedicada, o tipo de trabalho que a IVANA faz.',
      'Se o PERFIL DO PROJETO listar participantes "SEM IDENTIFICAÇÃO CLARA" e isso for relevante ou natural no contexto da conversa, aproveite pra perguntar ao usuário quem é essa pessoa (lado PRICETAX ou cliente, e qual área) — no máximo uma pergunta desse tipo por resposta, nunca repita uma pergunta sobre a mesma pessoa se ela já foi respondida antes (confira o CONHECIMENTO ACUMULADO e a conversa) — quando o usuário responder, proponha save_knowledge_fact com o que ele disse (não grave sozinha, é a mesma regra de qualquer outra ação).',
      'Quando o usuário contar um fato durável e reutilizável — não é sobre o histórico específico de UMA reunião, é uma regra/fato que vale lembrar depois (ex.: "Felipe é o CEO da PRICETAX", "nosso processo interno de X é assim", "esse cliente sempre prefere Y") — proponha type="save_knowledge_fact": subject é um rótulo curto do ASSUNTO (ex.: "cargo do Felipe", não a frase toda), content é o fato em si numa frase clara, knowledgeType classifica que TIPO de conhecimento é (ver descrição do campo), scope é sua sugestão de escopo (o usuário ainda escolhe/confirma no painel antes de salvar de fato — sugira "org" se for sobre a PRICETAX em si, "project" se for específico deste cliente, "conversation" só se for uma instrução de trabalho pra esta conversa apenas), e validFrom só quando houver uma data explícita a partir de quando o fato passou a valer (ex.: alguém deixou um cargo numa data — isso é uma ATUALIZAÇÃO temporal, não um conflito). NUNCA grave sozinha — é sempre proposta com confirmação, igual as outras ações. NÃO proponha isso pra fatos triviais da conversa ou coisas que já estão no PERFIL DO PROJETO/CONHECIMENTO ACUMULADO.',
      'Você recebe abaixo, em CONHECIMENTO ACUMULADO, os fatos já ensinados sobre este projeto e sobre a PRICETAX em geral — cada um mostra o tipo, quem informou, quando, vigência (se houver) e se está com status "DIVERGENTE" ou é uma "HIPÓTESE" ainda não validada. Se um fato estiver marcado [DIVERGENTE], NUNCA escolha uma versão sozinha — avise o usuário que existem duas informações conflitantes sobre aquele assunto e pergunte qual vale, ou sugira validar com quem souber. Trate uma [HIPÓTESE] como algo ainda não confirmado, não como fato estabelecido.',
      'Quando o usuário perguntar sobre as pendências/atividades de uma pessoa (ex.: "quais as pendências do Evanio?", "o que o Rafa está nos devendo?"), mesmo citando só um apelido ou parte do nome, você recebe abaixo o resultado de uma busca por nome já feita no cadastro (PENDÊNCIAS POR PESSOA) — isso é uma varredura completa, não uma amostra, então pode responder com confiança total a partir dele. Se ele indicar mais de um nome parecido (ambíguo), pergunte qual delas antes de responder. Se indicar que não achou ninguém com esse nome, diga isso claramente em vez de inventar.',
      'Você também pode propor ações (proposedAction) — SEIS tipos possíveis: (1) create_meeting_todo — criar uma pendência numa reunião; (2) delete_meeting_todo — excluir uma pendência de reunião existente; (3) reschedule_activity — reagendar uma atividade do cronograma oficial; (4) create_schedule_activity — criar uma atividade nova no cronograma oficial; (5) delete_schedule_activity — excluir uma atividade do cronograma oficial; (6) create_calendar_event — criar um evento de verdade no Google Calendar do usuário. Em TODOS os casos você NUNCA executa sozinha, e NUNCA finge que já executou — sempre descreva a ação proposta na resposta citando o título exato do alvo e peça confirmação explícita. Se não tiver certeza de qual reunião/pendência/atividade o usuário quer dizer, NÃO proponha ainda — faça a pergunta de esclarecimento primeiro (ex.: "Você está falando da atividade \'Split payment e demais operações financeiras\'?"), e só proponha de fato no turno seguinte, depois de confirmado.',
      'Ao reagendar (reschedule_activity), sempre diga na resposta a data antiga e a nova, pra o usuário conseguir validar a mudança de verdade antes de confirmar.',
      'Excluir uma atividade do CRONOGRAMA OFICIAL (delete_schedule_activity) é mais sensível que excluir uma pendência de reunião — afeta um prazo que pode já estar visível pro cliente. Só proponha se o usuário pedir isso claramente (não sugira excluir por conta própria), e deixe isso explícito na resposta.',
      googleConnected
        ? 'O usuário JÁ conectou o Google Calendar — você pode propor create_calendar_event quando ele pedir pra marcar/agendar um compromisso de verdade (não uma atividade do cronograma nem pendência de reunião, que são coisas diferentes). Preencha dueDate (obrigatório) e startTime se um horário for mencionado. Você recebe abaixo, em PRÓXIMOS EVENTOS NA AGENDA, os compromissos já marcados nos próximos dias — use isso pra responder perguntas tipo "o que tenho marcado essa semana" ou "tem conflito nesse horário".'
        : 'O usuário AINDA NÃO conectou o Google Calendar — nunca proponha create_calendar_event. Se ele pedir pra marcar algo na agenda, diga que ele precisa conectar o Google Calendar primeiro (tela Agenda) antes de você conseguir fazer isso.',
      'Seja objetiva e executiva: prefira uma resposta curta e direta quando ela resolver, priorizando clareza, ação, contexto e prioridade — evite textão quando não for necessário.',
      ].join(' '),
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{ role: 'user', content: `Perfil do projeto:\n${projectSnapshot}\n\nCONHECIMENTO ACUMULADO (fatos ensinados por usuários, deste projeto e da PRICETAX em geral):\n${factsText}\n\n${meetingContextText}\n\n${personLookupText || ''}\n\n${calendarContextText || ''}\n\nConversa até agora:\n${historyText}\n\nPergunta do usuário: ${question}\n\nTrechos recuperados da memória de reuniões:\n\n${chunksText}` }],
    output_config: { format: zodOutputFormat(SynthesizeAnswerSchema) },
  });
  if (!response.parsed_output) throw new Error('Falha ao gerar a resposta.');
  return { output: response.parsed_output, usage: response.usage };
}

// Achata a resposta estruturada (Fase 5) num texto plano — usado como
// `ai_messages.content`, que por sua vez alimenta o histórico da
// conversa (`historyText` em resolveQuery/synthesizeAnswer, que sempre
// foi texto puro) e serve de fallback pra qualquer lugar que ainda
// espera uma string simples. O front-end usa `ai_messages.structured`
// (a versão rica) pra renderizar os cards — este texto nunca é
// mostrado na tela quando `structured` existe.
function flattenStructuredAnswer({ introduction, sections }) {
  const parts = [introduction];
  (sections || []).forEach((s) => {
    parts.push(`\n${s.title}:`);
    if (s.content) parts.push(s.content);
    (s.items || []).forEach((item) => parts.push(`- ${item}`));
  });
  return parts.join('\n');
}

async function getOrCreateConversation(pool, orgId, projectId, userId) {
  await pool.query(
    `INSERT INTO ai_conversations (id, org_id, project_id, user_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [uid('aic'), orgId, projectId, userId],
  );
  const { rows } = await pool.query('SELECT id FROM ai_conversations WHERE project_id=$1 AND user_id=$2', [projectId, userId]);
  return rows[0].id;
}

async function loadRecentHistory(pool, conversationId, limit = 8) {
  const { rows } = await pool.query(
    `SELECT role, content FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [conversationId, limit],
  );
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}

// Função pública — orquestra: carrega conversa → resolve a pergunta →
// busca na memória → sintetiza resposta → valida citações → grava tudo.
// `projectData` é o JSONB completo do projeto (já carregado pela rota, ver
// server/assistant.js) — usado pra montar o PERFIL DO PROJETO
// (server/assistantContext.js), que dá ao assistente acesso direto à
// identidade do cliente e ao cronograma (Resumo/Gantt/Tabela/Fases/
// Quadro são a mesma base de dados), sem depender da memória de reuniões
// pra perguntas que não vêm de reunião nenhuma.
export async function askProjectAssistant({ pool, orgId, projectId, userId, question, context, projectData, projectUpdatedAt }) {
  const startedAt = Date.now();
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  const history = await loadRecentHistory(pool, conversationId);
  // Nunca deixar um formato de dado inesperado no projeto derrubar a
  // pergunta inteira com um 500 — sem perfil, o assistente ainda responde
  // com base na memória de reuniões, só perde a parte de identidade/
  // cronograma nesta pergunta específica.
  let projectSnapshot;
  try {
    projectSnapshot = buildProjectSnapshot(projectData || {});
  } catch (e) {
    console.error('Assistente do Projeto: falha ao montar o perfil do projeto', e.message);
    projectSnapshot = '(perfil do projeto indisponível no momento)';
  }

  await pool.query(
    `INSERT INTO ai_messages (id, conversation_id, role, content) VALUES ($1,$2,'user',$3)`,
    [uid('aim'), conversationId, question],
  );

  let resolved, chunks = [], synthesized, errorMsg = null, googleConnected = false, calendarContextText = '';
  let cachedAnswer = null, queryEmbedding = null, fingerprint = null, resolvedParticipantOut = null, searchMeetingIdOut = null;
  let dependencyFactIds = [];
  try {
    resolved = await withRetry(() => resolveQuery({ question, history, context: context || {}, projectSnapshot }), 'resolveQuery');
    // Saudação/conversa geral não passa pelo pipeline de busca+síntese —
    // não é uma pergunta que exige evidência do projeto pra responder.
    if (resolved.output.intent !== 'conversa_geral') {
      const scope = resolved.output;

      // Pedido do Rafael: "quais as pendências do Evanio?", "o que o
      // Rafa está nos devendo?" — resolve apelido/nome parcial pro nome
      // completo exato ANTES de filtrar a busca por participante (senão
      // "Evanio" nunca bateria com "Evanio Santinon" no filtro exato de
      // `searchProjectMemory`) e monta uma varredura completa (não uma
      // amostra) das pendências dela.
      let personLookupText = '';
      let resolvedParticipant = scope.participant || undefined;
      if (scope.participant) {
        const lookup = buildPersonLookupText(projectData || {}, scope.participant);
        personLookupText = lookup.text;
        resolvedParticipant = lookup.resolvedName || undefined;
      }

      // targetMeetingId (reunião específica identificada pela IA, ex.:
      // "resuma a última reunião") tem prioridade sobre a lógica antiga
      // de só usar a reunião aberta na tela — nunca confiar cegamente
      // nele aqui ainda (é só um id proposto), a validação de verdade
      // acontece embaixo, contra `projectData.meetings`.
      const searchMeetingId = scope.targetMeetingId || (scope.meetingScope === 'atual' ? (context && context.meetingId) : undefined);
      resolvedParticipantOut = resolvedParticipant || null;
      searchMeetingIdOut = searchMeetingId || null;

      logMetric(pool, { orgId, projectId, eventType: 'question_asked', metadata: { standaloneQuery: scope.standaloneQuery } }).catch(() => {});

      // Cache semântico (Fase 7, 2026-09-11) — modo "seguro": a chave é
      // a pergunta já RESOLVIDA por resolveQuery (participant/meetingId/
      // kind), não o texto cru do usuário. Só a chamada mais cara
      // (synthesizeAnswer) é pulada num acerto — resolveQuery sempre
      // roda, é o preço de manter isso seguro contra reaproveitar
      // resposta errada em pergunta parecida com intenção diferente.
      // Opcional: sem VOYAGE_API_KEY, cai direto pro fluxo normal.
      // Fase 7.1: um candidato pode bater fingerprint+similaridade e
      // ainda assim ser rejeitado por `isStillFresh` (dependência real
      // mudou) — `lookupCachedAnswer` sinaliza isso com
      // `{staleCandidate:true}` só pra fins de métrica, nunca vira uma
      // resposta de cache de verdade.
      if (voyageConfigured()) {
        try {
          [queryEmbedding] = await embedTexts([scope.standaloneQuery], 'query');
          fingerprint = computeFingerprint(projectUpdatedAt, todayIso());
          const cacheResult = await lookupCachedAnswer(pool, {
            orgId, projectId, fingerprint,
            participant: resolvedParticipantOut,
            meetingId: searchMeetingIdOut,
            kind: scope.kind !== 'qualquer' ? scope.kind : null,
            queryEmbedding,
          });
          if (cacheResult && cacheResult.staleCandidate) {
            logMetric(pool, { orgId, projectId, eventType: 'cache_rejected_stale', metadata: { standaloneQuery: scope.standaloneQuery } }).catch(() => {});
          } else {
            cachedAnswer = cacheResult;
          }
        } catch (e) {
          console.error('Assistente do Projeto: falha ao consultar cache semântico — seguindo com a pergunta ao vivo.', e.message);
        }
      }
      // "Tokens economizados pelo cache" (pedido do Rafael, item 8): no
      // acerto, `cachedAnswer.tokensInput/tokensOutput` são os tokens
      // que a chamada original (`synthesizeAnswer`) custou da primeira
      // vez — reaproveitá-la agora custou só `resolveQuery` (já contado
      // em `tokensInput/tokensOutput` mais abaixo). É quanto "teria
      // custado de novo" se não fosse o cache, baseado em custo real
      // medido, não uma estimativa inventada.
      logMetric(pool, {
        orgId, projectId,
        eventType: cachedAnswer ? 'cache_hit' : 'cache_miss',
        metadata: cachedAnswer
          ? { standaloneQuery: scope.standaloneQuery, tokensSavedInput: cachedAnswer.tokensInput || 0, tokensSavedOutput: cachedAnswer.tokensOutput || 0 }
          : { standaloneQuery: scope.standaloneQuery },
      }).catch(() => {});

      if (!cachedAnswer) {
        const [chunksResult, factsResult, googleConn] = await Promise.all([
          searchProjectMemory(pool, {
            orgId, projectId,
            query: scope.standaloneQuery,
            participant: resolvedParticipant,
            meetingId: searchMeetingId || undefined,
            kind: scope.kind !== 'qualquer' ? scope.kind : undefined,
            limit: 12,
          }),
          loadRelevantFacts(pool, orgId, projectId, conversationId),
          getConnectionStatus(userId),
        ]);
        chunks = chunksResult;
        const factsText = factsResult.text;
        dependencyFactIds = factsResult.factIds || [];
        googleConnected = !!(googleConn && googleConn.connected);

        // Agenda (Fase 4, 2026-09-10) — igual a personLookupText, é uma
        // fonte de contexto opcional: silenciosa se o usuário nunca
        // conectou o Google Calendar, ou se a chamada em si falhar (nunca
        // derruba a resposta principal por causa disso).
        if (googleConnected) {
          try {
            const now = new Date();
            const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
            const events = await listEvents(userId, now.toISOString(), in14Days.toISOString());
            calendarContextText = events.length
              ? `PRÓXIMOS EVENTOS NA AGENDA (Google Calendar do usuário, próximos 14 dias):\n${events.slice(0, 15).map((e) => `- "${e.title}" — ${e.start}${e.allDay ? ' (dia inteiro)' : ''}`).join('\n')}`
              : 'PRÓXIMOS EVENTOS NA AGENDA: nenhum evento marcado nos próximos 14 dias.';
          } catch (e) {
            console.error('Assistente do Projeto: falha ao buscar eventos do Google Calendar', e.message);
          }
        }

        // Duas situações em que busca por relevância sozinha não é
        // confiável, e o jeito certo de garantir o conteúdo é buscar a
        // transcrição INTEIRA da reunião certa, sem depender de ranking
        // textual: (1) a IA identificou que a pergunta é sobre UMA reunião
        // específica (ex.: "resuma a última reunião" não tem palavra-chave
        // forte pra achar o trecho certo por relevância); (2) pedido do
        // Rafael pra explicar uma atividade cujo título não é
        // autoexplicativo — o título é uma paráfrase da IA, pode não usar
        // as mesmas palavras da fala original.
        const meetingIdsNeedingFullTranscript = new Set();
        if (scope.targetMeetingId) meetingIdsNeedingFullTranscript.add(scope.targetMeetingId);
        if (scope.kind === 'activity') {
          chunks.filter((c) => c.kind === 'activity' && c.meetingId).forEach((c) => meetingIdsNeedingFullTranscript.add(c.meetingId));
        }
        if (meetingIdsNeedingFullTranscript.size) {
          // Defesa em profundidade, mesmo padrão de nunca confiar num id
          // que a IA devolveu sem checar contra o projeto de verdade.
          const validMeetingIds = new Set((projectData && projectData.meetings || []).filter((m) => !m.deleted).map((m) => m.id));
          const idsToFetch = Array.from(meetingIdsNeedingFullTranscript).filter((id) => validMeetingIds.has(id));
          if (idsToFetch.length) {
            const transcriptChunksByMeeting = await Promise.all(
              idsToFetch.map((mid) => getMeetingTranscriptChunks(pool, orgId, projectId, mid)),
            );
            const existingIds = new Set(chunks.map((c) => c.id));
            transcriptChunksByMeeting.flat().forEach((c) => {
              if (!existingIds.has(c.id)) { chunks.push(c); existingIds.add(c.id); }
            });
          }
        }

        synthesized = await withRetry(() => synthesizeAnswer({ question, chunks, history, projectSnapshot, factsText, context: context || {}, personLookupText, calendarContextText, googleConnected }), 'synthesizeAnswer');
      }
    }
  } catch (e) {
    errorMsg = e.message || 'Erro desconhecido';
    // Antes esse erro era só guardado na coluna `error` de ai_messages,
    // sem acesso direto ao Postgres de produção (só o Rafael tem) isso
    // ficava invisível — logar aqui é o único jeito de depurar via
    // Railway sem precisar de acesso ao banco.
    console.error(`Assistente do Projeto: pergunta falhou (projectId=${projectId}): ${errorMsg}`, e.stack || '');
  }

  const latencyMs = Date.now() - startedAt;
  let answerText, citedSources = [], hasEvidence = null, model = 'claude-opus-5', proposedAction = null, structured = null;
  let tokensInput = 0, tokensOutput = 0;

  if (errorMsg) {
    answerText = 'Não consegui processar essa pergunta agora. Tente de novo em alguns instantes.';
    hasEvidence = false;
  } else if (resolved.output.intent === 'conversa_geral') {
    answerText = resolved.output.directReply || 'Olá! Sou a RENATA, a assistente de execução e gestão de projetos da PRICETAX. Pode perguntar qualquer coisa sobre o histórico deste projeto — reuniões, decisões, atividades — que eu respondo sempre citando a fonte.';
    tokensInput = (resolved.usage && resolved.usage.input_tokens) || 0;
    tokensOutput = (resolved.usage && resolved.usage.output_tokens) || 0;
  } else if (cachedAnswer) {
    // Acerto de cache semântico (Fase 7) — devolve a resposta já
    // validada anteriormente, sem chamar synthesizeAnswer. As fontes
    // citadas já foram validadas contra os chunks daquela pergunta
    // original, não precisam ser revalidadas aqui (não refizemos a
    // busca nesta pergunta).
    structured = cachedAnswer.structured;
    citedSources = cachedAnswer.citedSources || [];
    answerText = flattenStructuredAnswer(structured);
    hasEvidence = !!cachedAnswer.hasEvidence;
    tokensInput = (resolved.usage && resolved.usage.input_tokens) || 0;
    tokensOutput = (resolved.usage && resolved.usage.output_tokens) || 0;
  } else {
    const validIds = new Set(chunks.map((c) => c.id));
    // Anti-alucinação por validação, não só por instrução de prompt:
    // qualquer id citado que não estava de fato entre os trechos
    // recuperados nesta pergunta é descartado (sem derrubar a
    // resposta) e a anomalia fica registrada no log do servidor.
    const cited = (synthesized.output.citedChunkIds || []).filter((id) => {
      const ok = validIds.has(id);
      if (!ok) console.error(`Assistente do Projeto: citou chunkId inexistente na recuperação (${id}) — descartado.`);
      return ok;
    });
    const byId = new Map(chunks.map((c) => [c.id, c]));
    citedSources = cited.map((id) => {
      const c = byId.get(id);
      return { chunkId: c.id, meetingId: c.meetingId, meetingTitle: c.meetingTitle, meetingDate: c.meetingDate, timeRef: c.timeRef, kind: c.kind, sourceRef: c.sourceRef };
    });
    structured = {
      introduction: synthesized.output.introduction,
      sections: synthesized.output.sections || [],
      insights: synthesized.output.insights || [],
    };
    answerText = flattenStructuredAnswer(structured);
    hasEvidence = !!synthesized.output.hasEvidence;
    tokensInput = (resolved.usage && resolved.usage.input_tokens || 0) + (synthesized.usage && synthesized.usage.input_tokens || 0);
    tokensOutput = (resolved.usage && resolved.usage.output_tokens || 0) + (synthesized.usage && synthesized.usage.output_tokens || 0);

    // Agente executor — mesma defesa em profundidade das citações: a IA só
    // PROPÕE, e mesmo a proposta é revalidada aqui contra o projeto de
    // verdade (nunca confiar cegamente no id que ela devolveu) antes de
    // deixar o usuário confirmar. De quebra, os títulos exibidos no card de
    // confirmação (meetingTitle/activityTitle/currentDate) vêm do servidor,
    // não do que a IA disse — não dá pra ela "inventar" um nome bonito pra
    // um id que não bate com o alvo de verdade.
    const rawAction = synthesized.output.proposedAction;
    if (rawAction && rawAction.type === 'create_meeting_todo') {
      const targetMeeting = (projectData && projectData.meetings || []).find((m) => m.id === rawAction.meetingId && !m.deleted);
      if (targetMeeting) {
        proposedAction = { ...rawAction, meetingTitle: targetMeeting.title || 'Reunião sem título' };
      } else {
        console.error('Assistente do Projeto: propôs create_meeting_todo com meetingId inexistente — descartada.', rawAction);
      }
    } else if (rawAction && rawAction.type === 'delete_meeting_todo') {
      const targetMeeting = (projectData && projectData.meetings || []).find((m) => m.id === rawAction.meetingId && !m.deleted);
      const targetTodo = targetMeeting && (targetMeeting.actionItems || []).find((it) => it.id === rawAction.todoItemId && !it.deleted);
      if (targetMeeting && targetTodo) {
        proposedAction = { ...rawAction, meetingTitle: targetMeeting.title || 'Reunião sem título', todoTitle: targetTodo.title || 'Pendência sem título' };
      } else {
        console.error('Assistente do Projeto: propôs delete_meeting_todo com meetingId/todoItemId inexistente — descartada.', rawAction);
      }
    } else if (rawAction && rawAction.type === 'reschedule_activity') {
      const targetActivity = (projectData && projectData.activities || []).find((a) => a.id === rawAction.activityId && !a.deleted);
      if (targetActivity) {
        proposedAction = { ...rawAction, activityTitle: targetActivity.title || 'Atividade sem título', currentDate: targetActivity.date || '' };
      } else {
        console.error('Assistente do Projeto: propôs reschedule_activity com activityId inexistente — descartada.', rawAction);
      }
    } else if (rawAction && rawAction.type === 'create_schedule_activity') {
      // Ação de criação não tem um alvo pra validar contra um id
      // existente (é isso que está sendo criado) — o schema Zod já
      // garante o formato dos campos; o resto (fase/mês default) é
      // resolvido em server/assistantActions.js na hora de executar.
      proposedAction = rawAction;
    } else if (rawAction && rawAction.type === 'delete_schedule_activity') {
      const targetActivity = (projectData && projectData.activities || []).find((a) => a.id === rawAction.activityId && !a.deleted);
      if (targetActivity) {
        proposedAction = { ...rawAction, activityTitle: targetActivity.title || 'Atividade sem título' };
      } else {
        console.error('Assistente do Projeto: propôs delete_schedule_activity com activityId inexistente — descartada.', rawAction);
      }
    } else if (rawAction && rawAction.type === 'create_calendar_event') {
      // Defesa em profundidade: mesmo o prompt instruindo a nunca propor
      // isso sem conexão, nunca confiar cegamente na IA — revalida aqui.
      if (googleConnected && rawAction.dueDate) {
        proposedAction = rawAction;
      } else {
        console.error('Assistente do Projeto: propôs create_calendar_event sem Google Calendar conectado ou sem data — descartada.', rawAction);
      }
    } else if (rawAction && rawAction.type === 'save_knowledge_fact') {
      // Sem id de alvo pra validar (é uma criação) — só garante que os
      // 3 campos obrigatórios vieram preenchidos antes de deixar o
      // usuário confirmar.
      if ((rawAction.subject || '').trim() && (rawAction.content || '').trim() && rawAction.scope) {
        proposedAction = rawAction;
        logMetric(pool, { orgId, projectId, eventType: 'fact_proposed', metadata: { subject: rawAction.subject, scope: rawAction.scope, knowledgeType: rawAction.knowledgeType || 'FACT' } }).catch(() => {});
      } else {
        console.error('Assistente do Projeto: propôs save_knowledge_fact incompleto — descartada.', rawAction);
      }
    }

    // Cache semântico (Fase 7) — só grava quando a resposta NÃO tem
    // proposedAction (reaproveitar uma ação fora de contexto é
    // perigoso: podia recriar pendência duplicada, referenciar id já
    // apagado). Fire-and-forget, nunca atrasa nem derruba a resposta.
    // Fase 7.1: grava junto as dependências reais desta resposta
    // (reuniões citadas + fatos injetados) — é isso que
    // `isStillFresh` (server/answerCache.js) usa depois pra invalidar
    // só quem depende de verdade do que mudou, e os tokens gastos, pra
    // "tokens economizados" virar uma métrica honesta (ver `cache_hit`).
    if (!cachedAnswer && !proposedAction && queryEmbedding && fingerprint) {
      const dependencyMeetingIds = Array.from(new Set(citedSources.map((s) => s.meetingId).filter(Boolean)));
      saveCachedAnswer(pool, {
        orgId, projectId, standaloneQuery: resolved.output.standaloneQuery, queryEmbedding,
        participant: resolvedParticipantOut, meetingId: searchMeetingIdOut,
        kind: resolved.output.kind !== 'qualquer' ? resolved.output.kind : null,
        structured, citedSources, hasEvidence, fingerprint,
        dependencyMeetingIds, dependencyFactIds, tokensInput, tokensOutput,
      }).catch((e) => console.error('Assistente do Projeto: falha ao gravar cache semântico', e.message));
    }
  }

  const assistantMessageId = uid('aim');
  await pool.query(
    `INSERT INTO ai_messages (id, conversation_id, role, content, sources, has_evidence, scope, model, tokens_input, tokens_output, latency_ms, error, proposed_action, action_status, structured)
     VALUES ($1,$2,'assistant',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      assistantMessageId, conversationId, answerText, JSON.stringify(citedSources), hasEvidence,
      JSON.stringify({ view: context && context.view, meetingId: context && context.meetingId, standaloneQuery: resolved && resolved.output.standaloneQuery }),
      model, tokensInput, tokensOutput, latencyMs, errorMsg,
      proposedAction ? JSON.stringify(proposedAction) : null, proposedAction ? 'pending' : null,
      structured ? JSON.stringify(structured) : null,
    ],
  );
  await pool.query('UPDATE ai_conversations SET updated_at=now() WHERE id=$1', [conversationId]);

  return {
    id: assistantMessageId, role: 'assistant', content: answerText, sources: citedSources, hasEvidence,
    proposedAction, actionStatus: proposedAction ? 'pending' : null, structured, createdAt: new Date().toISOString(),
  };
}

// Confirma ou rejeita uma ação proposta pela IA numa mensagem específica.
// Só executa de verdade em `decision==='confirm'` — chamado a partir de
// POST /api/assistant/messages/:id/action (server/assistant.js), sempre
// depois de um clique explícito do usuário no painel.
// `overrides` (Fase 7.1, pedido do Rafael: "conhecimento organizacional
// precisa de confirmação explícita") — hoje só `{ scope }`, e só tem
// efeito pra type="save_knowledge_fact": a IA sugere um escopo, mas
// quem decide de fato é o usuário no seletor do painel
// (src/assistant/ProjectAssistant.jsx) antes de clicar Confirmar. Nunca
// confia cegamente no valor recebido — revalida contra o enum real
// antes de aplicar (defesa em profundidade, mesmo padrão de todo id
// proposto pela IA neste arquivo).
const OVERRIDABLE_SCOPES = new Set(['conversation', 'project', 'org']);

export async function decideProposedAction(pool, orgId, projectId, userId, messageId, decision, actingUserName, overrides) {
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  const { rows } = await pool.query(
    'SELECT proposed_action, action_status FROM ai_messages WHERE id=$1 AND conversation_id=$2',
    [messageId, conversationId],
  );
  if (!rows[0]) throw new Error('Mensagem não encontrada.');
  if (rows[0].action_status !== 'pending') throw new Error('Essa ação já foi decidida antes.');
  const baseAction = rows[0].proposed_action;

  if (decision === 'reject') {
    await pool.query(`UPDATE ai_messages SET action_status='rejected' WHERE id=$1`, [messageId]);
    if (baseAction && baseAction.type === 'save_knowledge_fact') {
      logMetric(pool, { orgId, projectId, eventType: 'fact_rejected', metadata: { subject: baseAction.subject } }).catch(() => {});
    }
    return { actionStatus: 'rejected' };
  }
  const finalAction = overrides && baseAction && baseAction.type === 'save_knowledge_fact' && OVERRIDABLE_SCOPES.has(overrides.scope)
    ? { ...baseAction, scope: overrides.scope }
    : baseAction;
  const result = await executeProposedAction(pool, orgId, projectId, finalAction, actingUserName, userId, conversationId);
  await pool.query(`UPDATE ai_messages SET action_status='executed' WHERE id=$1`, [messageId]);
  return { actionStatus: 'executed', result };
}

export async function getConversationMessages(pool, orgId, projectId, userId) {
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  const { rows } = await pool.query(
    `SELECT id, role, content, sources, has_evidence, feedback, proposed_action, action_status, structured, created_at FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at ASC`,
    [conversationId],
  );
  return rows.map((r) => ({
    id: r.id, role: r.role, content: r.content, sources: r.sources || [], hasEvidence: r.has_evidence, feedback: r.feedback,
    proposedAction: r.proposed_action || null, actionStatus: r.action_status, structured: r.structured || null, createdAt: r.created_at,
  }));
}

export async function clearConversation(pool, orgId, projectId, userId) {
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  await pool.query('DELETE FROM ai_messages WHERE conversation_id=$1', [conversationId]);
}

export async function setMessageFeedback(pool, orgId, projectId, userId, messageId, feedback) {
  const conversationId = await getOrCreateConversation(pool, orgId, projectId, userId);
  await pool.query('UPDATE ai_messages SET feedback=$1 WHERE id=$2 AND conversation_id=$3', [feedback, messageId, conversationId]);
}
