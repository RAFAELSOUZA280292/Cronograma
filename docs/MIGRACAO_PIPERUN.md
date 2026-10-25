# Migração PipeRun → CRM PRICETAX (2026-10-25, §84)

Resumo executivo e decisões: `PROJECT_CONTEXT.md` §84. Este documento é o **roteiro de operação** e a referência de regras.

## 1. O que foi medido na conta real (25/10/2026, somente leitura)

API `https://api.pipe.run/v1`, token no cabeçalho `token`. Limite **120 requisições** (`X-RateLimit-Limit`/`-Remaining`), páginas de até **200** (`show`, `page`; `meta.total`, `meta.total_pages`). Campos relacionados vêm em camelCase (`with=contactEmails,contactPhones,customFields,city,items`).

| Recurso | Na API | Na planilha exportada |
|---|---|---|
| Oportunidades | 320 (307 fora da lixeira: 30 ganhas, 85 perdidas, 192 abertas/congeladas) | 305 |
| Motivo de perda | 85 de 85 perdidas (catálogo `lostReasons`, 6) | não vinha |
| Empresas | 150 (125 com CNPJ; 12 "Nome não informado") | 142 |
| Pessoas | 514 (53 com e-mail, 157 com telefone) | 0 linhas |
| Atividades | 142 | 0 linhas |
| Anotações | 1.029 (1.011 em negócios) | 1 por negócio |
| Arquivos | 707 (470 MB; 117 documentos ligados a negócio) | não vinha |
| Propostas | 7 (MRR e itens) | — |
| Ligações / e-mails | 0 / 1 | — |
| Histórico de etapas | **não existe endpoint** (só `last_stage_updated_at`) | parcial |

147 negócios ativos **não têm empresa no PipeRun** (68 com pessoa; 79 sem pessoa e sem empresa, R$ 499 mil em valor, 135 com anotações). A API não resolve isso; a decisão do Rafael foi **importar todos**, criando **empresa provisória**.

## 2. Arquitetura

```
PipeRun (API, GET)  ──extract──►  piperun_raw (JSON bruto)  ──migrate──►  CRM (crm_companies/contacts/deals/notes/activities/crm_deal_files)
                                        │                         ▲
                                        └──────reconcile──────────┘ (relatório de divergências)      piperun_map (id PipeRun → id CRM)
```

Código: `server/crm/piperun/` — `client.js` (API, só GET, ritmo ≤ 3 req/s, espera em 429, token só na memória), `extract.js`, `transform.js` (PURO, sem banco/rede), `migrate.js` (prévia + importação), `reconcile.js`, `runs.js` (execuções e progresso), `routes.js`, `schema.js` (tabelas novas). Tela: `src/crm/PipeRunMigration.jsx` (botão **Migrar do PipeRun** em CRM › Negócios, só administrador). Arquivos do negócio: aba Resumo da ficha do negócio.

Tabelas novas (nada do CRM existente muda): `piperun_raw`, `piperun_map`, `piperun_runs`, `crm_deal_files`. A importação **reaproveita** `createCompany`, `createContact`, `addNote` e o importador de negócios (§58: funis, etapas, histórico, promoção a cliente, dono por e-mail/nome, idempotência por `external_id`).

## 3. Regras de transformação

- **Negócio:** `external_id` = `hash` do PipeRun (o mesmo da planilha: negócios já importados por planilha não duplicam). Situação: lixeira → fora; `status` 1 → ganho; 3 → perdido; congelado → aberto com aviso na descrição. Datas de cadastro/fechamento e "dias na etapa" originais. Valor = `value`; **MRR** vai como linha na descrição. **Campos personalizados** viram bloco "Campos do PipeRun" na descrição (sem coluna nova). Origem = nome da origem.
- **Ordem das etapas dos funis** vem do PipeRun (`stages.order`), não é estimada.
- **Motivo de perda:** Postergou decisão → *Sem decisão*; Sem perfil/não qualificado → *Sem aderência*; Fechou com outra empresa → *Concorrente*; Preço alto → *Preço*; Sem interesse e Prazo de entrega → *Outro*. O texto original vai no detalhe ("Motivo no PipeRun: …").
- **Empresa:** casa por CNPJ, senão por nome exato; CNPJ novo vira empresa; nome parecido (≥ 85%) entra como nova e aparece no relatório para unir. "Nome não informado" é recusado. Cliente = tem `customer_at`/`is_client`. Cidade/UF pela API (`with=city`), CNAE por `cnaes/{id}`.
- **Empresa provisória** (negócio sem empresa): nome da pessoa de contato; sem pessoa, o título do negócio. Se já existe empresa com esse nome, o negócio liga nela. Nasce como prospect, sem CNPJ, com nota "Empresa PROVISÓRIA… completar o cadastro". O relatório lista as pendentes.
- **Contato:** pessoa com empresa (direta, ou pela empresa do negócio dela). Dedupe por e-mail ou nome dentro da empresa. Pessoa sem empresa e sem negócio fica só no backup. E-mails extras não são guardados (o CRM tem 1 por contato).
- **Anotações:** HTML → texto; data e hora originais; autor = usuário do CRM quando casa (e-mail, nome ou nome muito parecido com um só usuário); senão o nome vai no fim do texto. Anotações de negócio na lixeira do PipeRun não entram. **Propostas** viram anotação do negócio (valor, MRR, itens).
- **Atividades:** tipo por nome (Ligação, E-mail, Reunião, WhatsApp, Follow Up…); aberta/feita/cancelada (no-show); data e hora da atividade; prioridade "normal" (a conta tem tudo com 3). Atividade antiga **não dispara lembrete** em massa. Sem negócio → fica só no backup.
- **Arquivos:** só documentos (PDF, DOCX, XLS…) ligados a negócio, baixados do PipeRun, máximo 30 MB cada, guardados em `crm_deal_files`. Imagens e áudios ficam **só no backup**.

## 4. Roteiro de operação (produção)

1. No PipeRun: Meus Dados → Integrações → copie o token (de preferência de um usuário gestor).
2. CRM › Negócios › **Migrar do PipeRun** (precisa ser administrador do CRM) › etapa **1. Extrair**: cole o token (não fica guardado) › Extrair. Leva ~1–2 min.
3. Etapa **2. Revisar**: confira os números, a lista "Quem é quem" (casa responsáveis e autores com usuários do CRM) e decida subir ou não os documentos. **Nada foi gravado até aqui.**
4. **Importar agora**. Pode fechar a janela; roda no servidor. Termina em segundos/minutos (os documentos dependem da rede).
5. Etapa **4. Conferir**: contagens, valor por situação e por funil, divergências (CSV). Complete as empresas provisórias.
6. Paralelo de algumas semanas; PipeRun só consulta. Só cancele depois de conferir; verifique contrato e LGPD.
7. Fim: **Apagar a cópia bruta** (dados pessoais) e **revogue o token** no PipeRun. O backup em arquivo é seu (`~/Downloads/PIPERUN_BACKUP`).

Reimportar é seguro: `piperun_map` e `crm_deals.external_id` impedem duplicar; uma nova extração atualiza a cópia bruta.

## 5. Falhas e recuperação

| Situação | O que fazer |
|---|---|
| "O PipeRun recusou o token" | Token errado, revogado ou de usuário sem permissão. Gere outro. |
| Extração falha no meio | Rode de novo (atualiza o que já veio). Limite de requisições é respeitado sozinho. |
| "a API disse ter N registros, mas vieram M" | Dados mudaram durante a extração; rode de novo. |
| Importação falha no meio | O que entrou fica; rodar de novo continua sem duplicar. Execução presa (>45 min) é liberada sozinha. |
| Divergência no relatório | Baixe o CSV; corrija no CRM ou reextraia e reimporte. |
| Importei com a ordem errada de etapas | Ajuste em CRM › Negócios › Funis. |
| Quero desfazer tudo | Não há "desfazer em massa". Os registros importados são identificáveis (`piperun_map`, `external_source='piperun'`); exclusão é pelas telas do CRM (lixeira). Por isso a prévia existe: revise antes. |

## 6. Limites

- **Histórico de etapas** não existe na API: o negócio entra com a etapa atual e o fechamento.
- Ligações (0) e e-mails (1) não existem na conta; imagens e áudios não sobem.
- E-mails/telefones extras de uma pessoa: o telefone junta todos; e-mail extra não é guardado.
- A importação em produção e a primeira extração com token real **não foram executadas pela IA** (o token passou pelo chat durante a análise; foi removido do `.env`). Tudo foi testado com a API **simulada** alimentada pelos dados reais extraídos.
- Dados pessoais: `piperun_raw` é acesso só do administrador do CRM; apague depois da virada.

## 7. Execução em produção (25/10/2026)

Extração e importação feitas pelo Rafael na tela; a conferência final deu **ok, 0 divergências** (138 empresas + 143 provisórias; 507 contatos; 307 negócios — 192 abertos, 30 ganhos R$ 279.766,28, 85 perdidos R$ 133.077,00; 912 notas/propostas; 138 atividades; 114 documentos). Dois PDFs de 23,1 MB passaram do limite de 20 MB e entraram numa 2ª rodada depois de subir o limite para 30 MB. Só no backup: 7 pessoas, 4 atividades, 15 notas e 3 PDFs ligados a negócios que estavam na lixeira do PipeRun, e 590 imagens/áudios.

## 8. Testes

`node scripts/piperun-migration.test.mjs` (≈75 verificações; servidor e Postgres locais; org descartável; **dados reais do backup** ou sintéticos): extração com API simulada (401, 429, paginação, total conferido, CNAEs, token só no cabeçalho), prévia que não grava, permissões (vendedor/gestor 403, outra organização isolada), importação (situação e valores por situação conferidos por conta independente do código, motivo de perda real, ordem real das etapas, datas originais, provisórias, congeladas, campos personalizados, MRR, anotações com data original, atividades sem lembrete em massa, contatos sem duplicar, documentos), conferência, **reimportação sem duplicar**, arquivos por API, token ausente do banco, trava de execução simultânea e purga da cópia bruta.
