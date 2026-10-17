# Auditoria mobile — Fase 0 (2026-10-17)

Medição, sem alterar o app. Objetivo: trocar palpite por evidência antes de planejar o trabalho de celular.

## Como foi medido (e o que NÃO dá para concluir)

- Navegador embutido do Claude em modo celular (motor Chrome) nas larguras **360, 375, 390 e 820 px**, com o build de produção local (`dist/`) e usuário de teste `master` (removido depois). Dados: banco de desenvolvimento (poucos projetos; CRM sem negócios; quadro pessoal semeado com 6 cartões).
- Um script mede, por tela (ou só pelo modal aberto): elementos que estouram a largura, alvos de toque < 44 px, campos com fonte < 16 px, texto < 11 px. Mais capturas de tela dos casos suspeitos.
- **Não medido**: Safari/iPhone de verdade (este Mac não tem o Xcode completo, então não há simulador), Android real, teclado na tela, `safe-area`/barra do navegador, rede lenta, toque real (arrastar), PWA. Tudo que depende disso está marcado "não confirmado".
- As telas foram medidas **no topo da página**; estados internos (arrastar, formulários longos de CRM/XFlow/Agenda) ficaram de fora.

## Achados (por prioridade)

| # | Gravidade | Achado | Evidência | Causa provável |
|---|---|---|---|---|
| A | Alta | **Aba Tabela da empresa fica cortada à direita em 360 e 375 px** (Android comum e iPhone SE/mini): título, "Status" e "Fim" saem da tela. Em 390 px cabe por pouco | 360 px: 338 elementos fora da tela; 375 px: 34; captura de tela confirma | O cartão da linha tem ~24 px de deslocamento à esquerda e um filho com largura ≈ 100% → estoura ~21 px (a confirmar no código na Fase 1) |
| B | Alta | **Aba Fases fica cortada em todos os celulares** (cards de 2 colunas saem da tela). Também a 820 px | 390 px: 134 elementos; 375: 144; 360: 146; 820: 40 | Grade de cards sem coluna única no celular |
| C | Alta (não confirmada em aparelho) | **Campos que escapam da regra "16 px" do iOS** (12–13,3 px): busca da Gestão, tags, itens de checklist, nomes de fase, 1 campo do detalhe/nova atividade. O Safari do iPhone dá zoom ao focar campo < 16 px | Gestão: 5 campos; modal do cartão: 2; modal Fases: 3; detalhe/nova atividade: 1 cada | `index.html` usa `input[type=text], …` e **`<input>` sem atributo `type` não casa** com o seletor. Correção de uma linha: incluir `input:not([type])` |
| D | Média | **Alvos de toque < 44 px**: detalhe da reunião (botão Fechar 28×28; ~9 botões de participantes com 23 px de altura); detalhe da atividade (42 de 56 alvos: campos 29 px, selects 36 px, chips 23 px, link de anexo 15 px); Resumo (filtros 36 px, caixa de seleção 15 px); modal Fases (31–34 px); botão Fechar do Compartilhar 26 px; seleção de empresas (caixa 18 px) | medição por tela/modal | Regra global de 44 px só cobre `button[title]`/`a[title]` |
| E | Média | **Gestão de Atividades: o 1º cartão só aparece a ~499 px de 844** (59% da tela é cabeçalho, painéis e filtros). Na Lista, igual | y do 1º cartão com o quadro semeado | Muita "casca" empilhada antes do conteúdo |
| F | Média | **Tablet vertical (iPad, 820 px) usa o layout de desktop** com botões de 32 px, e Tabela (294 elementos) e Fases (40) cortadas | medição a 820 px | O ponto de corte do mobile é 768 px; faixa 768–1023 sem tratamento de toque |
| G | Baixa | **Texto < 11 px** em muitas telas: Tabela 98 elementos, Resumo 64, Log 91, Gantt 36, Quadro 35, Conhecimento 16 | contagem | Fontes de 9,5–10,5 px em chips e metadados |
| H | Observação | `/api/projects` é baixado **2×** na abertura (61 KB cada com os dados de teste; em produção depende dos anexos em base64, **não medido**). O polling é leve (verificação de 0,3 KB a cada ~6 s) e **já pausa com a aba escondida** | rede + código (`document.hidden`) | — |
| I | Observação | Sem rolagem lateral nem alvo pequeno **no topo** de: Início, Agenda, XFlow, Visão Geral, CRM, Conhecimento, Pareceres, Modelos, Usuários (390 px) | medição | — |
| J | Incerto | **Arrastar no toque**: Tabela (reordenar) e Gantt (mover barra) usam só eventos de mouse (`onMouseDown`/`mousemove`) → não arrastam no toque (certo pelo código). Quadro da empresa e CRM usam HTML5 drag: **não sei** se funciona no iOS/Android (precisa de aparelho). Quadro pessoal usa dnd-kit com toque (atraso de 250 ms): correto no código, sem teste de toque | leitura do código | — |

## Correções ao plano anterior

- "Pausar a consulta quando a aba some": **já existe**. Retirado do plano.
- "Arrastar não funciona no toque em 4 lugares": são **2 certos e 2 incertos**.
- A regra de 44 px dos modais existe; o problema é cobertura (campos, chips, selects), não ausência.

## Ordem sugerida (por evidência × custo)

1. **A + B** (Tabela e Fases cortadas): alto impacto, correção localizada.
2. **C** (seletor dos campos): uma linha, evita zoom do iOS.
3. **D** (alvos < 44 px): regra global para campos/selects/chips + Fechar dos modais.
4. **E** (Gestão compacta no celular): recolher cabeçalho/painéis.
5. **F** (tablet 768–1023): alvos de toque e Tabela/Fases.
6. **J** (arrastar no toque na Tabela/Gantt) e teste em aparelho do HTML5 drag.
7. Depois: PWA instalável (vite-plugin-pwa), bottom sheet (Base UI) se ainda fizer falta, G (fontes mínimas).

## Para fechar as lacunas

- Instalar o Xcode completo (simulador/Safari) **ou** testar no iPhone real de quem usa; e um Android real.
- Medir `/api/projects` em produção (peso real com anexos) — hoje só há o dado do banco de teste.

## Status das correções

**2026-10-17 — itens A, B e C corrigidos** (um deploy; só celular, o desktop não mudou):

- **A (Tabela cortada)**: a causa real não era largura de campo. O contêiner da tabela é uma **coluna flex com `align-items: flex-start`**, então o bloco tomava a largura mínima do conteúdo (365 px) em vez da disponível (320 px em 360 px de tela). Correção: `alignSelf: 'stretch'` no contêiner da Tabela quando `isMobile`; as duas colunas de data (Início/Fim) também ganharam `minWidth: 0`. (O diagnóstico anterior — "filho com ~100% de largura" — estava errado; foi corrigido com medição.)
- **B (Fases cortada)**: grade de cards passa a `repeat(2, minmax(0, 1fr))` (antes `1fr 1fr`, que não deixa o card encolher) e **uma coluna** no celular (`S.phaseCardGridMobile`). Também resolveu 820 px.
- **C (zoom do iOS)**: o seletor de `index.html` agora inclui `input:not([type])`, `url`, `time`, `datetime-local`, `month` e **`[contenteditable="true"]`** (o editor Tiptap do cartão tinha 13,5 px). Falsos positivos descartados: `input[type=color]` não abre teclado.

**Verificação** (navegador embutido em modo celular, build de produção local, usuário de teste): rolagem lateral e estouro de largura = **0** em Gestão, cartão, Resumo, Tabela, Fases, Quadro e Gantt nas larguras **360, 375, 390 e 430**; campos < 16 px = 0 (exceto `type=color`); Fases também zerou a **820 px**; capturas de tela da Tabela (360 px) e das Fases conferidas; desktop (1400 px) conferido: Fases em duas colunas de 661 px, Tabela inalterada.

**Não corrigido / não testado**: Tabela a 820 px (tablet vertical) continua sendo item F; zoom do iOS em si **não** foi testado em aparelho (a correção segue a regra conhecida do Safari de 16 px); Safari/Android reais; o cabeçalho de fase em coluna única fica estreito (título quebra em várias linhas) — ajuste visual possível depois.

**2026-10-17 — itens D e E corrigidos** (só celular; o desktop não mudou):

- **Correção de medição (E)**: o "1º cartão a ~499 px" do relatório original foi medido com preferências antigas guardadas no navegador de teste (painéis abertos/fechados). Com o padrão real de quem entra pela primeira vez (Resumo do dia e Calendário recolhidos) o 1º cartão ficava a **732 px de 844 (87% da tela)**, ou seja, praticamente fora da primeira tela.
- **D (alvos de toque)**: regra no `index.html` (`max-width: 767px`): dentro de `[role=dialog]`, `button`/`select`/`input` (exceto caixa de seleção, cor, arquivo, intervalo) ganham `min-height: 44px`, botões `min-width: 44px`, link de anexo (`.cmp-file-name`) vira alvo de 44 px e caixas de seleção/radio passam a **24 px** (não 44). Fora de modal: filtros do Resumo e "Agrupar por mês" (`RESUMO_CSS`) e os botões Dia/Semana/Mês/Ano do Gantt. Resultado a 390 e 360 px: **0 alvos < 44 px** nos modais e telas medidos, **exceto** as caixas de seleção (24 px, 6 no detalhe da atividade) e os seletores de cor (34 px, abrem o seletor do sistema).
- **E (Gestão compacta)**: no celular, **Lixeira, Concluídas, Indicadores, Compartilhar/"Público por link" e Histórico** vão para um menu **"Mais ações"** (`PbMoreMenu`, itens de 44 px) no cabeçalho; a ordenação foi para dentro do painel **Filtros**; o painel de filtros abre numa linha própria (a busca não encolhe); espaçamentos laterais caem de 24 para 12 px (cabeçalho, abas, barra de ferramentas, quadro). 1º cartão: **732 → 582 px a 390 px** (−150 px, −20%); a 360 px fica em ~628 px (a barra de ferramentas quebra em 3 linhas). No desktop os botões e a ordenação continuam onde estavam.
- **Um erro meu pego no teste e corrigido**: a 1ª versão da busca (`flex: 1; minWidth: 0`) fazia o campo encolher para 32 px com os filtros abertos; agora `flex: 1 1 150px`.
- **Não corrigido / não testado**: o 1º cartão ainda não aparece "folgado" numa tela de iPhone com a barra do Safari (~660 px úteis); novas reduções possíveis (juntar Resumo do dia e Calendário numa linha, abas mais baixas) ficaram de fora; caixas de seleção de 24 px não chegam a 44; nada testado em Safari/Android reais; durante a medição o navegador de teste voltou algumas vezes a uma página antiga do histórico ao fechar modais — atribuí ao meu script (cliques repetidos em "Fechar" disparam `history.back`), mas **não investiguei** se há caso real de "Voltar" saindo do app.

**2026-10-17 — item F (tablet) corrigido**:

- **Achado confirmado e explicado**: a Tabela da empresa entre 768 e ~1250 px não só era "cortada": como o contêiner era uma coluna flex com `align-items: flex-start` (mesma causa do achado A) e o `body` tem `overflow-x: hidden`, as colunas da direita (datas, status, ações) ficavam **inalcançáveis** — nem rolagem havia. Vale também para janelas de desktop estreitas.
- **Correção da Tabela** (`CompanyViews.jsx`): `alignSelf: stretch` em todo o layout compacto (< 1024 px) para o contêiner ter a largura disponível e **rolar na horizontal**, e `TABLE_MIN_W = 1060` no cabeçalho e nas linhas do layout de desktop para as colunas não serem espremidas (sem isso os selects ficavam com 18–22 px). A 1180 px (iPad na horizontal, com o filtro lateral) o contêiner tem 890 px e rola até 1060 px; no desktop largo nada muda (a tabela já tinha ~1134 px).
- **Alvos de toque no tablet** (`index.html`): entre 768 e 1023 px **ou** em tela de toque (`pointer: coarse`, a partir de 768 px), `button`/`select`/`[role=button|tab|menuitem]`/campos de texto ganham `min-height: 44px !important` e botões `min-width: 44px !important` (`!important` porque `.ui-btn` e estilos inline definem alturas menores); `.rs-group-toggle` do Resumo também.
- **Verificação** (navegador embutido, build de produção local): a **768 px** e **820 px**, **0 alvos < 44 px e 0 estouros** em Início, Gestão, Agenda, XFlow, Visão Geral, CRM, Seleção de empresas e nas 7 abas da empresa (a 768 também Conhecimento, Pareceres, Modelos e Usuários); Tabela a 768 px: contêiner de 696 px, conteúdo de 1060 px, selects de 145/139 px; a 1180 px selects de 145/139 px; celular (390 px) e desktop sem regressão medida.
- **Não testado**: o ramo `pointer: coarse` (o navegador de teste não emula toque em telas ≥ 768 px — só vale em iPad/Android reais); iPad/Safari reais; **não há indicador visual** de que a Tabela rola na horizontal; Conhecimento, Pareceres, Modelos e Usuários a 820 px; telas internas (modais, XFlow/CRM por dentro) a 768–1023 px.

**2026-10-17 — item J (arrastar no toque, Tabela e Gantt) feito**:

- **Como**: os arrastos da Tabela (reordenar linhas) e do Gantt (mover barra) usavam só `mousedown`/`mousemove`/`mouseup` e não funcionam no toque. Passaram para **Pointer Events** (`pointerdown` no alvo; `pointermove`/`pointerup`/`pointercancel` na janela), que cobrem mouse, toque e caneta com o mesmo código. Para o navegador não rolar a página durante o arrasto, o **alça da Tabela** e a **barra do Gantt** têm `touch-action: none`. `pointercancel` agora **desfaz** o arrasto sem gravar (antes nem existia). Gantt: toque exige 8 px de movimento para virar arrasto (mouse, 4 px) e botão direito do mouse não inicia mais arrasto.
- **Alça da Tabela**: no tablet/toque (mesma camada de 768–1023 px / `pointer: coarse`) a alça passa a **44×44 px** (antes 20×14); o cabeçalho acompanha a largura (44 px) para as colunas não desalinharem.
- **Verificado** (build local, usuário de teste, projeto restaurado depois): (a) **mouse real** a 1400 px — arrastar barra do Gantt (18/09 → 05/10, `PATCH`), clicar abre o detalhe, reordenar linha da Tabela (`PATCH`, sem texto selecionado); (b) **toque simulado** (`PointerEvent` com `pointerType: touch`) a 820 px — reordenar linha da Tabela pela alça; a 390 px — toque rápido na barra abre o detalhe, arrastar 60 px move a data (05/10 → 25/10, gravada no banco) e `pointercancel` não grava e devolve a barra; `touch-action: none` conferido no estilo computado.
- **Não testado**: **toque real** (os eventos foram sintéticos; o comportamento do navegador com `touch-action` e rolagem só se confirma num iPhone/iPad/Android reais); rolagem da página começando **em cima de uma barra** do Gantt fica bloqueada de propósito (rola-se pela coluna de nomes ou pelo espaço vazio) — não medi quanto isso atrapalha; **o celular continua sem reordenar linhas da Tabela** (lá a Tabela é uma lista de cartões altos, sem alça, e o arrasto não tem rolagem automática; alternativa possível: botões subir/descer); Quadro da empresa (HTML5 drag) e CRM (HTML5 drag) **não foram mexidos** — continuam sem verificação em toque.

**2026-10-17 — PWA (app instalável) feito**: ver `PROJECT_CONTEXT.md` §65 ("PWA — app instalável"). Resumo: `vite-plugin-pwa` + `src/sw.js` próprio (sem precache; nunca cacheia `/api`; navegação rede-primeiro; assets cache-primeiro), manifesto e ícones (inclui maskable), status bar do iOS `black`, e tela **"Sem conexão"** no boot sem rede (antes caía no login). Testado: manifesto/ícones/SW/caches, boot offline com o servidor parado e recuperação por "Tentar de novo" e pelo evento `online`. **Não testado**: instalação real em aparelho, tela cheia/`safe-area` no app instalado, deploy novo com SW já instalado, push.

**2026-10-17 — roteiro de teste em aparelho real criado**: `docs/ROTEIRO_TESTE_MOBILE.md` (36 testes, 23 prioritários P1, ~25 min por aparelho) cobre o que o navegador do computador não prova: instalar (Android/iPhone), tela cheia e barra de status, sem conexão, zoom do iPhone, telas cortadas, alvos de toque, arrastar com o dedo (inclui Quadro da empresa e CRM, nunca testados no toque), teclado, iPad e atualização depois de um deploy. Há também uma versão para marcar no próprio celular (página publicada, privada; resultado copiável para enviar ao Rafael).

**2026-10-17 — notificações push feitas (dormentes até configurar as chaves em produção)**: ver `PROJECT_CONTEXT.md` §65 ("Notificações push"). Testado com serviço de push falso e interface com permissão simulada; **não** testado: entrega real, iPhone, Android, eventos do service worker em aparelho. Roteiro: grupo N1–N6 em `docs/ROTEIRO_TESTE_MOBILE.md`.

**2026-10-17 — chaves de push configuradas em produção** (Railway, `VAPID_*`; log de boot: "notificações push: ATIVADAS"). Falta rodar N1–N3 do roteiro num aparelho real.
