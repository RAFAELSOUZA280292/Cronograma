# Auditoria da migração PipeRun → CRM PRICETAX (25/10/2026)

**Parecer: NÃO APROVADO para cancelamento do PipeRun.** O cancelamento não foi autorizado nem executado.

## Método
Extração nova e completa do PipeRun (API v1, só GET, 154 chamadas, total declarado = total recebido em todos os 28 recursos) comparada com o que está em produção
(`painel.pricetax.com.br`, sessão autenticada): chaves de negócio (sha1 título+data), agregados de campos, contagens por funil, relatório de reconciliação do próprio CRM e leitura do resultado das 4 execuções de importação.

## Backup (evidência)
`~/Downloads/PIPERUN_BACKUP/2026-10-25_completo/` + `PIPERUN_2026-10-25_completo.zip` (sha256 `30f64043…4858`, arquivo `.sha256` ao lado).
- `json/` 28 recursos brutos · `arquivos/` 1.096 binários (707 da conta, 379 imagens de notas, 7 PDFs de propostas, 3 avatares) · `csv/` 7 planilhas · `SHA256SUMS` (1.138 itens).
- Integridade: 0 falhas de download; 0 divergências de hash; tamanho da API = tamanho baixado nos 707 arquivos; tipo real conferido por magic bytes (1 `edit[1].html` é um HTML de verdade).
- **Teste de restauração:** zip extraído em pasta nova → 1.138/1.138 hashes OK → `transform.js` reconstrói o plano a partir do backup: 307 negócios (+13 lixeira), 150 empresas, 514 contatos, 912 notas importáveis, 142 atividades, 117 documentos — idêntico à produção.
- **Limite:** a cópia está só neste Mac. Backup independente exige copiar o zip para outro meio (HD externo/nuvem da empresa) — decisão do Rafael.

## Origem × destino (números)
| Item | PipeRun | CRM prod | Situação |
|---|---|---|---|
| Negócios (sem lixeira) | 307 (+13 lixeira) | 307 | integral; valores abertas/ganhas/perdidas idênticos (R$ 377.241,28 / 279.766,28 / 133.077,00) |
| Por funil | 169/39/21/65/2/11 | idem | integral |
| Empresas com cadastro | 138 (+12 "Nome não informado") | 138 + 143 provisórias | integral; 143 a completar (CNPJ/razão) |
| Contatos | 514 | 507 | 7 sem empresa e sem negócio só no backup |
| Anotações com texto | 912 | 912 | texto integral; **imagens 0 de 385 notas; 104 notas só-imagem descartadas** |
| Atividades | 142 | 138 | 4 sem negócio (1 em negócio da lixeira) só no backup |
| Documentos PDF/DOCX | 117 | 114 | 3 em negócios da lixeira |
| Imagens/áudios | 590 | 0 | só no backup |
| Histórico de etapas | 1.046 movimentos reais + 417 eventos de linha do tempo | 422 linhas sintéticas | **código pronto, não aplicado em prod** |
| Tags | 77 atribuições (30 tags) | 0 | não migrado |
| Previsão de fechamento | 48 | 0 | não migrado |
| Produtos | 7 | 0 | não migrado |
| Funis/etapas | 7 funis, 41 etapas, SLAs | 6 funis; só etapas com negócio; sem SLA; "Outbound PriceTax" ausente | parcial |
| Propostas | 7 (+7 PDFs) | 7 como anotação | parcial |
| Assinaturas | 3 signatários (nome/e-mail/IP/data) | 0 | só backup |
| Formulários | 4 (+15 respostas no histórico) | 0 | não migrado |
| Campos personalizados | 17 definições | valores como texto na descrição | parcial |
| Automações | 1 ativa + 1 inativa | 1 reproduzida | integral (a inativa não) |

## Classificação
**Integral:** negócios ativos e valores, funis dos negócios, empresas, contatos, texto das anotações, atividades com negócio, documentos, autoria, automação ativa.
**Parcial:** etapas/funis (sem SLA e etapas vazias), propostas (viraram nota), campos personalizados (texto), histórico (422 sintéticas × 1.046 reais).
**Não migrado (está no backup):** imagens/prints das notas (385 notas), imagens/áudios, tags, previsão de fechamento, MRR estruturado, produtos, formulários, assinaturas, 13 negócios da lixeira (19 notas, 1 atividade, 4 arquivos), 7 contatos órfãos, 12 empresas sem nome, 4 atividades sem negócio, 1 PDF sem negócio, motivo de perda livre (`reason_close`), comentário de atividade concluída, `probably_closed_at`, LGPD, porte/natureza jurídica.
**Não extraível pela API:** 1 imagem `blob:https://web.whatsapp.com` (nota 162777610); conversas do Atendimento/WhatsApp (sem endpoint); permissões/perfis (`acl` vazio); integrações de entrada (formulários do site, e-mail de captura) e relatórios salvos — não aparecem na API.
**Reconstruir manualmente:** formulários, perfis de acesso (criar usuários Eduarda e Maurício no CRM), integrações de captura de leads, completar 143 empresas provisórias.
**Risco de perda definitiva após cancelamento:** imagens/arquivos hospedados em `assets.pipe.run` (cópia só local), trilha de assinatura eletrônica, histórico real, respostas de formulários, qualquer conversa de WhatsApp/Atendimento.

## Pendências e plano
| # | Pendência | Criticidade | Resolução |
|---|---|---|---|
| 1 | Aplicar histórico real (precisa re-extrair com token) | Alta | rodar extração + importação; já testada localmente |
| 2 | Imagens das notas (385) | Alta | anexar as 379 imagens do backup às notas; tratar as 104 só-imagem |
| 3 | Tags, previsão de fechamento, MRR | Média | importar para campos do CRM |
| 4 | Funis/etapas vazias + SLA, produtos | Média | recriar |
| 5 | Propostas (PDF) e assinaturas | Média | anexar PDFs aos negócios; guardar trilha de assinatura |
| 6 | Formulários e integrações de captura | Alta se usados | inventário com o time; recriar |
| 7 | Backup em 2º meio | Alta | copiar zip + conferir sha256 |
| 8 | Revogar token PipeRun e pxk_ | Segurança | só depois dos itens 1–2 |

## Atualização — item 2 resolvido em produção (25/10/2026)
Imagens das anotações aplicadas (execuções 5 e 6): 387 notas com 419 anexos (386 + 1 `<img>` que apontava para PDF); 105 notas que eram só-imagem ou só tinham link temporário passaram a existir (anotações 912 → 1.017, reconciliação ok, 0 divergências). As 5 notas com imagem restantes pertencem a negócios da lixeira (só backup). Conferido na tela (negócio "Georges - Player Contabilidade": 3 miniaturas carregadas, autor e data originais). Item 1 (histórico real) pendente de um clique do Rafael: *Migrar do PipeRun › Extrair › escolher `histories.json`* e depois *Importar*.
