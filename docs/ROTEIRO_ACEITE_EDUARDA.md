# Roteiro de aceite — Eduarda no painel (26/10/2026)

Objetivo: decidir, com evidência, se a Eduarda pode trabalhar **só no painel** e o PipeRun pode ser cancelado. Rodar com ela, no primeiro dia, com Rafael do lado (30–40 min). Cada item é **passou / não passou**; o que não passar vira a lista de correção do dia.

Base: `docs/AUDITORIA_PRONTIDAO_EDUARDA.md` (auditoria de 25/10) e `PROJECT_CONTEXT.md` §92–§98. Não use dados de teste em produção: tudo abaixo é feito com negócios reais dela (ou 1 lead de verdade).

## Antes de começar (Rafael, 2 min)
- [ ] Ela entra com o próprio usuário e vê o cartão **CRM** (perfil Gestor Comercial).
- [ ] Na **Visão geral** ela troca para **Meu dia** e clica em **Usar como início** (como Gestor, ela abre em Time por padrão).
- [ ] Em **Negócios**, ela filtra "Meus negócios" e usa **Salvar visão** (nome sugerido: "Minha carteira") e **Abrir esta visão por padrão** (⋮).

## Bloco 1 — Os dados dela estão todos lá (5 min)
| # | Faça | Passou se… |
|---|---|---|
| 1.1 | Meu dia › "Meu funil" | mostra os 25 negócios dela (19 abertos) — o mesmo número do PipeRun |
| 1.2 | Abrir 3 negócios que ela conhece bem | etapa, valor, contato, telefone e anotações antigas (com autor e data) batem com o PipeRun |
| 1.3 | Abrir 1 negócio com print/imagem nas anotações | a ficha abre em menos de 2 s e a imagem aparece |
| 1.4 | Agenda › "Minhas atividades" | os follow-ups abertos dela estão lá (67); conferir 5 ao acaso contra o PipeRun |

## Bloco 2 — A rotina do dia, sem sair do painel (15 min)
| # | Faça | Passou se… |
|---|---|---|
| 2.1 | Agenda › **Fila** | abre um follow-up por vez, com ligar/WhatsApp, últimas anotações e campo de resultado |
| 2.2 | Fazer 1 contato real (ligar ou WhatsApp pelo botão do contato) | o app do telefone/WhatsApp abre com o número certo |
| 2.3 | **Concluir e próximo** com o resultado em 1 linha | a atividade fecha, a anotação aparece na ficha do negócio e a fila avança |
| 2.4 | Reagendar 1 follow-up | a nova data aparece na Agenda |
| 2.5 | Mover 1 negócio de etapa (arrastar e, no celular, "Mover para…") | muda de etapa e o histórico registra |
| 2.6 | Editar valor ou previsão direto na **lista** de negócios | salva na hora e o "Desfazer" do aviso volta o valor |
| 2.7 | **Cadastrar lead novo** (Criar negócio › nome da empresa › "Cadastrar como lead novo") com um lead de verdade | cria empresa + contato (com telefone) + negócio em 1 passo, com ela de responsável |
| 2.8 | Ctrl+K: digitar parte do nome de um negócio | o resultado aparece e abre a ficha |
| 2.9 | Ganhar ou perder 1 negócio **só se houver um real** (perder exige motivo) | fecha e some do quadro aberto |

## Bloco 3 — Celular (5 min)
Repetir 2.1 a 2.3 e 2.5 no celular dela (painel instalado ou navegador).
- [ ] Nada fica cortado, os botões são tocáveis com o dedo e a fila funciona.

## Bloco 4 — "Sinto falta de alguma coisa?" (5 min)
Perguntar, uma a uma, e anotar a resposta literal:
1. O que você fazia todo dia no PipeRun que não achou aqui?
2. Algo ficou mais lento ou mais difícil?
3. Algo ficou melhor?
Lacunas já conhecidas (não contam como falha, mas precisam de decisão): relatórios por período, editor de proposta/assinatura, ações em lote, duração da atividade, 3 lembretes avulsos antigos (`docs/AUDITORIA_PRONTIDAO_EDUARDA.md`).

## Critério de decisão
- **Aprovado para cancelar o PipeRun:** todos os itens dos blocos 1 e 2 passaram, o bloco 3 passou, e a única falta citada no bloco 4 é lacuna já conhecida e sem uso dela.
- **Aprovado com ressalva:** falhou até 1 item de baixo impacto com correção marcada para o mesmo dia — manter o PipeRun só leitura por 7 dias.
- **Não aprovado:** qualquer falha nos itens 1.1, 1.4, 2.3, 2.5 ou 2.7, ou perda de dado. Não cancelar; corrigir e repetir o item.

## Depois do cancelamento (Rafael)
- [ ] Segundo meio com o zip do backup (≈ 630 MB) conferido.
- [ ] Token do PipeRun e tokens `pxk_` revogados.
- [ ] Funil comercial vazio arquivado (Negócios › Funis › Arquivar).
- [ ] Usuário do Maurício criado (31 negócios e 36 atividades estão sem responsável).
- [ ] Cadência de follow-up decidida (ver abaixo). Só vale para negócios que **entrarem** na etapa depois de criada.

## Cadência sugerida (decisão do Rafael)
Funil **Tributaristas e Contadores › Leads** (é onde a Eduarda mais trabalha), três passos do tipo Follow-up: **1º Follow Up** em +1 dia, **2º Follow Up** em +3 dias, **3º Follow Up** em +7 dias. O 1º conta da entrada na etapa; os seguintes, da conclusão do anterior. Sair da etapa ou fechar o negócio cancela os passos que sobraram. Criação: Negócios › **Funis** › Tributaristas e Contadores › etapa Leads › Cadência.

## Depois de uma semana
Central de Inteligência › **Experiência de uso**: sucesso por fluxo (meta ≥ 90%), tempo mediano e nota (meta ≥ 4,5). Onde estiver abaixo, é a próxima melhoria — com número, não com palpite.
