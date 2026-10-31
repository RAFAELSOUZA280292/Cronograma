# RENATA — matriz de cobertura operacional

> Gerado por `scripts/renata-coverage.mjs` a partir do código (catálogo de ferramentas + índice de rotas). Não edite à mão: mude o catálogo ou as linhas do script e rode de novo. Testes: `scripts/renata.test.mjs` (conversa, confirmação, permissões, auditoria, desfazer), `scripts/renata-tools.test.mjs` (cada ferramenta, ponta a ponta) e `scripts/renata-coverage.mjs --check`.

**Legenda:** ✅ implementada e exercitada por teste ponta a ponta · 🟡 parcial/limitada (explicado) · ⬜ pendente · 🚫 fora do alcance de propósito (segurança)

## Resumo
- **101 ferramentas estruturadas** em 11 módulos (36 de consulta, 46 de escrita de baixo risco/reversível, 19 críticas com confirmação obrigatória).
- **323 rotas** no servidor: 64 cobertas por ferramenta própria, 124 por acesso genérico (consulta livre; qualquer alteração pede confirmação) e 135 excluídas de propósito.
- **56 funcionalidades humanas mapeadas**: 35 ✅, 12 🟡, 4 ⬜, 5 🚫.
- **Critério "100% das funcionalidades" NÃO está atendido ainda**: as linhas 🟡 e ⬜ abaixo são o que falta. As rotas "genéricas" já são alcançáveis (com confirmação), mas sem esquema de parâmetros; as ⬜ precisam de trabalho novo (arquivos, edição de documentos inteiros).

## 1. Onde a RENATA está disponível
O botão **RENATA** fica na barra única do topo (ModuleShell), presente em todos os módulos, e o item "Falar com a RENATA" também está na busca Ctrl+K. Verificado no navegador em 25/10/2026 em todos os 11 módulos e na tela inicial. A impressão de "só em duas abas" vinha do assistente flutuante de projeto (Reuniões/Atividades), que é outra coisa (memória de reuniões de UMA empresa); o botão geral já existia em todas as telas, mas só consultava — agora opera.

| Tela / módulo | Disponível | Observação |
|---|---|---|
| Início (tela "Olá") | ✅ | Botão RENATA na barra única |
| Empresas (todas as abas: Resumo, Reuniões, Tarefas, Linha do tempo, Tabela, Fases, Kanban, Mapa, Triagem) | ✅ | Botão na barra; a RENATA recebe a empresa aberta e a aba |
| Gestão de Atividades | ✅ | Botão na barra; módulo informado |
| XFlow | ✅ | Botão na barra; módulo informado |
| Agenda | ✅ | Botão na barra; módulo informado |
| Visão Geral | ✅ | Botão na barra; módulo informado |
| Conhecimento | ✅ | Botão na barra; módulo informado |
| CRM (Visão geral, Agenda, Negócios, Empresas, Contatos, Produtos) | ✅ | Botão na barra; recebe a tela e o negócio/empresa aberto |
| Pareceres | ✅ | Botão na barra; módulo informado |
| Modelos | ✅ | Botão na barra; módulo informado |
| Usuários | ✅ | Botão na barra; as ferramentas de usuários são excluídas por segurança |
| Inteligência | ✅ | Botão na barra; módulo informado |

## 2. Função humana × operação da RENATA

| Módulo | Função humana | Operação da RENATA | Status | Evidência / limite |
|---|---|---|---|---|
| CRM | Buscar empresa, contato, negócio | crm_buscar | ✅ | renata-tools |
| CRM | Ver ficha da empresa e histórico | crm_ver_empresa, crm_historico_empresa | ✅ | renata-tools |
| CRM | Cadastrar / editar empresa | crm_criar_empresa, crm_atualizar_empresa | ✅ | renata (T1, T11 duplicidade), renata-tools |
| CRM | Excluir empresa | crm_excluir_empresa (confirmação) | ✅ | renata-tools (administrador confirma e a empresa vai para a lixeira), renata (T3: sem permissão → negado) |
| CRM | Consultar CNPJ na Receita | crm_consultar_cnpj | 🟡 | Implementada; não testada (serviço externo). Duplicidade é avisada pelo servidor. |
| CRM | Vincular empresa a cronograma | crm_vincular_projeto | ✅ | renata-tools |
| CRM | Desvincular cronograma / restaurar empresa excluída | plataforma_executar (confirmação) | 🟡 | Sem ferramenta própria; acesso genérico testado (T10) mas não estas rotas. |
| CRM | Contatos: criar, editar, excluir | crm_criar_contato, crm_atualizar_contato, crm_excluir_contato | ✅ | renata-tools |
| CRM | Negócios: criar, editar, mover de etapa, tags | crm_criar_negocio, crm_atualizar_negocio, crm_mover_negocio, crm_definir_tags_negocio | ✅ | renata (T1, T4 + desfazer), renata-tools |
| CRM | Negócios: ganhar, perder, excluir | crm_fechar_negocio_ganho, crm_fechar_negocio_perdido, crm_excluir_negocio (confirmação) | ✅ | renata (T2, T12), renata-tools |
| CRM | Lead rápido (empresa + contato + negócio) | crm_criar_lead_rapido | ✅ | renata-tools |
| CRM | Atividades: criar, reagendar, trocar responsável, concluir, reabrir, cancelar | crm_criar_atividade, crm_atualizar_atividade, crm_concluir_atividade, crm_reabrir_atividade, crm_cancelar_atividade | ✅ | renata-tools |
| CRM | Atividades: excluir | crm_excluir_atividade (confirmação) | ✅ | renata-tools |
| CRM | Notas: registrar, editar, excluir | crm_registrar_nota, crm_editar_nota, crm_excluir_nota | ✅ | renata-tools |
| CRM | Anexos de nota / arquivos do negócio | — | ⬜ | Exigem enviar/ler arquivo; a RENATA ainda não manipula arquivos. |
| CRM | Produtos: criar, editar, excluir | crm_criar_produto, crm_atualizar_produto, crm_excluir_produto (confirmação) | ✅ | renata-tools |
| CRM | Funis, etapas (prazo/probabilidade) e cadências | crm_criar_funil, crm_atualizar_funil, crm_salvar_etapas, crm_arquivar_funil, crm_criar_cadencia, crm_excluir_cadencia | ✅ | renata-tools (todos com confirmação) |
| CRM | Operações em lote (negócios e atividades) | crm_lote_atualizar_negocios, crm_lote_atualizar_atividades (confirmação com contagem) | ✅ | renata (T5), renata-tools |
| CRM | Painéis Meu dia / Time / Receita / Contas | crm_painel | ✅ | renata-tools |
| CRM | Visões salvas e painel inicial | plataforma_executar (confirmação) | 🟡 | Sem ferramenta própria. |
| CRM | Auditoria de um negócio/empresa | plataforma_consultar | 🟡 | Leitura genérica. |
| CRM | Importar planilhas, trazer clientes do painel, migração do PipeRun | — | 🚫 | Operações em massa com arquivo e conferência na tela, só administrador. |
| Empresas | Listar empresas e ver o cronograma (atividades, subatividades, equipe, fases, reuniões) | empresas_listar, empresa_ver_cronograma | ✅ | renata-tools |
| Empresas | Ajustar atividade (status, datas, responsável, prioridade, fase, tipo) | cronograma_simular, cronograma_aplicar (desfazer; vários ajustes pedem confirmação) | ✅ | renata (T7: simula, aplica, confirma, desfaz e confere o Log) |
| Empresas | Subatividades: marcar feita, pular, mover, criar, excluir/restaurar; criar atividade; vincular pauta | cronograma_aplicar (ops sub.* / activity.add / pauta.link) | 🟡 | Mesmo motor testado (renata, connect-fixes), mas estas operações não têm teste próprio na RENATA. |
| Empresas | Reorganizar preservando dependências entre subatividades | cronograma_simular (avisa), cronograma_aplicar (recusa se quebrar; aceite explícito) | ✅ | renata (dependências: avisa, recusa, aceita e ajuste conjunto). Limite: lê as predecessoras (campo `predecessors` da subatividade) mas não as edita; não recalcula datas sozinha em cascata — a RENATA inclui as dependentes nas operações. |
| Empresas | Tarefas de reunião: criar, editar (responsável, prazo, status), excluir, listar | tarefa_reuniao_criar/atualizar/excluir, tarefas_reuniao_listar | ✅ | renata (T8), renata-tools |
| Empresas | Reuniões: criar, editar (título, data, hora, participantes, resumo, decisões), excluir | reuniao_criar, reuniao_atualizar, reuniao_excluir (confirmação) | ✅ | renata-tools |
| Empresas | Enviar/colar transcrição para processar (caixa de entrada de reuniões) | plataforma_executar (meeting-inbox) | 🟡 | Sem ferramenta própria (a IA de processamento roda no servidor). |
| Empresas | Cadastro (razão social, nome fantasia, pausar/ativar), equipe e fases | empresa_atualizar_cadastro, empresa_equipe_adicionar/remover, empresa_fase_criar/atualizar/excluir | ✅ | renata-tools (remover equipe e excluir fase pedem confirmação) |
| Empresas | Criar empresa nova (com cronograma padrão) e excluir de vez | empresa_criar (confirmação), empresa_excluir (nome digitado + confirmação) | ✅ | renata-tools. Exclusão é definitiva (a tela também não tem lixeira): por isso exige o nome exato. |
| Empresas | CNPJ, logo, áreas e contatos externos da empresa | — | ⬜ | CNPJ controla acesso (de propósito não se altera por aqui); logo/áreas/contatos ainda sem ferramenta. |
| Empresas | Vínculo tarefa↔atividade, levantamento, lacunas, cronograma padrão, histórico de versões | plataforma_consultar / plataforma_executar | 🟡 | Acesso genérico (confirmação em tudo que altera). |
| Empresas | Links públicos e compartilhamento externo | — | 🚫 | Gerados pela própria pessoa na tela. |
| Gestão de Atividades | Cartões: criar, editar (título, prazo, prioridade, status, coluna), concluir, excluir | quadro_criar_atividade, quadro_atualizar_atividade, quadro_concluir_atividade, quadro_excluir_atividade | ✅ | renata (T6), renata-tools |
| Gestão de Atividades | Listar o quadro | quadro_listar | ✅ | renata-tools |
| Gestão de Atividades | Checklist (itens, marcar, prazo, ordem e responsável por item), comentários, criar páginas e colunas | quadro_checklist (inclui prazo do item), quadro_responsavel, quadro_comentar, quadro_criar_pagina, quadro_criar_coluna | ✅ | renata-tools. Edição local ainda não salva vence a da RENATA (a tela recarrega em até ~12 s). |
| Gestão de Atividades | Anexos e tags do cartão; renomear/excluir/reordenar páginas e colunas; arquivar | — | ⬜ | Ainda sem ferramenta (anexos exigem arquivo). |
| Gestão de Atividades | Quadro público compartilhado | — | 🚫 | Link público gerado na tela. |
| Agenda | Listar compromissos | agenda_listar | ✅ | renata-tools (sem Google conectado devolve vazio) |
| Agenda | Criar compromisso (com convidados pede confirmação) | agenda_criar_evento | 🟡 | Confirmação com convidados testada; criação real depende do Google conectado (testada só a falha clara). |
| Agenda | Responder convite | agenda_responder_convite | 🟡 | Testada só a falha tratada (sem Google). |
| Agenda | Conectar o Google | — | 🚫 | OAuth: a pessoa autoriza na tela. |
| XFlow | Listar e abrir ticket | xflow_listar, xflow_criar | ✅ | renata-tools |
| XFlow | Ações do ticket (triagem, desenvolvimento, homologação, publicação, validação, bloquear, pausar, fechar, lixeira…) | xflow_acao (confirmação) | ✅ | renata-tools (ação "aceitar" ponta a ponta; as demais — inclusive comentar e editar campo — passam pela mesma máquina de estados e permissões do servidor, sem teste próprio de cada uma). |
| Conhecimento | Buscar na memória da RENATA | conhecimento_buscar | ✅ | renata-tools |
| Conhecimento | Editar fatos, resolver conflitos, entidades | plataforma_executar | 🟡 | Sem ferramenta própria. |
| Pareceres / Modelos | Listar | pareceres_listar, modelos_listar | ✅ | renata-tools |
| Pareceres / Modelos | Subir, editar, excluir, comentar; estudar pareceres | plataforma_executar | 🟡 | Upload de arquivo ainda não; edição/comentário genéricos. |
| Notificações | Ver e marcar todas como lidas | notificacoes_listar, notificacoes_marcar_todas_lidas | ✅ | renata-tools |
| Notificações | Marcar uma, categorias que quer ver | plataforma_executar | 🟡 | Sem ferramenta própria. |
| Relatórios | O que a equipe fez hoje / atrasos por responsável | relatorio_equipe_dia, relatorio_atrasos | ✅ | renata (T9), renata-tools |
| Relatórios | Exportar planilha / PDF | — | ⬜ | Ações de tela que geram arquivo. |
| Plataforma | Quem sou eu, equipe, descobrir operações | plataforma_quem_sou_eu, plataforma_pessoas, plataforma_rotas | ✅ | renata-tools |
| Plataforma | Qualquer outra rota liberada | plataforma_consultar, plataforma_executar | ✅ | renata (T10: consulta, recusa de rota excluída, confirmação) |
| Usuários / Inteligência / Meu perfil | Usuários, acessos, senhas, chaves de API, telemetria, push, widget | — | 🚫 | Segurança: credenciais, permissões e dados de pessoas são só pela tela e por administradores. |

## 3. Catálogo de ferramentas

### Agenda
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `agenda_listar` | consulta | GET /api/agenda | Compromissos do Google Calendar do usuário entre duas datas (start e end em ISO, ex.: 2026-10-26 e 2026-11-02). |
| `agenda_criar_evento` | escrita (confirma em certos casos) | POST /api/agenda/events | Cria um compromisso no Google Calendar do usuário. Com convidados (e-mails), pede confirmação, pois o Google envia convite a pessoas de fora. |
| `agenda_responder_convite` | escrita | POST /api/agenda/events/{id}/respond | Responde a um convite do Google Calendar (accepted, declined ou tentative). O id vem de agenda_listar (começa com google-). |

### Notificações
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `notificacoes_listar` | consulta | GET /api/notifications | Notificações do usuário (as 200 mais recentes, nas categorias que ele escolheu ver). |
| `notificacoes_marcar_todas_lidas` | escrita | POST /api/notifications/read-all | Marca todas as notificações do usuário como lidas. |

### Conhecimento
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `conhecimento_buscar` | consulta | GET /api/knowledge/facts | Busca na memória da RENATA (fatos da organização e pareceres estudados) por texto. |
| `biblioteca_consultar` | consulta | sob medida | Procura na Biblioteca de conhecimento (materiais que a PRICETAX enviou: estudos, apresentações, notas técnicas) os trechos que tratam do assunto e dev |

### Pareceres
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `pareceres_listar` | consulta | GET /api/pareceres | Lista os Pareceres PRICETAX (repositório de PDFs). |

### Modelos
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `modelos_listar` | consulta | GET /api/templates | Lista os Modelos de documentos. |

### XFlow
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `xflow_listar` | consulta | GET /api/xflow/tickets | Lista os tickets (bugs/tarefas) do XFlow da organização. |
| `xflow_criar` | escrita | POST /api/xflow/tickets | Abre um ticket no XFlow (bug ou tarefa). |
| `xflow_acao` | escrita (confirma em certos casos) | PATCH /api/xflow/tickets/{id} | Executa uma ação sobre um ticket do XFlow (triagem, desenvolvimento, homologação, publicação, validação, bloqueio, pausa, fechamento, exclusão para a  |

### Plataforma
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `plataforma_rotas` | consulta | sob medida | Descobre as operações da plataforma que ainda não têm ferramenta própria: lista rotas (método e caminho) por módulo. Depois use plataforma_consultar ( |
| `plataforma_consultar` | consulta | sob medida | Consulta (GET) qualquer rota liberada da plataforma, em nome do usuário e com as permissões dele. |
| `plataforma_executar` | escrita (confirma em certos casos) | sob medida | Executa uma operação que ALTERA dados (POST, PUT, PATCH, DELETE) numa rota liberada que ainda não tem ferramenta própria. Sempre pede confirmação do u |
| `plataforma_quem_sou_eu` | consulta | sob medida | Quem está pedindo: nome, perfil, acessos (Empresas, Gestão de Atividades, XFlow, CRM e perfil no CRM) e a data de hoje com o dia da semana. Use para r |
| `plataforma_pessoas` | consulta | sob medida | Pessoas da equipe PRICETAX (id e nome) para traduzir "a Eduarda" em um usuário. Responsáveis de cronograma são nomes; responsáveis do CRM e de XFlow s |

### Relatórios
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `relatorio_equipe_dia` | consulta | sob medida | O que a equipe fez em um dia (padrão hoje): ações registradas nos Logs das empresas e na linha do tempo do CRM, agrupadas por pessoa, com exemplos. Só |
| `relatorio_atrasos` | consulta | sob medida | Atrasos por responsável: atividades de cronograma, tarefas de reunião e atividades do CRM com prazo vencido. Só equipe PRICETAX. |

### CRM
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `crm_buscar` | consulta | GET /api/crm/search | Busca global no CRM por texto (empresas, contatos e negócios). Comece por aqui para achar o id de um registro. |
| `crm_listar_opcoes` | consulta | GET /api/crm/options | Opções do CRM: usuários responsáveis (id e nome), funis com etapas (ids), produtos, motivos de perda, origens. Use para traduzir nomes em ids. |
| `crm_listar_empresas` | consulta | GET /api/crm/companies | Lista empresas do CRM com filtros. |
| `crm_ver_empresa` | consulta | GET /api/crm/companies/{id} | Ficha completa de uma empresa: dados, contatos, negócios, atividades e resumo. |
| `crm_historico_empresa` | consulta | GET /api/crm/companies/{id}/timeline | Linha do tempo (histórico) de uma empresa. |
| `crm_listar_contatos` | consulta | GET /api/crm/contacts | Lista contatos (filtre por empresa ou texto). |
| `crm_listar_negocios` | consulta | GET /api/crm/deals | Lista negócios com filtros (situação, funil, responsável, atenção). ownerId aceita "me" apenas via crm_painel; aqui use o id do usuário. |
| `crm_ver_negocio` | consulta | GET /api/crm/deals/{id} | Ficha completa de um negócio: dados, atividades, notas, histórico de etapas e linha do tempo. |
| `crm_listar_atividades` | consulta | GET /api/crm/activities | Lista atividades/follow-ups do CRM. ownerId="me" = as do usuário que pediu. |
| `crm_ver_atividade` | consulta | GET /api/crm/activities/{id} | Detalhe de uma atividade do CRM. |
| `crm_painel` | consulta | GET /api/crm/overview | Indicadores do CRM por painel: mine (meu dia), team (time: por responsável), revenue (receita/MRR/previsão), accounts (contas). |
| `crm_listar_funis` | consulta | GET /api/crm/pipelines | Funis e etapas (ids, probabilidade, prazo). |
| `crm_listar_produtos` | consulta | GET /api/crm/products | Catálogo de produtos. |
| `crm_listar_cadencias` | consulta | GET /api/crm/cadences | Cadências de follow-up configuradas por etapa. |
| `crm_listar_tags` | consulta | GET /api/crm/tags | Tags de negócios. |
| `crm_consultar_cnpj` | consulta | GET /api/crm/cnpj/{cnpj} | Consulta dados de um CNPJ na Receita e diz se já existe duplicado no CRM. |
| `crm_criar_empresa` | escrita | POST /api/crm/companies | Cadastra uma empresa. Se houver empresa parecida o servidor avisa (duplicidade): mostre ao usuário antes de repetir com force=true. |
| `crm_atualizar_empresa` | escrita | PATCH /api/crm/companies/{id} | Altera dados de uma empresa (só envie o que muda). |
| `crm_excluir_empresa` | crítica (confirma) | DELETE /api/crm/companies/{id} | Exclui (lógica) uma empresa do CRM — vai para a lixeira, o histórico permanece. |
| `crm_vincular_projeto` | escrita | POST /api/crm/companies/{id}/projects | Vincula uma empresa do CRM a um cronograma (projeto) de cliente. |
| `crm_criar_contato` | escrita | POST /api/crm/contacts | Cadastra um contato de uma empresa. |
| `crm_atualizar_contato` | escrita | PATCH /api/crm/contacts/{id} | Altera dados de um contato. |
| `crm_excluir_contato` | crítica (confirma) | DELETE /api/crm/contacts/{id} | Exclui (lógica) um contato. |
| `crm_criar_negocio` | escrita | POST /api/crm/deals | Cria um negócio numa empresa já cadastrada (sem pipelineId/stageId usa o funil padrão e a 1ª etapa). Sem ownerId o responsável é quem pediu. |
| `crm_criar_lead_rapido` | escrita | POST /api/crm/leads | Cadastra empresa + contato + negócio de uma vez (lead novo da prospecção). Empresa parecida → o servidor avisa. |
| `crm_atualizar_negocio` | escrita | PATCH /api/crm/deals/{id} | Altera um negócio (valor, previsão, responsável, contato, origem, descrição…). Para trocar de etapa use crm_mover_negocio. |
| `crm_mover_negocio` | escrita (confirma em certos casos) | POST /api/crm/deals/{id}/move | Move um negócio de etapa. Para GANHAR ou PERDER, mova para a etapa Ganho/Perdido do funil (perder exige lostReason; veja os motivos em crm_listar_opco |
| `crm_fechar_negocio_ganho` | crítica (confirma) | sob medida | Marca um negócio como GANHO (move para a etapa Ganho do funil dele). Sempre pede confirmação: muda indicadores e pode promover a empresa a cliente. |
| `crm_fechar_negocio_perdido` | crítica (confirma) | sob medida | Marca um negócio como PERDIDO com o motivo (chaves em crm_listar_opcoes › lostReasons). Sempre pede confirmação. |
| `crm_excluir_negocio` | crítica (confirma) | DELETE /api/crm/deals/{id} | Exclui (lógica) um negócio. |
| `crm_definir_tags_negocio` | escrita | PUT /api/crm/deals/{id}/tags | Define as tags de um negócio (substitui a lista). |
| `crm_criar_atividade` | escrita | POST /api/crm/activities | Agenda uma atividade/follow-up do CRM numa empresa (opcionalmente num negócio e contato). Sem ownerId o responsável é quem pediu. |
| `crm_atualizar_atividade` | escrita | PATCH /api/crm/activities/{id} | Altera uma atividade em aberto (reagendar, trocar responsável, prioridade, título…). |
| `crm_concluir_atividade` | escrita | POST /api/crm/activities/{id}/complete | Conclui uma atividade com o resultado (e, se houver cadência, o servidor agenda o próximo passo). |
| `crm_reabrir_atividade` | escrita | POST /api/crm/activities/{id}/reopen | Reabre uma atividade concluída ou cancelada. |
| `crm_cancelar_atividade` | escrita | POST /api/crm/activities/{id}/cancel | Cancela uma atividade em aberto. |
| `crm_excluir_atividade` | crítica (confirma) | DELETE /api/crm/activities/{id} | Exclui (lógica) uma atividade. |
| `crm_registrar_nota` | escrita | POST /api/crm/notes | Registra uma nota/comentário/interação em um negócio, empresa ou contato. |
| `crm_editar_nota` | escrita | PATCH /api/crm/notes/{id} | Edita o texto de uma nota. |
| `crm_excluir_nota` | crítica (confirma) | DELETE /api/crm/notes/{id} | Exclui uma nota. |
| `crm_criar_produto` | escrita (confirma em certos casos) | POST /api/crm/products | Cadastra um produto no catálogo. |
| `crm_atualizar_produto` | escrita (confirma em certos casos) | PATCH /api/crm/products/{id} | Altera um produto do catálogo. |
| `crm_excluir_produto` | crítica (confirma) | DELETE /api/crm/products/{id} | Exclui um produto do catálogo. |
| `crm_criar_funil` | escrita (confirma em certos casos) | POST /api/crm/pipelines | Cria um funil de vendas. |
| `crm_atualizar_funil` | escrita (confirma em certos casos) | PATCH /api/crm/pipelines/{id} | Renomeia um funil ou o define como padrão. |
| `crm_arquivar_funil` | crítica (confirma) | DELETE /api/crm/pipelines/{id} | Arquiva (exclui) um funil SEM negócios. |
| `crm_salvar_etapas` | crítica (confirma) | POST /api/crm/pipelines/{id}/stages | Define a lista completa de etapas em aberto de um funil (ordem, nome, probabilidade, prazo). Lista completa: o que faltar é removido. |
| `crm_criar_cadencia` | escrita (confirma em certos casos) | POST /api/crm/cadences | Cria a cadência de follow-up de uma etapa (passos automáticos; vale só para negócios que ENTRAREM na etapa). |
| `crm_excluir_cadencia` | crítica (confirma) | DELETE /api/crm/cadences/{id} | Exclui uma cadência. |
| `crm_lote_atualizar_negocios` | crítica (confirma) | sob medida | Aplica a MESMA alteração a vários negócios de uma vez (até 100): responsável, previsão ou origem. Sempre pede confirmação e informa quantos serão alte |
| `crm_lote_atualizar_atividades` | crítica (confirma) | sob medida | Aplica a MESMA alteração a várias atividades do CRM (até 100): responsável, data, prioridade. Sempre pede confirmação. Reatribuição em lote não notifi |

### Gestão de Atividades
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `quadro_listar` | consulta | sob medida | Lista os cartões do quadro pessoal de quem pediu (status: open, overdue, today, urgent, done, all). |
| `quadro_criar_atividade` | escrita | sob medida | Cria um cartão no quadro pessoal de quem pediu (a Gestão de Atividades). Para atividade de CRM use crm_criar_atividade; para tarefa de reunião use tar |
| `quadro_atualizar_atividade` | escrita | sob medida | Altera um cartão do quadro pessoal: título, descrição, prazo, prioridade, status, coluna. limparPrazo=true remove o prazo. |
| `quadro_concluir_atividade` | escrita | sob medida | Conclui um cartão do quadro pessoal. |
| `quadro_excluir_atividade` | crítica (confirma) | sob medida | Exclui um cartão do quadro pessoal (vai para a lixeira do quadro). |
| `quadro_checklist` | escrita | sob medida | Mexe no checklist de um cartão: adicionar item, marcar/desmarcar (por itemId ou texto) ou remover. |
| `quadro_responsavel` | escrita | sob medida | Atribui ou remove um responsável de um cartão do quadro pessoal (o responsável é criado na lista da página se ainda não existir). |
| `quadro_comentar` | escrita | sob medida | Adiciona um comentário a um cartão do quadro pessoal. |
| `quadro_criar_coluna` | escrita | sob medida | Cria uma coluna numa página do quadro pessoal. |
| `quadro_criar_pagina` | escrita | sob medida | Cria uma página nova no quadro pessoal (com as colunas A fazer, Em andamento e Concluído). |

### Empresas (cronogramas)
| Ferramenta | Risco | Rota / execução | O que faz |
|---|---|---|---|
| `empresas_listar` | consulta | sob medida | Lista as empresas (cronogramas de clientes) que o usuário pode ver, com contagens. Use para achar o id de uma empresa pelo nome. |
| `empresa_ver_cronograma` | consulta | sob medida | Mostra uma empresa: equipe, fases, reuniões (com tarefas abertas) e atividades (id, status, datas, responsável, fase, nº de subatividades). Para ver a |
| `reuniao_ver` | consulta | sob medida | Lê uma reunião de uma empresa: participantes, resumo, decisões e tarefas (com responsável, prazo e status). Sem reuniaoId, devolve a reunião mais rece |
| `reunioes_buscar` | consulta | sob medida | Busca um tema na memória das reuniões de UMA empresa (resumos, decisões, trechos da conversa) e devolve os trechos mais relevantes com reunião e data. |
| `cronograma_simular` | consulta | sob medida | SIMULA ajustes no cronograma de uma empresa sem gravar nada: mostra o que mudaria e aponta operações inválidas. Sempre simule antes de aplicar mudança |
| `cronograma_aplicar` | escrita (confirma em certos casos) | sob medida | APLICA ajustes no cronograma de uma empresa (status, datas, responsáveis, subatividades, atividades novas; excluir vai para a lixeira). Tudo ou nada.  |
| `tarefas_reuniao_listar` | consulta | sob medida | Lista tarefas de reunião (itens de ação) das empresas que o usuário vê. Filtros: empresa, responsável (parte do nome), status, só vencidas. |
| `tarefa_reuniao_criar` | escrita | sob medida | Cria uma tarefa (item de ação) numa reunião de uma empresa, com responsável, prazo e dono (pricetax ou cliente). |
| `tarefa_reuniao_atualizar` | escrita | sob medida | Altera uma tarefa de reunião: título, responsável, prazo, status (nao-iniciado, em-andamento, concluida, nao-relevante), dono, observações. |
| `tarefa_reuniao_excluir` | crítica (confirma) | sob medida | Exclui uma tarefa de reunião (lixeira). |
| `reuniao_criar` | escrita | sob medida | Cria uma reunião no cronograma de uma empresa (título, data, hora, participantes, resumo, decisões). Tarefas da reunião: tarefa_reuniao_criar. |
| `reuniao_atualizar` | escrita | sob medida | Altera uma reunião: título, data, hora, participantes, resumo, decisões. |
| `reuniao_excluir` | crítica (confirma) | sob medida | Exclui uma reunião (lixeira da empresa). |
| `empresa_atualizar_cadastro` | escrita | sob medida | Altera o cadastro de uma empresa do cronograma: razão social, nome fantasia e situação (ativo/pausado). O CNPJ não se altera por aqui (ele controla o  |
| `empresa_equipe_adicionar` | escrita | sob medida | Adiciona uma pessoa/área à equipe de uma empresa (responsáveis das atividades vêm da equipe). |
| `empresa_equipe_remover` | crítica (confirma) | sob medida | Remove uma pessoa/área da equipe de uma empresa (atividades que já a citam continuam com o nome). |
| `empresa_fase_criar` | escrita | sob medida | Cria uma fase no cronograma da empresa. |
| `empresa_fase_atualizar` | escrita | sob medida | Renomeia uma fase ou altera a descrição. |
| `empresa_fase_excluir` | crítica (confirma) | sob medida | Exclui uma fase; as atividades dela passam para outra fase (a primeira restante). Sempre pede confirmação. |
| `empresa_criar` | escrita (confirma em certos casos) | POST /api/projects | Cria uma empresa (cliente) com o cronograma padrão da casa a partir da data de kickoff. Sempre pede confirmação (cria cronograma completo e libera o C |
| `empresa_excluir` | crítica (confirma) | sob medida | EXCLUI uma empresa e todo o cronograma dela (some da lista; fica só uma cópia por 1 ano que apenas um Master recupera; links públicos, dossiê e reserv |

## 4. Todas as rotas do servidor e como a RENATA as alcança

| Rota | Classificação | Ferramenta / motivo |
|---|---|---|
| `POST /api/_internal/memory-search` | excluída | fora do alcance: Rota interna de verificação. |
| `POST /api/activity/ping` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `GET /api/activity/policy` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `POST /api/activity/usage` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `POST /api/agenda/events/:id/respond` | ferramenta | agenda_responder_convite |
| `POST /api/agenda/events` | ferramenta | agenda_criar_evento |
| `GET /api/agenda` | ferramenta | agenda_listar |
| `POST /api/assistant/ask` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `POST /api/assistant/conversation/clear` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `GET /api/assistant/conversation` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `GET /api/assistant/dossier` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `POST /api/assistant/dossier` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `POST /api/assistant/general/ask` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `POST /api/assistant/messages/:id/action` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `POST /api/assistant/messages/:id/feedback` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `GET /api/assistant/reindex-needed` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `POST /api/assistant/reindex` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `POST /api/auth/change-password-login` | excluída | fora do alcance: Sessão e senha: a RENATA não lida com credenciais. |
| `POST /api/auth/change-password` | excluída | fora do alcance: Sessão e senha: a RENATA não lida com credenciais. |
| `POST /api/auth/login` | excluída | fora do alcance: Sessão e senha: a RENATA não lida com credenciais. |
| `POST /api/auth/logout` | excluída | fora do alcance: Sessão e senha: a RENATA não lida com credenciais. |
| `GET /api/auth/me` | excluída | fora do alcance: Sessão e senha: a RENATA não lida com credenciais. |
| `PATCH /api/auth/me` | excluída | fora do alcance: Sessão e senha: a RENATA não lida com credenciais. |
| `POST /api/client-error` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `POST /api/cnpj/lookup` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/company-calendar/:projectId/apply` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/company-calendar/:projectId` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `DELETE /api/company-share/:projectId` | excluída | fora do alcance: Links públicos e compartilhamento externo: são gerados pela pessoa na tela. |
| `GET /api/company-share/:projectId` | excluída | fora do alcance: Links públicos e compartilhamento externo: são gerados pela pessoa na tela. |
| `POST /api/company-share/:projectId` | excluída | fora do alcance: Links públicos e compartilhamento externo: são gerados pela pessoa na tela. |
| `GET /api/connect/actions` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/activities` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/connect/activities` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/agenda` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/connect/board/plan` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/board` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/connect/companies/:id/meetings/:meetingId/edits/:editId/undo` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/companies/:id/meetings/:meetingId/edits` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/companies/:id/meetings/:meetingId` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `PATCH /api/connect/companies/:id/meetings/:meetingId` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/connect/companies/:id/plan` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/connect/companies/:id/transcripts/:submissionId/retry` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/companies/:id/transcripts/:submissionId` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/companies/:id/transcripts` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/connect/companies/:id/transcripts` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/companies/:id` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/companies` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/me` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/team-day` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `DELETE /api/connect/tokens/:id` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect/tokens` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/connect/tokens` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/connect` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/crm/activities/:id/cancel` | ferramenta | crm_cancelar_atividade |
| `POST /api/crm/activities/:id/complete` | ferramenta | crm_concluir_atividade |
| `POST /api/crm/activities/:id/reopen` | ferramenta | crm_reabrir_atividade |
| `DELETE /api/crm/activities/:id` | ferramenta | crm_excluir_atividade |
| `GET /api/crm/activities/:id` | ferramenta | crm_ver_atividade |
| `PATCH /api/crm/activities/:id` | ferramenta | crm_atualizar_atividade |
| `GET /api/crm/activities` | ferramenta | crm_listar_atividades |
| `POST /api/crm/activities` | ferramenta | crm_criar_atividade |
| `GET /api/crm/board` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/crm/bootstrap/commit` | excluída | fora do alcance: Importações em massa por planilha: precisam do arquivo e da conferência na tela. |
| `GET /api/crm/bootstrap/preview` | excluída | fora do alcance: Importações em massa por planilha: precisam do arquivo e da conferência na tela. |
| `DELETE /api/crm/cadences/:id` | ferramenta | crm_excluir_cadencia |
| `PATCH /api/crm/cadences/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/crm/cadences` | ferramenta | crm_listar_cadencias |
| `POST /api/crm/cadences` | ferramenta | crm_criar_cadencia |
| `GET /api/crm/cnpj/:cnpj` | ferramenta | crm_consultar_cnpj |
| `GET /api/crm/companies/:id/audit` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/crm/companies/:id/merge` | excluída | fora do alcance: Unir empresas move contatos, negócios e histórico: operação administrativa feita pela chave de API ou pela tela, com conferência humana. |
| `DELETE /api/crm/companies/:id/projects/:projectId` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/crm/companies/:id/projects` | ferramenta | crm_vincular_projeto |
| `POST /api/crm/companies/:id/restore` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/crm/companies/:id/timeline` | ferramenta | crm_historico_empresa |
| `DELETE /api/crm/companies/:id` | ferramenta | crm_excluir_empresa |
| `GET /api/crm/companies/:id` | ferramenta | crm_ver_empresa |
| `PATCH /api/crm/companies/:id` | ferramenta | crm_atualizar_empresa |
| `GET /api/crm/companies/by-project/:projectId` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/crm/companies/check-duplicates` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/crm/companies` | ferramenta | crm_listar_empresas |
| `POST /api/crm/companies` | ferramenta | crm_criar_empresa |
| `DELETE /api/crm/contacts/:id` | ferramenta | crm_excluir_contato |
| `GET /api/crm/contacts/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PATCH /api/crm/contacts/:id` | ferramenta | crm_atualizar_contato |
| `POST /api/crm/contacts/check-duplicates` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/crm/contacts` | ferramenta | crm_listar_contatos |
| `POST /api/crm/contacts` | ferramenta | crm_criar_contato |
| `GET /api/crm/deal-files/:fileId/download` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/crm/deals/:id/audit` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/crm/deals/:id/files` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/crm/deals/:id/move` | ferramenta | crm_mover_negocio |
| `PUT /api/crm/deals/:id/tags` | ferramenta | crm_definir_tags_negocio |
| `DELETE /api/crm/deals/:id` | ferramenta | crm_excluir_negocio |
| `GET /api/crm/deals/:id` | ferramenta | crm_ver_negocio |
| `PATCH /api/crm/deals/:id` | ferramenta | crm_atualizar_negocio |
| `GET /api/crm/deals/export.xlsx` | excluída | fora do alcance: Download de arquivo: não é operação de dados. |
| `GET /api/crm/deals` | ferramenta | crm_listar_negocios |
| `POST /api/crm/deals` | ferramenta | crm_criar_negocio |
| `POST /api/crm/import/commit` | excluída | fora do alcance: Importações em massa por planilha: precisam do arquivo e da conferência na tela. |
| `POST /api/crm/import/deals/commit` | excluída | fora do alcance: Importações em massa por planilha: precisam do arquivo e da conferência na tela. |
| `GET /api/crm/import/deals/fields` | excluída | fora do alcance: Importações em massa por planilha: precisam do arquivo e da conferência na tela. |
| `POST /api/crm/import/deals/preview` | excluída | fora do alcance: Importações em massa por planilha: precisam do arquivo e da conferência na tela. |
| `GET /api/crm/import/fields` | excluída | fora do alcance: Importações em massa por planilha: precisam do arquivo e da conferência na tela. |
| `POST /api/crm/import/preview` | excluída | fora do alcance: Importações em massa por planilha: precisam do arquivo e da conferência na tela. |
| `POST /api/crm/leads` | ferramenta | crm_criar_lead_rapido |
| `GET /api/crm/me` | ferramenta | ferramenta sob medida |
| `POST /api/crm/migration/piperun/extract` | excluída | fora do alcance: Migração do PipeRun: operação administrativa feita só pela tela. |
| `POST /api/crm/migration/piperun/import` | excluída | fora do alcance: Migração do PipeRun: operação administrativa feita só pela tela. |
| `GET /api/crm/migration/piperun/preview` | excluída | fora do alcance: Migração do PipeRun: operação administrativa feita só pela tela. |
| `POST /api/crm/migration/piperun/purge` | excluída | fora do alcance: Migração do PipeRun: operação administrativa feita só pela tela. |
| `POST /api/crm/migration/piperun/raw/deal-tags` | excluída | fora do alcance: Migração do PipeRun: operação administrativa feita só pela tela. |
| `POST /api/crm/migration/piperun/raw/histories` | excluída | fora do alcance: Migração do PipeRun: operação administrativa feita só pela tela. |
| `GET /api/crm/migration/piperun/report` | excluída | fora do alcance: Migração do PipeRun: operação administrativa feita só pela tela. |
| `GET /api/crm/migration/piperun/runs/:id` | excluída | fora do alcance: Migração do PipeRun: operação administrativa feita só pela tela. |
| `GET /api/crm/migration/piperun` | excluída | fora do alcance: Migração do PipeRun: operação administrativa feita só pela tela. |
| `DELETE /api/crm/notes/:id` | ferramenta | crm_excluir_nota |
| `PATCH /api/crm/notes/:id` | ferramenta | crm_editar_nota |
| `GET /api/crm/notes/:noteId/attachments/:attId` | excluída | fora do alcance: Download de arquivo: não é operação de dados. |
| `POST /api/crm/notes` | ferramenta | crm_registrar_nota |
| `GET /api/crm/options` | ferramenta | crm_listar_opcoes |
| `GET /api/crm/overview` | ferramenta | crm_painel |
| `GET /api/crm/pipeline` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/crm/pipelines/:id/stages` | ferramenta | crm_salvar_etapas |
| `DELETE /api/crm/pipelines/:id` | ferramenta | crm_arquivar_funil |
| `PATCH /api/crm/pipelines/:id` | ferramenta | crm_atualizar_funil |
| `GET /api/crm/pipelines` | ferramenta | crm_listar_funis |
| `POST /api/crm/pipelines` | ferramenta | crm_criar_funil |
| `DELETE /api/crm/products/:id` | ferramenta | crm_excluir_produto |
| `PATCH /api/crm/products/:id` | ferramenta | crm_atualizar_produto |
| `GET /api/crm/products` | ferramenta | crm_listar_produtos |
| `POST /api/crm/products` | ferramenta | crm_criar_produto |
| `GET /api/crm/projects-available` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/crm/search` | ferramenta | crm_buscar |
| `GET /api/crm/tags` | ferramenta | crm_listar_tags |
| `PUT /api/crm/views-default` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `DELETE /api/crm/views/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PATCH /api/crm/views/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/crm/views` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/crm/views` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/daily/onboarding-complete` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/daily/options` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/daily/preferences` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PUT /api/daily/preferences` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/daily` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/experience/csat/eligible` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `POST /api/experience/csat` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `POST /api/experience/events` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `GET /api/gaps/company/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/gaps/create` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/gaps/overview` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/google/disconnect` | excluída | fora do alcance: Conexão OAuth com o Google: a pessoa autoriza na tela. |
| `GET /api/google/oauth/callback` | excluída | fora do alcance: Conexão OAuth com o Google: a pessoa autoriza na tela. |
| `GET /api/google/oauth/start` | excluída | fora do alcance: Conexão OAuth com o Google: a pessoa autoriza na tela. |
| `GET /api/google/status` | excluída | fora do alcance: Conexão OAuth com o Google: a pessoa autoriza na tela. |
| `POST /api/inventory/area` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/inventory/areas` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/inventory/export.xlsx` | excluída | fora do alcance: Download de arquivo: não é operação de dados. |
| `GET /api/inventory/quality` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/inventory/responsible` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/inventory/suggest-areas` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/inventory` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/knowledge-library/:id/file` | excluída | fora do alcance: Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar. |
| `POST /api/knowledge-library/:id/reprocess` | excluída | fora do alcance: Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar. |
| `POST /api/knowledge-library/:id/restore` | excluída | fora do alcance: Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar. |
| `DELETE /api/knowledge-library/:id` | excluída | fora do alcance: Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar. |
| `GET /api/knowledge-library/:id` | excluída | fora do alcance: Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar. |
| `PATCH /api/knowledge-library/:id` | excluída | fora do alcance: Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar. |
| `POST /api/knowledge-library/search` | excluída | fora do alcance: Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar. |
| `POST /api/knowledge-library/suggest` | excluída | fora do alcance: Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar. |
| `GET /api/knowledge-library` | excluída | fora do alcance: Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar. |
| `POST /api/knowledge-library` | excluída | fora do alcance: Biblioteca de conhecimento: envio de arquivo, edição e arquivamento são feitos pela tela (Conhecimento › Biblioteca); a RENATA consulta pela ferramenta biblioteca_consultar. |
| `POST /api/knowledge/conflicts/resolve` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/knowledge/conflicts` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/knowledge/entities/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/knowledge/entities` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/knowledge/facts/:id/edit` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `DELETE /api/knowledge/facts/:id/entities/:entityId` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/knowledge/facts/:id/entities` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/knowledge/facts/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/knowledge/facts` | ferramenta | conhecimento_buscar |
| `GET /api/knowledge/metrics` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/knowledge/overview` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/macro` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/meeting-inbox/:id/retry` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/meeting-inbox/retry-failed` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/meeting-inbox` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/meeting-inbox` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/mentions/users` | ferramenta | ferramenta sob medida |
| `PATCH /api/notifications/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/notifications/mark-read-for-target` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/notifications/preferences` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PUT /api/notifications/preferences` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/notifications/read-all` | ferramenta | notificacoes_marcar_todas_lidas |
| `GET /api/notifications` | ferramenta | notificacoes_listar |
| `GET /api/ops-intel/alerts` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `GET /api/ops-intel/experience` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `GET /api/ops-intel/map` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `GET /api/ops-intel/overview` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `GET /api/ops-intel/payloads` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `GET /api/ops-intel/policy` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `GET /api/ops-intel/team-day` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `GET /api/ops-intel/users/:id` | excluída | fora do alcance: Telemetria de uso e erros de tela: não é função operacional. |
| `PATCH /api/organizations/:id` | excluída | fora do alcance: Organizações (super administrador): fora do alcance da IA. |
| `GET /api/organizations` | excluída | fora do alcance: Organizações (super administrador): fora do alcance da IA. |
| `POST /api/organizations` | excluída | fora do alcance: Organizações (super administrador): fora do alcance da IA. |
| `DELETE /api/pareceres/:id/comments/:commentId` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PATCH /api/pareceres/:id/comments/:commentId` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/pareceres/:id/comments` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/pareceres/:id/file` | excluída | fora do alcance: Download de arquivo: não é operação de dados. |
| `DELETE /api/pareceres/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PATCH /api/pareceres/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/pareceres/advice` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/pareceres/advice` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/pareceres/study` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/pareceres/study` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/pareceres` | ferramenta | pareceres_listar |
| `POST /api/pareceres` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/personal-board/linked` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/personal-board/stats/day` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/personal-board/stats` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/personal-board/version` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/personal-board/versions/:id/restore` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/personal-board/versions/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/personal-board/versions` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/personal-board` | excluída | fora do alcance: O quadro pessoal inteiro é regravado pela tela; a RENATA usa as ferramentas quadro_* (cartão a cartão). |
| `PATCH /api/personal-board` | excluída | fora do alcance: O quadro pessoal inteiro é regravado pela tela; a RENATA usa as ferramentas quadro_* (cartão a cartão). |
| `GET /api/personal-extras` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PUT /api/personal-extras` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/project-history/:id/diff` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/project-history/:id/versions/:vid/restore` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/project-history/:id/versions` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/project-history/:id/versions` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/project-history/deleted/:vid/restore` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/project-history/deleted/list` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/projects/:id/meetings` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/projects/:id/plan` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/projects/:id/team-candidates` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `DELETE /api/projects/:id` | ferramenta | ferramenta sob medida |
| `PATCH /api/projects/:id` | excluída | fora do alcance: O projeto inteiro é regravado pela tela; a RENATA usa cronograma_*/tarefa_reuniao_* (operação a operação, com log). |
| `GET /api/projects/lite` | ferramenta | ferramenta sob medida |
| `GET /api/projects/versions` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/projects` | ferramenta | ferramenta sob medida |
| `POST /api/projects` | ferramenta | empresa_criar |
| `GET /api/public-board/:token` | excluída | fora do alcance: Links públicos e compartilhamento externo: são gerados pela pessoa na tela. |
| `PATCH /api/public-board/:token` | excluída | fora do alcance: Links públicos e compartilhamento externo: são gerados pela pessoa na tela. |
| `GET /api/public-company/:token` | excluída | fora do alcance: Links públicos e compartilhamento externo: são gerados pela pessoa na tela. |
| `GET /api/public-meeting/:token` | excluída | fora do alcance: Links públicos e compartilhamento externo: são gerados pela pessoa na tela. |
| `GET /api/push/config` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/push/status` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/push/subscribe` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/push/test` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/push/unsubscribe` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/renata/actions/:id/undo` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `GET /api/renata/actions` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `GET /api/renata/catalog` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `POST /api/renata/chat` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `POST /api/renata/conversations/:id/decide` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `GET /api/renata/conversations/:id` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `GET /api/renata/conversations` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `GET /api/renata/status` | excluída | fora do alcance: A própria RENATA: sem recursão. |
| `POST /api/standard-plan/apply` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/standard-plan/audit/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/standard-plan/preview` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/standard-plan/template/draft/diff` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/standard-plan/template/draft/discard` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/standard-plan/template/draft` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PATCH /api/standard-plan/template/draft` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/standard-plan/template/instantiate-preview` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/standard-plan/template/proposals/:key/load` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/standard-plan/template/proposals` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/standard-plan/template/restore/:version` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/standard-plan/template/versions/archive` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/standard-plan/template/versions` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/standard-plan/template/versions` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/task-links/backfill/cancel` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/task-links/backfill/estimate` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/task-links/backfill/status` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/task-links/backfill` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/task-links/confirm-high` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/task-links/decide` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/task-links/eval` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/task-links/forget` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/task-links/learning` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/task-links/pending` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/task-links/suggest` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/task-links` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `DELETE /api/templates/:id/comments/:commentId` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PATCH /api/templates/:id/comments/:commentId` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/templates/:id/comments` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/templates/:id/file` | excluída | fora do alcance: Download de arquivo: não é operação de dados. |
| `GET /api/templates/:id/items/:itemId/file` | excluída | fora do alcance: Download de arquivo: não é operação de dados. |
| `DELETE /api/templates/:id/items/:itemId` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PATCH /api/templates/:id/items/:itemId` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/templates/:id/items` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `DELETE /api/templates/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PATCH /api/templates/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/templates` | ferramenta | modelos_listar |
| `POST /api/templates` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/users/:id/access` | excluída | fora do alcance: Usuários, acessos, bloqueios e senhas: só o administrador, pela tela (segurança). |
| `POST /api/users/:id/block` | excluída | fora do alcance: Usuários, acessos, bloqueios e senhas: só o administrador, pela tela (segurança). |
| `POST /api/users/:id/renew` | excluída | fora do alcance: Usuários, acessos, bloqueios e senhas: só o administrador, pela tela (segurança). |
| `POST /api/users/:id/reset-password` | excluída | fora do alcance: Usuários, acessos, bloqueios e senhas: só o administrador, pela tela (segurança). |
| `DELETE /api/users/:id` | excluída | fora do alcance: Usuários, acessos, bloqueios e senhas: só o administrador, pela tela (segurança). |
| `PATCH /api/users/:id` | excluída | fora do alcance: Usuários, acessos, bloqueios e senhas: só o administrador, pela tela (segurança). |
| `GET /api/users` | excluída | fora do alcance: Usuários, acessos, bloqueios e senhas: só o administrador, pela tela (segurança). |
| `POST /api/users` | excluída | fora do alcance: Usuários, acessos, bloqueios e senhas: só o administrador, pela tela (segurança). |
| `GET /api/widget/status` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/widget/summary` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `DELETE /api/widget/token` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/widget/token` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `POST /api/widget/token` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/widget/views` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `PUT /api/widget/views` | excluída | fora do alcance: Chaves de API, widget e notificações push: credenciais e dispositivos da própria pessoa. |
| `GET /api/xflow/affected-companies` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/xflow/team` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `GET /api/xflow/tickets/:id/events` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `POST /api/xflow/tickets/:id/view` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `DELETE /api/xflow/tickets/:id` | genérica | acesso genérico (plataforma_consultar / plataforma_executar com confirmação) |
| `PATCH /api/xflow/tickets/:id` | ferramenta | xflow_acao |
| `GET /api/xflow/tickets` | ferramenta | xflow_listar |
| `POST /api/xflow/tickets` | ferramenta | xflow_criar |
| `GET /d/:token/:file` | excluída | fora do alcance: Links públicos e compartilhamento externo: são gerados pela pessoa na tela. |

