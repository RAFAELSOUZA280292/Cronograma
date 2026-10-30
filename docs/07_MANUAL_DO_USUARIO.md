# Manual do usuário do painel PRICETAX
> Atualizado em 2026-10-29. Dono do assunto: Rafael Souza. Endereço do painel: painel.pricetax.com.br. Fonte da verdade: o código; este texto foi escrito lendo os textos reais das telas (botões, avisos, títulos) em `src/`. **Não foi escrito com o painel aberto na frente**: onde só deduzi o comportamento, está marcado "(não verificado na tela)".

## Em uma frase
Este manual ensina a equipe da PRICETAX (e o cliente, na seção 13) a usar o painel, módulo por módulo, com passo a passo.

## Como ler
- **Negrito** = o nome exato de um botão, aba ou aviso na tela.
- "Clique em A → B" = clique em A e, depois, em B.
- Cada módulo tem: para que serve, quem vê, passos mais comuns, o que NÃO dá para fazer, dúvidas frequentes.
- Termos que você não conhece estão no **Glossário** (seção 11). Problemas: seção 12.
- Quem mantém o código encontra o "onde" em `docs/PROJECT_MAP.md` e `docs/gerado/`. Aqui só há o "como usar".

## Índice
1. Para quem é · 2. Entrar e sair · 3. A tela inicial · 4. A barra de cima, busca e atalhos · 5. Quem acessa o quê · 6. Módulos (6.1 a 6.9) · 7. RENATA · 8. Integrações (chaves de API) · 9. Widget do iPhone · 10. Notificações e push · 11. Glossário · 12. Problemas comuns · 13. Para o cliente · 14. Instalar no celular · 15. Não verificado

---

## 1. Para quem é
| Quem | O que costuma usar |
|---|---|
| Sócios e administradores (perfil **PRICETAX Master**) | Tudo, inclusive **Gestão de Usuários** e **Inteligência Operacional** |
| Consultores e equipe (perfil **PRICETAX**) | Empresas, Gestão de Atividades, Agenda, Pareceres, Modelos, Conhecimento, RENATA; CRM e XFlow se liberados |
| Vendedores / comercial | **CRM** (papel Vendedor, Consultor, Gestor Comercial etc.), Agenda, Gestão de Atividades |
| Financeiro | **CRM** com papel Financeiro (lê tudo; painel de Receita e Contas) |
| Dev / produto | **XFlow** (papéis Reporter, Dev, Gestão) |
| Cliente (perfil **Cliente**) | Só as empresas que o Master liberou para ele (seção 13) |

O perfil (Master, PRICETAX, Cliente) e os acessos (Empresas, Gestão de Atividades, XFlow, CRM) são coisas separadas. O Master liga ou desliga cada acesso em **Gestão de Usuários**.

---

## 2. Entrar e sair

### 2.1 Entrar
1. Abra **painel.pricetax.com.br**.
2. Digite **Usuário** e **Senha**. Para ver o que digitou, clique em **Mostrar** (vira **Ocultar**).
3. Clique em **Entrar**. O botão muda para **Entrando...**.
4. Você cai na tela inicial (seção 3). Se tiver acesso a um único módulo, entra direto nele.

A sessão dura 7 dias no mesmo navegador. Se ficar sem entrar por mais que isso, ou se o Master tirar o seu acesso, a tela de login volta.

### 2.2 Primeira vez: boas-vindas
Na primeira entrada aparece **Boas-vindas** em 3 passos. Dá para sair com **Agora não** (a janela não volta).
1. **Conecte a sua agenda**: **Conectar Google Calendar** (ou **Pular este passo**).
2. **Monte o seu dia**: marque o que quer ver na tela inicial → **Continuar**.
3. **Tudo pronto** → **Começar**.
Tudo isso pode ser mudado depois em **Meu perfil** (2.5).

### 2.3 Trocar a senha antes de entrar
1. Na tela de login, clique em **Trocar senha**.
2. Preencha **Usuário**, **Senha atual**, **Nova senha** (mínimo 8 caracteres) e **Confirmar nova senha**.
3. Clique em **Trocar senha e entrar**. Você já entra em seguida.
4. Para desistir: **Voltar para o login**.

### 2.4 Esqueci a senha
O painel **não** manda e-mail de recuperação. Clique em **Esqueci a senha**: a tela explica que um administrador da PRICETAX define uma nova senha para você em **Gestão de Usuários › Redefinir senha**. Entre com ela e troque por uma sua (2.3 ou 2.5).

### 2.5 Meu perfil (abas)
Clique na sua foto/avatar no canto de cima → **Meu perfil**. Abas:
| Aba | Para que serve |
|---|---|
| **Perfil** | Escolher o avatar (grava sozinho) e **Alterar senha** (senha atual, nova, confirmar) |
| **Meu dia** | Escolher o conteúdo da tela inicial (seção 3.2) e informar a data de nascimento (só para signo e horóscopo chinês) |
| **Agenda** | **Conectar Google Calendar** / **Desconectar Google Calendar** |
| **iPhone** | Widgets do iPhone (seção 9) |
| **Privacidade** | Texto de transparência: o que o painel mede sobre o uso, para quê, quem vê, por quanto tempo |
| **Integrações (avançado)** | Chaves de API (seção 8) |

Ao fechar, o painel grava o avatar e o "Meu dia". Se você acabou de gerar uma chave de API e não copiou, ele avisa **Fechar sem copiar o token?** (seção 8).

### 2.6 Sair
Clique na sua foto → **Sair**. Em aparelho de outra pessoa, saia sempre.

### 2.7 Bloqueio e validade do acesso
| O que você vê no login | O que significa | O que fazer |
|---|---|---|
| **Usuário ou senha inválidos.** | Usuário não existe ou senha errada | Confira maiúsculas/minúsculas, use **Mostrar**; se persistir, peça redefinição ao Master |
| **Acesso bloqueado. Fale com um PRICETAX Master.** (ou o motivo escrito pelo Master) | O Master bloqueou | Falar com o Master |
| **Acesso expirado. Fale com um PRICETAX Master para renovar.** | A data de validade do seu acesso passou | O Master usa **Renovar por +30 dias** ou muda a data |
| **Informe usuário e senha.** | Faltou um dos campos | Preencher |

Importante: errar a senha muitas vezes **não bloqueia** a conta sozinho. O que bloqueia é o Master (ou a validade vencida). Cada senha errada fica registrada e o Master vê "N falhas" na lista de usuários.

---

## 3. A tela inicial
É a tela "**Olá, <seu primeiro nome>**". De cima para baixo:

### 3.1 Mensagem do dia
Cartão com o conteúdo que você escolheu: **Evangelho**, **Versículo**, **Sabedoria**, **Horóscopo**, **Chinês**, **Inspiração** (frases de líderes, sempre com a fonte).
1. Para trocar de conteúdo, clique no nome dele na fileira de botões do cartão.
2. **Ler completo** abre o texto inteiro. O botão de compartilhar copia o texto (ou abre o compartilhamento do aparelho).
3. **Personalizar** abre o **Meu perfil › Meu dia**.
4. Se aparecer **Monte o seu dia** → **Escolher agora**: você ainda não escolheu nada.
5. **Falta a sua data de nascimento para este conteúdo.** → **Informar agora** (só Horóscopo e Chinês precisam).
Observações: Horóscopo e Chinês são "só por diversão" (o chinês é texto gerado por IA). O Evangelho vem de uma API comunitária, "não oficial da CNBB": confira antes de citar.
Se você desligar **Quero ver o conteúdo do dia na minha tela inicial**, o cartão some.

### 3.2 Hoje
Painel de pendências com botão de resolver na hora.
- **Atrasadas**, **Vencem hoje**: cada linha vem de uma origem (**Meu quadro**, **Atividade** de empresa, **Tarefa de reunião**) e mostra "Venceu há N dias" ou "Vence hoje". Botões: **Concluir**, **Adiar para amanhã**, **Abrir**. Cada ação mostra um aviso com **Desfazer** por alguns segundos.
- **Reuniões de hoje e amanhã**: **Abrir** leva à reunião.
- **Notificações não lidas**.
- Cada bloco pode ser recolhido (clicando no título); o navegador lembra a escolha. Passando de 8 itens, aparece **Ver todos (N)**.
- **Escolher o que ver** abre as preferências (seção 10) para esconder origens e categorias.
- Sem nada pendente: **Nada atrasado nem vencendo hoje.**

### 3.3 Sua semana
Só aparece para quem tem a Gestão de Atividades. Mostra os últimos 7 dias: **Concluídas**, **Subatividades concluídas**, **Abertas (novas)**, **Atrasadas agora**, **Dia com mais conclusões**. **Ver indicadores** abre os Indicadores do quadro (6.1).

### 3.4 RENATA e agenda
Um cartão da RENATA mostra como está o seu dia e a sua semana a partir do Google Calendar (aceitos, sem resposta, horários livres, choques, almoço). Sem agenda conectada, ele convida: **Conectar minha agenda** ou **Agora não**. Detalhes em 6.3.

### 3.5 Continuar de onde parou
Até 4 atalhos para o que você abriu por último (empresa, atividade, reunião, módulo). Fica guardado só neste navegador.

### 3.6 Os módulos
Cartões agrupados (só aparece o que você pode abrir):
| Grupo | Cartões |
|---|---|
| Trabalho diário | **Gestão de Atividades**, **Agenda**, **XFlow** |
| Clientes | **Empresas**, **Visão Geral**, **CRM** |
| Conhecimento | **Conhecimento**, **Pareceres PRICETAX**, **Modelos de documentos** |
| Administração | **Gestão de Usuários**, **Inteligência Operacional** |

Se você tem **um único** módulo, o painel abre direto nele e não mostra esta tela.

---

## 4. A barra de cima, busca e atalhos
Em todos os módulos a barra de cima tem:
| Item | O que faz |
|---|---|
| **Início** (seta) | Volta à tela inicial (dica: "Voltar à tela inicial") |
| Nome do módulo (**Trocar de módulo**) | Menu para pular para outro módulo |
| **Buscar…** (Ctrl K no Windows, ⌘K no Mac) | Busca global (abaixo) |
| **RENATA** | Abre a assistente (seção 7) |
| Sino | Notificações (seção 10) |
| Sua foto | **Meu perfil**, **Modo escuro** / **Modo claro**, **Sair** |

**Busca global (Ctrl K):**
1. Aperte Ctrl K (ou ⌘K). Digite parte do nome de uma empresa, atividade, reunião, cartão do seu quadro, ou (se tiver CRM, a partir de 2 letras) negócio, empresa ou contato do CRM.
2. Use as setas ↑ ↓ e **Enter** para abrir. **Esc** fecha. **Shift+Enter** favorita o item.
3. Também dá para digitar um comando (só aparecem para quem tem CRM): **Criar negócio**, **Criar atividade**, **Criar empresa**, **Criar contato**, **Abrir a fila de follow-ups**, **Agenda do CRM**, **Negócios do CRM**. Os formulários de criação só abrem para quem pode escrever no CRM.
4. **Falar com a RENATA** aparece como opção; se você digitou algo, vira **Perguntar à RENATA: "…"**.

Outros atalhos: na Gestão de Atividades, a tecla **N** abre **Nova atividade**. **Esc** fecha janelas. **Ctrl+Enter** (ou ⌘+Enter) envia o comentário nas caixas de comentário e conclui o passo na **Fila de follow-ups** do CRM.

Cada módulo tem endereço próprio, que dá para favoritar: `/gestao-atividades`, `/empresas`, `/xflow`, `/agenda`, `/visao-geral`, `/conhecimento`, `/pareceres`, `/modelos`, `/crm`, `/usuarios`, `/inteligencia`. Se você abrir um endereço de um módulo a que não tem acesso, cai na tela inicial com o aviso "Você não tem acesso a essa área do painel…".

---

## 5. Quem acessa o quê

### 5.1 Módulos
| Módulo | Quem vê | Como o acesso é dado |
|---|---|---|
| Gestão de Atividades | Qualquer perfil com o acesso ligado | Caixa **Acesso à Gestão de Atividades** (já vem marcada ao criar usuário) |
| Empresas | Quem tem **Liberar acesso a empresas** | **Todas as empresas** ou **Empresas específicas** (lista por CNPJ) |
| Visão Geral | Quem tem Empresas **e** "Todas as empresas" | Idem acima |
| XFlow | Quem tem papel de XFlow | **Acesso ao XFlow**: Reporter, Dev ou Gestão (Master/Super Admin com papel marcado viram Admin do XFlow) |
| Agenda | Todo mundo que entra | Automático |
| CRM | Master e Super Admin sempre; os demais só com papel de CRM; **Cliente nunca** | **Acesso ao CRM** (campo na edição do usuário) |
| Conhecimento, Pareceres, Modelos | Só perfis Master e PRICETAX (nunca Cliente) | Pelo perfil |
| Gestão de Usuários | Só Master | Pelo perfil |
| Inteligência Operacional | Só Master | Pelo perfil |
| Organizações / trocar de base | Só o Super Admin | Pelo cadastro |

### 5.2 Dentro de uma empresa
| Ação | Master | PRICETAX | Cliente |
|---|---|---|---|
| Ver cronograma, reuniões, tarefas; editar atividades | sim | sim | sim, na empresa liberada (não verificado na tela: o servidor não separa o que o cliente pode editar) |
| Cadastrar empresa | sim | sim | não (o servidor recusa) |
| **Excluir** empresa | sim (Master e Super Admin) | **não** (o servidor recusa e o botão some) | não |
| **Fases**, **Link para o cliente**, **Reservar na agenda**, **Auditoria**, **Log**, **Lixeira** | sim | sim | botões não aparecem |
| **Versões** (ver e comparar, criar ponto) | sim | sim | não |
| **Restaurar** versão, **Empresas excluídas** | sim | não | não |
| Vincular tarefa a atividade, **Dossiê do cliente**, sugestão de parecer | sim | sim | não |
| **Excel** e **PDF** | sim | sim | sim |

### 5.3 Papéis do CRM
| Papel | Ler | Criar/editar | Excluir (empresa, negócio, atividade, **contato**) | Exportar Excel e abrir arquivos do PipeRun | Importar planilha | Produtos | Funis e cadências | Migração PipeRun |
|---|---|---|---|---|---|---|---|---|
| Administrador (Master é automático) | sim | sim | sim | sim | sim | sim | sim | sim |
| Diretor | sim | sim | sim | sim | sim | sim | sim | não |
| Gestor Comercial | sim | sim | sim | sim | sim | sim | sim | não |
| Vendedor | sim | sim | não | não | não | não | não | não |
| Consultor | sim | sim | não | não | não | não | não | não |
| Financeiro | sim | não | não | não | não | não | não | não |
| Visualização | sim | não | não | não | não | não | não | não |

Quem tem CRM vê **todos** os negócios, empresas e contatos da organização (não há restrição por dono). O que muda por papel é o painel que abre primeiro na **Visão geral**: Vendedor e Consultor abrem em **Meu dia**; Gestor, Diretor e Admin em **Time**; Financeiro em **Receita**.

### 5.4 Papéis do XFlow (resumo)
| Papel | Pode |
|---|---|
| Reporter | Abrir TASK, comentar, vincular TASKs, reordenar; editar (nas fases iniciais), anexar, fechar sem desenvolver, aprovar/reprovar a validação, reabrir e excluir **só as que ele abriu** |
| Dev | Triar, editar qualquer TASK, mudar severidade e prioridade, bloquear/desbloquear, pausar/retomar, fechar sem desenvolver, excluir (vai para a Lixeira); assumir para si; avançar, enviar para validação e publicar **as TASKs atribuídas a ele** |
| Gestão | Tudo do Dev em qualquer TASK, mais redirecionar para outra pessoa, homologar, decidir como gerência, aprovar/reprovar/reabrir qualquer TASK, arquivar, desarquivar e restaurar da Lixeira |
| Admin | Tudo, mais **Apagar de vez** e ajustar os prazos de SLA |
Todos que têm XFlow **veem** todas as TASKs da organização; o que muda por papel é o que cada um pode fazer.

---

## 6. Módulo por módulo

### 6.1 Gestão de Atividades (quadro pessoal)
**Para que serve:** o seu quadro de tarefas (estilo Kanban), separado das empresas. Cada pessoa tem o seu.
**Quem vê:** quem tem a caixa **Acesso à Gestão de Atividades**. Endereço: `/gestao-atividades`.

**Passos mais comuns**
1. **Criar uma atividade rápido:** aperte **N** (ou use o campo da coluna: **Digite o nome da atividade...**) → escreva **O que precisa ser feito?** → escolha a **Coluna** → **Criar** (ou Enter).
2. **Abrir uma atividade:** clique no cartão. No detalhe: **Status** (Não iniciada, Em andamento, Pausada, Concluída), **Prioridade** (Urgente, Alta, Média, Baixa), **Prazo**, **Aguardando** (para marcar que depende de alguém, sem mudar o status), **Responsáveis**, **Tags**, **Descrição**, **Checklist** (cada item pode ter prazo e responsável), **Comentários** e **Histórico**.
3. **Mover para outra coluna:** arraste o cartão; ou abra o cartão e use o seletor ao lado do nome da coluna; ou use o menu do cartão (**Mais ações**) → **Mover para...**. No celular, **segure o cartão por cerca de meio segundo** antes de arrastar.
4. **Concluir ou pausar:** mudar o status para **Concluída** ou **Pausada** manda o cartão para o **fim da coluna**. As concluídas são arquivadas sozinhas uma vez por semana e vão para **Concluídas** (botão no alto).
5. **Excluir:** menu do cartão → **Excluir**. Vai para a **Lixeira** (botão no alto); lá use **Restaurar** ou **Excluir definitivamente**. O aviso de exclusão tem **Desfazer** por alguns segundos.
6. **Colunas:** menu da coluna (**Adicionar atividade**, **Renomear**, **Alterar cor**, **Ordenar**, mover para esquerda/direita, **Duplicar coluna**, **Copiar link da coluna**, **Excluir coluna**). **Nova coluna** fica no fim. **Nova página** cria outra página (aba) de quadro.
7. **Filtros e busca:** **Buscar...** (acha também subatividades do checklist e comentários), **Filtros** (status, prioridade, prazo), **Visões rápidas** (Atrasadas, Urgentes, Aguardando, Em andamento, Hoje). Cada filtro ligado aparece em **Filtros ativos:** com **Limpar tudo**. Colunas dizem quantas ficaram escondidas pelo filtro.
8. **Ver como lista:** botões **Quadro** / **Lista**. **Ordenar atividades**: **Ordem manual** ou outro critério (arrastar só funciona em "Ordem manual", e em Prioridade as pausadas ficam depois das ativas).
9. **Daily:** botão **Daily** monta uma lista por responsável, com a atividade principal e as subatividades, para reunião diária. Filtros de atividade e de prazo; **Copiar texto**, **PDF**, **Excel**.
10. **Foco:** botão **Foco** (ao lado de **Daily**) ou o endereço `/foco` — tela cheia para deixar aberta numa segunda tela ou no iPad. Três colunas: **Agora** (o que está em andamento, com o próximo passo de cada uma; mostra 3 e avisa se há mais), **Próximos** (o que vence no dia, com botão **Começar** que traz para Agora) e **Atenção** (atrasadas e as marcadas como "Aguardando"). Filtros no alto: **Dia** (Hoje, Amanhã, Semana e as setas), **Pessoa** (**Eu** é o responsável com o seu nome; ou Todos) e **Quadro** (páginas do seu quadro). Toque no círculo de um passo para concluí-lo, no título para abrir a atividade, em **Concluir** numa atividade sem passos. Em telas largas aparece a coluna **Feito hoje**. O último filtro de pessoa e quadro fica lembrado no aparelho. Atividades sem prazo e fora de andamento não aparecem (use **Começar** ou ponha um prazo). Esc ou o X sai. A tela tenta manter o aparelho acordado (aparece "tela acesa"; se o navegador não permitir, "tela pode apagar").
11. **Versões:** botão **Versões** (no celular, menu ⋯ → **Versões do quadro**). O sistema guarda uma cópia do seu quadro a cada 10 minutos de edição e sempre que ele encolhe de repente (30 dias, as 40 mais recentes). **Abrir** uma cópia mostra os cartões que estavam lá e já não estão no quadro: **Recuperar** (um, ou **Recuperar todos**) devolve para a coluna de origem; **Restaurar quadro inteiro** troca tudo pela cópia — o quadro de agora fica guardado como "Antes de uma restauração".
12. **Indicadores:** botão **Indicadores** (**Meus indicadores**): atividades abertas e encerradas por dia, dia da semana e horário com mais aberturas e encerramentos, "ritmo de encerramento"; períodos **30 dias**, **90 dias**, **Tudo**.
13. **Painel de apoio** sob o cabeçalho: **Resumo do dia**, **Calendário** (prazos e compromissos), **Anotações rápidas** e **Links e atalhos** (sites que você usa todo dia).

**Compartilhar (links públicos)**
1. Botão **Compartilhar** (página inteira) ou menu da coluna → **Compartilhar coluna** (só aquela coluna; depois fica **Compartilhamento da coluna**).
2. Escolha **Privado — só você pode ver e editar** ou **Público por link — qualquer pessoa com o link pode ver**.
3. Copie o link com **Copiar link**. Quem **não** estiver logado só visualiza. Quem **estiver logado** no painel pode colaborar, e cada ação fica no **Histórico**.
4. Em **Quem abrir o link poderá voltar para** escolha o quadro de volta (esse destino também passa a ser público).
5. **Gerar novo link** derruba o anterior na hora.
6. Quem recebe o link de outra pessoa e tem a Gestão de Atividades vê **Adicionar ao meu quadro** (vira uma aba sua, nos dois sentidos) ou **Abrir no meu quadro**.

**O que NÃO dá para fazer**
- Colocar o cartão em empresa nem em reunião (é um quadro pessoal).
- Marcar @menção nos comentários (só texto, links e anexos de até 3 arquivos de 2 MB).
- Editar quando abriu pelo link público sem estar logado (aparece **Somente visualização**).

**Dúvidas frequentes**
- *Sumiu um cartão.* Olhe **Filtros ativos** (use **Limpar tudo**), a **Lixeira** e **Concluídas**.
- *Abri o quadro em duas abas e o texto "voltou".* O quadro é gravado inteiro; se outra aba gravou antes, o painel avisa o conflito e junta as duas versões. Evite deixar duas abas do mesmo quadro abertas.
- *Parou de salvar.* Veja o selo **Salvando… / Salvo às HH:MM / Sem conexão — tentando salvar de novo…** (seção 12).

### 6.2 Empresas (cronograma, reuniões, tarefas)
**Para que serve:** o cronograma de reforma tributária de cada empresa cliente, com atividades, subatividades, reuniões e tarefas de reunião. Endereço: `/empresas`.
**Quem vê:** quem tem **Liberar acesso a empresas** (todas ou as liberadas por CNPJ).

#### 6.2.1 Tela de escolha das empresas
Título **Quais empresas você quer acompanhar?**
1. Clique no **nome ou logotipo** da empresa para entrar direto nela. Para ver várias juntas, marque as caixinhas e clique em **Continuar (N selecionadas)**. Depois, **Trocar empresas** volta aqui.
2. Por padrão você vê **Minhas empresas** (onde você é responsável). Use **Por responsável** (chips com o número de empresas de cada pessoa, **Todos**, **Sem responsável**) e **Situação das empresas**: **Em andamento**, **Pausadas e arquivadas**, **Todas**. Há filtros de tipo de cliente e regime, e **Buscar por nome ou CNPJ...** (aparece com mais de 6 empresas).
3. Cada cartão mostra a barra de progresso (**N/M atividades**) e a **Próxima atividade**. Ícones do cartão: pausar/retomar, **Clonar atividades para uma nova empresa**, **Editar empresa**, **Excluir empresa**.
4. **Pausar** arquiva a empresa (some da lista principal, volta em "Pausadas e arquivadas") e pausa as atividades em andamento. **Retomar** reativa as pausadas.
5. **Ver cronograma padrão** (só Master e PRICETAX): abre o modelo que as empresas novas seguem (6.2.9).

#### 6.2.2 Cadastrar empresa
Só Master e PRICETAX. Botão **Cadastrar nova empresa** (ou **Cadastrar empresa** no cabeçalho).
1. Escolha o **Tipo de estrutura**: **Empresa Individual** ou **Grupo Empresarial** (um CNPJ master com várias empresas vinculadas).
2. Digite o **CNPJ** → **Buscar dados**. O painel traz da Receita: razão social, nome fantasia, regime, porte, CNAEs e sócios.
3. Confira **Razão social** e **Nome fantasia**. Escolha o **Tipo de cliente** (**Diagnóstico**, **Diagnóstico e Consultoria Contínua**, **POC / Demonstração**). Sem tipo, o botão não avança: **Selecione o tipo de cliente antes de continuar.**
4. Informe **Início do projeto (assinatura do contrato)**: o dia D+0; todas as datas do cronograma contam a partir dele, seguindo o cronograma padrão mais recente. O painel mostra se algum prazo ficará comprimido ou já nasce vencido (**Ver quais**).
5. Escolha cor e logotipo (opcional) → **Criar empresa** (ou **Criar grupo**).
6. Em grupo: preencha **Nome do grupo** e adicione as filiais (**Adicionar empresa**). Empresa avulsa pode ser vinculada a um grupo existente em **Vincular a um grupo existente (opcional)**.
7. **Clonar empresa** copia as atividades de outra; a primeira passa a começar 10 dias depois de hoje.
Se um Master/PRICETAX tem "empresas específicas", a empresa criada é liberada para ele automaticamente.

#### 6.2.3 As abas da empresa
| Aba | O que mostra |
|---|---|
| **Resumo** | Totais, pausadas, próximos 7 dias, próxima atividade, progresso geral; filtros por responsável, fase, status, mês |
| **Reuniões** | Reuniões programadas e realizadas (6.2.6) |
| **Tarefas** | Tarefas que saíram das reuniões (6.2.7) |
| **Gantt** | Barras no calendário; clique abre a atividade, **arrastar a barra reagenda** |
| **Tabela** | Uma linha por atividade, com edição na linha (fase, prioridade, prazo, horário), **Abrir em tela cheia**, **Mais ações** |
| **Fases** | Atividades agrupadas por fase, numeradas; o status pode ser avançado direto na linha (não verificado na tela como clicar) |
| **Quadro** | Colunas por status (Não iniciado, Em andamento, Pausado, Concluído); arraste o cartão para mudar o status |
| **Mapa** | Mapa mental só de leitura (empresa → grupos → atividades → subatividades), com zoom, filtros e tela cheia |
| **Triagem** | Para cada atividade e subatividade, escolher **Reunião** ou **Trabalho** e a data (lista ou calendário) |
Resumo, Reuniões, Tarefas, Mapa e Triagem só existem com **uma** empresa aberta. No canto da aba há a **busca da tela** (filtra a aba aberta).
Botões do alto: **Nova atividade**, **Excel**, **PDF** (abre **Exportar PDF**: tema escuro ou claro, orientação, o que entra), e (só equipe) **Fases**, **Link para o cliente**, **Reservar na agenda**, **Auditoria**, **Log**, **Versões**, **Lixeira**. No celular ficam no menu **Mais**. **Empresa** abre os dados e a equipe da empresa; **Abrir no CRM** leva à ficha no CRM.

#### 6.2.4 Atividades e subatividades
1. **Nova atividade** → a atividade abre. Escreva o título, escolha **Fase**, **Responsável**, **Participantes**, **Prioridade**, **Início**, **Prazo (dias)** (o **Fim** é calculado) ou digite o **Fim**.
2. **Tipo**: **Trabalho (execução)** ou **Reunião (call)**. Só reunião vai para **Reservar na agenda** e só pode haver uma reunião por dia na empresa.
3. **Data confirmada com o cliente?** e **Obrigatória** são caixas de marcar. **Travar a data (ajuste automático)** impede que a data se mova sozinha (6.2.8).
4. **Subatividade**: botão **+ Subatividade**; cada uma tem título, responsável, prazo, tipo (Trabalho/Reunião). Dá para reordenar (arrastar, subir, descer, topo). **Pauta da reunião** liga itens de trabalho a uma reunião (a data acompanha a da reunião).
5. **Anexos e links**: **Anexos e links** → adicionar arquivo (até 8 MB cada; arraste ou cole um print com Ctrl+V) ou **Adicionar link**.
6. **Comentários**: escreva, use @ para mencionar alguém da equipe (a pessoa recebe notificação), anexe e **Comentar**. Você edita e apaga os seus; o Master modera todos.
7. **Histórico desta atividade** lista quem mudou o quê. As alterações gravam sozinhas; o selo mostra **Salvo**.
8. **Excluir atividade** vai para a **Lixeira** da empresa (só equipe vê o botão **Lixeira**); dá para restaurar de lá.
9. Sair com algo não gravado abre **Você tem alterações não salvas** (**Salvar e sair**, **Sair sem salvar**, **Continuar editando**).

#### 6.2.5 Empresa: dados, equipe, grupo
Botão **Empresa** (**Empresa e equipe**): logotipo, cor, razão social, nome fantasia, tipo de cliente, CNPJ (alterar não muda sozinho quem já tinha acesso), **Status da empresa** (**Ativo** / **Pausado**, com **Previsão de retomada**), dados da Receita, **Áreas e responsáveis do cliente** (a equipe: cada pessoa pode ser só um nome/área, sem login, ou estar vinculada a um usuário do sistema).
**Grupo empresarial:** em **Editar empresa** (tela de escolha) há **Transformar em Grupo (Master)**, ou vincular como filial de um grupo existente. Atividade de grupo tem **Empresas envolvidas** (tudo desmarcado = **Geral do Grupo**). Para **desvincular**, a empresa não pode ter atividade aberta do grupo que a envolva; o painel avisa quais.
**Responsáveis por empresa:** em **Editar empresa** escolha os responsáveis (um é o principal). É isso que alimenta "Minhas empresas".

#### 6.2.6 Reuniões e tarefas de reunião
1. Aba **Reuniões** → **Nova reunião** (título e data) ou **Enviar transcrição**: cole o texto, informe data/horário se souber → **Enviar**. A RENATA lê e preenche participantes, resumo, decisões e tarefas. Acompanhe em **Transcrições enviadas** (**Na fila**, **Processando…**, **Concluída**, **Falhou**; **Tentar novamente**).
2. Abra a reunião: **Resumo executivo**, **Decisões tomadas**, **Participantes** (inclui externos), **Tarefas geradas pela IA**, **Transcrição completa** (abas **Completa**, **Por temas**, **Highlights**; **Buscar na transcrição**). Resumo e decisões editam em **Escrever**.
3. **Compartilhar**: **Privado** ou **Público por link** (só leitura: resumo, decisões, transcrição e tarefas). **Gerar novo link (invalida o anterior)**. **Exportar**: **PDF** ou **Texto (.txt)**.
4. **Excluir reunião** vai para **Lixeira de reuniões** (**Restaurar reunião**).
5. **Atualizar memória da RENATA** faz a RENATA reler todas as reuniões da empresa (use se ela disser que não acha o conteúdo de uma reunião que existe).
6. **Dossiê do cliente** (só equipe): a RENATA monta um compilado de todas as reuniões (resumo, linha do tempo, frentes, decisões, pendências, pessoas, riscos, lacunas). Leva alguns minutos e continua em segundo plano; **Baixar .md**, **PDF / Imprimir** (claro ou escuro). É gerado por IA a partir só das reuniões do sistema: confira nas reuniões de origem.
7. Aba **Tarefas**: **Nova tarefa** (exige uma reunião existente: **Crie uma reunião primeiro, na aba Reuniões.**). Atalhos de visão: **Minha fila**, **Todos**, **Hoje**, **Próximos 7 dias**; filtros por lado (**Cliente** / **PRICETAX**), tipo, reunião, atividade do cronograma; **Agrupar tarefas**, **Buscar tarefas**, **Exportar Excel**. A tarefa abre num painel com título, lado responsável, responsável, **Data de vencimento**, subtarefas, comentários, arquivos e histórico. Tarefa pode ser de tipo tarefa, decisão, risco ou pendência.

#### 6.2.7 Vínculo tarefa → atividade (só equipe)
Cada tarefa de reunião pode ser ligada a uma atividade do cronograma.
1. No painel da tarefa, **Atividade do cronograma** → **Vincular atividade…** e escolha.
2. A RENATA também sugere. Selo **Automática, a validar**: clique em **Validar** (ou **Trocar**, ou desvincular). Chip **Sugerido…**: **Confirmar**, **Trocar**, **Nenhuma atividade se aplica**.
3. **Validar vinculações** / **Confirmar todas** valida de uma vez as de alta confiança.
4. **Vincular / sugerir atividades** (botão na aba Tarefas): **Vincular automaticamente** ou **Só sugerir**; **Zerar vínculos** limpa os vínculos (o cronograma não muda; dá para desfazer logo em seguida).
5. Só vínculo **validado** propaga a conclusão: concluir a atividade conclui as tarefas validadas dela, e concluir todas as tarefas (sem subatividade aberta) conclui a atividade.
6. No detalhe da atividade, **Tarefas de reunião (N · M abertas)** mostra as ligadas. Se o prazo da tarefa passa do fim da atividade, aparece **Vence depois do fim da atividade** (só aviso; nada muda sozinho).

#### 6.2.8 Datas automáticas
Acima das abas de atividades há **Ajustar datas automaticamente** (começa **desligado**, vale por empresa e por navegador). Ligado, mudar o início de uma atividade (ou o prazo de uma subatividade) move tudo o que vem do mesmo dia em diante, pelo mesmo número de dias. Não movem: concluídas, itens com data travada e subatividades de data fixa. Cada ajuste mostra um aviso com **Desfazer**. Veja **Como funciona** na própria caixa.

#### 6.2.9 Versões, restauração e empresa excluída
**Versão** = o estado do cronograma (atividades, subatividades, fases, equipe) **antes** de uma alteração. O painel guarda sozinho; reuniões, tarefas e dados da empresa ficam de fora.
1. Botão **Versões** (**Histórico de versões**), só Master e PRICETAX. A lista mostra **Automática**, **Ponto criado**, **Backup**, com quem fez e o que mudou.
2. **Criar ponto agora**: dê um nome em **Nome do ponto de restauração** (ex.: "Antes de reorganizar a fase 2").
3. **Comparar com o atual** (ou escolha **De (antes)** e **Para (depois)**): mostra atividade por atividade, com o antes e o depois.
4. **Restaurar…** (só **Master**): escolha **Cronograma inteiro** ou **Só as atividades marcadas**, veja a prévia ("Nada foi alterado ainda") e confirme com **Restaurar agora**. Antes, o estado atual é salvo como backup, e o aviso tem **Desfazer**. O que foi criado depois vai para a lixeira (não é apagado); comentários e anexos de hoje ficam.
5. **Empresa excluída por engano:** **Empresas excluídas** (só Master) → **Recriar empresa…**. A cópia é guardada por 1 ano. Links públicos, dossiês e reservas de agenda precisam ser refeitos. (A janela de exclusão diz "Não dá para desfazer", mas o Master consegue recriar por aqui.)

#### 6.2.10 Link de acompanhamento para o cliente
Botão **Link para o cliente** (só Master e PRICETAX).
1. Escolha a **Validade** → **Gerar link**. **Copiar** e envie a quem deve ver.
2. A página abre **sem login**, só leitura: Resumo, Cronograma e Tabela com atividades, subatividades, datas, status e responsáveis, mais **Prazos legais**. **Não** mostra notas, comentários, anexos, descrições, reuniões nem o log.
3. **Gerar novo link** derruba o anterior; **Desativar link** encerra. Link vencido: **Este link venceu e não abre mais. Gere um novo.**
4. **Link de dados (Power BI e outros)**: endereços CSV e JSON para Power BI (Obter dados → Web), Excel, Make, Zapier. Também só leitura e sem login; é um link à parte.

#### 6.2.11 Reservar na agenda
Botão **Reservar na agenda**: cria blocos no Google Calendar da conta @pricetax para as atividades do tipo **Reunião**. Primeiro **Conectar Google Calendar** (a conta certa). Informe **E-mails da equipe** e **Duração de cada bloco**, ajuste **Dia do bloco** e **Início** → **Reservar** (**Enviar convites** avisa por e-mail). Se mudar uma data no cronograma, abra de novo: aparece **Mudou: atualizar**. **Distribuir dias** resolve dias com mais de uma reunião. **Cancelar todas as reservas** apaga os blocos.

**O que NÃO dá para fazer**
- Cliente cadastrar ou excluir empresa, ver Versões, gerar link ou editar Fases (botões ocultos).
- Alterar o CNPJ no cadastro (campo "não editável aqui" na tela de escolha).
- A busca da aba **Triagem** não filtra nada (a caixa aparece, mas não age) (não verificado na tela; consta na documentação interna).
- A busca da tela não afeta o **Excel**, o **PDF** nem o link público (saem com a empresa inteira).

**Dúvidas frequentes**
- *Data mudou sozinha.* Veja **Ajustar datas automaticamente** (6.2.8); use **Desfazer** ou **Travar a data**.
- *Atividade sumiu.* **Lixeira** da empresa; ou **Versões**.
- *Reunião não apareceu depois de enviar a transcrição.* Veja **Transcrições enviadas**: se está **Processando…** há mais de 90 s, aparece **Tentar novamente**.

### 6.3 Agenda
**Para que serve:** ver os seus compromissos do Google Calendar junto com TASKs do XFlow, atividades da PRICETAX e atividades do CRM. Endereço: `/agenda`. **Quem vê:** todos.
1. **Conectar:** se aparecer **Seu Google Calendar ainda não está conectado** → **Conectar Google Calendar** (ou em **Meu perfil › Agenda**). Escolha a conta do Google certa.
2. Escolha **Dia**, **Semana** ou **Mês**; setas e **Hoje** navegam. No celular o dia tem **Lista** ou **Horários**.
3. Clique no compromisso para abrir: local, convidados, **Abrir no Google Calendar**. Convite seu tem **Aceitar**, **Talvez**, **Recusar** (responde no Google).
4. **Novo compromisso**: título, data, hora de início, duração (5 min a 12 h; **Outra duração…**), local ou link de videochamada, **Convidados** (e-mails; até o limite da tela). **Criar compromisso**.
5. **Ocultar recusados** deixa a grade só com o que você aceitou ou ainda não respondeu (recusados aparecem riscados). **Ocultar detalhes** troca os títulos por "Ocupado", para mostrar disponibilidade sem expor com quem/sobre o quê.
6. A RENATA da tela inicial e da Agenda conta como "livre" o tempo sem reunião **aceita** dentro do seu expediente. **Expediente e almoço** (horário de trabalho e pausa) ficam salvos **neste navegador**.
**Não dá para:** editar ou excluir compromisso existente por aqui (use o Google); ver a agenda de outra pessoa.
**Dúvida:** *Agenda vazia.* Conecte o Google ou use as setas; **Não consegui carregar a agenda** pede **Tentar de novo** ou **Reconectar**.

### 6.4 XFlow (TASKs de BUG e melhoria dos produtos internos)
**Para que serve:** do relato ao fim de um BUG ou melhoria dos produtos da PRICETAX, com responsável, prazo e validação. Endereço: `/xflow`. **Quem vê:** quem tem papel de XFlow (5.4).
1. **Nova TASK** → escolha **BUG** ou **Melhoria**; **Título**, **Produto / Plataforma**, **Tipo de cliente**, **O que aconteceu**, **Impacto**, **Resultado esperado**, **Passo a passo para reproduzir**, **Ambiente** (Produção, Homologação, Desenvolvimento), **Frequência**, **Prioridade sugerida**. Cole um print na descrição com **Ctrl+V**; para outros arquivos use **Anexar** (**Evidências**).
2. Visões: **Quadro** (colunas por situação), **Lista**, **Arquivados**, **Lixeira** (só gestão). No quadro, arrastar a TASK para uma coluna executa a ação correspondente (às vezes pede um motivo). **Ordenar por**; **Ordem manual** permite arrastar dentro da coluna.
3. Filtros: status, produto, severidade (S1 Crítico a S4 Baixo), prioridade, responsável, SLA (**SLA vencido**, **próximo de vencer**, **Dentro do SLA**), idade. Atalhos: **Aguardando sua ação**, **Voltaram para você**, **Bloqueados**.
4. Ao abrir a TASK: **Quem está com a bola** diz quem precisa agir. Ações conforme o papel: **Aceitar TASK**, **Solicitar mais informações**, **Não consegui reproduzir**, **Marcar como duplicado**, **Redirecionar**, **Iniciar desenvolvimento**, **Enviar para revisão**, **Marcar pronta para teste**, **Enviar para homologação**, **Aprovar** / **Reprovar** (motivo obrigatório), **Publicar**, **Enviar para validação do solicitante**, **Bloquear** / **Desbloquear**, **Pausar** / **Retomar**, **Fechar sem desenvolver**, **Reabrir TASK**, **Arquivar**.
5. **Comentários** (use @ para mencionar; cole print), **TASKs vinculadas** (**Vincular TASK**), **Copiar link da TASK**, **Histórico**.
6. A **Previsão de conclusão** de uma TASK sua vira evento no seu Google Calendar, se você conectou (Meu perfil › Agenda).
**Não dá para:** DEV concluir sozinho (a TASK espera a validação de quem abriu); **Reporter** editar TASK dos outros; **Apagar de vez** (só Admin).
**Dúvida:** *Botão cinza.* Falta preencher um campo obrigatório; o formulário diz qual.

### 6.5 CRM
**Para que serve:** empresas (contas), contatos, negócios em funis, atividades de venda, produtos e cadências. Endereço: `/crm`. **Quem vê:** 5.3. Menu do CRM à esquerda: **Visão geral**, **Agenda**, **Negócios**, **Empresas**, **Contatos**, **Produtos**. No alto: busca do CRM e **Criar atividade / negócio / empresa / contato** (só quem escreve).

**Passos mais comuns**
1. **Cadastrar um lead novo:** **Criar negócio** → digite o nome ou CNPJ da empresa (**Escolher ...**); se não achar, **Cadastrar como lead novo** cria empresa + contato (com telefone) + negócio de uma vez. O painel avisa se já existe empresa parecida (**Usar esta** ou **É outra empresa — criar mesmo assim**) ou CNPJ já cadastrado (**Usar esta empresa**).
2. **Preencher o negócio:** **Funil**, **Tipo** (**Novo negócio** ou **Upsell**), **Responsável**, **Produtos e valor** (o valor é a soma dos produtos; sem produto, digite **Valor do negócio (R$)**), **MRR** (receita recorrente mensal), **Previsão de fechamento**, **Probabilidade manual (%)** (vazio = a da etapa), **Contato principal**, **Origem**, **Descrição**.
3. **Mover de etapa:** na aba **Negócios** em **Quadro**, arraste o cartão; no celular use **Mover para…**; na **Lista**, o seletor da coluna **Etapa**. O aviso tem **Desfazer**.
4. **Ficha do negócio** (clique no cartão): **Etapas do funil**, **Ganhar**, **Perder**, **Próximos passos** (**Criar atividade**), **Produtos**, **Notas** (**Nova nota sobre o negócio**), **Percurso no funil**, **Linha do tempo** (toda alteração, com quem fez e o valor anterior; não pode ser apagada). **Copiar link** copia um endereço que só abre para quem tem login e senha. **Número do contato:** ao lado do telefone e do **WhatsApp** (ficha do negócio, próximos passos, fila de follow-up, listas) há um botão azul **Copiar número**: copia só os dígitos com DDD e sem +55 (ex.: 47991130619), pronto para colar num grupo ou numa conversa. O botão vira **Copiado** por 2 segundos.
5. **Ganhar ou perder:** **Ganhar** marca com a data de hoje (a empresa vira **Cliente**; pode criar uma cópia em outro funil, se houver automação). **Perder** **exige o motivo** (**Motivo da perda ***).
6. **Rotina do dia:** **Agenda** (do CRM) lista atividades por urgência com filtros **Atrasadas / Hoje / Próximos 7 dias / Mais adiante / Concluídas**. **Fila de follow-ups (N)** abre uma atividade por vez, da mais atrasada: ligar ou WhatsApp pelo botão do contato, últimas anotações, **Como foi? (resultado — opcional)**, **Concluir e próximo**, **Adiar** (**Amanhã**, **3 dias**, **1 semana**), **Pular**, **Abrir negócio**.
7. **Editar na lista:** na **Lista**, etapa, valor e previsão editam direto; o aviso tem **Desfazer**.
8. **Visões salvas:** com os filtros na tela, **Salvar visão** (nome, por exemplo "Minha carteira"). No menu da visão: **Atualizar com os filtros da tela**, **Renomear**, **Excluir**, abrir por padrão; **Compartilhar com o time** (só Gestor/Diretor/Admin).
9. **Exportar** (só Gestor, Diretor e Admin; para os outros o botão não aparece): **Exportar Excel** (em Negócios, Quadro ou Lista) baixa os negócios **com os filtros da tela**, com e-mail, telefone e link do WhatsApp. No quadro, só os em aberto.
10. **Visão geral:** painéis **Meu dia**, **Time**, **Receita**, **Contas** (os que seu papel permite). **Usar como início** define o que abre primeiro. **Trazer para o CRM** importa clientes do cronograma como empresas **Cliente**.

**Empresas, contatos, produtos**
- **Empresas** (**Criar empresa**): busca, filtros de relação, responsável, regime, UF, **Ver excluídas**. A **ficha da empresa** tem contatos (**Mapa de stakeholders**), atividades, negócios, projetos do painel ligados (**Abrir no cronograma**, **Vincular projeto existente**), **Criar oportunidade de upsell**, notas e linha do tempo.
- **Contatos** (**Criar contato**): o **Papel na decisão** e a **Influência** importam na venda B2B.
- **Produtos** (**Criar produto**, só Gestor/Diretor/Admin): nome, categoria, preço de tabela, cobrança, situação. Preferir desativar a excluir.
- **Funis** (botão em Negócios, só Gestor/Diretor/Admin): **Novo funil**, etapas (**Chance %**, **Prazo (dias)**), **Definir como padrão**, **Arquivar funil** (só sem negócios), **Automação ao ganhar**. **Cadência de follow-up**: passos automáticos por etapa (título, tipo, dias). Os dias do 1º passo contam da entrada na etapa; os seguintes, da conclusão do anterior. Só vale para negócios que **entrarem** na etapa depois de criada.

**Importar e migrar**
- **Importar planilha** (Empresas) e **Importar negócios**: **1. Arquivo → 2. Colunas → 3. Conferir → 4. Resultado**. Nada é gravado antes da conferência; empresas com CNPJ já cadastrado são puladas. Linhas de fora podem ser baixadas com **Baixar a lista**. Só Gestor/Diretor/Admin.
- **Migrar do PipeRun**: só Administrador do CRM (Master, Super Admin ou papel Administrador).

**O que NÃO dá para fazer**
- Excluir (só Gestor, Diretor, Admin). Vendedor/Consultor cancelam a atividade, mas não excluem.
- Cliente nunca acessa.
- Dar notas ao negócio perdido sem motivo: o botão **Perder** não grava sem motivo.

**Dúvida:** *Arrastei o negócio e não mudou.* O quadro agora acompanha na hora; se aparecer **Sem conexão com o servidor — tentando mover de novo…**, aguarde.

### 6.6 Conhecimento, Pareceres e Modelos
Só Master e PRICETAX. Endereços: `/conhecimento`, `/pareceres`, `/modelos`.

**Pareceres PRICETAX** (documentos técnicos em PDF)
1. **Novo Parecer** → **Identificação do arquivo ***, **Comentário / contexto (opcional)**, **Este parecer é** (**Geral** ou **Cliente específico**, com o nome do cliente), **Arquivo PDF *** (até 10 MB) → enviar.
2. Procure em **Buscar pareceres** e pelos filtros (**Todos**, **Geral**, por cliente). Clique para abrir, ler, comentar, editar título, descrição e escopo.
3. A RENATA estuda os pareceres sozinha ao serem enviados. O aviso **A RENATA estudar os pareceres pendentes?** → **Estudar agora**. Só parecer novo ou alterado gasta IA.
4. **Excluir parecer** (só Master; o botão não aparece para os outros) pede confirmação. Comentário: você só apaga o seu (o Master apaga todos).

**Modelos de documentos** (contratos, propostas, planilhas)
1. **Novo modelo** → título (opcional; se vazio, usa o nome do primeiro anexo), **Categoria**, **Para que serve**, e **Arquivos** (arraste ou clique; vários) e **Links** (até 12 anexos por modelo). Para links o painel busca título e imagem; páginas com login (Google Drive, SharePoint) mostram só o domínio.
2. Abra para pré-visualizar (**Abrir**, **Baixar**, **Atualizar prévia**). Arquivos do Office não abrem dentro do painel: baixe. Arquivos de até 30 MB.
3. Comentários e menções funcionam como em Pareceres.

**Conhecimento (a memória da RENATA)** abas: **Visão Geral** (conhecimento ativo, aprendido na semana, o que precisa da sua atenção, respostas reaproveitadas), **Biblioteca**, **Memórias**, **Conflitos**, **Pessoas**, **Empresas**, **Tarefas × atividades**, **Métricas**.
- **Biblioteca**: **Ensinar a RENATA** → **Arquivo** (escolher) ou **Colar texto** (mínimo 200 caracteres) → título, tema, etiquetas, **Como a RENATA deve usar este material** → **Enviar e estudar**. A RENATA estuda em segundos a poucos minutos; depois mostra resumo, pontos-chave, antes × depois da reforma, perguntas e respostas, base legal e limites.
- **Memórias**: pesquise e filtre o que ela sabe. **Conflitos**: quando duas informações se contradizem, escolha **Manter A**, **Manter B**, **É uma atualização**, **Manter as duas** ou **Arquivar as duas**.
**Não dá para:** cliente ver nada disso; o Master apagar conhecimento sem passar pelas telas acima.

### 6.7 Visão Geral (empresas lado a lado)
**Para que serve:** entregas e reuniões de **todas** as empresas, por data. Endereço: `/visao-geral`. **Quem vê:** quem tem Empresas **e** "Todas as empresas".
- Abas: **Por data** (**Atrasadas**, **Semana atual**, **Próxima semana**, **Próximos 30 dias**, **Sem data**, **Pausadas**; filtros de empresa, responsável, situação, prioridade), **Levantamento** (todas as atividades e tarefas agrupadas por fase, responsável, área ou empresa; **Qualidade dos dados**: o que está sem responsável, sem prazo, nomes a conciliar; **Baixar planilha**), **Lacunas** (atividades-padrão que faltam num cronograma; **Criar atividades**), **Padrão** (aplicar o padrão aprimorado nas empresas existentes; só administradores aplicam, os demais veem a prévia).
- **Atualizar** recarrega. Os atalhos de empresa abrem o cronograma dela.

### 6.8 Gestão de Usuários (só Master)
Endereço `/usuarios`. Cartões **Total**, **Ativos**, **Bloqueados**, **Admins**; filtros por busca, perfil e status; colunas **Licença até**, **Último acesso**, **Acessos** (e dias, e falhas de senha em 30 dias).
1. **Novo usuário**: **Nome**, **Usuário (login)**, **Perfil** (**Master**, **PRICETAX**, **Cliente**), **Senha inicial**, avatar (opcional), **Acesso à Empresas** (**Todas as empresas** ou **Empresas específicas**), **Acesso à Gestão de Atividades**, **Acesso ao XFlow** (**Sem acesso**, **Reporter**, **Dev**, **Gestão**) → **Criar usuário**. Erros: **Usuário já existe.** ou **Preencha o nome, o usuário (login) e a senha inicial.**
2. **Editar** (clique na linha, ou o lápis): o nome, usuário e e-mail gravam ao sair do campo; **Perfil**, as caixas de acesso e as listas gravam assim que você muda. Não há botão **Salvar**. **Acesso ao CRM** (Administrador, Diretor, Gestor Comercial, Vendedor, Consultor, Financeiro, Visualização). Para Master é automático; para Cliente é sempre "sem acesso".
3. **Bloquear**: caixa **Bloqueado** (com **Motivo do bloqueio**) ou o cadeado da lista; pede confirmação. A pessoa perde o acesso agora; nada é apagado. Para voltar, **Desbloquear**.
4. **Validade**: campo **Expira em**. Vencida, a pessoa é bloqueada na próxima tentativa de entrar; **Renovar por +30 dias**.
5. **Redefinir senha**: digite a **Nova senha** (mínimo 8) → **Redefinir**. Avise a pessoa por outro canal. Redefinir a senha encerra as sessões abertas dela. Só o Super Administrador altera outro Super Administrador.
6. **Excluir usuário**: **Desativar <nome>?** pede que você digite o nome de usuário. A conta fica **bloqueada** (motivo "Conta removida pelo administrador"), perde a senha, as chaves de API, o widget do iPhone e a conexão com o Google; o histórico e o quadro pessoal ficam e o login não pode ser reaproveitado. Para voltar atrás: **Renovar** e depois **Redefinir senha**.
7. **Histórico de acessos** no fim da ficha: entradas com data, local aproximado pelo IP (cidade; é aproximado), aparelho.
**Travas:** ninguém bloqueia nem exclui a si mesmo; precisa sobrar pelo menos um administrador (**Deixe pelo menos um administrador.**). Só o **Super Admin** vê **Organização (base)** ao criar usuário e o botão **Organizações**.

### 6.9 Inteligência Operacional (só Master)
Endereço `/inteligencia`. Mostra como a plataforma é usada pela equipe: presença, atividade, acessos, alertas. Lembrete na própria tela: **Tempo conectado não é produtividade.**
- Filtros: período (**7 dias**, **30 dias**, **90 dias**), pessoa, equipe (perfil), módulo, empresa.
- Seções: **Visão geral** (pessoas ativas, acessos, tempo ativo medido e estimado, índice de atividade, ranking, mapa de calor por horário), **Pessoas**, **Linha do tempo**, **Mapa de acessos** (localização aproximada pelo IP), **Experiência de uso** (sucesso por fluxo e nota de satisfação, nunca por pessoa), **Alertas** (comportamento atípico), **Metodologia e privacidade**.
- **Dia da equipe:** escolha o dia (setas, calendário ou **Hoje**). Para cada pessoa da equipe aparecem: **Entradas e saídas** (quando entrou e quando saiu; a saída é exata só se a pessoa clicou em **Sair** — se fechou a aba, mostra a **última atividade** e diz isso), **Telas por onde passou** (módulo, tela e empresa, com o tempo ativo) e **O que fez, editou e incluiu** (CRM, empresas, quadro, XFlow, reuniões; no CRM e nas empresas traz o que mudou). Só mede equipe Master e PRICETAX; não mostra texto digitado nem comentários. O Claude Code lê o mesmo resumo por uma chave **Ler tudo** de administrador (`/api/connect/team-day?date=AAAA-MM-DD`), e cada leitura fica registrada em Meu perfil › Integrações.
- "Medido" é o que o painel mediu; "estimado" é calculado de eventos que já existiam e vem marcado.
- Para a equipe, o texto de transparência está em **Meu perfil › Privacidade**. Tempo medido de clientes não existe (só acessos de segurança).

---

## 7. RENATA
**O que é:** a assistente de IA do painel. Ela lê o que você pode ver e, se você pedir, **executa** no sistema com as **suas** permissões, deixando tudo registrado.

### 7.1 Três formas de falar com ela
| Onde | Para quê |
|---|---|
| Botão **RENATA** da barra de cima (equipe) ou **Ctrl K › Falar com a RENATA** | A RENATA operacional: consulta e executa (criar, mover, registrar). Tem as abas **Conversa** e **Registro de ações** |
| Dentro de uma empresa (botão **RENATA** no canto da tela, em todas as abas) | A RENATA do projeto: responde sobre aquela empresa e propõe ações (criar tarefa, reagendar, lembrar um fato…) que você confirma com **Confirmar** ou **Cancelar**; ao pedir que ela lembre um fato, em **Vale para:** escolha **Só esta conversa**, **Este projeto** ou **Toda a PRICETAX** |
| Usuário Cliente | Versão só de consulta: **Pergunte à RENATA…** (escolhe a empresa) |

### 7.2 Como pedir (passo a passo)
1. Clique em **RENATA**. A faixa **Você está em <módulo>** mostra o contexto; os botões de sugestão mudam por módulo (ex.: no CRM: **O que tenho para hoje no CRM?**).
2. Escreva o resultado que quer, em português normal. **Enter** envia; **Shift+Enter** pula linha. Exemplos: "Crie uma tarefa para ligar para a Eduarda amanhã", "Mostre o que a minha equipe fez hoje e o que está atrasado", "Cadastre um lead novo: …", "O que ficou decidido na última reunião da KUHN?".
3. A resposta mostra os passos: **Consultei N informações do sistema** (leituras) e, para ações, uma linha com o resultado de cada uma.
4. Enquanto trabalha: **A RENATA está trabalhando…**. Pode demorar; aguarde.
5. Cada mensagem tem a hora no fuso de Brasília, escrita como "29/10 01:09 · GMT-3".

### 7.3 Confirmar ações
- Ação crítica, ação em lote (mais de um registro) e alterações genéricas pedem a sua decisão num cartão: **Preciso da sua confirmação** (ou **Ação crítica — preciso da sua confirmação**), com a prévia e **Como está agora**. Clique em **Confirmar** ou **Cancelar**. Só quem pediu confirma.
- Ação simples de criar ou ajustar é executada direto, e a resposta resume antes e depois.

### 7.4 Desfazer
Cada ação executada tem **Desfazer** na própria linha. Depois do clique aparece "(desfeito)" e o aviso **Desfeito. O registro guarda as duas ações.** Nem toda ação é desfazível (as que não são, não mostram o botão).

### 7.5 Registro de ações
Aba **Registro de ações**: tudo que a RENATA fez a seu pedido, com **Antes e depois**. **Meus pedidos** ou, para o Master, **Toda a organização**. O registro não se apaga. O que a RENATA grava no CRM e no Log das empresas aparece como "RENATA (IA, a pedido de <seu nome>)".

### 7.6 Atualizar, limpar, copiar, exportar
| Botão | O que faz |
|---|---|
| **Atualizar** | Recarrega a conversa do servidor (útil se travou em "…" ou se algo foi feito em outra janela). Sem conversa: "Nada para atualizar" |
| **Limpar conversa** | Pede confirmação (**Limpar esta conversa?**), a conversa some da tela e a RENATA começa do zero. O **Registro de ações** continua guardando tudo |
| **Copiar** (em cada mensagem) | Copia só aquela mensagem |
| **Copiar a conversa toda** / **Exportar conversa** | Copia ou exporta em Word, PDF, Excel, texto… |
| **Atualizar memória da RENATA** (nas Reuniões da empresa) | Faz a RENATA reler todas as reuniões da empresa |

### 7.7 O que a RENATA NÃO faz
- Não mexe em **usuários, senhas, permissões, organizações**.
- Não gera nem revoga **chaves de API, widget, push**; não cria **links públicos**; não conecta Google.
- Não faz **importações por planilha** nem a **migração do PipeRun**, nem envia arquivos para Biblioteca, Pareceres ou Modelos.
- Não baixa arquivos nem exporta planilhas.
- A RENATA do projeto não cria atividade nova no cronograma: só tarefa de reunião (sem encaixe, a tarefa fica "pendente de enquadramento"). Até onde a RENATA operacional ajusta o cronograma (ela devolve "criadas" ao aplicar um plano): (não verificado na tela).
- Não avisa por evento ("me avise quando concluir"): ela cria um lembrete de acompanhamento e diz isso.
- Não inventa: sem informação, ela diz que não sabe. Texto que veio de reunião ou documento é tratado como dado, não como ordem.
- O quadro pessoal inteiro é gravado pela tela; se você tem edição local não salva, ela vence a da RENATA (o quadro recarrega sozinho em cerca de 12 s).

### 7.8 Cuidados
- Confira a prévia antes de **Confirmar**, principalmente em lote.
- Material de cliente não vai para outro cliente: pareceres e conhecimento específicos de uma empresa só aparecem para aquela empresa.
- A RENATA nunca é a única fonte para decisão fiscal: confira a base legal citada.

---

## 8. Integrações (chaves de API)
Em **Meu perfil › Integrações (avançado)**. Servem para outra ferramenta (por exemplo outra janela do Claude Code) usar o painel **como você**, sem senha.

### 8.1 As duas chaves
| Chave | O que a outra ferramenta faz | Quem gera | Validade |
|---|---|---|---|
| **Ler tudo** (padrão) | Consulta empresas, cronogramas, reuniões (com transcrição), atividades, agenda e CRM, tudo que **você** pode ver. **Não altera nada** | Qualquer pessoa | 30, 90 ou 180 dias (padrão 180), ou 1 ano |
| **Ler e editar tudo** | Tudo acima e também grava: ajusta cronograma, corrige reuniões, envia transcrições, cria atividades e opera o CRM, sempre dentro do que **você** pode fazer | Só **Master** | Padrão 90 dias, máximo 180 (a opção "1 ano" fica bloqueada) |
Existem ainda as "**Chaves específicas (avançado)**" (recolhidas): ler e criar atividades, ajustar cronograma, enviar transcrições, corrigir reuniões, operar o CRM, só ler. Chaves antigas continuam valendo.

### 8.2 Passo a passo
1. **Nome da chave de acesso** (ex.: "Claude Code do XPED") → escolha **Ler tudo** ou **Ler e editar tudo** → **Validade** → **Gerar chave de acesso**.
2. A chave **aparece uma única vez**. Clique em **1. Copiar comando da chave** e cole na outra ferramenta (ele define as variáveis do endereço e da chave).
3. Clique em **2. Copiar guia de uso** e cole o guia na conversa da outra ferramenta (o guia **não** leva a chave).
4. Peça: "leia o guia e faça o primeiro passo para confirmar a conexão".
5. Depois clique em **Já copiei, fechar**. Se fechar o perfil sem copiar, o aviso **Fechar sem copiar o token?** oferece **Voltar e copiar**.
6. Em **Chaves de acesso ativas** você vê nome, tipo, validade e **Último uso**. **Revogar chave** (lixeira) corta o acesso na hora.
7. Se for administrador do CRM, há também a lista **O que o Claude Code alterou no CRM**.

### 8.3 Cuidados
- A chave vale como uma senha: dê a **uma** ferramenta só, não cole em chat, e-mail nem repositório. Revogue se a ferramenta sair de uso.
- Prefira **Ler tudo**. Use **Ler e editar tudo** só quando a outra ferramenta realmente precisa gravar.
- A chave **não** dá poder extra: cada ação confere o seu acesso na hora. Se você perder o papel (ex.: deixar de ser Master), a chave perde o poder.
- Mesmo com a chave que edita, ficam de fora: migração do PipeRun, usuários, senhas, chaves e exclusão definitiva. As gravações ficam registradas como "Claude Code (por <seu nome>)".
- **Ler tudo** também lê e-mail e telefone dos contatos do CRM.
- Há limites de uso por minuto/hora; passar deles dá erro de "muitas ações".
- O guia completo para quem integra: `docs/CONECTIVIDADE_CLAUDE_CODE.md`.

---

## 9. Widget do iPhone
Mostra no iPhone, sem entrar no painel: atrasadas, vencem hoje, urgentes, agenda e próxima reunião. Usa o app gratuito **Scriptable** e uma chave só sua que **só lê**.
1. **Meu perfil › iPhone** → **Gerar chave de acesso**. **A chave só aparece uma vez**, enquanto a tela estiver aberta: copie os scripts das visões logo (se sair da tela, só gerando **chave nova**, que desliga os widgets antigos até você colar os scripts novos).
2. Em **Suas visões**, cada visão é um widget: dê um **Nome da visão**, monte o que ela mostra (grava sozinho) e clique em **Copiar script desta visão** (**Adicionar visão** cria outra).
3. No iPhone, instale o **Scriptable** (App Store), crie um script novo, cole o script e toque em **Concluir**.
4. Na tela inicial do iPhone: segure num espaço vazio → **+** → **Scriptable** → escolha o tamanho (o médio mostra os títulos). Segure o widget → **Editar Widget** → **Script** → escolha o da visão.
5. Mudou o que a visão mostra? O widget acompanha na próxima atualização, sem colar de novo. Só visão nova ou novo nome pedem script novo.
6. **Revogar chave de acesso** desliga todos os widgets.
**Cuidado:** o widget mostra títulos na tela do iPhone; use só em aparelho seu.

---

## 10. Notificações e push
### 10.1 O sino
O sino (barra de cima) mostra um número de não lidas. Clique para abrir: cada aviso diz quem fez, quando, o título e o texto. Clique no aviso para abrir o item. **Marcar lida** / **Marcar não lida**, **Marcar todas como lidas**. **Escolher o que ver** abre as preferências.

### 10.2 Escolher o que ver
Marque o que quer ver; o que desmarcar deixa de aparecer (nada é apagado, volta se marcar de novo). Salva sozinho, no seu usuário.
- **Tarefas e reuniões do painel Hoje**: **Meu quadro**, **Atividades das empresas**, **Tarefas de reunião**, **Reuniões de hoje e amanhã**.
- **Notificações (sino)** por categoria: **Empresas** (responsável, menção, tarefa vencida), **Gestão de Atividades**, **XFlow**, **CRM**, **Pareceres e Modelos**, **RENATA**. Categoria marcada "ainda não envia avisos" não gera aviso hoje (Gestão de Atividades e RENATA).

### 10.3 Avisos no aparelho (push)
1. No mesmo painel, em **Avisos neste aparelho (push)**, clique em **Ativar neste aparelho** e aceite a permissão do navegador.
2. **Enviar um teste** confirma que chegou. **Desativar neste aparelho** desliga.
3. **iPhone/iPad:** só funciona com o app **instalado** (seção 14): Compartilhar → **Adicionar à Tela de Início**, abra pelo ícone novo e volte aqui. Estados que a tela mostra: **Instale o app primeiro**, **Bloqueadas neste aparelho** (libere nas configurações do aparelho), **Este navegador não permite**, **Ainda não está disponível** (servidor sem as chaves; falar com a equipe técnica).
4. O texto do aviso pode aparecer na tela bloqueada.
5. Tocar no aviso abre o módulo correspondente. Os avisos seguem as categorias que você escolheu.

---

## 11. Glossário
| Termo na tela | O que significa |
|---|---|
| Base / organização | O "espaço" de dados. Cada base é separada das outras. Só o Super Admin troca de base |
| Master / PRICETAX / Cliente | Os três perfis de usuário |
| Super Admin | O administrador técnico acima das bases |
| Atividade | Um item do cronograma de uma empresa (tem fase, responsável, datas, status). **Cuidado:** na Gestão de Atividades o cartão do seu quadro também é chamado de "atividade" |
| Subatividade | Parte menor de uma atividade; no quadro pessoal, o item do **Checklist** |
| Tarefa (de reunião) | Pendência que saiu de uma reunião, com lado (PRICETAX ou cliente), responsável e prazo |
| Fase | Grupo de atividades (cor própria) no Gantt, Fases e Quadro |
| Kickoff / D+0 | Dia da assinatura do contrato; o cronograma conta a partir dele |
| Cronograma padrão | Modelo que toda empresa nova segue (tem versões 1.0, 2.0, 3.0…) |
| Versão (do cronograma) | Retrato do cronograma antes de uma alteração; permite comparar e restaurar |
| Triagem | Aba em que você decide, item a item, se é **Reunião** ou **Trabalho** e a data |
| Reunião (tipo) | Call com gente junto ao mesmo tempo; só pode haver uma por dia na empresa |
| Trabalho (tipo) | Execução nossa; pode repetir no mesmo dia |
| Pauta | Itens de trabalho ligados a uma reunião; a data acompanha a da reunião |
| Dossiê | Compilado gerado pela RENATA a partir de todas as reuniões da empresa |
| Vínculo tarefa→atividade | Ligação de uma tarefa de reunião a uma atividade do cronograma |
| Automática, a validar / Validar | Vínculo feito pela RENATA que ainda precisa da sua confirmação |
| TASK | Item do XFlow (BUG ou melhoria) |
| Reporter, Dev, Gestão, Admin | Papéis do XFlow |
| SLA | Prazo de resposta e de resolução de uma TASK |
| Homologação | Etapa em que a gestão aprova ou reprova a correção |
| Lead | Primeira etapa do funil de um negócio |
| Negócio / Funil / Etapa | A oportunidade de venda / o caminho de etapas / cada passo do caminho |
| Upsell | Nova venda para quem já é cliente |
| MRR | Receita recorrente mensal |
| Valor ponderado | Valor do negócio × chance da etapa |
| Cadência | Sequência automática de follow-ups (1º, 2º, 3º Follow Up) por etapa |
| Follow-up | Contato de acompanhamento (ligação, WhatsApp, e-mail…) |
| Meu dia (CRM) | Painel do CRM com o que fazer agora; (no perfil) o conteúdo da tela inicial |
| RENATA | A assistente de IA do painel |
| Conhecimento / memória | O que a RENATA aprendeu (reuniões, pareceres, biblioteca) |
| Parecer | Documento técnico PRICETAX em PDF |
| Chave de API / token | "Senha" para outra ferramenta usar o painel por você |
| Push | Aviso no aparelho, mesmo com o painel fechado |
| GMT-3 | Horário de Brasília (o painel mostra sempre Brasília) |

---

## 12. Problemas comuns e o que fazer
| # | Sintoma (o que você vê) | O que fazer |
|---|---|---|
| 1 | **Usuário ou senha inválidos.** | Confira os dois campos com **Mostrar**. Sem sucesso, peça ao Master **Redefinir senha** |
| 2 | **Acesso bloqueado…** ou **Acesso expirado…** | Falar com o Master: desbloquear ou **Renovar por +30 dias** |
| 3 | **Sua sessão expirou. Entre de novo para continuar** | Entre de novo. O que você digitou naquela tela não foi enviado |
| 4 | Tela **Sem conexão** | Confira a internet; **Tentar de novo**. O painel tenta sozinho quando voltar. Você não é deslogado |
| 5 | **Nenhum acesso liberado** ou **Nenhuma empresa liberada** | Peça ao Master para liberar o módulo ou o CNPJ em **Gestão de Usuários** |
| 6 | Não vejo um módulo na tela inicial | Veja a tabela 5.1. Falta um acesso ligado pelo Master |
| 7 | Abri um link e caí na tela inicial com **Você não tem acesso a essa área do painel…** | Mesmo caso: peça o acesso. O link abre normalmente para quem tem |
| 8 | Selo **Sem conexão — tentando salvar de novo…** | Aguarde e não feche a aba; ou **Tentar agora**. O painel regrava sozinho |
| 9 | **Não foi possível salvar** | **Tentar de novo**. Se repetir, copie o texto do erro e avise o suporte |
| 10 | Texto que digitei "voltou" ou sumiu | Provável: duas abas abertas no mesmo quadro/empresa. Feche a extra; o quadro avisa e junta. Confira **Histórico** |
| 11 | **Você tem alterações não salvas** | **Salvar e sair**, **Sair sem salvar** ou **Continuar editando** |
| 12 | **Uma nova versão está disponível.** | Clique em **Atualizar agora** (salve o que estiver fazendo antes) |
| 13 | **Algo deu errado** (tela de erro) | **Tentar de novo**; se persistir, **Recarregar a página**. O erro vai para a equipe; o que estava salvo está seguro |
| 14 | Cartão do quadro pessoal sumiu | Veja **Filtros ativos** (**Limpar tudo**), a **Lixeira** e **Concluídas** (arquivo automático semanal) |
| 15 | Atividade de empresa sumiu | **Lixeira** da empresa (equipe) → restaurar. Ou **Versões** → comparar/restaurar (Master) |
| 16 | Excluí uma empresa sem querer | Master: **Empresas excluídas** → **Recriar empresa…** (até 1 ano). Refazer links públicos |
| 17 | Datas mudaram sozinhas | A caixa **Ajustar datas automaticamente** está ligada. Use **Desfazer** no aviso e/ou **Travar a data** |
| 18 | **Não deu pra conectar sua conta do Google. Tente de novo.** | Refaça em **Meu perfil › Agenda**; escolha a conta certa. **Integração ainda não configurada nesse ambiente** = servidor sem Google (equipe técnica) |
| 19 | Agenda vazia ou **Seu Google Calendar ainda não está conectado** | Conecte o Google. Ou mude o período/visualização |
| 20 | RENATA demora, mostra "…" ou **Não consegui processar** | **Atualizar**; se não resolver, **Limpar conversa** e peça de novo, mais curto e específico |
| 21 | RENATA diz que não acha uma reunião que existe | Nas Reuniões da empresa, **Atualizar memória da RENATA** |
| 22 | **IA não configurada** (RENATA, estudo, dossiê) | Servidor sem a chave da IA: falar com a equipe técnica. O resto do painel funciona |
| 23 | Transcrição parada em **Processando…** | Passou de 90 s: clique em **Tentar novamente** (ícone na linha). Várias falhas: **Tentar novamente todas** |
| 24 | Pop-up de PDF não abre | O navegador bloqueou. Libere pop-ups para o painel e tente de novo |
| 25 | **Link indisponível** em quadro, reunião ou acompanhamento | O link foi desativado, regenerado ou venceu. Peça um novo a quem enviou |
| 26 | Push não chega no iPhone | Instale na tela de início (seção 14), abra pelo ícone, ative em **Escolher o que ver**, **Enviar um teste** |
| 27 | Widget do iPhone parou | Chave nova ou revogada: gere em **Meu perfil › iPhone** e cole os scripts novos |
| 28 | Perdi a chave de API (ela só aparece uma vez) | Gere outra e revogue a antiga |
| 29 | No celular o quadro rola ao arrastar | Segure o cartão por meio segundo antes de arrastar, ou use **Mover para…** no menu |
| 30 | **Este CNPJ já está cadastrado** (CRM) | **Usar esta empresa**; não crie de novo |
| 31 | Não consigo **Perder** um negócio | Falta o **Motivo da perda**; escolha um |
| 32 | Importação deixou linhas de fora | **Baixar a lista**, corrija e importe de novo só essas |
| 33 | Botão cinza (XFlow, formulários) | Falta um campo obrigatório; passe o mouse no botão para ver o motivo |
| 34 | **Mensagem do dia** diz "Indisponível agora" | A fonte externa falhou. Tente mais tarde; o resto do painel não depende dela |

---

## 13. Para o cliente (usuário do perfil Cliente)
**O que você é:** alguém da empresa cliente, com um usuário criado pela PRICETAX para acompanhar o projeto. Você só enxerga as empresas que a PRICETAX liberou para o seu usuário.

**O que aparece para você:** a tela inicial com **Empresas**, a **Agenda** e, se a PRICETAX liberou, **Gestão de Atividades** e **XFlow**. **Não** aparecem Conhecimento, Pareceres, Modelos, CRM, Visão Geral (só com todas as empresas liberadas), Usuários nem Inteligência.

**Passo a passo**
1. Entre em painel.pricetax.com.br com o usuário e a senha que a PRICETAX enviou. Troque a senha em **Trocar senha** (login) ou **Meu perfil › Perfil › Alterar senha**.
2. Abra a sua empresa (clique no nome). Veja **Resumo** (progresso), **Gantt**, **Tabela**, **Fases**, **Quadro**, **Mapa**, **Reuniões** e **Tarefas**.
3. Nas **Tarefas**, filtre pelo seu lado (**Cliente**) para ver o que depende de vocês. Cada tarefa mostra responsável e prazo.
4. Abra uma atividade para ver datas e subatividades, comentar e anexar arquivos.
5. **Excel** e **PDF** exportam o cronograma.
6. A RENATA (botão **RENATA**) responde perguntas sobre a empresa; escolha a empresa em **Perguntar sobre uma empresa…**. É só consulta: não executa ações.
7. Sem usar o painel: a PRICETAX pode ter enviado um **link de acompanhamento** (abre sem login, só leitura, com **Resumo**, **Cronograma**, **Tabela** e **Prazos legais**). Para alterar algo, use **Entrar para editar**.

**O que você NÃO vê nem faz:** cadastro e exclusão de empresa, fases, histórico de versões, auditoria, links, vínculo com atividade, dados de outros clientes.
**Dúvidas:** a sua empresa não aparece → peça à PRICETAX para liberar o CNPJ. Esqueceu a senha → peça redefinição à PRICETAX.
(Não verificado na tela: se as abas **Reuniões** e **Tarefas** aparecem para o Cliente exatamente como para a equipe; no código não há filtro por perfil nelas. Ver seção 15.)

---

## 14. Instalar no celular
Dá para instalar o painel como aplicativo.
- **iPhone (Safari):** abrir painel.pricetax.com.br → **Compartilhar** → **Adicionar à Tela de Início**.
- **Android (Chrome):** menu ⋮ → **Instalar app** (ou **Adicionar à tela inicial**).
O app abre em tela cheia, continua logado e, sem internet, mostra **Sem conexão** (não pede login). Para avisos push no iPhone o app instalado é obrigatório (seção 10.3). Se um botão ficar pequeno ou uma tela cortada, avise o suporte: há um roteiro de teste de celular em `docs/ROTEIRO_TESTE_MOBILE.md`.

---

## 15. Não verificado / dúvidas
- **Nenhuma tela foi aberta no navegador** para escrever este manual: os nomes de botões e avisos vêm do código. Quem for usar este texto para treinar alguém deve abrir cada passo uma vez e corrigir o que mudou.
- **Cliente e abas internas:** não há, no código, filtro que esconda de usuários Cliente os dados de reuniões (transcrição, comentários internos) e o log: o servidor devolve o projeto inteiro a quem tem acesso à empresa. A tela só esconde os botões da equipe. Confirmar com o Rafael se o cliente deve ver Reuniões e Tarefas (o link público de acompanhamento esconde isso de propósito).
- **Edição pelo Cliente:** o servidor não distingue Cliente de equipe ao gravar a empresa (só confere se há acesso à empresa). A tela esconde Fases, Versões etc., mas isso é só visual.
- **Botões de empresa na tela de escolha** (**Editar**, **Excluir**, **Pausar**): o código não esconde de quem não é Master/PRICETAX; o servidor recusa a exclusão, mas a pausa e a edição passam pelo mesmo gravador de empresa (não verificado na tela).
- Senha mínima é **8 caracteres** (senhas antigas mais curtas continuam entrando). Depois de várias tentativas erradas o sistema pede para esperar até 15 minutos (6 erros do mesmo usuário no mesmo IP, 20 do mesmo usuário ou 40 do mesmo IP). Bloquear, vencer o acesso ou trocar a senha de alguém encerra as sessões abertas dessa pessoa.
- **RENATA operacional criando atividade no cronograma:** ver 7.7.
- A API de leitura de CRM (**Ler tudo**) expõe e-mail e telefone dos contatos (decisão registrada do Rafael).
- Funcionalidades que só o Rafael consegue testar em produção: IA real da RENATA em pedidos complexos, Google Calendar de outras contas, push em aparelho real, widget, Excel do CRM aberto no Microsoft Excel.
