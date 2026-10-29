# Histórico de commits (gerado do git)

> Gerado automaticamente por `scripts/docs-gen.mjs` a partir do código. **Não edite à mão** — rode `npm run docs:gerar`.

489 commits, do mais recente ao mais antigo. Horário do commit **como gravado pelo git na máquina de deploy** (use com cuidado: pode estar em UTC ou Brasília). O "porquê" detalhado de cada mudança está no `PROJECT_CONTEXT.md`.

## 2026-10-29 (6)

- `6f5ab4d` 01:14 — RENATA: resposta forçada ao estourar os passos, ferramentas para ler reunião, horário (GMT-3) e botões Atualizar/Limpar conversa
- `0235665` 01:01 — RENATA geral também orienta com base nos pareceres já estudados
- `b531711` 00:52 — RENATA orienta por conta própria com base nos pareceres já estudados
- `3b25475` 00:34 — RENATA geral: não mostrar códigos internos [id=…] nas respostas
- `b6d34f1` 00:25 — Pareceres: estudo cortado pela IA deixava o parecer longo pendente para sempre
- `a952d86` 00:20 — API de conectividade: duas chaves na tela (Ler tudo / Ler e editar tudo); escopos antigos seguem válidos em Avançado

## 2026-10-28 (5)

- `f0c129a` 20:26 — API de conectividade: IA externa corrige reuniões registradas (escopo meetings_edit)
- `d9469b5` 18:59 — API de conectividade: IA externa envia transcrição de reunião e a RENATA processa (escopo transcripts)
- `fca3e3f` 17:54 — Guia da API de conectividade: extrair Excel do CRM pela chave; teste e documentação do acesso dos sócios
- `1916b8b` 17:08 — CRM: Exportar Excel nativo nos Negócios (filtros da tela, e-mail, telefone e link do WhatsApp)
- `84db77d` 16:41 — CRM: botão Copiar link na ficha do negócio (exige login) e aviso de acesso negado por endereço

## 2026-10-27 (12)

- `a9e1ba8` 17:30 — Biblioteca da RENATA: estudo de material longo não é mais cortado (LC 214)
- `a60db10` 16:37 — Biblioteca da RENATA: título, tema e etiquetas preenchidos pela IA ao escolher o arquivo
- `7ec3b3b` 14:52 — Coluna compartilhada: histórico da coluna, atualização em ~15 s e busca por link mais leve
- `12404ef` 14:41 — Gestão de Atividades: link público de uma COLUNA (com "Voltar")
- `19cd55c` 14:30 — Quadro público: botão "Voltar ao quadro anterior" e "Copiar link" de um clique
- `a98b10a` 14:20 — CRM: quadro mais leve para computador velho (arrastar sem travar)
- `84f9be6` 14:08 — CRM: o cartão muda de etapa na hora ao arrastar, com aviso, Desfazer e retentativa
- `12e6f7c` 13:41 — Quadro pessoal: retentativa automática quando o salvamento falha
- `00d163e` 13:30 — Logs de produção: script pela API da Railway (token de workspace) e documentação
- `ae8744a` 13:16 — Quadro pessoal: duas abas não apagam mais o trabalho uma da outra
- `ddefb9a` 09:33 — Biblioteca de conhecimento da RENATA: enviar material (PDF, Word, PowerPoint, Excel, texto), estudar, buscar por trechos e usar nas respostas
- `1b8e8a1` 09:03 — RENATA: copiar mensagem isolada, copiar a conversa toda e exportar (txt, md, Word, PDF, Excel, JSON)

## 2026-10-26 (23)

- `2a2fea9` 16:30 — Tira exports/ do repositório (arquivos de trabalho de cliente que entraram por engano) e passa a ignorá-lo
- `183f9ab` 16:29 — Daily: filtro por prazo (atrasadas, hoje, semana, período, sem data) e exportação em PDF e Excel
- `3e613ce` 14:26 — Ajuste do cronograma por operações via sessão (simula por padrão), para lotes com texto exato
- `788eb21` 12:09 — Registrar reunião inteira por API (transcrição, resumo, decisões, tarefas), idempotente
- `26e6f86` 11:35 — RENATA: ao adiar atividade, desloca também as subatividades (achado do teste real em produção); doc do teste
- `d7eff0c` 11:23 — CRM: busca de negócios acha comentários/tags/contatos/atividades; aviso 'nova versão' genérico; RENATA sabe a origem do nome
- `49313b6` 11:08 — CRM: CNPJ automático (Receita) no novo negócio/empresa, origem editável e criável, contato principal criável/editável, unir empresas, domínio do e-mail desempata, responsável Eduarda no importador
- `cf62889` 10:55 — CRM: calendário/horário sem corte (react-day-picker + floating-ui), atividade espelhada no Google Calendar do responsável, filtro por várias tags, curva A-D e comentários do evento, visual com cor
- `52200e8` 10:39 — CRM: documentação e teste da importação dos leads do evento (executada em produção: 313 negócios)
- `e91d4da` 10:11 — CRM: negócio aceita chave externa (origem_id), filtro por ela e skipCadence; importador repetível dos leads do evento 22-23/10
- `d47dd7b` 08:14 — Gestão de Atividades: Daily por responsável (atividade principal + subatividades, data, copiar texto)
- `0a069e3` 08:00 — Gestão de Atividades: prazo da atividade segue a subatividade mais distante (RENATA aplica a mesma regra)
- `c5a1dcb` 07:57 — Gestão de Atividades: Buscar encontra subatividades e indica em qual atividade estão
- `dda3935` 07:48 — Checklist: editar um item fecha o painel de responsável aberto em outro
- `71b4032` 07:44 — Checklist: painel de responsável do item compacto (uma linha)
- `d111a3d` 07:39 — Checklist do cartão: responsável por sub-atividade e mover para cima/baixo (RENATA: quadro_checklist ganha mover e responsável)
- `16bac9a` 07:33 — Gestão de Atividades: responsáveis por atividade (criar no cartão e no quadro público, avatares, RENATA quadro_responsavel)
- `8ccaa99` 07:15 — Gestão de Atividades: prazo em cada item do checklist (selo por situação, campo de data, RENATA define prazo)
- `5b9a028` 06:46 — Docs: cenários de escrita da RENATA com a IA real em produção
- `15abe31` 06:42 — RENATA: contenção de lote disfarçado, desfazer de lote, prévia do lote com valores
- `70157c5` 06:33 — RENATA: criar empresa e excluir empresa (nome digitado + confirmação)
- `d9d0bad` 06:13 — RENATA: leitura do cronograma em resumo (reuniões primeiro), corte de laço de consulta repetida
- `fab696d` 06:08 — RENATA: dependências entre subatividades, reuniões, cadastro/equipe/fases, checklist/comentário/páginas/colunas do quadro, ações do XFlow e cache de ferramentas

## 2026-10-25 (44)

- `69ed7ce` 23:51 — RENATA: confirmação mostra o nome do cartão/tarefa; documentação com a verificação em produção
- `671084b` 23:45 — RENATA operacional: catálogo de 81 ferramentas, executor com auditoria imutável, confirmação/desfazer, agente com conversa persistente, painel em todas as telas e matriz de cobertura
- `cd81b65` 23:10 — Mensagem do dia: 47 frases de líderes conferidas na fonte (com original e orientação prática) e aviso da RENATA para as sem comprovação
- `8b1c0cd` 22:53 — Linha do tempo mostra o nome (não o id) em troca de responsável; doc da transferência dos negócios do Maurício
- `881cdad` 22:47 — CRM por chave: silentNotify na reatribuição de atividades em lote
- `991d260` 22:38 — Docs: primeiro uso da chave do CRM em produção (funil comercial arquivado)
- `fbcc772` 22:29 — Chave do CRM: dono pode ser usuário dedicado Claude Code (administrador do CRM), registro só Claude Code e log da organização
- `91861bd` 22:04 — Claude Code opera o CRM por chave de API (escopo crm_operate), registrado como Claude Code, com registro de ações e autorização permanente documentada
- `356a29b` 20:53 — Docs: cadência de follow-up criada em produção
- `4f54413` 20:51 — Docs: estado da cadência e correção do roteiro de aceite
- `deeb7b2` 20:51 — Docs: roteiro de aceite da Eduarda e estado da cadência (§98)
- `30e8ee0` 20:44 — Docs: verificação em produção das visões salvas e dos painéis por função (§98)
- `ff02b4e` 20:38 — CRM: visões salvas de Negócios (pessoais/do time, padrão ao abrir) e Visão geral por função (Meu dia, Time, Receita, Contas)
- `ff7ba44` 20:17 — Experiência de uso: medição de atrito por fluxo e nota de satisfação de 1 clique, sem vigilância (aba na Central de Inteligência)
- `a9a19ea` 20:00 — Erros em português claro: servidor com código de suporte no log, banco/validação traduzidos, navegador sem rede/sessão/servidor fora do ar
- `ce91e34` 19:25 — Paleta de comandos (Ctrl+K): ações do CRM (criar, fila de follow-ups) e busca de negócios, empresas e contatos do CRM
- `9cb397e` 19:18 — CRM: edição direta na lista de negócios (etapa, valor, previsão, responsável) com desfazer, reagendar na Agenda, contato e próximo passo na lista
- `87a64de` 19:07 — CRM: cadência de follow-up por etapa e Fila de follow-ups (concluir e próximo), contato com links legíveis
- `528afdb` 18:54 — docs: acesso da Eduarda ao CRM confirmado (Gestor Comercial)
- `9778598` 18:44 — CRM: prontidão da Eduarda — contato com ligar/WhatsApp, lead rápido, anexos sob demanda (ficha de 16 MB), mrr nulo, funil do 1º acesso; auditoria e sandbox local
- `a3e2f1b` 18:27 — Corrige defeitos achados na consolidação: lacunas sem duplicar no clique duplo, API pxk_ (pulada), exemplos da IA, textos da tela e do guia, busca da Triagem e Log do link público
- `83b6cad` 18:20 — docs: consolida 2026-10-06 a 10-22 em PROJECT_CONTEXT §86-§91 (conferido no código), mapa, variáveis de ambiente e débitos conhecidos
- `604a7b8` 18:16 — Dependências: npm audit fix (body-parser 2.4.0, fast-uri 3.1.9, serialize-javascript 7.1.4) — 0 alertas
- `e0ece9e` 18:08 — docs: §15 com as pendências do PipeRun e da consolidação de outubro
- `7f2a9e4` 18:08 — docs: §85 (auditoria e complementos do PipeRun), linha do tempo e mapa; lacuna 10-06 a 10-24 sinalizada
- `c31791f` 18:05 — docs: auditoria PipeRun — Atendimento/WhatsApp descartado
- `0284c27` 18:03 — docs: auditoria PipeRun — 3ª leva aplicada e pendências que não são código
- `c04db03` 18:00 — CRM/PipeRun: formulários, assinaturas e motivo de perda; referência da configuração do PipeRun
- `f5cbd87` 17:56 — docs: auditoria PipeRun — tags, previsão, MRR, produtos e etapas aplicados em produção
- `2fb10f7` 17:49 — CRM/PipeRun: produtos apagados no PipeRun entram inativos no catálogo
- `dc220d7` 17:45 — CRM: MRR, tags, previsão, produtos e etapas/SLA do PipeRun (2ª leva da migração)
- `c597d15` 17:36 — docs: auditoria PipeRun — histórico real aplicado em produção
- `99fa492` 17:13 — docs: auditoria PipeRun — item 2 resolvido em produção
- `b203fca` 17:05 — CRM/PipeRun: <img> que aponta para PDF vira anexo de download
- `0164175` 16:58 — redeploy: reenvia o deploy que falhou logo após o anterior
- `4b5c102` 16:32 — CRM/PipeRun: imagens das anotações viram anexo da nota; histórico real carregável do backup pela tela
- `5f12837` 16:27 — docs: auditoria da migração PipeRun (parecer, backup, origem × destino, pendências)
- `be97299` 16:02 — CRM: automação "ao ganhar" (cópia em outro funil), reproduzindo a automação ativa do PipeRun
- `498c309` 15:55 — CRM: histórico real de etapas do PipeRun, autoria fiel e melhorias de uso (cartão, filtros, ficha, exportar)
- `e9d2243` 15:40 — Docs: migração PipeRun executada em produção, conferência sem divergências
- `da09c33` 15:37 — Migração PipeRun: limite de arquivo sobe de 20 para 30 MB
- `a93a1fe` 15:20 — Migração PipeRun → CRM pela API: extração, prévia, importação, conferência e arquivos do negócio
- `92ccc88` 14:53 — Versionamento, backup e restauração do cronograma (histórico auditável, comparar, restaurar com backup e desfazer)
- `ab3590c` 14:24 — Central de Inteligência Operacional: tempo medido x estimado, mapa de acessos, alertas e transparência (LGPD)

## 2026-10-23 (1)

- `884487b` 07:45 — Docs: ajustes da Vellore depois da reunião de 22/10

## 2026-10-22 (2)

- `d39d13a` 16:19 — PDF: tema escuro e claro, janela Exportar PDF e relatório refeito
- `839cb9e` 16:00 — Docs: microatividades da Vellore

## 2026-10-21 (1)

- `701e965` 00:17 — Docs: cronograma da Marombas

## 2026-10-20 (23)

- `dc4f1a6` 21:55 — Docs: e-mail da ALCAST
- `f500ce6` 21:47 — Docs: reunião de TI em 30/10 na ALCAST
- `e7838ae` 19:31 — Docs: notas técnicas e triagem de 2026 na ALCAST
- `eb3f807` 19:23 — Docs: ajuste de redação
- `b912141` 19:23 — Docs: agenda da ALCAST refeita (sem Go/No-Go, com folga entre reuniões)
- `f24931e` 19:20 — API de conectividade: renomear atividade
- `5a2a5fa` 19:06 — Docs: workshop com fornecedores restaurado e Documentação Extra removida na ALCAST
- `5ac7670` 19:03 — Docs: limpeza da ALCAST (DeRE e itens genéricos excluídos)
- `84201b3` 19:02 — API de conectividade: excluir atividade e subatividade (soft delete, volta pela lixeira)
- `a615d9a` 18:21 — Docs: sequência reunião, tarefa de casa e reunião refeita na ALCAST
- `1133a52` 17:33 — Docs: 16 atividades novas da auditoria gravadas na ALCAST
- `7be916e` 17:32 — Docs: responsável padrão e correções da auditoria aplicados na ALCAST
- `b142e8e` 14:16 — Docs: registro da auditoria do cronograma ALCAST (material de cliente fica em exports, fora do git)
- `7536da7` 13:21 — Triagem: painel do dia em cartão de reunião com pauta compacta, outros itens separados e atalhos de vínculo; calendário com (+N)
- `c5b179d` 13:10 — A atividade estica sozinha para cobrir subatividade que mudou de data (painel e API); auditoria de períodos da ALCAST
- `2147ef4` 13:00 — Docs: 2ª gravação de agenda da ALCAST e direção para dezembro e janeiro
- `f9a4eda` 12:47 — Docs: regras de agenda da ALCAST e reuniões mãe gravadas (ERP e SAP, Vendas, Fiscal)
- `72c25c4` 12:40 — API de conectividade: reunião mãe e pauta (sub.add top/guide/pautaDe, pauta.link) e leitura de pautaDe e guide
- `2293436` 12:10 — Triagem: mostra o roteiro do encontro de cada item na lista e no painel do dia
- `6cc7949` 12:01 — Mover subatividade por clique e vincular itens à pauta da reunião em lote (itens abaixo e de outras atividades)
- `acf35e0` 11:47 — Pauta da reunião: botão Tratar na reunião de cima vincula o item de trabalho à reunião e a data acompanha; pauta vai na descrição do evento
- `dcfdb15` 11:37 — Triagem: visão de calendário (mês), filtro Ambos/Reunião/Trabalho e arrastar para mudar a data
- `0b34296` 10:21 — Aba Triagem: marcar Reunião ou Trabalho e a data de cada atividade e subatividade, com aviso de duas reuniões no mesmo dia

## 2026-10-19 (48)

- `8845cb0` 22:30 — Tipo Reunião/Trabalho em atividade e subatividade: só reunião vai para a agenda e só uma reunião por dia; encontros como subatividades do tipo Reunião; kind na API e nos dados
- `b7dd5de` 22:07 — Reservar na agenda: atividades podem cair no mesmo dia (a restrição de um por dia vale só para reuniões); dia do bloco dentro do período
- `2a06ff7` 21:58 — Reservar na agenda: um bloco por dia na mesma empresa (dia próprio dentro do período, distribuir dias, bloqueio na tela e no servidor)
- `22f1aa6` 21:50 — Reservar na agenda: atividade do cronograma vira bloco de 60 min no Google Calendar da equipe PRICETAX (convite só aos e-mails digitados, sem cliente)
- `28f4d2c` 21:16 — Link do cliente curto (/a/<12 caracteres>) e link de dados para Power BI (/d/<token>/atividades.csv, subatividades.csv, dados.json), independentes entre si
- `a94a7c9` 21:03 — Tarefas das reuniões: botões Zerar vínculos e Vincular/sugerir atividades (não alteram o cronograma), aviso ⚠ de datas que não batem
- `f63e1d9` 20:45 — RENATA: vínculo automático a partir de 50%, conjunto fechado de todas as atividades da empresa, dicionário de atividades e conclusão sincronizada entre tarefa e atividade (só vínculo validado)
- `9b2f286` 20:18 — Mapa: Ajustar tela abre o mapa em tela cheia (filtros recolhidos, Esc fecha, detalhe da atividade abre por cima)
- `a8338b0` 20:06 — Dossiê: ao subir o servidor, gerações em andamento viram erro (o job morre com o reinício e travava o botão por 45 min)
- `cdf863e` 19:57 — Página pública: aba Prazos legais, bloco Aguardando a empresa, dias para a virada, Tabela com responsável herdado e Gantt com nomes legíveis
- `d8ebd55` 19:47 — Página pública: etiqueta de quem responde (PRICETAX ou a empresa) no fim de cada passo e no filtro
- `d66fd22` 19:27 — Página pública: etiqueta de situação não estica mais em Em andamento agora
- `a05f996` 19:21 — Proposta v5 do cronograma padrão: atividade própria de saldos credores (ICMS, IPI, PIS e COFINS), v4 intacta
- `f71e601` 19:08 — Página pública: Em andamento agora e Calendário dos próximos passos por semana, com filtro por quem responde
- `030fe0e` 18:30 — API de conectividade: operação sub.move (move subatividade entre atividades, sem apagar)
- `70f5c86` 18:06 — Excel da empresa: aba Subatividades com uma subatividade por linha
- `42cec8a` 18:01 — Link público de acompanhamento da empresa: /acompanhamento/<token> (Resumo, Cronograma com subatividades e Tabela, só leitura; editar exige login)
- `f2d4c6b` 17:25 — API de conectividade: escopo read_write para ajustar o cronograma de uma empresa (dryRun, tudo-ou-nada, Log, desfazer; só admin)
- `2a3ec1c` 16:40 — Histórico de versões do cronograma padrão: arquivar/desarquivar (manter só a 1.0 e a atual), propostas recolhidas
- `c1e29bb` 16:32 — Remove planilhas de exportação de novo (não pertencem ao repositório)
- `ea28fce` 16:31 — Transcrição de reunião: tipo do item (kind) deixa de ser enum rígido e é normalizado (incidente em produção)
- `820ec18` 16:22 — Remove planilhas de exportação adicionadas por engano no commit anterior
- `90281c2` 16:22 — v4 do cronograma padrão: cobre as 25 lacunas do cruzamento com o Tecumseh (13 subatividades novas, 10 títulos e 4 roteiros ajustados; 193 -> 206)
- `408c037` 16:13 — RENATA nao cria atividade do cronograma: so tarefa em atividade padrao existente, sem encaixe fica pendente
- `417fc52` 16:01 — Registro das reunioes do comite: reuniao vinculada na subatividade, tipo da tarefa (tarefa, decisao, risco, pendencia) com sugestao da IA e roteiros do registro vivo
- `e6979ad` 15:45 — Proposta v4 (modelo ideal do comite de reforma tributaria) e campo Roteiro na subatividade
- `686ad40` 14:24 — Proposta v3 de 8 meses contados da assinatura do contrato: e-mail de boas-vindas no kickoff, janelas por atividade, tudo D+n do inicio
- `83b08e1` 13:41 — Doc da proposta v3: remove go/no-go do marco de 22/12
- `2f4c227` 13:41 — Prontidao da virada: remove go/no-go (a reforma entra em 01/01/2027 de qualquer forma) na v3, semente da 2.0 e modelo antigo
- `00de86a` 13:36 — Aba Fases: numero da fase pela posicao (01 Diagnostico, 02 Mobilizacao...)
- `a544282` 13:25 — Proposta v3: Diagnostico PRICETAX em sequencia (5/10/10/10/3/5/5 dias), primeira fase; janela da atividade principal respeitada ao instanciar
- `966f228` 13:19 — Aba Mapa (ex-Arvore): navegacao de mapa (zoom na roda, arrastar, pinca, ajustar) e busca da tela aberta em todas as abas
- `7ee9ef3` 13:05 — Aba Arvore: mapa mental do cronograma (fase/responsavel/situacao, filtros, busca, expandir, zoom)
- `780c922` 12:51 — Tabela: selo #N abre a atividade e usa a cor da fase; titulo da atividade em negrito
- `21a7efd` 12:45 — Empresas: um clique no nome ou logotipo entra na empresa; caixinha em coluna propria com separador
- `73e7a7b` 12:38 — Aviso de nova versao: avisa a cada deploy (nao so o primeiro da sessao), checa a cada 1 min e ao voltar para a aba
- `fd2341e` 12:20 — Velocimetro da atividade e seletor feita/pulada nas subatividades (com motivo, quem e quando)
- `f2a8920` 12:14 — Detalhe da atividade: subatividades no lugar dos comentarios (nomes completos) e comentarios na coluna da direita
- `c21900c` 11:54 — Ajustar datas automaticamente (caixa por empresa) e travar data: mudar uma data empurra as seguintes, com aviso e desfazer
- `bb4a02f` 11:40 — Auditoria compara a empresa com a versao atual do cronograma padrao (datas por ancora, limite e predecessoras)
- `c46a867` 11:32 — Cronograma padrao: regra do limite (prazo comprimido), avisos de atividade vencida e previa no cadastro da empresa; v3 com datas proprias antes do limite
- `cf9177b` 11:22 — Proposta v3 do cronograma padrao carregavel no rascunho; ancoras (virada e fixa) mantem a data na empresa nova
- `8cda8ed` 11:15 — Subatividades ganham prioridade, executor, areas, limite da norma, predecessoras, recorrencia, ancora e codigo; versoes do cronograma padrao enxergam os campos
- `147ea78` 11:07 — Cronograma padrao: marca a versao 2.0 como provisoria e registra o plano e o rascunho da v3
- `9467d89` 10:34 — Cronograma padrao editavel e versionado: tela de empresa com rascunho, versoes 1.0/2.0/3.0, empresa nova segue a ultima versao com data do kickoff
- `0665c78` 10:07 — Ver cronograma padrao: proposta 0.1 (5 fases, 20 principais, 87 filhas) somente leitura no seletor de empresas
- `86e6819` 07:58 — Botao Hoje abaixo do prazo no detalhe do cartao da Gestao de Atividades
- `e9bd07b` 07:37 — Auditoria da empresa contra o padrao: botao Auditoria, ausentes, comparativo de datas e alertas de coerencia (somente leitura)

## 2026-10-17 (20)

- `6ee5711` 13:53 — Documenta a ativacao das chaves de push em producao (sem mudanca de codigo)
- `94092ba` 13:51 — Log de inicializacao informa se as notificacoes push estao ativadas
- `9d45ce0` 02:54 — Notificacoes push (Web Push/VAPID): envio a partir do sino, inscricao por aparelho, eventos no service worker e bloco 'Avisos neste aparelho'; dormente ate configurar as chaves VAPID
- `495fdde` 02:44 — Roteiro de teste mobile em aparelho real (docs/ROTEIRO_TESTE_MOBILE.md), sem mudanca de codigo
- `aa0187c` 02:38 — PWA: app instalavel (manifesto, icones, service worker sem precache e sem cache de /api) e tela 'Sem conexao' no boot sem rede
- `4808c29` 02:29 — Mobile (Fase 0, item J): arrastar no toque na Tabela (reordenar linhas) e no Gantt (mover barra) com Pointer Events
- `56292f8` 02:21 — Mobile (Fase 0, item F): tablet — Tabela rola em vez de ficar inalcancavel e alvos de toque de 44 px entre 768 e 1023 px / toque grosso
- `394b699` 02:10 — Mobile (Fase 0, itens D e E): alvos de toque de 44 px nos modais e Gestao de Atividades mais compacta no celular (menu Mais acoes, ordenacao dentro de Filtros)
- `b22e798` 01:55 — Mobile (Fase 0, itens A-C): Tabela e Fases deixam de ser cortadas em celulares estreitos; regra de 16 px do iOS cobre input sem type e contenteditable
- `0128917` 01:46 — Fase 0 do plano mobile: auditoria medida (docs/AUDITORIA_MOBILE_FASE0.md), sem mudanca de codigo
- `7e9df5a` 01:22 — Chip de tarefas nas Fases (uma empresa e multiempresa)
- `55fcd85` 01:17 — Chip de tarefas no Gantt (coluna de rotulos, uma empresa e multiempresa)
- `801dada` 01:13 — Chip de tarefas no Quadro do modo uma empresa
- `745363d` 01:10 — Chip de tarefas no Quadro do modo multiempresa (KanbanView com taskCounts/onOpenTasks opcionais)
- `a4de4d9` 01:02 — Documenta a verificacao do chip de tarefas na visao de grupo empresarial (sem mudanca de codigo)
- `6ee3fdc` 00:57 — Chip de tarefas no modo multiempresa: Tabela da visao geral mostra N tarefas / M abertas por atividade e o clique abre a empresa na aba Tarefas filtrada
- `21e46c8` 00:52 — Move MEETINGS_CSS para meetings/meetingsCss.js: o TodoBoard deixa de depender de Meetings.jsx
- `879e716` 00:47 — Tira os helpers de status de Meetings.jsx (meetings/todoStatus.js) e carrega detalhe da reuniao, reuniao publica e RENATA sob demanda (pacote principal 717 KB -> 569 KB)
- `16c6ac4` 00:38 — Divide o AppScreens e o S: estilos em src/styles/S.js, acoes em src/app/*.js (fabricas) e area da empresa em src/screens/CompanyWorkspace.jsx; App.jsx 5.030 -> 3.209 linhas, sem mudanca de comportamento
- `7afc748` 00:03 — Divide o App.jsx: telas de administracao, quadro pessoal e vistas da empresa vao para src/screens/ e carregam sob demanda (pacote principal 1,1 MB -> 733 KB)

## 2026-10-16 (13)

- `e4cd791` 23:40 — Selo Aguardando no modo Lista do quadro pessoal (desktop na coluna Status; celular abaixo do titulo)
- `403c1f9` 23:27 — Limite de erro nos modais e gavetas do XFlow e do CRM (guardedModal): uma falha fecha so o modal, com Tentar de novo e Fechar
- `d4fb73d` 23:12 — Sourcemap so para o log: pilhas dos erros do navegador saem com arquivo e linha do codigo-fonte
- `1eed0b1` 22:49 — Captura global de erros do navegador (window.onerror e unhandledrejection) registrada no log do servidor, com filtro de ruido e cotas separadas das falhas de tela
- `ce8f849` 22:42 — Limites de erro (error boundaries) nas telas principais: raiz, AppScreens, um por modulo, aba da empresa e modais; erros vao para o log do servidor
- `0cf4207` 22:21 — Visoes 4 a 6 da Gestao de Atividades: marcador Aguardando, painel com calendario do mes, anotacoes rapidas e atalhos
- `5768a28` 22:00 — Detalhe da atividade lista as tarefas de reuniao vinculadas (abre a tarefa na reuniao de origem; botao leva a aba Tarefas filtrada)
- `ac7d60e` 21:54 — Chip "N tarefas · M abertas" tambem na aba Tabela (linha desktop e card de celular); abre Tarefas filtrada pela atividade
- `6c8260d` 21:45 — Onda 4 de bibliotecas: Express 5, React 19, lucide 1.58, SDK Anthropic 0.135, googleapis 186, bcryptjs 3
- `fbb23e0` 21:35 — Onda 3 de bibliotecas: Vite 5 -> 8, plugin-react 4 -> 6, concurrently 8 -> 10 (npm audit 2 -> 0); engines.node >=22.12
- `ca3eaca` 17:38 — Onda 2 de bibliotecas: Tiptap 2 -> 3 e SheetJS 0.18.5 -> 0.20.3 (npm audit 33 -> 2, so vite/esbuild de dev); conserta o botao de recuo do XFlow
- `efa41a0` 17:23 — Code-splitting: pacote principal de 1,99 MB para 1,0 MB (xlsx sob demanda; XFlow, Agenda, Visao Geral, Conhecimento, Pareceres, Modelos, tarefas, Indicadores e editor em pedacos), aviso amigavel se um pedaco falhar, cac…
- `c1b962e` 16:38 — Onda 1 de bibliotecas (npm audit fix sem force: criticos 2 -> 0) e melhorias visuais 1-3 da Gestao de Atividades: Nova atividade global (N), + na coluna, visoes rapidas e Resumo do dia; corrige 500 da aba Metricas

## 2026-10-15 (2)

- `30414c2` 17:14 — Padrao de cronograma aprimorado (guia do Felipe): modelo novo com 15 atividades e aba Padrao na Visao Geral para aplicar nas empresas existentes, sem alterar prazos, status ou responsaveis
- `2a98801` 15:43 — Docs: plano para aprimorar o cronograma padrao com o guia do Felipe (sem mexer em prazos; so plano)

## 2026-10-14 (1)

- `f42eac3` 09:20 — Docs: estudo do guia 'Reforma Tributaria 2027 - Guia por area' como norte dos projetos (so estudo, nada implementado)

## 2026-10-13 (9)

- `13b0e9e` 19:29 — Vinculo tarefa -> atividade para registros ja existentes: varredura da base em segundo plano (admin) e revisao central das sugestoes
- `b38ab04` 19:24 — Docs: avaliacao real de tarefa -> atividade passou em producao (precisao 100%, cobertura 98%)
- `2951ad3` 19:08 — Avaliacao tarefa -> atividade: casos revisados (56 casos, 19 atividades, armadilhas de palavra-chave) e SYSTEM exportado
- `a61a4a1` 18:55 — Vinculo tarefa -> atividade (Fase 5): conjunto de avaliacao com 35 casos e criterio de liberacao, botao Rodar avaliacao, custo e erros, chave TASK_LINK_MODE e testes de isolamento
- `7161a7e` 18:38 — Vinculo tarefa -> atividade (Fase 4): painel de aprendizado e taxa de acerto na Central de Conhecimento, Esquecer (admin), Levantamento e RENATA enxergando o vinculo
- `bc17a4a` 18:31 — Vinculo tarefa -> atividade (Fase 3): aprendizado com as decisoes (piso de 3 empresas), exemplos da propria empresa para a IA, Sugerir atividades para tarefas pendentes e tarefa da RENATA ja com sugestao
- `1f5759a` 18:24 — Vinculo tarefa -> atividade (Fase 2): RENATA sugere a atividade ao gerar tarefas da transcricao; Confirmar/Trocar/Nenhuma, confirmar em bloco, decisao no livro-razao
- `e1f87ff` 18:15 — Vinculo tarefa de reuniao -> atividade do cronograma (Fase 1): campo na tarefa, seletor, filtro, contagem no Resumo e livro-razao task_activity_links
- `b6c1bfb` 17:23 — Indicadores: subatividade concluida conta como ganho do dia (doneAt no item, evento step_done, Ganhos do dia = encerradas + subatividades)

## 2026-10-09 (3)

- `0c69742` 16:20 — Empresas: remove a lista suspensa de responsavel; a faixa Por responsavel passa a ser o unico controle
- `6423abc` 16:08 — Tela de empresas: acabamento do novo desenho e faixa 'Por responsavel' com a contagem de empresas por pessoa
- `bc2cfe3` 11:30 — Empresas: responsavel(is) por empresa, padrao 'Minhas empresas', pausar = arquivar com visao de pausadas e definicao em lote

## 2026-10-07 (6)

- `c356eb5` 17:56 — Lacunas entre cronogramas: atividades-padrao que faltam em cada empresa, criacao em lote com confirmacao e RENATA geral
- `0390637` 17:45 — RENATA geral varre as reunioes de varias empresas (so equipe PRICETAX): limite por empresa, cobertura exata e rodape de fontes
- `45c23ca` 17:23 — Levantamento: Área, conciliação de nomes em lote, sugestão de área e organização na extração das reuniões
- `b9de466` 17:11 — Levantamento: inclui tarefas de reunião e painel de qualidade dos dados
- `0fc8d6a` 16:55 — Levantamento de atividades de todas as empresas (por fase e responsável), planilha e contagens para a RENATA geral
- `8c81c24` 15:21 — Cartão: descrição formatada compacta (negrito, itálico, listas, link) e negrito nos comentários

## 2026-10-06 (6)

- `e56230e` 13:10 — Modelos: aceitar arquivos .zip (download, sem prévia)
- `960c742` 01:11 — Hoje: escolher por origem o que aparece (Meu quadro, Atividades, Tarefas de reunião, Reuniões), salvo por usuário
- `896560c` 01:06 — Hoje: botão 'Quais notificações ver' sempre visível no cabeçalho
- `1c61c48` 01:00 — Quadro pessoal: na mesma prioridade, cartão sem prazo fica abaixo dos que têm prazo
- `71fe14a` 00:45 — Notificações: cada usuário escolhe quais categorias ver (Empresas, Gestão, XFlow, CRM, Pareceres, RENATA), salvo por usuário
- `21c94f8` 00:30 — RENATA: resolveQuery cortava o JSON (max_tokens 500) e derrubava a 2a pergunta; margem maior + fallback para a pergunta literal

## 2026-10-05 (31)

- `86bc7f0` 23:57 — Pareceres: RENATA estuda automaticamente ao enviar (novos/alterados), sem repetir os que falharam
- `405de22` 23:52 — RENATA geral: botão na barra e na busca Ctrl+K; status do estudo de pareceres
- `627559c` 23:39 — Hoje: ocultar/expandir cada etapa; marcar todas como lidas; lembrete só de tarefa vencida há até 14 dias
- `f356369` 23:30 — Onda 6 de usabilidade: visual, linguagem e mobile
- `369d05f` 23:10 — Onda 5 de usabilidade: por que voltar amanhã
- `0920262` 22:39 — Onda 4 de usabilidade: salvar sem pensar
- `32d0b3c` 22:19 — Onda 3 de usabilidade: comentar, linkar e colar print em qualquer lugar
- `9b57c93` 22:05 — Onda 2 de usabilidade: diálogos, avisos e botões num jeito só
- `d639dd2` 21:51 — Onda 1 de usabilidade: casca única, busca Ctrl+K, Esc e Voltar consistentes
- `f5b66c3` 21:34 — Onda 0 de usabilidade: parar perda de dado e UI enganosa
- `4935598` 20:28 — docs: plano de usabilidade e front (7 ondas) com auditoria de navegacao, botoes, fantasmas e redundancias
- `bcc05c4` 20:13 — feat(inspiracao): frases do Henry Ford (12 conferidas na lista oficial do The Henry Ford) na memoria da RENATA e na Mensagem do dia; aviso das frases sem comprovacao
- `39b46f7` 19:46 — feat(meu-dia): card Mensagem do dia redesenhado (saudacao por conteudo, abas com icone, compartilhar, painel ilustrado)
- `b974e78` 19:42 — feat(inspiracao): frases do Senna na memoria da RENATA e na Mensagem do dia (so as conferidas em senna.com na tela)
- `186d683` 19:34 — docs: script de teste da API de conectividade (somente leitura)
- `f2c284c` 19:29 — fix(api): rota inexistente sob /api responde 404 em JSON em vez do index.html com 200
- `93a37d1` 18:16 — feat(conectividade): API /api/connect com tokens por janela do Claude Code (ler e criar atividades) + guia; painel recarrega o quadro e protege atividades criadas pela API
- `fdfbbcd` 18:04 — docs: consolida a documentacao (mapa de modulos, env, banco, APIs, pendencias, padroes, README) e regenera o indice do PROJECT_MAP
- `b9485a5` 17:56 — feat(modelos): varios anexos por modelo (Word, Excel, PDF, HTML, links); HTML servido isolado
- `1080cf8` 17:49 — feat(modelos): aba Modelos de documentos (arquivos e links com previa), irma dos Pareceres
- `dc42d28` 17:17 — fix(widget): mais linhas no widget grande (teto de 5 itens era nosso)
- `e532d65` 17:07 — feat(meu-dia): card Mensagem do dia sob o Ola, com chips e leitura completa
- `dbd052b` 15:52 — feat(widget): um script por visao e token recuperavel (cifrado)
- `bd9cd5d` 15:44 — feat(meu-dia): conteudo diario por usuario, boas-vindas na primeira entrada e Meu perfil em abas
- `55dac4d` 15:34 — feat(widget): visoes configuraveis (urgentes, agenda) escolhidas pelo Parameter do widget
- `8eb90f0` 14:43 — feat(inicio): atalho 'Meu perfil' na tela inicial
- `abfa5d5` 14:26 — feat(widget): widget do iPhone (Scriptable) com atrasadas, hoje e proxima reuniao
- `8f7fbc0` 12:35 — fix(atividades): dias sem movimentacao contam dias de calendario, nao blocos de 24h
- `b059601` 11:27 — feat(navegacao): endereco proprio por modulo para favoritar
- `49a095b` 11:13 — feat(inicio): RENATA cita o quadro pessoal (atrasadas e vencem hoje)
- `1577af1` 11:06 — fix(inicio): RENATA nao diz mais que o dia terminou quando acabam as reunioes

## 2026-10-04 (15)

- `a407e73` 21:13 — feat(ui): pecas visuais comuns, estados vazios/carregando e acessibilidade medida
- `b41c081` 20:18 — style: fonte Inter como base do app e filtros da Visao Geral com estilo
- `f3b28dd` 20:10 — fix(renata): estudo interrompido por deploy nao prende o botao em Estudando
- `8f771b6` 20:09 — fix(renata): pareceres de um cliente nao vazam para outro cliente
- `de9033e` 19:52 — feat(renata): pareceres so entram no chat quando a pergunta toca o tema; fonte Inter no Conhecimento e CRM
- `bb9ed4f` 19:42 — feat(renata): estudar Pareceres PRICETAX e sugerir caminhos nas reunioes
- `7573dd0` 19:29 — feat(pareceres): redesenho da listagem (fonte Inter, filtros em pilulas, cartoes novos)
- `2c0bc02` 18:21 — feat(usuarios): registra o primeiro uso do dia com IP e local
- `6a70d11` 18:12 — feat(home): Gestao de Usuarios como card na tela inicial
- `952760e` 18:07 — feat(usuarios): auditoria de acessos (contagem, ultimo acesso, local por IP)
- `44e9688` 17:11 — feat(quadro-pessoal): pausar atividade manda para o final da coluna
- `4d7ef9a` 16:00 — feat(atividades): indicadores recuperam o passado pelo historico e log das atividades
- `12c1d6d` 15:49 — feat(atividades): indicadores dia a dia, media por dia e alternador Total/Media
- `3e993ac` 15:31 — feat(atividades): indicadores de abertura e encerramento por pessoa
- `3d2ceab` 15:19 — chore: redeploy (pagamento Railway regularizado)

## 2026-10-02 (2)

- `2de03cd` 20:23 — feat(xflow): colar print e arrastar imagem nas TASKs do time de DEV
- `419c80e` 19:54 — feat(reunioes): Dossie do cliente - compilado de todas as reunioes pela RENATA (Fase A)

## 2026-10-01 (2)

- `1ad7871` 15:39 — feat(quadro-pessoal): texto do item de checklist editavel
- `f8d3604` 15:16 — feat(quadro-pessoal): mover atividade de coluna direto no detalhe

## 2026-09-29 (2)

- `6136cc4` 10:47 — feat(app): aviso de nova versao disponivel (fecha o 'corrigi e nao fez efeito')
- `8358c19` 10:32 — fix(app): poll de sincronizacao nao apaga mais edicao local em voo

## 2026-09-28 (2)

- `1e2d450` 21:51 — feat(pareceres): botao Voltar com texto e tag Geral/Cliente especifico
- `e045a09` 21:30 — fix(pareceres): largura maxima, icone recalibrado e resumo no topo

## 2026-09-22 (2)

- `4076873` 09:54 — feat(agenda): redesenho do painel da RENATA em cartoes (mockup do Rafael)
- `bc9745b` 09:36 — feat(agenda): acabamento do painel da RENATA para bater com o mockup

## 2026-09-20 (15)

- `5fc4146` 21:16 — feat(agenda): barra do dia legivel - titulos, almoco rotulado, legenda e fora do expediente
- `155c907` 20:51 — feat(agenda): expediente configuravel (padrao 08-18h) e rotulo explicito do tempo livre
- `1d8a7b3` 20:42 — fix(agenda): 'Hoje está' no presente e 'Amanhã estará' no futuro
- `d39c8d4` 20:39 — feat(agenda): almoço padrão 12:00–13:00 e configurável por pessoa
- `91fa655` 20:33 — feat(agenda): RENATA da tela inicial redesenhada — resposta do dia, semana num relance, linha do tempo e no máximo 3 avisos
- `063dd39` 20:18 — fix(agenda): mostrar resposta ao convite (aceito/sem resposta/talvez/recusado), duração e tempo livre
- `1d008d0` 16:23 — feat(crm): vários funis com etapas editáveis e importação de negócios do PipeRun
- `ac3f5f1` 16:02 — feat(crm): telefone/endereço/fundação/capital na empresa e importação de empresas do PipeRun
- `387dd9b` 14:27 — feat(crm): CRM PRICETAX fase 3 — atividades, agenda do CRM, próximo passo e lembretes
- `b8c73e7` 14:05 — feat(crm): CRM PRICETAX fase 2 — negócios, pipeline Kanban, produtos e oportunidades de upsell
- `816223a` 13:38 — feat(crm): CRM PRICETAX fase 1 — aba CRM com Empresas, Contatos, Ficha 360, importação e permissões
- `2dfc08d` 12:39 — fix: aba ativa do Quadro agora é evidente (antes quase não se distinguia)
- `a37cc15` 12:20 — feat: fixar o quadro compartilhado de outra pessoa como aba na Gestão de Atividades
- `c0f092c` 11:56 — fix: renomear coluna do Quadro travava e mostrava cartão-fantasma
- `0caa4ff` 11:51 — feat: RENATA na tela inicial mostra a agenda de hoje/semana ou convida a conectar

## 2026-09-18 (1)

- `a5facf4` 18:56 — feat: erro da IA em português + "tentar novamente todas" nas transcrições

## 2026-09-17 (7)

- `1161874` 22:17 — docs: registra o novo menu "Pareceres PRICETAX" (§48)
- `207bcfe` 22:13 — feat: novo menu "Pareceres PRICETAX" — repositório de PDFs pra sócios/colaboradores
- `583d099` 16:47 — docs: registra o fechamento da auditoria "onde mais isso?" (§47)
- `5486787` 16:46 — fix: mesmo bug de digitação em subatividade, áreas da empresa e fases (linhas dentro de .map())
- `9577229` 16:31 — docs: registra auditoria "onde mais isso?" e o fix do TodoDrawer/PersonalCardDetailModal
- `b6b3002` 16:30 — fix: mesmo bug de digitação travando/apagando texto em Itens de Ação e no Quadro Pessoal
- `bfed83d` 15:38 — fix: digitar em atividade fazia o texto "sumir" — campo travava em re-render pesado

## 2026-09-16 (2)

- `058aee0` 20:32 — fix: transcrição travada em "Processando..." sem forma de recuperar
- `7c8c680` 20:08 — fix: editar e fechar modal de Atividade/Reunião não avisava, podia perder edição

## 2026-09-14 (1)

- `1dd4d22` 08:04 — fix(RENATA): auditoria de Prompt Cache nativo da Anthropic + observabilidade

## 2026-09-13 (2)

- `ca6f3f9` 17:01 — RENATA Eval Harness — Fase 1 do plano P0/P1 (mede, não melhora)
- `723ef80` 17:01 — docs(RENATA): diagnóstico cognitivo completo + plano de implementação P0/P1

## 2026-09-12 (1)

- `dcf91c0` 15:40 — docs(RENATA): adiciona mapa de cobertura do painel (auditoria, sem mudança de código)

## 2026-09-11 (6)

- `e52c46a` 10:14 — RENATA Fase 8: Central de Conhecimento e Memória Viva
- `6b52af6` 09:08 — docs(RENATA): registra o incidente de produção da migração de status da Fase 7.1
- `4ee60a2` 09:05 — hotfix(RENATA): corrige a ordem real da migração de status (crash-loop persistia)
- `68f55b4` 09:01 — hotfix(RENATA): corrige crash-loop em produção na migração de status da Fase 7.1
- `ca3bb4b` 08:54 — RENATA Fase 7.1: endurecimento da memória em camadas e do cache semântico
- `658a10a` 08:14 — RENATA Fase 7: memória em camadas (fatos organizacionais/projeto) + cache semântico de perguntas

## 2026-09-10 (38)

- `8793b84` 23:56 — fix(RENATA): corrige data errada por fuso do servidor + falta de âncora de data no prompt
- `dc6d6c5` 23:26 — RENATA Fase 6: reduz custo de token (modelo, cache de prompt, auto-reindex sob demanda)
- `347d432` 22:52 — RENATA Fase 5: resposta estruturada (sections/insights) + redesign completo do painel
- `d8352dd` 22:06 — fix(RENATA): max_tokens baixo demais cortava o JSON em respostas que sintetizam várias reuniões
- `b5fe9a1` 22:02 — RENATA Fase 4: executora completa (criar/excluir atividades, Google Calendar, auto-reindex)
- `4ad4e50` 20:47 — docs: registra teste real da busca semântica (Voyage AI) + achado de rate limit
- `1f0427d` 20:32 — RENATA Fase 3: busca semântica híbrida (embeddings via Voyage AI)
- `1817e7a` 19:25 — RENATA: fallback de busca OR quando a busca exata não acha nada + retry/log nas chamadas à IA
- `553fe0a` 19:15 — RENATA: pendências por pessoa (apelido/nome parcial) + fix nos cards de filtro das Atividades
- `2ba30d9` 18:48 — Sincronização entre usuários: "BIP" pra ver mudança de outro usuário sem recarregar
- `61255a6` 18:39 — Reuniões/Atividades: log completo para envio de transcrição e mutações de TO_DO
- `d69d011` 18:25 — fix(RENATA): "resuma a última reunião" nunca achava conteúdo mesmo com memória indexada
- `4b7e4ed` 18:19 — Reuniões: botão "Reindexar memória" visível direto na tela, sem precisar abrir a RENATA
- `f5b4052` 18:04 — RENATA: botão de autoatendimento pra reindexar memória do projeto
- `84e4346` 17:54 — RENATA: explica atividade lendo a transcrição de origem, não só o título
- `9e1feb4` 17:48 — docs: registra bug grave e fix da reindexação de reuniões via transcrição
- `031ee35` 17:47 — fix(reunioes): reunião criada via transcrição por IA nunca entrava na memória do assistente
- `7176233` 17:43 — Assistente do Projeto ganha nome e identidade: RENATA
- `eb5bc61` 17:32 — Atividades: novos cards "cliente"/"pricetax" contando pendências por lado
- `ac43ca2` 17:24 — docs: registra causa raiz e lição do incidente do Assistente do Projeto
- `7dd4287` 17:24 — fix(assistente): protege buildProjectSnapshot contra dado de projeto real inesperado
- `53ea996` 17:20 — fix(assistente): reverte discriminated union que quebrou todas as respostas em produção
- `c1ecfe4` 17:16 — Assistente do Projeto: melhorias a partir do teste real com Amanda (Te Cansa)
- `9085521` 17:03 — Assistente do Projeto: agente executor (v1) + lista de participantes de reunião
- `701f7a9` 16:42 — Assistente do Projeto: acesso a identidade/cronograma completos + aprendizado persistente
- `fdcf118` 16:31 — docs: registra fixes da caixa de transcrições e ordenação cronológica de Reuniões/Atividades
- `62c9b27` 16:30 — Reuniões: some transcrição concluída da tela e ordena Realizadas por data crescente
- `eeec22a` 16:11 — Assistente do Projeto: corrige saudação sendo tratada como pergunta sem evidência
- `fed3158` 15:58 — Assistente Inteligente de Projetos — Fase 2: Chat do Projeto
- `3e16363` 15:37 — Assistente Inteligente de Projetos — Fase 1: fundação de memória
- `9ff5975` 14:49 — Redesign da tela de Reunião: "AI Meeting Workspace"
- `395f62e` 13:47 — Redesign da aba TO DO para "Atividades" (Centro de Execução)
- `36458fb` 12:29 — TO DO: título quebra em várias linhas e checkbox de conclusão rápida
- `9b22873` 12:19 — Novo item de TO_DO nasce com status Não iniciado
- `d619ab2` 12:06 — Nova aba TO DO — consolida os TO_DOs de todas as reuniões da empresa
- `63eac37` 11:37 — TO_DO aprende quem é PRICETAX e quem é o cliente
- `1f9bcc1` 11:27 — TO_DO da reunião ganha status próprio (urgente/andamento/pausada/concluída/não relevante)
- `7ce9b80` 11:17 — Corrige condição de corrida no reload após processar transcrição

## 2026-09-09 (1)

- `6d807fc` 15:47 — Contatos externos reutilizáveis nas Reuniões + renomeia TO_DO; estudo Telegram

## 2026-09-08 (1)

- `6fe3694` 18:13 — Adiciona caixa de transcrições nas Reuniões (IA estrutura automaticamente)

## 2026-09-04 (1)

- `d9280a2` 13:04 — Adiciona a aba Reuniões dentro de Empresas

## 2026-08-26 (4)

- `06a5a64` 08:21 — Visão Macro: separa "Amanhã" de "Em breve" no badge de urgência
- `ea67370` 07:06 — Permite anexar imagem/PDF/link em comentários de TASK do XFlow
- `88414a3` 06:52 — Horário da reunião e "Data confirmada com o cliente?" ficam inline na Tabela
- `ba03565` 06:41 — Permite anexar imagem/PDF/link em comentários de atividade

## 2026-08-25 (13)

- `897f6b8` 23:26 — Nova atividade abre direto pra edição + campo "Data confirmada com o cliente?"
- `5a3b3b0` 23:03 — Visão Macro: adiciona aba "Pausadas" com prioridade sobre as outras
- `bf41ad8` 22:53 — Visão Macro: adiciona filtros por Empresa, Responsável, Status e Prioridade
- `edfcf73` 22:43 — Visão Macro: adiciona aba "Sem data" pra atividades sem data cadastrada
- `e8f028c` 22:34 — Visão Macro: aba Atrasadas, "Hoje" sempre visível, editar atividade direto
- `6ab3ae9` 22:15 — Adiciona a Visão Macro: cronograma consolidado de todas as empresas
- `512a5a6` 21:52 — Adiciona atalho "Início" (Home) em todas as telas pós-login
- `2ddb71f` 21:37 — Adiciona atalho de avatar (Meu perfil) na tela de seleção de empresas
- `a81a164` 21:32 — Adiciona atalho pra Agenda ao lado de XFlow na tela de Empresas
- `f81362d` 21:14 — Adiciona a Agenda: visão unificada de disponibilidade (Google + XFlow + atividades)
- `cfc47e6` 20:41 — Google Calendar: mandar TASK pra Lixeira também apaga o evento
- `d631e34` 20:10 — Corrige gatilho de sync com Google Calendar: também dispara ao atribuir
- `1a97608` 17:16 — Sincronização com Google Calendar: Previsão de conclusão vira evento

## 2026-08-24 (15)

- `79047b0` 22:12 — XFlow: preview de imagem em Evidências sem precisar baixar
- `4b7910e` 21:59 — XFlow: explica diferença entre Prazo e Previsão de conclusão na TASK
- `f2fc032` 21:48 — XFlow: contador de dias na Previsão de conclusão (Quadro, Lista e detalhe)
- `c8e721d` 21:31 — XFlow: corrige filtro "Responsável atual" e permite editar Produto depois de aberta
- `5976a65` 20:58 — Central de Notificações global (sino) nas 3 abas + log de visualização de TASK
- `c5cecae` 20:08 — XFlow: vincular TASKs, citar #N, link permanente + 2 bugs corrigidos
- `a6cd555` 19:13 — XFlow: TASKs visíveis pra todo mundo da org, não só pro dono (reporter)
- `be687b5` 18:59 — Permite trocar senha direto na tela de login antes de entrar
- `03378f5` 18:51 — XFlow: nomes de solicitante na fila de triagem + tela de troca de senha
- `2e58c6a` 18:19 — Botão Voltar do navegador fecha modal de detalhe em vez de sair (Nível 3)
- `52e64d4` 17:57 — Botão Voltar do navegador também navega dentro do módulo (Nível 2)
- `52ac124` 17:18 — Botão Voltar do navegador passa a navegar dentro do app (Nível 1)
- `6fab241` 12:03 — XFlow: filtro de Responsável atual só lista quem está com a bola de verdade
- `e38e8a7` 09:14 — XFlow: adiciona filtro e contagem por Responsável atual
- `f82ee65` 09:14 — Corrige clique morto em Cadastrar/Clonar empresa sem tipo de cliente

## 2026-08-20 (5)

- `5032d18` 20:23 — Faz RESUMO e o PDF respeitarem a mesma ordem de atividades da Tabela
- `779bae9` 19:58 — Reveste o relatório em PDF com a identidade visual real da PRICETAX
- `6d35d58` 19:27 — Adiciona aba RESUMO em Empresas (visão executiva de acompanhamento)
- `abd73fa` 18:41 — Corrige banner de Super Admin preso após logout; adiciona horário de reunião e relatório em PDF
- `1d09d6d` 16:37 — Corrige botão "Gestão de Atividades" aparecendo sem personalAccess

## 2026-08-19 (9)

- `259b567` 16:12 — XFlow: ordenação automática + reordenação manual no Quadro
- `a92149e` 14:01 — XFlow: Quadro ganha cor por coluna, igual ao quadro pessoal
- `f6d6e7c` 12:16 — Substitui acesso a empresas implícito no papel por 3 acessos independentes
- `f9a6e33` 08:55 — XFlow: adiciona 3 opções em Produto/Plataforma
- `73b0b7f` 07:59 — XFlow: substitui o editor de Descrição por um editor real (Tiptap)
- `30c31b6` 07:11 — XFlow: reordena formulário de Nova TASK, Data da ocorrência vira obrigatória
- `de676e1` 06:57 — Adiciona atalho XFlow na tela de seleção de empresas
- `3e1be01` 01:06 — XFlow: adiciona aba Quadro (Kanban) como visão principal, mantém Lista
- `22ca6dd` 00:16 — Permite vincular empresa a grupo existente já na criação

## 2026-08-18 (14)

- `05f44cb` 22:53 — Guarda de "alterações não salvas" padronizada em Empresas, Gestão de Atividades e XFlow
- `826c7c3` 21:47 — Corrige perda de quebras de linha ao editar comentário de atividade
- `84d4db5` 21:19 — Grupo Empresarial v2: campo "Empresas envolvidas" por atividade
- `d91b61f` 20:40 — XFlow: badge de Tipo (BUG/Melhoria), Data de abertura e Previsão de conclusão visíveis no painel
- `0452cf6` 20:20 — XFlow: Tipo de cliente obrigatório + autocomplete de Empresa/Cliente afetado (sem bloquear cadastro de nome novo)
- `2e631cd` 19:43 — XFlow: corrige inputs de texto sem estilo (título aparecia curto/branco)
- `1105919` 19:20 — XFlow: campos complementares editáveis depois, navegação entre módulos, Tipo de TASK (BUG/Melhoria)
- `28ccbbd` 18:49 — XFlow: Descrição do BUG vira editor rich text (negrito/lista/citação/fonte) + colar print direto no texto
- `04ca77a` 18:27 — XFlow: excluir BUG (soft-delete) + Lixeira + apagar de vez (admin)
- `9a0e19d` 18:11 — XFlow: confirma número do BUG ao criar + textareas com auto-altura
- `3b32114` 18:02 — XFlow: form de abertura mais fluido, produtos reais, tipo de cliente
- `7e14da0` 17:35 — XFlow P1: tempo/SLA por status, fluxo v2, três Homes por papel
- `477b198` 17:05 — XFlow P0: autorização por papel e transições de status validadas no backend
- `0328719` 15:45 — Add XFlow: módulo de gestão de BUGs com acesso restrito por papel

## 2026-08-13 (1)

- `e8d7efd` 17:37 — Add Grupo Empresarial: CNPJ Master + child companies with shared activities

## 2026-08-11 (9)

- `9f9cd1e` 23:45 — Deep pass on project memory: expand PROJECT_CONTEXT.md, shrink CLAUDE.md
- `d9582af` 23:37 — Point CLAUDE.md at PROJECT_CONTEXT.md as the primary read-first doc
- `09006f2` 23:36 — Add PROJECT_CONTEXT.md: official technical memory of the project
- `29530ac` 21:56 — Fix: allow dragging cards between columns in any sort mode
- `c6ac8cb` 21:30 — Gestão de Atividades: complete-to-end ordering, priority sort fix, weekly archive
- `659438e` 21:11 — Add "Gestão de Usuários" shortcut to company-picker screen
- `f256ace` 20:01 — Add org picker to "Clonar empresa" (Super Admin)
- `392f9ac` 18:11 — Fix Super Admin entry flow: org picker before company list
- `d42577a` 17:47 — Multi-tenant Fase 3: org picker on user/company creation for Super Admin

## 2026-08-10 (15)

- `2040c9c` 20:42 — Add POC/Demo client type and filters by tipo/status/regime to Empresas
- `a69ea22` 19:37 — Collapse Observações e Transcrição de reunião by default in activity modal
- `82757b0` 19:11 — Add ability to edit existing comments on company activities
- `6d7cc2f` 18:57 — Add one-click pause/resume button to company list
- `87b06f7` 18:44 — Multi-tenant Fase 2: painel de Super Admin + entrar em organizacoes
- `6a3f30a` 18:03 — Multi-tenant Fase 1: fundacao de dados e isolamento por organizacao
- `52efd7b` 16:39 — Add cascading pause/resume for companies to Gestao de Atividades
- `5ad99e5` 16:16 — Add stale-activity indicator to Gestao de Atividades cards
- `0537180` 14:44 — Update docs for public board sharing (CLAUDE.md, PROJECT_MAP.md)
- `c970c32` 14:42 — Add public/private board sharing to Gestao de Atividades
- `73fdc59` 11:16 — Update CLAUDE.md: date-conflict rule removed, document personalOnly
- `f147ffa` 11:15 — Remove cross-company date-conflict check entirely
- `6447655` 11:06 — Add bulk-select for allowed CNPJs and a personal-only user flag
- `4439087` 09:37 — Turn cross-company date-conflict check into a dismissable toast
- `4a828c2` 09:11 — Make the app responsive for mobile/tablet without changing desktop

## 2026-08-09 (12)

- `ec6e5e8` 23:09 — Improve company selector screen: search, discreet actions, workspace shortcut
- `6c0547d` 22:52 — Redesign subactivity rows and fix transparent logo on light theme
- `3d3d59b` 16:22 — Double-click a company name to enter it directly
- `d6029d8` 15:52 — Widen the company picker screen and add per-row progress/next activity
- `91cf144` 15:42 — Ask company client type at signup and surface it next to Nome Fantasia
- `7c29f5c` 14:54 — Add card Status (Não iniciada/Em andamento/Pausada/Concluída) to personal board
- `40d9532` 14:21 — Make the whole column header draggable, not just a tiny grip icon
- `55b51f4` 14:10 — Tint the whole Kanban column, not just the header pill
- `8bd0495` 12:56 — Redesign Gestão de Atividades visuals in a Notion-inspired direction
- `76efb70` 12:34 — Hide personal-board filters behind a toggle button
- `2ce67eb` 12:25 — Fix unstyled inputs in Gestão de Atividades card detail panel
- `46edbe1` 05:17 — Evolve Gestão de Atividades into a fluid Notion-style personal Kanban

## 2026-08-08 (2)

- `823e93e` 22:49 — Turn cross-company date conflicts into a warning instead of a block
- `be9095e` 22:24 — Improve Empresas panel: status Pausado, comment order, regime tributário, nome fantasia

## 2026-08-06 (2)

- `38f556e` 09:13 — Anchor cloned company schedules 10 days after duplication, not on it
- `1cae72e` 08:52 — Add Gestão de Atividades: personal Kanban workspace per user

## 2026-08-03 (8)

- `73605df` 22:42 — Soft-delete subactivities so they land in the Lixeira too
- `dd73028` 21:41 — Bring subtask responsible/prazo/drag into the Tabela inline quick view
- `28b9c3e` 21:25 — Turn each activity into a fuller work surface: priority, participants, links, mentions and per-activity history
- `a06eece` 19:48 — Add Pausado status and a recoverable trash for deleted activities
- `f5f5f52` 18:07 — Block cross-company PRICETAX double-booking on activity date changes
- `d7a94c3` 17:56 — Rework team management into a proper module with name, login, company and area
- `6cc1fb8` 16:51 — Let responsáveis link to real system users, not just free text
- `c1e2d8f` 14:33 — Add clone-activities action to the company selector screen

## 2026-08-01 (23)

- `644a929` 23:22 — Add edit/delete company actions to the company selector screen
- `2d246a8` 23:04 — Restrict Fases editing to Master/PRICETAX and add a light theme
- `7503df8` 22:29 — Rewrite Tabela drag-to-reorder to fix ghosting and freezing
- `2077268` 22:18 — Record who made each log entry and restrict Log to Master/PRICETAX
- `e1b27e1` 22:06 — Add user avatars with a self-service "Meu perfil" picker
- `c417240` 17:11 — Fix Prazo input styling, deadline math, and add live drag preview
- `ec3f8f8` 16:53 — Redesign Tabela with quick filters and a denser row layout
- `9a571ee` 16:31 — Redesign Fases as a dashboard with progress overview and activity cards
- `f525c58` 16:07 — Add tooltip and click-to-open on Gantt activity bars
- `6ff8db3` 15:54 — Allow dragging activities in Gantt and Tabela to reschedule dates
- `60734bd` 15:31 — Add duration-based automatic end date calculation for activities
- `860f11a` 15:12 — Allow reordering phases by dragging in the Fases panel
- `7b39350` 14:36 — Fix serif font fallback in Cadastrar empresa modal
- `880e1a3` 13:01 — Fix unstyled inputs in Cadastrar empresa modal from company selector
- `bfc51f1` 12:55 — Fix race condition and add missing labels in edit-user modal
- `ef29410` 12:40 — Add multi-company overview mode with per-company selection
- `ab704ba` 11:54 — Add CNPJ lookup for company registration
- `37e7083` 11:27 — Redesign user management as a full-page dashboard
- `e1c269e` 10:57 — Add real authentication and shared Postgres backend
- `f2d003a` 09:18 — Fix repo structure: add proper src/ directory, remove stray zip and broken src file
- `4c0d585` 08:55 — Create src
- `38f4833` 08:55 — Add files via upload
- `a4cb28b` 08:54 — Add files via upload
