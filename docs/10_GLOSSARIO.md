# Glossário (as palavras do projeto, em português simples)

> Atualizado em 2026-10-29. Serve para humanos e robôs falarem a mesma língua. Quando uma palavra aparece na tela, no código ou nos pedidos do Rafael, procure aqui.

## Em uma frase
Cada termo abaixo diz **o que é**, **como aparece no código** e **onde ler mais**.

## Pessoas, acesso e organização

| Termo | O que é | No código / onde ler |
|---|---|---|
| **Base** (ou organização, *tenant*) | Uma "empresa-cliente do sistema": dados separados das outras bases no mesmo banco | coluna `org_id`; tabela `organizations`; `PROJECT_CONTEXT.md` §11 |
| **PRICETAX** (a base) | A base da própria consultoria, onde fica a equipe | `migrateToPricetaxOrg` em `server/db.js` |
| **sandbox-edu** | Base de **teste** local (usuários temporários dos scripts) | `scripts/sandbox-eduarda.mjs` |
| **Master** | Administrador da base (papel `master`): vê e faz quase tudo | `requireMaster` em `server/auth.js` |
| **Super administrador** | Administrador acima das bases (cria organizações) | `is_super_admin`; `requireSuperAdmin` |
| **pricetax** (papel) | Equipe PRICETAX (não-administrador) | `role = 'pricetax'` |
| **cliente** (papel) | Pessoa de uma empresa cliente; só vê o que é dela; **nunca** vê conteúdo interno | `role = 'cliente'` |
| **Acessos independentes** | Empresas, Gestão de Atividades e XFlow liberados **separadamente** do papel | colunas `companies_access`, `personal_access`, `xflow_role` |
| **crm_role** | Papel dentro do CRM (admin, diretor, gestor, vendedor, consultor, financeiro, visualizacao) | `server/crm/permissions.js` |
| **Módulo** | Uma área do painel com endereço próprio (Empresas, CRM, Agenda…) | `src/lib/routes.js` (`MODE_PATHS`) |
| **Modo** (`mode`) | O nome interno do módulo aberto no front | `canOpenMode` |

## Cronograma e empresas

| Termo | O que é | Onde |
|---|---|---|
| **Empresa / projeto** | O cronograma de um cliente. No banco é **uma linha** de `projects` com um JSON grande em `data` | `projects.data`; `docs/05_MODULO_EMPRESAS_CRONOGRAMA.md` |
| **Fase** | Grupo de atividades (ex.: "Diagnóstico") | `data.phases` |
| **Atividade** | Item do cronograma com datas, responsável e status | `data.activities` |
| **Subatividade** | Passo dentro de uma atividade (checklist com responsável/data/predecessora) | `activities[].subactivities` |
| **Reunião** | Encontro registrado com resumo, decisões, participantes e tarefas | `data.meetings[]` |
| **Tarefa de reunião** (*actionItem*) | Pendência que saiu da reunião (responsável, prazo, lado cliente/PRICETAX) | `meetings[].actionItems[]` |
| **Vínculo tarefa→atividade** | Ligação entre uma tarefa de reunião e uma atividade do cronograma (sugerida, automática ou confirmada) | `activityLink`; `server/taskLinks.js` |
| **Log da empresa** | Histórico de quem fez o quê naquela empresa | `data.log` |
| **Cronograma padrão** | Modelo versionado (1.0, 2.0…) aplicado/auditado nas empresas | `server/standardPlan*.js` |
| **Levantamento** | Contagem de atividades por fase e responsável de todas as empresas | `server/inventory.js` |
| **Lacunas** | O que falta em um cronograma comparado ao padrão/outros | `server/gaps.js` |
| **Visão Geral** (antes "Visão Macro") | Painel que reúne várias empresas | `server/macro.js`, `src/macro/` |
| **Grupo Empresarial** | Várias empresas do mesmo grupo ligadas por uma marca (tag) | `involvedCompanyIds`; §12 |
| **Dossiê** | Compilado de todas as reuniões de um cliente, gerado pela IA | `server/dossier.js` |
| **Versão do cronograma** | Cópia automática (gatilho do banco) que permite comparar e restaurar | `project_versions`; §83 |
| **Link de acompanhamento** | Página pública (sem login) com o andamento publicado | `server/companyShare.js` |

## Atividades pessoais, agenda e XFlow

| Termo | O que é | Onde |
|---|---|---|
| **Quadro pessoal / Gestão de Atividades** | Kanban individual, sem ligação com empresa | `personal_boards`; `src/personal/` |
| **Cartão** | Item do quadro (título, descrição formatada, checklist, prazo, prioridade) | `boards[].columns[].cards[]` |
| **Coluna compartilhada** | Coluna do quadro vista por outra pessoa (link público ou no painel dela) | §121–§122 |
| **BIP** | O "pulso" de sincronização: o front consulta versões a cada ~6 s | `GET /api/projects/versions` |
| **XFlow** | Módulo de BUGs e TASKs do time de desenvolvimento | `server/xflow*.js`; `src/xflow/` |
| **TASK / BUG** | Os dois tipos de ticket do XFlow | §18 |
| **Previsão de conclusão** | Data da TASK que vira evento no Google Calendar da pessoa | §21 |

## CRM

| Termo | O que é | Onde |
|---|---|---|
| **Empresa / contato / negócio** | Os três cadastros centrais do CRM | tabelas `crm_companies`, `crm_contacts`, `crm_deals` |
| **Funil e etapa** | Sequência de fases de um negócio; **Lead** é a primeira | `crm_pipelines`, `crm_pipeline_stages` |
| **Cadência** | Sequência automática de atividades de follow-up por etapa | `server/crm/extras.js` (cadências), `server/crm/automation.js` |
| **Ficha 360** | Tela completa de uma empresa (contatos, negócios, histórico) | `src/crm/` |
| **PipeRun** | CRM antigo de onde se migra; a migração é **só pela tela, por administrador** | `server/crm/piperun/` |
| **Visão salva** | Filtro de negócios guardado (pessoal, do time ou padrão) | §98 |

## IA

| Termo | O que é | Onde |
|---|---|---|
| **RENATA** | A assistente de IA da PRICETAX (acrônimo: Reforma, Execução, Negócios, Agilidade, Tecnologia e Ação) | `docs/05_MODULO_RENATA_E_IA.md` |
| **IVANA** | A "irmã" da RENATA: inteligência de **interpretação da legislação** (reforma tributária) | persona; §101 |
| **RENATA de consulta** | Responde perguntas por empresa ou geral, com memória e citações | `server/assistant*.js` |
| **RENATA operacional** | Executa no sistema pelas mesmas rotas da tela, com confirmação e desfazer | `server/renata/` |
| **Ferramenta** (*tool*) | Uma ação que a RENATA operacional pode chamar (~101) | `server/renata/tools/` |
| **Risco** (`read` / `write` / `critical`) | Classe da ferramenta; `critical` e lote **sempre** pedem confirmação | `registry.add` |
| **Fato** (*knowledge fact*) | Um item da memória da RENATA (de pessoa, de parecer, de material) | `ai_knowledge_facts` |
| **Embedding** | Vetor numérico do texto para busca por significado (Voyage) | `server/embeddings.js` |
| **Trecho** (*chunk*) | Pedaço de reunião indexado para busca | `project_memory_chunks` |
| **Busca híbrida** | Texto (lexical) + significado (embeddings) | `server/memoryRetrieval.js` |
| **Parecer** | Documento técnico PDF escrito pela PRICETAX; a RENATA o **estuda** | `server/pareceres.js`, `parecerStudy.js` |
| **Geral / Cliente específico** | Escopo do parecer: serve a qualquer empresa × só à empresa dele | `parecerUsableFor` |
| **Sugestão de pareceres** | Para cada reunião, quais pareceres se aplicam e que caminhos seguir | `meeting_parecer_advice` |
| **Biblioteca / Material** | Arquivos de referência enviados e estudados (apresentações, estudos) | `server/knowledgeLibrary*.js` |
| **Transcrição** | Texto bruto de uma reunião; a RENATA extrai título, participantes, resumo, decisões e tarefas | `server/meetingInbox.js` |
| **`max_tokens`** | Limite do tamanho da resposta da IA; estourar = resposta cortada (bug clássico) | `docs/08_BUGS_E_LICOES.md` |
| **Prompt cache** | A Anthropic reaproveita o começo repetido do prompt para custar menos | `cache_control` |

## API e integrações

| Termo | O que é | Onde |
|---|---|---|
| **API de conectividade** | Portas para outras IAs usarem o painel por chave | `/api/connect`; `server/connect.js` |
| **Chave `pxk_…`** | Credencial da API de conectividade (só o hash é guardado) | tabela `api_tokens` |
| **Escopo** | O que a chave pode: `read_all`, `write_all` e os 6 antigos (`read`, `read_create`, `read_write`, `crm_operate`, `transcripts`, `meetings_edit`) | `SCOPES` |
| **Token `pxw_…`** | Credencial do widget do iPhone (só leitura) | `server/widget.js` |
| **`dryRun`** | Modo "mostre o que faria, sem gravar" | rotas `/plan` e correção de reunião |
| **`ops`** | Lista de operações aplicadas "tudo ou nada" | `applyPlanOps` |
| **`ref`** | Chave que impede duplicar uma criação repetida (idempotência) | `POST /activities` |
| **Ator "Claude Code (por …)"** | Como gravações feitas por chave aparecem na auditoria | `connect.js` |
| **OAuth / VAPID** | OAuth = autorização do Google Calendar pela pessoa; VAPID = chaves do Web Push | `server/google*.js`, `server/push.js` |

## Qualidade e operação

| Termo | O que é |
|---|---|
| **Trava** | Regra que impede um erro (permissão, validação, transação, limite) |
| **Gatilho** | O que faz algo acontecer (clique, timer, evento, outra rota, gatilho do banco) |
| **Exclusão lógica** | Marcar como apagado sem remover (`deleted: true`/`deleted_at`) |
| **Lixeira** | Onde vão os itens excluídos logicamente, com volta |
| **409** | Conflito: outra pessoa alterou antes ou o registro já existe |
| **Aditivo** | Mudança que só **acrescenta** (coluna nova com `IF NOT EXISTS`), nunca remove |
| **§** | Seção numerada do `PROJECT_CONTEXT.md` (ex.: §116) |
| **Teste descartável** | Script em `scripts/*.test.mjs` que sobe servidor/banco locais, prova e limpa |
| **BRT / GMT-3** | Horário de Brasília; o servidor e os logs usam UTC (= BRT + 3 h) |
| **Sourcemap** | Arquivo que traduz erro do código compilado; fica fora da pasta pública |
| **Railway** | Onde o sistema roda em produção (deploy automático no `push` da `main`) |
