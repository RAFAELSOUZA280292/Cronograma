# COMECE AQUI — mapa da documentação e protocolo de leitura

> Atualizado em 2026-11-02. Este é o **primeiro arquivo** a abrir depois do `CLAUDE.md`. Ele diz **qual documento ler para cada tipo de pedido**, para você não varrer o código nem ler arquivos gigantes.

## Estado atual (2026-11-02)
Seção curta de propósito: **atualize a cada entrega** (checklist em `docs/06_MANUAL_DO_DESENVOLVEDOR.md`). O `npm run docs:conferir` falha se ela ficar mais velha que a última seção do `PROJECT_CONTEXT.md`.

**No ar** (deploy `8bc9cc6` de 02/11, inclui tudo até `303ea9c`): janela única do app em quase todas as telas (U2), contraste medido nos dois temas, vidro na barra do topo e nos botões, mover coluna do Meu quadro para outra página, convite do Google com Meet nas reuniões do CRM, briefing diário da RENATA (**já ligado para todos**), teste de fluxos Playwright + axe no CI (15 testes).

**Confirmado pelo Rafael em 02/11:** mover coluna entre páginas do Meu quadro funciona no uso real dele.

**Em andamento — Caixa de e-mail (§116zw–§116zzz):** Fase 1 (ler e organizar o Gmail em `/email`, só equipe) no ar e confirmada pelo Rafael. **Fase 2 publicada em 02/11 (01h08, `6f3f74c`):** Escrever, Responder, Responder a todos, Encaminhar (com os anexos originais), anexos até 20 MB e assinatura por pessoa com logo embutido (E-mail › Assinatura), e-mail montado para Outlook/celular (`server/mailCompose.js`). **Pacote de produtividade publicado em 02/11 (§116zy):** mover para pasta (botão e arrastar), criar/renomear pastas, regras "sempre mover os e-mails de fulano" (filtros do Gmail), rascunho salvo sozinho e reabrível, sugestão de destinatários (Gmail + CRM) e aviso de e-mail novo com a tela aberta; **o Rafael reconectou o Gmail e confirmou que funcionou (02/11)**. **Pacote visual publicado em 02/11 (§116zz):** arrastar as divisórias entre pastas | lista | leitura (ou setas com a divisória em foco), leitura à direita, embaixo ou desligada, lista confortável ou compacta (com ou sem trecho), recolher as pastas — tudo no botão **Exibir** e lembrado por pessoa neste aparelho — e atalhos J/K, Enter, Esc, E, #, V, S, U, R, A, F, C/N e / (lista na ajuda **?**). **Pacote de personalização publicado em 02/11 (11h38, `ea587b4`; anexos "de tudo" em seguida) (§116zzz):** cor da pasta ao criar ou editar (só a paleta do Gmail), cor e tamanho do texto, imagem colada/arrastada no corpo (vai embutida, como o logo), imagem própria na assinatura (largura fixa em px, até 200 KB) e sugestão de destinatário que traz primeiro quem **começa** com o digitado ("ra" → Rafaéis); colar print põe a imagem no corpo, colar ou arrastar PDF/zip/rar vira anexo, e .exe/.js/.bat (ou .zip com um deles dentro) é recusado na hora com orientação para usar o Google Drive. Fora, por decisão: fundo/tema próprio da caixa. Próximo pacote combinado: **configurações** (resposta automática, filtros, assinatura no Gmail, encaminhamento).

**Publicado em 02/11 (§116zzzzzzzz): Agenda completa no painel e convites ligados à Caixa de e-mail.** Na Agenda: criar e editar com convidados (sugestão de contatos do Gmail e do CRM), link do Google Meet marcado por padrão, lembrete, local e descrição; detalhe com "Entrar no Google Meet", a resposta de cada participante, Sim/Talvez/Não, Propor novo horário, Editar e Cancelar reunião; o botão "Abrir no Google Calendar" saiu. No e-mail: convite (novo, alterado, cancelado, resposta ou **novo horário sugerido**) vira um cartão com Sim/Talvez/Não, Propor novo horário, Entrar na reunião, Ver na agenda e, para o organizador, **Aceitar novo horário**. Escopo do Google não mudou: ninguém reconecta. Limite: o Google não tem API para "propor horário"; a proposta feita pelo painel vai como nota na resposta "Talvez".

**WhatsApp, Fase 1 (§123), publicado desligado em 02/11:** caixa de conversas do número da PRICETAX em `/whatsapp` (equipe), pela API oficial da Meta: recebe por webhook assinado, guarda conversa e arquivos, responde texto ou arquivo dentro da janela de 24 h, status de entrega, eco do celular, avisos no sino/push. **Caixas (§123a):** cada número é uma caixa — **pessoal** (Rafael, Felipe, Ronaldo, em coexistência: só o dono vê, nada é guardado até ele autorizar, desligar apaga) ou **compartilhada** (Comercial da Eduarda, com os membros escolhidos); master configura mas não lê; conteúdo cifrado no banco. **Números pessoais pela Dualhook (§123b, em teste com o número do Rafael):** caixa com endereço secreto próprio, mostrado uma vez na configuração. Liga quando `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN` entrarem na Railway e cada número for cadastrado em "Configurar caixas" (depende da Fase 0 na Meta).

**RENATA lê o e-mail (§125), publicado em 02/11:** ferramentas `email_buscar` e `email_ler_conversa`, só leitura e só no Gmail de quem conversa com ela (sem Gmail conectado, ela orienta a conectar); texto limpo e cortado; o conteúdo não entra no registro permanente; percebe oportunidade (proposta, planilha pendente, cobrança) e **propõe** empresa, negócio, próxima atividade e nota formal no CRM, gravando só depois do sim (no mesmo pedido em que leu e-mail, toda gravação vira cartão). Caso OKUBO conferido na caixa do Rafael; cadastro no CRM aguarda o OK dele.

**Cofre do projeto (§124), publicado em 02/11:** aba **Cofre** depois de Triagem, só equipe: acessos (login e senha, ex.: X da Questão), certificado digital A1 (.pfx/.p12, senha, titular, validade com aviso de 30 dias), arquivos até 10 MB, links e notas, com pasta, etiquetas e busca. Senha e arquivo cifrados no banco; a senha só aparece com Mostrar/Copiar e cada uso (e cada download) entra no Log. A RENATA lista o cofre (`cofre_listar`) e orienta a arquivar, sem nunca ver senha. **Copiar link** (item ou cofre inteiro): endereço interno que só abre com login da equipe e acesso à empresa, direto no item destacado; a RENATA também entrega esse link.

**Tela inicial personalizável e barra de favoritos (§126), publicado em 02/11:** botão **Personalizar** ao lado do "Olá": arrastar os blocos (ou Subir/Descer, ou setas com a alça em foco), largura 1/3, 1/2, 2/3 ou inteira, esconder e mostrar, blocos **"Meu espaço"** (anotação e links, até 6) e **Restaurar padrão**; a grade reflui (2 colunas na tela média, 1 no celular). **Barra de favoritos** na barra do topo: estrela fixa a empresa ou o módulo aberto, "Favoritos" organiza e adiciona link próprio. Tudo salvo por pessoa no servidor (`users.preferences.home`); quem não mexer vê a tela de antes. **Ajuste (§126a):** no modo Personalizar os blocos ficam baixos e são pegos em qualquer ponto, com botão "Levar para o topo".

**Papéis de trabalho (§127), publicado em 02/11 (vale a partir de 03/11):** Sócio (Rafael, Felipe), Comercial (Eduarda) e Operações (Amanda, Maiara), gravados sozinhos no deploy, uma vez. Operações não alcança o CRM por nenhuma porta (tela, endereço, busca, cockpit, "Abrir no CRM", `/api/crm` com 403 em português, chave de API, RENATA, sugestão de contatos); Sócio e Comercial são administradores do CRM. Tela de usuários nova: filtros por papel, equipe, situação e Gmail, matriz "Quem acessa o quê", troca de papel com confirmação e Histórico. Fases 2–4 (ler caixas da equipe com termo e registro, classificar e-mails por domínio, radar de negócios) **não começaram**: dependem de termo de uso assinado e do Google Workspace.

**Agendas extras (§128), publicado em 02/11 (Fase 1 do plano do Ronaldo):** Agenda › **Minhas agendas** junta numa grade só a agenda principal e até 8 extras por pessoa — outra conta Google, Microsoft 365/Outlook.com (Graph) e **link iCal** (só leitura, já funciona sem nenhuma liberação) —, cada uma com nome e cor, filtro rápido acima da grade, ⚠ de conflito entre compromissos (na grade, no detalhe e ao criar) e "Novo compromisso" escolhendo a agenda (Meet no Google, Teams na Microsoft corporativa). Agenda fora do pricetax.com.br é **particular**: só o dono vê (nem Master); a RENATA só sabe "Ocupado" até o dono permitir. Corrigido junto: evento de dia inteiro aparecia um dia antes. Google de fora do domínio e Microsoft **ainda não ligam**: dependem das chaves abaixo.

**Pendências do Rafael** (nenhuma depende de código):
- **Agendas extras (§128):** (1) criar o usuário do Ronaldo (Sócio) e, com ele, testar um **link iCal** (Google Agenda › Configurações › Integrar agenda › Endereço secreto no formato iCal); (2) Microsoft: registrar o aplicativo no Microsoft Entra (multilocatário + contas pessoais; retorno `https://painel.pricetax.com.br/api/microsoft/oauth/callback`; `Calendars.ReadWrite`, `offline_access`, `User.Read`) e pôr `MS_CLIENT_ID`/`MS_CLIENT_SECRET` na Railway; (3) Google de fora do domínio: segundo projeto no Google Cloud, tela de consentimento **Externo** "Em produção", Calendar API, mesmo retorno `/api/google/oauth/callback`, e `GOOGLE_EXT_CLIENT_ID`/`GOOGLE_EXT_CLIENT_SECRET` na Railway; (4) levantar com o Ronaldo onde ficam BRASILPRICE e PETCONT (Workspace, Microsoft 365 ou hospedagem).
- **Papéis:** decidir o papel de Leonardo, Pamella, Priscila, Rafael Tavares e Samuel (hoje "sem papel" = regra antiga); criar o usuário do Ronaldo (não existe no painel) e marcá-lo Sócio; conferir em Usuários › Quem acessa o quê; pedir à Amanda ou à Maiara para recarregar a página e confirmar que o CRM sumiu.
- **RENATA e e-mail:** perguntar a ela "o que trocamos com a Okubo?" e conferir a proposta de registro; a Eduarda fazer o mesmo depois de conectar o Gmail dela. Chaves: `TOKEN_ENC_KEY` não existe na Railway (a cifra usa o `JWT_SECRET`: **não trocar o `JWT_SECRET`** sem migrar tokens e Cofre); `SEED_ADMIN_PASSWORD`/`SEED_ADMIN_NAME` sobram em produção (só valem com o banco vazio).
- **Cofre:** incluir o acesso do X da Questão e o certificado de uma empresa real, testar Mostrar/Copiar/Baixar e ver as linhas no Log.
- **WhatsApp:** (1) migrar o número pessoal para o app WhatsApp Business (a Meta exige 7 dias de uso antes de ligar); (2) criar a conta na Dualhook (teste de 14 dias) e a conexão; (3) verificação da PRICETAX na Meta e chip novo da Eduarda ficam para depois.
- **Agenda/convites:** abrir de novo o e-mail "Novo horário sugerido: KUHN COM CEO" e apertar **Aceitar novo horário** (ou Manter e responder); criar uma reunião de teste com um convidado e conferir o Meet e o convite chegando; propor horário num convite de outra pessoa e ver se a nota chega ao organizador.
- **Caixa de e-mail:** as outras pessoas reconectam o Gmail uma vez para liberar as regras; conferir a assinatura em E-mail › Assinatura e mandar um e-mail de teste para um endereço **Outlook** e para o **celular** (logo, acentos no assunto, citação, anexo, **um print colado, texto colorido e a imagem própria da assinatura**); dar cor a uma pasta e ver se aparece no Gmail; as outras pessoas conectam o próprio Gmail em `/email`.
- Revogar e recriar as chaves que apareceram em prints do `.env` (IA, Voyage, tokens `pxk_`, Google, Railway).
- Testar o convite com Meet de verdade: Reunião com horário, contato com o e-mail dele e o campo de convite marcado.
- Briefing diário: manter para todos (como está) ou pedir uma trava por pessoa para virar piloto; ouvir a Eduarda (15 min).
- Letra de 12,5 px: padronizar em 13 px? Conferir na Railway se existe um proxy que lê `X-Api-Key`. Ler `GET /api/ops-intel/payloads` como Master em alguns dias (se `GET /api/projects` passar de ~1 MB, reabrir o item E4).
- Resumo semanal (segunda-feira): **não existe**; só se o Rafael quiser, e antes uma proposta.

**Não testado de verdade:** agendas extras com contas Google externas e Microsoft reais (criar, responder, cancelar, Teams, consentimento de administrador) — só link iCal real e Graph simulado; tela inicial personalizável com toque real (iPad/iPhone), Safari e leitor de tela real; RENATA lendo e-mail com IA real e Gmail real em produção (só Gmail simulado e leitura manual da caixa); Cofre com IA real (`cofre_listar`), cópia da senha num navegador real, envio de arquivo grande e celular; Caixa de e-mail além da abertura (ações, anexos, pastas, regras, rascunhos, sugestões, caixa grande, celular, divisórias, atalhos, cor da pasta, imagem colada e cor do texto só com respostas e eventos simulados — arrastar com mouse/toque real e Safari ficam para o uso do Rafael; **envio real, Outlook e celular recebendo** dependem do teste do Rafael); iPad/iPhone e Windows reais (só Chromium); Google real (Meet e e-mail do convite; Agenda/convites do §116zzzzzzzz só com Google simulado: Meet criado de verdade, convite/alteração/cancelamento chegando, nota da proposta no Outlook, série recorrente real); IA real (busca por significado e estudo de pareceres: a chave local da Voyage é inválida).

**Dívidas conhecidas:** botão dentro de botão nos cartões do quadro (axe `nested-interactive`, no baseline); Esc dentro do editor de descrição do cartão fecha só no segundo toque; imports sem uso antigos; `scripts/renata-tools.test.mjs` falha em `preferencia_guardar` (já falhava antes); `body` com a margem padrão de 8 px.

**Últimas entregas:** §116zp–§116zzz (01 e 02/11) e §116zh–§116zo (31/10). O "porquê" de cada uma: `docs/gerado/INDICE_PROJECT_CONTEXT.md`.

**Servidor local:** `preview_start` com `cronograma-dev` (testado em 02/11: página 200 e API 401 sem login; detalhes e a armadilha do erro 126 em `docs/06_MANUAL_DO_DESENVOLVEDOR.md`).

**Economia de token:** uma conversa por tarefa (sessão longa carrega o histórico inteiro em toda resposta; a anterior chegou a ~400 mil tokens). Comece por `CLAUDE.md` → esta seção → só o documento do módulo. Rode primeiro só o teste que mudou e a suíte inteira uma vez antes de publicar; confira o deploy uma vez, sem ficar consultando em laço.

## Em uma frase
O sistema (painel da PRICETAX) é um app React + Express + Postgres com IA (RENATA); esta pasta `docs/` é o seu "cérebro" organizado: **um índice (este), uma visão geral, um documento por módulo, segurança, bugs, manuais e tabelas geradas do próprio código**.

## Protocolo de leitura (economiza tokens)
1. `CLAUDE.md` (regras permanentes) → **este arquivo**.
2. Ache o seu pedido na tabela "Pedido → onde ler" abaixo. Abra **só** o documento indicado e, nele, a **receita** parecida (seção "Receitas").
3. Para detalhes exatos use as tabelas **geradas do código** em `docs/gerado/` (rotas, tabelas do banco, variáveis, arquivos, testes). Elas não mentem; os textos podem envelhecer.
4. Precisa do "porquê" histórico? `docs/gerado/INDICE_PROJECT_CONTEXT.md` mostra a linha de cada seção do `PROJECT_CONTEXT.md` (8.000+ linhas): leia **só o trecho** (`Read` com `offset`/`limit`).
5. **Nunca** leia inteiros: `src/App.jsx`, `server/db.js`, `server/routes.js`, `PROJECT_CONTEXT.md`. Use `grep -n` e leia faixas.
6. **O código manda.** Se o código contradizer a documentação, siga o código e **corrija o documento** na mesma sessão.
7. Terminou a mudança? `npm run docs:gerar` (atualiza `docs/gerado/`) e `npm run docs:conferir` (confere caminhos/rotas/segredos citados nos documentos).

## Os documentos (ordem de leitura sugerida)

| Arquivo | Para que serve | Leia quando |
|---|---|---|
| `docs/00_COMECE_AQUI.md` | Este índice | Sempre, primeiro |
| `docs/01_ARQUITETURA.md` | Visão geral: camadas, portas de entrada, boot, deploy, onde vivem os dados | Pedido novo que atravessa várias áreas; "como isso se liga?" |
| `docs/02_FRONTEND.md` | Estrutura do React: pastas, `App.jsx`, estado, estilos, peças, padrões | Qualquer mudança de tela |
| `docs/03_BACKEND_E_API.md` | Jeito das rotas, tipos de API, erros, limites, concorrência | Qualquer rota nova ou mudança de API |
| `docs/04_SEGURANCA_E_TRAVAS.md` | Login, papéis, isolamento por base, chaves de API, proteção de dados, **tabela mestra de travas**, achados | Qualquer coisa com permissão, dado sensível, chave, link público |
| `docs/05_MODULO_EMPRESAS_CRONOGRAMA.md` | Empresas: JSON do cronograma, regras, padrão, versões, levantamento, lacunas, Visão Geral | Cronograma, atividade, fase, reunião (regras), padrão |
| `docs/05_MODULO_ATIVIDADES_AGENDA_XFLOW.md` | Quadro pessoal, Agenda/Google, XFlow, notificações/push/Meu dia | Quadro, agenda, tickets de DEV, avisos |
| `docs/05_MODULO_CRM.md` | CRM completo | Qualquer coisa do CRM |
| `docs/05_MODULO_RENATA_E_IA.md` | As duas RENATAs, ferramentas, prompts, todas as chamadas à IA | IA, RENATA, memória, custo, ferramentas |
| `docs/05_MODULO_REUNIOES_PARECERES_BIBLIOTECA.md` | Transcrição → reunião, correção de reunião, dossiê, pareceres, biblioteca | Reunião por transcrição, pareceres, materiais |
| `docs/05_MODULO_INTEGRACOES_E_PUBLICO.md` | API de conectividade, widget, link público, Modelos, Inteligência Operacional, infra/variáveis | Chaves de API, widget, páginas públicas, deploy, variáveis |
| `docs/06_MANUAL_DO_DESENVOLVEDOR.md` | Receitas (nova rota, tela, ferramenta, escopo, tabela…), checklist de "pronto", deploy | Antes de implementar e antes de publicar |
| `docs/07_MANUAL_DO_USUARIO.md` | Como a equipe usa o painel (passo a passo, problemas comuns) | Explicar a tela a alguém; entender o que o usuário vê |
| `docs/08_BUGS_E_LICOES.md` | Classes de bug, "sintoma → primeira coisa a checar", como investigar | Todo bug relatado; antes de mexer em área sensível |
| `docs/09_HISTORICO_E_DECISOES.md` | Linha do tempo e decisões permanentes do Rafael | "Por que é assim?"; antes de propor algo já decidido |
| `docs/10_GLOSSARIO.md` | Palavras do projeto | Termo desconhecido |
| `docs/11_ACHADOS_E_PENDENCIAS.md` | **Registro privado** (só na pasta de trabalho, **não** vai ao repositório público) das falhas de segurança/risco ainda abertas e já corrigidas (A1…, M1…), divergências doc×código, lacunas de teste e plano de correção | Antes de mexer em segurança/permissão; ao priorizar o que corrigir |
| `docs/gerado/*.md` | **Gerados do código**: `ROTAS`, `BANCO`, `VARIAVEIS_DE_AMBIENTE`, `TAREFAS_AGENDADAS`, `TESTES`, `ARQUIVOS`, `ENDERECOS_DO_FRONT`, `INDICE_PROJECT_CONTEXT`, `HISTORICO_COMMITS` | Dado exato (rota, coluna, variável, teste) |
| `PROJECT_CONTEXT.md` | Memória cronológica de cada decisão/bug (§ numerados) | Só o trecho que o índice apontar |
| `docs/PROJECT_MAP.md` | Mapa de componentes/linhas de `src/App.jsx` | Localizar função no front (pode estar defasado; confira com `grep`) |

Outros arquivos em `docs/` são **guias específicos vivos** (`CONECTIVIDADE_CLAUDE_CODE.md`, `IA_EXTERNA_ENVIAR_TRANSCRICAO.md`, `VERSIONAMENTO_CRONOGRAMA.md`, `MIGRACAO_PIPERUN.md`, `RESPONSIVE_ARCHITECTURE.md`, `RENATA_MATRIZ_COBERTURA.md`) e **planos/auditorias/estudos de uma data** (`PLANO_*`, `AUDITORIA_*`, `ESTUDO_*`, `ROTEIRO_*`, `RENATA_*_PLAN/GAP/BASELINE`): úteis como história; **podem estar desatualizados** — o código manda.

## Pedido → onde ler (tabela de roteamento)

| Se o Rafael pedir… | Abra | Depois |
|---|---|---|
| Mudar algo numa **tela** (texto, botão, cor, layout, mobile) | `02_FRONTEND.md` | o módulo da tela (`05_*`); `07_MANUAL_DO_USUARIO.md` para ver o fluxo atual |
| Criar **módulo/aba nova** | `06_MANUAL_DO_DESENVOLVEDOR.md` receita 4 + `02_FRONTEND.md` | `04_SEGURANCA_E_TRAVAS.md` (quem acessa) |
| **Rota/API nova** ou mudar resposta | `03_BACKEND_E_API.md` + `06` receita 1 | `gerado/ROTAS.md`; `04` (permissão) |
| Campo novo no **cronograma da empresa** | `05_MODULO_EMPRESAS_CRONOGRAMA.md` | `06` receita 2 |
| Atividade, fase, subatividade, **datas**, padrão, versões, levantamento, lacunas, Visão Geral | `05_MODULO_EMPRESAS_CRONOGRAMA.md` | `08` (datas/fuso) |
| **Reunião**: tarefas, participantes, dossiê, transcrição, correção por API | `05_MODULO_REUNIOES_PARECERES_BIBLIOTECA.md` | `05_MODULO_INTEGRACOES_E_PUBLICO.md` (se por chave) |
| **Quadro pessoal**, cartão, checklist, coluna compartilhada | `05_MODULO_ATIVIDADES_AGENDA_XFLOW.md` | `08` (digitação some, 409) |
| **Agenda**, Google Calendar, convite aceito/recusado | `05_MODULO_ATIVIDADES_AGENDA_XFLOW.md` | `gerado/VARIAVEIS_DE_AMBIENTE.md` |
| **XFlow** (BUG/TASK, quadro, transições) | `05_MODULO_ATIVIDADES_AGENDA_XFLOW.md` | — |
| **Notificações**, push, Meu dia, mensagem do dia | `05_MODULO_ATIVIDADES_AGENDA_XFLOW.md` | — |
| **CRM**: negócios, funis, cadências, produtos, importar/exportar, PipeRun | `05_MODULO_CRM.md` | `04` (crm_role); `CLAUDE.md` (operar CRM por chave) |
| **RENATA**: respostas, ferramentas, memória, custo, "travou", prompts | `05_MODULO_RENATA_E_IA.md` | `08` (corte de resposta, laço) |
| **Parecer**, estudo, sugestão por reunião, **biblioteca/materiais** | `05_MODULO_REUNIOES_PARECERES_BIBLIOTECA.md` | `05_MODULO_RENATA_E_IA.md` |
| **Chave de API**, escopos, outra janela do Claude Code, IA externa | `05_MODULO_INTEGRACOES_E_PUBLICO.md` | `04` (escopos) + `CONECTIVIDADE_CLAUDE_CODE.md` |
| **Widget** do iPhone, **link público**, Power BI/Excel, Modelos de documentos | `05_MODULO_INTEGRACOES_E_PUBLICO.md` | `04` (o que é público) |
| **Inteligência Operacional**, medição de uso, auditoria de acessos | `05_MODULO_INTEGRACOES_E_PUBLICO.md` | `04` (LGPD) |
| **Permissão**, papéis, "quem pode ver X", isolamento entre bases | `04_SEGURANCA_E_TRAVAS.md` | o módulo |
| **Deploy**, Railway, variável de ambiente, logs, hora do erro | `06` (Deploy) + `05_MODULO_INTEGRACOES_E_PUBLICO.md` | `gerado/VARIAVEIS_DE_AMBIENTE.md` |
| **Bug** em produção | `08_BUGS_E_LICOES.md` (tabela sintoma → checar) | o módulo; `gerado/TESTES.md` |
| **Performance/custo de IA** | `05_MODULO_RENATA_E_IA.md` | `gerado/TAREFAS_AGENDADAS.md` |
| **Banco**: nova tabela/coluna, consulta, índice | `06` receita 3 + `gerado/BANCO.md` | `03` (migração aditiva) |
| **Teste**: como provar | `gerado/TESTES.md` + `06` receita 9 | o módulo (seção "Como testar") |
| "**Por que** é assim?" / "já tentamos?" | `09_HISTORICO_E_DECISOES.md` | `gerado/INDICE_PROJECT_CONTEXT.md` |
| Explicar a **alguém da equipe** como usar | `07_MANUAL_DO_USUARIO.md` | — |

## Os 12 fatos que mais evitam erro (decore)
1. **Permissão se decide no servidor.** O front só esconde botão.
2. **Toda consulta filtra por `org_id`** (a "base"). Registro de outra base = 404.
3. O cronograma de uma empresa é **um JSON** (`projects.data`); gravar sem cuidado apaga o trabalho de outra pessoa → transação, 409, fusão, versionamento.
4. Banco **só aditivo** (`IF NOT EXISTS`). `server/db.js` é sensível.
5. **Exclusão lógica**: quase nada some de verdade.
6. **Dois RENATAs**: consulta (`server/assistant*.js`) e operacional (`server/renata/`). A operacional chama a **mesma API da tela** por loopback — sem poderes extras.
7. **IA sempre corta**: defina `max_tokens` com folga, trate "resposta cortada" (repetir enxuto) e mostre erro amigável.
8. **Parecer de um cliente nunca aparece em outro**; usuário `cliente` nunca vê conteúdo interno.
9. O servidor roda em **UTC**; o painel e os relatos usam **Brasília (GMT-3)**. Hora do log = Brasília + 3 h.
10. Chaves de API (`pxk_…`): só o hash fica no banco; a chave "Ler e editar tudo" é poderosa; **nunca** imprima/guarde token em texto.
11. **Deploy:** `git add` por caminho (nunca `-A`), `build` limpo, `push`, **verificar em produção**.
12. **Disse que testou? mostre como. Não testou? diga "não testado"** e registre em `PROJECT_CONTEXT.md` §15.

## Como manter esta documentação viva
| Quando você… | Faça |
|---|---|
| Criar/mudar rota, tabela, variável, tarefa agendada, teste | `npm run docs:gerar` |
| Mudar regra de negócio, permissão, arquitetura | Atualize o `05_*` (ou `04`/`01`) **e** o `PROJECT_CONTEXT.md` (§ novo ou existente) |
| Terminar uma sessão com decisão do Rafael | Linha em `09_HISTORICO_E_DECISOES.md` (fase/decisões) + memória do assistente, se for preferência |
| Publicar documentação | `npm run docs:conferir` (caminhos, linhas, rotas e segredos) deve sair sem **ATENÇÃO** |
| Achar documento errado | Corrija **o documento** (o código é a verdade) e registre a divergência no §0 do `PROJECT_CONTEXT.md` se for relevante |

## Não verificado / dúvidas
- Este índice depende dos documentos `02`, `04`, `05_*`, `07`, `08`, que foram escritos por leitura do código em 2026-10-29; cada um tem sua seção "Não verificado".
