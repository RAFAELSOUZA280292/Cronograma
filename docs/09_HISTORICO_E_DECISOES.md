# Histórico do produto e decisões permanentes

> Atualizado em 2026-10-29. O **porquê** detalhado de cada mudança está no `PROJECT_CONTEXT.md` (seção citada em cada linha; use `docs/gerado/INDICE_PROJECT_CONTEXT.md` para achar a linha). A lista **exata de commits** (do git) está em `docs/gerado/HISTORICO_COMMITS.md` (489 commits, de 2026-08-01 a 2026-10-29, gerados do clone de deploy).

## Em uma frase
Em três meses o app virou de "cronograma de reforma tributária" para o **ecossistema de trabalho da PRICETAX**: cronogramas por cliente, quadro pessoal, agenda, XFlow (bugs do time de DEV), CRM, RENATA (IA que consulta e executa), pareceres/biblioteca e integrações por API.

## Para quem é / quando ler
- "Quando e por que isso foi criado?", "já tentamos isso antes?", "qual foi a decisão do Rafael sobre X?".
- **Palavras-chave:** linha do tempo, fase, decisão, política, pedido do Rafael, §.

## Linha do tempo por fase (com a seção do `PROJECT_CONTEXT.md`)

| Quando | O que entrou | Seções |
|---|---|---|
| **2026-08** (base) | Cronograma por empresa (Tabela/Fases/Quadro/Gantt), quadro pessoal, multi-tenant por `org_id` (fases 1–3), Grupo Empresarial, XFlow v1→v2, autoatendimento de conta, Central de Notificações, Google Calendar, Agenda, Visão Geral, 3 acessos independentes (Empresas/Atividades/XFlow) | §7, §11–§12, §18–§23 |
| **2026-09 até 14** | Reuniões, Atividades ("Centro de Execução"), AI Meeting Workspace, **RENATA fases 1–8** (memória, busca híbrida com embeddings, executora, custo, memória em camadas, Central de Conhecimento, eval harness, prompt cache), sincronização entre usuários ("BIP"), pendências por pessoa | §24–§42 |
| **2026-09-16 a 20** | Correções reais de autosave/transcrição ("texto some", "Processando… pra sempre"), Pareceres, transcrição em português, **CRM fases 1–3** + importação do PipeRun, Agenda com aceito/recusado | §43–§59 |
| **2026-09-28 a 10-04** | Pareceres por cliente (isolamento), bug "digito e some" (poll × autosave), quadro pessoal, Dossiê do cliente, imagens nas TASKs, indicadores, auditoria de acessos, **RENATA estuda os Pareceres**, fonte global, peças visuais comuns e acessibilidade | §60–§72 |
| **2026-10-05** | Tela inicial verdadeira, endereço por módulo, widget do iPhone, Meu dia/boas-vindas, Modelos de documentos, consolidação da documentação, **API de conectividade** (tokens), plano de usabilidade (7 ondas) | §73–§81 |
| **2026-10-06 a 10-13** | Notificações por categoria, RENATA geral, Levantamento e Lacunas, responsável por empresa, descrição formatada, ganho por subatividade, **vínculo tarefa→atividade** (fases 1–5) | §86–§87 |
| **2026-10-15 a 10-22** | Bibliotecas atualizadas, divisão do `App.jsx`, limites de erro, mobile, PWA, push, visões; **cronograma padrão versionado** (v1–v5), aba Mapa, link público de acompanhamento, Power BI/Excel, reservar na agenda, `read_write` na API, PDF | §88–§91 |
| **2026-10-25** | **Inteligência Operacional**, **versionamento/restauração do cronograma**, **migração do PipeRun → CRM**, auditoria, estudo de UX (edição direta, paleta Ctrl/⌘K, erros claros, atrito, visões salvas), **Claude Code opera o CRM por chave**, frases de líderes, **RENATA operacional** (ferramentas, confirmação, desfazer, auditoria) | §82–§85, §92–§101 |
| **2026-10-26** | Checklist com prazo e responsável, daily por responsável, importação do evento 22–23/10 no CRM, calendário sem corte, espelho no Google, teste da RENATA com IA real em produção, reunião inteira por API | §102–§115 |
| **2026-10-27** | Copiar/exportar conversa da RENATA, **Biblioteca de conhecimento**, correção do "fantasma" (duas abas), retentativa de salvamento, CRM arrastar etapa, quadro público e colunas compartilhadas | §116–§122 |
| **2026-10-28** | Copiar link do negócio, Excel nativo no CRM, **IA externa envia transcrição** e **corrige reuniões** pela API | §116b–§116e |
| **2026-10-29** | **Duas chaves de API** ("Ler tudo"/"Ler e editar tudo"), estudo de parecer cortado pela IA, ids internos fora da RENATA geral, **RENATA orienta com base nos pareceres** (por projeto e geral), RENATA operacional sem travar (resposta forçada, ler reunião, horário GMT-3, Atualizar/Limpar), esta documentação completa | §116f–§116j, `docs/` |

## Políticas e decisões permanentes do Rafael (valem até ele mudar)

| Decisão | Onde está registrada | Como aplicar |
|---|---|---|
| **Commit + push sem pedir confirmação a cada vez** (depois de `fetch`/divergência) e **verificar em produção** em seguida | `CLAUDE.md`, `PROJECT_CONTEXT.md` §3 | `docs/06_MANUAL_DO_DESENVOLVEDOR.md` (Deploy) |
| **Claude Code pode operar o CRM de produção** (criar, editar, mover, excluir lógico, registrar) **só pela chave** `crm_operate`/`write_all`, sempre registrado como "Claude Code"; gravação em massa (> ~20) com prévia; fora do alcance: migração do PipeRun, usuários/senhas/tokens | `CLAUDE.md` (seção "Operar o CRM de produção"), §99 | Nunca usar cookie do Rafael nem SQL direto em produção para gravar no CRM |
| **O código é a fonte da verdade**; documentação divergente se corrige na mesma sessão | `CLAUDE.md` | Antes de mudar, abrir os arquivos |
| **Não preencher por presunção**; campo sem regra confirmada fica vazio e vira pergunta (templates fiscais) | memória do dono | Perguntar em vez de supor |
| **Não repetir perguntas já encerradas** | memória do dono | Conferir o histórico antes de perguntar |
| **Ferramenta pública é tangível, sem captura** | memória do dono | Não pedir dados pessoais para entregar valor |
| **Em material para cliente, "o motor estima" é recurso, não defeito** | memória do dono | Redação de materiais |
| **Hora das mensagens/relatos em Brasília (GMT-3)**; logs do servidor estão em UTC | §116j, memória do dono | Converter sempre |
| **Pareceres: parecer de um cliente nunca aparece em outro**; cliente (usuário) nunca recebe conteúdo de parecer no chat | §48, §70, `server/parecerScope.js` | Toda função nova que use pareceres passa por `parecerUsableFor` |
| **Nada de esoterismo na RENATA**: orienta só com base em pareceres/materiais estudados; tema sem estudo "passa batido" | §116i | Ver `docs/05_MODULO_RENATA_E_IA.md` |
| **Deploy: `git add` por caminho**, nunca `-A` (já subiu pasta de cliente ao repositório público) | §116, memória do dono | Conferir `git status` antes de commitar |
| **Dados de cliente não vão para o repositório** (`exports/` etc. fora do rsync) | `CLAUDE.md`, memória | Conferir exclusões do rsync |

## Marcos de arquitetura (para entender "por que é assim")
- **Um JSON por empresa** (`projects.data`) nasceu com o app de cronograma; por isso as travas de concorrência (transação, 409, fusão, versionamento) — §9, §83, §117.
- **Multi-tenant** foi acrescentado depois, por `org_id`, sem mudar o JSON — §11.
- **RENATA** começou como "chat sobre reuniões" (fases 1–8) e virou duas: a de **consulta** (assistente) e a **operacional** (executa pelas mesmas rotas da tela) — §27–§42, §101.
- **API de conectividade** nasceu para "outra janela do Claude Code ler o painel" e cresceu (criar atividade, ajustar cronograma, operar CRM, enviar/corrigir reunião); em 2026-10-29 foi **simplificada em duas chaves** sem derrubar as antigas — §80, §99, §116d–§116f.
- **Documentação-mãe** foi consolidada em 2026-10-05 (§79) e **completada em 2026-10-29** com o conjunto `docs/00…10` + `docs/gerado/`.

## Como atualizar este histórico
1. Ao terminar uma mudança relevante: novo § no `PROJECT_CONTEXT.md` (decisão, causa, o que foi feito, como foi verificado, **o que não foi testado**).
2. Acrescente uma linha na fase da tabela acima.
3. `npm run docs:gerar -- --git /caminho/do/clone` atualiza o histórico de commits.

## Não verificado / dúvidas
- O horário dos commits em `HISTORICO_COMMITS.md` é o gravado no clone de deploy (pode estar em UTC ou Brasília); use só como ordem.
- A tabela de fases resume o §0 do `PROJECT_CONTEXT.md` e o índice gerado; para qualquer detalhe, leia a seção citada.
