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
