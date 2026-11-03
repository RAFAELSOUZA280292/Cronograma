# Histórico de commits (gerado do git)

> Gerado automaticamente por `scripts/docs-gen.mjs` a partir do código. **Não edite à mão** — rode `npm run docs:gerar`.

615 commits, do mais recente ao mais antigo. Horário do commit **como gravado pelo git na máquina de deploy** (use com cuidado: pode estar em UTC ou Brasília). O "porquê" detalhado de cada mudança está no `PROJECT_CONTEXT.md`.

## 2026-11-02 (82)

- `5c40286` 23:59 — Segurança: retira a rota temporária de IP (Railway já descarta cabeçalho forjado); cérebro em dia (§145)
- `b4eee3c` 23:56 — Segurança: cliente sem chave de API, agendamento com freio, iCal sem IP interno, e-mail só da própria cópia, CSP só relatório; assinatura não perde edição
- `3698f61` 23:34 — Cérebro: ressalva dos escopos restritos do Gmail na próxima etapa
- `0c298bc` 23:33 — Cérebro: próxima etapa (e-mail de várias contas) no Estado atual
- `0dfe3e5` 23:27 — Cérebro: convite respondido saindo da Entrada (§144) confirmado pelo Rafael
- `bfd5a82` 23:22 — Convite respondido sai da Caixa de entrada, como no Gmail: pelo cartão, pela Agenda ou por fora (vai para o Arquivo) (§144)
- `7e0cbd3` 23:11 — Cérebro: formato único da RENATA (§143) confirmado pelo Rafael
- `f7635a9` 23:06 — Formato único da RENATA nas três conversas: blocos tipados com cartões e selo de prazo, mesma instrução de resposta (§143)
- `3d931f4` 22:51 — RENATA com visual de cartões: resumo em destaque, seções com ícone, selo de prazo e chat no novo estilo (§142)
- `6dec6a1` 22:46 — Cérebro: respostas clicáveis da RENATA (§141) confirmadas pelo Rafael
- `1e8d12b` 22:37 — Respostas da RENATA visuais e clicáveis: cada pendência vira link que abre a atividade, a reunião ou a tarefa (§141)
- `911a49e` 22:01 — Cérebro: RENATA pelo parecer mais recente (§140) confirmada pelo Rafael
- `11936b8` 21:56 — RENATA responde pelo parecer mais recente: sigla de tributo na busca e 29/2026 prevalece sobre 25/2026 (§140)
- `e18db8c` 21:17 — Cérebro: aba E-mails da KUHN (§139) confirmada pelo Rafael em produção
- `5369058` 20:50 — Aba E-mails da empresa: sem vínculo com o CRM usa a empresa de mesmo CNPJ ou o domínio parecido com o nome (§139)
- `3aea519` 20:43 — Docs: linhas das rotas do agendamento (gerado)
- `97c104c` 20:43 — Link de agendamento: faixas de horário no lugar de expediente + almoço fixo (§139)
- `32c3951` 20:31 — Link público de agendamento: parceiro vê só livre/ocupado e marca na agenda (§139)
- `9841104` 20:21 — Lista de empresas sem as transcrições das reuniões; a reunião busca o texto ao abrir e a gravação nunca o apaga (§138)
- `950134b` 20:20 — Agenda: quadro de cores fecha com clique fora e Esc (§138)
- `06c261b` 20:10 — Agenda como a do Google, parte 2: menu lateral, equipe, cores, busca, Tarefa, Ausente e RENATA (§138)
- `ad8182c` 20:08 — Raio-X do peso das empresas no log ao ligar (só tamanhos, nenhum conteúdo) — para enxugar GET /api/projects
- `01b94c8` 20:01 — Carga de empresas mais leve: o BIP de 6 s lê só o CNPJ e a tela baixa só a empresa que mudou (§137)
- `838a5aa` 19:14 — Agenda no padrão do Google: dias no lugar certo, faixas e filtro "Sem resposta" (§136)
- `c46d962` 19:12 — Cérebro: resultado da checagem (fluxos 15/15) e lição da tela obrigatória nos testes
- `cb84aaf` 19:12 — Testes de fluxo: usuários de teste já concluíram a boas-vindas (§132 cobria a tela e travava os 15 testes)
- `c8d02a7` 19:08 — Checagem antes do 03/11: 11 defeitos corrigidos em Agenda, E-mail, CRM e boas-vindas (§135)
- `5863a51` 19:00 — Cérebro: correção da Agenda (§134) confirmada pelo Rafael em produção
- `7f7ecf4` 18:56 — Agenda: cor do compromisso chamava a si mesma e travava a página com atividade do CRM na semana (§134)
- `34a9d11` 18:51 — Agenda nunca fica carregando para sempre: prazo em cada leitura e aviso do que não carregou (§133)
- `20966b0` 18:44 — Boas-vindas obrigatória das novidades (03/11) e RENATA treinada no painel (§132)
- `a635d2d` 18:36 — Cérebro legível: Estado atual por área, mapa E-01…E-16 da Caixa de e-mail, linhas de 02/11 em tópicos
- `ae34b24` 18:29 — Caixa de e-mail: conversas da equipe com a pessoa pesquisada (§116zzzzzzzzzzzzz)
- `718f15e` 18:24 — Caixa de e-mail: pesquisa olha todas as pastas (folder vazio virava Caixa de entrada) (§116zzzzzzzzzzzz)
- `d57e284` 18:21 — Cérebro: e-mail do CRM abrindo a Caixa do painel confirmado pelo Rafael em produção
- `1ae80fc` 18:19 — E-mail no CRM: ouvinte do mailto: na fase de captura (cartões paravam o clique e o Mail do Mac abria)
- `aaee1a1` 18:14 — E-mail clicado no painel abre a Caixa do painel com escrita e conversas, não o Outlook/Mail (§116zzzzzzzzzzz)
- `4e9314e` 18:08 — Assinatura do e-mail: tipo Imagem (banner) ou Texto e despedida livre em cima (§116zzzzzzzzzz)
- `967f023` 18:03 — Cérebro: imagens sempre à mostra na Caixa de e-mail (§116zzzzzzzzz)
- `de1fa27` 17:52 — Caixa de e-mail: imagens sempre à mostra por padrão, com opção em Configurar (§116zzzzzzzzz)
- `61a0834` 17:48 — E-mail × CRM: assinatura, imagens e anexos na aba E-mails do negócio e da empresa (§130)
- `75150e3` 17:40 — E-mail × CRM: "Parece ser INDEMIL — vincular?" para empresa do CRM sem site nem e-mail (§130)
- `94862bf` 17:35 — E-mail × CRM: parceiro em cópia vira "Indicação", o selo fica com o cliente (§130)
- `3068504` 17:29 — E-mail × CRM: contato de parceiro cadastrado em cliente não rotula mais a conversa (§130)
- `fdb8325` 17:29 — CRM: Voltar do navegador não joga mais para a tela inicial com /crm no endereço
- `fd7c3f9` 16:02 — RENATA lê e revisa as propostas anexadas nos negócios do CRM (§131)
- `856969b` 15:53 — E-mail ligado ao CRM e às Empresas: selo, "Empresa fora do CRM", aba E-mails, RENATA e radar no cockpit (§130)
- `0ecb374` 15:53 — API por chave à prova de IA: descoberta, OpenAPI 3.1, guia e "Copiar tudo para a IA" (§129)
- `cd80b72` 15:50 — docs: lição sem caminho de arquivo não publicado
- `bd56346` 15:50 — Lição: conferir o clone (diff + subir o servidor) logo antes do push ao publicar parte da pasta
- `1950d5e` 15:47 — Corrige o deploy: tira de server/index.js a importação de mailLinks (trabalho de outra sessão, não publicado)
- `73b4cdf` 15:42 — Agenda: várias contas por pessoa numa grade só (Google, Microsoft, link iCal), com cor, conflitos e privacidade (§128)
- `87f3d5a` 15:19 — Papéis: voltar no histórico para /crm respeita o acesso; documentação (§127)
- `614e040` 15:17 — Papéis de trabalho (Sócio, Comercial, Operações) e CRM fechado para Operações
- `6243e68` 15:18 — Tela inicial: arrastar o bloco de qualquer ponto e blocos baixos no Personalizar
- `20be3fa` 15:12 — Cofre: link interno para compartilhar um item ou o cofre (só abre com login)
- `bfb6608` 15:11 — Tela inicial personalizável e barra de favoritos, salvas por pessoa no servidor
- `541ec52` 14:52 — WhatsApp: intermediário Dualhook para os números pessoais (coexistência)
- `b0c33ab` 14:48 — RENATA lê o e-mail de quem conversa com ela e propõe o registro no CRM
- `fa861e2` 14:36 — WhatsApp: caixas por número (pessoal privada e Comercial compartilhada)
- `db03fc5` 14:31 — Caixa de e-mail: pastas sem o prefixo INBOX/ e em árvore (até 200 pastas)
- `df5166d` 14:23 — Cofre do projeto: acessos, certificado digital, arquivos, links e notas por empresa
- `f024ca1` 14:18 — WhatsApp, Fase 1: caixa de conversas do número da PRICETAX (API oficial da Meta)
- `99262d8` 14:17 — Agenda completa no painel e convites de reunião na Caixa de e-mail
- `d258b16` 13:29 — Caixa de e-mail: seleção, Atualizar e ⋮ juntos à esquerda, como no Gmail
- `b994230` 13:23 — Caixa de e-mail: menu ⋮ com Marcar todas como lidas (pasta ou pesquisa inteira)
- `41cf03a` 13:18 — Caixa de e-mail: selecionar como no Gmail (todos, nenhum, lidas, não lidas, com e sem estrela)
- `0e658b4` 13:11 — Docs: estilo do e-mail na leitura (§116zzzzz)
- `8fc59af` 13:07 — Caixa de e-mail: leitura mantém o estilo do próprio e-mail (Outlook/newsletter), sem nada que busque coisa na rede
- `d73fc6f` 12:49 — Docs: lição dos acentos em e-mail do Outlook (§116zzzz)
- `282135e` 12:32 — Caixa de e-mail: acentos certos em e-mail do Outlook (Gmail entrega UTF-8 com rótulo iso-8859-1)
- `4678ae5` 11:40 — Caixa de e-mail: colar e arrastar qualquer anexo, com aviso dos tipos que o Gmail bloqueia
- `ea587b4` 11:36 — Caixa de e-mail: pacote de personalização (cor da pasta, formatação, imagens e sugestão de destinatário)
- `da6e998` 01:44 — Caixa de e-mail: pacote visual (colunas ajustáveis, modos de leitura, lista compacta, atalhos)
- `d912fd5` 01:31 — Cérebro: pacote de produtividade do e-mail confirmado pelo Rafael
- `d1a533b` 01:27 — Caixa de e-mail: pastas, regras, rascunhos, sugestão de contatos e aviso de e-mail novo
- `2a67b0d` 01:12 — Cérebro: horário do deploy da Fase 2 do e-mail
- `6f3f74c` 01:08 — Caixa de e-mail, Fase 2: escrever, responder, encaminhar, anexos e assinatura
- `2f471bf` 00:53 — Cérebro: caixa de e-mail aberta com o Gmail real do Rafael
- `258ac58` 00:46 — Caixa de e-mail, Fase 1: ler e organizar o Gmail no painel (/email)
- `1e97be8` 00:24 — Cérebro: servidor local que uma conversa nova consegue ligar, onde o vidro funciona e confirmação do Rafael
- `3c9608d` 00:18 — Cérebro em dia: Estado atual, linha do tempo de 30/10 a 02/11, lições, travas e alarme de frescor

## 2026-11-01 (4)

- `8bc9cc6` 23:37 — Reacionar o deploy da Railway (nenhum arquivo muda)
- `303ea9c` 23:20 — CRM: reunião com convite do Google e link do Meet, só quando a pessoa marca no formulário
- `1a8e51f` 22:54 — Meu quadro: mover uma coluna com as atividades para outra página (com desfazer)
- `8a2da04` 20:07 — Vidro nas barras e botões: blur na barra do topo, botões translúcidos e teste de contraste

## 2026-10-31 (17)

- `e87b945` 23:58 — Faxina do U2: contraste do painel de subatividades no tema claro, estilos de janela mortos e teste de contraste
- `8d122f4` 23:39 — e2e: o fluxo das janelas cria a empresa que usa (o banco do CI começa vazio)
- `23fae7c` 23:35 — U2 (parte 3): as janelas que sobraram passam a usar a janela única do app
- `419617a` 23:17 — U2 (parte 2): janelas do XFlow e do quadro pessoal passam a usar a janela única do app
- `0f1a071` 22:04 — U2: os 14 modais do CRM passam a usar a janela única do app
- `7f2cfa9` 21:36 — E6: atualiza o SDK da Anthropic de 0.135 para 1.3 (API 2026-10-21), com teste de contrato
- `8531564` 20:47 — Eval da RENATA: --repeat=N e a referência com repetição (65 de 69, 21 de 23 casos estáveis)
- `ddccd78` 19:17 — Busca da RENATA: o escopo sugerido pela IA vira dica, não filtro rígido
- `2ddfc8e` 12:32 — Eval da RENATA: corrige três defeitos do medidor achados nas falhas de TEMPORAL e registra a 2ª rodada
- `111bd90` 12:16 — Registra a primeira referência do eval:full da RENATA (18 de 23 casos, 78%)
- `b37d0ca` 11:57 — Documenta a ativação do CI (primeira execução verde) e o cuidado de deploy com o arquivo do workflow
- `3fc4935` 11:55 — Create ci.yml
- `a145624` 09:21 — Onda 4: teste de fluxos críticos (Playwright + axe-core) e correções de acessibilidade que ele achou
- `2ac0ee7` 09:04 — Onda 3: briefing diário, preferências da RENATA, Cliente 360 e tabela com seleção em massa
- `eba76a3` 00:40 — Onda 2: paleta acha Pareceres/Modelos/Conhecimento, RENATA lê a ficha do registro aberto e tokens de forma
- `5eca3ab` 00:13 — Piloto: Visão geral do CRM com ação na linha, teclado, prioridade explicada, estados de carregamento e erro
- `859a8c9` 00:02 — Onda 1: auditor de leitura, regra anti-injeção nos prompts, medição de tamanho das respostas, ajuda de atalhos e correções de contraste (XFlow, Inteligência, cronograma); CI pronto em docs/ci

## 2026-10-30 (10)

- `07faebf` 22:32 — Tela inicial em grade: Mensagem do dia e Hoje lado a lado, semana e agenda abaixo, módulos em 4 colunas; cor e elementos redistribuídos
- `5b30045` 22:18 — CRM: texto mínimo de 12 px, selos de status neutros com bolinha, chips de atenção e contraste medido em 10 telas (fim do plano de visual)
- `6bf94d9` 22:05 — CRM: contatos compactos (número em texto, WhatsApp em ícone, Copiar azul pequeno) e colunas do quadro sem degradê
- `617c1f3` 21:58 — CRM: tags legíveis (texto neutro + bolinha, contraste medido) e urgência do cartão em linhas, sem fundo colorido
- `4def9b1` 21:48 — CRM: Visão geral com listas alinhadas (ponto, data e dias de atraso), textos sóbrios e títulos em caixa normal (etapas 3 e 4 do plano de visual)
- `c5fd487` 21:41 — CRM: Visão geral com cartões de ícone, cor por significado e menu lateral azul-marinho (etapas 1 e 2 do plano de visual)
- `0cfe467` 17:42 — CRM: notas com texto formatado, emojis, modelos, @menção e anexos; sanitizador mantém target/rel dos links
- `7582698` 17:08 — CRM: botão azul Copiar número ao lado do WhatsApp (só dígitos, sem +55)
- `1f8ba40` 09:08 — Guia de integrações e índice da API listam as rotas novas (organizar quadro, dia da equipe)
- `b77427b` 08:59 — Organizar o quadro pessoal por API: GET /board e POST /board/plan (prévia, digest, tudo ou nada, cópia em Versões)

## 2026-10-29 (23)

- `0ad3d0a` 22:01 — Dia da equipe: entradas e saídas, telas e o que cada pessoa fez; evento de saída; leitura por chave read_all de administrador
- `e877e1d` 18:25 — Foco de hoje: tela cheia para o iPad (Agora, Próximos, Atenção) com filtro por dia, pessoa e quadro; abre em /foco
- `f974322` 16:57 — Cartão do quadro pessoal no iPad: campos sem type deixam de ficar brancos e o checklist volta a ser compacto
- `abd3b05` 16:44 — Quadro pessoal no iPad: círculo de concluir, + e … deixam de inflar para 44 px; busca encolhe e a barra cabe numa linha
- `47ec651` 15:38 — Documenta a reescrita do histórico (exports/ removido)
- `29808b0` 12:29 — Tela de Histórico do quadro pessoal: versões, recuperar cartões, restaurar quadro inteiro
- `ace3ef0` 11:14 — BAIXOS: login sem enumeração de contas, papéis validados, XFlow 404, quadro com acesso no servidor, retenção e Modelos
- `3ae4a1f` 10:45 — M8 e o resto dos médios: atividade do CRM, histórico do quadro, XFlow, IA enxuta, parecer/material
- `9cc1356` 10:32 — Docs: corrige referência ao widget (sem versão cifrada)
- `64cea13` 10:32 — M3 e M22 do jeito mais seguro: token do widget só em hash e excluir usuário vira desativar
- `a27eca9` 10:20 — M6, M7 e M12 do jeito mais restritivo: contato, Excel/arquivos do PipeRun e excluir empresa
- `8832551` 10:15 — A9 (token de link no servidor, reunião pública com lista fechada) e médios: M2, M11, M13, M16, M18, M19, M20, M22, M23
- `0796b52` 09:43 — Carimbo de versão + fusão da empresa (A3) e correção de vazamento de conexão no PATCH /projects/:id
- `ed3fbc5` 08:35 — Visão do cliente no servidor (A3/A4) e médios baratos (M1, M4, M5, M9, M10, M17, M21, M24)
- `9c7024f` 08:04 — Documentação completa do sistema (docs/00–10, tabelas geradas, conferidor)
- `348eb58` 08:01 — Segurança: sessão derrubada por bloqueio/senha, limite de login, SSRF IPv6, Super Admin protegido
- `8799d55` 02:02 — RENATA: cache de respostas separa equipe de cliente
- `1d9f64d` 01:14 — RENATA: resposta forçada ao estourar os passos, ferramentas para ler reunião, horário (GMT-3) e botões Atualizar/Limpar conversa
- `620e489` 01:01 — RENATA geral também orienta com base nos pareceres já estudados
- `824548c` 00:52 — RENATA orienta por conta própria com base nos pareceres já estudados
- `00c8b4b` 00:34 — RENATA geral: não mostrar códigos internos [id=…] nas respostas
- `1be0571` 00:25 — Pareceres: estudo cortado pela IA deixava o parecer longo pendente para sempre
- `e2c1053` 00:20 — API de conectividade: duas chaves na tela (Ler tudo / Ler e editar tudo); escopos antigos seguem válidos em Avançado

## 2026-10-28 (5)

- `e2e23b5` 20:26 — API de conectividade: IA externa corrige reuniões registradas (escopo meetings_edit)
- `190cf9b` 18:59 — API de conectividade: IA externa envia transcrição de reunião e a RENATA processa (escopo transcripts)
- `8649f97` 17:54 — Guia da API de conectividade: extrair Excel do CRM pela chave; teste e documentação do acesso dos sócios
- `365bd36` 17:08 — CRM: Exportar Excel nativo nos Negócios (filtros da tela, e-mail, telefone e link do WhatsApp)
- `617a37d` 16:41 — CRM: botão Copiar link na ficha do negócio (exige login) e aviso de acesso negado por endereço

## 2026-10-27 (12)

- `4368514` 17:30 — Biblioteca da RENATA: estudo de material longo não é mais cortado (LC 214)
- `145a284` 16:37 — Biblioteca da RENATA: título, tema e etiquetas preenchidos pela IA ao escolher o arquivo
- `6cf2530` 14:52 — Coluna compartilhada: histórico da coluna, atualização em ~15 s e busca por link mais leve
- `3505aed` 14:41 — Gestão de Atividades: link público de uma COLUNA (com "Voltar")
- `15ac7b2` 14:30 — Quadro público: botão "Voltar ao quadro anterior" e "Copiar link" de um clique
- `af944ba` 14:20 — CRM: quadro mais leve para computador velho (arrastar sem travar)
- `e89b507` 14:08 — CRM: o cartão muda de etapa na hora ao arrastar, com aviso, Desfazer e retentativa
- `87404c8` 13:41 — Quadro pessoal: retentativa automática quando o salvamento falha
- `d9dfaf3` 13:30 — Logs de produção: script pela API da Railway (token de workspace) e documentação
- `ff464ae` 13:16 — Quadro pessoal: duas abas não apagam mais o trabalho uma da outra
- `45af854` 09:33 — Biblioteca de conhecimento da RENATA: enviar material (PDF, Word, PowerPoint, Excel, texto), estudar, buscar por trechos e usar nas respostas
- `d629c9b` 09:03 — RENATA: copiar mensagem isolada, copiar a conversa toda e exportar (txt, md, Word, PDF, Excel, JSON)

## 2026-10-26 (23)

- `d9f5622` 16:30 — Tira exports/ do repositório (arquivos de trabalho de cliente que entraram por engano) e passa a ignorá-lo
- `5b7943a` 16:29 — Daily: filtro por prazo (atrasadas, hoje, semana, período, sem data) e exportação em PDF e Excel
- `fc842b0` 14:26 — Ajuste do cronograma por operações via sessão (simula por padrão), para lotes com texto exato
- `91da099` 12:09 — Registrar reunião inteira por API (transcrição, resumo, decisões, tarefas), idempotente
- `06acba6` 11:35 — RENATA: ao adiar atividade, desloca também as subatividades (achado do teste real em produção); doc do teste
- `b31e7bf` 11:23 — CRM: busca de negócios acha comentários/tags/contatos/atividades; aviso 'nova versão' genérico; RENATA sabe a origem do nome
- `c946b22` 11:08 — CRM: CNPJ automático (Receita) no novo negócio/empresa, origem editável e criável, contato principal criável/editável, unir empresas, domínio do e-mail desempata, responsável Eduarda no importador
- `80a3263` 10:55 — CRM: calendário/horário sem corte (react-day-picker + floating-ui), atividade espelhada no Google Calendar do responsável, filtro por várias tags, curva A-D e comentários do evento, visual com cor
- `e2127eb` 10:39 — CRM: documentação e teste da importação dos leads do evento (executada em produção: 313 negócios)
- `5e522e0` 10:11 — CRM: negócio aceita chave externa (origem_id), filtro por ela e skipCadence; importador repetível dos leads do evento 22-23/10
- `e2c7ea5` 08:14 — Gestão de Atividades: Daily por responsável (atividade principal + subatividades, data, copiar texto)
- `070eac7` 08:00 — Gestão de Atividades: prazo da atividade segue a subatividade mais distante (RENATA aplica a mesma regra)
- `7b027d1` 07:57 — Gestão de Atividades: Buscar encontra subatividades e indica em qual atividade estão
- `c09c422` 07:48 — Checklist: editar um item fecha o painel de responsável aberto em outro
- `ab71997` 07:44 — Checklist: painel de responsável do item compacto (uma linha)
- `a24fa64` 07:39 — Checklist do cartão: responsável por sub-atividade e mover para cima/baixo (RENATA: quadro_checklist ganha mover e responsável)
- `860df5b` 07:33 — Gestão de Atividades: responsáveis por atividade (criar no cartão e no quadro público, avatares, RENATA quadro_responsavel)
- `225ec47` 07:15 — Gestão de Atividades: prazo em cada item do checklist (selo por situação, campo de data, RENATA define prazo)
- `d20bd44` 06:46 — Docs: cenários de escrita da RENATA com a IA real em produção
- `64a6899` 06:42 — RENATA: contenção de lote disfarçado, desfazer de lote, prévia do lote com valores
- `21c9476` 06:33 — RENATA: criar empresa e excluir empresa (nome digitado + confirmação)
- `ee97452` 06:13 — RENATA: leitura do cronograma em resumo (reuniões primeiro), corte de laço de consulta repetida
- `61aa7a1` 06:08 — RENATA: dependências entre subatividades, reuniões, cadastro/equipe/fases, checklist/comentário/páginas/colunas do quadro, ações do XFlow e cache de ferramentas

## 2026-10-25 (43)

- `397de10` 23:51 — RENATA: confirmação mostra o nome do cartão/tarefa; documentação com a verificação em produção
- `49d7295` 23:45 — RENATA operacional: catálogo de 81 ferramentas, executor com auditoria imutável, confirmação/desfazer, agente com conversa persistente, painel em todas as telas e matriz de cobertura
- `a4e7212` 23:10 — Mensagem do dia: 47 frases de líderes conferidas na fonte (com original e orientação prática) e aviso da RENATA para as sem comprovação
- `03a6868` 22:53 — Linha do tempo mostra o nome (não o id) em troca de responsável; doc da transferência dos negócios do Maurício
- `50aa0d8` 22:47 — CRM por chave: silentNotify na reatribuição de atividades em lote
- `92500e3` 22:38 — Docs: primeiro uso da chave do CRM em produção (funil comercial arquivado)
- `6ec3f47` 22:29 — Chave do CRM: dono pode ser usuário dedicado Claude Code (administrador do CRM), registro só Claude Code e log da organização
- `3b2ce0f` 22:04 — Claude Code opera o CRM por chave de API (escopo crm_operate), registrado como Claude Code, com registro de ações e autorização permanente documentada
- `5263fe6` 20:53 — Docs: cadência de follow-up criada em produção
- `28ce076` 20:51 — Docs: estado da cadência e correção do roteiro de aceite
- `9dc2e78` 20:51 — Docs: roteiro de aceite da Eduarda e estado da cadência (§98)
- `555450d` 20:44 — Docs: verificação em produção das visões salvas e dos painéis por função (§98)
- `3f28f5f` 20:38 — CRM: visões salvas de Negócios (pessoais/do time, padrão ao abrir) e Visão geral por função (Meu dia, Time, Receita, Contas)
- `c5398a8` 20:17 — Experiência de uso: medição de atrito por fluxo e nota de satisfação de 1 clique, sem vigilância (aba na Central de Inteligência)
- `2bb5f1a` 20:00 — Erros em português claro: servidor com código de suporte no log, banco/validação traduzidos, navegador sem rede/sessão/servidor fora do ar
- `f38cde2` 19:25 — Paleta de comandos (Ctrl+K): ações do CRM (criar, fila de follow-ups) e busca de negócios, empresas e contatos do CRM
- `7af3e40` 19:18 — CRM: edição direta na lista de negócios (etapa, valor, previsão, responsável) com desfazer, reagendar na Agenda, contato e próximo passo na lista
- `e7ea95f` 19:07 — CRM: cadência de follow-up por etapa e Fila de follow-ups (concluir e próximo), contato com links legíveis
- `3f6411f` 18:54 — docs: acesso da Eduarda ao CRM confirmado (Gestor Comercial)
- `3234734` 18:44 — CRM: prontidão da Eduarda — contato com ligar/WhatsApp, lead rápido, anexos sob demanda (ficha de 16 MB), mrr nulo, funil do 1º acesso; auditoria e sandbox local
- `b4ebb49` 18:27 — Corrige defeitos achados na consolidação: lacunas sem duplicar no clique duplo, API pxk_ (pulada), exemplos da IA, textos da tela e do guia, busca da Triagem e Log do link público
- `0cf8aa0` 18:20 — docs: consolida 2026-10-06 a 10-22 em PROJECT_CONTEXT §86-§91 (conferido no código), mapa, variáveis de ambiente e débitos conhecidos
- `daa7e11` 18:16 — Dependências: npm audit fix (body-parser 2.4.0, fast-uri 3.1.9, serialize-javascript 7.1.4) — 0 alertas
- `ccd5b29` 18:08 — docs: §15 com as pendências do PipeRun e da consolidação de outubro
- `e308aeb` 18:08 — docs: §85 (auditoria e complementos do PipeRun), linha do tempo e mapa; lacuna 10-06 a 10-24 sinalizada
- `3ac5f80` 18:05 — docs: auditoria PipeRun — Atendimento/WhatsApp descartado
- `1a97ef7` 18:03 — docs: auditoria PipeRun — 3ª leva aplicada e pendências que não são código
- `dc95e08` 18:00 — CRM/PipeRun: formulários, assinaturas e motivo de perda; referência da configuração do PipeRun
- `49d89d5` 17:56 — docs: auditoria PipeRun — tags, previsão, MRR, produtos e etapas aplicados em produção
- `a575d3e` 17:49 — CRM/PipeRun: produtos apagados no PipeRun entram inativos no catálogo
- `997096d` 17:45 — CRM: MRR, tags, previsão, produtos e etapas/SLA do PipeRun (2ª leva da migração)
- `2ed8447` 17:36 — docs: auditoria PipeRun — histórico real aplicado em produção
- `4c75d45` 17:13 — docs: auditoria PipeRun — item 2 resolvido em produção
- `c18bc5b` 17:05 — CRM/PipeRun: <img> que aponta para PDF vira anexo de download
- `4a29559` 16:32 — CRM/PipeRun: imagens das anotações viram anexo da nota; histórico real carregável do backup pela tela
- `d374b79` 16:27 — docs: auditoria da migração PipeRun (parecer, backup, origem × destino, pendências)
- `994b261` 16:02 — CRM: automação "ao ganhar" (cópia em outro funil), reproduzindo a automação ativa do PipeRun
- `072ad31` 15:55 — CRM: histórico real de etapas do PipeRun, autoria fiel e melhorias de uso (cartão, filtros, ficha, exportar)
- `790c383` 15:40 — Docs: migração PipeRun executada em produção, conferência sem divergências
- `c9db121` 15:37 — Migração PipeRun: limite de arquivo sobe de 20 para 30 MB
- `eb93506` 15:20 — Migração PipeRun → CRM pela API: extração, prévia, importação, conferência e arquivos do negócio
- `9c1296e` 14:53 — Versionamento, backup e restauração do cronograma (histórico auditável, comparar, restaurar com backup e desfazer)
- `f507630` 14:24 — Central de Inteligência Operacional: tempo medido x estimado, mapa de acessos, alertas e transparência (LGPD)

## 2026-10-23 (1)

- `e452ad0` 07:45 — Docs: ajustes da Vellore depois da reunião de 22/10

## 2026-10-22 (2)

- `7b88f67` 16:19 — PDF: tema escuro e claro, janela Exportar PDF e relatório refeito
- `a823d82` 16:00 — Docs: microatividades da Vellore

## 2026-10-21 (1)

- `951efea` 00:17 — Docs: cronograma da Marombas

## 2026-10-20 (23)

- `34c7bdd` 21:55 — Docs: e-mail da ALCAST
- `19e4abc` 21:47 — Docs: reunião de TI em 30/10 na ALCAST
- `84c3b07` 19:31 — Docs: notas técnicas e triagem de 2026 na ALCAST
- `062fd70` 19:23 — Docs: ajuste de redação
- `41207c6` 19:23 — Docs: agenda da ALCAST refeita (sem Go/No-Go, com folga entre reuniões)
- `b7bdf37` 19:20 — API de conectividade: renomear atividade
- `7870334` 19:06 — Docs: workshop com fornecedores restaurado e Documentação Extra removida na ALCAST
- `2d69471` 19:03 — Docs: limpeza da ALCAST (DeRE e itens genéricos excluídos)
- `7ed4d27` 19:02 — API de conectividade: excluir atividade e subatividade (soft delete, volta pela lixeira)
- `b597e4f` 18:21 — Docs: sequência reunião, tarefa de casa e reunião refeita na ALCAST
- `7fbf2dc` 17:33 — Docs: 16 atividades novas da auditoria gravadas na ALCAST
- `6d138e0` 17:32 — Docs: responsável padrão e correções da auditoria aplicados na ALCAST
- `16f3279` 14:16 — Docs: registro da auditoria do cronograma ALCAST (material de cliente fica em exports, fora do git)
- `feeec1e` 13:21 — Triagem: painel do dia em cartão de reunião com pauta compacta, outros itens separados e atalhos de vínculo; calendário com (+N)
- `c74b633` 13:10 — A atividade estica sozinha para cobrir subatividade que mudou de data (painel e API); auditoria de períodos da ALCAST
- `4d34529` 13:00 — Docs: 2ª gravação de agenda da ALCAST e direção para dezembro e janeiro
- `4161d84` 12:47 — Docs: regras de agenda da ALCAST e reuniões mãe gravadas (ERP e SAP, Vendas, Fiscal)
- `9170dfe` 12:40 — API de conectividade: reunião mãe e pauta (sub.add top/guide/pautaDe, pauta.link) e leitura de pautaDe e guide
- `44dd17b` 12:10 — Triagem: mostra o roteiro do encontro de cada item na lista e no painel do dia
- `34e95ff` 12:01 — Mover subatividade por clique e vincular itens à pauta da reunião em lote (itens abaixo e de outras atividades)
- `c6b8a98` 11:47 — Pauta da reunião: botão Tratar na reunião de cima vincula o item de trabalho à reunião e a data acompanha; pauta vai na descrição do evento
- `8f52d79` 11:37 — Triagem: visão de calendário (mês), filtro Ambos/Reunião/Trabalho e arrastar para mudar a data
- `76f9ebb` 10:21 — Aba Triagem: marcar Reunião ou Trabalho e a data de cada atividade e subatividade, com aviso de duas reuniões no mesmo dia

## 2026-10-19 (46)

- `aacc170` 22:30 — Tipo Reunião/Trabalho em atividade e subatividade: só reunião vai para a agenda e só uma reunião por dia; encontros como subatividades do tipo Reunião; kind na API e nos dados
- `4827483` 22:07 — Reservar na agenda: atividades podem cair no mesmo dia (a restrição de um por dia vale só para reuniões); dia do bloco dentro do período
- `c8902a6` 21:58 — Reservar na agenda: um bloco por dia na mesma empresa (dia próprio dentro do período, distribuir dias, bloqueio na tela e no servidor)
- `cc00a3e` 21:50 — Reservar na agenda: atividade do cronograma vira bloco de 60 min no Google Calendar da equipe PRICETAX (convite só aos e-mails digitados, sem cliente)
- `4014746` 21:16 — Link do cliente curto (/a/<12 caracteres>) e link de dados para Power BI (/d/<token>/atividades.csv, subatividades.csv, dados.json), independentes entre si
- `7153bd2` 21:03 — Tarefas das reuniões: botões Zerar vínculos e Vincular/sugerir atividades (não alteram o cronograma), aviso ⚠ de datas que não batem
- `081206f` 20:45 — RENATA: vínculo automático a partir de 50%, conjunto fechado de todas as atividades da empresa, dicionário de atividades e conclusão sincronizada entre tarefa e atividade (só vínculo validado)
- `4ee5d5f` 20:18 — Mapa: Ajustar tela abre o mapa em tela cheia (filtros recolhidos, Esc fecha, detalhe da atividade abre por cima)
- `5b5742c` 20:06 — Dossiê: ao subir o servidor, gerações em andamento viram erro (o job morre com o reinício e travava o botão por 45 min)
- `08425e5` 19:57 — Página pública: aba Prazos legais, bloco Aguardando a empresa, dias para a virada, Tabela com responsável herdado e Gantt com nomes legíveis
- `b19fa24` 19:47 — Página pública: etiqueta de quem responde (PRICETAX ou a empresa) no fim de cada passo e no filtro
- `906b470` 19:27 — Página pública: etiqueta de situação não estica mais em Em andamento agora
- `c3f911c` 19:21 — Proposta v5 do cronograma padrão: atividade própria de saldos credores (ICMS, IPI, PIS e COFINS), v4 intacta
- `0fcd942` 19:08 — Página pública: Em andamento agora e Calendário dos próximos passos por semana, com filtro por quem responde
- `4c9c4a6` 18:30 — API de conectividade: operação sub.move (move subatividade entre atividades, sem apagar)
- `b1732eb` 18:06 — Excel da empresa: aba Subatividades com uma subatividade por linha
- `e55a252` 18:01 — Link público de acompanhamento da empresa: /acompanhamento/<token> (Resumo, Cronograma com subatividades e Tabela, só leitura; editar exige login)
- `9933f28` 17:25 — API de conectividade: escopo read_write para ajustar o cronograma de uma empresa (dryRun, tudo-ou-nada, Log, desfazer; só admin)
- `1ce3acd` 16:40 — Histórico de versões do cronograma padrão: arquivar/desarquivar (manter só a 1.0 e a atual), propostas recolhidas
- `16f2745` 16:31 — Transcrição de reunião: tipo do item (kind) deixa de ser enum rígido e é normalizado (incidente em produção)
- `117b590` 16:22 — v4 do cronograma padrão: cobre as 25 lacunas do cruzamento com o Tecumseh (13 subatividades novas, 10 títulos e 4 roteiros ajustados; 193 -> 206)
- `ffb8f37` 16:13 — RENATA nao cria atividade do cronograma: so tarefa em atividade padrao existente, sem encaixe fica pendente
- `20f3321` 16:01 — Registro das reunioes do comite: reuniao vinculada na subatividade, tipo da tarefa (tarefa, decisao, risco, pendencia) com sugestao da IA e roteiros do registro vivo
- `76a4398` 15:45 — Proposta v4 (modelo ideal do comite de reforma tributaria) e campo Roteiro na subatividade
- `89ba7b1` 14:24 — Proposta v3 de 8 meses contados da assinatura do contrato: e-mail de boas-vindas no kickoff, janelas por atividade, tudo D+n do inicio
- `462dde1` 13:41 — Doc da proposta v3: remove go/no-go do marco de 22/12
- `c153650` 13:41 — Prontidao da virada: remove go/no-go (a reforma entra em 01/01/2027 de qualquer forma) na v3, semente da 2.0 e modelo antigo
- `6ba6c32` 13:36 — Aba Fases: numero da fase pela posicao (01 Diagnostico, 02 Mobilizacao...)
- `885ef60` 13:25 — Proposta v3: Diagnostico PRICETAX em sequencia (5/10/10/10/3/5/5 dias), primeira fase; janela da atividade principal respeitada ao instanciar
- `65265cf` 13:19 — Aba Mapa (ex-Arvore): navegacao de mapa (zoom na roda, arrastar, pinca, ajustar) e busca da tela aberta em todas as abas
- `24a14de` 13:05 — Aba Arvore: mapa mental do cronograma (fase/responsavel/situacao, filtros, busca, expandir, zoom)
- `57b463c` 12:51 — Tabela: selo #N abre a atividade e usa a cor da fase; titulo da atividade em negrito
- `14785d3` 12:45 — Empresas: um clique no nome ou logotipo entra na empresa; caixinha em coluna propria com separador
- `e309f7c` 12:38 — Aviso de nova versao: avisa a cada deploy (nao so o primeiro da sessao), checa a cada 1 min e ao voltar para a aba
- `7e35dd2` 12:20 — Velocimetro da atividade e seletor feita/pulada nas subatividades (com motivo, quem e quando)
- `f0a1ce0` 12:14 — Detalhe da atividade: subatividades no lugar dos comentarios (nomes completos) e comentarios na coluna da direita
- `02886d2` 11:54 — Ajustar datas automaticamente (caixa por empresa) e travar data: mudar uma data empurra as seguintes, com aviso e desfazer
- `2c5dc99` 11:40 — Auditoria compara a empresa com a versao atual do cronograma padrao (datas por ancora, limite e predecessoras)
- `143b20e` 11:32 — Cronograma padrao: regra do limite (prazo comprimido), avisos de atividade vencida e previa no cadastro da empresa; v3 com datas proprias antes do limite
- `3127e85` 11:22 — Proposta v3 do cronograma padrao carregavel no rascunho; ancoras (virada e fixa) mantem a data na empresa nova
- `9d195cb` 11:15 — Subatividades ganham prioridade, executor, areas, limite da norma, predecessoras, recorrencia, ancora e codigo; versoes do cronograma padrao enxergam os campos
- `47a4523` 11:07 — Cronograma padrao: marca a versao 2.0 como provisoria e registra o plano e o rascunho da v3
- `863bef4` 10:34 — Cronograma padrao editavel e versionado: tela de empresa com rascunho, versoes 1.0/2.0/3.0, empresa nova segue a ultima versao com data do kickoff
- `f5bd75a` 10:07 — Ver cronograma padrao: proposta 0.1 (5 fases, 20 principais, 87 filhas) somente leitura no seletor de empresas
- `c3b0cec` 07:58 — Botao Hoje abaixo do prazo no detalhe do cartao da Gestao de Atividades
- `565afaf` 07:37 — Auditoria da empresa contra o padrao: botao Auditoria, ausentes, comparativo de datas e alertas de coerencia (somente leitura)

## 2026-10-17 (20)

- `4899b84` 13:53 — Documenta a ativacao das chaves de push em producao (sem mudanca de codigo)
- `ce008e2` 13:51 — Log de inicializacao informa se as notificacoes push estao ativadas
- `7dba0a6` 02:54 — Notificacoes push (Web Push/VAPID): envio a partir do sino, inscricao por aparelho, eventos no service worker e bloco 'Avisos neste aparelho'; dormente ate configurar as chaves VAPID
- `bd8d106` 02:44 — Roteiro de teste mobile em aparelho real (docs/ROTEIRO_TESTE_MOBILE.md), sem mudanca de codigo
- `1c4ba50` 02:38 — PWA: app instalavel (manifesto, icones, service worker sem precache e sem cache de /api) e tela 'Sem conexao' no boot sem rede
- `0fbc1b0` 02:29 — Mobile (Fase 0, item J): arrastar no toque na Tabela (reordenar linhas) e no Gantt (mover barra) com Pointer Events
- `7cfa0df` 02:21 — Mobile (Fase 0, item F): tablet — Tabela rola em vez de ficar inalcancavel e alvos de toque de 44 px entre 768 e 1023 px / toque grosso
- `00c0f99` 02:10 — Mobile (Fase 0, itens D e E): alvos de toque de 44 px nos modais e Gestao de Atividades mais compacta no celular (menu Mais acoes, ordenacao dentro de Filtros)
- `7335abe` 01:55 — Mobile (Fase 0, itens A-C): Tabela e Fases deixam de ser cortadas em celulares estreitos; regra de 16 px do iOS cobre input sem type e contenteditable
- `e86506a` 01:46 — Fase 0 do plano mobile: auditoria medida (docs/AUDITORIA_MOBILE_FASE0.md), sem mudanca de codigo
- `51996ec` 01:22 — Chip de tarefas nas Fases (uma empresa e multiempresa)
- `538b03b` 01:17 — Chip de tarefas no Gantt (coluna de rotulos, uma empresa e multiempresa)
- `04c9382` 01:13 — Chip de tarefas no Quadro do modo uma empresa
- `b721f99` 01:10 — Chip de tarefas no Quadro do modo multiempresa (KanbanView com taskCounts/onOpenTasks opcionais)
- `3d8ef3d` 01:02 — Documenta a verificacao do chip de tarefas na visao de grupo empresarial (sem mudanca de codigo)
- `50ca628` 00:57 — Chip de tarefas no modo multiempresa: Tabela da visao geral mostra N tarefas / M abertas por atividade e o clique abre a empresa na aba Tarefas filtrada
- `58a5312` 00:52 — Move MEETINGS_CSS para meetings/meetingsCss.js: o TodoBoard deixa de depender de Meetings.jsx
- `a947f27` 00:47 — Tira os helpers de status de Meetings.jsx (meetings/todoStatus.js) e carrega detalhe da reuniao, reuniao publica e RENATA sob demanda (pacote principal 717 KB -> 569 KB)
- `3f63be8` 00:38 — Divide o AppScreens e o S: estilos em src/styles/S.js, acoes em src/app/*.js (fabricas) e area da empresa em src/screens/CompanyWorkspace.jsx; App.jsx 5.030 -> 3.209 linhas, sem mudanca de comportamento
- `28715f6` 00:03 — Divide o App.jsx: telas de administracao, quadro pessoal e vistas da empresa vao para src/screens/ e carregam sob demanda (pacote principal 1,1 MB -> 733 KB)

## 2026-10-16 (13)

- `e4c8819` 23:40 — Selo Aguardando no modo Lista do quadro pessoal (desktop na coluna Status; celular abaixo do titulo)
- `4077c9a` 23:27 — Limite de erro nos modais e gavetas do XFlow e do CRM (guardedModal): uma falha fecha so o modal, com Tentar de novo e Fechar
- `129079b` 23:12 — Sourcemap so para o log: pilhas dos erros do navegador saem com arquivo e linha do codigo-fonte
- `680a2bb` 22:49 — Captura global de erros do navegador (window.onerror e unhandledrejection) registrada no log do servidor, com filtro de ruido e cotas separadas das falhas de tela
- `694e11c` 22:42 — Limites de erro (error boundaries) nas telas principais: raiz, AppScreens, um por modulo, aba da empresa e modais; erros vao para o log do servidor
- `a826753` 22:21 — Visoes 4 a 6 da Gestao de Atividades: marcador Aguardando, painel com calendario do mes, anotacoes rapidas e atalhos
- `5aaa583` 22:00 — Detalhe da atividade lista as tarefas de reuniao vinculadas (abre a tarefa na reuniao de origem; botao leva a aba Tarefas filtrada)
- `5fe0345` 21:54 — Chip "N tarefas · M abertas" tambem na aba Tabela (linha desktop e card de celular); abre Tarefas filtrada pela atividade
- `0acdc20` 21:45 — Onda 4 de bibliotecas: Express 5, React 19, lucide 1.58, SDK Anthropic 0.135, googleapis 186, bcryptjs 3
- `b014e88` 21:35 — Onda 3 de bibliotecas: Vite 5 -> 8, plugin-react 4 -> 6, concurrently 8 -> 10 (npm audit 2 -> 0); engines.node >=22.12
- `f11e44a` 17:38 — Onda 2 de bibliotecas: Tiptap 2 -> 3 e SheetJS 0.18.5 -> 0.20.3 (npm audit 33 -> 2, so vite/esbuild de dev); conserta o botao de recuo do XFlow
- `fd2b4e1` 17:23 — Code-splitting: pacote principal de 1,99 MB para 1,0 MB (xlsx sob demanda; XFlow, Agenda, Visao Geral, Conhecimento, Pareceres, Modelos, tarefas, Indicadores e editor em pedacos), aviso amigavel se um pedaco falhar, cac…
- `ae8d5cc` 16:38 — Onda 1 de bibliotecas (npm audit fix sem force: criticos 2 -> 0) e melhorias visuais 1-3 da Gestao de Atividades: Nova atividade global (N), + na coluna, visoes rapidas e Resumo do dia; corrige 500 da aba Metricas

## 2026-10-15 (2)

- `bca5c27` 17:14 — Padrao de cronograma aprimorado (guia do Felipe): modelo novo com 15 atividades e aba Padrao na Visao Geral para aplicar nas empresas existentes, sem alterar prazos, status ou responsaveis
- `4d851d8` 15:43 — Docs: plano para aprimorar o cronograma padrao com o guia do Felipe (sem mexer em prazos; so plano)

## 2026-10-14 (1)

- `d0504e2` 09:20 — Docs: estudo do guia 'Reforma Tributaria 2027 - Guia por area' como norte dos projetos (so estudo, nada implementado)

## 2026-10-13 (9)

- `b6cfbe3` 19:29 — Vinculo tarefa -> atividade para registros ja existentes: varredura da base em segundo plano (admin) e revisao central das sugestoes
- `6e83dc0` 19:24 — Docs: avaliacao real de tarefa -> atividade passou em producao (precisao 100%, cobertura 98%)
- `9ad6e4e` 19:08 — Avaliacao tarefa -> atividade: casos revisados (56 casos, 19 atividades, armadilhas de palavra-chave) e SYSTEM exportado
- `764ebe3` 18:55 — Vinculo tarefa -> atividade (Fase 5): conjunto de avaliacao com 35 casos e criterio de liberacao, botao Rodar avaliacao, custo e erros, chave TASK_LINK_MODE e testes de isolamento
- `a56683d` 18:38 — Vinculo tarefa -> atividade (Fase 4): painel de aprendizado e taxa de acerto na Central de Conhecimento, Esquecer (admin), Levantamento e RENATA enxergando o vinculo
- `e366665` 18:31 — Vinculo tarefa -> atividade (Fase 3): aprendizado com as decisoes (piso de 3 empresas), exemplos da propria empresa para a IA, Sugerir atividades para tarefas pendentes e tarefa da RENATA ja com sugestao
- `1b29721` 18:24 — Vinculo tarefa -> atividade (Fase 2): RENATA sugere a atividade ao gerar tarefas da transcricao; Confirmar/Trocar/Nenhuma, confirmar em bloco, decisao no livro-razao
- `e190e9d` 18:15 — Vinculo tarefa de reuniao -> atividade do cronograma (Fase 1): campo na tarefa, seletor, filtro, contagem no Resumo e livro-razao task_activity_links
- `37bf166` 17:23 — Indicadores: subatividade concluida conta como ganho do dia (doneAt no item, evento step_done, Ganhos do dia = encerradas + subatividades)

## 2026-10-09 (3)

- `b498e70` 16:20 — Empresas: remove a lista suspensa de responsavel; a faixa Por responsavel passa a ser o unico controle
- `69da7bf` 16:08 — Tela de empresas: acabamento do novo desenho e faixa 'Por responsavel' com a contagem de empresas por pessoa
- `0678909` 11:30 — Empresas: responsavel(is) por empresa, padrao 'Minhas empresas', pausar = arquivar com visao de pausadas e definicao em lote

## 2026-10-07 (6)

- `fea5b15` 17:56 — Lacunas entre cronogramas: atividades-padrao que faltam em cada empresa, criacao em lote com confirmacao e RENATA geral
- `e7f558a` 17:45 — RENATA geral varre as reunioes de varias empresas (so equipe PRICETAX): limite por empresa, cobertura exata e rodape de fontes
- `fcef9de` 17:23 — Levantamento: Área, conciliação de nomes em lote, sugestão de área e organização na extração das reuniões
- `691fd23` 17:11 — Levantamento: inclui tarefas de reunião e painel de qualidade dos dados
- `a2b4a95` 16:55 — Levantamento de atividades de todas as empresas (por fase e responsável), planilha e contagens para a RENATA geral
- `8fad987` 15:21 — Cartão: descrição formatada compacta (negrito, itálico, listas, link) e negrito nos comentários

## 2026-10-06 (6)

- `dc0e319` 13:10 — Modelos: aceitar arquivos .zip (download, sem prévia)
- `47e395b` 01:11 — Hoje: escolher por origem o que aparece (Meu quadro, Atividades, Tarefas de reunião, Reuniões), salvo por usuário
- `c9fbf17` 01:06 — Hoje: botão 'Quais notificações ver' sempre visível no cabeçalho
- `a65a80a` 01:00 — Quadro pessoal: na mesma prioridade, cartão sem prazo fica abaixo dos que têm prazo
- `6d68ee9` 00:45 — Notificações: cada usuário escolhe quais categorias ver (Empresas, Gestão, XFlow, CRM, Pareceres, RENATA), salvo por usuário
- `7dfff40` 00:30 — RENATA: resolveQuery cortava o JSON (max_tokens 500) e derrubava a 2a pergunta; margem maior + fallback para a pergunta literal

## 2026-10-05 (31)

- `ac59667` 23:57 — Pareceres: RENATA estuda automaticamente ao enviar (novos/alterados), sem repetir os que falharam
- `b267be8` 23:52 — RENATA geral: botão na barra e na busca Ctrl+K; status do estudo de pareceres
- `8f15bca` 23:39 — Hoje: ocultar/expandir cada etapa; marcar todas como lidas; lembrete só de tarefa vencida há até 14 dias
- `8af452c` 23:30 — Onda 6 de usabilidade: visual, linguagem e mobile
- `c2ee8b3` 23:10 — Onda 5 de usabilidade: por que voltar amanhã
- `f27cbd7` 22:39 — Onda 4 de usabilidade: salvar sem pensar
- `96c6af4` 22:19 — Onda 3 de usabilidade: comentar, linkar e colar print em qualquer lugar
- `df12346` 22:05 — Onda 2 de usabilidade: diálogos, avisos e botões num jeito só
- `a676fa5` 21:51 — Onda 1 de usabilidade: casca única, busca Ctrl+K, Esc e Voltar consistentes
- `ef760ee` 21:34 — Onda 0 de usabilidade: parar perda de dado e UI enganosa
- `f3717b7` 20:28 — docs: plano de usabilidade e front (7 ondas) com auditoria de navegacao, botoes, fantasmas e redundancias
- `df7cab7` 20:13 — feat(inspiracao): frases do Henry Ford (12 conferidas na lista oficial do The Henry Ford) na memoria da RENATA e na Mensagem do dia; aviso das frases sem comprovacao
- `9154c9d` 19:46 — feat(meu-dia): card Mensagem do dia redesenhado (saudacao por conteudo, abas com icone, compartilhar, painel ilustrado)
- `13635ae` 19:42 — feat(inspiracao): frases do Senna na memoria da RENATA e na Mensagem do dia (so as conferidas em senna.com na tela)
- `f4f36e3` 19:34 — docs: script de teste da API de conectividade (somente leitura)
- `15dd783` 19:29 — fix(api): rota inexistente sob /api responde 404 em JSON em vez do index.html com 200
- `207290f` 18:16 — feat(conectividade): API /api/connect com tokens por janela do Claude Code (ler e criar atividades) + guia; painel recarrega o quadro e protege atividades criadas pela API
- `eb7b200` 18:04 — docs: consolida a documentacao (mapa de modulos, env, banco, APIs, pendencias, padroes, README) e regenera o indice do PROJECT_MAP
- `32b4701` 17:56 — feat(modelos): varios anexos por modelo (Word, Excel, PDF, HTML, links); HTML servido isolado
- `f2bff6e` 17:49 — feat(modelos): aba Modelos de documentos (arquivos e links com previa), irma dos Pareceres
- `450ee8f` 17:17 — fix(widget): mais linhas no widget grande (teto de 5 itens era nosso)
- `001eba9` 17:07 — feat(meu-dia): card Mensagem do dia sob o Ola, com chips e leitura completa
- `7fe5450` 15:52 — feat(widget): um script por visao e token recuperavel (cifrado)
- `c6d865f` 15:44 — feat(meu-dia): conteudo diario por usuario, boas-vindas na primeira entrada e Meu perfil em abas
- `c81d965` 15:34 — feat(widget): visoes configuraveis (urgentes, agenda) escolhidas pelo Parameter do widget
- `a45db52` 14:43 — feat(inicio): atalho 'Meu perfil' na tela inicial
- `214cddd` 14:26 — feat(widget): widget do iPhone (Scriptable) com atrasadas, hoje e proxima reuniao
- `3d84335` 12:35 — fix(atividades): dias sem movimentacao contam dias de calendario, nao blocos de 24h
- `f6e650f` 11:27 — feat(navegacao): endereco proprio por modulo para favoritar
- `0f4fcdf` 11:13 — feat(inicio): RENATA cita o quadro pessoal (atrasadas e vencem hoje)
- `52dc7da` 11:06 — fix(inicio): RENATA nao diz mais que o dia terminou quando acabam as reunioes

## 2026-10-04 (14)

- `4c89351` 21:13 — feat(ui): pecas visuais comuns, estados vazios/carregando e acessibilidade medida
- `ca7a062` 20:18 — style: fonte Inter como base do app e filtros da Visao Geral com estilo
- `00ab4b6` 20:10 — fix(renata): estudo interrompido por deploy nao prende o botao em Estudando
- `96b9cc4` 20:09 — fix(renata): pareceres de um cliente nao vazam para outro cliente
- `4d0a39b` 19:52 — feat(renata): pareceres so entram no chat quando a pergunta toca o tema; fonte Inter no Conhecimento e CRM
- `8437250` 19:42 — feat(renata): estudar Pareceres PRICETAX e sugerir caminhos nas reunioes
- `3e4013b` 19:29 — feat(pareceres): redesenho da listagem (fonte Inter, filtros em pilulas, cartoes novos)
- `ddc58c3` 18:21 — feat(usuarios): registra o primeiro uso do dia com IP e local
- `be52888` 18:12 — feat(home): Gestao de Usuarios como card na tela inicial
- `1b77485` 18:07 — feat(usuarios): auditoria de acessos (contagem, ultimo acesso, local por IP)
- `de688c6` 17:11 — feat(quadro-pessoal): pausar atividade manda para o final da coluna
- `b81662c` 16:00 — feat(atividades): indicadores recuperam o passado pelo historico e log das atividades
- `8268f7b` 15:49 — feat(atividades): indicadores dia a dia, media por dia e alternador Total/Media
- `2864c64` 15:31 — feat(atividades): indicadores de abertura e encerramento por pessoa

## 2026-10-02 (2)

- `b0cb312` 20:23 — feat(xflow): colar print e arrastar imagem nas TASKs do time de DEV
- `61d054e` 19:54 — feat(reunioes): Dossie do cliente - compilado de todas as reunioes pela RENATA (Fase A)

## 2026-10-01 (2)

- `37a1c78` 15:39 — feat(quadro-pessoal): texto do item de checklist editavel
- `bc4e8dc` 15:16 — feat(quadro-pessoal): mover atividade de coluna direto no detalhe

## 2026-09-29 (2)

- `cbf3b57` 10:47 — feat(app): aviso de nova versao disponivel (fecha o 'corrigi e nao fez efeito')
- `7fca2e2` 10:32 — fix(app): poll de sincronizacao nao apaga mais edicao local em voo

## 2026-09-28 (2)

- `4350f56` 21:51 — feat(pareceres): botao Voltar com texto e tag Geral/Cliente especifico
- `94796da` 21:30 — fix(pareceres): largura maxima, icone recalibrado e resumo no topo

## 2026-09-22 (2)

- `5ded382` 09:54 — feat(agenda): redesenho do painel da RENATA em cartoes (mockup do Rafael)
- `7aca092` 09:36 — feat(agenda): acabamento do painel da RENATA para bater com o mockup

## 2026-09-20 (15)

- `189bfe3` 21:16 — feat(agenda): barra do dia legivel - titulos, almoco rotulado, legenda e fora do expediente
- `253e117` 20:51 — feat(agenda): expediente configuravel (padrao 08-18h) e rotulo explicito do tempo livre
- `cf5c4ed` 20:42 — fix(agenda): 'Hoje está' no presente e 'Amanhã estará' no futuro
- `84bfb04` 20:39 — feat(agenda): almoço padrão 12:00–13:00 e configurável por pessoa
- `4bf9c80` 20:33 — feat(agenda): RENATA da tela inicial redesenhada — resposta do dia, semana num relance, linha do tempo e no máximo 3 avisos
- `5645484` 20:18 — fix(agenda): mostrar resposta ao convite (aceito/sem resposta/talvez/recusado), duração e tempo livre
- `6933a3d` 16:23 — feat(crm): vários funis com etapas editáveis e importação de negócios do PipeRun
- `b803f03` 16:02 — feat(crm): telefone/endereço/fundação/capital na empresa e importação de empresas do PipeRun
- `2737488` 14:27 — feat(crm): CRM PRICETAX fase 3 — atividades, agenda do CRM, próximo passo e lembretes
- `52089ef` 14:05 — feat(crm): CRM PRICETAX fase 2 — negócios, pipeline Kanban, produtos e oportunidades de upsell
- `360abcd` 13:38 — feat(crm): CRM PRICETAX fase 1 — aba CRM com Empresas, Contatos, Ficha 360, importação e permissões
- `e25c962` 12:39 — fix: aba ativa do Quadro agora é evidente (antes quase não se distinguia)
- `06983ba` 12:20 — feat: fixar o quadro compartilhado de outra pessoa como aba na Gestão de Atividades
- `4e674e6` 11:56 — fix: renomear coluna do Quadro travava e mostrava cartão-fantasma
- `7be742b` 11:51 — feat: RENATA na tela inicial mostra a agenda de hoje/semana ou convida a conectar

## 2026-09-18 (1)

- `09a490e` 18:56 — feat: erro da IA em português + "tentar novamente todas" nas transcrições

## 2026-09-17 (7)

- `d32a6c2` 22:17 — docs: registra o novo menu "Pareceres PRICETAX" (§48)
- `56a2e3f` 22:13 — feat: novo menu "Pareceres PRICETAX" — repositório de PDFs pra sócios/colaboradores
- `c7f1e6b` 16:47 — docs: registra o fechamento da auditoria "onde mais isso?" (§47)
- `bcac23f` 16:46 — fix: mesmo bug de digitação em subatividade, áreas da empresa e fases (linhas dentro de .map())
- `b9c0601` 16:31 — docs: registra auditoria "onde mais isso?" e o fix do TodoDrawer/PersonalCardDetailModal
- `5d575e6` 16:30 — fix: mesmo bug de digitação travando/apagando texto em Itens de Ação e no Quadro Pessoal
- `151c558` 15:38 — fix: digitar em atividade fazia o texto "sumir" — campo travava em re-render pesado

## 2026-09-16 (2)

- `37858b0` 20:32 — fix: transcrição travada em "Processando..." sem forma de recuperar
- `57c6eb2` 20:08 — fix: editar e fechar modal de Atividade/Reunião não avisava, podia perder edição

## 2026-09-14 (1)

- `adbb956` 08:04 — fix(RENATA): auditoria de Prompt Cache nativo da Anthropic + observabilidade

## 2026-09-13 (2)

- `1ce8901` 17:01 — RENATA Eval Harness — Fase 1 do plano P0/P1 (mede, não melhora)
- `1e4f29c` 17:01 — docs(RENATA): diagnóstico cognitivo completo + plano de implementação P0/P1

## 2026-09-12 (1)

- `3d6d8d3` 15:40 — docs(RENATA): adiciona mapa de cobertura do painel (auditoria, sem mudança de código)

## 2026-09-11 (6)

- `ca5e191` 10:14 — RENATA Fase 8: Central de Conhecimento e Memória Viva
- `11a5860` 09:08 — docs(RENATA): registra o incidente de produção da migração de status da Fase 7.1
- `2624789` 09:05 — hotfix(RENATA): corrige a ordem real da migração de status (crash-loop persistia)
- `f83c64a` 09:01 — hotfix(RENATA): corrige crash-loop em produção na migração de status da Fase 7.1
- `2d23ca3` 08:54 — RENATA Fase 7.1: endurecimento da memória em camadas e do cache semântico
- `971ad4c` 08:14 — RENATA Fase 7: memória em camadas (fatos organizacionais/projeto) + cache semântico de perguntas

## 2026-09-10 (38)

- `b76cc6c` 23:56 — fix(RENATA): corrige data errada por fuso do servidor + falta de âncora de data no prompt
- `ba4bd0c` 23:26 — RENATA Fase 6: reduz custo de token (modelo, cache de prompt, auto-reindex sob demanda)
- `a9dfde9` 22:52 — RENATA Fase 5: resposta estruturada (sections/insights) + redesign completo do painel
- `81237d3` 22:06 — fix(RENATA): max_tokens baixo demais cortava o JSON em respostas que sintetizam várias reuniões
- `cd5e76c` 22:02 — RENATA Fase 4: executora completa (criar/excluir atividades, Google Calendar, auto-reindex)
- `3e5b2a4` 20:47 — docs: registra teste real da busca semântica (Voyage AI) + achado de rate limit
- `3d6378a` 20:32 — RENATA Fase 3: busca semântica híbrida (embeddings via Voyage AI)
- `19cde1e` 19:25 — RENATA: fallback de busca OR quando a busca exata não acha nada + retry/log nas chamadas à IA
- `5291298` 19:15 — RENATA: pendências por pessoa (apelido/nome parcial) + fix nos cards de filtro das Atividades
- `d5b1175` 18:48 — Sincronização entre usuários: "BIP" pra ver mudança de outro usuário sem recarregar
- `5a89197` 18:39 — Reuniões/Atividades: log completo para envio de transcrição e mutações de TO_DO
- `54753eb` 18:25 — fix(RENATA): "resuma a última reunião" nunca achava conteúdo mesmo com memória indexada
- `bb3a3b5` 18:19 — Reuniões: botão "Reindexar memória" visível direto na tela, sem precisar abrir a RENATA
- `9346a95` 18:04 — RENATA: botão de autoatendimento pra reindexar memória do projeto
- `41eda08` 17:54 — RENATA: explica atividade lendo a transcrição de origem, não só o título
- `19f1c07` 17:48 — docs: registra bug grave e fix da reindexação de reuniões via transcrição
- `365edc6` 17:47 — fix(reunioes): reunião criada via transcrição por IA nunca entrava na memória do assistente
- `bf91132` 17:43 — Assistente do Projeto ganha nome e identidade: RENATA
- `9ac6270` 17:32 — Atividades: novos cards "cliente"/"pricetax" contando pendências por lado
- `c038558` 17:24 — docs: registra causa raiz e lição do incidente do Assistente do Projeto
- `f02ad5b` 17:24 — fix(assistente): protege buildProjectSnapshot contra dado de projeto real inesperado
- `6cfb4d6` 17:20 — fix(assistente): reverte discriminated union que quebrou todas as respostas em produção
- `ca0250a` 17:16 — Assistente do Projeto: melhorias a partir do teste real com Amanda (Te Cansa)
- `76b1e87` 17:03 — Assistente do Projeto: agente executor (v1) + lista de participantes de reunião
- `def9014` 16:42 — Assistente do Projeto: acesso a identidade/cronograma completos + aprendizado persistente
- `866a57b` 16:31 — docs: registra fixes da caixa de transcrições e ordenação cronológica de Reuniões/Atividades
- `f6701ab` 16:30 — Reuniões: some transcrição concluída da tela e ordena Realizadas por data crescente
- `dda21e7` 16:11 — Assistente do Projeto: corrige saudação sendo tratada como pergunta sem evidência
- `0518e3b` 15:58 — Assistente Inteligente de Projetos — Fase 2: Chat do Projeto
- `d90f383` 15:37 — Assistente Inteligente de Projetos — Fase 1: fundação de memória
- `5c8395d` 14:49 — Redesign da tela de Reunião: "AI Meeting Workspace"
- `4a4596f` 13:47 — Redesign da aba TO DO para "Atividades" (Centro de Execução)
- `11774dd` 12:29 — TO DO: título quebra em várias linhas e checkbox de conclusão rápida
- `a97d907` 12:19 — Novo item de TO_DO nasce com status Não iniciado
- `4f2e7cb` 12:06 — Nova aba TO DO — consolida os TO_DOs de todas as reuniões da empresa
- `b627a9e` 11:37 — TO_DO aprende quem é PRICETAX e quem é o cliente
- `7b26288` 11:27 — TO_DO da reunião ganha status próprio (urgente/andamento/pausada/concluída/não relevante)
- `1b8a267` 11:17 — Corrige condição de corrida no reload após processar transcrição

## 2026-09-09 (1)

- `aed0cb9` 15:47 — Contatos externos reutilizáveis nas Reuniões + renomeia TO_DO; estudo Telegram

## 2026-09-08 (1)

- `9cd79b8` 18:13 — Adiciona caixa de transcrições nas Reuniões (IA estrutura automaticamente)

## 2026-09-04 (1)

- `b297e71` 13:04 — Adiciona a aba Reuniões dentro de Empresas

## 2026-08-26 (4)

- `1b8a7d8` 08:21 — Visão Macro: separa "Amanhã" de "Em breve" no badge de urgência
- `1664c02` 07:06 — Permite anexar imagem/PDF/link em comentários de TASK do XFlow
- `2cdb6ec` 06:52 — Horário da reunião e "Data confirmada com o cliente?" ficam inline na Tabela
- `7d2c8c3` 06:41 — Permite anexar imagem/PDF/link em comentários de atividade

## 2026-08-25 (13)

- `96547d1` 23:26 — Nova atividade abre direto pra edição + campo "Data confirmada com o cliente?"
- `2f179db` 23:03 — Visão Macro: adiciona aba "Pausadas" com prioridade sobre as outras
- `adae937` 22:53 — Visão Macro: adiciona filtros por Empresa, Responsável, Status e Prioridade
- `acbd39e` 22:43 — Visão Macro: adiciona aba "Sem data" pra atividades sem data cadastrada
- `5b655dd` 22:34 — Visão Macro: aba Atrasadas, "Hoje" sempre visível, editar atividade direto
- `213a267` 22:15 — Adiciona a Visão Macro: cronograma consolidado de todas as empresas
- `39bdff9` 21:52 — Adiciona atalho "Início" (Home) em todas as telas pós-login
- `b2eead7` 21:37 — Adiciona atalho de avatar (Meu perfil) na tela de seleção de empresas
- `399ad0c` 21:32 — Adiciona atalho pra Agenda ao lado de XFlow na tela de Empresas
- `6e04b15` 21:14 — Adiciona a Agenda: visão unificada de disponibilidade (Google + XFlow + atividades)
- `df546b2` 20:41 — Google Calendar: mandar TASK pra Lixeira também apaga o evento
- `33ad2c8` 20:10 — Corrige gatilho de sync com Google Calendar: também dispara ao atribuir
- `eb36c23` 17:16 — Sincronização com Google Calendar: Previsão de conclusão vira evento

## 2026-08-24 (15)

- `60388a3` 22:12 — XFlow: preview de imagem em Evidências sem precisar baixar
- `110eb5f` 21:59 — XFlow: explica diferença entre Prazo e Previsão de conclusão na TASK
- `22b5e89` 21:48 — XFlow: contador de dias na Previsão de conclusão (Quadro, Lista e detalhe)
- `3a201eb` 21:31 — XFlow: corrige filtro "Responsável atual" e permite editar Produto depois de aberta
- `a6cf480` 20:58 — Central de Notificações global (sino) nas 3 abas + log de visualização de TASK
- `7ae5d68` 20:08 — XFlow: vincular TASKs, citar #N, link permanente + 2 bugs corrigidos
- `f68b5d3` 19:13 — XFlow: TASKs visíveis pra todo mundo da org, não só pro dono (reporter)
- `25c01a5` 18:59 — Permite trocar senha direto na tela de login antes de entrar
- `3e324f8` 18:51 — XFlow: nomes de solicitante na fila de triagem + tela de troca de senha
- `a32c68f` 18:19 — Botão Voltar do navegador fecha modal de detalhe em vez de sair (Nível 3)
- `e535f48` 17:57 — Botão Voltar do navegador também navega dentro do módulo (Nível 2)
- `a00dfb5` 17:18 — Botão Voltar do navegador passa a navegar dentro do app (Nível 1)
- `deb76dd` 12:03 — XFlow: filtro de Responsável atual só lista quem está com a bola de verdade
- `92962ce` 09:14 — XFlow: adiciona filtro e contagem por Responsável atual
- `aac2b18` 09:14 — Corrige clique morto em Cadastrar/Clonar empresa sem tipo de cliente

## 2026-08-20 (5)

- `c8cbe87` 20:23 — Faz RESUMO e o PDF respeitarem a mesma ordem de atividades da Tabela
- `f66a98f` 19:58 — Reveste o relatório em PDF com a identidade visual real da PRICETAX
- `12bd62a` 19:27 — Adiciona aba RESUMO em Empresas (visão executiva de acompanhamento)
- `86847b9` 18:41 — Corrige banner de Super Admin preso após logout; adiciona horário de reunião e relatório em PDF
- `693d27a` 16:37 — Corrige botão "Gestão de Atividades" aparecendo sem personalAccess

## 2026-08-19 (9)

- `6e0a8b2` 16:12 — XFlow: ordenação automática + reordenação manual no Quadro
- `de8f486` 14:01 — XFlow: Quadro ganha cor por coluna, igual ao quadro pessoal
- `6f64bf2` 12:16 — Substitui acesso a empresas implícito no papel por 3 acessos independentes
- `35680b1` 08:55 — XFlow: adiciona 3 opções em Produto/Plataforma
- `091d322` 07:59 — XFlow: substitui o editor de Descrição por um editor real (Tiptap)
- `f155434` 07:11 — XFlow: reordena formulário de Nova TASK, Data da ocorrência vira obrigatória
- `53cabfd` 06:57 — Adiciona atalho XFlow na tela de seleção de empresas
- `2abcd56` 01:06 — XFlow: adiciona aba Quadro (Kanban) como visão principal, mantém Lista
- `a3e4f8e` 00:16 — Permite vincular empresa a grupo existente já na criação

## 2026-08-18 (14)

- `3656963` 22:53 — Guarda de "alterações não salvas" padronizada em Empresas, Gestão de Atividades e XFlow
- `83dabb5` 21:47 — Corrige perda de quebras de linha ao editar comentário de atividade
- `c6f63a0` 21:19 — Grupo Empresarial v2: campo "Empresas envolvidas" por atividade
- `777c6c8` 20:40 — XFlow: badge de Tipo (BUG/Melhoria), Data de abertura e Previsão de conclusão visíveis no painel
- `2d64dfe` 20:20 — XFlow: Tipo de cliente obrigatório + autocomplete de Empresa/Cliente afetado (sem bloquear cadastro de nome novo)
- `a7ce712` 19:43 — XFlow: corrige inputs de texto sem estilo (título aparecia curto/branco)
- `11a835a` 19:20 — XFlow: campos complementares editáveis depois, navegação entre módulos, Tipo de TASK (BUG/Melhoria)
- `e38de30` 18:49 — XFlow: Descrição do BUG vira editor rich text (negrito/lista/citação/fonte) + colar print direto no texto
- `1cd9fb1` 18:27 — XFlow: excluir BUG (soft-delete) + Lixeira + apagar de vez (admin)
- `1b665e9` 18:11 — XFlow: confirma número do BUG ao criar + textareas com auto-altura
- `8f6b0f7` 18:02 — XFlow: form de abertura mais fluido, produtos reais, tipo de cliente
- `2d51bbc` 17:35 — XFlow P1: tempo/SLA por status, fluxo v2, três Homes por papel
- `9de07e1` 17:05 — XFlow P0: autorização por papel e transições de status validadas no backend
- `607d835` 15:45 — Add XFlow: módulo de gestão de BUGs com acesso restrito por papel

## 2026-08-13 (1)

- `40d950b` 17:37 — Add Grupo Empresarial: CNPJ Master + child companies with shared activities

## 2026-08-11 (9)

- `3e5f179` 23:45 — Deep pass on project memory: expand PROJECT_CONTEXT.md, shrink CLAUDE.md
- `8845a60` 23:37 — Point CLAUDE.md at PROJECT_CONTEXT.md as the primary read-first doc
- `32d87b0` 23:36 — Add PROJECT_CONTEXT.md: official technical memory of the project
- `9eef54d` 21:56 — Fix: allow dragging cards between columns in any sort mode
- `cb98a3d` 21:30 — Gestão de Atividades: complete-to-end ordering, priority sort fix, weekly archive
- `0651414` 21:11 — Add "Gestão de Usuários" shortcut to company-picker screen
- `9433b62` 20:01 — Add org picker to "Clonar empresa" (Super Admin)
- `abc1bd2` 18:11 — Fix Super Admin entry flow: org picker before company list
- `6f31e0c` 17:47 — Multi-tenant Fase 3: org picker on user/company creation for Super Admin

## 2026-08-10 (15)

- `ae20b57` 20:42 — Add POC/Demo client type and filters by tipo/status/regime to Empresas
- `6e5a652` 19:37 — Collapse Observações e Transcrição de reunião by default in activity modal
- `cb3629a` 19:11 — Add ability to edit existing comments on company activities
- `70ecce2` 18:57 — Add one-click pause/resume button to company list
- `ffb65e9` 18:44 — Multi-tenant Fase 2: painel de Super Admin + entrar em organizacoes
- `cb4d730` 18:03 — Multi-tenant Fase 1: fundacao de dados e isolamento por organizacao
- `9ef61f5` 16:39 — Add cascading pause/resume for companies to Gestao de Atividades
- `ad34ee5` 16:16 — Add stale-activity indicator to Gestao de Atividades cards
- `cfbff57` 14:44 — Update docs for public board sharing (CLAUDE.md, PROJECT_MAP.md)
- `dccd534` 14:42 — Add public/private board sharing to Gestao de Atividades
- `15cd156` 11:16 — Update CLAUDE.md: date-conflict rule removed, document personalOnly
- `e55559a` 11:15 — Remove cross-company date-conflict check entirely
- `0daad68` 11:06 — Add bulk-select for allowed CNPJs and a personal-only user flag
- `b2a5f95` 09:37 — Turn cross-company date-conflict check into a dismissable toast
- `5034b8c` 09:11 — Make the app responsive for mobile/tablet without changing desktop

## 2026-08-09 (12)

- `15b99e8` 23:09 — Improve company selector screen: search, discreet actions, workspace shortcut
- `2684371` 22:52 — Redesign subactivity rows and fix transparent logo on light theme
- `56834cb` 16:22 — Double-click a company name to enter it directly
- `d3bc360` 15:52 — Widen the company picker screen and add per-row progress/next activity
- `8cdc22e` 15:42 — Ask company client type at signup and surface it next to Nome Fantasia
- `c004417` 14:54 — Add card Status (Não iniciada/Em andamento/Pausada/Concluída) to personal board
- `8bba0f8` 14:21 — Make the whole column header draggable, not just a tiny grip icon
- `93f67d9` 14:10 — Tint the whole Kanban column, not just the header pill
- `96a7af9` 12:56 — Redesign Gestão de Atividades visuals in a Notion-inspired direction
- `01ee0b3` 12:34 — Hide personal-board filters behind a toggle button
- `12ae607` 12:25 — Fix unstyled inputs in Gestão de Atividades card detail panel
- `8dd8f92` 05:17 — Evolve Gestão de Atividades into a fluid Notion-style personal Kanban

## 2026-08-08 (2)

- `8a26958` 22:49 — Turn cross-company date conflicts into a warning instead of a block
- `c37daa9` 22:24 — Improve Empresas panel: status Pausado, comment order, regime tributário, nome fantasia

## 2026-08-06 (2)

- `60097ba` 09:13 — Anchor cloned company schedules 10 days after duplication, not on it
- `dd79b96` 08:52 — Add Gestão de Atividades: personal Kanban workspace per user

## 2026-08-03 (8)

- `4a1406b` 22:42 — Soft-delete subactivities so they land in the Lixeira too
- `621fd80` 21:41 — Bring subtask responsible/prazo/drag into the Tabela inline quick view
- `7db2c1e` 21:25 — Turn each activity into a fuller work surface: priority, participants, links, mentions and per-activity history
- `cf0ba9a` 19:48 — Add Pausado status and a recoverable trash for deleted activities
- `086823b` 18:07 — Block cross-company PRICETAX double-booking on activity date changes
- `26c0acf` 17:56 — Rework team management into a proper module with name, login, company and area
- `82306be` 16:51 — Let responsáveis link to real system users, not just free text
- `9999730` 14:33 — Add clone-activities action to the company selector screen

## 2026-08-01 (23)

- `6476ca7` 23:22 — Add edit/delete company actions to the company selector screen
- `895574f` 23:04 — Restrict Fases editing to Master/PRICETAX and add a light theme
- `16f2ea5` 22:29 — Rewrite Tabela drag-to-reorder to fix ghosting and freezing
- `66650a5` 22:18 — Record who made each log entry and restrict Log to Master/PRICETAX
- `8de05be` 22:06 — Add user avatars with a self-service "Meu perfil" picker
- `95cf223` 17:11 — Fix Prazo input styling, deadline math, and add live drag preview
- `5f0a7e2` 16:53 — Redesign Tabela with quick filters and a denser row layout
- `f5e7d00` 16:31 — Redesign Fases as a dashboard with progress overview and activity cards
- `8c69898` 16:07 — Add tooltip and click-to-open on Gantt activity bars
- `cbebdee` 15:54 — Allow dragging activities in Gantt and Tabela to reschedule dates
- `29158fa` 15:31 — Add duration-based automatic end date calculation for activities
- `fada5f8` 15:12 — Allow reordering phases by dragging in the Fases panel
- `0e08e81` 14:36 — Fix serif font fallback in Cadastrar empresa modal
- `3875e6d` 13:01 — Fix unstyled inputs in Cadastrar empresa modal from company selector
- `3c3291d` 12:55 — Fix race condition and add missing labels in edit-user modal
- `8cd4b58` 12:40 — Add multi-company overview mode with per-company selection
- `3759e8e` 11:54 — Add CNPJ lookup for company registration
- `674a92e` 11:27 — Redesign user management as a full-page dashboard
- `71d282a` 10:57 — Add real authentication and shared Postgres backend
- `939ddb4` 09:18 — Fix repo structure: add proper src/ directory, remove stray zip and broken src file
- `fc264f5` 08:55 — Create src
- `795b282` 08:55 — Add files via upload
- `8dad364` 08:54 — Add files via upload
