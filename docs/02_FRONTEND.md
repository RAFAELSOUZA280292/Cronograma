# Front-end (React 19 + Vite)
> Atualizado em 2026-10-29. Dono do assunto: Rafael Souza. Fonte da verdade: o código; este texto é o mapa.
> Números de linha são de `src/App.jsx` em 2026-10-29 (3.586 linhas). Mudam a cada edição: confirme com `grep -n "nome" src/App.jsx` antes de abrir com `offset`.

## Em uma frase
O front é uma aplicação de uma página só (SPA), sem biblioteca de rotas: um componente grande (`AppScreens` em `src/App.jsx`) guarda o estado do app inteiro, escolhe a tela por um "modo" (`workspaceMode`), espelha o módulo na URL com `pushState`, e carrega cada módulo pesado sob demanda.

## Para quem é / quando ler (gatilhos)
Pedidos típicos do Rafael que mandam para este documento:
- "Criar uma aba/módulo novo no painel" ou "mudar o endereço de um módulo".
- "Mudar o que aparece na tela inicial / barra do topo / busca Ctrl+K / sino".
- "O texto que eu digito some" ou "não salvou" (autosave, debounce, poll de sincronização).
- "Duas abas apagam o trabalho uma da outra" (quadro pessoal, 409).
- "Colocar um botão com confirmação", "avisar antes de sair sem salvar", "mensagem de erro mais clara".
- "Mudar cor, tema claro/escuro, fonte, botão, card, chip" ou "ajustar no celular".
- "Novo campo no cartão do quadro" ou "novo campo na atividade da empresa".
- "Exportar para Excel/PDF", "copiar conversa da RENATA", "imprimir".
- "Quem vê qual tela" (permissão) ou "o aviso de nova versão apareceu".
- "Tela em branco depois de um deploy" (chunk velho, service worker).

**Palavras-chave para busca (robô):** `AppScreens`, `workspaceMode`, `effectiveMode`, `availableModes`, `SHELL_MODES`, `goToWorkspace`, `locationTag`, `applyLocationTag`, `pushLocation`, `MODE_PATHS`, `canOpenMode`, `lazyRetry`, `SafeBoundary`, `guard(`, `guardModal(`, `mutateProject`, `persistProjectDebounced`, `flushProjectSave`, `reloadProjects`, `saveTimers`, `inFlightProjectSaves`, `mutatePersonalBoard`, `mergeBoards`, `useDebouncedField`, `useDirtyForm`, `useAutosaveTimestamp`, `ConfirmDiscardModal`, `askConfirm`, `notify`, `beginSave`, `useAutosave`, `friendlyMessage`, `apiGet`, `ModuleShell`, `WorkspaceGateScreen`, `CompanyWorkspace`, `S.js`, `ui.css`, `data-theme`, `sw.js`, `reportClientError`.

Este documento descreve só o front. Servidor, rotas e banco: `docs/gerado/ROTAS.md`, `docs/gerado/BANCO.md`. Mapa de todos os arquivos com uma linha cada: `docs/gerado/ARQUIVOS.md` (seção `src/`).

## Estrutura de pastas

### Raiz do front
| Caminho | O que tem | Quando abrir |
|---|---|---|
| `index.html` | Variáveis CSS do tema (`:root` escuro e `html[data-theme="light"]`), fonte Inter, regras globais de acessibilidade e de toque (44 px), meta tags de PWA/iOS | Mudar cor-base, foco, tamanho de alvo de toque, zoom do iOS |
| `vite.config.js` | Plugin React, PWA (`VitePWA` em modo `injectManifest`), proxy de `/api` e `/d/` para `:3001` em dev, `sourcemap: 'hidden'` | Mudar manifesto, ícones, atalhos do app instalado, build |
| `public/` | `favicon.png`, `apple-touch-icon.png`, `icons/` (192/512 normal e maskable) | Trocar ícone do app |
| `src/main.jsx` | Entrada: captura global de erros, registro do service worker, `SafeBoundary` raiz, `<App />` | Raramente |
| `src/App.jsx` | Casca do app: estado global, login, navegação, sincronização, gates de acesso, telas pequenas (login, offline, tela inicial, sino) | Quase todo pedido de navegação, acesso, estado global ou gravação de empresa |
| `src/sw.js` | Service worker (PWA + push) | Offline, cache, aviso push |

### `src/` por pasta
| Pasta | O que tem | Quando abrir |
|---|---|---|
| `src/screens/` | Telas pesadas, todas sob demanda: `CompanyWorkspace` (área da empresa), `CompanyViews` (Resumo/Tabela/Fases/Quadro/Gantt/detalhe da atividade), `PersonalBoard` (Gestão de Atividades + quadro público), `AdminScreens` (usuários, Super Admin, seletor de empresas, Meu perfil), `MapView`, `CompanyTriage`, `PublicCompanyScreen` (link público), `CompanyShareLink`, `CompanyCalendar`, `SubExtras`, `ActivityGauge`, `AutoDates`, `ScreenSearch`, `PautaPicker` | Mexer numa tela de empresa, no quadro pessoal, em usuários |
| `src/app/` | "Fábricas de ações": `create<Nome>Actions({estado...})` (ex.: as fábricas de `src/app/`) devolve funções que alteram dados (atividades, reuniões, empresas, usuários, notificações, fases, padrão de cronograma) | Mudar o que uma ação faz (criar/excluir/restaurar atividade, tarefa de reunião, etc.) |
| `src/ui/` | Peças visuais comuns (`index.jsx`: Button, Card, Chip, Tabs, Kpi, Skeleton, EmptyState, SaveStatus...), `dialog.jsx` (Modal/Drawer/DialogOverlay), `dialogs.jsx` (`askConfirm`, `askText`, `notify`, `DialogHost`), `SafeBoundary.jsx`, `ComposeBox.jsx` (comentar/anexar), `DateTimeFields.jsx`, `RichNote.jsx`, `CsatHost.jsx`, `ui.css` | Qualquer botão/aviso/modal novo |
| `src/styles/S.js` | Objeto `S` (~450 linhas) com estilos inline compartilhados (topbar, tabs, modais, tabela, quadro...) | Mudar visual de uma peça antiga do App |
| `src/lib/` | Funções e hooks sem tela: `api.js`, `routes.js`, `nav.js` (Esc/Voltar/foco), `saveState.js`, `saveRetry.js`, `useAutosave.js`, `clientError.js`, `lazyRetry.jsx`, `usageTracker.js`, `experience.js`, `notifPrefs.js`, `push.js`/`pushPayload.js`, `recents.js`, `dateRipple.js`/`autoDates.js`, `xlsxLoader.js`, `richNote.js`, `dates.js`, `statusOrder.js`, `stdPlan.js`, `subStats.js`, `screenSearch.js` | Regra transversal (erro, gravação, URL, datas) |
| `src/shell/` | `ModuleShell` (barra única do topo), `CommandPalette` (Ctrl/Cmd+K), `NotificationPrefs` | Mexer na barra do topo, na busca global |
| `src/personal/` | Peças do quadro pessoal: `boardMerge.js` (fusão 3 vias), `BoardHistory.jsx`/`boardHistory.js` (Versões do quadro), `DaySummary`, `QuickBits`, `Workbench`, `Waiting`, `PersonalStats`, `dailyExport.js`, `boardAttention.js`, `workbenchUtils.js` | Quadro pessoal: conflito, resumo do dia, exportar daily |
| `src/meetings/` | Reuniões: `Meetings`, `MeetingDetail`, `TodoBoard` (aba "Atividades"), `TodoDrawer`, `TranscriptView`, `DossierPanel`, `ActivityLink` (vínculo tarefa→atividade) | Reunião, tarefa de reunião, dossiê |
| `src/xflow/` | `XFlow.jsx` (3.393 linhas): módulo de TASKs/bugs, histórico próprio | Qualquer coisa do XFlow |
| `src/agenda/` | `Agenda`, `NewEventModal`, `RenataAgendaBriefing` (painel da RENATA na tela inicial), `RsvpButtons`, `dayLoad.js`, `agendaPrefs.js` | Agenda, convite do Google |
| `src/macro/` | Visão Geral: `MacroOverview`, `Inventory` (levantamento), `Gaps`, `StandardPlan`, `StandardPlanBar`, `StandardAudit` | Visão Geral, padrão de cronograma |
| `src/knowledge/` | Central de Conhecimento (abas: Memórias, Pessoas/Empresas, Conflitos, Métricas, Biblioteca, Tarefas×atividades) | Conhecimento da RENATA |
| `src/pareceres/` | `Pareceres`, `ModulePanel` (gaveta) | Pareceres PRICETAX |
| `src/modelos/` | `Modelos`, `modelosMeta.js` | Modelos de documentos |
| `src/crm/` | CRM inteiro (~40 arquivos): `CrmScreen` (casca), `DealsPage`, `DealDrawer`, `CompanyDrawer`, formulários, `crmApi.js`, `crmMeta.js` (rótulos+CSS), `boardMove.js` | Qualquer pedido de CRM | Visão geral: cartões com ícone e cor por significado, menu lateral azul-marinho (§116zb); listas com ponto + data + dias de atraso (§116zc); tags neutras com bolinha e urgência em linhas (§116zd).
| `src/assistant/` | RENATA do projeto (`ProjectAssistant`), RENATA geral (`RenataHome`), `ChatExport` + `chatExport.js`, `ParecerStudyModal` | Conversa com a RENATA |
| `src/renata/` | `RenataChat` (RENATA operacional, executa ações) e `screenContext.js` (contexto da tela enviado a cada pedido) | RENATA que executa ações |
| `src/opsintel/` | Central de Inteligência Operacional (só Master): `OpsIntelScreen`, `AccessMap`, `charts.jsx`, `PrivacyNotice` | Indicadores de uso |
| `src/connect/` | Aba "Conectar" do perfil: tokens `pxk_` e guia para outra janela do Claude Code | API de conectividade (tela) |
| `src/pdf/` | `PdfExportModal`, `PrintReport` (relatório que só aparece na impressão), `pdfTheme.js` | PDF do cronograma/reunião/dossiê |
| `src/daily/` | "Meu dia": `DailyCards`, `DailyPrefs`, boas-vindas (`WelcomeSetup`, `useWelcomeSetup`) | Conteúdo diário, primeira entrada |
| `src/today/` | "Hoje" da tela inicial: `TodayPanel`, `WeekSummary`, `ContinueStrip`, `todayItems.js`, `boardActions.js` | Tela inicial |
| `src/versions/` | `VersionHistory` (histórico/restauração do cronograma) | Versões do cronograma |
| `src/widget/` | `WidgetSection`, `scriptableScript.js` (widget do iPhone) | Widget |
| `src/companies/` | `CompanyOwners` (responsáveis por empresa) | Responsável da empresa |
| `src/assets/brand/` | Logos PNG (claro e escuro) | Trocar logo |

Regra de dependência importante: **40 arquivos importam de `../App.jsx`** (`S`, `uid`, `fmtDate`, `useIsMobile`, `useDirtyForm`, `ConfirmDiscardModal`, `NotificationBell`, `SidePanel`, `STATUS_META`...). Isso cria ciclo `App.jsx` ↔ módulo; é seguro porque ninguém lê essas importações no topo do arquivo, só dentro de funções. **Não** importe de forma estática no `App.jsx` as telas de `src/screens/`, `Meetings.jsx`, `MeetingDetail.jsx` nem `ProjectAssistant.jsx` (desfaz a divisão do pacote e pode criar ciclo na inicialização): só via `lazyRetry` (PROJECT_CONTEXT §88.2).

## Mapa rápido (`src/App.jsx`)
| Componente/função (conferido) | Linha | O que faz | Quem chama / o que dispara |
|---|---|---|---|
| `useMediaQuery`, `useIsMobile` | 185, 198 | Detecta tela (<768 px = celular) | Qualquer componente com variante mobile |
| `useDirtyForm` | 205 | Diz se o formulário-rascunho mudou; liga `beforeunload` | Modais de rascunho (criar empresa, usuário...) |
| `useDebouncedField` | 234 | Campo de texto local que só grava no pai ~300 ms depois da última tecla | Campos de título/descrição em modais autosave |
| `useAutosaveTimestamp` | 276 | Marca "salvo às HH:MM" quando o registro muda | Modais autosave (atividade, cartão, TASK) |
| `ConfirmDiscardModal` | 289 | "Salvar e sair / Sair sem salvar / Continuar editando" | Todo modal editável ao fechar com rascunho |
| `SHELL_MODES` | 437 | Lista dos módulos da barra do topo (chave, rótulo, ícone) | `shellModes` |
| `AppScreens` | 455 | Todo o estado, efeitos e o `return` por módulo | Montado por `App` |
| `locationTag` / `pushLocation` / `goToWorkspace` | 696 / 712 / 730 | Troca de módulo + `pushState` com URL do módulo | Menu, cartões da tela inicial, notificações, busca |
| `applyLocationTag` | 769 | Refaz o módulo a partir do `navTag` (botão Voltar/Avançar) | Listener `popstate` (~L984) |
| `openActivityDetail` / `openMeetingDetail` | 794 / 813 | Abre detalhe empilhando camada no histórico | Clique em atividade/reunião, notificação |
| `checkSession` | 1015 | `GET /api/auth/me`; distingue "sem rede" de "deslogado" | Montagem do app, evento `online` |
| Poll de notificações | ~1050 | `GET /api/notifications` a cada 45 s e no evento `notifications:refresh` | Efeito ligado a `currentUser.id` |
| `withActingOrg` | 1056 | Acrescenta `?asOrg=<id>` quando o Super Admin "entrou" numa organização | Chamadas de projetos |
| `reloadProjects` | 1077 | `GET /api/projects`; em segundo plano **não** sobrescreve projeto com edição pendente | Carga inicial e "BIP" |
| Poll "BIP" | ~1121 | `GET /api/projects/versions` (só id+`updatedAt`) a cada 6 s | Recarrega a lista só se algo mudou |
| Aviso "nova versão" | ~1140-1190 | Busca `/` sem cache a cada 60 s, compara o `<script>` do `index.html` | Toast "Atualizar agora" |
| Abertura por endereço | ~1348-1385 | Lê `location.pathname` uma vez; só abre se `canOpenMode` | Favorito/link `/crm`, `/agenda`... |
| `sendPersonalBoard` | 1451 | `PATCH /api/personal-board` com `baseUpdatedAt` e `mergeable`; no 409 funde e reenvia (até 5 voltas) | `savePersonalBoardNow` |
| `savePersonalBoardNow` / `persistPersonalBoardDebounced` / `retryPersonalBoardNow` | 1471 / 1501 / 1514 | Gravação do quadro (500 ms), retentativa automática | `mutatePersonalBoard` |
| Poll do quadro | ~1547 | `GET /api/personal-board/version` a cada 12 s (aba visível, sem gravação pendente) | Traz mudança de outra aba/API |
| `mutatePersonalBoard` | 1553 | Único caminho para alterar o quadro pessoal | Telas do quadro, "Hoje" |
| `handleLogin` / `handleLogout` | 1584 / 1604 | `POST /api/auth/login` e `/logout`; zera estado | `LoginGate`, barra |
| `sendProject` | 1635 | `PATCH /api/projects/:id` (documento inteiro); padrão de cronograma vai para `/api/standard-plan/template/draft` | `persistProjectDebounced`, `flushProjectSave` |
| `persistProjectDebounced` / `flushProjectSave` | 1643 / 1664 | Agenda (500 ms) ou força o envio do projeto | `mutateProject`; modais ao fechar |
| `mutateProject` | 1680 | Único caminho para alterar empresa/atividade: aplica, registra log, estica período, sincroniza conclusão vinculada, agenda gravação | Todas as ações de `src/app/*` |
| `buildSearchItems` | 1808 | Itens do Ctrl+K (módulos, empresas, atividades, reuniões, cartões, ações do CRM) | `ModuleShell` via `shellRef` |
| `guard` / `guardModal` | ~2019 | `SafeBoundary` + `Suspense` em volta de cada tela/modal | Cada ramo de módulo |
| `exportExcel` / `exportPdf` | 2409 / 2464 | Planilha da empresa / janela de PDF | Menu da empresa |
| `OfflineScreen`, `LoadingScreen`, `LoginGate` | 2713, 2728, 2761 | Telas de estado do boot | `AppScreens` |
| `WorkspaceGateScreen` | 3340 | Tela inicial: cartões de módulos + RENATA + "Hoje" | `effectiveMode == null` |
| `NoAccessScreen`, `SidePanel`, `NotificationBell` | 3446, 3470, 3493 | Sem acesso; gaveta lateral; sino | — |
| `ShellHost`, `App` | 3550, 3573 | Barra do topo fora do `AppScreens` (via `shellRef`); raiz | `main.jsx` |

## Como o app liga (passo a passo)
1. **`index.html`** carrega `/src/main.jsx` (módulo). O `<style>` do `index.html` já define as variáveis de tema, então a primeira pintura nunca é "sem estilo".
2. **`src/main.jsx`**: (a) `installGlobalErrorCapture()`; (b) só em produção, registra o service worker (`virtual:pwa-register`), com `.catch` vazio: falha de registro nunca atrapalha; (c) renderiza `<React.StrictMode><SafeBoundary variant="page" where="root"><App/></SafeBoundary>`.
3. **`App`** (L3573) monta, nesta ordem: `ShellHost` (barra do topo), `SafeBoundary where="app-screens"` com `AppScreensMemo`, e `DialogHost` (diálogos e toasts globais; ver "Sistema visual").
4. **`AppScreens`** roda os `useState`/`useEffect` e então decide o que desenhar com **retornos antecipados em ordem fixa** (a ordem importa; só o primeiro que casar desenha):
   1. `/quadro/:token` → `PublicBoardScreen`; `/acompanhamento/:token` ou `/a/:token` → `PublicCompanyScreen`; `/reuniao/:token` → `PublicMeetingScreen`. São **públicas** (sem login), testadas por regex em `window.location.pathname` **antes** de qualquer checagem de sessão.
   2. `!sessionChecked` → `LoadingScreen`. `bootOffline` → `OfflineScreen`. `!currentUser` → `LoginGate`. `!projectsLoaded` → `LoadingScreen`.
   3. `availableModes.length === 0` → `NoAccessScreen`.
   4. Sem modo escolhido (`effectiveMode` nulo) → `WorkspaceGateScreen` (tela inicial). Se só existe 1 módulo, ele é aberto direto.
   5. Um ramo por módulo: `xflow`, `personal`, `agenda`, `macro`, `knowledge`, `crm`, `modelos`, `pareceres`, `ops`, `users`; o resto (Empresas) cai no seletor de empresas / `CompanyWorkspace`.
5. **Armadilha de ordem de hooks:** todos os `useState`/`useEffect` ficam **antes** do primeiro `return` antecipado, e as fábricas `create<Nome>Actions` são chamadas a cada render, num único ponto (comentário "Ações do app"). Não transforme em hook condicional nem coloque depois de um `return` (PROJECT_CONTEXT §88.4; `scripts/scope-check.py` pega uso antes da declaração).
6. **`shellRef`**: a cada render o `AppScreens` publica em `shellRef.current` o que a barra do topo precisa (usuário, módulos, sino, callbacks) e uma assinatura `sig`; a barra só re-renderiza (`bump`) quando a assinatura muda. Callbacks são lidos na hora do clique pelo `ShellHost` (`call(name)`), então nunca ficam velhos.

### Navegação (sem roteador de páginas)
- **Estado:** `workspaceMode` (`null` = tela inicial, ou `'company' | 'personal' | 'xflow' | 'agenda' | 'macro' | 'knowledge' | 'pareceres' | 'modelos' | 'crm' | 'users' | 'ops'`), mais `showUsers`/`showOrgAdmin`/`companySelectionConfirmed` dentro de Empresas.
- **Endereços:** `src/lib/routes.js` tem `MODE_PATHS` (`/gestao-atividades`, `/empresas`, `/xflow`, `/agenda`, `/visao-geral`, `/conhecimento`, `/pareceres`, `/modelos`, `/crm`, `/usuarios`, `/inteligencia`), apelidos (`ALIASES`) e as funções `pathForMode`, `modeForTag`, `pathForTag`, `modeForPath`, `canOpenMode`.
- **Trocar de módulo:** sempre `goToWorkspace(mode)` (L730): zera `showUsers/showOrgAdmin`, define `workspaceMode`, faz `history.pushState({navTag}, '', pathForTag(tag))` e grava "recentes". O `navTag` é calculado por `locationTag` (L696): `'gate'`, `'company'`, `'company:select'`, `'company:users'`, `'company:orgadmin'` ou o nome do módulo.
- **Voltar/Avançar:** listener `popstate` chama `applyLocationTag(e.state.navTag || modeForPath(pathname) || 'gate')`.
- **Abrir por favorito/link:** efeito `initialPathDone` (roda uma vez por carga, depois que há usuário): se `canOpenMode(mode, user)` é falso, volta a `/` e avisa "Você não tem acesso a essa área"; usa `replaceState`, então o Voltar sai do site. Para `/crm?negocio=<uuid>` ou `?empresa=<uuid>` abre direto a ficha (`pendingCrmOpen`). Endereço desconhecido é limpo para `/`, **exceto** `/quadro/`, `/reuniao/`, `/acompanhamento/`, `/a/` (senão o link público abriria a tela inicial para quem está logado, bug do §74).
- **Camadas dentro do módulo** (`src/lib/nav.js`): modal/gaveta empilha uma entrada de histórico (`useBackLayer`), então o Voltar do navegador **fecha** o modal em vez de sair do módulo; detalhe de atividade/reunião empilha `detailActivity`/`detailMeeting` no `state`; abas internas usam `useHistoryValue('companyView', ...)`. Esc fecha só o item mais de cima (`useEscClose`, pilha).
- **Link de TASK do XFlow** `#<número>`: tratado por efeito próprio (hash numérico faz `initialPathDone` não agir).
- **Limitação conhecida:** Voltar físico do navegador com edição não salva num modal **não** dispara `ConfirmDiscardModal` (o `popstate` já aconteceu; só X/clicar fora passam pela guarda) — PROJECT_CONTEXT §9.

### Carregamento preguiçoso (code-splitting)
- `lazyRetry(() => import(...))` (`src/lib/lazyRetry.jsx`) é um `React.lazy` que, se o pedaço (chunk) não baixa (aba antiga depois de deploy; o arquivo com hash já não existe), mostra o cartão "O sistema foi atualizado" com botão **Recarregar a página**. **Nunca recarrega sozinho** (a pessoa pode ter algo digitado).
- Em `App.jsx` L66-94: `CrmScreen`, `XFlowScreen`, `AgendaScreen`, `MacroOverviewScreen`, `KnowledgeCenterScreen`, `PareceresScreen`, `ModelosScreen`, `TodoBoardView`, `OpsIntelScreen`, 4 telas de `AdminScreens`, 2 de `PersonalBoard`, 6 de `CompanyViews`, `MeetingDetailModal`, `PublicCompanyScreen`, `PublicMeetingScreen`, `ProjectAssistant`, `CompanyWorkspace`.
- Pré-carga: com a pessoa logada e navegador ocioso (`requestIdleCallback`, 8 s; senão 4 s) importa `ui/RichNote.jsx` e `meetings/TodoBoard.jsx`, exceto se `navigator.connection.saveData`.
- A biblioteca de planilhas (`xlsx`) só baixa ao exportar (`src/lib/xlsxLoader.js`, `loadXlsx()`).
- Servidor: `/assets/*` com cache longo e imutável; `/assets/<inexistente>` responde **404 de verdade**; `*.map` sempre 404 (PROJECT_CONTEXT §88.2-88.3).

### PWA e service worker
- **Arquivo é `src/sw.js`** (não `.mjs`). `vite.config.js` usa `VitePWA({ strategies: 'injectManifest', srcDir: 'src', filename: 'sw.js', registerType: 'autoUpdate', injectRegister: false })`. O manifesto é gerado no build (`dist/manifest.webmanifest`): `start_url '/'`, `display standalone`, 4 ícones, 3 atalhos (Gestão de Atividades, Agenda, Empresas).
- **Decisões do `sw.js` (leia o cabeçalho do arquivo antes de mudar):** sem pré-cache; **nunca guarda `/api`** (`NavigationRoute` com `denylist: [/^\/api\//]`); navegação = rede primeiro (4 s) e, se falhar, devolve a última casca HTML guardada (`pricetax-shell-v1`); `/assets/*` = `CacheFirst` (150 entradas, 60 dias). Também trata `push`, `notificationclick` e `pushsubscriptionchange`.
- Offline no boot: `checkSession` vê erro **sem `status`** → `OfflineScreen` ("Sem conexão"), com nova tentativa no evento `online`. 401 → login.
- Não testado em aparelho real: instalação, tela cheia, comportamento do SW depois de um deploy novo com SW já instalado, iOS (PROJECT_CONTEXT §88.6, §15).

### Limites de erro
| Peça | O que faz | Onde |
|---|---|---|
| `SafeBoundary variant="page"` | Cartão central "Algo deu errado" com Recarregar/Tentar de novo; último recurso | `main.jsx` (`where="root"`), `App` (`where="app-screens"`) |
| `SafeBoundary variant="block"` (padrão) | Aviso no lugar da peça; o resto da tela segue | `guard(key, label, node)` em `AppScreens` (um por módulo, com "Voltar ao início") |
| `SafeBoundary variant="floating"` | Faixa no rodapé, para modais | `guardModal(...)`; `guardedModal(Impl, label, where)` no CRM (FunnelsAdmin, ImportWizard, DealDrawer, CompanyDrawer...) |
| `resetKey` | Rearma o limite ao trocar de módulo/aba/fechar modal | `guard` usa a chave do módulo |
| `reportClientError` | `POST /api/client-error` (uma vez por erro por sessão, até 20 por origem); rota exige login; o servidor troca o token de link público (`/quadro/…`, `/reuniao/…`, `/a/…`, `/d/…`, `/acompanhamento/…`) por `[token]` antes de logar | `src/lib/clientError.js` |
| `installGlobalErrorCapture` | Ouve `window` `error` e `unhandledrejection` (kind `global`); ignora ruído (script de terceiros, ResizeObserver, rede, chunk, 401) | `main.jsx` |

O estado do `AppScreens` (projetos, quadro, rascunhos do pai) é preservado quando só um módulo falha; o estado da peça que falhou é descartado. Como investigar em produção: log do Railway filtrando `client-error` (PROJECT_CONTEXT §88.3).

## Comunicação com o servidor (`src/lib/api.js`)
- **Funções:** `apiGet`, `apiPost` (corpo padrão `{}`), `apiPatch`, `apiPut`, `apiDelete`. Todas usam `fetch` com **`credentials: 'include'`**: o "cartão de entrada" (JWT) vai no cookie `cronogramatoken` (httpOnly), o JavaScript nunca o vê. Corpo é sempre JSON.
- **Erro de rede** (fetch lança): `Error` com `status = 0`, `offline = true` e mensagem "Você está sem internet..." ou "Não conseguimos falar com o servidor...".
- **Erro HTTP:** lança `Error` com `status`, `message` (do servidor, ou texto padrão em `FALLBACK` por status: 400, 401, 403, 404, 408, 409, 413, 429, 502, 503, 504, e genérico para 5xx), `ref` (código do erro para o suporte) e `data` (corpo inteiro; o CRM usa para a lista de duplicados e o quadro pessoal para o `board` do 409).
- **401:** a mensagem é "Sua sessão expirou..."; **não existe redirecionamento global para o login**. Quem chama trata (`checkSession` leva ao login ao boot; nas demais telas o erro aparece como aviso). Por isso o `reportClientError` ignora 401.
- **Gravações automáticas** (`PATCH` e `PUT`) passam por `beginSave` (`src/lib/saveState.js`): alimentam o selo global "Salvando… / Salvo / Não foi possível salvar" na barra do topo (`GlobalSaveStatus`). Só `PATCH /api/projects/:id` recebe o "Tentar de novo" global (idempotente, documento inteiro); as demais têm retry próprio. Erro 4xx chama `tracker.rejected()` (não conta como falha de gravação).
- `reportApiError` (`src/lib/experience.js`) registra só tipo de rota e status (sem corpo, sem ids) para a medição de atrito.
- O servidor transforma erros em português claro em `server/errorHandler.js` (`describeError`); o front só cobre o que o servidor não manda (sem rede, proxy fora do ar). Teste: `scripts/error-messages.test.mjs`.
- **Exceções que não usam `api.js`:** `fetch` direto em `clientError.js`, `experience.js`, `sw.js`, a checagem de versão do `index.html`, e o download `GET /api/crm/deals/export.xlsx` (`src/crm/DealsPage.jsx`, `exportDealsXlsx`).
- **Super Admin entrando numa organização:** `withActingOrg(path)` acrescenta `?asOrg=<id>`; o servidor só honra se `req.user.isSuperAdmin` (`server/routes.js`, função que resolve a base da requisição).

## Estado e sincronização

### Quatro caminhos de gravação (use o certo)
| Dado | Caminho único no front | Debounce | Rota | Conflito |
|---|---|---|---|---|
| Empresa/atividades/reuniões (`projects.data`) | `mutateProject(pid, updater, logMsg, activityId, opts)` → `persistProjectDebounced` → `sendProject` | 500 ms | `PATCH /api/projects/:id` (documento inteiro) | **Carimbo de versão** (desde 2026-10-29): `sendProject` envia `baseUpdatedAt` + `mergeable`; no 409 funde (`mergeProjects`, base × minha × servidor) e reenvia, uma gravação por vez por empresa (`projectSendChain`); bases em `projectBaseRef` (atualizadas por `reloadProjects` e pela resposta do PATCH) |
| Quadro pessoal | `mutatePersonalBoard(updater)` → `persistPersonalBoardDebounced` → `sendPersonalBoard` | 500 ms | `PATCH /api/personal-board` com `baseUpdatedAt` + `mergeable: true` | **409 + fusão de 3 vias** (`src/personal/boardMerge.js`), até 5 voltas |
| Valor isolado (preferências, visões, avatar) | `useAutosave({ value, armed, validate, save })` (`src/lib/useAutosave.js`) | 700 ms | `PUT`/`PATCH` da rota própria | Último vence |
| Ações discretas (XFlow, CRM, notificações) | `apiPost`/`apiPatch` direto da tela | nenhum | rota da ação | Servidor decide (XFlow tem matriz de transições; CRM tem permissões) |

### `mutateProject` por dentro (L1680)
1. Aplica `updater(p)` sobre o projeto no `setProjects`.
2. Se há `logMsg`, põe uma linha no `project.log` (máx. 300) com usuário e `activityId`.
3. `fitPeriods` (`shared/period.js`): a atividade **estica** para cobrir subatividades que mudaram de data (só estica, nunca encolhe) e registra no log.
4. `syncLinkedStatus` (`shared/linkSync.js`): concluiu a tarefa de reunião (ou a atividade) vinculada e validada, conclui a outra; mostra toast com **Desfazer** (`revertLinkedSync`). `opts.skipSync` desliga (só o "Desfazer").
5. `persistProjectDebounced(pid, saved)`: guarda o último dado em `pendingProjectData`, reinicia o relógio em `saveTimers[pid]`, e após 500 ms chama `sendProject`.
6. `sendProject` conta a gravação em voo em `inFlightProjectSaves[pid]` (`trackInFlightSave`). Falha → toast "Não foi possível salvar a última alteração. Verifique sua conexão." (8 s). O cronograma padrão (`STD_PLAN_ID`) vai para o **rascunho** da organização (`/api/standard-plan/template/draft`).
7. `flushProjectSave(pid)` (L1664): cancela o relógio e envia **agora**; devolve Promise. Use antes de fechar modal com autosave (bug do §43: fechar rápido parecia "não salvou").

### Poll "BIP" (sincronização entre usuários)
- **Gatilho:** efeito ligado a `currentUser.id`/`actingOrg.id`; `setTimeout` encadeado, **6 s após a resposta anterior**. Chama `GET /api/projects/versions` (só `id` + `updatedAt`, nunca o JSON inteiro). Se algum `updatedAt` mudou desde a última leitura, chama `reloadProjects({ background: true })`. Falha de rede é silenciosa.
- **Trava anti-"texto some" (§60):** em segundo plano, `reloadProjects` **não troca** um projeto que tenha `saveTimers[id]` (agendado) ou `inFlightProjectSaves[id]` (enviado, sem resposta): mantém a versão local. Sem isso, a foto velha do servidor apagava o que a pessoa acabara de digitar. **Se criar outro caminho que recarrega projetos, preserve esta regra.**
- **Outros polls:** notificações a cada 45 s; versão do quadro pessoal a cada 12 s (pula se a aba está oculta ou há gravação pendente); checagem de "nova versão" a cada 60 s (e em `visibilitychange`, `focus`, `online`).

### Quadro pessoal: conflito 409 e fusão (§117-§118)
1. A tela chama `mutatePersonalBoard(updater)`; o novo quadro vai para `personalBoardPendingRef` e, em 500 ms, `savePersonalBoardNow`.
2. `sendPersonalBoard` envia `{ board, baseUpdatedAt, mergeable: true }`. Se outra aba/pessoa gravou antes, o servidor responde **409** com `{ board, updatedAt }` (o quadro atual) **sem gravar**.
3. O front chama `mergeBoards(base, mine, theirs)`: listas com `id` (páginas, colunas, cartões, subtarefas, comentários) são fundidas por `id`; adições dos dois lados entram; exclusão alheia é respeitada se a aba não mexeu no item; campos diferentes do mesmo cartão se juntam; **mesmo campo nos dois lados: vence quem está gravando**. Reenvia (até 5 voltas; depois `retryLater`).
4. Falha **transitória** (rede, 5xx, 408, 429; `isTransientSaveError` em `src/lib/saveRetry.js`): a edição **fica na tela**, o selo mostra "Sem conexão — tentando salvar de novo… Tentar agora" e reenvia sozinho após 2 s, 5 s, 10 s, 20 s e depois a cada 30 s (`retryDelay`), e imediatamente no evento `online`. Falha **não transitória** (401/403/400/413/404): desfaz a edição (`setPersonalBoard(lastGoodPersonalBoardRef.current)`).
5. `beforeunload` avisa se a aba for fechada com gravação ou retentativa pendente.
6. O mesmo mecanismo vale para o quadro compartilhado (`PublicBoardScreen`, `savePageNow`).
7. Testes: `scripts/board-merge.test.mjs`, `scripts/save-retry.test.mjs`, `scripts/board-conflict-http.test.mjs`.

## Sistema visual

### Tema claro/escuro
- Estado `theme` em `AppScreens` (padrão `'dark'`), guardado em `localStorage` (`pricetax-cronograma-theme`) e aplicado em `document.documentElement.setAttribute('data-theme', theme)`. Alternância: `toggleTheme` / `ThemeToggleBtn` / menu da pessoa.
- Tokens base em `index.html`: `--bg-page`, `--bg-1..4`, `--border-1..3`, `--text-1..8`, `--scrollbar`; o tema claro redefine todos sob `html[data-theme="light"]`. Tokens das peças em `src/ui/ui.css`: `--ui-accent` (#F5C400, amarelo da marca), `--ui-accent-ink`, `--ui-ok/warn/danger/info` (+ `-bg`), `--ui-shadow`; o claro troca os de texto para versões escuras (contraste).
- **Armadilha de contraste:** o `index.html` tem regras `html[data-theme="light"] [style^="color: rgb(...)"]` que escurecem cores neon de **texto inline** só no tema claro. Cor nova de status vira texto ilegível no claro se não estiver nessa lista; prefira `var(--ui-ok|warn|danger|info)`.
- Fonte: `body { font-family: 'Inter', ... }` e `button, input, select, textarea { font-family: inherit }` no `index.html`. Sem isso o navegador cai em Times/Arial (§71). Módulo novo mantém Inter na raiz, inclusive em drawer/modal.
- `PROJECT_CONTEXT §16`: toda tela nova injeta seu próprio `<style>` base para `input/select/textarea` quando não usa as classes `ui-*`.

### Estilos: `S` e classes
- `S` (`src/styles/S.js`, objeto de estilos inline): importe `import { S } from '../styles/S.js'` (código novo); o `App.jsx` ainda reexporta `S` por compatibilidade. **Antes de renomear/remover uma chave de `S`, faça `grep` no projeto todo:** React ignora `style={undefined}` sem erro.
- Peças novas usam classes `ui-*` de `src/ui/ui.css`; CSS de módulo tem prefixo próprio (`crm-`, `par-`, `mdl-`, `knw-`, `shell-`, `pb-`, `mtg2-`...) e vive no próprio módulo (`crmMeta.js`, `pareceresMeta.js`, `modelosMeta.js`, `agenda.css`, `macro.css`, `meetingsCss.js`).

### Peças comuns (`src/ui/`)
| Peça | Para quê | Regra |
|---|---|---|
| `Button` (`variant` primary/danger, `size`, `icon`, `loading`) | Botão de texto | `disabled` exige `disabledReason` (vira tooltip e texto para leitor de tela) |
| `IconButton` | Botão só de ícone | `label` obrigatório (nome acessível) |
| `Card` (`interactive`) | Cartão; com `interactive+onClick` vira `role=button` com Enter/Espaço | — |
| `Chip`, `ChipRow`, `Segmented`, `Tabs`, `Select` | Filtros e abas (`aria-pressed`/`aria-selected`) | — |
| `Kpi`, `KpiGrid`, `Section`, `Callout`, `BusyBar` | Números e blocos | — |
| `EmptyState`, `ErrorState`, `Skeleton`, `SkeletonCards`, `SkeletonKpis` | Vazio, erro com "Tentar de novo", carregando | Carregando = esqueleto, não "Carregando..." solto |
| `SaveStatus`, `GlobalSaveStatus`, `RecordSaveStatus` | Selo de gravação (idle/draft/saving/saved/retrying/error) | `RecordSaveStatus` mistura rascunho local com o estado global |
| `Modal`, `Drawer` (`dialog.jsx`) | Janela/gaveta com cabeçalho, corpo rolável, rodapé, erro interno | Já traz `role=dialog`, foco preso, Esc, Voltar fecha |
| `DialogOverlay` | Overlay de modal antigo (`<div onClick>` → `<DialogOverlay onClose>`) | `history={false}` para quem já empilha o próprio histórico |
| `askConfirm`, `askText`, `notify` (`dialogs.jsx`) | Confirmar, pedir texto, avisar (com `undo`) | **Proibido** `window.confirm/alert/prompt` (`scripts/ui-audit.py` precisa dar 0) |
| `ConfirmDialog` (`index.jsx`) | Confirmação com texto a digitar (`requireText`) | Exclusão de coisa grande |
| `ComposeBox`, `CommentThread`, `AttachmentList`, `AddMenu` | Mesmo gesto de comentar/linkar/anexar em todo módulo (`DEFAULT_MAX_FILE_BYTES` = 8 MB) | — |
| `DateField`, `TimeField`, `DatePopButton` | Data e hora (substituem `<input type=date/time>` nativo, cujo calendário abre cortado em janelas com rolagem) | Valores em ISO `AAAA-MM-DD` |
| `RichNote` | Texto formatado enxuto (Tiptap); `desc` continua string (texto simples ou HTML curto) | Ignora mudança externa enquanto tem foco; guarda `editor.isDestroyed` (§88.8) |
| `activate`, `activateRow` | Torna linha clicável acessível (teclado) | — |

`DialogHost` (montado em `App`) renderiza a fila de diálogos (um por vez, FIFO), os toasts (um empilhamento só para o app todo; `ttl` padrão 5 s, erro 9 s, com `undo` 7 s) e o `CsatHost` (nota de satisfação de 1 clique, cartão no canto, nunca modal).

### Acessibilidade e mobile (resumo de PROJECT_CONTEXT §16, §72, §88.5 e `docs/RESPONSIVE_ARCHITECTURE.md`)
- **Breakpoints únicos:** `MOBILE_BP = 768` (`useIsMobile`, `App.jsx` L183/198) e `TABLET_BP = 1024` (`useIsCompact`, **definido em `src/screens/CompanyViews.jsx` L57**, não no `App.jsx`). Não crie outros.
- **Variante mobile = chave nova** `S.algoMobile` espalhada por último quando `isMobile`; nunca sobrescrever a chave desktop, nunca `@media` por cima de estilo inline. **Exceção documentada:** o `index.html` usa `@media` com `!important` para alvos de toque de 44 px (≤767 px em botões com `title` e em `[role=dialog]`; 768-1023 px ou `pointer: coarse` em botões/campos) e para fonte de 16 px em campos (evita zoom do iOS). CSS de módulo (`agenda.css`, `macro.css`) também usa `@media (max-width: 767px)`.
- **Controle denso no tablet:** a regra de tablet do `index.html` infla todo `button` para 44 px; controle de cartão/coluna (círculo de concluir, "+", "…") leva `className="pb-dense"` para manter o tamanho do desenho e ganhar área de toque por `::after` (PROJECT_CONTEXT §116v).
- Alvo de toque ≥ 44 px no celular: opt-in por contêiner com `className="t44"` (`TOUCH_CSS` em `App.jsx`) para listas densas.
- Todo botão desabilitado explica o motivo (`title`/`disabledReason`); todo botão só de ícone tem `aria-label` ou `title`.
- Foco visível: campos ganham halo amarelo (`input:focus-visible` no `index.html`); `Card`/`Chip` têm `outline` próprio.
- Modais com `role=dialog`, foco preso e devolvido ao fechar (`useDialog` em `src/lib/nav.js`).
- Arrastar no toque: Tabela e Gantt usam Pointer Events; quadro da empresa e CRM usam arrasto nativo HTML5 (não testados em toque; ver "Não verificado").

## Padrões obrigatórios
| Padrão | Regra | Onde conferir |
|---|---|---|
| Mutação | Nunca `setProjects`/`setPersonalBoard` direto para editar dado existente: `mutateProject` / `mutatePersonalBoard` | `App.jsx` L1553, L1680; `src/app/*.js` |
| Imutável | `updater` devolve **objeto novo** (spread); nunca altera o recebido | `mutateProject` compara por referência |
| Campo novo em JSON | Só front, com fallback (`campo || padrão`); registros antigos não têm o campo | PROJECT_CONTEXT §16 |
| Fonte única por dado derivado | Ex.: status do cartão deriva de `completed` | `cardStatusOf` (quadro pessoal) |
| Exclusão | Sempre exclusão lógica: `deleted/deletedAt/deletedBy`, filtro nas views, Lixeira e restaurar; arquivar = `archived/archivedAt` | `companyActivityActions.js` (`deleteActivity`/`restoreActivity`) |
| Log | Ação relevante vira linha em `project.log` / `card.history` / `board.log` | `logMsg` de `mutateProject` |
| Modal editável | Guarda de alterações não salvas: `useDirtyForm` (rascunho) **ou** `useAutosaveTimestamp` (autosave por campo) + `requestClose()` no X/overlay. Nunca um 3º padrão | Seção abaixo |
| Digitação | Campo de texto que grava no pai usa `useDebouncedField`; **dentro de `.map()` extraia a linha em componente próprio** | `AreaRow` (L382), `PhaseRow` (L407), `SubactivityRow` (`CompanyViews.jsx`) |
| Botão desabilitado | Prefira deixar clicável e mostrar o erro no handler (botão `disabled` por validação = "clique morto", §17) | `CreateCompanyModal` |
| Sem diálogo nativo | `askConfirm`/`askText`/`notify` | `scripts/ui-audit.py` |
| Datas | Dia de calendário no fuso local (`src/lib/dates.js`), nunca blocos de 24 h; `todayISOStr()` no clique | §75 |
| Módulo novo | Seção "Receitas" abaixo | PROJECT_CONTEXT §16.1 |
| Link público | Nunca reescrever `/quadro/`, `/reuniao/`, `/acompanhamento/`, `/a/` por efeito de URL | `initialPathDone` |
| Overlay global | Raiz React própria (`src/daily/useWelcomeSetup.jsx`), não um `return` extra no `AppScreens` | §16.1 |
| Sem abstração prematura | Repetir 3 linhas é melhor que um helper para um caso só | CLAUDE.md |

### Guarda de "alterações não salvas" (dois padrões)
- **Rascunho** (guarda tudo em `useState(form)` e só grava no botão): `const dirty = useDirtyForm(form)`. Compara `JSON.stringify` com o 1º render; liga `beforeunload` enquanto sujo. Usado em `CreateCompanyModal`, `NewUserModal`, `MyProfileModal`, `NewTicketModal` (XFlow) etc. O CRM tem o próprio `useDirty` em `src/crm/ui.jsx` (formulários `DealForm`, `CompanyForm`, `ContactForm`, `ActivityForm`).
- **Autosave por campo** (cada `onChange`/`onBlur` já grava): `const lastSavedAt = useAutosaveTimestamp(record)`; o que falta salvar são os "rascunhos menores" com submit próprio (comentário não enviado, checklist não adicionado); `hasDraft` = OR desses estados. Selo: `<RecordSaveStatus hasDraft lastSavedAt />`.
- Em ambos: overlay e X chamam `requestClose()` local, que fecha na hora ou abre `<ConfirmDiscardModal onSaveAndExit onDiscard onCancel saving />`. `onSaveAndExit` é opcional (omita se não há ação de salvar parcial válida).
- Ao fechar um modal autosave, chame `flushProjectSave(pid)` e aguarde antes de fechar.

### O bug do "texto some" (§45-§47, §60) em uma tela
1. **Sintoma:** digita 3-4 letras e o texto some.
2. **Causa A (§45):** cada tecla chamava `mutateProject`, o estado subia ao `AppScreens` e re-renderizava a árvore inteira; a tela atrasava. **Remédio:** `useDebouncedField` (campo local; só propaga 300 ms depois da última tecla; `flush()` no `onBlur` e antes de fechar).
3. **Causa B (§47):** `useDebouncedField` é hook; dentro de `.map()` viola as regras de hooks. **Remédio:** componente de linha (`AreaRow`, `PhaseRow`, `SubactivityRow`).
4. **Causa C (§60):** o poll de 6 s recarregava `projects` com uma foto velha do servidor durante a janela de debounce/voo. **Remédio:** `reloadProjects({background:true})` preserva projetos com `saveTimers`/`inFlightProjectSaves`.
5. **Como não reintroduzir:** não passe valor digitado direto para o pai a cada tecla; não crie novo recarregamento de projetos sem a trava.

## Mapa de telas × permissão
Quem decide o quê: o **front esconde** (cartão da tela inicial, item da barra, `canOpenMode` na URL); o **servidor é quem protege** (middleware ou checagem na rota). Perfis: `master`, `pricetax` (equipe), `cliente`; flags `companiesAccess`, `allCompaniesAccess`, `personalAccess`, `xflowRole`, `crmAccess` (calculadas em `server/auth.js`, `rowToUser`); Super Admin (`isSuperAdmin`) é um nível acima.

| Módulo (modo) | Quem vê no front (`src/lib/routes.js` `canOpenMode` e `App.jsx`) | Onde o servidor confere |
|---|---|---|
| Empresas (`company`) | `companiesAccess` | `canAccessProject` (`server/routes.js`): mesma org + `companiesAccess` + (`allCompaniesAccess` ou CNPJ em `allowedCnpjs`); criar/excluir empresa: `requireMasterOrPricetax` |
| Gestão de Atividades (`personal`) | `personalAccess` | Rotas `/api/personal-board*` exigem só `requireAuth` e usam `user_id` do token (cada pessoa só vê o próprio quadro); `personalAccess` é conferido só em `POST /api/personal-board/linked` |
| XFlow (`xflow`) | `xflowRole` preenchido | `requireXflowAccess` (`server/auth.js`) em `server/xflow.js` |
| Agenda (`agenda`) | Todo usuário logado | `requireAuth` (agenda é da própria pessoa) |
| Visão Geral (`macro`) | `companiesAccess` **e** `allCompaniesAccess` | `server/macro.js`: 403 "Sem acesso à Visão Geral de Empresas." |
| Conhecimento (`knowledge`) | `master` ou `pricetax` | `router.use(requireAuth, requireMasterOrPricetax)` em `server/knowledge.js` (e `knowledgeLibraryRoutes.js`) |
| Pareceres (`pareceres`) | `master` ou `pricetax` | Idem em `server/pareceres.js` |
| Modelos (`modelos`) | `master` ou `pricetax` | Idem em `server/documentTemplates.js` (`/api/templates`) |
| CRM (`crm`) | `crmAccess` (master/Super Admin sempre; demais só com `crm_role`; `cliente` nunca) | `crmCan(user, capacidade)` em `server/crm/permissions.js` e `need(...)` em `server/crm/routes.js` (403 "Você não tem permissão pra isso no CRM.") |
| Usuários (`users`) | `master` | `requireMaster` em `/api/users*` |
| Inteligência (`ops`) | `master` | `router.use(requireAuth, requireMaster)` em `server/opsIntel.js` |
| Organizações (Super Admin) | `isSuperAdmin` | `requireSuperAdmin` em `/api/organizations*` |
| Levantamento, Lacunas, Padrão de cronograma | Dentro da Visão Geral (equipe) | `requireMasterOrPricetax` em `server/inventory.js`, `gaps.js`, `standardPlanApi.js` |
| Links públicos (`/quadro`, `/reuniao`, `/acompanhamento`) | Qualquer pessoa com o link | Token na rota pública (`/api/public-board/:token`, `/api/public-meeting/:token`, `/api/public-company/:token`) |
| RENATA (botão da barra / Ctrl+K) | `RenataChat` (operacional) para quem não é `cliente`; `cliente` recebe `RenataHome` (RENATA geral) (`App.jsx` L1959-1975) | `server/renata/*` e `server/assistant*.js` (não verificado o guard exato de cada rota) |

Sobre o gate no front: `availableModes` (L~1790) só monta a lista; `users` e `ops` entram na barra só para `master`. **Os ramos `effectiveMode === 'knowledge' | 'pareceres' | 'modelos' | 'crm' | ...` desenham a tela sem conferir de novo `hasX`**: a conferência é (a) a lista de cartões e (b) `canOpenMode` na abertura por URL. O listener `popstate` aplica o `navTag` do histórico sem passar por `canOpenMode` (só entradas criadas pelo próprio app; baixo risco, e o servidor protege os dados).

## Como cada tela fala com a API
Tabela dos módulos principais (rotas conferidas por `grep` nos arquivos; lista completa e permissões em `docs/gerado/ROTAS.md`).

| Tela / componente | Rotas chamadas |
|---|---|
| `App.jsx` (casca) | `GET /api/auth/me`, `POST /api/auth/login`, `/auth/change-password-login`, `/auth/logout`; `GET /api/projects`, `/projects/versions` (poll), `/projects/:id/team-candidates`; `PATCH /api/projects/:id`; `GET/PATCH /api/personal-board`, `GET /personal-board/version`; `GET /api/notifications`; `POST /api/cnpj/lookup`; `GET /api/assistant/reindex-needed`, `POST /api/assistant/reindex`; `POST /api/activity/ping`, `/activity/usage`; `GET /api/standard-plan/template/instantiate-preview`; `GET /api/crm/companies/by-project/:id` |
| `src/app/*` (ações) | `/api/users*` (criar, editar, bloquear, renovar, resetar senha), `/api/organizations*`, `PATCH /api/projects/:id`, `/api/notifications/:id`, `/read-all`, `/mark-read-for-target`, `/api/task-links` e `/task-links/suggest`, `/api/standard-plan/template*` |
| `CompanyWorkspace` / `CompanyViews` | Quase tudo via ações do App (`PATCH /api/projects/:id`); extras: `/api/company-share/:id`, `/api/company-calendar/:id`, `/api/standard-plan/audit/:id` |
| `PersonalBoard` | `PATCH /api/personal-board` (via `onMutate`), `POST /api/personal-board/linked`, `/api/public-board/:token`, `/api/daily/preferences`, `/api/google/status` |
| `personal/*` | `/api/personal-extras` (GET/PUT), `/api/personal-board/stats`, `/stats/day`, `/api/agenda` |
| `meetings/*` | `/api/meeting-inbox` (+ `/:id/retry`, `/retry-failed`), `/api/assistant/dossier`, `/api/pareceres/advice`, `/api/public-meeting/:token`, `/api/assistant/reindex` |
| `xflow/XFlow.jsx` | `/api/xflow/tickets` (+ `/:id`, `/:id/view`, `/:id/events`, `?trash=1`), `/api/xflow/team`, `/api/xflow/affected-companies` |
| `agenda/*` | `GET /api/agenda?start=`, `POST /api/agenda/events`, `/api/agenda/events/:id` (convite), `/api/google/status` |
| `macro/*` | `GET /api/macro?range=`, `/api/inventory*` (área, responsável, qualidade, sugestões), `/api/gaps/*`, `/api/standard-plan/preview|apply|audit` |
| `knowledge/*` | `/api/knowledge/*` (overview, facts, entities, conflicts, metrics), `/api/knowledge-library*`, `/api/task-links/*` (pending, backfill, learning, eval, decide...) |
| `pareceres/*` | `/api/pareceres` (+ `/:id`, `/:id/comments`, `/study`), `GET /api/projects/lite` |
| `modelos/*` | `/api/templates` (+ `/:id`, `/:id/items`, `/:id/comments`) |
| `crm/*` | Tudo em `/api/crm/*` por `src/crm/crmApi.js` (objeto `crm`); download `GET /api/crm/deals/export.xlsx`; migração PipeRun `/api/crm/migration/piperun/*` |
| `assistant/*` | `POST /api/assistant/ask`, `/assistant/general/ask`, `GET /api/assistant/conversation`, `.../clear`, `/messages/:id/feedback|action`, `/api/pareceres/study` |
| `renata/RenataChat` | `POST /api/renata/chat`, `/api/renata/conversations/*`, `/decide`, `/api/renata/actions` (+ `/:id/undo`) |
| `opsintel/*` | `GET /api/ops-intel/overview|users/:id|map|alerts|experience|policy`, `/api/activity/policy` |
| `connect/*` | `/api/connect/tokens` (+ `/:id`), `/api/connect/actions` |
| `daily/*` | `/api/daily`, `/api/daily/preferences`, `/api/daily/onboarding-complete`, `/api/google/status` |
| `versions/*` | `/api/project-history/*` (listar, comparar, restaurar, recuperar empresa excluída) |
| `widget/*` | `/api/widget/token|views|status` |
| `lib/*` | `/api/notifications/preferences`, `/api/push/config|status|subscribe|unsubscribe|test`, `/api/experience/events|csat|csat/eligible`, `/api/client-error`, `/api/mentions/users` (em `ui/ComposeBox`) |

## Tipos de saída para o usuário (exportação e cópia)
| Saída | Como sai | Onde |
|---|---|---|
| **PDF do cronograma / reunião / dossiê** | `window.print()` com o relatório oculto na tela (`display:none`) que aparece só em `@media print`; tema escuro ou claro e orientação escolhidos em `PdfExportModal`; `document.title` vira o nome do arquivo; atributo `data-print-theme` no `<html>` | `exportPdf`/`exportMeetingPdf` em `App.jsx` (L2464, L2466); `src/pdf/PrintReport.jsx`, `pdfTheme.js`; reunião: `MeetingDetail.jsx`; preferências em `localStorage` (`ptx-pdf-prefs`) |
| **Excel da empresa** | Gerado **no navegador** com `xlsx` baixado sob demanda | `exportExcel` (`App.jsx` L2409) |
| **Excel do quadro pessoal / Atividades / Auditoria / conversa** | Idem, no navegador | `PersonalBoard.jsx`, `TodoBoard.jsx`, `StandardAudit.jsx`, `ChatExport.jsx` |
| **Excel dos negócios do CRM** | Gerado **no servidor** (`/api/crm/deals/export.xlsx`), baixado por `fetch` + Blob | `src/crm/DealsPage.jsx` (`exportDealsXlsx`) |
| **Copiar conversa da RENATA / link / script do widget** | `navigator.clipboard.writeText` + `notify` | `ChatExport.jsx` (lógica pura em `chatExport.js`), `DealDrawer.jsx`, `WidgetSection.jsx`, `PersonalBoard.jsx` |
| **Daily do quadro** | Filtro por prazo + Excel/PDF | `src/personal/dailyExport.js` (puro; `scripts/daily-export.test.mjs`) |
| **Dossiê do cliente** | Texto/HTML/impressão | `src/meetings/dossierExport.js`, `DossierPanel.jsx` |
| **Impressão da página pública** | Botão "Imprimir" (`window.print`) | `PublicCompanyScreen.jsx` |

## Bugs e armadilhas do front
| Sintoma | Causa | Corrigido em | Como NÃO reintroduzir |
|---|---|---|---|
| Texto digitado some | Render pesado por tecla; foto velha do poll; hook dentro de `.map()` | §45, §46, §47, §60 | `useDebouncedField`; componente por linha; trava de `reloadProjects` |
| Fechar modal editando não salvava | Debounce de 500 ms pendente | §43 | `flushProjectSave(pid)` antes de fechar |
| Tarefa/atividade some com duas abas do quadro | Gravação do quadro inteiro, última vence | §117 | `mergeable: true` + `mergeBoards`; nunca trocar o quadro às cegas ao receber do servidor |
| Edição desfeita quando o servidor reinicia | Falha transitória desfazia a edição | §118 | `isTransientSaveError` + retentativa |
| Arrastar negócio do CRM "não gravava" | Quadro só mudava depois do servidor; re-render por passo do arrasto | §119 | `moveDealInBoard` otimista (`src/crm/boardMove.js`); marcar arrasto por `classList`, não estado |
| Link público abria a tela inicial | Efeito de URL reescrevia `/quadro/…` para `/` para quem estava logado | §74 | Lista de exceções em `initialPathDone`; hooks rodam antes do `return` das públicas |
| Tela inteira em branco | Falha de render sem limite de erro | §88.3 | `guard`/`guardModal`/`guardedModal`; `resetKey` |
| App inteiro em branco ao abrir painel do quadro | `RichNote` chamava `getHTML()` em editor destruído | §88.8 | Guarda `editor.isDestroyed` |
| Aba antiga abre tela vazia depois do deploy | Chunk com hash apagado | §88.2 | `lazyRetry` (nunca recarrega sozinho); 404 real em `/assets/*` |
| Correção "não valeu" para quem não recarregou | Aba rodando JS antigo | §88.9 | Aviso de nova versão a cada 60 s; `notifiedSrc` |
| Botão do modal "morto" | `disabled` por validação | §17 | Validar no handler e mostrar erro |
| Botão de módulo visível sem acesso | Gate esquecido em um ponto | §17 | Use `canOpenMode` e as flags `hasX`; confira cartão, barra e menu "Mais" |
| `Cannot access 'x' before initialization` | Variável usada no corpo de `AppScreens` antes do `const` | §81 | `python3 scripts/scope-check.py` |
| Componente JSX sem import | `vite build` não pega | §81 | `scripts/scope-check.py` |
| Seletor de empresas não reflete a seleção criada | `useState(new Set(initialSelected))` lê só no mount | §17 | Auto-confirmar a seleção em vez de sincronizar a tela |
| Estado de outra organização vaza | Criar/clonar em outra base entrava no `projects` local | §17 | Só `setState` local quando `!crossOrg` |
| Zoom do iOS ao focar campo | Fonte < 16 px | §88.5 | Regra de 16 px no `index.html` |
| Cor neon ilegível no tema claro | Texto inline com cor fixa | §71-72 | Usar tokens `--ui-*` |

**Riscos que o código mostra hoje (não são bugs de tela, mas valem atenção):**
- **Projetos não têm controle de concorrência.** `PATCH /api/projects/:id` (`server/routes.js`) faz `UPDATE projects SET data=...` sem comparar versão. Duas pessoas editando a mesma empresa: o BIP só recarrega a cada 6 s, e a gravação do documento inteiro de quem salvou por último substitui a do outro. O histórico de versões do cronograma (§83) permite restaurar, mas não evita a perda silenciosa. O 409 com fusão existe **só** para o quadro pessoal.
- **A rota `PATCH /api/projects/:id` não separa por perfil.** Qualquer usuário com acesso à empresa (inclusive `cliente`) pode gravar o documento inteiro; restrições de edição por perfil (por exemplo `canEditExtras` em `CompanyViews.jsx`) existem no front (não verificado se há outra trava no servidor).
- **Comentários desatualizados no código:** `useDebouncedField` cita "~9000 linhas"; o comentário de `locationTag` diz "Não muda a URL"; `PROJECT_CONTEXT §9` também. Hoje `pushLocation` grava a URL do módulo (§74).

## Como testar
Não há test runner nem linter. Verificação = build limpo + scripts descartáveis + conferência no navegador.

| Comando | O que prova |
|---|---|
| `npm run build` | Compila (`vite build`) e move os sourcemaps para `.sourcemaps/` (`scripts/stash-sourcemaps.mjs`). Não pega componente sem import nem variável usada antes da declaração |
| `python3 scripts/scope-check.py` | JSX sem import e uso de variável no `AppScreens` antes do `const` (estado hoje: OK) |
| `python3 scripts/ui-audit.py [-v]` | 0 `confirm/alert/prompt` nativos, 0 botão sem nome acessível, 0 `disabled` sem `title` (estado hoje: 0/0/0) |
| `node scripts/board-merge.test.mjs` | Fusão de 3 vias do quadro pessoal |
| `node scripts/save-retry.test.mjs` | `isTransientSaveError` e `retryDelay` |
| `node scripts/chat-export.test.mjs`, `daily-export.test.mjs`, `crm-board-move.test.mjs`, `usage-metrics.test.mjs` | Funções puras de exportar conversa, daily, mover negócio no quadro, rastreador de uso |
| `node scripts/error-messages.test.mjs` | `friendlyMessage` e o tradutor de erros do servidor |
| `scripts/board-conflict-http.test.mjs`, `board-back-http.test.mjs`, `board-column-share-http.test.mjs` | Quadro pessoal contra servidor e Postgres **locais** (recusam banco não local) |
| `scripts/e2e/*.mjs` | Cenários no navegador (arrasto no CRM, voltar do quadro público). Exigem `playwright-core` instalado fora do projeto e um Chrome local |

Desenvolvimento local: `npm run dev` (Vite em `:5173` com proxy de `/api` e `/d/` para `:3001`). Se o Express e o Vite colidirem na porta, exporte `PORT=3001` antes (o `package.json` não fixa; ver memória "local dev PORT quirk"). **Não tem teste** automatizado para: `src/lib/routes.js`/`canOpenMode`, `App.jsx` (fluxo de sessão, poll BIP), `sw.js`, telas de empresa, Safari/Firefox/aparelho real.

## Receitas: "se o Rafael pedir X, faça Y"
| Pedido | Abra, nesta ordem | O que mudar | Conferir / atualizar |
|---|---|---|---|
| **Módulo novo de topo** (nova aba da barra) | 1. `src/lib/routes.js`; 2. `src/App.jsx` (`SHELL_MODES` L437, `hasX`/`availableModes` ~L1790, `locationTag` L696, `applyLocationTag` L769, `WorkspaceGateScreen` L3340 e as props `onPickX`, ramo `effectiveMode === 'x'` com `guard(...)`, `lazyRetry` no topo); 3. `src/renata/screenContext.js` (`MODULE_LABELS`); 4. `server/index.js` (router com o mesmo guard) | `MODE_PATHS` + `canOpenMode`; chave nova nos dois `if` de `locationTag`/`applyLocationTag`; cartão na tela inicial; fonte Inter na raiz | O servidor responde o `index.html` para qualquer caminho (`app.get('/{*splat}')`); `scope-check.py`; documentar em PROJECT_CONTEXT §0, §8.1 e `docs/PROJECT_MAP.md` |
| **Nova aba dentro da tela de empresa** | `COMPANY_VIEW_IDS`/`SINGLE_ONLY_VIEWS` (`App.jsx` L452-453); `src/screens/CompanyWorkspace.jsx` (tabs e `ctx`); nova vista em `src/screens/` com `lazyRetry` em `App.jsx` | Registrar id; se só faz sentido para uma empresa, incluir em `SINGLE_ONLY_VIEWS` | Última aba é restaurada por pessoa (`recents.js`); busca da aba (`screenSearch.js`) |
| **Nova tela no Meu perfil** | `src/screens/AdminScreens.jsx` (`MyProfileModal`, abas por `profileTab`; `openProfile('aba')` em `App.jsx`) | Nova aba e seção; salvar com `useAutosave` | `profileTab` aceita o id novo; rota do servidor em `routes.js` |
| **Botão com confirmação** | `src/ui/dialogs.jsx` (uso no cabeçalho do arquivo) | `if (!(await askConfirm({ title, message, confirmLabel, danger: true }))) return;` | Nunca `window.confirm` (`ui-audit.py`). Exclusão de item: exclusão lógica + Lixeira + `notify(..., { undo })` |
| **Novo modal editável** | Copie o padrão de `CreateCompanyModal` (rascunho) ou `ActivityDetailModal` (autosave) | `useDirtyForm` ou `useAutosaveTimestamp` + `requestClose` + `ConfirmDiscardModal`; use `Modal`/`DialogOverlay` | Esc e Voltar fecham; foco volta ao fechar; em módulo novo, envolva com `guardedModal` |
| **Novo campo no cartão do quadro pessoal** | `src/screens/PersonalBoard.jsx` (`PersonalCardDetailModal` L707, `onUpdate`); `src/personal/boardMerge.js` | Escrever o campo via `onUpdate` → `mutatePersonalBoard`; ler com fallback (`card.x \|\| padrão`); lista nova de itens precisa de `id` para a fusão funcionar | Se for HTML, o servidor higieniza (`sanitizeBoardNotes`); `board-merge.test.mjs`; widget/RENATA só se o campo deve aparecer lá (`server/widgetSummary.js`, `server/renata/tools/board.js`) |
| **Novo campo na atividade/subatividade da empresa** | `src/screens/CompanyViews.jsx` (`ActivityDetailModal`, `SubactivityRow`); `src/app/companyActivityActions.js` (`updateActivity`/`updateSub`) | Campo de texto: `useDebouncedField`; chamar `updateActivity(pid, id, {campo}, logMsg)`; fallback para registros antigos | Sem mudança de banco (JSONB `projects.data`); se afeta datas, ver `shared/period.js`; se afeta status, `shared/linkSync.js` |
| **Mudar cor/tema** | `index.html` (`:root` e `html[data-theme="light"]`), `src/ui/ui.css` (tokens `--ui-*`) | Mudar o token, não a cor em cada tela; se for cor de texto de status, atualizar a regra de contraste do tema claro no `index.html` | Conferir nos dois temas; contraste mínimo 4,5:1 |
| **Novo botão/peça padrão** | `src/ui/index.jsx` + `ui.css` | Estender `Button`/`Chip`/`Card` com `variant`; classe com prefixo `ui-` | Botão `disabled` exige `disabledReason`; só ícone exige `label` |
| **Ajuste para celular** | `S.js` (chave nova `xMobile`), componente com `useIsMobile()`/`useIsCompact()`, ou CSS do módulo (`agenda.css`, `macro.css`) | Variante nova espalhada por último; alvo de toque ≥ 44 px | `docs/RESPONSIVE_ARCHITECTURE.md`; testar a 360/375/390/820 px; Tabela e Gantt arrastam por Pointer Events |
| **Mudar texto de erro** | `src/lib/api.js` (`FALLBACK`) e `server/errorHandler.js` | Mensagem diz o que houve **e** o que fazer | `scripts/error-messages.test.mjs` |
| **Nova chamada de API / gravação automática** | `src/lib/api.js`; modelo de uso em `src/crm/crmApi.js` | `PATCH`/`PUT` já entram no selo global; valor isolado: `useAutosave`; dado de projeto: `mutateProject` | A rota no servidor confere permissão (nunca só o front) e filtra por `org_id` |
| **Aviso/toast com Desfazer** | `src/ui/dialogs.jsx` | `notify('Texto.', { tone, undo: () => ... })` | O desfazer reaplica pelo mesmo caminho de gravação |
| **Item novo na busca Ctrl+K** | `buildSearchItems` (`App.jsx` L1808), `src/shell/CommandPalette.jsx` | Novo objeto `{id, kind, rid, group, label, hint, icon, run}`; `kind`+`rid` entram em recentes/favoritos | Busca remota (CRM) é `buildRemoteSearchItems` |
| **Mudar a barra do topo** | `src/shell/ModuleShell.jsx` (CSS `shell-*` no próprio arquivo), `shellRef.current` em `App.jsx` | Se precisar de dado novo, inclua-o em `shellRef.current` **e** em `sig` | A barra só re-renderiza quando `sig` muda |
| **Nova categoria de notificação** | `src/lib/notifPrefs.js`, `src/shell/NotificationPrefs.jsx`, `server/notificationPrefs.js` | Acrescentar nos dois lados | Mudar só o front esconde, mas o servidor continua enviando push |
| **Novo botão de exportar** | Excel local: `loadXlsx()`; PDF: `PdfExportModal` + `pdfTheme.js` + `PrintReport.jsx`; Excel grande: rota no servidor + `fetch` Blob (modelo: `exportDealsXlsx`) | Registrar `trackAction('export_...')` | Estado de carregando no botão; erro com `notify(..., {tone:'error'})` |
| **Mudar o endereço de um módulo** | `MODE_PATHS` e `ALIASES` em `src/lib/routes.js`; atalhos do manifesto em `vite.config.js` | Manter o endereço antigo em `ALIASES` | Favoritos antigos continuam abrindo |

## Não verificado / dúvidas
- Não rodei o app nem o navegador: tudo acima vem de leitura de código. As linhas de `App.jsx` foram conferidas por `grep -n`/`sed` em 2026-10-29.
- Não li `src/xflow/XFlow.jsx`, `src/crm/*` (além de `crmApi.js`) nem `src/screens/*` por dentro; a tabela de rotas por tela vem de `grep` de chamadas `apiGet/apiPost/...` e `fetch`, e pode omitir chamadas montadas em variáveis (por exemplo, `src/versions/VersionHistory.jsx` usa `baseUrl(projectId)`).
- Não verifiquei se o servidor trava edição por perfil `cliente` em `PATCH /api/projects/:id`, nem quais telas de empresa o front libera ao `cliente` (só vi `canEditExtras` e `staff` em `CompanyViews.jsx`).
- `src/lib/nav.js` (camadas de histórico) foi lido só no cabeçalho e nas primeiras funções.
- Não testado em aparelho: PWA instalado, push, arrasto HTML5 em toque (quadro da empresa e CRM), Safari/Firefox (PROJECT_CONTEXT §88, §15).
- `docs/PROJECT_MAP.md` e `PROJECT_CONTEXT §9/§16` ainda citam `savedStatusLabel` e dizem que `useIsCompact` é exportado do `App.jsx`: no código, o selo é `RecordSaveStatus` (`src/ui/index.jsx`) e `useIsCompact` está em `src/screens/CompanyViews.jsx`.
