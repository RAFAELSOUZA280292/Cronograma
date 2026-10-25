# Prontidão da Eduarda para largar o PipeRun (auditoria de 25/10/2026, para 26/10)

Método: dados reais do backup do PipeRun carregados num **sandbox local** (`scripts/sandbox-eduarda.mjs`, organização isolada, usuária no perfil Vendedor) + navegação como ela (navegador, celular 375 px) + teste HTTP (`scripts/crm-eduarda.test.mjs`) + medição de tempo em produção. Nada foi gravado em produção nesta auditoria além do deploy do código corrigido.

## Pergunta central
> Amanhã a Eduarda consegue trabalhar só no painel, sem sentir falta de nada?

**Resposta: SIM para a rotina dela (follow-ups, prospecção, funil) — o acesso ao CRM (B1) foi liberado e confirmado. "Sem sentir falta de absolutamente nada": NÃO — há 5 recursos do PipeRun que ela não terá (lista na seção "Lacunas").**

## Perfil de uso dela no PipeRun (do backup)
25 negócios (19 abertos, 5 perdidos, 1 ganho; 13 no funil Tributaristas e Contadores), 92 atividades (70 abertas, quase todas "1º Follow Up"), 428 anotações, 913 eventos de histórico. Perfil SDR: lead → follow-up por WhatsApp/telefone → anotação → mover de etapa. Nunca usou Atendimento, e-mail integrado, ligações do PipeRun nem propostas (as 7 propostas são do Maurício/Felipe). Google Agenda: só 4 atividades.

## Bloqueadores (podem impedir a operação amanhã)
| # | Problema | Estado |
|---|---|---|
| **B1** | **Eduarda NÃO tem acesso ao CRM em produção** (`crmRole` vazio, `crmAccess=false`): o cartão "CRM" nem aparece para ela. | **RESOLVIDO em 25/10 (Rafael)**: perfil **Gestor Comercial** (`crmRole=gestor`, `crmAccess=true`), confirmado em produção; ela já aparece na lista de responsáveis do CRM. Como Gestor ela também importa planilhas, exclui, edita negócio fechado e configura funis/catálogo. |
| B2 | `createDeal` sem o campo `mrr` quebrava (erro 500 "null value in column mrr") desde o deploy do MRR — o formulário da tela sempre mandava `mrr`, mas qualquer outro caminho (API, lead rápido) falhava. | **Corrigido** (achado pelo teste do lead rápido). |
| B3 | Abrir negócios com imagens nas anotações baixava até **16,9 MB** (≈ 2 s; pior no celular) — regressão da importação das imagens. | **Corrigido**: a lista de notas vem leve e cada imagem carrega sob demanda (`/api/crm/notes/:id/attachments/:id`). |

## O que foi melhorado (para a rotina ficar melhor que no PipeRun)
1. **Telefone, WhatsApp e e-mail do contato** (antes não apareciam em lugar nenhum do negócio!): links de um toque (ligar, abrir conversa no WhatsApp, escrever) no **cartão**, na **ficha do negócio**, na **Agenda** (cada follow-up) e na lista de contatos da empresa.
2. **"Nome não informado"** (placeholder do PipeRun em ~metade dos contatos dela) não aparece mais: mostra o telefone.
3. **Lead rápido**: em "Criar negócio", se a empresa não existe → "Cadastrar … como lead novo" cria **empresa + contato (telefone/WhatsApp) + negócio num passo só**, com ela de responsável (como o formulário do PipeRun). Empresa parecida → avisa e oferece "usar esta".
4. **Primeiro acesso abre o funil onde ela mais trabalha** (Tributaristas e Contadores), e o formulário de negócio já vem nesse funil.
5. Tags, MRR, prazo de etapa, previsão (entregues antes) aparecem nos cartões.
6. **Fila de follow-ups** (botão na Agenda): uma atividade por vez, com ligar/WhatsApp, últimas anotações, resultado em 1 linha e "Concluir e próximo".
7. **Cadência de follow-up** configurável por etapa (Funis e etapas): o CRM agenda o 1º/2º/3º follow-up sozinho (§93).

## Critério objetivo de aprovação (APROVADO só se TODOS forem verdadeiros)
- **C1** Acesso: ela entra, vê o módulo CRM e o perfil dele permite o que ela faz (ler, criar, editar, mover, concluir).
- **C2** Dados: 100% dos negócios dela (25), atividades abertas (67 com negócio), anotações e histórico estão no painel e com ela como responsável.
- **C3** Rotina diária executável sem sair do painel: ver o que fazer hoje → contatar o lead (ligar/WhatsApp) → registrar o resultado → agendar o próximo follow-up → mover de etapa → cadastrar lead novo.
- **C4** Desempenho: telas principais abrem em < 1 s (desktop) e nenhuma ficha passa de 1 MB.
- **C5** Celular: a rotina acima funciona em 375 px.
- **C6** Sem regressão: testes automáticos verdes (migração 118, lacunas, API, rotina da Eduarda) e build/auditorias limpos.
- **C7** Nenhum recurso que ela USA no PipeRun está ausente (recursos que ela não usa não contam).

## Checklist funcional (✅ verificado · ⚠ com ressalva · ❌ ausente · ⛔ bloqueado)
| Área | Item | Status | Evidência |
|---|---|---|---|
| Acesso | Entrar com o usuário dela | ✅ | usuário existe, ativo, sem expiração |
| Acesso | Ver o módulo CRM | ✅ | `crmRole=gestor`, `crmAccess=true` em produção (conferido) |
| Acesso | Perfil Vendedor: ler/escrever; sem excluir/importar/configurar | ✅ | teste HTTP (403 nos proibidos) |
| Dados | 25 negócios dela (19/5/1) | ✅ | produção e sandbox: 25; status batem |
| Dados | 67 atividades abertas com responsável | ✅ | 70 no PipeRun: 3 eram lembretes **sem negócio** (ver Lacunas) |
| Dados | Anotações (428) com autor e data originais | ✅ | autoria preservada; imagens como anexo |
| Dados | Histórico real de etapas | ✅ | 1.046 movimentos, 307 negócios |
| Dados | Tags / MRR / previsão / produtos / prazo de etapa | ✅ | conferência 72/72, R$ 119.290,20, 48/48, 7/7, 41/41 |
| Rotina | Hoje/atrasadas na tela inicial | ✅ | "Minhas atrasadas 67" com lista |
| Rotina | Agenda por urgência, filtro Minhas | ✅ | 67 atrasadas, concluídas 21 |
| Rotina | Ligar / WhatsApp / e-mail do contato | ✅ (novo) | links no cartão, ficha e agenda |
| Rotina | Concluir atividade com resultado e já criar a próxima | ✅ | modal "Concluir atividade" |
| Rotina | Criar atividade (follow-up) no negócio | ✅ | botão na ficha e na Agenda |
| Rotina | Anotação com texto/print | ✅ | composer com Ctrl+V |
| Rotina | Mover etapa (arrastar, seletor, celular) | ✅ | quadro + "Mover para…" |
| Rotina | Ganhar/Perder com motivo | ✅ | botões na ficha |
| Rotina | Cadastrar lead novo em 1 passo | ✅ (novo) | lead rápido, teste HTTP |
| Rotina | Busca global | ✅ | caixa "Buscar empresa, negócio, contato, e-mail" |
| Rotina | Filtros: responsável, origem, tag, atenção | ✅ | quadro e lista |
| Rotina | Exportar CSV | ✅ | botão Exportar |
| Celular | Visão geral/Agenda/Negócios em 375 px | ✅ | capturas de tela |
| Desempenho | Telas principais | ✅ | 0,22–0,46 s; ficha com imagens agora leve (era 16,9 MB) |

## Lacunas conhecidas (recursos do PipeRun que ela não terá amanhã)
| Lacuna | Impacto na Eduarda | Plano |
|---|---|---|
| **3 lembretes avulsos** (sem negócio) "Verificar se a Priscila colocou as informações do cliente…" (duplicados de set/2026, vencidos) | Baixo | Recriar 1 como atividade/anotação se ainda valer; estão no backup. |
| **Relatórios e Forecast por período** do PipeRun | Baixo para SDR; alto para gestão | A Visão geral tem funil, ponderado, "a fechar em 30 dias", ganhos do mês. Relatórios por período: roadmap (Fase 4 do CRM). |
| **Proposta (editor, PDF, assinatura eletrônica)** | Zero para ela (não criava) | Time decide a ferramenta (7 propostas históricas estão como anotação + PDFs no backup). |
| ~~Importar planilha de leads~~ | — | Resolvido: ela é Gestor Comercial e importa. |
| **Ações em lote** (transferir/mover vários negócios) | Baixo | Não existe; avaliar se o time usava. |
| **Duração da atividade (30/60 min)** do PipeRun | Baixo | A atividade tem data/hora; duração não é guardada. |
| App nativo do PipeRun | Baixo | O painel é instalável (PWA) e responsivo; testado em 375 px. |

## Roteiro do 1º dia (para mandar para a Eduarda)
1. Entrar no painel › cartão **CRM** (depois que o Rafael liberar).
2. **Visão geral**: "Minhas atrasadas" mostra os 67 follow-ups antigos (são de set/2026, vieram do PipeRun) — conclua ou cancele em sequência na **Agenda** (filtro "Minhas atividades").
3. Em cada follow-up: toque no 📞/WhatsApp, faça o contato, **Concluir** (resultado em 1 linha) e marque a próxima atividade.
4. **Negócios**: abre no funil dela; arraste o cartão ou use "Mover para…".
5. **Lead novo**: Criar negócio › digite o nome da empresa › "Cadastrar como lead novo" › nome, telefone, pronto.
