# RESPONSIVE_ARCHITECTURE.md — Estratégia mobile (2026-08)

Curto e objetivo — ver `docs/PROJECT_MAP.md` para o mapa geral do app.

## Breakpoints (únicos, não crie outros)

```js
const MOBILE_BP = 768;   // celular — layout empilhado/cards
const TABLET_BP = 1024;  // ponto em que sidebars fixas deixam de caber ao lado do conteúdo
```
Hooks em `src/App.jsx` (perto de `todayISOStr`): `useIsMobile()` (<768px) e
`useIsCompact()` (<1024px), via `window.matchMedia` + listener de `change`.
Chame o hook dentro do componente que precisa da variante mobile e espalhe o
estilo condicionalmente: `{ ...S.algo, ...(isMobile ? S.algoMobile : null) }`.
**Nunca** use CSS `@media` para sobrescrever um `style` inline — inline sempre
vence a stylesheet, então a app usa esse padrão JS em vez de `!important`.

## Regra de ouro seguida em toda a implementação

Nenhuma chave de `S` (o objeto de estilos) foi alterada por cima da versão
desktop. Toda variante mobile é uma chave nova (`xMobile`) espalhada por
último quando `isMobile`/`isCompact` é `true` — com o hook retornando `false`
(desktop), o resultado é idêntico ao que já existia.

## Componentes globais tocados (afetam várias telas de uma vez)

- **`S.detailBox` / `S.detailOverlay` / `S.panel`** (App.jsx, ~L5390) — usados
  por ~9 modais (NewUserModal, EditUserModal, MyProfileModal,
  CreateCompanyModal, EditCompanyModal, PersonalCardDetailModal,
  ReassignCardsModal, ActivityDetailModal, SidePanel/Log/Lixeira/Menções).
  Cada um ganhou `const isMobile = useIsMobile()` + spread de
  `S.detailBoxMobile`/`S.detailOverlayMobile`/`S.panelMobile` — no mobile o
  modal vira fullscreen (`100dvh`, sem `border-radius`, padding com
  `env(safe-area-inset-*)`); no desktop nada mudou.
- **Topbar principal** (dentro de `App()`, ~L1241) — os botões secundários
  (Empresa, Trocar empresas, Gestão de Atividades, Cadastrar empresa,
  Usuários, Fases, Log, Lixeira, Excel, PDF) somem no mobile e viram um único
  botão **"Mais"** com dropdown (`moreMenuItems`, array declarativo definido
  antes do `return`, reaproveitando os mesmos `onClick`). Ficam sempre
  visíveis: nome da empresa, "+ Nova atividade", sino de menções, tema,
  avatar/sair.
- **`S.tabs`** (Gantt/Tabela/Fases/Quadro) — ganhou `overflowX:'auto'`
  incondicional (não quebra desktop, só ativa se não couber).

## Tabelas

- **`TableView`** (Empresas → Tabela) — a linha de ~10 colunas vira um card
  empilhado no mobile (`S.mobileActCard`): título/descrição no topo, depois
  Fase/Responsável/Status/Início/Fim/Prazo em campos de largura total, ações
  (abrir/excluir) numa barra inferior com alvos de toque de 38px. O filtro
  lateral (`S.filterSidebar`, 200px fixo) vira um botão **"Filtros ▼"** que
  esconde/mostra o painel — usa o mesmo padrão já validado na Gestão de
  Atividades (toggle de filtros). Drag-and-drop de reordenar (mouse-only,
  `onMouseDown`/`mousemove`) já não dependia de touch antes desta mudança;
  no mobile a alternativa é editar a data diretamente (mesmo efeito).
- **`UsersManagementScreen`** — mesmo padrão, card mais simples (nome+avatar,
  badges de perfil/status/licença, ações numa linha).
- **`KanbanView`** (Empresas → Quadro) — grid CSS de 4 colunas fixas vira
  `flex` com `overflowX:'auto'` e cada coluna com `min-width:82vw` (uma
  coluna por vez, como Trello mobile). Drag nativo HTML5
  (`draggable`/`onDragStart`) não suporta touch — alternativa: abrir o card
  (clique/toque) → mudar o campo Status no modal.

## Navegação / menu

Não existe sidebar lateral fixa neste app (a navegação é um topbar +
abas horizontais) — por isso não há "drawer" a construir; a solução foi
condensar o próprio topbar (ver acima).

## Quadro pessoal (dnd-kit)

- `PointerSensor` (já usado) suporta touch nativamente, mas precisa de
  `touchAction:'none'` no elemento arrastável para não brigar com o scroll do
  navegador — adicionado em `PersonalCard` e no cabeçalho de `PersonalColumn`.
  Efeito colateral aceito: no mobile, arrastar começa em qualquer ponto do
  card, então rolar a coluna precisa ser feito pelos espaços entre cards (o
  padrão comum de qualquer kanban touch — Trello mobile se comporta igual).
- Coluna (`S.personalCol`, 300px fixo) vira `86vw` no mobile
  (`S.personalColMobile`) — uma coluna por vez, rolagem horizontal.
- Toolbar (busca/filtros/ordenar) e as abas de página já tinham
  `flexWrap:'wrap'` — não precisou de mudança.

## Gantt / Timeline

Já tinha `overflowX:'auto'` num container próprio (`S.ganttScroll`) — mantido
como scroll horizontal intencional (é um gráfico, não uma lista). Drag de
barra também é mouse-only; alternativa: abrir a atividade e editar a data.
**Não redesenhado para mobile nesta rodada** — funciona (não quebra layout),
mas ler uma barra fina em `granularidade=dia` numa tela de 375px é apertado.
Candidato a segunda rodada (ver abaixo).

## Infra global (`index.html`)

- `viewport-fit=cover` + `env(safe-area-inset-*)` como custom properties
  (`--safe-top/bottom/left/right`) — usadas no padding do modal fullscreen.
- `html, body { overflow-x: hidden }` — rede de segurança contra qualquer
  componente que vaze largura (nenhum foi encontrado nesta auditoria, mas
  evita regressão futura).
- `input,select,textarea { font-size: 16px !important }` só abaixo de 768px —
  evita o auto-zoom do Safari iOS ao focar um campo (único `!important` do
  projeto, e só porque aqui o alvo é uma tag genérica, não uma chave de `S`).
- `100vh` → `100dvh` em `S.page`, `S.loginWrap`, `S.companySelectorWrap` —
  corrige a barra de endereço do Safari cobrindo o rodapé da página.
- Meta tags de PWA (`apple-mobile-web-app-capable`, `theme-color`) adicionadas
  para deixar o caminho aberto — **sem manifest.json nem service worker**
  (não pedido, e não há ícones dedicados ainda; ver "Próxima rodada").

## O que NÃO foi mexido (já estava bem)

`LoginGate`, `WorkspaceGateScreen`, `PersonalListView` (tabela mais simples,
poucas colunas) — já eram fluidos o bastante (`min(Npx,100%)`,
`flexWrap:'wrap'`) e passaram no teste visual em 390×844 sem alteração.

## Segunda rodada (não crítico, documentado por transparência)

1. **Gantt/Timeline**: um modo mobile dedicado (ex.: lista de barras em vez
   de grade de dias) melhoraria a granularidade "dia"/"semana" em telas
   pequenas.
2. **KanbanView (empresa)**: adicionar um seletor de status rápido no próprio
   card, para não depender de abrir o modal a cada mudança de coluna.
3. **Quadro pessoal**: um "grip" dedicado e pequeno no card (em vez do card
   inteiro) devolveria a rolagem por toque direto no card, ao custo de uma
   pequena mudança visual.
4. **Manifest.json + ícones**: para instalação real como PWA (app icon,
   `display:standalone`) — infraestrutura de meta tags já está pronta.
