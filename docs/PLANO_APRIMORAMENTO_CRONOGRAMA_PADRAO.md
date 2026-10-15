# Plano — aprimorar o cronograma padrão com o guia do Felipe (sem mexer em prazos)

Criado em 2026-10-15. **Plano, nada implementado.** Base: `server/db.js` (`defaultActivities`, 12 atividades) × guia HTML do Felipe (87 ações, 10 áreas) — estudo em `docs/ESTUDO_GUIA_NORTE_RT2027.md`.

## Regras do plano (pedido do Rafael)
1. **Não mexer em prazos, datas, status, responsáveis nem no que já foi concluído** (nem no modelo, nem nas empresas).
2. **Sem redundância**: o que o cronograma já cobre não vira atividade nova; entra só como descrição melhor ou subatividade.
3. **Aprimorar a descrição** onde o guia acrescenta algo; **criar** a atividade que falta (sem data, para o time definir).
4. Só entra o que está **confirmado em norma**. Itens do guia não conferidos ficam de fora até a validação (método IVANA).

## O que existe (modelo padrão no código)
12 atividades em 3 fases (Kickoff único · Retorno com o número geral · Compras · Vendas · Financeiro · Fiscal/Tributário · Jurídico · Logística · Controladoria · Adaptação de sistemas · Tira-dúvidas geral · Encerramento). Descrições de uma linha; **só o Kickoff tem subatividades** (3). Atenção: a lista falada pelo Rafael (Envio de dados, Prévia AR/DR, Workshop, Análise, Validação documental, Comitê da reforma) **não está** no modelo do código — pode estar como personalização nas empresas em produção (verificar em Lacunas/Levantamento antes de aplicar).

## Match — o guia dentro do que já temos
Códigos entre parênteses = ações do guia.

| Atividade atual | Ações do guia cobertas | O que fazer |
|---|---|---|
| Kickoff único | G1, T1–T3, FN1, C0 | enriquecer descrição + 4 subatividades |
| Retorno com o número geral | FN2 (caixa), C3/V2 (só a parte "número geral") | só descrição (cenários de caixa) |
| Compras | C1–C6 | descrição + 5 subatividades |
| Vendas | V1–V8 | descrição + 8 subatividades |
| Financeiro | FN3–FN7 | descrição + 5 subatividades |
| Fiscal / Tributário | F1–F20 (20 ações) | descrição + ~10 subatividades (agrupadas) |
| Jurídico | J1–J3, C7 | descrição + 3 subatividades |
| Logística | L1 + devolução referenciada, frete | descrição + 3 subatividades |
| Controladoria | CT3 (DRE) | descrição (só a DRE; o resto vai para Contábil) |
| Adaptação de sistemas | T4–T27 (25 ações de TI) | descrição + ~10 subatividades (agrupadas) |
| Tira-dúvidas geral | P5 (treinamento) | descrição + 2 subatividades |
| Encerramento | — | só descrição (pendências aceitas) |

**Atividades que faltam (criar, sem data):** Contábil (CT1, CT2, CT4–CT7) · RH, Folha e DP (P1–P4) · Prontidão da virada / go-no-go (G2, G3) · (opcional) Operação assistida e 1ª apuração.

## Textos propostos
(Mantêm a primeira frase atual; só acrescentam.)

- **Kickoff único** — "Mapeamento + captura de documentos + validação inicial, tudo em uma só visita. Inclui nomear o responsável de cada área, instituir a reunião semanal de riscos e pedir ao ERP o ambiente de homologação e o cronograma de versões." Subatividades novas: nomear responsável por área e reunião semanal de riscos e evidências (G1) · alinhar com o ERP o ambiente de homologação separado da produção e o cronograma de versões (T1–T3) · extrair do ERP fornecedores, clientes, pagamentos e recebimentos com CNPJ, nota e datas (FN1) · validar o regime tributário dos principais fornecedores (C0).
- **Retorno com o número geral** — "Impacto real em preço de compra, preço de venda, DRE e caixa. Inclui o cenário de caixa do primeiro trimestre de 2027, com e sem recolhimento pelo adquirente e com o IPI zerado ou mantido."
- **Compras** — "Fornecedores que vão subir e descer de preço, item por item. Recalcula o custo de cada compra pelo regime do fornecedor, define a negociação e quando recolher o tributo direto (recolhimento pelo adquirente)." Subs: regime do fornecedor como campo obrigatório, curva ABC e CNAE (C1, C2) · simular custo atual × novo por fornecedor e item (C3) · negociar conforme o regime (C4) · definir quando usar o recolhimento pelo adquirente conforme o risco do fornecedor (C5) · avaliar adiar para janeiro compras de itens com IPI não creditável (C6).
- **Vendas** — "Novos preços de venda por produto, cliente e canal. Refaz a formação de preço a partir do valor líquido, define a política por tipo de cliente e ajusta tabelas, propostas, comissões e a comunicação." Subs: argumento comercial sobre o IPI e produção/estoque de dezembro (V1) · simular margens e refazer a formação de preço (V2) · política de preço por tipo de cliente (V3) · clientes que vão usar o recolhimento pelo adquirente (V4) · adiantamentos recebidos em 2026 para entrega em 2027 (V5) · tabelas, propostas e contratos de 2027 com cláusula tributária (V6) · base de comissões e metas (V7) · comunicar os clientes sobre a nova nota (V8).
- **Financeiro** — "Nota de débito, nota de crédito, adaptação da área financeira e do caixa. Inclui o orçamento de caixa do primeiro trimestre de 2027, os títulos com mercadoria e tributo separados, as guias do recolhimento pelo adquirente e o split payment." Subs: orçamento de caixa jan–mar/2027 (FN3) · revisar contas a pagar e a receber: retenções, líquido × bruto, controle de créditos por documento (FN4) · processo de guias por documento com controle de duplicidade (FN5) · pedido de ressarcimento de saldos credores (FN6) · acompanhar com bancos e credenciadoras a implantação do split payment (FN7).
- **Fiscal / Tributário** — "cClassTrib e CST — coincide com a virada da CBS plena. Define a política de IBS/CBS na base do ICMS e do ISS, a matriz de operações (CFOP, CST, cClassTrib), os créditos e a apuração, e os testes de emissão e recebimento." Subs (20 ações → ~10): política de ICMS e ISS com IBS/CBS na base, inclusive serviços prestados (F1, F16) · matriz de operações e classificação das sem fornecimento, amostras, brindes e bonificações (F2, F4) · regra por NCM e origem do produto (F11, F14) · compras: operações de compra nacional e cadastro item a item × por faixa (F3, F12) · exportação, importação e Zona Franca/áreas de livre comércio (F13, F18) · parametrização de 2027: PIS/Cofins desligados e IPI em alíquota zero (F5) · notas recebidas e eventos da NF-e (F7, F8) · saldos credores de PIS/Cofins e IPI e transição da EFD-Contribuições (F9) · testes de emissão e recebimento com as regras de 2027, repetidos a cada versão do ERP (F6, F15) · validação da apuração e obrigações acessórias de 2027 (F19, F20) · acompanhar a alíquota da CBS de 2027 e a lista do IPI/ZFM (F17, F10).
- **Jurídico** — "Contratos e cláusulas de repactuação. Inclui a decisão sobre a tese de IBS/CBS na base do ICMS e do ISS e o acompanhamento das normas ainda em publicação." Subs: avaliar ação judicial sobre IBS/CBS na base do ICMS e do ISS (J1) · revisar contratos com clientes e fornecedores: cláusulas tributárias, recolhimento pelo adquirente, "impostos inclusos" e reequilíbrio (J2, C7) · acompanhar normas e versões (J3).
- **Logística** — "Malha, centros de distribuição e rotas. Valida com o Fiscal cada fluxo físico (transferência, remessa, retorno, devolução e transporte) e o documento fiscal que ele exige." Subs: matriz operacional validada com o Fiscal (L1) · devolução referenciada à nota original, item a item · tratamento do frete (CT-e e frete de autônomo ou MEI).
- **Controladoria** — "DRE reformada e indicadores executivos. A DRE passa a ter a receita sem tributos cobrados por fora, as deduções e a nova base de IRPJ/CSLL." Sub: ajustar a DRE (CT3).
- **Adaptação de sistemas** — "Parametrização e homologação final do ERP. Acompanha o ambiente de homologação, os campos novos da nota (valor líquido, CST e cClassTrib de IBS/CBS), o novo DANFE, as notas de débito e crédito, os eventos, a EFD e a virada de PIS/Cofins e IPI." Subs (25 ações → ~10): ambiente de homologação, cronograma e versões (T2, T3, T16) · campos novos da NF-e e valor líquido (T17, T5) · DANFE (T6) · notas de débito e crédito e eventos (T7, T18) · devolução referenciada e validação cadastral (T19, T20) · tabelas de alíquota e de CFOP (T8) · NFS-e, CT-e e faturas de energia/telecom (T10, T12, T13, T23, T24) · títulos com mercadoria e tributo separados, e relatório de créditos (T9, T11) · desligar PIS/Cofins e IPI zero na virada (T22) · EFD, CNPJ alfanumérico e integrações (T4, T25, T26) · contingência (T27).
- **Tira-dúvidas geral** — "Todas as áreas juntas para fechar pendências soltas, cada uma com responsável, prazo e contingência." Subs: treinar as equipes nos novos procedimentos (P5) · consolidar as pendências abertas.
- **Encerramento** — "Retrospectiva do ano e plano do Ano 2. Inclui o balanço das pendências aceitas."
- **Contábil (nova)** — "Plano de contas, contabilização e fechamento com CBS e IBS: tributo a recolher, crédito a recuperar pendente e liberado e saldo credor." Subs: plano de contas e de-para (CT1) · contabilização de venda, compra, recolhimento pelo adquirente, notas de débito e crédito e devolução (CT2) · testar a contabilização em homologação (CT4) · checklist mensal de fechamento (CT5) · inventário na virada sem tributos recuperáveis (CT6) · saldos antigos de PIS/Cofins e ajustes de transição (CT7).
- **RH, Folha e DP (nova)** — "Retenções sobre serviços e EFD-Reinf, créditos de benefícios, reoneração da folha e mão de obra própria × contratada." Subs: retirar PIS/Cofins das retenções sobre serviços e ajustar a EFD-Reinf (P1) · benefícios que geram crédito e previsão em acordo coletivo (P2) · simular a reoneração gradual da folha, se aplicável (P3) · comparar mão de obra própria e contratada, com avaliação de risco trabalhista (P4).
- **Prontidão da virada — go/no-go (nova)** — "Critérios mínimos de prontidão, plano de suporte de janeiro e a decisão de seguir ou não com a virada." Subs: critérios mínimos de prontidão por área · plano de suporte de janeiro e escalonamento de incidentes (G2) · decisão go/no-go com ata e pendências aceitas (G3).
- **(opcional) Operação assistida e 1ª apuração** — "Acompanhamento do primeiro trimestre de 2027: primeira apuração de CBS e IBS, conciliação com a conta corrente e incidentes."

## Fora do plano (de propósito)
- Prazos, fases, prioridades P1/P2/P3 e status do guia (regra 1) e a coluna "executa Cliente/ERP/PriceTax".
- Conteúdo de um **cliente específico** do guia (configurador, testes, erros: "13 de 30 NCMs…").
- Itens **não conferidos na norma**: datas e nomes de NTs, "split opcional em 2027 e obrigatório em 2028", "crédito do Simples ≈ 2,2%", a lista do IPI/ZFM (LC 214 art. 454 trata de produtos abaixo de 6,5%; o guia diz acima).
- A sigla **RAD**: não existe na norma; o termo legal é "recolhimento pelo adquirente" (LC 214, art. 36) — é o que vai nos textos.
- A alíquota do guia (CBS 9,3% + IBS 0,1%): nos textos vale a premissa da casa (CBS 9,20% + IBS 0,10%, Parecer 25/2026; ADCT art. 127 e LC 214 art. 347).

## Como aplicar (quando aprovado)
1. **Modelo novo** (empresas criadas daqui para frente): atualizar `defaultActivities` em `server/db.js` (arquivo sensível, só com aval): textos novos + subatividades + as atividades novas **sem data**.
2. **Empresas que já existem**: rotina com **prévia e confirmação por empresa**, reaproveitando as Lacunas: (a) só troca a descrição se ela ainda for **igual à do modelo antigo** (não sobrescreve texto personalizado); (b) acrescenta só as subatividades que faltam (por título parecido); (c) cria as atividades que faltam, sem data; (d) **nunca** toca em data, status, responsável, subatividade já feita ou atividade excluída; (e) idempotente, com linha no log da empresa e sem notificação.
3. **Teste**: comparar antes × depois em cópias de empresas locais e provar por código que datas/status/responsáveis ficaram idênticos.
4. **Antes de tudo**: validar na norma (método IVANA) o que entra nos textos e conferir em produção (Lacunas) o padrão real das empresas.

## Observação sobre prazos (sinalizada, não alterada)
No modelo padrão, Fiscal fica em jan/2027 e Adaptação de sistemas em mai/2027; o guia pede a homologação do ERP e as regras fiscais para out–dez/2026. Fica como ponto para o Rafael e o Felipe decidirem; este plano não muda nenhuma data.
