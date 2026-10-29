# Mapa de arquivos (gerado)

> Gerado automaticamente por `scripts/docs-gen.mjs` a partir do código. **Não edite à mão** — rode `npm run docs:gerar`.

Cada arquivo com o número de linhas e a **primeira frase do comentário de cabeçalho** (quase todos têm uma). Use para achar "onde mora" algo antes de abrir arquivos grandes. Arquivos acima de 1.000 linhas: leia com `offset`/`limit` ou `grep`.

## `server/` — 151 arquivos

| Arquivo | Linhas | O que é |
|---|---|---|
| `server/accessLog.js` | 163 |  |
| `server/activityDictionary.js` | 182 | Dicionário de atividades (2026-10-19, pedido do Rafael: "um mega dicionário de todas as atividades"; ver PROJECT_CONTEXT.md §80). |
| `server/agenda.js` | 139 | Agenda (2026-08) — junta, num só feed, o Google Calendar conectado do |
| `server/answerCache.js` | 165 | Cache semântico de perguntas/respostas da RENATA (Fase 7, 2026-09-11) |
| `server/areas.js` | 11 | Áreas (2026-10-07, Passo 3 do caminho combinado): lista fechada para classificar atividades e tarefas de reunião por tema. |
| `server/assistant.js` | 221 | Rotas do Assistente do Projeto (2026-09, Fase 2 do Assistente |
| `server/assistantActions.js` | 294 | Agente executor do Assistente do Projeto (2026-09, pedido do Rafael: |
| `server/assistantContext.js` | 281 | Perfil do projeto (2026-09) — resumo compacto e sempre atualizado da |
| `server/assistantGeneral.js` | 186 | RENATA "geral" (2026-10-06): a assistente disponível de qualquer tela, sem estar presa a um projeto. Responde com o que a PESSOA |
| `server/assistantRetrieval.js` | 829 | RENATA — Assistente do Projeto (2026-09, Fase 2 do Assistente |
| `server/assistantSweep.js` | 122 | Varredura de reuniões de VÁRIAS empresas para a RENATA geral (Etapa 3 do plano, 2026-10-08; pedido do Felipe: "a RENATA faz |
| `server/auth.js` | 199 |  |
| `server/clientError.js` | 35 | Erros de tela capturados pelos limites de erro do navegador (2026-10-16): uma linha JSON no log do servidor (Railway), para que uma tela |
| `server/clientView.js` | 32 | Visão do usuário `cliente` sobre o JSON da empresa (A3/A4, 2026-10-29). A tela já escondia Log/Lixeira/Versões; aqui o SERVIDOR faz o mesmo: |
| `server/cnpjLookup.js` | 230 |  |
| `server/commentExtras.js` | 40 | Anexos, links e @menções de comentário (Onda 3, §81) — um só validador/notificador para Pareceres, Modelos e notas do CRM. |
| `server/companyCalendar.js` | 158 | "Reservar na agenda" (2026-10-19): bloco de agenda por atividade do cronograma, convidando só os e-mails que a equipe digita (equipe PRICETAX; cliente nunca é convidado). |
| `server/companyCalendarPlan.js` | 101 | Reservar na agenda (2026-10-19, pedido do Rafael): cada ATIVIDADE do cronograma da empresa vira UM bloco de agenda (padrão de call: 60 min) para a equipe PRICETAX. |
| `server/companyShare.js` | 197 | Link público de acompanhamento da empresa (2026-10-19, pedido do Rafael): o cliente abre o link SEM login e vê Resumo, Cronograma (Gantt com subatividades) e Tabela, só leitura. |
| `server/connect.js` | 813 | API de conectividade (2026-10-05, §80): permite que OUTRA janela do Claude Code (ou qualquer script) leia o painel e crie atividades |
| `server/crm/activities.js` | 256 | CRM — atividades e follow-ups (Fase 3, 2026-09-20, PROJECT_CONTEXT.md §56). |
| `server/crm/activityQueries.js` | 103 | CRM — consultas de atividades (Fase 3). Somente leitura. |
| `server/crm/agendaFeed.js` | 23 | CRM — atividades em aberto do usuário como eventos da Agenda existente |
| `server/crm/automation.js` | 48 | Automação "ao ganhar" (§84): reproduz a única automação ativa do PipeRun da PRICETAX ("Ganhos - Iniciar Operação": ao ganhar um negócio do funil Empresas na etapa Contrato, |
| `server/crm/bootstrap.js` | 90 | Traz pro CRM os clientes que JÁ existem no painel (projetos do cronograma) — |
| `server/crm/cnpj.js` | 28 | Validação de verdade (dígitos verificadores) — o cnpjLookup.js do painel só |
| `server/crm/cnpjSuggestion.js` | 26 | Traduz o retorno de lookupCnpj (server/cnpjLookup.js, BrasilAPI/ReceitaWS com |
| `server/crm/completeness.js` | 21 | Completude da conta (PRD 62). Função pura. "Produtos" do PRD entra na Fase |
| `server/crm/dashboards.js` | 165 | CRM — painéis da Visão geral por função (§98): Meu dia, Time, Receita. "Contas" reaproveita Q.overview. |
| `server/crm/dealExport.js` | 76 | Exportação dos negócios para Excel (2026-10-28, §116c): mesmos filtros da lista/quadro, com os dados de contato (e-mail, telefone, link do WhatsApp). |
| `server/crm/dealImporter.js` | 302 | CRM — importação de NEGÓCIOS a partir de planilha (Fase 2b, 2026-09-20, PROJECT_CONTEXT.md §58). |
| `server/crm/dealQueries.js` | 176 | CRM — consultas de negócios/pipeline (Fase 2). Somente leitura. |
| `server/crm/deals.js` | 314 | CRM — negócios (Fase 2, 2026-09-20, PROJECT_CONTEXT.md §55). Mesma regra da |
| `server/crm/duplicates.js` | 61 | Detecção de duplicidade (PRD 42). CNPJ igual = bloqueia; nome parecido ou |
| `server/crm/errors.js` | 8 |  |
| `server/crm/extras.js` | 238 | CRM — campos que o PipeRun tinha e o CRM não: MRR do negócio, tags e prazo (SLA) por etapa (§85). Só colunas/tabelas NOVAS e aditivas. |
| `server/crm/funnels.js` | 184 | CRM — funis e etapas (Fase 2b, 2026-09-20, PROJECT_CONTEXT.md §58). A Fase 2 nasceu com um funil |
| `server/crm/googleSync.js` | 114 | Atividade do CRM ↔ Google Calendar do RESPONSÁVEL (2026-10-26, pedido do Rafael: "quando a Eduarda criar uma atividade para ela, já adicione na |
| `server/crm/importer.js` | 234 | Importação de planilha Excel/CSV (PRD 48) — a leitura do arquivo e o |
| `server/crm/permissions.js` | 56 | Permissões do CRM (2026-09-20, ver PROJECT_CONTEXT.md §54). Coluna própria |
| `server/crm/pipeline.js` | 84 | CRM — pipeline (Fase 2, 2026-09-20, PROJECT_CONTEXT.md §55). |
| `server/crm/piperun/client.js` | 49 | Cliente da API do PipeRun (§84) — SÓ LEITURA (GET). O token vem de quem pediu a extração, fica na memória durante a execução e nunca é gravado nem registrado em log. |
| `server/crm/piperun/extract.js` | 77 | Extração PipeRun → cópia bruta (§84). Só leitura na API; grava em piperun_raw (um registro por id, atualizado se rodar de novo). O token fica só na memória desta execução. |
| `server/crm/piperun/extrasImport.js` | 101 | Migração PipeRun → CRM, 2ª leva (§85): funis completos (etapas sem negócio + prazo/SLA), catálogo de produtos, catálogo de tags e, por negócio, MRR, previsão de fechamento e tags. |
| `server/crm/piperun/migrate.js` | 430 | Migração PipeRun → CRM (§84): PRÉVIA (não grava) e IMPORTAÇÃO (fases em ordem, cada registro na sua transação: um erro não derruba os outros). |
| `server/crm/piperun/reconcile.js` | 100 | Conferência PipeRun × CRM (§84): contagens, soma de valores por situação e por funil, e a lista do que ficou divergente. Compara a cópia bruta (a verdade do PipeRun no momento da |
| `server/crm/piperun/routes.js` | 90 | Rotas da migração PipeRun (§84), montadas dentro de /api/crm. Só o ADMINISTRADOR do CRM (master/superadmin) opera a migração; arquivos de negócio seguem a permissão de leitura do CRM. |
| `server/crm/piperun/runs.js` | 40 | Execuções da migração (§84): uma linha em piperun_runs por extração/importação, com progresso para a tela acompanhar. Nunca guarda o token. |
| `server/crm/piperun/schema.js` | 63 | Migração PipeRun → CRM (§84). Só tabelas NOVAS (nada do CRM existente muda): |
| `server/crm/piperun/transform.js` | 362 | Migração PipeRun → CRM (§84): TRANSFORMAÇÃO PURA (sem banco, sem rede). Entra a cópia bruta da API; saem as linhas no formato que os importadores do CRM já usam. |
| `server/crm/products.js` | 99 | CRM — catálogo de produtos/serviços (Fase 2). Sem timeline (não pertence a uma |
| `server/crm/projectSummary.js` | 38 | Resumo SOMENTE-LEITURA de um projeto do cronograma pra ficha da empresa do |
| `server/crm/queries.js` | 253 | CRM — consultas (somente leitura). Ver service.js pras escritas. |
| `server/crm/routes.js` | 278 | CRM PRICETAX — rotas (/api/crm). Fase 1 (2026-09-20, PROJECT_CONTEXT.md §54). |
| `server/crm/scheduler.js` | 58 | CRM — agendador de lembretes (Fase 3, 2026-09-20, PROJECT_CONTEXT.md §56). |
| `server/crm/service.js` | 679 | CRM PRICETAX — camada de serviço (Fase 1, 2026-09-20, PROJECT_CONTEXT.md §54). |
| `server/crm/text.js` | 90 | Normalizações de texto compartilhadas pelo CRM (busca, duplicidade, import). |
| `server/crm/views.js` | 159 | CRM — visões salvas de Negócios e página inicial por pessoa (§98). |
| `server/crm/xlsxExport.js` | 114 | Exportação nativa para Excel (2026-10-28, §116c): planilha .xlsx com visual (cabeçalho, linhas alternadas, filtro, cabeçalho fixo, links clicáveis). |
| `server/daily.js` | 75 | "Meu dia" (2026-10-05, §77): preferências de conteúdo diário + boas-vindas na primeira entrada. Só o próprio usuário |
| `server/dailyContent.js` | 222 | Conteúdo diário ("Meu dia", 2026-10-05, §77): evangelho, versículo, sabedoria, horóscopo, horóscopo chinês e inspiração. |
| `server/db.js` | 1596 |  |
| `server/documentTemplates.js` | 260 | Modelos de documentos (2026-10-05, §78) — irmã da aba Pareceres: biblioteca de modelos para sócios e colaboradores. Um MODELO |
| `server/dossier.js` | 453 | Dossiê do cliente (2026-10-02, pedido da Amanda via Rafael: "um compilado de todas as reuniões |
| `server/embeddings.js` | 63 | Embeddings pra busca semântica da RENATA (Fase 3, 2026-09 — ver |
| `server/errorHandler.js` | 32 | Erros da API em português claro, com o que a pessoa pode fazer (§96). Função pura `describeError` (testada) + o middleware do Express. |
| `server/evals/evalCases.js` | 343 | RENATA Eval Harness — Fase 1. Casos de teste controlados contra a |
| `server/evals/evalMetrics.js` | 195 | RENATA Eval Harness — Fase 1. Funções PURAS de métrica — sem chamada de |
| `server/evals/evalReport.js` | 129 | RENATA Eval Harness — Fase 1. Formata os resultados de runEvalSuite num |
| `server/evals/evalRunner.js` | 187 | RENATA Eval Harness — Fase 1. Orquestra UM caso de eval: prepara o estado |
| `server/evals/evidenceKeys.js` | 66 | RENATA Eval Harness — Fase 1. Chunk ids e fact ids são gerados |
| `server/evals/fixtures.js` | 366 | RENATA Eval Harness — Fase 1 (2026-09-13, ver docs/RENATA_P0_P1_IMPLEMENTATION_PLAN.md |
| `server/evals/taskLinkEval.js` | 150 | Avaliação de qualidade da sugestão tarefa → atividade (Fase 5 do plano, 2026-10-13; docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md). |
| `server/experience.js` | 137 | Experiência de uso (§97): eventos de FLUXO (nome, resultado, duração, rota de erro) e nota de satisfação de 1 clique. Só equipe é medida |
| `server/gaps.js` | 232 | Lacunas entre cronogramas (Etapa 4 do plano, 2026-10-08; pedido do Felipe: "levantamento de tudo que temos de atividades ... para |
| `server/google.js` | 59 | Rotas de conexão com o Google Calendar (2026-08) — cada usuário conecta a |
| `server/googleCalendar.js` | 290 | Sincronização com Google Calendar (2026-08) — cada usuário conecta a |
| `server/index.js` | 170 |  |
| `server/inspirationQuotes.js` | 281 | Frases de inspiração (2026-10-05, §77): base CURADA, não gerada por IA. Duas camadas de comprovação, que nunca se misturam: |
| `server/inventory.js` | 373 | Levantamento de atividades de TODAS as empresas (2026-10-07, Etapa 1 de docs/PLANO_RENATA_CONSULTAS_GERAIS.md; pedido do |
| `server/inventoryEdit.js` | 194 | Passo 3 do caminho combinado (2026-10-07): organizar o que já existe a partir do Levantamento — padronizar o nome do |
| `server/knowledge.js` | 167 | Central de Conhecimento — rotas (Fase 8, 2026-09-11). Área |
| `server/knowledgeCenter.js` | 575 | Central de Conhecimento — regra de negócio do admin (Fase 8, |
| `server/knowledgeEntities.js` | 148 | Grafo de entidades da RENATA — versão relacional (Fase 8, 2026-09-11, |
| `server/knowledgeFacts.js` | 451 | Memória de conhecimento em camadas da RENATA (Fase 7, 2026-09-11; |
| `server/knowledgeLibrary.js` | 404 | Biblioteca de conhecimento da RENATA (2026-10-27, pedido do Rafael: "um local para dar input de conhecimento — material sobre Produtor Rural antes e |
| `server/knowledgeLibraryRoutes.js` | 174 | Rotas da Biblioteca de conhecimento (2026-10-27, §116) — só master/pricetax; ver server/knowledgeLibrary.js. |
| `server/linkPreview.js` | 146 | Pré-visualização de links (título, descrição, imagem) — 2026-10-05, §78. O servidor busca a página, então a defesa é contra |
| `server/loginLimit.js` | 49 | Limite de tentativas de login (A2, 2026-10-29). Em memória: reinicia com o servidor, o que basta para barrar tentativa em série. |
| `server/macro.js` | 128 | Visão Macro (2026-08) — quadro de cronograma geral pra controle interno: |
| `server/materialText.js` | 152 | Biblioteca de conhecimento da RENATA (2026-10-27, §116): leitura de arquivos em texto e fatiamento em trechos. |
| `server/meetingEdit.js` | 172 | Correção de uma reunião já registrada pela API de conectividade (§116e, escopo `meetings_edit`). Função pura sobre o `data` do projeto: |
| `server/meetingEditsSchema.js` | 20 | Histórico das correções de reunião feitas pela API (§116e). O versionamento do cronograma (`project_versions`, §83) só enxerga atividades, fases e equipe — não reuniões —, |
| `server/meetingInbox.js` | 452 | Caixa de transcrições (2026-09, pedido do Rafael) — "eu e meus sócios e |
| `server/memoryIngest.js` | 222 | Ingestão/chunking da memória do projeto (2026-09, Fase 1 do |
| `server/memoryRetrieval.js` | 284 | Recuperação da memória do projeto (2026-09, Fases 1 e 3 do Assistente |
| `server/metrics.js` | 15 | Métricas mensuráveis da RENATA (Fase 7.1, 2026-09-11, pedido do |
| `server/notificationPrefs.js` | 51 | Quais notificações cada usuário quer ver (2026-10-06). Guardado por usuário em users.preferences.notifications |
| `server/notifications.js` | 38 | Central de Notificações (2026-08) — helper de escrita compartilhado entre |
| `server/officePreview.js` | 92 | Pré-visualização de texto de arquivos do Office abertos (docx, pptx, xlsx) — 2026-10-05, §78. Esses formatos são ZIPs de XML; |
| `server/opsIntel.js` | 274 |  |
| `server/parecerScope.js` | 46 | Isolamento de pareceres por cliente (2026-10-04, §70): um parecer "Cliente específico" só pode ser usado — no |
| `server/parecerStudy.js` | 542 | RENATA estuda os Pareceres PRICETAX (2026-10-04, pedido do Rafael) — ver PROJECT_CONTEXT.md §70. |
| `server/pareceres.js` | 249 | Pareceres PRICETAX (2026-09-17, ver PROJECT_CONTEXT.md §48) — repositório |
| `server/permissions.js` | 18 | Central de Conhecimento — helper de permissão (Fase 8, 2026-09-11). |
| `server/personalActivity.js` | 227 |  |
| `server/personalExtras.js` | 67 | Anotações rápidas e atalhos de cada pessoa na Gestão de Atividades (2026-10-16, visão 5). Ficam em users.preferences.personalExtras — e NÃO no |
| `server/projectAudit.js` | 47 | Quem fez cada gravação em `projects` (§83). O gatilho do banco só enxerga o SQL; aqui a identidade da requisição (AsyncLocalStorage, preenchida por requireAuth e pela API de |
| `server/projectVersions.js` | 194 | Histórico de versões do cronograma (§83): consultar, comparar, criar ponto de restauração, restaurar (com backup automático do estado atual) e recuperar empresa excluída. |
| `server/projectVersionsSchema.js` | 105 | Versionamento do cronograma (§83): tabela `project_versions` + gatilhos em `projects`. A captura mora no BANCO de propósito: `projects.data` é gravado inteiro por ~17 pontos do |
| `server/push.js` | 173 | Notificações push (2026-10-17). O sino já existia (tabela `notifications`); aqui cada notificação nova também vira um aviso no celular/computador de |
| `server/renata/agent.js` | 206 | Agente da RENATA (§101): interpreta o pedido, escolhe as ferramentas do catálogo, executa pelo executor (que valida, confere permissão, pede confirmação, |
| `server/renata/executor.js` | 188 | Executor de ferramentas da RENATA (§101). TODA operação passa por aqui: valida os parâmetros, checa permissão (as rotas do servidor decidem, em nome do |
| `server/renata/index.js` | 45 | Montagem da RENATA operacional (§101): catálogo de ferramentas + executor + agente + rotas. Módulo novo = um arquivo em tools/ registrado aqui. |
| `server/renata/internalAuth.js` | 28 | Entrada interna da RENATA (§101): as ferramentas dela chamam as MESMAS rotas que a tela chama, por loopback (127.0.0.1) dentro do próprio |
| `server/renata/internalCall.js` | 24 | Chamada interna (loopback) às rotas do próprio servidor, em nome de um usuário (§101). Devolve {status, json} — nunca lança por status HTTP: |
| `server/renata/policy.js` | 62 | Política de acesso da RENATA às rotas do servidor (§101): o que NUNCA é por ela (credenciais, usuários, permissões, links públicos, telemetria de pessoas), |
| `server/renata/registry.js` | 43 | Catálogo central de ferramentas da RENATA (§101). Cada ferramenta é uma operação estruturada: nome, módulo, descrição para a IA, esquema de parâmetros, |
| `server/renata/routes.js` | 111 | Rotas da RENATA operacional (/api/renata) — §101. Conversa (uma por pessoa, continua entre telas), confirmação/cancelamento de ações pendentes, histórico de |
| `server/renata/schema.js` | 63 | Tabelas da RENATA operacional (§101): conversa (continua entre telas e sessões) e registro de auditoria de TODA ação (inclusive recusas e |
| `server/renata/scriptedClient.js` | 33 | Modelo "roteirizado" SÓ para teste local (§101): em vez de chamar a IA, responde com o que um módulo .mjs decide a partir do estado da conversa. Serve para |
| `server/renata/tools/biblioteca.js` | 26 | Biblioteca de conhecimento (2026-10-27, §116): a RENATA operacional consulta os materiais que a equipe ensinou (somente leitura, só equipe PRICETAX). |
| `server/renata/tools/board.js` | 252 | Ferramentas da Gestão de Atividades (quadro pessoal) — §101. O quadro é um documento por usuário: a RENATA só mexe no quadro de QUEM PEDIU, na mesma estrutura |
| `server/renata/tools/crm.js` | 210 | Ferramentas do CRM (§101): TODAS as operações do CRM (empresas, contatos, negócios, atividades, notas, produtos, funis, cadências, tags) como ferramentas |
| `server/renata/tools/empresas.js` | 326 | Ferramentas de Empresas (cronogramas dos clientes) e tarefas de reunião — §101. Mesmo acesso da tela (canAccessProject) e, para alterar, só equipe (master/pricetax). |
| `server/renata/tools/plataforma.js` | 73 | Ferramentas de plataforma — §101: agenda, notificações, conhecimento, XFlow, pareceres/modelos e o ACESSO GENÉRICO às demais rotas do servidor (as mesmas da |
| `server/renata/tools/reports.js` | 66 | Relatórios e visão da equipe (somente leitura) — §101: "o que a minha equipe fez hoje", atrasos por responsável e quem sou eu / quem é a equipe. |
| `server/renata/validate.js` | 81 | Validador de parâmetros das ferramentas da RENATA (§101): subconjunto de JSON Schema suficiente para o catálogo. Rejeita campo desconhecido |
| `server/richNote.js` | 55 | Descrição formatada dos cartões do quadro pessoal (2026-10-07): o campo `desc` continua sendo uma string — texto simples |
| `server/routes.js` | 1409 |  |
| `server/scripts/reindexAllMeetings.js` | 30 | Backfill manual da memória do projeto (2026-09, Fase 1 do Assistente |
| `server/secretBox.js` | 30 | Cofre simples para segredos guardados no banco (M2, 2026-10-29): AES-256-GCM com chave derivada de TOKEN_ENC_KEY (ou, na falta, do JWT_SECRET). |
| `server/shareTokens.js` | 41 | Tokens de link público (A9, 2026-10-29). A tela gera o token com `crypto.getRandomValues` (48 hex = 192 bits), mas o servidor não pode confiar nisso: |
| `server/sourcemaps.js` | 61 | Tradução de pilhas de erro do navegador para o código-fonte, SÓ para o log (2026-10-16). O build gera os sourcemaps como "hidden" (vite.config.js): |
| `server/standardAudit.js` | 193 | Auditoria de uma empresa contra o padrão de cronograma (2026-10-19, pedido do Rafael: "um botão para realizar a auditoria e confrontar com o padrão e ver |
| `server/standardPlan.js` | 255 | Padrão de cronograma aprimorado (2026-10-15; plano em docs/PLANO_APRIMORAMENTO_CRONOGRAMA_PADRAO.md, aprovado pelo Rafael): descrições melhores, |
| `server/standardPlanApi.js` | 205 | Padrão de cronograma aprimorado — empresas que JÁ existem (2026-10-15; docs/PLANO_APRIMORAMENTO_CRONOGRAMA_PADRAO.md). Prévia por empresa (equipe PRICETAX) |
| `server/standardTemplate.js` | 278 | Cronograma padrão versionado (2026-10-19; pedido do Rafael): funções PURAS (sem banco) que montam as versões iniciais, sanitizam o que o cliente envia, |
| `server/standardTemplateStore.js` | 190 | Banco do cronograma padrão versionado (2026-10-19). Por organização: versões imutáveis (1.0, 2.0, 3.0…) e um rascunho compartilhado. |
| `server/taskLinkBackfill.js` | 270 | Vínculo tarefa → atividade para os registros que JÁ EXISTEM na base (pedido do Rafael, 2026-10-13: "funcione já para reuniões, para |
| `server/taskLinkLearn.js` | 117 | Aprendizado do vínculo tarefa → atividade (Fase 3 do plano, 2026-10-13; docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md). A matéria-prima é o |
| `server/taskLinkSuggest.js` | 166 | Sugestão da atividade do cronograma para cada tarefa que sai de uma transcrição (Fase 2 do plano, 2026-10-13; |
| `server/taskLinks.js` | 271 | Vínculo tarefa de reunião → atividade do cronograma (plano em docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md, Fase 1, 2026-10-13). |
| `server/todoNotifications.js` | 109 | Notificações das TAREFAS DE REUNIÃO (Onda 5, §81): atribuída, comentada e vencida. As tarefas vivem dentro do JSON do |
| `server/usageLog.js` | 103 | Rastreador de uso (Central de Inteligência Operacional). Recebe fatias de tempo do app: quanto tempo a aba ficou visível |
| `server/usagePolicy.js` | 32 | Transparência e finalidade (LGPD): texto único, exibido a toda a equipe (Meu perfil) e à liderança (Central). |
| `server/widget.js` | 120 | Widget do iPhone (Scriptable) — 2026-10-05, §76. O widget não faz login: usa um token secreto, só de leitura, |
| `server/widgetSummary.js` | 120 | Resumo para o widget do iPhone (2026-10-05, §76). Funções puras: recebem o JSON do quadro pessoal, |
| `server/xflow.js` | 877 |  |
| `server/xflowPermissions.js` | 86 | Papel efetivo + regras de "quem pode fazer o quê" no XFlow. Regras vivem |
| `server/xflowTransitions.js` | 116 | Matriz de transições de status do XFlow. Cada ação nomeada sabe de quais |

## `shared/` — 11 arquivos

| Arquivo | Linhas | O que é |
|---|---|---|
| `shared/calendarDays.js` | 62 | Reuniões no cronograma e dias de agenda (2026-10-19, regra do Rafael): ATIVIDADE e SUBATIVIDADE têm tipo — 'reuniao' (call, precisa de gente junto ao mesmo tempo) ou 'trabalho' (padrão). |
| `shared/cronogramaPadrao.js` | 2336 | Fonte das atividades da versão 2.0 do cronograma padrão (2026-10-19): as 87 ações do guia "Reforma Tributária 2027 · Guia por área" (texto limpo de casos de cliente), |
| `shared/cronogramaPadraoV3.js` | 166 | Proposta v3 do cronograma padrão (2026-10-19): 91 itens em 22 atividades principais, em duas trilhas (A diagnóstico, B implementação). TODAS as datas contam do início do projeto |
| `shared/cronogramaPadraoV4.js` | 293 | Proposta v4 do cronograma padrão — "modelo ideal do comitê de reforma tributária" (2026-10-19, decidido com o Rafael em telas de validação; ver PROJECT_CONTEXT §65). |
| `shared/experienceFlows.js` | 25 | Fluxos que medimos para saber se o produto está ajudando (§97). Medimos o PRODUTO (fluxo, resultado, duração, erro), nunca a pessoa: |
| `shared/linkSync.js` | 231 | Sincronia de conclusão entre tarefa de reunião e atividade do cronograma (2026-10-19, pedido do Rafael: "uma vez que está vinculado e validado pelo usuário, concluiu em um, mata em outro"). |
| `shared/pauta.js` | 124 | "Pauta da reunião" (2026-10-20, pedido do Rafael): um item de TRABALHO que será tratado numa reunião (subatividade do tipo Reunião da mesma atividade) fica vinculado a ela |
| `shared/period.js` | 25 | "A atividade estica sozinha" (2026-10-20, pedido do Rafael após auditoria da ALCAST): quando a data de uma subatividade muda (ou entra subatividade nova) e cai fora do período |
| `shared/scheduleVersion.js` | 246 | Versionamento do cronograma (2026-10-25, §83). Funções PURAS (sem banco, sem rede): usadas pelo servidor (comparar, restaurar, validar) e testadas à parte. |
| `shared/transcriptParser.js` | 84 | Funções puras de parsing de texto de reunião — SEM import de React, |
| `shared/usageMetrics.js` | 214 | Núcleo de cálculo da Central de Inteligência Operacional. Funções PURAS (sem banco, sem relógio global), testadas em |

## `src/` — 184 arquivos

| Arquivo | Linhas | O que é |
|---|---|---|
| `src/App.jsx` | 3649 |  |
| `src/agenda/Agenda.jsx` | 583 | Agenda (2026-08, pedido do Rafael) — junta o Google Calendar conectado |
| `src/agenda/NewEventModal.jsx` | 225 | "Novo compromisso" da Agenda (Onda 5, §81). Cria no Google Calendar da pessoa (POST /api/agenda/events); |
| `src/agenda/RenataAgendaBriefing.jsx` | 708 | Painel da RENATA na tela inicial (2026-09-20). Logo após o login, quem conectou o Google |
| `src/agenda/RsvpButtons.jsx` | 28 | Aceitar / Talvez / Recusar — botões compactos; a resposta atual aparece marcada (aria-pressed). |
| `src/agenda/agenda.css` | 93 | Agenda no celular (Onda 6, §81). Desktop idêntico ao de antes; tudo que muda está sob @media (max-width: 767px). |
| `src/agenda/agendaActions.js` | 48 | Ações da Agenda (Onda 5, §81): responder convite do Google e criar compromisso. Sem JSX; o servidor é |
| `src/agenda/agendaPrefs.js` | 59 | Preferências pessoais da leitura da agenda (2026-09-20, pedido do Rafael): o EXPEDIENTE (padrão 08:00–18:00) |
| `src/agenda/dayLoad.js` | 186 | Leitura da agenda (2026-09-20, pedido do Rafael): deixar claro o que ele ACEITOU, o que está |
| `src/app/companyActivityActions.js` | 361 | Ações sobre as atividades de uma empresa (criar, editar, excluir, subatividades, anexos, comentários, links e participantes). |
| `src/app/companyAdminActions.js` | 161 | Ações de administração de empresas (criar, criar grupo, clonar, excluir e editar campos). |
| `src/app/meetingActions.js` | 402 | Ações sobre reuniões e tarefas de reunião (criar/editar, compartilhar, participantes, tarefas, vínculo com atividade, subtarefas, comentários e anexos). |
| `src/app/notificationActions.js` | 117 | Ações das notificações (marcar como lida e abrir o destino de uma notificação). |
| `src/app/standardPlanActions.js` | 98 | Ações do cronograma padrão versionado (2026-10-19). É uma FÁBRICA chamada a cada render (mesmo padrão de src/app/*.js): abrir/fechar a edição do padrão, |
| `src/app/teamPhaseActions.js` | 116 | Ações do time, das áreas e das fases de uma empresa. |
| `src/app/userOrgActions.js` | 195 | Ações de administração de usuários e organizações. |
| `src/assistant/ChatExport.jsx` | 129 | Botões de copiar e exportar a conversa da RENATA (2026-10-27) — usados pelas três telas (do projeto, geral e operacional). |
| `src/assistant/ParecerStudyModal.jsx` | 193 |  |
| `src/assistant/ProjectAssistant.jsx` | 560 | RENATA — Assistente do Projeto (2026-09, Fase 2 do Assistente |
| `src/assistant/RenataHome.jsx` | 161 | RENATA geral (2026-10-06): o painel de conversa disponível de QUALQUER tela (botão na barra do topo e item "Falar com a RENATA" na |
| `src/assistant/chatExport.js` | 131 | Copiar e exportar conversas da RENATA (2026-10-27). Funções PURAS (sem React/DOM) para testar em Node. |
| `src/companies/CompanyOwners.jsx` | 195 | Responsáveis por empresa (2026-10-09, pedido do Rafael): cada empresa tem um responsável PRINCIPAL e pode ter outros da equipe |
| `src/connect/ConnectSection.jsx` | 191 |  |
| `src/connect/guide.js` | 119 | Guia que o usuário cola na OUTRA janela do Claude Code (2026-10-05, §80). Não leva o token: ele vai pela variável de ambiente |
| `src/crm/ActivityForm.jsx` | 128 | Cadastro/edição de atividade (estado local + Salvar). A empresa é sempre |
| `src/crm/ActivityList.jsx` | 139 | Lista de atividades reutilizável (Agenda, ficha da empresa, ficha do negócio). |
| `src/crm/AgendaPage.jsx` | 92 | Agenda do CRM (PRD 16/17): o que cada pessoa precisa fazer, por urgência. |
| `src/crm/BootstrapDialog.jsx` | 81 | Traz pro CRM os clientes que já existem no painel (projetos do cronograma). |
| `src/crm/CadenceEditor.jsx` | 76 | Cadência de follow-up por etapa do funil (§93): ao entrar na etapa agenda o 1º passo; ao concluir um passo agenda o seguinte. |
| `src/crm/CloseDealDialog.jsx` | 70 | Fechar um negócio (ganhar/perder) ou movê-lo pra qualquer etapa pelo quadro. |
| `src/crm/CompaniesPage.jsx` | 99 | Lista de empresas (PRD 7) — filtros, busca, paginação. Clique abre a ficha. |
| `src/crm/CompanyDrawer.jsx` | 417 | Ficha 360º da empresa (PRD 8/9/11). Fase 1: Visão Geral, Contatos (com o |
| `src/crm/CompanyForm.jsx` | 194 | Cadastro/edição de empresa. Estado local do formulário + botão Salvar (nada |
| `src/crm/ContactForm.jsx` | 118 | Cadastro/edição de contato (estado local + Salvar). Sem empresa definida, o |
| `src/crm/ContactLinks.jsx` | 21 | Telefone, WhatsApp e e-mail do contato como links de um toque (ligar, abrir conversa, escrever). Não propaga o clique (serve dentro de cartão clicável). |
| `src/crm/ContactsPage.jsx` | 74 | Lista de contatos (PRD 10). Papel na decisão e força do relacionamento à vista. |
| `src/crm/CrmScreen.jsx` | 138 | CRM PRICETAX — shell do módulo (Fases 1-3, 2026-09-20, PROJECT_CONTEXT.md §54/§55/§56). |
| `src/crm/DealDrawer.jsx` | 307 | Ficha do negócio (drawer). Resumo (valor, probabilidade, produtos), Histórico |
| `src/crm/DealForm.jsx` | 342 | Cadastro/edição de negócio (estado local + Salvar). A empresa é sempre |
| `src/crm/DealImportWizard.jsx` | 207 | Importar negócios de planilha (feito pro export "Oportunidades" do PipeRun). Arquivo → colunas → |
| `src/crm/DealTags.jsx` | 38 | Tags do negócio (vindas do PipeRun ou criadas aqui): chips com remoção e um campo que sugere as tags já existentes. |
| `src/crm/DealsPage.jsx` | 520 | Negócios (PRD 12/13): quadro Kanban por etapa + lista. Arrastar o cartão move |
| `src/crm/FollowUpQueue.jsx` | 142 | Fila de follow-ups (§93): uma atividade por vez, da mais atrasada para a mais nova, com o contato a um toque (ligar / WhatsApp), |
| `src/crm/FunnelsAdmin.jsx` | 161 | Configuração de funis e etapas (gestor+). A empresa pode ter vários funis (ex.: Empresas, |
| `src/crm/GlobalSearch.jsx` | 59 | Busca global do CRM (PRD 38) — Fase 1: empresas e contatos. |
| `src/crm/ImportWizard.jsx` | 174 | Importação de planilha Excel/CSV (PRD 48): arquivo -> mapeamento de colunas |
| `src/crm/InlineCells.jsx` | 48 | Edição direta na célula (§94): clicar e digitar/escolher salva na hora, sem abrir formulário. Esc cancela. Não propaga o clique (a linha abre a ficha). |
| `src/crm/OverviewLenses.jsx` | 250 | Painéis da Visão geral por função (§98): Meu dia, Time, Receita e Contas. Só números e listas que levam a uma ação; |
| `src/crm/OverviewPage.jsx` | 90 | Visão Geral do CRM por função (§98). Cada pessoa abre no painel do seu perfil — Meu dia (vendedor/consultor), |
| `src/crm/PipeRunMigration.jsx` | 254 | Migração PipeRun → CRM (§84). Só o administrador do CRM. Quatro etapas: Extrair (API, só leitura) › Revisar (prévia, nada gravado) › Importar › Conferir (relatório de divergências). |
| `src/crm/ProductsPage.jsx` | 117 | Catálogo de produtos/serviços (PRD 14). Todos veem; gestor+ mantém. Produto que |
| `src/crm/RenataAsk.jsx` | 40 | "Perguntar à RENATA" nas fichas do CRM (Onda 5, §81). A RENATA é por PROJETO do cronograma (ProjectAssistant), |
| `src/crm/SavedViews.jsx` | 101 | Visões salvas de Negócios (§98): atalhos para uma combinação de filtros + modo (quadro/lista). |
| `src/crm/TagFilter.jsx` | 71 | Filtro por VÁRIAS tags (o negócio precisa ter todas) — 2026-10-26. O valor é o texto "tag1\|tag2" (mesmo formato do servidor e das visões salvas). |
| `src/crm/boardMove.js` | 48 | Mover um negócio de etapa NA TELA, antes de o servidor responder (2026-10-27, §119). O quadro do funil é um objeto |
| `src/crm/crmApi.js` | 94 | Cliente da API do CRM (/api/crm) — Fase 1. Só monta URL/corpo; regra de |
| `src/crm/crmMeta.js` | 440 | Rótulos, formatadores e CSS do CRM (Fase 1, 2026-09-20). Cor só indica |
| `src/crm/importMapping.js` | 51 | Reconhecimento automático das colunas da planilha (Import Wizard). Módulo puro, |
| `src/crm/ui.jsx` | 143 | Peças de UI compartilhadas do CRM. |
| `src/daily/DailyCards.jsx` | 254 |  |
| `src/daily/DailyPrefs.jsx` | 69 |  |
| `src/daily/WelcomeSetup.jsx` | 109 |  |
| `src/daily/useWelcomeSetup.jsx` | 20 | As boas-vindas aparecem por cima de QUALQUER tela (o App tem dezenas de retornos por módulo), então vivem numa raiz |
| `src/knowledge/ConflictsTab.jsx` | 118 | Aba Conflitos (Fase 8, item 6 do pedido do Rafael) — pares lado a |
| `src/knowledge/EntitiesTab.jsx` | 89 | Aba Pessoas/Empresas (Fase 8, item 7 do pedido do Rafael) — lista + |
| `src/knowledge/FactDrawer.jsx` | 219 | Card/drawer detalhado de um conhecimento (Fase 8, 2026-09-11, item 4 |
| `src/knowledge/KnowledgeCenter.jsx` | 195 | Central de Conhecimento — "o cérebro da RENATA" (Fase 8, 2026-09-11, |
| `src/knowledge/LibraryTab.jsx` | 380 | Aba Biblioteca da Central de Conhecimento (2026-10-27, §116): onde a equipe ENSINA a RENATA com material próprio (PDF, Word, PowerPoint, Excel, texto). |
| `src/knowledge/LinksTab.jsx` | 221 | Aba "Tarefas × atividades" da Central de Conhecimento (Fase 4 do plano, 2026-10-13; docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md): |
| `src/knowledge/MemoriesTab.jsx` | 105 | Aba Memórias (Fase 8, item 3 do pedido do Rafael) — busca real |
| `src/knowledge/MetricsTab.jsx` | 115 | Aba Métricas (Fase 8, item 11 do pedido do Rafael) — números limpos |
| `src/knowledge/PendingLinks.jsx` | 171 | "Registros que já estão na base" (2026-10-13, pedido do Rafael): varredura das tarefas de reunião antigas + revisão central das |
| `src/knowledge/knowledgeMeta.js` | 135 | Rótulos/cores compartilhados entre as abas da Central de Conhecimento |
| `src/lib/api.js` | 78 | Mensagem em português claro para cada tipo de falha (§96): o que houve e o que a pessoa pode fazer. O servidor já manda mensagem boa nos |
| `src/lib/autoDates.js` | 26 | "Ajustar datas automaticamente" (2026-10-19): liga/desliga POR EMPRESA e por pessoa (neste navegador). Fica fora do projeto de propósito: é uma preferência de |
| `src/lib/clientError.js` | 81 | Registro de erros do navegador no log do servidor (Railway). Duas origens: |
| `src/lib/dateRipple.js` | 89 | Ajuste automático de datas (2026-10-19, pedido do Rafael: "se a caixinha estiver marcada e eu mudar o kickoff de 7 para 10, o fiscal que começava dia 8 vai para dia 11"). |
| `src/lib/dates.js` | 16 | Dias de CALENDÁRIO entre um momento e agora, no fuso local (2026-10-05). Antes o app contava blocos de 24 h |
| `src/lib/experience.js` | 51 | Medição de experiência (§97): fluxo, resultado e duração — nunca conteúdo, mouse nem tempo de tela; só a equipe é medida (decide o servidor). |
| `src/lib/lazyRetry.jsx` | 22 | Carregamento sob demanda das telas pesadas (code-splitting, 2026-10-16). `lazyRetry` é um React.lazy que, se o pedaço (chunk) não puder ser |
| `src/lib/nav.js` | 168 | Navegação por teclado e pelo botão Voltar do navegador (Onda 1, §81). Módulo puro de React, sem dependência do App. |
| `src/lib/notifPrefs.js` | 60 | Quais categorias de notificação o usuário quer ver (2026-10-06). Estado único do app (sino, painel Hoje) e salvo |
| `src/lib/push.js` | 56 | Notificações push no navegador (2026-10-17): ativar/desativar neste aparelho e enviar um teste. Nada daqui roda sozinho: o pedido de permissão só |
| `src/lib/pushPayload.js` | 32 | Funções puras do aviso push (2026-10-17), usadas pelo service worker (src/sw.js) e testáveis em Node. |
| `src/lib/recents.js` | 84 | Recentes, favoritos e "onde eu parei" (Onda 5, §81). Tudo por PESSOA, no localStorage do navegador (chave com o id do |
| `src/lib/richNote.js` | 31 | Descrição formatada do cartão (2026-10-07): a string é texto simples (cartões antigos) ou HTML curto do editor — quem diz |
| `src/lib/routes.js` | 69 | Endereços de cada módulo (2026-10-05, pedido do Rafael: "não consigo favoritar direto minha Gestão de |
| `src/lib/saveRetry.js` | 18 | Retentativa automática de gravação (2026-10-27, §118): quando o salvamento falha por causa de rede ou do servidor, a edição fica na |
| `src/lib/saveState.js` | 71 | Estado global de gravação (Onda 4, §81): "Salvando… / Salvo / Não foi possível salvar — tentar de novo" em UM lugar só. |
| `src/lib/screenSearch.js` | 60 | Busca da tela aberta da empresa (2026-10-19, pedido do Rafael): um campo no cabeçalho que filtra SÓ a aba que está aberta (Resumo, Reuniões, Tarefas, Gantt, Tabela, Fases, Quadro, Mapa). |
| `src/lib/statusOrder.js` | 3 | Ordem dos status de uma atividade de empresa. Fica fora do App.jsx para o objeto de estilos (src/styles/S.js) poder usar sem importar o App. |
| `src/lib/stdPlan.js` | 4 | Cronograma padrão versionado (2026-10-19): o padrão é editado na tela de empresa, como um "projeto" de id fixo que só existe na tela enquanto está aberto. |
| `src/lib/subStats.js` | 12 | Números de uma atividade para o velocímetro (2026-10-19): subatividades concluídas (feitas), puladas e quantas faltam. "Pulada" é uma subatividade marcada como |
| `src/lib/usageTracker.js` | 82 | Rastreador de uso do app (Central de Inteligência Operacional). Conta, a cada 15 s, se a aba está visível (conectado) e se |
| `src/lib/useAutosave.js` | 69 | Autosave de um valor inteiro (Onda 4, §81): preferências, visões, avatar… Regra única do app: campo sempre editável, grava |
| `src/lib/xlsxLoader.js` | 3 | A biblioteca de planilhas (xlsx, ~280 KB) só é baixada quando alguém exporta para Excel — antes entrava no pacote principal de todo mundo. |
| `src/macro/Gaps.jsx` | 155 | Lacunas entre cronogramas (Etapa 4 do plano, 2026-10-08): o que as outras empresas têm de "atividade-padrão" e este cronograma não. |
| `src/macro/Inventory.jsx` | 452 | Levantamento (2026-10-07, Etapa 1 de docs/PLANO_RENATA_CONSULTAS_GERAIS.md) — todas as atividades de todas as empresas |
| `src/macro/MacroOverview.jsx` | 311 | Visão Geral (antes "Visão Macro"; 2026-08, pedido do Rafael) — quadro de cronograma geral pra |
| `src/macro/StandardAudit.jsx` | 250 | Auditoria de uma empresa contra o padrão de cronograma (2026-10-19). Botão "Auditoria" no cabeçalho da empresa (equipe PRICETAX). SOMENTE LEITURA: mostra |
| `src/macro/StandardPlan.jsx` | 115 | Aba "Padrão" da Visão Geral (2026-10-15): aplica nas empresas que já existem o padrão de cronograma aprimorado (descrições melhores, subatividades e as |
| `src/macro/StandardPlanBar.jsx` | 226 | Faixa do cronograma padrão (2026-10-19), no alto da tela de empresa quando o que está aberto é o padrão: versão atual, estado do rascunho, kickoff de referência, |
| `src/macro/macro.css` | 172 | Visão Geral no celular (Onda 6, §81). Desktop idêntico ao de antes; o que muda está sob @media (max-width: 767px): |
| `src/main.jsx` | 21 |  |
| `src/meetings/ActivityLink.jsx` | 300 | Vínculo tarefa de reunião → atividade do cronograma (Fase 1 do plano, 2026-10-13; docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md). |
| `src/meetings/ActivityRow.jsx` | 186 | Linha de atividade (item de TO_DO) — extraído de TodoBoard.jsx pra ser |
| `src/meetings/DossierPanel.jsx` | 260 | Dossiê do cliente (2026-10-02, ver PROJECT_CONTEXT.md §63) — tela com o compilado de TODAS as |
| `src/meetings/LinkedTasks.jsx` | 72 | Lista "Tarefas de reunião vinculadas" no detalhe da atividade (2026-10-16). Só LÊ `actionItems[].activityId` (mesma fonte do chip |
| `src/meetings/MeetingDetail.jsx` | 639 | Tela de detalhe de uma Reunião — redesign 2026-09 ("AI Meeting |
| `src/meetings/Meetings.jsx` | 385 | Reuniões (2026-09, pedido do Rafael) — central de acompanhamento de |
| `src/meetings/ParecerAdviceBox.jsx` | 145 |  |
| `src/meetings/TodoBoard.jsx` | 594 | Aba "Atividades" (ex-"TO DO", redesign 2026-09 — "Centro de Execução") |
| `src/meetings/TodoDrawer.jsx` | 322 | Painel lateral de detalhe de uma atividade (2026-09, redesign "Centro de |
| `src/meetings/TranscriptView.jsx` | 228 | Card "Transcrição da reunião" — 3 modos de leitura (Completa/Por |
| `src/meetings/dossierExport.js` | 119 | Exportação do Dossiê do cliente (2026-10-02, ver PROJECT_CONTEXT.md §63) — funções PURAS (sem |
| `src/meetings/meetingUtils.js` | 61 | Utilitários puros pra tela de detalhe de Reunião (2026-09, redesign |
| `src/meetings/meetingsCss.js` | 32 | CSS compartilhado das telas de reunião (Meetings.jsx e TodoBoard.jsx) — arquivo sem dependências para o TodoBoard não puxar `Meetings.jsx` (2026-10-17, §65). |
| `src/meetings/todoStatus.js` | 18 | Status do TO_DO da reunião — arquivo pequeno e sem dependências para ser importado de qualquer lugar sem arrastar `Meetings.jsx` (2026-10-17, §65). |
| `src/meetings/todoUtils.js` | 56 | Utilitários pequenos e sem estado, compartilhados entre TodoBoard.jsx e |
| `src/modelos/Modelos.jsx` | 659 | Modelos de documentos (2026-10-05, §78) — aba irmã dos Pareceres: biblioteca de modelos para sócios e colaboradores. Um modelo |
| `src/modelos/modelosMeta.js` | 124 | Modelos de documentos (2026-10-05, §78) — tipos, ícones e CSS próprio do módulo (prefixo mdl-, em cima do par- dos Pareceres). |
| `src/opsintel/AccessMap.jsx` | 43 | Mapa interativo dos acessos. Cada ponto é o CENTRO DA CIDADE informado pelo IP (aproximado), com um círculo de margem de |
| `src/opsintel/OpsIntelScreen.jsx` | 403 |  |
| `src/opsintel/PrivacyNotice.jsx` | 31 | Transparência (LGPD): qualquer pessoa logada lê o que o app mede sobre o uso, para quê, quem vê e por quanto tempo. |
| `src/opsintel/charts.jsx` | 102 | Gráficos em SVG/CSS puro (sem biblioteca): leves, imprimíveis e no tema do app. Cores via variáveis do tema. |
| `src/pareceres/ModulePanel.jsx` | 30 | Gaveta lateral dos módulos Conhecimento/Pareceres/Modelos: mesma aparência do SidePanel do App, mas acessível |
| `src/pareceres/Pareceres.jsx` | 618 | Pareceres PRICETAX (2026-09-17, ver PROJECT_CONTEXT.md §48) — repositório |
| `src/pareceres/pareceresMeta.js` | 157 | Pareceres PRICETAX (2026-09-17, ver PROJECT_CONTEXT.md §48) — CSS do |
| `src/pdf/PdfExportModal.jsx` | 74 | Janela "Exportar PDF": tema escuro ou claro, orientação e o que entra no relatório. |
| `src/pdf/PrintReport.jsx` | 345 | Relatório do cronograma para PDF (window.print). Fica display:none na tela e só aparece em @media print. |
| `src/pdf/pdfTheme.js` | 105 | Tema, opções e CSS de página dos PDFs (relatório do cronograma, reunião e dossiê). |
| `src/personal/BoardHistory.jsx` | 144 |  |
| `src/personal/DaySummary.jsx` | 165 | "Resumo do dia" no topo da Gestão de Atividades (2026-10-16, melhoria visual 3 do pedido do Rafael; inspirado no mockup "Mesa de Trabalho"). Faixa |
| `src/personal/FocusScreen.jsx` | 250 |  |
| `src/personal/PersonalStats.jsx` | 321 |  |
| `src/personal/QuickBits.jsx` | 121 | Atalhos de uso do quadro pessoal (2026-10-16, melhorias visuais 1 e 2 do pedido do Rafael): botão global "Nova atividade" com a tecla N e |
| `src/personal/Waiting.jsx` | 84 | Marcador "Aguardando" do cartão (2026-10-16, visão 4 do pedido do Rafael): a atividade está parada esperando alguém (cliente, fornecedor, outro |
| `src/personal/Workbench.jsx` | 361 | Painel "Calendário, anotações e atalhos" da Gestão de Atividades (2026-10-16, visões 5 e 6 do pedido do Rafael; inspirado no mockup "Mesa de |
| `src/personal/boardAttention.js` | 43 | O que o quadro pessoal (Gestão de Atividades) tem de urgente hoje — usado pela RENATA da tela inicial |
| `src/personal/boardHistory.js` | 70 | Histórico do quadro pessoal (2026-10-29): compara uma foto antiga do quadro com o quadro de hoje e recoloca cartões. Funções puras, |
| `src/personal/boardMerge.js` | 153 | Fusão de três vias do quadro pessoal (2026-10-27, §117). O painel grava o quadro INTEIRO; com duas abas (ou duas pessoas) abertas, a |
| `src/personal/dailyExport.js` | 118 | Daily do Meu quadro (2026-10-26): filtro por prazo e exportação (Excel e PDF). Funções PURAS (sem React/DOM) para testar em Node. |
| `src/personal/focus.js` | 140 | Foco de hoje (2026-10-29): tela para deixar aberta no iPad. Separa o que está em andamento (Agora), o que vence no dia (Próximos) |
| `src/personal/workbenchUtils.js` | 81 | Funções puras do painel "Calendário, anotações e atalhos" (2026-10-16, visões 5 e 6). Sem React/DOM para poder testar em Node. |
| `src/renata/RenataChat.jsx` | 285 | RENATA operacional (§101): o painel de conversa disponível em qualquer tela. Você pede, ela executa pelas ferramentas do sistema (com as suas permissões), |
| `src/renata/screenContext.js` | 12 | Contexto da tela para a RENATA (§101): cada módulo informa onde a pessoa está (módulo, tela, registro aberto) e a RENATA recebe isso a cada pedido, para entender |
| `src/screens/ActivityGauge.jsx` | 50 | Velocímetro da atividade (2026-10-19, pedido do Rafael): no detalhe de cada atividade, quanto das subatividades está feito, quanto foi pulado e quanto falta para |
| `src/screens/AdminScreens.jsx` | 1525 | Telas de administração: gestão de usuários, organizações (Super Admin), escolha/cadastro de empresas e perfil. |
| `src/screens/AutoDates.jsx` | 42 | Caixa "Ajustar datas automaticamente" (2026-10-19): fica no alto das vistas de atividades de uma empresa (e do cronograma padrão). Ligada, mudar uma data empurra as |
| `src/screens/CompanyCalendar.jsx` | 181 | Janela "Reservar na agenda" (2026-10-19): cada REUNIÃO do cronograma (atividade ou subatividade do tipo Reunião) vira UM bloco de agenda (padrão 60 min) para a equipe PRICETAX, com convite … |
| `src/screens/CompanyShareLink.jsx` | 116 | Janela "Link para o cliente" (2026-10-19): gera, copia e desativa os links públicos da empresa. Só master e PRICETAX. |
| `src/screens/CompanyTriage.jsx` | 509 | Aba "Triagem" (2026-10-20, pedido do Rafael, a partir do painel de classificação que usou na ALCAST): para cada atividade ("reunião mestre" ou frente) e cada subatividade, |
| `src/screens/CompanyViews.jsx` | 2140 | Vistas de uma empresa: Resumo, Tabela, Fases, Quadro (kanban), Gantt/linha do tempo, impressão e detalhe da atividade. |
| `src/screens/CompanyWorkspace.jsx` | 910 | Área de trabalho de uma empresa (cabeçalho, abas, vistas, modais e relatório de impressão). |
| `src/screens/MapView.jsx` | 529 | Aba MAPA (2026-10-19, pedido do Rafael; nome final "Mapa", antes "Árvore"): mapa mental do cronograma de UMA empresa — empresa → grupos (fase, responsável ou situação) → atividades → |
| `src/screens/PautaPicker.jsx` | 51 | Janela "Vincular itens à reunião" (2026-10-20): escolhe itens de trabalho de QUALQUER atividade (os "outros squads") para entrarem na pauta de uma reunião. |
| `src/screens/PersonalBoard.jsx` | 2943 | Gestão de Atividades (quadro pessoal): quadro, colunas, cartões, lista, quadro público e painéis. |
| `src/screens/PublicCompanyScreen.jsx` | 423 | Página pública de acompanhamento da empresa (2026-10-19): /acompanhamento/<token>. Só leitura, sem login; "Entrar para editar" leva ao login normal. |
| `src/screens/ScreenSearch.jsx` | 48 | Busca da tela aberta (2026-10-19): campo na barra de abas da empresa e aviso "filtrando" no topo do conteúdo. A lógica de casar texto fica em src/lib/screenSearch.js. |
| `src/screens/SubExtras.jsx` | 214 | Campos novos das subatividades (2026-10-19, fase 2 do plano do cronograma funcional): prioridade, executor, áreas envolvidas, aplicabilidade, recorrência, |
| `src/shell/CommandPalette.jsx` | 160 | Busca global (Ctrl/Cmd+K): pula para um módulo, uma empresa, uma atividade ou uma reunião. Onda 1, §81. |
| `src/shell/ModuleShell.jsx` | 173 | Casca única (Onda 1, §81): a MESMA barra no topo de todas as telas depois do login. |
| `src/shell/NotificationPrefs.jsx` | 115 | Escolher quais notificações ver (2026-10-06). Marcado = aparece; desmarcado = fica escondido (nada é apagado). |
| `src/styles/S.js` | 452 | Objeto de estilos compartilhado (inline styles do app). Extraído de src/App.jsx em 2026-10-17 ("dividir o AppScreens e o S"); o App.jsx continua |
| `src/sw.js` | 85 | Service worker do PRICETAX (2026-10-17, PWA). Objetivo: o app ser instalável e abrir a casca mesmo sem rede. |
| `src/today/ContinueStrip.jsx` | 47 | "Continuar de onde parou" (Onda 5, §81): até 4 itens recentes (empresa, atividade, reunião, módulo) clicáveis na tela |
| `src/today/TodayPanel.jsx` | 223 | "Hoje" da tela inicial (Onda 5, §81): o que está atrasado, o que vence hoje, as reuniões de hoje/amanhã e as notificações |
| `src/today/WeekSummary.jsx` | 73 | "Sua semana" na tela inicial (Onda 5, §81): 3–4 números dos últimos 7 dias, vindos do mesmo endpoint dos Indicadores do |
| `src/today/boardActions.js` | 70 | Ações do "Hoje" sobre o quadro pessoal (Onda 5, §81). Funções PURAS: recebem o JSON do quadro e devolvem o novo JSON, |
| `src/today/todayItems.js` | 111 | "Hoje" da tela inicial (Onda 5, §81): junta num lugar só o que está atrasado ou vence hoje para UMA pessoa. |
| `src/ui/ComposeBox.jsx` | 386 | ComposeBox + CommentThread (Onda 3, §81): o MESMO gesto de comentar / linkar / anexar / colar print em todo módulo. |
| `src/ui/CsatHost.jsx` | 44 | Pedido de nota de 1 clique (§97), fora do caminho: cartão pequeno no canto, nunca modal, sem bloquear nada. "Agora não" também conta |
| `src/ui/DateTimeFields.jsx` | 172 | Campos de data e horário (2026-10-26): substituem <input type="date"/"time"> nativos, cujo calendário abre cortado dentro de janelas com rolagem. |
| `src/ui/RichNote.jsx` | 100 | Campo de texto formatado e compacto (2026-10-07): começa com poucas linhas, cresce enquanto se escreve e só mostra a barra |
| `src/ui/SafeBoundary.jsx` | 76 | Limite de erro (error boundary) do app (2026-10-16). Sem ele, qualquer falha ao desenhar uma tela deixa o app INTEIRO em branco. Três formas: |
| `src/ui/datetime.css` | 47 | Campos de data e horário (DateTimeFields.jsx). Usa as variáveis de tema do app (claro/escuro) e o amarelo da marca. */ |
| `src/ui/dialog.jsx` | 49 | Modal/gaveta acessível (Onda 1, §81): troque `<div ... onClick={fechar}>` do overlay por <DialogOverlay onClose={fechar} ...>. |
| `src/ui/dialogs.jsx` | 130 | Diálogos e avisos globais (Onda 2, §81) — o jeito único de confirmar, pedir um texto e avisar. |
| `src/ui/index.jsx` | 278 | Peças visuais comuns (2026-10-04, §72) — ver ui.css. Só apresentação: nenhuma lógica de negócio aqui, quem usa |
| `src/ui/ui.css` | 266 | Peças visuais comuns do app (2026-10-04, §72). Antes cada módulo reinventava cartão, aba, etiqueta e botão |
| `src/versions/VersionHistory.jsx` | 341 | Histórico de versões do cronograma (§83): consultar, comparar, criar ponto de restauração e restaurar (Master) com confirmação, backup automático e desfazer. |
| `src/widget/WidgetSection.jsx` | 196 |  |
| `src/widget/scriptableScript.js` | 190 | Script do Scriptable (iOS) colado pelo usuário — mostra atrasadas, vencem hoje e próxima reunião. |
| `src/xflow/XFlow.jsx` | 3394 |  |
