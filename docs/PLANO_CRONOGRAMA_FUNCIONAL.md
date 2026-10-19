# Plano: cronograma padrão funcional (v3)

Criado em 2026-10-19, a pedido do Rafael ("usando tudo que já conhecemos, remova a redundância, acerte os erros, traga um plano"). **Fase 1 entregue; nada foi aplicado no app além da nota da 2.0.**

## Decisões do Rafael
- **A. Duas trilhas:** sim. Diagnóstico PRICETAX (âncora: kickoff, D+n) e Implementação no cliente (âncora: virada de 01/01/2027, D−n).
- **B. Quando o prazo-padrão passa do limite da norma:** vale o limite; a atividade nasce com prazo curto e marcada "prazo comprimido".
- **C. Começar pela fase 1** (rascunho, sem mexer no app): sim.
- **D. Versão 2.0:** marcar como provisória (só a nota; feito por rotina de subida em `server/index.js`, `markV2Provisional`).

## Fase 1 (feita): `exports/cronograma-padrao-v3-proposta_v02.xlsx` e `docs/CRONOGRAMA_PADRAO_V3_PROPOSTA.json`
- 90 itens (17 do diagnóstico, 73 da implementação) em 22 atividades principais. 74 itens vêm das 140 linhas do guia (87) e da lista da Tecumseh (53); 16 são novos. Mapeamento 1 linha → item(ns) na aba "Mapeamento": todas as 140 linhas estão cobertas.
- Prioridade com critério único (P1 trava emissão, cálculo, apuração ou obrigação legal em data fixa; P2 risco financeiro, contratual ou de crédito; P3 melhoria). 26 P1 na implementação (a lista da Tecumseh tinha 33).
- Cada limite tem tipo (lei, nota técnica, previsão, decisão de projeto), fonte e situação de conferência. **Conferido no texto da norma** (arquivos em `~/Downloads/reforma-tributaria-normas`): LC 214 arts. 36, 39, 40, 45, 47, 48, 347, 349, 353 §2º e 378; ADCT arts. 126, 128 e 134 (EC 132); Decreto 12.955 arts. 39, 44 e 45. **Fonte secundária** (notícia): datas de nota técnica (26/10 e 16/11) e split em 2028. **A verificar**: DANFE em 01/12, evento do frete em 14/12, CNPJ alfanumérico, EFD de 2027.
- Corrigidos: CBS 9,3% (é 9,20% + IBS 0,10%), split 2028 como "limite legal", go/no-go e inventário como "limite legal", saldo credor somando ICMS e CBS/IBS, testes e RAD repetidos, texto de cliente.
- Descoberta ao conferir: as datas de 30/10 (TCU) e 15/12 (Senado) estão certas; o prazo de 2026 foi prorrogado em 45 dias (LC 214, art. 353 §2º).

## Fases seguintes (aguardam o Rafael validar a planilha)
2. **Campos novos no app (FEITO em 2026-10-19; ver PROJECT_CONTEXT §65)** por subatividade: prioridade, limite (data, tipo, fonte, conferido em), predecessoras, executor, áreas, aplicabilidade, recorrência. Sem isso não dá para carregar o rascunho no editor sem perder informação.
3. **Carga da v3 no editor (FEITA em 2026-10-19):** cartão "Proposta v3" em Versões, Carregar no rascunho. **Criação da empresa (FEITA em 2026-10-19: âncoras, regra do limite, avisos e prévia no cadastro):** âncoras (kickoff e virada), regra B (limite manda, "comprimido"), aviso das atividades já vencidas ao nascer (T16 e F16 já passaram).
4. Salvar como **3.0** (só quando o Rafael mandar).
5. **Auditoria** usando a versão atual do banco (FEITA em 2026-10-19; a aba **Padrão** da Visão Geral ainda compara com o modelo antigo).
6. "Aplicar às empresas existentes" pela aba Padrão.

## Pendências de conferência
Datas da trilha A (propostas, sem base em norma); marcos "a verificar"; artigos 442 e 445 da LC 214 (Zona Franca de Manaus) antes de publicar B4.13; regras de importação e Recof no regulamento.
