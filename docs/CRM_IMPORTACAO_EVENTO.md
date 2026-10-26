# Importação dos leads do evento 22–23/10/2026 para o CRM

Comando único (repetível): `node scripts/crm-evento-import.mjs` (PRÉVIA, não grava) · `… --apply` (grava).
Fonte: `~/Desktop/CLAUDE/LEADS_EVENTO_2026-10/saida/*.json` (contrato em `LEIA-ME_INTEGRACAO.md` da pasta). Nunca o HTML.

## Fluxo quando chegar lista nova
```bash
cd ~/Desktop/CLAUDE/LEADS_EVENTO_2026-10 && python3 -I consolidar_leads.py     # gera saida/*.json
cd ~/Downloads/pricetax-cronograma
node scripts/crm-evento-import.mjs            # prévia: quantos criar / atualizar / ignorar + relatório em crm_import/
node scripts/crm-evento-import.mjs --apply    # grava (≈ 107 requisições/min: 313 leads novos levam ~25 min; reimportação sem mudança, ~5 min)
# interações da equipe (Registro Comercial): exportar a coleção `interacoes` (ArtifactData, out_dir) e passar a pasta:
node scripts/crm-evento-import.mjs --interacoes <pasta> --apply
```
URL e chave vêm de `PRICETAX_URL` / `PRICETAX_CRM_TOKEN` no `.env` (chave `crm_operate`; tudo sai registrado como "Claude Code"). Opções: `--dir`, `--funil`, `--only L1,L2`.

## Onde cada coisa fica no CRM (sem coluna nova no banco)
| Do evento | No CRM |
|---|---|
| Lead (pessoa) | **Contato** + **Negócio** no funil "Tributaristas e Contadores" (o Lead é a 1ª etapa de um negócio). Título: "Nome · Empresa". |
| `id` L… (origem_id) | `crm_deals.external_id` com `external_source = evento-2026-10-22` (índice único: o mesmo L… nunca vira 2 negócios). Também escrito na descrição. |
| Origem "Evento 22–23/10/2026" | campo **Origem** do negócio (`source`, filtro "Origem" do funil) e da empresa nova |
| Canal "Estande" · estande | tags `Canal: Estande`, `Estande: TINTAX` / `IBPTLA` / `Gmaster` (filtro por tag do funil) |
| Empresa | Empresa existente se o nome (sem "Ltda/S.A./de/da…") for igual; senão cria. Sem empresa na planilha: empresa provisória "Nome (empresa não informada)". Nome só parecido NÃO é unido (vai para o relatório). |
| Contato | só FATOS nos campos: nome, cargo, e-mail, telefone, LinkedIn |
| Capturas | uma **nota** por captura no negócio (`[evento C001] …`) |
| Brindes | nota `[evento brinde L…]` + tag `Brinde registrado/possível (est.)` — sempre marcado como ESTIMATIVA |
| Data de contato (follow_up) | atividade "Contato combinado no evento", tipo follow-up, nessa data, sem responsável |
| Grupos de empresas (cross-sell) | nota `[evento grupo E001]` na empresa (participantes, estandes, interesses, oportunidade sugerida — estimativa) + tag `Grupo no evento` nos negócios |
| Interações da equipe | nota `[evento int <id>]` no negócio; o valor informado fica só no texto, **não** altera o valor do negócio |

## Fato × estimativa × não identificado
A descrição do negócio tem um bloco delimitado ("══ DADOS DO EVENTO … ══ … ══ fim dos dados do evento ══") com 3 seções: **FATOS** (da planilha), **ESTIMATIVAS** (regra do script: UF por DDD, decisor por cargo, interesses, brinde, teste Tintax, estágio, pontuação, urgência, próximo passo, valor potencial) e **NÃO IDENTIFICADO**. Estimativas nunca viram campo estruturado (UF da empresa, papel de decisão e valor do negócio ficam vazios). `valor_venda` é sempre vazio na fonte → valor do negócio = 0 (não informado).
O bloco é reescrito a cada importação; texto que o time escrever fora do bloco é preservado.

## Estágio do evento → etapa do funil
7 Apenas captado → **Leads** · 6 Interesse registrado → **Mapeamento** · 5 Teste/demonstração → **Acesso Teste** · 4 Interesse quente → **Conexão** · 3 Contato agendado → **Conexão** (+ atividade na data) · 2 Fechamento sinalizado → **Negociação** · 1 Cliente (venda registrada) → **Contrato** (aberto; NÃO "Ganho": a venda registrada é "1 mês de Tintax free", sem valor — passar a Ganho quando houver valor/confirmação).
Reimportação: o negócio só **avança** de etapa se o time não mexeu (continua na etapa que a importação anterior escolheu); se alguém moveu, a importação não desfaz. Tags da equipe são preservadas (a importação só troca as dela).

## Duplicidade
Mesmo telefone (últimos 9 dígitos) ou e-mail **e** mesmo primeiro nome = mesma pessoa → o contato existente é reaproveitado. Se ele já tem negócio aberto (fora do evento), o negócio dele **não é alterado**: ganha tag e nota com os dados do evento. Sem negócio aberto: cria o negócio do evento ligado ao contato existente. Mesmo e-mail/telefone com outro nome = colega, contato novo.

## Efeitos que a importação NÃO causa
Não dispara a cadência da etapa (`skipCadence` no `POST /deals`), não notifica ninguém, não define responsável (negócios e atividades ficam sem responsável), não preenche valor.

## Servidor (aditivo)
`POST /deals` aceita `externalSource`/`externalId` (409 se a chave já existe) e `skipCadence`; `GET /deals` filtra por `externalSource`/`externalId`; `mapDeal` devolve os dois campos. Teste: `scripts/crm-evento-import.test.mjs` (sandbox local; 40 verificações: prévia sem gravar, vincular × colega, reimportação sem duplicar, avanço de etapa, preservação do que o time fez, interações, chave única).
