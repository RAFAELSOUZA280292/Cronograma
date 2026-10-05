# Auditoria visual medida (2026-10-04)

Medida no browser, tela por tela, com script (não de olho). Tema claro e escuro, desktop 1500 px e celular 375 px.
Método e correções: `PROJECT_CONTEXT.md` §72. Tolerância de referência: WCAG 2.x AA (contraste 4,5:1 texto normal /
3:1 texto grande; alvo de toque mínimo 24 px; foco visível).

## Resultado

| Critério | Antes | Depois |
|---|---|---|
| Contraste, tema claro (21 telas) | 249 de 441 textos reprovavam (56%) | 1 de 465 |
| Contraste, tema escuro (10 telas) | 73 de 273 (27%) | 1 de 294 |
| Contraste, 10 telas de empresa/RENATA/notificações | (não medido antes) | 5 de 711 |
| Elementos clicáveis sem teclado (telas de empresa) | 25 | 0 |
| Alvos de toque < 24 px no celular | 3 a 12 por tela (barra superior em TODAS) | 0 (exceto Atividades: 9) |
| Rolagem lateral nova | — | nenhuma |

## O que ainda reprova (e por quê)

- **Contraste (6 casos)**: texto esmaecido de propósito por `opacity` — card de empresa pausada no seletor (5) e a
  legenda "Recusado" da Agenda (1). É a semântica visual de "inativo"; não mexi.
- **Teclado (2)**: cartões de organização do Super Admin (`div` clicável); o botão "Entrar" do mesmo cartão
  alcança a mesma ação pelo teclado.
- **Toque**: no celular os botões de ícone ficaram com 36–40 px (WCAG AA pede 24; Apple/Google recomendam 44).
  Em Atividades restam 9 alvos < 24 px: campos "Nova atividade" de coluna (15 px de altura, o toque real cai no
  contêiner) e botões "…" de coluna sem `title` (a regra de celular só pega `button[title]`).
- **Foco**: botões/links usam o anel padrão do navegador (visível nos dois temas). Campos de texto trocavam só a
  cor da borda (amarelo sobre branco = 1,6:1) em 18 regras com `outline:none`; ganharam um halo global
  (`box-shadow`) em `index.html`. Não é um anel customizado único.
- **Faixa de 30 dias dos Indicadores** (`.ps-day`, botões de 6–14 px): intencionalmente densos; a mesma ação existe
  nas setas e no seletor de data (exceção de alvo equivalente).

## Fora desta auditoria (ainda não medido)

Tela de login, XFlow (conta de teste sem acesso), páginas públicas `/quadro` e `/reuniao`, conteúdo interno da
maioria dos modais (só medi RENATA, atividade e notificações), leitor de tela, zoom 200%.

## Como repetir

O medidor é um script de ~60 linhas (contraste efetivo por texto com bloqueio de fundo e `opacity`; `cursor:pointer`
sem `tabindex`/`role`; menor lado do alvo; regras CSS que removem `outline`). Foco real por `.focus()` NÃO funciona
no browser do painel (a janela não tem foco de documento) — por isso o foco foi auditado pelas regras de CSS.
