# Índice do PROJECT_CONTEXT.md (gerado)

> Gerado automaticamente por `scripts/docs-gen.mjs` a partir do código. **Não edite à mão** — rode `npm run docs:gerar`.

O `PROJECT_CONTEXT.md` tem 8579 linhas (a memória cronológica de cada decisão e bug). **Não leia inteiro**: ache a seção aqui e leia só o trecho (`Read` com `offset`/`limit`).

| Linha | Seção | Primeira frase |
|---|---|---|
| 1 | PROJECT_CONTEXT.md — Memória técnica oficial (PRICETAX Cronograma) | > Leia este arquivo primeiro, antes de qualquer exploração. Ele existe pra |
| 17 | 0. O produto hoje, em uma página (2026-10-05) | O painel (painel.pricetax.com.br) virou o ecossistema de trabalho da PRICETAX: cada pessoa entra, vê o seu dia |
| 55 | 1. O que é | App de gestão de cronograma de reforma tributária para clientes da PRICETAX |
| 63 | 2. Stack |  |
| 80 | 3. Repositório e deploy | - GitHub: RAFAELSOUZA280292/Cronograma (público), branch padrão main. |
| 107 | 4. Variáveis de ambiente | Fonte da verdade: .env local (não commitado, .gitignore) + Railway env vars. |
| 135 | 5. Banco de dados (Postgres, 51 tabelas, sem ORM) | initDb() roda CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT |
| 172 | 6. Integrações externas |  |
| 206 | 7. Autenticação e autorização | - JWT em cookie httpOnly (cronogramatoken, 7 dias) + bcrypt. JWT carrega só |
| 251 | 8. Superfície de API (`/api/*`, `server/routes.js`) |  |
| 294 | 9. Arquitetura do frontend (`src/App.jsx`, ~5.000 linhas + `src/screens/` + módulos em `src/*/`) | Um único componente AppScreens() (~3.300 linhas) com todo o estado |
| 422 | 10. Fluxos principais | LOGIN |
| 450 | 11. Multi-tenant (2026-08, Fases 1-3 concluídas) | Isolamento lógico por orgid no mesmo banco (não bancos físicos separados — |
| 472 | 12. Grupo Empresarial (2026-08) | Segunda camada de estrutura, dentro de uma organização: um CNPJ Master + |
| 615 | 13. Regras de negócio (resumo) | - 3 acessos independentes (2026-08) — Empresas / Gestão de Atividades / |
| 850 | 14. Problemas técnicos conhecidos | - src/App.jsx (~5.000 linhas desde 2026-10-17, quando as telas pesadas foram para src/screens/; o componente AppScreens() ainda tem ~3.300 linhas) — … |
| 869 | 15. Pendências / roadmap conhecido | Produto e infraestrutura |
| 918 | 16. Padrões obrigatórios ao desenvolver novas funcionalidades | - Nunca setProjects/setPersonalBoard direto pra editar dado existente — |
| 1009 | 17. Bugs já resolvidos — não reintroduzir | Confirmados nesta sessão (causa raiz verificada e corrigida ao vivo): |
| 1143 | 18. XFlow — módulo de gestão de BUGs (2026-08, v2) | Módulo de acesso restrito para rastrear BUGs dos produtos internos PRICETAX |
| 1842 | 19a. Autoatendimento de conta (2026-08) | MyProfileModal (App.jsx, aberto pelo avatar no topo — "Meu perfil") |
| 1879 | 20. Central de Notificações (2026-08) | Pedido do Rafael: sino 🔔 global (mesmo contador/lista nas 3 telas — |
| 2021 | 21. Sincronização com Google Calendar (2026-08) | Pedido do Rafael: Previsão de conclusão de uma TASK do XFlow vira evento |
| 2169 | 22. Agenda (2026-08) | 4ª workspace, junto de Empresas/Gestão de Atividades/XFlow, disponível |
| 2256 | 23. Visão Macro / "Visão Geral Empresas" (2026-08) | Pedido do Rafael: "quadro de cronograma geral pra controle interno dos |
| 2415 | 24. Reuniões (2026-09) | Pedido do Rafael: uma central de acompanhamento de reuniões por |
| 2783 | 25. Atividades — "Centro de Execução" (2026-09) | Pedido original (2026-09, primeira versão): uma aba "TO DO" trazendo |
| 2966 | 26. Reunião — "AI Meeting Workspace" (2026-09) | Redesign completo da tela de detalhe de reunião (antigo MeetingDetailModal, |
| 3085 | 27. Assistente Inteligente de Projetos — Fases 1 e 2 (2026-09) | Rafael pediu um "Assistente Inteligente de Projetos" de verdade — |
| 3723 | 28. Sincronização entre usuários — "BIP" (2026-09-10) | Rafael reportou: ele e a Amanda com a mesma reunião aberta ao mesmo |
| 3778 | 29. Pendências por pessoa, com apelido/nome parcial (2026-09-10) | Rafael mostrou uma tela com 43 pendências "NÃO INICIADO" de várias |
| 3831 | 30. Busca com fallback OR + retry/log nas chamadas à IA (2026-09-10) | Rafael reportou dois bugs em produção na mesma sessão, no projeto |
| 3889 | 31. Busca semântica híbrida com embeddings — Fase 3 da RENATA (2026-09-10) | Mesmo com o fallback OR (§30), a busca da RENATA continuava sendo 100% |
| 4008 | 32. RENATA executora completa — pendências, cronograma e Google Calendar (2026-09-10) | Rafael pediu a RENATA "100% funcional": criar/excluir atividades, abrir |
| 4086 | 33. Bug real de "Não consegui processar essa pergunta agora" — max_tokens baixo demais (2026-09-10) | Depois de configurar acesso aos logs do Railway (RAILWAYTOKEN, ver |
| 4130 | 34. Redesign visual completo + resposta estruturada — Fase 5 (2026-09-10) | Rafael mandou um print de um app de chat (mobile) como referência visual |
| 4213 | 35. Redução de custo de token da RENATA — Fase 6 (2026-09-10) | Rafael perguntou direto qual a estratégia pra economizar token. |
| 4269 | 36. Bug real — RENATA "se perdia" na data (fuso do servidor) (2026-09-10) | Rafael perguntou "o que preciso fazer amanhã" às 23h21 (horário de |
| 4320 | 37. Memória em camadas + cache semântico de perguntas — Fase 7 (2026-09-11) | Nota (Fase 7.1, mesma data, ver §38): o vocabulário de status |
| 4497 | 38. Endurecimento da memória em camadas — Fase 7.1 (2026-09-11) | Depois de confirmar que a arquitetura da Fase 7 estava no caminho |
| 4819 | 39. Central de Conhecimento e Memória Viva — Fase 8 (2026-09-11) | As Fases 7/7.1 construíram o MOTOR de memória da RENATA (fatos com |
| 5060 | 40. RENATA registra sozinha os conflitos que ela detecta ao responder (2026-09-12) | Caso real que motivou isso: o Rafael perguntou sobre os benefícios da |
| 5112 | 41. RENATA Eval Harness — Fase 1 do plano P0/P1 (2026-09-13) | Contexto: depois do diagnóstico completo em |
| 5192 | 42. Auditoria de Prompt Cache nativo da Anthropic (2026-09-14) | Contexto: a Anthropic sinalizou taxa de acerto de cache de prompt |
| 5270 | 43. Correção real: fechar modal editando não confirmava nem sempre salvava de fato (2026-09-16) | Bug relatado pelo Rafael, reproduzido ao vivo antes de corrigir (print |
| 5326 | 44. Correção real: transcrição travava em "Processando..." pra sempre (2026-09-16) | Bug relatado pelo Rafael (print de uma transcrição parada em |
| 5359 | 45. Investigação real: "escrevo e o texto some" ao criar/editar atividade (2026-09-17) | Bug relatado pelo Rafael: criar uma atividade nova (ou editar uma |
| 5409 | 46. Auditoria "onde mais isso?" — mesmo bug de digitação em outros 2 lugares (2026-09-17) | Depois da correção do §45, o Rafael pediu explicitamente uma varredura |
| 5458 | 47. Fechando a auditoria do §46: os 3 casos dentro de `.map()` (2026-09-17) | Extraídos os 3 .map() sinalizados como pendência no §46 em componentes |
| 5501 | 48. Pareceres PRICETAX — repositório de PDFs (2026-09-17) | > Aba irmã: Modelos de documentos (§78) reaproveita o mesmo esqueleto, a mesma regra de acesso e os comentários. |
| 5645 | 49. Transcrições: erro de IA em português + "tentar novamente" em lote (2026-09-18) | Gatilho: o Rafael subiu um lote de reuniões e a transcrição falhou com o |
| 5684 | 50. RENATA na tela inicial: agenda de hoje/semana ou convite pra conectar (2026-09-20) | > Ordem atual da tela inicial (§73, §77): Olá → Mensagem do dia → RENATA (agenda e quadro) → "Onde você quer trabalhar agora?" → módulos. |
| 5727 | 51. Renomear coluna do Quadro travava e mostrava "fantasma" (2026-09-20) | Bug relatado pelo Rafael: no Quadro de Gestão de Atividades, ao editar o |
| 5761 | 52. Fixar o quadro compartilhado de outra pessoa como aba (2026-09-20) | Pedido do Rafael: recebeu o link público de um quadro do Felipe |
| 5805 | 53. Aba ativa do Quadro não era evidente (2026-09-20) | Relato do Rafael (print do Quadro com PRICETAX / Pessoal / aba do Felipe): |
| 5823 | 54. CRM PRICETAX — Fase 1: Fundação + Empresas/Contatos/Ficha 360 (2026-09-20) | Pedido do Rafael: nova aba de workspace "CRM" (PRD de 76 itens, dividido em |
| 5915 | 55. CRM PRICETAX — Fase 2: Negócios, Pipeline e Produtos (2026-09-20) | Pedido do Rafael (na mesma conversa da Fase 1): um Lead pode virar cliente |
| 6006 | 56. CRM PRICETAX — Fase 3: Atividades, Agenda e lembretes (2026-09-20) | Pedido: "Faça" à Fase 3 (Atividades/Agenda/Notificações), com a minha recomendação |
| 6097 | 57. CRM PRICETAX — Dados de contato/endereço da empresa + importação do PipeRun (2026-09-20) | Contexto: o Rafael exportou do PipeRun (CRM que a PRICETAX usava) oportunidades, empresas, |
| 6162 | 58. CRM PRICETAX — Vários funis + importador de negócios do PipeRun (2026-09-20) | Passo 2 do plano de migração do PipeRun (§57). Aprovado ("sim para tudo", "ok, faça"): manter os 6 |
| 6244 | 59. Agenda: mostrar o que foi aceito, o que está sem resposta e o que foi recusado (2026-09-20) | Relato do Rafael (dois prints: Google Calendar × tela inicial da RENATA): "vários compromissos eu não |
| 6335 | 60. Bug real: digitar e o texto sumir sozinho — corrida entre autosave e o poll de sincronização (2026-09-29) | Relato da Amanda (via Rafael): criar uma atividade numa reunião, escrever o nome, e ~2 segundos |
| 6418 | 61. Quadro Pessoal: mover de coluna por dentro da atividade (2026-10-01) | Pedido do Rafael (com print do detalhe de uma atividade "FLP - CEREJ"): dar pra trocar a |
| 6440 | 62. Quadro Pessoal: texto do item de checklist editável (2026-10-01) | Pedido do Rafael (com print): item de checklist "DOCUMENTAÇÃO 3 ANSO - SPED" (typo) não podia |
| 6471 | 63. Dossiê do cliente — compilado de todas as reuniões (2026-10-02) | Pedido (Amanda, via Rafael): "estou com todas as reuniões da Tecumseh aqui, eu queria que a |
| 6547 | 64. XFlow: colar print e adicionar imagens nas TASKs do time de DEV (2026-10-02) | Pedido do Rafael: "dentro das TASKS para time de DEV permita colar PRINT e permita adicionar imagens". |
| 6578 | 65. Gestão de Atividades: indicadores de abertura/encerramento (2026-10-04) | Pedido do Rafael: "memorizar todas as atividades abertas e encerradas" e mostrar a cada pessoa (Rafael, |
| 6794 | 66. Quadro Pessoal: pausar manda a atividade pro fim da coluna (2026-10-04) | Pedido do Rafael (com print de um card "Parceria JOY", Pausada/Alta, no meio da coluna): "ao pausar uma |
| 6814 | 67. Auditoria de acessos dos usuários (2026-10-04) | Pedido do Rafael (Gestão de Usuários): registrar quantas vezes cada usuário acessou, o último acesso e o |
| 6852 | 68. Gestão de Usuários na tela inicial (2026-10-04) | Pedido do Rafael (print da WorkspaceGateScreen): "coloque a Gestão de usuários nessa tela, atualmente ele tá |
| 6896 | 69. Pareceres PRICETAX: redesenho da listagem (2026-10-04) | Pedido do Rafael (print): a tela "está legal, mas horrível de feia, parece uma Biblioteca antiga dos anos 1980". |
| 6919 | 70. RENATA estuda os Pareceres PRICETAX e sugere caminhos nas reuniões (2026-10-04) | Pedido do Rafael: botão Estudar Pareceres na RENATA; ela estuda os pareceres da PRICETAX, aprende, e depois |
| 7037 | 71. Auditoria de fonte do app inteiro + regra global (2026-10-04) | Pergunta do Rafael: "tem alguma aba com cara de anos 1980 ainda?". Em vez de opinar, auditei no browser: um script |
| 7060 | 72. Peças visuais comuns, estados vazios/carregando e auditoria de acessibilidade (2026-10-04) | Pedido do Rafael ("faça 1, 2 e 3 em ordem"): (1) um conjunto único de peças visuais, (2) telas vazias/carregando |
| 7103 | 73. Tela inicial: "Hoje você já terminou" era falso (2026-10-05) | O Rafael (segunda-feira, com 2 h de reunião já encerradas) viu na RENATA da tela inicial "Hoje você já terminou. O resto do |
| 7129 | 74. Endereço próprio por módulo (favoritar) (2026-10-05) | Pedido do Rafael: "o link é sempre painel.pricetax.com.br, não consigo favoritar direto a Gestão de Atividades — |
| 7160 | 75. "0d" numa segunda-feira para algo aberto no domingo (2026-10-05) | O Rafael abriu 4 atividades no domingo e na segunda-feira o selo do cartão (⏱ Nd, "Sem movimentação há N dias") dizia |
| 7176 | 76. Widget do iPhone (Scriptable) (2026-10-05) | Pedido do Rafael: ver, ao pegar o iPhone, o que importa do painel, sem autenticar. PWA no iOS não faz widget; o caminho curto é o |
| 7209 | 77. Meu dia, boas-vindas e Meu perfil em abas (2026-10-05) | Pedido do Rafael: transformar o painel num ecossistema para ele, os sócios e todo colaborador; na primeira entrada a pessoa |
| 7261 | 78. Modelos de documentos (2026-10-05) | Pedido do Rafael: uma aba irmã dos Pareceres para modelos de documentos, com links com pré-visualização e arquivos (PDF, Word, PowerPoint, Excel, HTM… |
| 7297 | 79. Consolidação da documentação (2026-10-05) | O Rafael pediu para consolidar "tudo que foi feito hoje e nos dias anteriores" e perguntou se a documentação estava atualizada. Não estava por inteir… |
| 7317 | 80. API de conectividade — outra janela do Claude Code usa o painel (2026-10-05) | Pedido do Rafael: "criar uma API ou um documento de conectividade" para ele se conectar à ferramenta de outra janela do Claude Code. Escolhas dele: p… |
| 7416 | 81. Plano de usabilidade e front (2026-10-05) — Ondas 0 a 6 IMPLEMENTADAS (plano concluído) | Pedido do Rafael: um portal em que o usuário queira ficar (e cobrar melhorias), com varredura de Voltar, atalhos entre módulos, redundâncias, "fantas… |
| 7524 | 82. Central de Inteligência Operacional (2026-10-25, pedido do Rafael) | Tela Inteligência (/inteligencia, só Master, mesma organização): como a plataforma é usada pela equipe. Nasceu de um |
| 7561 | 83. Versionamento, backup e restauração do cronograma (2026-10-25, pedido do Rafael) | Documento técnico completo: docs/VERSIONAMENTOCRONOGRAMA.md (arquitetura, armazenamento, regras, procedimentos, falhas, limites, testes). |
| 7577 | 84. Migração PipeRun → CRM pela API (2026-10-25, pedido do Rafael) | Documento operacional completo (medições, regras, roteiro de produção, falhas, limites): docs/MIGRACAOPIPERUN.md. Supera o "Passo 3 aguarda reexport"… |
| 7605 | 85. Pós-migração PipeRun: auditoria, backup e três levas de complemento (2026-10-25, pedido do Rafael) | Pedido: "auditoria completa e minuciosa da migração … garantindo que absolutamente nenhuma informação relevante tenha ficado para trás" e parecer APR… |
| 7621 | 86. Levantamento, Lacunas, RENATA geral entre empresas, responsável por empresa e ganhos por subatividade (20… | > Nota de organização (verificada em 2026-10-25): estes temas já têm texto detalhado em PROJECTCONTEXT.md, mas ele está |
| 7698 | 87. Vínculo tarefa de reunião → atividade do cronograma e RENATA — consolidação (2026-10-13 a 10-19) | Esta seção é o mapa único do vínculo tarefa → atividade. O detalhe de cada entrega já está nos parágrafos datados de §65 (linhas ~6655-6747: Fases 1-… |
| 7758 | 88. Plataforma e qualidade de 15 a 19/10: bibliotecas, divisão do código, erros, mobile, PWA e push (2026-10-… | Consolidação conferida no código em 2026-10-25 de entregas que estão em §65 só como parágrafos soltos por data (um por pedido do Rafael, cada um com … |
| 7833 | 89. Cronograma padrão versionado, auditoria contra o padrão e datas (2026-10-15 a 10-20) | Consolida o que hoje está espalhado no fim do §65 (os blocos de 2026-10-19 entre "Tabela de atividades: selo #N" e o §66; o título do §65 é outro ass… |
| 7900 | 90. Mapa, Tabela/Fases, link público de acompanhamento, Power BI e Excel (2026-10-19 a 10-22) | Consolidação conferida contra o código em 2026-10-25. Estes assuntos já têm parágrafos soltos no fim da §80 (e o Mapa/Tabela/Fases em três blocos ant… |
| 7943 | 91. Reservar na agenda, Reunião/Trabalho, Triagem e pauta, API read_write e PDF (2026-10-19 a 10-22) | - Regra do Rafael: só REUNIÃO (call: exige gente junto ao mesmo tempo) é limitada a uma por dia na mesma empresa e é a única que vai para a agenda; T… |
| 7998 | 92. Prontidão da Eduarda (SDR) para largar o PipeRun (2026-10-25, pedido do Rafael) | Auditoria completa em docs/AUDITORIAPRONTIDAOEDUARDA.md (critério objetivo C1–C7, checklist funcional, lacunas, roteiro do 1º dia). Bloqueador de ace… |
| 8001 | 93. Cadência de follow-up e Fila de follow-ups (2026-10-25, pedido do Rafael: aplicar "o que faz alguém amar … | Estudo de UX (Linear/Notion/Figma/Monday/Asana/Slack, NN/G) comparado com o painel: 6 dos 15 critérios atendidos, 9 parciais (lista completa e backlo… |
| 8008 | 94. Edição direta no CRM (2026-10-25, backlog P0 do estudo de UX) | - Lista de Negócios (DealsPage.jsx, células em src/crm/InlineCells.jsx): etapa (select com as etapas do funil do negócio; Ganho/Perdido abrem o diálo… |
| 8016 | 95. Paleta de comandos (Ctrl/⌘ K) com ações e busca no CRM (2026-10-25, backlog P1 do estudo de UX) | A busca global (src/shell/CommandPalette.jsx, itens montados em App.jsx buildSearchItems) deixou de ser só navegação: |
| 8024 | 96. Mensagens de erro claras, com o que fazer (2026-10-25, backlog do estudo de UX) | - Servidor (server/errorHandler.js, ligado em index.js no lugar do handler inline): describeError (pura) traduz o erro em status + texto em português… |
| 8030 | 97. Medição de atrito e satisfação de 1 clique, sem vigilância (2026-10-25, último item do estudo de UX) | Princípio: medir o PRODUTO (fluxo → resultado → duração → onde dá erro) e a nota de quem usa, nunca a pessoa. Não guarda texto digitado, mouse nem te… |
| 8039 | 98. Visões salvas de Negócios e painéis da Visão geral por função (2026-10-25, fecha o estudo de UX) | Visões salvas (server/crm/views.js, src/crm/SavedViews.jsx, integração em DealsPage.jsx): atalho para uma combinação de modo (quadro/lista) + funil +… |
| 8054 | 99. Claude Code opera o CRM por chave de API, registrado como "Claude Code" (2026-10-25) | Por quê: o Rafael quer que o Claude Code seja a interface dele no CRM (criar, editar, mover, excluir, registrar) sem travar a cada gravação, com tudo… |
| 8069 | 100. Frases dos líderes na Mensagem do dia (2026-10-25) | Pedido: o Rafael achou poucas as frases (eram 22: Senna 10 e Ford 12) e colou 60 de Thatcher, Churchill, Reagan, Steve Jobs, Peter Drucker e Soichiro… |
| 8077 | 101. RENATA operacional — de chat a colaboradora que executa (2026-10-25) | Pedido do Rafael: a RENATA deixar de ser só perguntas e respostas e operar a plataforma inteira em nome de quem pede, com as permissões dessa pessoa,… |
| 8116 | 102. Prazo em cada item do checklist do cartão (2026-10-26, pedido do Rafael) | Pedido: poder pôr data nos itens do checklist da Gestão de Atividades, "de modo funcional e sem travar o que funciona visualmente e de atividade". |
| 8124 | 103. Responsáveis por atividade no quadro (inclui o painel público) (2026-10-26, pedido do Rafael) | Pedido: "em um Painel público permita criar responsáveis por atividade". |
| 8133 | 104. Sub-atividades (checklist): responsável por item e mover para cima/baixo (2026-10-26, pedido do Rafael) | Pedido: responsáveis por sub-atividade e poder mover para cima/para baixo, "sem travar o que funciona". |
| 8142 | 105. Buscar encontra sub-atividades (2026-10-26, pedido do Rafael) | Pedido: o "Buscar" do quadro deve achar sub-atividades e dizer claramente em qual atividade estão. |
| 8148 | 106. Prazo da atividade segue a subatividade mais distante (2026-10-26, pedido do Rafael) | Regra: se as subatividades (itens do checklist) têm data, o dueDate da atividade passa a ser a MAIS DISTANTE entre elas, automaticamente. Considera t… |
| 8155 | 107. Daily por responsável (2026-10-26, pedido do Rafael) | Pedido: para a Daily do Time de Operações, uma lista por responsável, com data etc., contendo a atividade principal e as subatividades. |
| 8162 | 108. Importação dos leads do evento 22–23/10/2026 para o CRM (2026-10-26, pedido do Rafael) | Detalhe completo, mapeamento e fluxo de reimportação: docs/CRMIMPORTACAOEVENTO.md. Resumo: |
| 8175 | 109. Calendário/horário que não corta, atividade na agenda do Google, CRM com cor, Ponto Fora da Curva (2026-… | 1. Calendário cortado (print 2): os <input type="date"/"time"> nativos abriam o calendário do navegador cortado dentro de janelas com rolagem. Novo s… |
| 8181 | 110. Responsável Eduarda, empresas unidas pelo domínio do e-mail, CNPJ automático e origem/contato editáveis … | 1. Responsável dos negócios do evento: o importador passa a pôr --owner "Eduarda" (padrão; resolve o usuário pelo nome, recusa se houver 0 ou 2+) com… |
| 8188 | 111. Busca que acha comentário, aviso de versão e RENATA que sabe por que se chama RENATA (2026-10-26, pedido… | - Busca de Negócios (Quadro e Lista): a Eduarda buscou "249,90" e não achou o negócio cujo comentário diz "R$ 249,90: TINTAX + XClass…". dealFilters … |
| 8193 | 112. Teste da RENATA com IA real em PRODUÇÃO (2026-10-26, liberado pelo Rafael no chat) | Rodado pelo próprio chat da RENATA (/api/renata/chat, sessão do Rafael), com empresa descartável "ZZ Teste RENATA 2610" (apagada no fim; 0 sobras em … |
| 8203 | 113. Registrar uma reunião inteira por API (2026-10-26) | POST /api/projects/:id/meetings (server/routes.js, só equipe PRICETAX, sessão): registra de uma vez título, data, hora, participantes, transcrição co… |
| 8208 | 114. Daily: filtro por prazo e exportação em PDF/Excel (2026-10-26) | Pedido do Rafael ("permita filtrar por data de entrega e sem data além do responsável, e exportar para .pdf e Excel"). DailyPanel (src/screens/Person… |
| 8211 | 115. RENATA: copiar e exportar a conversa (2026-10-27) | Pedido do Rafael ("adiciona na RENATA uma opção de copiar conversa, isolada e toda, e de exportar em vários formatos"). Vale para as três telas da RE… |
| 8214 | 116. Biblioteca de conhecimento da RENATA (2026-10-27) | Pedido do Rafael ("nessa aba onde faço input de conhecimento? tenho um material fodah de Produtor Rural antes e depois da reforma… se não existe, cri… |
| 8227 | 116b. Botão "Copiar link" na ficha do negócio do CRM (2026-10-28) | Pedido do Rafael (ficha "Llampe Frio · Treinamento prático + Consultoria mensal"): um link do negócio para mandar só a pessoas que têm login e senha … |
| 8232 | 116c. Exportar Excel nativo nos Negócios do CRM (2026-10-28) | Pedido do Rafael, depois de aplicar a tag "30 dias TINTAX" no funil: "deixe no painel algo nativo para exportar para Excel", só com o filtro aplicado… |
| 8241 | 116d. IA externa envia a transcrição de uma reunião pela API; a RENATA processa (2026-10-28) | Pedido do Rafael: uma IA que tem acesso a todas as reuniões dele (Jamie/Granola etc.) precisa "entrar no painel, selecionar uma empresa e subir uma t… |
| 8247 | 116e. IA externa CORRIGE uma reunião já registrada pela API — escopo `meetings_edit` (2026-10-28) | Pedido (texto de outra janela do Claude Code, repassado pelo Rafael): a chave transcripts envia, mas não corrige o que a RENATA registrou (responsáve… |
| 8260 | 116f. Duas chaves de API na tela: "Ler tudo" e "Ler e editar tudo" (2026-10-29) | Pedido do Rafael: a área de gerar chaves (Meu perfil › Integrações) tinha seis opções que ninguém sabia diferenciar; queria duas (ler tudo; ler e edi… |
| 8270 | 116g. Estudo de parecer que falhava para sempre: resposta da IA cortada (2026-10-29) | Sintoma (print do Rafael): o aviso "A RENATA estudou 11 de 12 pareceres. 1 aguarda estudo" não saía nunca, mesmo apertando "Estudar os pendentes". Ca… |
| 8275 | 116h. RENATA geral mostrava códigos internos `[id=akf-…]` nas respostas (2026-10-29) | Sintoma (Rafael, pergunta sobre cartão corporativo): a resposta citava "Cartão de Crédito \| Guia Executivo [id=akf-fth4akj]". Causa: buildGeneralCont… |
| 8278 | 116i. RENATA orienta por conta própria com base nos pareceres e materiais já estudados (2026-10-29) | Pedido do Rafael: quando ele, o sócio ou a equipe conversarem com a RENATA e ela já tiver parecer/conhecimento sobre o tema da reunião, ela deve orie… |
| 8287 | 116j. RENATA operacional travava em "…": limite de passos sem resposta, sem ferramenta para ler reunião; horá… | Sintoma (print do Rafael, ~01:05 BRT): pergunta "o que devo responder à KUHN sobre o saldo credor de PIS/COFINS da última reunião?" → 10 linhas "Cons… |
| 8294 | 116k. Documentação completa do sistema + separação equipe/cliente no cache da RENATA (2026-10-29) | Pedido do Rafael (madrugada): revisar toda a base e documentar tudo (arquitetura, rotas, segurança, manuais, travas, tipos de API, histórico) de form… |
| 8301 | 116l. Correção dos achados de gravidade ALTA (2026-10-29, a pedido do Rafael: "corrige os itens altos e depoi… | Feito (código, com teste HTTP em scripts/seguranca-altos.test.mjs, 36 checagens, + regressão dos testes de quadro, chaves, transcrição, versões, expe… |
| 8315 | 116m. A3/A4 (visão do cliente) e médios baratos (2026-10-29, "faz o A3/A4 e os médios mais baratos") | Feito (teste scripts/seguranca-altos.test.mjs, 60+ checagens; scripts/google-oauth-state.test.mjs; crm-eduarda com o caso M5): |
| 8325 | 116n. Carimbo de versão + fusão da empresa (A3, 2026-10-29, "faz o carimbo de versão com fusão do A3") | Problema: PATCH /api/projects/:id regravava o documento inteiro; quem gravava por último vencia (aba/pessoa desatualizada apagava o trabalho de outra… |
| 8333 | 116o. A9 e médios que sobraram (2026-10-29, "faz o A9 e os médios que sobraram") | Feito (teste scripts/seguranca-altos.test.mjs + secret-box + renata-confirmacao-lote + renata-limite-passos; regressão de 30 scripts verde): |
| 8341 | 116p. M6, M7 e M12 do jeito mais restritivo (2026-10-29, "faz o M6, M7 e M12 do jeito mais seguro") | - M6 DELETE /api/crm/contacts/:id exige remove (admin/diretor/gestor); a tela só mostra o botão de remover contato com caps.remove. |
| 8347 | 116q. M3 (token do widget só em hash) e M22 (excluir usuário = desativar) (2026-10-29, "faz o M3 e o DELETE /… | - M3 server/widget.js: o token pxw é gravado só como sha256; POST /widget/token devolve o valor uma vez; GET /widget/token responde 410; status.recov… |
| 8352 | 116r. M8 e o resto dos médios (2026-10-29, "faz o M8 e o resto dos médios") | - M8 (CRM): editar, concluir, cancelar e reabrir atividade exige ser o responsável, o criador ou gestão (remove) (ownActivity em crm/routes.js; chave… |
| 8361 | 116s. Os BAIXOS que sobravam (2026-10-29, "faz os BAIXOS que sobraram") | Feito (teste scripts/seguranca-altos.test.mjs, blocos B1/B4/B7/B8, Modelos e retenção; regressão ampla): |
| 8371 | 116t. Tela de Histórico do quadro pessoal (2026-10-29, "faz a tela de Histórico do quadro pessoal") | O §116l (M11) deixou o versionamento só na API. Agora há tela: botão Versões na barra da Gestão de Atividades (no celular: menu ⋯ → "Versões do quadr… |
| 8379 | 117. O "fantasma" que apagava o trabalho com duas abas abertas (2026-10-27) | Relato do Rafael: com duas abas da Gestão de Atividades abertas (uma na página "Price Tags Clack", outra na "26 de outubro da Maiara") e copiando de … |
| 8389 | 118. Retentativa automática quando o salvamento falha (2026-10-27) | Pedido do Rafael, na sequência do §117. Antes: qualquer falha ao gravar o quadro (rede caiu, servidor reiniciando no deploy) desfazia a edição local … |
| 8396 | 119. CRM: arrastar negócio de etapa "não grava" — o quadro agora acompanha na hora (2026-10-27) | Relato da Eduarda (time comercial, só usa o CRM): ao arrastar um lead para outra etapa (ex.: Leads → Conexão) "ele não fica, não está gravando". |
| 8413 | 120. Quadro público com botão "Voltar ao quadro anterior" (2026-10-27) | Pedido do Rafael (aba "Amanda" da Gestão de Atividades): link público para mandar um quadro a alguém, e a pessoa poder voltar ao quadro anterior, amb… |
| 8420 | 121. Link público de UMA COLUNA da Gestão de Atividades (2026-10-27) | Correção do §120: no pedido "aba Amanda" eu li o print errado — AMANDA é uma coluna do quadro "OPERAÇÕES" (o cabeçalho do cartão mostra OPERAÇÕES / A… |
| 8428 | 122. Coluna compartilhada no painel da pessoa, nos dois sentidos, com histórico (2026-10-27) | Pergunta do Rafael depois de compartilhar a coluna: quem recebe o link deve poder adicionar o quadro ao próprio painel e, conforme cada um trabalha, … |
| 8437 | 116u. Histórico do repositório público reescrito para tirar `exports/` (2026-10-29, ordem do Rafael) | git filter-branch --index-filter 'git rm -r --cached --ignore-unmatch exports' --prune-empty num clone espelho; main forçada com --force-with-lease c… |
| 8440 | 116v. Quadro pessoal no iPad: controles densos não inflam mais (2026-10-29, print do Rafael) | - Causa: a regra de tablet do index.html (768–1023 px ou pointer: coarse) dá min-height/min-width: 44px !important a TODO button. No iPad na horizont… |
| 8453 | 116w. Foco de hoje: tela para o iPad como segunda/terceira tela (2026-10-29, pedido do Rafael) | - Pedido: a Daily é um relatório lateral por quadro, feito para a reunião e para exportar. O Rafael queria algo de relance, filtrável por dia, pessoa… |
| 8462 | 116x. Dia da equipe: quem entrou, saiu, por onde passou e o que fez (2026-10-29, pedido do Rafael) | - Pedido: saber, por pessoa (Eduarda, Felipe) e por dia, quando entrou, quando saiu, quais telas navegou e o que fez, editou e incluiu. Antes só dava… |
| 8472 | 116y. Organizar o quadro pessoal por API (2026-10-30, pedido do Rafael para a outra janela do Claude Code) | - Pedido: a outra janela (a que tem as transcrições das reuniões) diagnosticou o quadro (105 abertas, 19 atrasadas, cliente repetido em várias coluna… |
| 8490 | 116z. CRM: botão azul "Copiar número" ao lado do WhatsApp (2026-10-30, pedido do Rafael para a Eduarda) | - Pedido: a Eduarda não usa o WhatsApp Web: copia o número, cola num grupo e depois chama. Botão azul ao lado do WhatsApp que põe na área de transfer… |
| 8497 | 116za. Notas do CRM com texto formatado, emojis e modelos (2026-10-30, pedido do Rafael para incentivar a Edu… | - Pedido: as notas do negócio eram uma caixa de texto simples ("muito simples"). Querer biblioteca melhor, emoji e mais elementos para o time usar. |
| 8508 | 116zb. Visão geral do CRM: visual menos "infantil" — Etapas 1 e 2 do plano (2026-10-30, pedido do Rafael, com… | - Pedido: o painel era "bom, funcional, mas com cara infantil". Plano proposto (diagnóstico + 5 etapas) e aprovado; feitas as Etapas 1 e 2 seguindo a… |
| 8524 | 116zc. Visão geral do CRM: listas e textos — Etapas 3 e 4 do plano de visual (2026-10-30, pedido do Rafael) | - Continuação do §116zb. Só apresentação; escopo limitado à Visão geral por uma classe nova crm-ov na raiz de OverviewPage.jsx (os títulos e linhas d… |
| 8537 | 116zd. Quadro de Negócios: tags legíveis e urgência sem fundo colorido (2026-10-30, pedido do Rafael — "parec… | - Antes de fazer, consultei o skills.sh (regra nova do Rafael, memória feedback-skills-sh-antes-de-visual): li frontend-design (Anthropic), as regras… |
| 8546 | 116ze. Quadro de Negócios: contatos enxutos e colunas sem degradê — itens 3 e 4 do plano (2026-10-30, pedido … | - Mesma regra do §116zd: skills do skills.sh lidas antes (alvo de toque, aria-label em botão só com ícone, ícone decorativo com aria-hidden, texto ≥ … |
| 8555 | 116zf. CRM inteiro: texto mínimo de 12 px, selos neutros e contraste — fim do plano de visual (2026-10-30, pe… | - Método (regra do Rafael, memória feedback-skills-sh-antes-de-visual): reli as regras da web-design-guidelines (Vercel) antes de começar e, em vez d… |
| 8569 | 116zg. Tela inicial: mensagem do dia à esquerda e "Hoje" à direita, no mesmo nível (2026-10-30, pedido do Raf… | - Pedido: ao logar, a tela inicial estava "descompassada": "Olá, Rafael" e a Mensagem do dia centralizadas (760 px), e logo abaixo o painel "Hoje" gi… |
