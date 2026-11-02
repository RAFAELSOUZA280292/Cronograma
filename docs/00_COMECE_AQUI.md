# COMECE AQUI — mapa da documentação e protocolo de leitura

> Atualizado em 2026-11-02. Este é o **primeiro arquivo** a abrir depois do `CLAUDE.md`. Ele diz **qual documento ler para cada tipo de pedido**, para você não varrer o código nem ler arquivos gigantes.

## Estado atual (2026-11-02)
Seção curta de propósito: **atualize a cada entrega** (checklist em `docs/06_MANUAL_DO_DESENVOLVEDOR.md`), **trocando** a linha da área em vez de empilhar parágrafo novo. O detalhe completo de cada entrega fica no `PROJECT_CONTEXT.md` (seção citada) e o texto longo de 01–02/11 está em `docs/09_HISTORICO_E_DECISOES.md` › "Entregas de 01–02/11 em detalhe". O `npm run docs:conferir` falha se esta seção ficar mais velha que a última seção do `PROJECT_CONTEXT.md`.

**No ar** (último deploy conferido: 02/11, ver `git log`; boas-vindas §132 publicada no fim do dia). Por área:
- **Caixa de e-mail** (`/email`, mapa legível E-01…E-16 em `docs/09` › "Mapa da Caixa de e-mail"): ler, organizar, escrever, responder, encaminhar, anexos de tudo, rascunhos, regras, pastas em árvore sem "INBOX/", seleção e "Marcar todas como lidas" como no Gmail, estilo do e-mail preservado, imagens sempre à mostra (opção em Configurar), assinatura tipo **Imagem** (banner) ou **Texto** com "Atenciosamente," livre, pesquisa em **todas as pastas** e, ao pesquisar um endereço, **conversas da equipe** com a pessoa. Clicar num e-mail em qualquer tela abre a Caixa do painel (nunca Outlook/Mail). Confirmado pelo Rafael: Fase 1, regras após reconectar e o clique no e-mail do CRM.
- **E-mail × CRM** (§130): selo Cliente/Lead/Parceiro na conversa, faixa "Empresa fora do CRM" (com "Parece ser <empresa> — vincular?" para empresa sem site nem e-mail), aba E-mails no negócio e na empresa com assinatura, imagens e anexos, bloco "Negócios fora do CRM" no cockpit.
- **Agenda** (§116zzzzzzzz = E-10, §128, §133, §134, §136): **grade no padrão do Google** (§136, publicada 02/11 à noite): dia inteiro e vários dias no dia certo (fim da "invasão" entre colunas), colunas lado a lado só onde há choque, 0h–24h com cabeçalho fixo, blocos cheios na cor, filtro "Mostrar: Sem resposta / Recusados" lembrado no aparelho, Mês com cabeçalho começando na segunda; travamento da página com atividade do CRM na semana corrigido (§134; **confirmado pelo Rafael em produção, 02/11 ~19h**); leituras com prazo (Google 15 s, CRM 10 s, tela 40 s) e aviso do que não carregou — nunca mais "carregando" para sempre; criar/editar com Meet e convidados, convite no e-mail com Sim/Talvez/Não e novo horário; agendas extras (Google externo, Microsoft, link iCal) numa grade só — Google externo e Microsoft só ligam com as chaves (pendências).
- **Boas-vindas das novidades** (§132, §135): na 1ª entrada a partir de agora, toda a equipe passa por 4 passos **sem pular** (só "Sair da conta", que não dispensa) (novidades, conectar e-mail e agenda, assinatura, como trabalhar); só some depois de concluir.
- **RENATA** (§125, §131, §132): **ensina o caminho no painel** ("como faço…", guia em `shared/launchTour.js`); lê o e-mail de quem conversa com ela e propõe o registro no CRM; revisa sozinha as propostas em PDF anexadas nos negócios (número × extenso, somas, datas, leis, CNPJ, linguagem); briefing diário ligado para todos.
- **Papéis e acesso** (§127): Sócio, Comercial, Operações (vale a partir de 03/11); Operações não alcança o CRM por nenhuma porta.
- **Cofre do projeto** (§124), **tela inicial personalizável + favoritos** (§126, §126a), **API por chave à prova de IA** (§129).
- **WhatsApp** (§123, §123a, §123b): publicado **desligado**; liga com as chaves da Meta e a Dualhook.
- Base visual e qualidade: janela única (U2), contraste nos dois temas, teste de fluxos Playwright + axe no CI.

**Checagem de 02/11 à noite (§135):** 11 defeitos corrigidos antes do lançamento; pendentes sem quebra listados no §135; **risco:** `GET /api/projects` com 17,9 MB por carga.

**Depende do Rafael** (nenhum item depende de código):
- **03/11:** acompanhar a equipe passando pela boas-vindas; quem travar no Google chama o Rafael (não há "pular").
- **Testes de uso:** e-mail de teste do painel para um Outlook e para o celular (banner da assinatura, acentos, anexo, print colado); pedir à equipe que abra a Caixa de e-mail no painel (alimenta "Conversas da equipe"); proposta real do Canva num negócio (nota da RENATA); "o que trocamos com a Okubo?" na RENATA; cockpit no iPad/iPhone; Cofre com o X da Questão e um certificado real; aceitar o novo horário do convite "KUHN COM CEO" e criar uma reunião de teste com convidado.
- **Agendas extras:** criar o usuário do Ronaldo (Sócio) e testar o link iCal; Microsoft Entra (`MS_CLIENT_ID`/`MS_CLIENT_SECRET`) e Google externo (`GOOGLE_EXT_CLIENT_ID`/`GOOGLE_EXT_CLIENT_SECRET`) na Railway; saber onde ficam BRASILPRICE e PETCONT.
- **Papéis:** decidir o papel de Leonardo, Pamella, Priscila, Rafael Tavares e Samuel; Amanda ou Maiara recarregam e confirmam que o CRM sumiu.
- **WhatsApp:** número pessoal no app Business (7 dias), conta Dualhook; verificação da Meta e chip da Eduarda depois.
- **API por chave:** gerar uma chave, "Copiar tudo para a IA" e colar no ChatGPT/Gemini/Base44.
- **Segurança:** revogar e recriar as chaves que apareceram em prints do `.env`; **não trocar o `JWT_SECRET`** (cifra tokens e Cofre; `TOKEN_ENC_KEY` não existe).
- **Decisões abertas:** briefing para todos ou piloto; letra 12,5 px → 13 px; resumo semanal (não existe; só com proposta antes).

**Não testado de verdade** (só simulado ou local):
- E-mail: envio real chegando no Outlook/celular; volume, cotas e a varredura de 6 h em produção; arrastar com toque e Safari.
- RENATA: proposta do Canva só com imagem; leitura de e-mail com IA e Gmail reais.
- Agenda: Meet e convites reais, série recorrente; contas Google externas e Microsoft reais.
- Tela inicial no iPad/iPhone e leitor de tela; Cofre com IA real e arquivo grande; ChatGPT/Gemini/Base44 reais na API; busca por significado (chave local da Voyage inválida).

**Dívidas conhecidas:** botão dentro de botão nos cartões do quadro (axe `nested-interactive`, no baseline); Esc no editor de descrição do cartão fecha só no segundo toque; imports sem uso antigos; `scripts/renata-tools.test.mjs` falha em `preferencia_guardar` (já falhava); `body` com margem padrão de 8 px; seção §116zzzzzzzz usada duas vezes (Agenda e pastas — ver E-10/E-11 no mapa).

**Servidor local:** `preview_start` com `cronograma-dev` (página 200 e API 401 sem login; armadilha do erro 126 em `docs/06_MANUAL_DO_DESENVOLVEDOR.md`).

**Economia de token:** uma conversa por tarefa. Comece por `CLAUDE.md` → esta seção → só o documento do módulo. Rode primeiro só o teste que mudou e a suíte inteira uma vez antes de publicar; confira o deploy uma vez, sem laço.

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
