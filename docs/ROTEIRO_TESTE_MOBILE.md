# Roteiro de teste no celular e no tablet (2026-10-17)

Para quem for testar o PRICETAX Cronograma (https://painel.pricetax.com.br) em aparelho de verdade. Cobre o que foi feito no plano mobile (instalar como app, sem conexão, zoom do iPhone, telas cortadas, alvos de toque, arrastar com o dedo, tablet) e que **não dá para provar no navegador do computador**. A versão para marcar no próprio celular está publicada como página (peça o link ao Rafael); este arquivo tem o mesmo conteúdo.

**42 testes, 26 prioritários (P1).** Cada aparelho leva cerca de 25 minutos só com os P1.

## Antes de começar

- Use um usuário de **teste** e uma empresa/atividades de **teste**. Vários passos criam, movem e apagam coisas. Não use dados de cliente real.
- Anote o aparelho, a versão do sistema (iOS/Android) e o navegador (Safari, Chrome, app instalado ou aba).
- Faça os testes **P1** primeiro (cerca de 25 minutos por aparelho). Os **P2** são complementares.
- Para cada falha: print ou gravação de tela, o ID do teste (ex.: L1), o aparelho e o que aconteceu.
- Os testes do grupo **Notificações push** só funcionam depois que o servidor tiver as chaves de notificação configuradas. Se aparecer "Ainda não está disponível", pule o grupo e avise o Rafael.

Legenda de aparelho: **iPhone**, **Android**, **Tablet** (iPad ou Android grande). Marque o resultado de cada teste como **Passou**, **Falhou** ou **Não se aplica**.

## Instalar o app

### I1 · Instalar no Android (Chrome)  _(P1 · Android)_

1. Abra https://painel.pricetax.com.br no Chrome.
2. Menu ⋮ → "Instalar app" (ou "Adicionar à tela inicial").

**Esperado:** Aparece o nome PRICETAX e o ícone: X amarelo com seta, fundo preto, nítido. O Android pode recortar o ícone em círculo ou quadrado arredondado, mas o X e a seta devem ficar inteiros.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### I2 · Instalar no iPhone (Safari)  _(P1 · iPhone)_

1. Abra https://painel.pricetax.com.br no **Safari**.
2. Compartilhar → "Adicionar à Tela de Início".

**Esperado:** Nome "PRICETAX" e ícone nítido (X amarelo com seta no fundo preto).

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### I3 · Abre em tela cheia  _(P1 · iPhone · Android · Tablet)_

1. Toque no ícone novo da tela inicial.

**Esperado:** O sistema abre sem barra de endereço e sem abas do navegador.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### I4 · Barra de status do iPhone  _(P1 · iPhone)_

1. Com o app instalado aberto, olhe o topo da tela (hora, bateria, sinal).

**Esperado:** A barra de cima é preta e o app começa logo abaixo. Hora e bateria **não** ficam sobre botões ou títulos. Nada cortado no notch ou na ilha.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### I5 · Botão Voltar do Android  _(P2 · Android)_

1. No app instalado, abra um modal (ex.: uma atividade) e toque em Voltar do Android.
2. Na tela inicial do app, toque em Voltar de novo.

**Esperado:** Dentro do modal, Voltar fecha o modal e não sai do app. Na tela inicial, sai do app.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### I6 · Atalhos do ícone  _(P2 · Android)_

1. Segure o dedo no ícone do app.

**Esperado:** Aparecem Gestão de Atividades, Agenda e Empresas. Cada um abre a tela certa.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### I7 · Continua logado  _(P1 · iPhone · Android · Tablet)_

1. Entre com seu usuário.
2. Feche o app por completo (arraste para fora) e abra de novo.

**Esperado:** Continua logado, sem pedir senha.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### I8 · Girar a tela  _(P2 · iPhone · Android · Tablet)_

1. Gire para paisagem e volte para retrato em 3 telas diferentes.

**Esperado:** O layout não quebra nem fica cortado.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

## Sem conexão

### O1 · Abrir sem internet  _(P1 · iPhone · Android · Tablet)_

1. Com o app instalado, ligue o modo avião.
2. Feche o app e abra de novo pelo ícone.

**Esperado:** Aparece "Sem conexão" com o botão "Tentar de novo". **Não** pode aparecer a tela de login.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### O2 · Voltar a conexão  _(P1 · iPhone · Android · Tablet)_

1. Na tela "Sem conexão", desligue o modo avião.
2. Toque em "Tentar de novo" (ou espere alguns segundos).

**Esperado:** O sistema abre logado, sem digitar senha.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### O3 · Editar sem internet  _(P2 · iPhone · Android · Tablet)_

1. Logado, ligue o modo avião e mude o título de uma atividade de teste.
2. Veja o que aparece. Depois desligue o modo avião e use "Tentar de novo".

**Esperado:** Aparece aviso de falha ao salvar (nada se perde em silêncio) e, ao reconectar, a gravação funciona. Anote o que viu.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

## Zoom ao tocar nos campos (iPhone)

### Z1 · Busca da Gestão de Atividades  _(P1 · iPhone)_

1. Abra Gestão de Atividades e toque no campo "Buscar...".

**Esperado:** A página **não** dá zoom (não aumenta e fica ampliada).

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### Z2 · Cartão: descrição, tag e checklist  _(P1 · iPhone)_

1. Abra um cartão.
2. Toque na descrição, em "+ tag" e em "Adicionar item".

**Esperado:** Nenhum dos três provoca zoom.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### Z3 · Fases e Nova atividade  _(P2 · iPhone)_

1. Empresa → ⋯ Mais → Fases: toque no nome de uma fase.
2. Empresa → Nova atividade: toque nos campos.

**Esperado:** Sem zoom.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

## Telas cortadas ou "andando" para o lado

### L1 · Empresa → Tabela  _(P1 · iPhone · Android)_

1. Abra uma empresa de teste e toque na aba Tabela.
2. Role até uma atividade.

**Esperado:** Título, responsável, status, Início e Fim aparecem inteiros. Nada cortado à direita.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### L2 · Empresa → Fases  _(P1 · iPhone · Android)_

1. Toque na aba Fases.

**Esperado:** Cards em uma coluna, inteiros.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### L3 · Nenhuma tela "anda" para o lado  _(P1 · iPhone · Android)_

1. Percorra: Início, Gestão, Agenda, XFlow, CRM, Empresas e as abas Resumo, Reuniões, Tarefas, Gantt, Quadro.
2. Em cada uma, tente arrastar a página para o lado.

**Esperado:** A página inteira não anda para o lado. Rolagem lateral só dentro do Gantt e dos quadros é normal.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### L4 · Paisagem  _(P2 · iPhone · Android)_

1. Gire para paisagem na Tabela e no Gantt.

**Esperado:** Continua legível e sem cortes.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

## Facilidade de tocar

### T1 · Botões do detalhe da reunião  _(P1 · iPhone · Android)_

1. Abra uma reunião.
2. Toque no X (Fechar), em chips de participantes (PRICETAX, Compras…) e em "Nova tarefa".

**Esperado:** Dá para acertar o botão certo de primeira, sem tocar o vizinho. Anote quais errou.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### T2 · Menu "Mais ações" da Gestão  _(P1 · iPhone · Android)_

1. Em Gestão de Atividades, toque no botão ⋯ do topo.
2. Abra Lixeira, Concluídas, Indicadores e Compartilhar, um por vez.

**Esperado:** Cada item abre a sua tela.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### T3 · Filtros e ordenação  _(P1 · iPhone · Android)_

1. Em Gestão, toque em Filtros.
2. Troque a ordenação e digite na busca.

**Esperado:** A ordenação aparece dentro de Filtros e funciona. A busca continua com largura útil.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### T4 · Primeiro cartão na primeira tela  _(P1 · iPhone · Android)_

1. Abra Gestão de Atividades (precisa ter cartões) e não role.

**Esperado:** Anote quantos cartões aparecem **inteiros** sem rolar. A meta é pelo menos 1.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### T5 · Caixas de marcar  _(P2 · iPhone · Android)_

1. Marque e desmarque a caixa de uma subatividade e a de "Obrigatória".

**Esperado:** Consegue marcar sem errar. Elas têm 24 px (menos que o ideal de 44). Anote se atrapalha.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### T6 · Tablet: botões do topo  _(P2 · Tablet)_

1. Use só o dedo na barra do topo, na seleção de empresas e nos modais.

**Esperado:** Todos os botões e ícones são fáceis de acertar.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

## Arrastar com o dedo

### A1 · Quadro pessoal (Gestão)  _(P1 · iPhone · Android)_

1. Em Gestão, **segure** um cartão por cerca de meio segundo e arraste para outra coluna.

**Esperado:** O cartão muda de coluna. A página não rola sem querer durante o arrasto. Anote qualquer estranheza.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### A2 · Gantt: tocar e arrastar a barra  _(P1 · iPhone · Android · Tablet)_

1. Empresa → Gantt.
2. Toque rápido numa barra.
3. Depois arraste uma barra para o lado e solte.

**Esperado:** O toque rápido abre a atividade. O arrasto muda a data (confira no detalhe).

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### A3 · Gantt: rolar começando em cima da barra  _(P1 · iPhone · Android · Tablet)_

1. No Gantt, tente rolar a página para cima e para baixo começando o dedo **em cima** de uma barra.
2. Depois role pela coluna de nomes e pelo espaço vazio.

**Esperado:** Por projeto, em cima da barra a página **não** rola. Anote se isso atrapalha. Pela coluna de nomes e pelo espaço vazio, rola normal.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### A4 · Empresa → Quadro  _(P1 · iPhone · Android · Tablet)_

1. Empresa → Quadro.
2. Tente arrastar um cartão para outra coluna de status.

**Esperado:** Anote **sim ou não**: funciona no toque? (Esse arrasto usa o recurso nativo do navegador e nunca foi testado no toque.)

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### A5 · CRM → quadro de negócios  _(P1 · iPhone · Android · Tablet)_

1. No CRM, abra o quadro de negócios (crie um negócio de teste se estiver vazio).
2. Tente arrastar um negócio entre colunas.

**Esperado:** Anote **sim ou não**: funciona no toque?

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### A6 · Tabela no tablet  _(P2 · Tablet)_

1. Empresa → Tabela (tablet).
2. Arraste a alça ⋮⋮ de uma linha para reordenar.
3. Arraste a tabela para o lado para ver Início, Fim e Status.

**Esperado:** Reordena e rola. Anote se ficou claro que dá para rolar para o lado (não há indicador visual).

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### A7 · Reordenar no celular  _(P2 · iPhone · Android)_

1. Na Tabela do celular não existe reordenar.

**Esperado:** Anote se faria falta (a alternativa seria botões subir/descer).

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

## Teclado na tela

### K1 · Teclado cobre algo?  _(P1 · iPhone · Android)_

1. Abra Nova reunião e o detalhe de uma atividade.
2. Toque em campos de baixo da tela para o teclado abrir.

**Esperado:** O campo em que você digita fica visível, e dá para chegar em Salvar/Fechar. Anote o que o teclado cobre.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### K2 · Fechar o teclado  _(P2 · iPhone · Android)_

1. Digite bastante texto numa descrição e feche o teclado.

**Esperado:** A tela volta ao normal, sem faixa em branco nem deslocamento.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

## Notificações push

### N1 · Ativar neste aparelho  _(P1 · iPhone · Android · Tablet)_

1. No sistema, toque no sino → "Escolher o que ver" → bloco "Avisos neste aparelho (push)".
2. Toque em "Ativar neste aparelho" e permita quando o aparelho perguntar.

**Esperado:** O bloco passa para "Ativadas neste aparelho". **No iPhone** só funciona com o app instalado; numa aba do Safari deve aparecer "Instale o app primeiro".

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### N2 · Enviar um teste  _(P1 · iPhone · Android · Tablet)_

1. Toque em "Enviar um teste".
2. Repita com o app **fechado** (peça para alguém clicar no teste de outro aparelho com seu usuário, ou feche o app logo após tocar).

**Esperado:** Chega um aviso "PRICETAX — Teste: as notificações neste aparelho estão funcionando." em poucos segundos, com o app aberto e com ele fechado. Anote o tempo.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### N3 · Aviso de verdade e toque  _(P1 · iPhone · Android · Tablet)_

1. Peça a outra pessoa para atribuir uma atividade a você ou mencionar você num comentário.
2. Com o app fechado, espere o aviso e toque nele.

**Esperado:** Chega o aviso com o mesmo título e texto do sino. O toque abre o sistema no módulo certo (Empresas, XFlow, CRM, Pareceres…).

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### N4 · Tela bloqueada  _(P2 · iPhone · Android · Tablet)_

1. Bloqueie o aparelho e dispare um teste.

**Esperado:** Anote se o texto aparece na tela bloqueada e se isso é aceitável para vocês (hoje o texto é o mesmo do sino, com nomes de empresas e pessoas).

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### N5 · Silenciar uma categoria  _(P2 · iPhone · Android · Tablet)_

1. Em "Notificações (sino)", desmarque "Empresas".
2. Peça outra atribuição de atividade.

**Esperado:** Nenhum aviso chega para essa categoria. Marque de novo ao terminar.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### N6 · Desativar  _(P2 · iPhone · Android · Tablet)_

1. Toque em "Desativar neste aparelho".
2. Peça uma nova atribuição.

**Esperado:** O bloco volta a "Desativadas" e nenhum aviso chega neste aparelho.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

## Tablet (iPad)

### P1 · Tabela em retrato e paisagem  _(P1 · Tablet)_

1. Empresa → Tabela, em retrato e em paisagem.

**Esperado:** Rola para o lado e mostra todas as colunas. Botões grandes o bastante.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

### P2 · Gestão, Agenda e XFlow  _(P2 · Tablet)_

1. Use essas três telas só com o dedo.

**Esperado:** Tudo utilizável. Anote o que ficou pequeno ou difícil.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

## Depois do próximo deploy

### U1 · Atualização do app instalado  _(P2 · iPhone · Android · Tablet)_

1. Só depois que o time publicar uma nova versão (peça aviso ao Rafael).
2. Abra o app instalado.

**Esperado:** Carrega a versão nova. Se aparecer "O sistema foi atualizado", tocar em Recarregar funciona. Anote quantas aberturas foram necessárias.

**Resultado:** ☐ Passou  ☐ Falhou  ☐ Não se aplica  — Anotação: ______________________

## Como relatar um problema

Mande, para cada falha: **ID do teste** (ex.: L1), **aparelho e modelo**, **versão do iOS/Android**, **navegador** (Safari/Chrome) e se estava no **app instalado** ou numa aba, **print ou gravação de tela** e o que você esperava ver.

## O que este roteiro responde

- Instala e abre em tela cheia no iPhone e no Android? (I1–I8)
- Sem internet o app mostra "Sem conexão" e volta sozinho? (O1–O3)
- O iPhone para de dar zoom nos campos? (Z1–Z3)
- Tabela e Fases cabem em telas estreitas? (L1–L4)
- Os botões são fáceis de tocar? (T1–T6)
- Dá para arrastar com o dedo (quadro, Gantt, Tabela, CRM)? (A1–A7)
- O teclado atrapalha? (K1–K2)
- As notificações push chegam, com o app fechado, e o toque abre o módulo certo? (N1–N6)
- O iPad funciona bem? (P1–P2)
- O app instalado atualiza depois de um deploy? (U1)
