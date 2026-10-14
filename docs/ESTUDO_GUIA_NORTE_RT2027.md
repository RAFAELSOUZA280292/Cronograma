# Estudo — "Reforma Tributária 2027 · Guia por área | PriceTax" como norte dos projetos

Estudado em 2026-10-14. **Só estudo: nada foi implementado.** Arquivo-fonte: `~/Downloads/Reforma Tributária 2027 · Guia por área _ PriceTax (1).html`
(página única e autônoma, 109 KB; o conteúdo está em JavaScript dentro do HTML; status e anotações ficam só no `localStorage` do navegador).

## 1. O que o guia é (conferido no código do arquivo)

- **5 fases**: Mobilização (07–17/10/2026) · Desenho e parametrização (20/10–14/11) · Homologação integrada (17/11–12/12) · Virada (15–31/12, go/no-go em 22/12) · Operação assistida (jan–mar/2027, 1ª apuração de CBS/IBS em fevereiro).
- **10 áreas**: Diretoria e PMO, TI e ERP, Fiscal, Compras, Vendas e Comercial, Financeiro, Contábil, Logística e Operações, RH/Folha/DP, Jurídico.
- **87 ações** (TI 25, Fiscal 20, Compras 8, Vendas 8, Financeiro 7, Contábil 7, RH 5, Governança 3, Jurídico 3, Logística 1), cada uma com: código (T1, F2, C3…), área, fase (0 = recorrente), prazo (ou frequência), prioridade P1/P2/P3 (49·32·6), **quem executa** (Cliente 57 · ERP 23 · PriceTax 7) + a área do cliente responsável + apoio, "entrega" esperada (23 ações), **fonte oficial** com nota técnica e datas de homologação/produção (21 ações; 8 marcadas "norma já em vigor"), status e campos de responsável nominal / link de evidência / observações.
- **Conteúdo por área**: "o que muda", exemplos numéricos (base de IBS/CBS, formação de preço, RAD, crédito de compras por regime do fornecedor) e "atenção". Fiscal ainda traz **configurador do ERP** (10 itens), **testes por operação** (9) e **erros comuns** (6); TI traz o **calendário das notas técnicas**. Há 7 "pendências a confirmar" (lista do IPI/ZFM, regulamento do RAD, alíquota da CBS, etc.).
- Critérios de prontidão e de prioridade estão escritos como **classificação de gestão do projeto, não oficial**, com aviso de que concluir as ações não atesta conformidade.

## 2. Como se compara com o que já temos

| Tema | Guia | Painel hoje |
|---|---|---|
| O que é uma "atividade" | ação operacional da **prontidão do cliente** para 2027 (87) | atividade macro do **engajamento PRICETAX** (≈12–19: Kickoff, Envio de dados, Prévia AR/DR, Workshop, Compras, Comitê…) |
| Fases | 5, de out/2026 a mar/2027 | 3 (Leitura Real · Mão na Massa por Área · Consolidação), ago/2026 a jul/2027 no modelo padrão |
| Áreas | 10 (inclui **Contábil**; "TI e ERP"; "Vendas e Comercial"; "Diretoria e PMO") | `server/areas.js`: Comercial, Compras, Controladoria, Diretoria, Financeiro, Fiscal, Jurídico, Logística, RH, TI (**sem Contábil**) |
| Quem executa | 3 lados: Cliente, **ERP**, PriceTax | tarefas têm 2 lados (`owner`: pricetax/cliente); **não existe o lado "ERP/fornecedor"** |
| Prioridade | P1/P2/P3 | urgente/alta/média/baixa |
| Status | Não iniciada/Em andamento/**Bloqueada**/Concluída | Não iniciado/Em andamento/Pausado/Concluído (**sem "Bloqueado"**) |
| Fonte da norma | campo próprio por ação (NT, homologação, produção) | não existe |
| Evidência/entrega | campos "entrega" e "link da evidência" | existem anexos/links/comentários, sem campo de entrega |
| Onde moram os dados | `localStorage` do navegador | banco, com permissão por empresa |

**Leitura**: são duas camadas complementares, não concorrentes. As atividades do cronograma (e o vínculo tarefa→atividade que acabamos de construir) respondem "**o que a PRICETAX faz e quando**"; o guia responde "**o que cada área do cliente, o ERP e a PRICETAX precisam ter pronto para virar o ano**". As tarefas que saem das reuniões podem apontar para as duas.

## 3. Achados no conteúdo (a corrigir antes de usar como base)

1. **Alíquota de 2027 — inconsistência com a norma e com a premissa da casa.** O guia mostra "~9,3% CBS plena" (descrito como "referência menos 0,1 p.p.") e, no exemplo de preço, soma IBS+CBS = **R$ 94 por R$ 1.000** (9,3% + 0,1%). Conferido: **ADCT art. 127, parágrafo único** (EC 132) e **LC 214 art. 347** reduzem a CBS em 0,1 p.p. em 2027–2028, e o Parecer PRICETAX 25/2026 fixa o documento de 2027 em **CBS 9,20% + IBS 0,10% = 9,30%**. Somar 9,3% + 0,1% superestima 0,1 p.p. Recalculando o exemplo com 9,3%: valor do produto **R$ 1.242,05** (guia: 1.243,18), ICMS com IBS/CBS na base **R$ 149,05** (149,18), diferença para o ICMS sem a inclusão **R$ 12,68** (12,82). Também em TI: "testar com CBS em torno de 9,3%" deveria dizer CBS 9,20% + IBS 0,10%. (Memória da casa: `aliquota-cbs-2027-premissa`.)
2. **14 ações com prazo fora da janela da própria fase** (ex.: T2, T3, T4, T12, T13, F11, FN1 → fase 1 com prazo 24/10, mas a fase 1 termina em 17/10; **F2** está na fase 3 com prazo 31/10; V1 e C1 na fase 1 com prazo 31/10; T8, T23, T24 → fase 2 com prazo 16/11, a fase termina em 14/11). Ou a fase ou o prazo está errado.
3. **2 ações já vencidas hoje** (F16 e C0, prazo 09/10/2026), sendo que o guia as trata como "a fazer".
4. **Conteúdo de um caso concreto dentro de um guia genérico**: o configurador, os testes e os erros do Fiscal descrevem o resultado dos testes **de um cliente específico** ("só 13 dos 30 NCMs usados nos produtos têm regra", "SP→AP estava 4%", "Alagoas passou a 20,5%", "o ERP não permite…"). Como modelo para todos os clientes isso precisa virar **parametrizável por cliente** (ou sair do modelo), por confidencialidade e por não valer para outros ERPs. O nome da classe CSS `b-zapping` (selo da PriceTax) sugere que o arquivo foi adaptado de um projeto anterior.
5. **Afirmações que não conferi nas normas** (só a CBS/ADCT 127 foi verificada): datas e nomes das notas técnicas (NT 2026.008, 2026.010, etc.), "split payment opcional em 2027 e obrigatório a partir de 2028", "crédito do Simples ≈ 2,2%", a sigla **RAD** (o texto legal fala em pagamento/recolhimento pelo adquirente; a sigla parece da casa ou do ERP) e o enunciado do IPI/ZFM (LC 214 art. 454 trata de produtos **abaixo** de 6,5% na TIPI; o guia fala de "acima de 6,5%" — conferir com o ADCT art. 126). Seguindo o método IVANA, tudo isso deve ser validado na norma oficial antes de virar base.
6. **Datas absolutas.** Os prazos estão fixados em outubro–dezembro/2026 (valem para a virada de 01/01/2027, mas não servem para empresas que entram depois); as datas **oficiais** das NTs são absolutas, enquanto os prazos de projeto deveriam ser **relativos ao kickoff** de cada cliente.

## 4. Caminhos possíveis (nenhum implementado)

- **A. Catálogo-mestre de ações** (fonte única, versionada no repositório, com área, fase, prazo-padrão, prioridade, quem executa, entrega, **fonte oficial** e **condições de aplicabilidade** — ex.: só se o cliente presta serviço, tem ZFM, usa ERP X). Cada cliente recebe o subconjunto aplicável.
- **B. Aplicar ao cliente com revisão**, reaproveitando o fluxo de **Lacunas** (prévia → confirmação → criação em lote, nada sem revisão).
- **C. Ligar tarefas de reunião às ações do catálogo** (o vínculo atual aponta para a atividade do cronograma; um segundo vínculo apontaria para o código do guia, ex. F2/T12), com progresso por área na tela da empresa.
- **D. Visão para o cliente** (o guia como tela/portal por empresa, com status vindo do banco e não do navegador) e **E. conhecimento da RENATA** (as ações e as fontes entram na Central de Conhecimento para ela responder "o que falta no Fiscal do cliente X?").
- Sugestão de ordem: **(1)** validar e corrigir o conteúdo → **(2)** modelar o catálogo como dados → **(3)** aplicar ao cliente com revisão → **(4)** vínculo/progresso → **(5)** visão do cliente e RENATA.

## 5. Decisões que dependem do Rafael

1. **Papel**: o guia é o **modelo interno** da PRICETAX, um **material visível ao cliente**, ou os dois?
2. **Relação com o cronograma atual**: (a) **trilha paralela** "Prontidão 2027" ao lado das atividades do engajamento, (b) **substituir** o modelo padrão, ou (c) só **referência** para tarefas?
3. **Granularidade**: cada ação vira uma **atividade** (87 por empresa, muito) ou uma **entrada de um catálogo** (com status por cliente) fora do Gantt, com as áreas como atividades-resumo?
4. **Vocabulário**: aceitar mudanças no painel — **Contábil** como área, lado **ERP/fornecedor** nas tarefas, status **Bloqueado**, prioridades **P1/P2/P3** — ou traduzir para o que já existe?
5. **Correções do conteúdo**: autoriza alinhar a alíquota à premissa da casa (CBS 9,20% + IBS 0,10%), e **quem valida** os itens que não conferi (norma, NTs, RAD, IPI/ZFM)?
6. **Conteúdo de caso concreto** (configurador/testes/erros do Fiscal): sair do modelo ou virar parametrizável por cliente?
7. **Datas**: prazos absolutos (virada de 2027) ou relativos ao kickoff de cada cliente?
