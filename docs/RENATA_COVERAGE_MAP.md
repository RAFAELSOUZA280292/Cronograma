# Mapa de Cobertura da RENATA — Auditoria Completa do Painel (2026-09-11)

Levantamento solicitado antes de qualquer implementação nova: inventário
completo do frontend, backend e do que a RENATA já enxerga hoje, para
decidir com calma a ordem de integração. Nada foi alterado no código —
isto é um documento de auditoria.

## Achado crítico antes de tudo: "o painel PRICETAX" não é um sistema só

Ao lado deste repositório (`pricetax-cronograma`) existe **outro projeto
completo e separado**: `/Users/rafaelsouza/Downloads/pricetax-prime-sped`
(`package.json` próprio, `PROJECT_CONTEXT.md` próprio, `client`/`server`
próprios). Não abri o código dele — só confirmei que existe, por regra
já combinada de nunca pular pra outro repositório sem avisar. É bem
provável que seja onde vive parte do que você chamou de "Fiscal"/SPED.

**Confirmado por busca direta no código**: `pricetax-cronograma` **não
tem** nenhum conceito de SKU, NCM, "Precificação por SKU", um dashboard
"Fiscal", "Insights Compras/Vendas", "Parceiros", "Consulta CNPJ" como
área própria, ou "X da Questão" (XPED). Esses itens da sua lista de
exemplo simplesmente não existem neste repositório — ou estão no
`pricetax-prime-sped`, ou em outro lugar ainda não localizado, ou ainda
não foram implementados em nenhum código que eu tenha acesso.

**Preciso que você decida**: quer que eu também audite o
`pricetax-prime-sped` (é um projeto grande, levaria uma nova rodada de
levantamento), ou seguimos por enquanto só com o que existe aqui na
Cronograma — que já é bastante coisa, como você vai ver abaixo?

---

## A. Mapa geral do sistema

### Workspaces principais (`workspaceMode`, `src/App.jsx`)

| Área (nome exibido) | `effectiveMode` | Quem vê | Componente | Status |
|---|---|---|---|---|
| Empresas | `company` | `companiesAccess` | inline, `src/App.jsx` (render principal) | Ativa, área primária |
| Gestão de Atividades | `personal` | `personalAccess` | `PersonalBoardScreen` | Ativa |
| XFlow | `xflow` | `xflowRole` truthy | `XFlowScreen` (`src/xflow/XFlow.jsx`) | Ativa |
| Agenda | `agenda` | todo usuário logado | `AgendaScreen` (`src/agenda/Agenda.jsx`) | Ativa |
| Visão Geral Empresas (macro) | `macro` | `companiesAccess && allCompaniesAccess` | `MacroOverviewScreen` (`src/macro/MacroOverview.jsx`) | Ativa |
| Conhecimento | `knowledge` | `role IN (master, pricetax)` — nunca 'cliente' | `KnowledgeCenterScreen` (`src/knowledge/`) | Ativa, mais nova (Fase 8, hoje) |

### Telas fora do `workspaceMode` (gate por role, checadas antes do render principal)

| Tela | Quem vê | Componente |
|---|---|---|
| Super Admin / Organizações | `isSuperAdmin` (automático se ainda não escolheu org, ou manual via botão) | `SuperAdminScreen` |
| Usuários | `role === 'master'` | `UsersManagementScreen` |
| Seletor de Empresas | acesso a mais de 1 empresa, sem seleção confirmada | `CompanySelectorScreen` |

### Rotas públicas (sem login, por token)

| Rota | Tela |
|---|---|
| `/quadro/:token` | `PublicBoardScreen` — quadro pessoal compartilhado, leitura+interação |
| `/reuniao/:token` | `PublicMeetingScreen` — reunião compartilhada, só leitura |

**Nada escondido/experimental encontrado.** O único artefato "legado" é
o mecanismo antigo de atividade de grupo por cópia (`groupActivityId`),
mantido só por compatibilidade — já substituído pelo design novo
(`involvedCompanyIds`) pra atividades criadas de agora em diante.

---

## B. Mapa detalhado (abas, subabas, modais)

### Empresas — 7 abas (`view` state), todas sobre o mesmo blob JSONB do projeto

| Aba | Componente | Dados | Ações principais |
|---|---|---|---|
| Resumo | `ResumoView` | digest de atividades | abre detalhe |
| Reuniões | `MeetingsView` | `meetings[]` + fila de transcrição (`meeting_submissions`) | criar reunião, enviar transcrição, reindexar memória, lixeira |
| Atividades | `TodoBoardView` | pendências agregadas de todas as reuniões | criar/editar/concluir, subtarefas, comentários, anexos, export Excel |
| Gantt | `TimelineView` | atividades (mesma base) | arrastar pra mudar data |
| Tabela | `TableView` | atividades (mesma base) | CRUD inline completo |
| Fases | `PhasesView` | atividades agrupadas por fase | abre detalhe |
| Quadro | `KanbanView` | atividades (mesma base) | arrastar pra mudar status/fase |

Modais/drawers da área Empresas: detalhe de atividade, detalhe de
reunião (com 3 modos de transcrição + compartilhamento público),
configurações da empresa, editor de Fases (master/pricetax), Log
(master/pricetax), Lixeira de atividades (master/pricetax), Lixeira de
reuniões, cadastrar/clonar empresa (com lookup de CNPJ), atividade de
grupo, Meu Perfil (com conexão Google Calendar).

### Gestão de Atividades (Personal Board)

Múltiplos quadros pessoais, cada um Kanban ou Lista. Modais: lixeira,
arquivo, compartilhamento público, log de atividade, reatribuição de
cards, filtros. Tudo persistido como um blob único via PATCH.

### XFlow

Sub-navegação: Quadro/Lista, Arquivados, Lixeira. Modal de ticket
gigante com dezenas de transições de estado possíveis (aceitar, pedir
info, comentar, publicar, bloquear, homologar, etc.), cada uma com
regra própria de permissão (`canDo`). Timeline de eventos por ticket.

### Agenda

Só leitura — mescla Google Calendar + tickets XFlow atribuídos ao
usuário + atividades do cronograma num feed único, por dia/semana/mês.

### Visão Geral Empresas (Macro)

Só leitura — dashboard cross-empresa com buckets (atrasado, semana
atual, próxima semana, 30 dias, sem data, pausado) + filtros por
empresa/responsável/status/prioridade. Clicar num item abre o MESMO
modal de detalhe de atividade da área Empresas (componente
compartilhado, não uma cópia).

### Conhecimento (Fase 8) — 6 abas, já documentado em detalhe no
`PROJECT_CONTEXT.md` §39. Visão Geral, Memórias, Conflitos, Pessoas,
Empresas, Métricas.

---

## C. Arquitetura — Tela → Componente → API → Serviço → Banco

### Backend: 8 routers, tudo montado em `server/index.js`

| Router | Prefixo | Rotas | Autenticação |
|---|---|---|---|
| `routes.js` | `/api` | 33 rotas (auth, users, projects, personal-board, cnpj, notifications, organizations) | mista, por rota |
| `xflow.js` | `/api/xflow` | 8 rotas (team, tickets, events, view) | `requireXflowAccess` + `canDo()` por ação |
| `google.js` | `/api/google` | 4 rotas (OAuth) | `requireAuth` |
| `agenda.js` | `/api/agenda` | 1 rota (feed mesclado) | `requireAuth` |
| `macro.js` | `/api/macro` | 1 rota | `requireAuth` + checagem manual `allCompaniesAccess` |
| `meetingInbox.js` | `/api/meeting-inbox` | 3 rotas | `requireAuth` + `canAccessProject` |
| `assistant.js` | `/api/assistant` | 7 rotas (RENATA por projeto) | `requireAuth` + `canAccessProject` |
| `knowledge.js` | `/api/knowledge` | 10 rotas (Central de Conhecimento) | `requireAuth` + `requireMasterOrPricetax` |

### Tabelas (19, todas em `server/db.js`)

`organizations`, `users`, `projects` (todo o cronograma/reuniões/equipe
vive num JSONB único aqui), `cnpj_cache`, `personal_boards`,
`xflow_tickets`, `xflow_events`, `notifications`,
`google_calendar_connections`, `meeting_submissions`,
`project_memory_chunks`, `ai_conversations`, `ai_messages`,
`ai_project_insights` (**morta** — nada escreve nela desde a Fase 7,
só existe pra histórico), `ai_knowledge_facts`, `ai_answer_cache`,
`ai_metrics_events`, `ai_knowledge_entities`, `ai_knowledge_fact_entities`.

### Integrações externas

| Integração | Uso | Opcional? |
|---|---|---|
| Anthropic API | extração de reunião (transcrição→estruturado) + pipeline RENATA (resolveQuery/synthesizeAnswer) | Sim — 503 sem `ANTHROPIC_API_KEY` |
| Voyage AI (embeddings) | busca semântica de memória, similaridade de fatos, cache semântico | Sim — degrada pra lexical/sem cache sem `VOYAGE_API_KEY` |
| Google Calendar (OAuth) | Agenda, XFlow (sync de prazo), RENATA (criar evento) | Sim — silenciosamente ignorado sem as chaves |
| BrasilAPI/ReceitaWS (CNPJ) | preencher cadastro de empresa | **Sempre ativo**, sem chave/flag — única integração assim |

Nenhum cron/job agendado existe. Migrações rodam no boot (idempotentes).
Único script solto: `server/scripts/reindexAllMeetings.js` (manual,
"revisar com o Rafael antes" segundo o próprio comentário).

---

## D. Matriz de cobertura da RENATA

Classificação: **A** integrada · **B** parcialmente integrada · **C**
não integrada · **D** não deve ser integrada.

| Área | Aba/Dado | RENATA lê? | Explica? | Cruza? | Executa? | Classe | Prioridade |
|---|---|---|---|---|---|---|---|
| Empresas | Identidade do cliente, equipe, fases (nomes) | Sim (snapshot sempre injetado) | Sim | — | — | **A** | — |
| Empresas | Reuniões (metadados + conteúdo via memória) | Sim (lista + busca híbrida em `project_memory_chunks`) | Sim | Sim (com atividades/fatos) | Cria pendência, cria reunião indiretamente não | **A** | — |
| Empresas | Atividades (Gantt/Tabela/Fases/Quadro) | Sim, mas **capado em 40** e só título/data/status/fase | Sim | Sim | Cria/reagenda/exclui (com confirmação) | **B** | Média — remover o cap ou paginar sob demanda |
| Empresas | Comentários/anexos/subtarefas de atividade | Não | Não | Não | Não | **C** | Baixa |
| Empresas | Log de alterações | Não | Não | Não | Não | **C** | Baixa |
| Empresas | Lixeira (atividades/reuniões) | Não | Não | Não | Não | **D** | — |
| Empresas | Configurações da empresa (fora identidade básica) | Não | Não | Não | Não | **C** | Baixa |
| Conhecimento | Toda a área | N/A (é a própria camada de governança da RENATA) | — | — | — | — | — |
| Gestão de Atividades (Personal Board) | Tudo | Não — nenhuma função lê `personal_boards` | Não | Não | Não | **C** | Baixa (é dado pessoal, não do projeto — considerar privacidade antes) |
| XFlow | Tickets, eventos, equipe | Não — nenhuma referência a `xflow_tickets` em nenhum arquivo da RENATA | Não | Não | Não | **C** | **Alta** |
| Agenda | Feed mesclado (`/api/agenda`) | Não diretamente — RENATA chama o Google Calendar cru, não esse feed | Parcial (só Google, não XFlow) | Não | Cria evento no Google (não no feed mesclado) | **B** | Média |
| Visão Geral Empresas (Macro) | Cross-empresa | Não — nenhuma referência a `macro.js` na RENATA | Não | Não | Não | **C** | **Alta** (mas exige decisão de arquitetura — ver item H) |
| Usuários / Organizações / Super Admin | Tudo | Não | Não | Não | Não | **D** | — (administração sensível, nunca deve virar tool da IA) |

**Resumo**: dentro da área Empresas (a mais rica), RENATA já está bem
integrada no que é "cronograma + reuniões + conhecimento". Fora dela,
a cobertura é praticamente zero — XFlow, Personal Board, Macro e a
Agenda mesclada não existem no mundo da RENATA hoje.

---

## E. Mapa de entidades

`ai_knowledge_entities.type`: `PERSON | COMPANY | PROJECT | LAW |
PRODUCT | TOPIC` (Fase 8).

| Tipo | Backing estruturado real? |
|---|---|
| PERSON | Parcial — só resolve `linked_user_id` se o nome bater com um membro de equipe que já tem `userId` vinculado. Contatos externos e participantes não resolvidos ficam sem vínculo. |
| COMPANY / PROJECT | Parcial e estreito — só resolve `linked_project_id` pro **cliente do próprio projeto onde o fato foi salvo**. Uma empresa mencionada que não é o cliente (ex.: um fornecedor, um concorrente) fica só como texto, sem elo nenhum. |
| LAW | Nenhum — não existe tabela de legislação/norma em lugar algum. |
| PRODUCT | Nenhum — não existe catálogo de produto/sistema. |
| TOPIC | Nenhum por design — é o "balde" livre pra assunto que não é nenhum dos outros. |

**Confirmado por busca direta**: **não existe SKU, NCM, ou "fornecedor"
como entidade estruturada** em lugar nenhum do código (nem tabela, nem
coluna, nem enum) — as únicas ocorrências da palavra "fornecedor" são
texto livre (título de template, comentário, exemplo de prompt).

**Identificadores reais que já existem e são consistentes**: `users.id`,
`projects.id`, `project.company.cnpj`, `xflow_tickets.id`/`number`,
`ai_conversations.id`. **Reunião não tem id numa tabela própria** — vive
dentro do JSONB do projeto, referenciada por string solta em todo lugar
(`meeting_id`) — funciona, mas não é uma FK de verdade.

---

## F. Mapa de permissões

**Não existe um modelo único** — são 4 mecanismos independentes:

1. **`canAccessProject(user, project, orgId)`** (`server/routes.js`) —
   visibilidade por empresa/CNPJ (`companiesAccess`/`allCompaniesAccess`/
   `allowedCnpjs`). Gate de toda rota de projeto, incluindo a RENATA.
2. **Middlewares de role** (`server/auth.js`) — `requireMaster`,
   `requireMasterOrPricetax` (gate de TODA a Central de Conhecimento),
   `requireSuperAdmin`, `requireXflowAccess` (só checa se `xflowRole`
   existe, não qual).
3. **Sistema próprio do XFlow** (`server/xflowPermissions.js`) — rank
   (`reporter<dev<gestao<admin`) + regras de dono/responsável por ação
   (`canDo`), sem nenhuma relação com `canAccessProject`.
4. **`listAccessibleProjectIds`** (Fase 8) — não é um 5º sistema, é o
   mesmo `canAccessProject` reaplicado linha a linha pra devolver o
   conjunto inteiro (usado só pela Central de Conhecimento).

**Regra a seguir daqui pra frente** (você já enunciou, e o código já
confirma que é o caminho certo): **qualquer tool nova da RENATA precisa
reusar EXATAMENTE a checagem da rota que ela está espelhando** — uma
tool de XFlow passa por `requireXflowAccess`/`canDo`; uma tool de Macro
passa pela mesma checagem de `allCompaniesAccess`; nunca inventar uma
quinta regra paralela.

---

## G. Mapa de ações (o que a RENATA poderia fazer no futuro)

Princípio de produto já estabelecido e que deve continuar: **a RENATA
nunca executa sozinha** — toda ação hoje (as 7 já existentes) exige
confirmação explícita do usuário. Classificação das ações candidatas
encontradas no sistema:

| Ação | Classe |
|---|---|
| Consulta de CNPJ (leitura pública, sem efeito colateral) | **Segura pra execução direta** |
| Leituras agregadas (macro, agenda, tickets, métricas) | **Só leitura/recomendação** — nem é "ação", é consulta |
| Criar/editar/excluir pendência de reunião, atividade, evento no calendário, fato de conhecimento (já implementadas) | **Exige confirmação** |
| Transições de estado de ticket XFlow (aceitar, comentar, publicar, etc.) | **Exige confirmação** — e sempre validada contra `canDo()`, nunca só o card de confirmação da RENATA |
| Criar/mover card no quadro pessoal | **Exige confirmação** — mas primeiro decidir SE a RENATA deve tocar dado pessoal |
| Criar/editar/excluir usuário, bloquear conta, mudar organização | **Nunca deve ser executada pela IA** — administração sensível, blast radius alto |
| Excluir empresa/projeto inteiro | **Nunca deve ser executada pela IA** |
| Desconectar/reconectar integração (Google) | **Nunca deve ser executada pela IA** — ação sobre credencial |

---

## H. Lacunas (o que impede a RENATA hoje)

- **XFlow**: nenhuma função em nenhum arquivo da RENATA referencia
  `xflow_tickets` — zero acesso, não é um "pouco integrado", é
  ausência total. Precisa de tools novas (ex.: buscar tickets,
  detalhe de ticket) reusando `xflowPermissions.canDo`.
- **Macro (cross-empresa)**: mesma ausência total, e aqui tem uma
  tensão de arquitetura real — a RENATA hoje é estruturalmente
  presa a UM projeto por vez (`ai_conversations` tem chave única
  `project_id+user_id`, uma conversa nunca mistura dois projetos).
  Uma pergunta tipo "o que está atrasado em todas as minhas empresas"
  exigiria ou uma tool que consulta várias empresas SEM trocar de
  conversa, ou um modo de conversa novo — precisa de decisão, não é
  só "adicionar mais dado no prompt".
- **Personal Board**: ausência total, e aqui a pergunta não é só
  técnica — é dado **pessoal** do usuário, talvez nem devesse entrar
  no mesmo modelo de "conhecimento do projeto".
- **Agenda mesclada**: a RENATA já fala com o Google Calendar
  diretamente, mas ignora o feed já pronto que mistura isso com
  tickets XFlow — reaproveitar `server/agenda.js` é bem mais barato
  que reconstruir a mescla.
- **Contexto de UI**: hoje a RENATA só recebe `{view, meetingId}` por
  mensagem — não sabe em qual aba de Precificação, filtro, ou
  registro específico o usuário está olhando fora da área Empresas
  (nem existe esse conceito de "SKU selecionado" etc. no sistema, já
  que Precificação por SKU não existe aqui).
- **Entidades cross-empresa**: COMPANY/PROJECT só resolvem pro cliente
  do próprio projeto — impossível hoje cruzar "esse fornecedor
  apareceu em outra reunião" porque "fornecedor" nem é uma entidade
  real ainda.

---

## I. Plano técnico (proposta, não implementada)

### 1. Contexto de UI centralizado

Estender o `context` que já é enviado em toda pergunta
(`POST /api/assistant/ask`, hoje só `{view, meetingId}`) pra um objeto
estruturado único, montado num lugar central em `src/App.jsx` (não
espalhado tela por tela):

```
{ workspace, module, tab, subtab, projectId, meetingId, filtrosAtivos,
  registroSelecionado, ... }
```

Cada tela nova que quiser participar só precisa alimentar esse objeto
compartilhado, nunca inventar seu próprio mecanismo — mesmo espírito
de reuso já usado em todo o resto do sistema.

### 2. Camada de ferramentas por domínio (nomes reais, baseados no que existe)

Nada de nomes inventados tipo `getSkuEconomicSheet` (não existe SKU
aqui). Baseado no inventário real:

- **XFlow**: `searchTickets`, `getTicketDetail`, `getMyOpenTickets` —
  todas passando por `canDo()`/`requireXflowAccess`.
- **Macro**: `getCrossCompanyOverview` — só disponível quando
  `allCompaniesAccess` é verdadeiro, mesma regra de `macro.js`.
- **Agenda**: reusar a função de mescla de `server/agenda.js`
  diretamente em vez de RENATA chamar o Google Calendar por conta
  própria.
- **Empresas/Atividades**: já existem de fato (`buildProjectSnapshot`,
  `searchProjectMemory`, `loadRelevantFacts`) — só precisam perder o
  cap de 40 atividades trocando por paginação/tool sob demanda.

### 3. Orçamento de token — o que fica sempre no prompt vs. sob demanda

Já existe um bom exemplo disso: `buildProjectSnapshot` é um resumo
CAPADO, não o projeto inteiro. Generalizar esse princípio:
- **Sempre no contexto**: um resumo curto e capado por domínio (como
  já é feito pra atividades/reuniões).
- **Sob demanda (tool call)**: qualquer coisa que só interessa quando
  perguntada — detalhe de ticket, dado cross-empresa, transcrição
  completa (já funciona assim pra reuniões).
- **Retrieval**: busca híbrida (já existe pra `project_memory_chunks`
  e `ai_knowledge_facts`) — extensível pro conteúdo de XFlow se fizer
  sentido no futuro.
- O pipeline de 2 chamadas já existente (`resolveQuery` decide o quê
  buscar, `synthesizeAnswer` responde) é o lugar natural pra decidir
  QUAL tool chamar — não precisa de arquitetura nova do zero.

### 4. Disciplina de permissão (repetido de propósito, é o ponto mais importante)

Toda tool nova reusa a MESMA checagem da rota que ela espelha. Nunca
uma regra de acesso paralela. Permissão antes de qualquer busca —
mesmo funil já usado desde a Fase 7.1/8.

### 5. Ordem sugerida (pra vocês decidirem juntos, não uma imposição)

1. Agenda — reusar o feed já mesclado (mudança pequena, mecânica).
2. XFlow — tools de LEITURA primeiro (buscar/detalhar ticket).
3. Macro — tool de leitura cross-empresa, resolvendo antes a questão
   estrutural de "uma pergunta, várias empresas, sem trocar de conversa".
4. Resolver entidades COMPANY/PROJECT além do cliente do próprio
   projeto (pré-requisito pro cruzamento "fornecedor apareceu em outra
   reunião" que você deu de exemplo).
5. Personal Board — só depois de decidir a questão de privacidade.
6. Ações executáveis nesses domínios novos — só depois das leituras
   estarem validadas em produção.
