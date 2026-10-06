# Plano de usabilidade e front — PRICETAX (2026-10-05)

> Objetivo: um portal que dá vontade de usar e de ficar dentro dele; que não perde o que a pessoa digitou, não deixa botão "morto" nem tela "fantasma"; que faz a mesma ação do mesmo jeito em todo módulo.
> Base: varredura do código por 5 auditorias em paralelo (navegação, botões/feedback, Empresas+Reuniões, Gestão de Atividades+XFlow+CRM, demais módulos) + contagens próprias. **Só leitura: nada foi alterado.**
> Legenda de confiança: **[C]** conferido por mim no código; **[R]** vem do relatório da auditoria (lido no código por um agente, não conferido item a item). Severidade: **A** perde dado ou engana · **M** atrapalha · **B** polimento.
> Linhas citadas são de 2026-10-05 e deslocam com edições (`docs/PROJECT_MAP.md` §3 tem o índice).

---

## 1. O diagnóstico em números

| Medida | Resultado |
|---|---|
| Botões no projeto | **667** em 46 arquivos |
| Famílias visuais de botão | **15+** (`S.iconBtn`, `S.primaryBtn`, `par-btn`, `crm-btn`, `mdl-`, `knw-btn`, `wsu-btn`, `wgt-btn`, `cnx-btn`…). O componente comum `<Button>` (`src/ui`) é usado **3 vezes** |
| `window.confirm` / `alert` / `prompt` (janelinha do navegador) | **23 / 28 / 7** = 58 |
| Telas que fecham com **Esc** | só 6 arquivos / ~11 handlers (modais de Atividade, Reunião, XFlow, `SidePanel` de Pareceres/Modelos e RENATA **não** fecham com Esc) |
| Botões com `aria-label` na própria linha | ~13 de 667 (~55 botões só-ícone sem rótulo nenhum) |
| `disabled` (153) que explicam o motivo | **0** |
| Colar print (Ctrl+V) | **só no XFlow**. Nenhum outro módulo |
| Excluir com "Desfazer" | só cartão do quadro pessoal e concluir atividade. Resto: um clique sem volta, `confirm` ou frase digitada em `prompt` |
| Modelos mentais de "salvar" | **3** (autosave; botão Salvar; os dois na MESMA tela). "Salvo automaticamente" aparece em só 5 telas |
| Telas com sino de notificação | 6 de 14 |
| Módulos com atalho para outros módulos | só Empresas, Gestão de Atividades, XFlow, Agenda, Visão Geral (e de forma desigual). Conhecimento, Pareceres, Modelos, CRM, Usuários: **nenhum** |

---

## 2. Botão Voltar e atalhos entre módulos (a checagem que você pediu)

| Tela | Voltar | Início | Atalhos que tem | Faltam | Sino | Perfil |
|---|---|---|---|---|---|---|
| Tela inicial | — | — | 10 cartões | — | **não** | sim |
| Seleção de empresas | **nenhum** | ícone | Atividades, Usuários, XFlow, Agenda | Visão Geral, CRM, Conhecimento, Pareceres, Modelos | **não** | sim |
| Empresa (workspace) | "Trocar empresas" | ícone | Atividades, XFlow | Agenda, Visão Geral, CRM… (Agenda nem está no menu "Mais") | sim | sim |
| Gestão de Atividades | "**Ir para Empresas**" ❌ [C] | ícone | XFlow | Agenda, Visão Geral | sim | **não** |
| XFlow | "Sair do XFlow" | ícone (mesma ação) | Empresas, Atividades | Agenda, Visão Geral | sim | não |
| Agenda | "Sair da Agenda" | ícone (mesma ação) | Empresas, Atividades, XFlow | Visão Geral | sim | não |
| Visão Geral | "Sair da Visão Macro" | ícone (mesma ação) | Empresas, Atividades, XFlow | Agenda | sim | não |
| Conhecimento | só **X** sem texto | não | nenhum | todos | **não** | **não** |
| Pareceres | "← Voltar" | não | nenhum | todos | **não** | **não** |
| Modelos | "← Voltar" | não | nenhum | todos | **não** | **não** |
| CRM | só **X** (parece "fechar") | não | nenhum | todos | sim | não |
| Usuários / Super Admin | "Voltar ao cronograma" (com ícone X) | não | nenhum | todos | não | não |
| Sem acesso (`NoAccessScreen`) | **beco sem saída**: só "Trocar de usuário" | não | — | — | — | — |

**Achados de navegação**
1. **A [C]** — "Ir para Empresas" na Gestão de Atividades chama `onExit`, que é `goToWorkspace(null)`: leva à **tela inicial**, não a Empresas (App.jsx:6958). Rótulo errado e redundante com o botão de casa ao lado.
2. **M [R]** — Quatro formas diferentes de "voltar" (← Voltar com texto, X sem texto, "Voltar ao cronograma" com X, casa só ícone). Em XFlow/Agenda/Macro/Atividades, "Sair do X" e "Início" são o **mesmo botão duplicado** no mesmo cabeçalho.
3. **M [R]** — Voltar do **navegador** sai do módulo em Conhecimento, Pareceres, Modelos, CRM, Agenda, Visão Geral: abas, gavetas e páginas internas não empilham histórico.
4. **M [R]** — Perfil e sino distribuídos ao acaso (ver tabela). Quem entra pela tela inicial não vê notificação pendente.
5. **B [R]** — Do Conhecimento, abrir uma reunião troca de módulo sem mudar a URL (recarregar volta ao Conhecimento); dois caminhos para Usuários com URL diferente; notificação de atividade empilha duas entradas de histórico.
6. **M [R]** — `NoAccessScreen` aparece também quando a empresa foi excluída, e não oferece Início.

---

## 3. Fantasmas, cliques mortos e perda de dado (prioridade máxima)

### 3.1 Perdem dado ou enganam (severidade A)
| # | Problema | Onde | Conf. |
|---|---|---|---|
| 1 | **Remover usuário apaga na hora, sem confirmar** (nem para master) | App.jsx:4100 → `deleteUser` 2612 | [C] |
| 2 | **XFlow: o comentário e as ações (Confirmar…) limpam o rascunho ANTES do servidor responder.** Se falhar, o texto, o anexo e o link somem | XFlow.jsx:1396-1407 (`submitComment`), 1319-1385 | [C] |
| 3 | **CRM: formulários fecham com Esc/X sem guarda** (CompanyForm tem 40+ campos); nota digitada se perde | crm/ui.jsx:8-17 | [C] |
| 4 | **CRM: ficha da empresa não remonta ao trocar de empresa** (sem `key`, `editing` não zera): "Abrir [duplicada]" pode mostrar o formulário da empresa A sobre a ficha da B e salvar na errada | CrmScreen.jsx:95, CompanyDrawer.jsx:44 | [C] (o risco de gravar na errada é do relatório) |
| 5 | **"Nova atividade" e "Nova reunião" são gravadas antes de o usuário digitar**; fechar o modal deixa um registro vazio que nem aparece no Gantt | App.jsx:1819, 1839, 2016 | [C] |
| 6 | **A "guarda de saída" mente**: `useDirtyForm` compara com o valor de ABRIR o modal, não com o último salvo; avisa "alterações não salvas" quando já está tudo no banco, e "Sair sem salvar" desfaz só texto, não status/datas | App.jsx:222, 7621; MeetingDetail.jsx:191 | [R] |
| 7 | **Enviar transcrição**: modal fecha por clique fora/X sem guarda, descartando um texto longo colado | Meetings.jsx:353-365 | [R] |
| 8 | **Criar usuário falha → o formulário fecha e o erro aparece atrás**, na página | App.jsx:3833, 2486 | [R] |
| 9 | **Meu perfil › Conectar: o token some ao trocar de aba** (o aviso diz "aparece só agora"). **Bug meu** | ConnectSection.jsx:41,70 | [R] + eu sei: a aba desmonta |
| 10 | **Pareceres/Modelos engolem erro** de salvar título/descrição/comentário/excluir: o usuário acha que salvou | Pareceres.jsx:157-193, Modelos.jsx:249-286 | [R] |
| 11 | **Quadro pessoal: filtro/busca escondem cards e a coluna diz "Nenhuma tarefa aqui", contador 0**; filtros seguem ativos com o painel recolhido, sem "Limpar" | App.jsx:5686, 5751, 6299 | [R] |
| 12 | **XFlow: falha ao carregar tickets mostra quadro VAZIO sem erro** (e a Lixeira também) | XFlow.jsx:2898 | [R] |
| 13 | **Falha de carga vira "vazio falso"** em Pareceres, histórico de acessos, abas do Conhecimento | Pareceres.jsx:266, App.jsx:3606 | [R] |
| 14 | **Excluir sem rede de proteção**: tarefa de reunião (sem Lixeira), pausar empresa (pausa todas as atividades em 1 clique), excluir empresa (só `confirm`, mais fraco que excluir uma atividade), excluir página/coluna do quadro pessoal (apaga tudo), desvincular/anexo/link/comentário/checklist | ActivityRow.jsx:100, TodoDrawer.jsx:130, App.jsx:4951, 6428, 6506, 7692, 7969 | [R] |
| 15 | **Quadro no celular: scroll travado ao tocar num card** (`touchAction:'none'`, sem delay de toque); CRM usa drag nativo que não funciona no toque | App.jsx:5593, 5686; XFlow:2596; DealsPage:12 | [R] |

### 3.2 Cliques mortos e estados fantasma (A/M)
- Botões "Confirmar…" cinzas sem dizer qual campo falta: XFlow 1746-1890, Modelos "Incluir/Enviar", CRM `ContactForm/CompanyForm/DealForm/ActivityForm`, `TodoBoard` "Criar", `WidgetSection` "Copiar script" **[R]**.
- Ações do XFlow (Reprodução, Duplicado, Redirecionar, Bloquear, Reprovar, Publicar) abrem formulário **sem Cancelar** e, no celular, ele fica no fim da página: o clique "não faz nada" **[R]**.
- Notificação de tipo desconhecido: fecha o painel e **não faz nada nem marca como lida** (App.jsx:916-931) **[R]**.
- Origem da reunião no `TodoDrawer` parece link e não responde; menus ⋯ do quadro não fecham ao clicar fora (e abrem vários); "Cancelar" (X) da edição do checklist **salva**; Esc ao cancelar abre a guarda "não salvas" **[R]**.
- Excluir TASK no XFlow deixa `#número` na URL e o primeiro Voltar "não faz nada"; arrastar num quadro com ordenação ≠ Manual não faz nada e não explica **[R]**.
- Erro de um anexo do Modelo não limpa ao trocar de anexo; "Remover este anexo" some com 1 anexo, sem explicar **[R]** (esses dois são meus).
- Desfazer de "concluir" reabre sempre como "em andamento"; desfazer de "mover" manda para o fim da coluna **[R]**.

---

## 4. Botões: salvar, editar, comentar, adicionar link, adicionar print

### 4.1 Hoje, o mesmo gesto tem rótulos e formatos diferentes [R]
- **Comentar**: "Comentar" (XFlow, botão cinza), "Enviar" (TodoDrawer, amarelo), ícone Send (Pareceres/Modelos).
- **Anexar**: "Anexar evidência", "Anexar", "Anexar arquivo", "Enviar logo", "Enviar".
- **Link**: só ícone `Link2` com tooltip (App, XFlow) × "Incluir" × "Adicionar".
- **Excluir**: "Excluir", "Remover", "Desvincular", "Revogar", "Arquivar"; destrutivo ora vermelho, ora cinza.
- **Salvar**: "Salvar", "Salvar alterações", "Salvar e sair", "Salvar nova versão", "Confirmar", "Continuar", "Concluir", "Criar".
- **Não existe "Adicionar print/imagem"**: só colar (XFlow). Quadro pessoal e CRM não têm link, anexo nem print. Atividade de empresa: 1 anexo por vez, sem colar nem arrastar.
- **@menção**: placeholder promete "@ para mencionar", mas digitar `@` não abre nada (é um `<select>`); no XFlow digitar o nome à mão não gera notificação. Ctrl+Enter para enviar só em 4 lugares.

### 4.2 Três modelos mentais de salvar [R]
- **Autosave** (com "Salvo automaticamente"): cartão e atividade (App), XFlow, reunião, TodoDrawer.
- **Autosave invisível**: Pareceres, Modelos, Usuários (cada clique grava), `useDebouncedField`.
- **Botão Salvar**: CRM, Agenda, Widget, Perfil (que só grava o avatar e ainda tem "Trocar senha" abaixo).
- **Misturados na mesma tela**: Pareceres/Modelos (texto grava sozinho, escopo/link exigem "Salvar"), atividade (campos grava, checklist/link/comentário só no clique).
- Edição "escondida atrás de um lápis sem texto" em Pareceres/Modelos; o título da reunião grava a cada tecla (mesmo risco do §45).

---

## 5. Redundâncias (burras e não tão burras)

| Redundância | Onde |
|---|---|
| "Sair do XFlow/Agenda/Macro" + botão Início = mesma ação, lado a lado | XFlow:3068, Agenda:185, Macro:151, Atividades:6958 |
| X de "Sair do módulo" ao lado do Sair real (dois ícones de saída com sentidos diferentes) | Conhecimento, CRM |
| Conectar o Google em **4 lugares** (boas-vindas, Meu perfil › Agenda, banner da RENATA, callout da Agenda) | |
| Preferências do dia em 3 lugares (boas-vindas, Meu dia, "Personalizar") | |
| "código" (iPhone) × "token" (Conectar) para a mesma ideia; aba "Conectar" confunde com "Conectar Google" | Meu perfil |
| Reindexar memória em 3 lugares com 3 nomes ("Atualizar contexto", "Memória reindexada"…), jargão exposto | Meetings:215, RENATA |
| "+ Atividade/Negócio/Empresa/Contato" em 3 lugares (topbar, página, drawer); Ganho/Perdido por 3 caminhos | CRM |
| Observações × Comentários × Descrição na atividade; links/anexos dentro de cada comentário | App.jsx:7684 |
| "Fases" é aba e botão; "Lixeira" do topo conta só atividades | App.jsx:2849-2855 |
| Filtros de Atividades repetidos em 3 formas (cartões, chips, popover) | TodoBoard:357 |
| Print colado vira imagem inline **e** anexo (2 cópias independentes) | XFlow:644-700 |
| "Atividade" = 3 coisas (tarefas da reunião, atividade do cronograma, atividade do quadro pessoal); "Visão Macro" = "Visão Geral Empresas" = "Cronograma geral"; "BUG #n" para TASK | App.jsx:2894, MacroOverview:145 |
| Tela de login ainda diz "Cronograma de Reforma Tributária", produto virou ecossistema; sem "mostrar senha" nem "esqueci a senha" | App.jsx:3443 |

---

## 6. O que falta para o usuário ficar "preso" no bom sentido (hábito e retorno)

1. **Um lugar para voltar todo dia**: a tela inicial já tem Mensagem do dia + RENATA. Falta o **"Hoje" acionável**: atrasadas, reuniões, tarefas vencendo, notificações — com um clique para resolver (hoje a notificação mais comum nem navega).
2. **Navegação cruzada**: empresa ↔ reunião ↔ tarefa ↔ atividade do cronograma não se ligam (uma tarefa não aponta para a atividade).
3. **Busca global (Ctrl+K)**: só existe busca local em cada lista.
4. **Recentes e favoritos**; lembrar a última aba/empresa (hoje `view` volta para "table").
5. **Notificações acionáveis**: avisar tarefa de reunião atribuída, comentada ou vencida (o servidor só gera menção/responsável/vínculo).
6. **RENATA em todo lugar**: hoje só nas abas Reuniões e Atividades.
7. **Agenda**: é só leitura (sem novo compromisso nem aceitar/recusar); expediente/almoço ficam no `localStorage` de um navegador.
8. **Sensação de progresso**: Indicadores (§65) já existem; mostrar o "streak"/resumo da semana na tela inicial.

---

## 7. O plano, em ondas

> Princípio: **primeiro parar de perder dado, depois construir a base comum, só então embelezar.** Cada onda é publicável sozinha, com teste real (browser + HTTP) e documentação no mesmo dia.

### Onda 0 — "Parar a sangria" (1 a 2 semanas de trabalho) — corrige 3.1
1. Confirmar **remover usuário** (modal com o nome) e trocar o ícone enganoso de "bloquear" (cadeado). *[1]*
2. XFlow: limpar rascunho **só depois do sucesso**; erro mostra mensagem e mantém o texto; erro de carga com "Tentar de novo". *[2, 12]*
3. CRM: guarda de alterações em todos os formulários (reaproveitar `useDirtyForm`/`ConfirmDiscardModal`); `key={companyId}` na ficha + zerar `editing`; não fechar `ImportWizard` durante a importação. *[3, 4]*
4. "Nova atividade/reunião": criar **só ao confirmar** (ou apagar sozinha se ficou vazia). *[5]*
5. Guarda de saída honesta (dirty = só o que **não** foi persistido; rótulos "Manter / Desfazer desta sessão"); guarda na transcrição colada; erro de "criar usuário" **dentro** do modal. *[6, 7, 8]*
6. **Conectar**: não perder o token ao trocar de aba (subir o estado) e avisar antes de fechar. *[9]* — correção minha.
7. Pareceres/Modelos: nunca engolir erro (mensagem + manter rascunho; try/catch em excluir). *[10]*
8. Quadro pessoal: chip "Filtros ativos ×" sempre visível, "N ocultas por filtro" na coluna, botão Limpar. *[11]*
9. Rede de proteção das exclusões: **toast "Desfazer" (6 s)** em tarefa de reunião, pausar empresa, remover anexo/link/comentário/checklist; **excluir empresa/página** com digitação do nome. *[14]*
10. Rótulo "Ir para Empresas" → "Início" (ou apontar para Empresas); `NoAccessScreen` com Início. 
11. Quadro e CRM no celular: `TouchSensor` com delay (arrastar só ao segurar) e liberar o scroll. *[15]*
**Pronto quando:** nenhuma ação destrutiva sem proteção, nenhum erro engolido, nenhum formulário perde dado ao fechar.

### Onda 1 — "Uma casca só" (1 a 2 semanas) — resolve a seção 2 — **FEITA em 2026-10-06 (ver PROJECT_CONTEXT §81)**
- **`ModuleShell`**: um cabeçalho único em todas as telas — `← Início` (texto), **seletor de módulos** (derivado de `availableModes`/`canOpenMode`, que já existem), **busca global Ctrl+K**, sino, Meu perfil, tema, Sair. Remove os botões duplicados.
- Todo módulo ganha **Voltar do navegador** com sub-estados (abas, gavetas, páginas) via `pushLocation`.
- Sino e Perfil em **todas** as telas, inclusive a inicial.
- **Esc fecha tudo** (um hook `useEscClose` ligado ao `requestClose`, respeitando a guarda), foco preso e `aria-modal` corretos nos modais/gavetas.
**Pronto quando:** de qualquer tela, 1 clique leva a qualquer módulo; Esc e Voltar do navegador se comportam igual em todo lugar.

### Onda 2 — "Um jeito só de fazer cada coisa" (2 a 3 semanas) — base do design system — **FEITA em 2026-10-06 (ver PROJECT_CONTEXT §81)**
Componentes em `src/ui` (hoje quase sem adoção): `Button`/`IconButton` (rótulo acessível obrigatório, alvo ≥ 40 px, motivo do `disabled` em tooltip e texto), **`ConfirmDialog`** (substitui os 58 `confirm/alert/prompt`), **`Toast`** (com "Desfazer"), `Modal`/`Drawer` únicos, `SaveStatus`, `EmptyState`/`ErrorState` com "Tentar de novo", `Skeleton`.
- **Vocabulário fixo**: Salvar · Adicionar · Comentar · Anexar · Excluir (vai para Lixeira, com Desfazer) · Remover (só tirar um vínculo) · Cancelar. Primário amarelo, destrutivo vermelho — igual em todo módulo.
- Migrar módulo por módulo (Pareceres/Modelos primeiro, são a referência; depois Conhecimento, CRM, XFlow, Empresas).
**Pronto quando:** `window.confirm/alert/prompt` = 0; 100% dos botões só-ícone com rótulo; todo `disabled` explica o motivo.

### Onda 3 — "Comentar, linkar e colar print em qualquer lugar" (2 semanas) — **FEITA em 2026-10-06 (ver PROJECT_CONTEXT §81)**
- **`ComposeBox`** único: texto + **@menção com autocomplete** + **colar print (Ctrl+V)** + arrastar vários arquivos + link + **Ctrl+Enter** + prévia dos anexos; erro não apaga o que foi digitado.
- Usar em: atividade de empresa, quadro pessoal (hoje sem link/anexo/print), XFlow, notas do CRM, Pareceres/Modelos, TodoDrawer. **Editar/excluir o próprio comentário** em todos (XFlow e CRM não têm).
- Unificar "Observações/Comentários/Descrição" da atividade; um único botão **Adicionar → arquivo, print ou link**; print colado vira só imagem inline (sem cópia em Evidências).
**Pronto quando:** o mesmo gesto (comentar/linkar/anexar/colar) existe e funciona igual em todo módulo.

### Onda 4 — "Salvar sem pensar" (1 a 2 semanas) — **FEITA em 2026-10-06 (ver PROJECT_CONTEXT §81)**
- Regra única: **campo sempre editável + autosave + selo "Salvo/Salvando/Falhou — tentar de novo"** (`SaveStatus`) em todo lugar; formulário de **criação** tem botão Criar claro. Fim do lápis escondido e do "alguns campos salvam, outros não" na mesma tela.
- Perfil: "Salvar" deixa de gravar só o avatar; mudanças em Meu dia/iPhone avisam ao sair da aba.
- Título da reunião e Tabela: `useDebouncedField` (mesmo risco do §45).

### Onda 5 — "Por que voltar amanhã" (3 a 4 semanas)
- **"Hoje" acionável** na tela inicial (atrasadas, reuniões, tarefas vencendo, notificações) com resolver em 1 clique; notificações para tarefa de reunião (atribuída/comentada/vencida) e **toda notificação navega**.
- **Navegação cruzada** (empresa↔reunião↔tarefa↔atividade), **recentes e favoritos**, lembrar última aba/empresa.
- **RENATA** presente em todas as abas de uma empresa e no CRM; Agenda com ação (novo compromisso, aceitar/recusar).
- Resumo semanal na tela inicial (usa os Indicadores de §65).

### Onda 6 — Visual e linguagem (contínua, junto das ondas 2-5)
- **Tela inicial agrupada** (Trabalho diário · Clientes · Conhecimento · Administração) em vez de 10 cartões iguais; a Mensagem do dia segue em destaque.
- **Densidade**: tabela de atividades (~14 controles por linha) → menu ⋯ + ações sob hover; modal do XFlow (~20 campos, 8 ações) em seções recolhíveis; Tiptap com menos botões.
- **Mobile**: Agenda e Visão Geral responsivas (hoje sem `@media`), formulários do XFlow acima da dobra, alvos ≥ 44 px.
- **Linguagem sem jargão**: "token/export/CLAUDE.md" → aba "Integrações (avançado)" só para quem precisa; "cache hits/tokens economizados" → "respostas reaproveitadas/custo evitado"; "organização" → "empresa do grupo"; um nome por coisa (Visão Geral; Pendências vs Atividades).
- **Login moderno**: texto novo, mostrar senha, "esqueci a senha".
- **Acessibilidade**: `aria-label` em todo botão só-ícone, foco visível, contraste (já medido em §72).

---

## 8. Como medir o sucesso
| Indicador | Hoje | Meta |
|---|---|---|
| `confirm/alert/prompt` nativos | 58 | 0 |
| Famílias de botão | 15+ | 1 sistema (3 variantes) |
| Telas que fecham com Esc | ~6 | 100% dos modais/gavetas |
| Botões só-ícone sem rótulo | ~55 | 0 |
| Ações destrutivas com Desfazer/Lixeira | 2 | todas |
| Módulos com cabeçalho/atalhos únicos | 5 de 14 (desigual) | 14 de 14 |
| Módulos com comentar/linkar/colar print | 1 | todos que têm comentário |
| Erros engolidos em silêncio | ≥ 10 | 0 |

---

## 9. Ordem recomendada e riscos
1. **Ondas 0 → 1 → 2** nessa ordem (corrige perda de dado, depois unifica a casca, depois cria a base). As ondas 3-6 dependem da 2.
2. `src/App.jsx` tem ~9.960 linhas: mexer em modais dele é o trecho mais arriscado. Migrar um modal por vez, com teste no browser (como foi feito até aqui) e sem refatoração em massa.
3. **Não** trocar todos os botões de uma vez: migrar por módulo, começando pelos que já têm boa base (Pareceres/Modelos/Conhecimento).
4. Cada onda termina com: teste real (HTTP + browser, desktop e celular), documentação (`PROJECT_CONTEXT.md` §15/§16) e publicação.
5. Limitação desta auditoria: foi feita **lendo código**, sem usar o app com usuários reais. O que está marcado [R] merece conferência ao implementar; vale também observar 2 ou 3 colaboradores usando por 15 minutos antes da Onda 5.
