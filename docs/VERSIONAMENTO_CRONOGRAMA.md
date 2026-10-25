# Versionamento, backup e restauração do cronograma (2026-10-25, §83)

Documento técnico. Resumo executivo e decisões: `PROJECT_CONTEXT.md` §83. Localização do código: `docs/PROJECT_MAP.md`.

## 1. Diagnóstico inicial (o que existia antes)

| Capacidade | Antes | Evidência |
|---|---|---|
| Backup/versão do cronograma | **Não existia.** Cada empresa é UM documento JSONB em `projects.data`, regravado inteiro a cada alteração (`PATCH /api/projects/:id`) e por mais 16 pontos do servidor (API de conectividade, RENATA, triagem, padrão, Levantamento…). Última gravação vence. | `server/routes.js` (PATCH), `grep "UPDATE projects"` = 17 pontos |
| Rastreabilidade | Só o **Log** (`data.log`, texto livre, últimas 300 linhas, feito pelo cliente): sem valor anterior/posterior, sem garantia de que toda gravação o alimenta. | `CompanyWorkspace.jsx` (SidePanel "Log de alterações") |
| Rollback | Só **lixeira** de atividade/subatividade (soft delete) e "Desfazer" pontual de alguns toasts. A API de conectividade devolve `undo` na resposta, mas não o guarda. **Excluir empresa era `DELETE` físico**, com `ON DELETE CASCADE` em 13 tabelas filhas (atas enviadas, memória e conversas da RENATA, dossiês, links públicos, reservas de agenda, vínculo com o CRM…). | `routes.js` `DELETE /projects/:id` |
| Comparação | Não existia. | — |
| Permissão de restauração | N/A. | — |
| Backup de banco | Fora do repositório (infraestrutura do Railway); **não verificável daqui**. O versionamento abaixo não substitui o backup do banco. | — |

Reaproveitado: soft delete e lixeira (a restauração os usa em vez de apagar), `data.log` (cada restauração deixa uma linha), `canAccessProject`/`effectiveOrgId` (mesmo isolamento por organização), `syncProjectMemoryFromDiff` (reindexa a memória da RENATA após restaurar), `ConfirmDialog` com texto digitado, `Modal`, `notify` com ação "Desfazer", job diário no padrão de `usageLog.js`.

## 2. Arquitetura

```
 qualquer gravação em projects.data ──► gatilho BEFORE UPDATE (project_versions_capture)
 (PATCH da tela, API pxk_, RENATA,           │  guarda o estado ANTERIOR de activities/phases/team
  triagem, padrão, SQL direto…)              ▼
                                      project_versions  ◄── POST …/versions (ponto manual)
 DELETE da empresa ──► gatilho BEFORE DELETE │          ◄── restauração (backup pre_restore)
   (guarda o documento INTEIRO)              ▼
                                  /api/project-history/…  (listar · comparar · restaurar · empresas excluídas)
                                             ▼
                                  src/versions/VersionHistory.jsx
```

Por que no banco: `projects.data` é gravado por 17 pontos; um gatilho cobre todos (e os futuros) sem depender de alguém lembrar de chamar. O gatilho **nunca derruba a gravação de negócio**: qualquer falha dele vira `WARNING` do Postgres e a gravação segue (testado renomeando a tabela no meio da gravação).

**Quem fez:** `server/projectAudit.js` guarda a identidade da requisição (`AsyncLocalStorage`, preenchida por `requireAuth`/`optionalAuth` e pela API de conectividade) e a escreve nas variáveis de sessão `app.actor_id`, `app.actor_name`, `app.origin` imediatamente antes de qualquer `UPDATE/DELETE` em `projects` (tanto por `pool.query` quanto por `client.query` dentro de transações) e as limpa depois. Gravação sem usuário (job, SQL direto) fica como "Sistema (sem usuário identificado)". Gravação pela API de conectividade fica como `Nome (API, chave "x")`.

## 3. O que é "o cronograma" na versão

`activities` (com `subactivities`, datas, status, responsáveis, vínculos de pauta `pautaDe`, comentários/anexos/links), `phases` e `team`. **Fora** da versão (e portanto intocados na restauração): `company` (inclui CNPJ, que governa o acesso de clientes), `meetings` (atas e tarefas de reunião), `log`, `externalContacts`.

## 4. Armazenamento — tabela `project_versions`

| Coluna | Significado |
|---|---|
| `id` | Número da versão (`#id` na tela). |
| `project_id`, `org_id` | Empresa e organização. **Sem FK**: a versão sobrevive à exclusão da empresa. |
| `created_at` | Quando a alteração (ou o ponto) aconteceu. |
| `kind` | `auto` (antes de uma alteração), `manual` (ponto criado por pessoa), `pre_restore` (backup antes de restaurar), `pre_delete` (documento inteiro antes de excluir a empresa). |
| `label` | Nome do ponto manual / texto do backup. |
| `actor_id`, `actor_name`, `origin` | Quem, e por qual rota (`PATCH /api/projects/<id>`, `API POST …`, `Restauração de versão`…). |
| `snapshot` | JSONB `{activities, phases, team}` = estado **ANTES** da alteração (`pre_delete`: documento inteiro). |
| `stats` | `{activities, subs, done}` do snapshot (vivos, lixeira fora). |
| `touched` | Resumo "o que mudou" depois do snapshot: atividades alteradas/criadas/removidas (id + título, até 40) e se fases/equipe mudaram. |
| `restored_from` | Em `pre_restore`, a versão que foi restaurada. |

**Leitura correta de uma versão:** "o cronograma como estava ANTES da alteração feita por `actor_name` em `created_at`". O "depois" de uma versão é a versão seguinte (ou o estado atual). Comparação campo a campo (`shared/scheduleVersion.js`, `diffSchedules`) devolve, por atividade/subatividade/fase/equipe, `campo: antes → depois`.

**Coalescência (autosave):** o app grava o documento a cada ~1 s de edição. Gravações seguidas da **mesma pessoa e mesma origem** dentro de 5 minutos do primeiro ponto viram UM ponto (o estado de antes da sequência); o `touched` é recalculado contra o estado mais recente. Outra pessoa, outra origem ou 5 min depois abre um novo ponto. Gravação que não muda activities/phases/team (só log, reuniões, etc.) não gera versão.

**Volume medido:** documento de 178 KB, 15 gravações seguidas = 1 versão de ~12 kB em disco (JSONB comprimido); custo do gatilho pequeno (28 ms por gravação ponta a ponta no teste, já com o gatilho).

## 5. Regras de funcionamento

- **Quem vê histórico e compara:** Master e PRICETAX com acesso à empresa (`canAccessProject`); superadmin. **Cliente nunca.** Outra organização recebe 404.
- **Quem cria ponto de restauração:** Master e PRICETAX.
- **Quem restaura e recria empresa excluída:** só **Master** (e superadmin).
- **Restauração segura** (`POST /api/project-history/:id/versions/:vid/restore`):
  1. `dryRun: true` mostra o que mudaria (diferença + avisos), sem gravar;
  2. sem `confirm: true` nada é gravado (400); a tela exige digitar `RESTAURAR`;
  3. tudo-ou-nada em uma transação, com a empresa travada (`FOR UPDATE`);
  4. **antes** de gravar, o estado atual vira uma versão `pre_restore` (desfazer = restaurar essa versão, também com confirmação);
  5. uma linha no Log da empresa (quem, qual versão, qual backup, motivo);
  6. a memória da RENATA é reindexada.
- **Integridade na restauração** (`restoreSchedule` + `validateSchedule`, funções puras testadas):
  - **nada é apagado:** atividade/subatividade que existe hoje e não existia na versão vai para a **lixeira** (`deleted`, `deletedBy: "Restauração da versão #N (quem)"`); volta de lá ou desfazendo;
  - **comentários, anexos e links de hoje são mantidos** (a versão antiga não apaga o trabalho de outras pessoas);
  - subatividade movida de atividade volta ao lugar sem duplicar id;
  - **fases** da versão + as de hoje ainda usadas; **equipe** = união (quem era responsável não some);
  - **pauta** (`pautaDe`) que apontaria para reunião inexistente é desvinculada e avisada (mesma regra de `unlinkPauta`);
  - **bloqueia (409, nada gravado)** se sobraria id de atividade/subatividade repetido;
  - avisa (não bloqueia) fase inexistente e tarefas de reunião cujo `activityId` aponta para atividade na lixeira.
- **Restauração parcial:** `activityIds: [...]` restaura só essas atividades; o resto fica como está.
- **Empresa excluída:** `DELETE` guarda o documento inteiro (`pre_delete`, retenção 1 ano). `GET /deleted/list` e `POST /deleted/:vid/restore` (Master) recriam a empresa com o mesmo id, dados e organização. **Não voltam** (apagados em cascata na exclusão): as 13 tabelas filhas — atas enviadas, memória/conversas da RENATA, dossiês, links públicos, reservas de agenda, vínculo com o CRM; a tela avisa.

## 6. Retenção (`pruneProjectVersions`, na subida + a cada 24 h)

Padrão: tudo por 730 dias (`VERSIONS_KEEP_DAYS`); automáticas com mais de 90 dias (`VERSIONS_FULL_DAYS`) ficam uma por semana por empresa; empresa excluída por 365 dias (`VERSIONS_DELETED_DAYS`). Pontos manuais e backups seguem o prazo geral. O "histórico completo" vale integralmente por 90 dias e condensado depois.

## 7. Procedimentos

**Backup:** automático (gatilho) + ponto manual na tela (`Versões › Criar ponto agora`, útil antes de reorganizar muita coisa) + backup automático antes de cada restauração. O backup do banco inteiro continua sendo responsabilidade da infraestrutura (Railway) — conferir lá a política de backup/PITR; este módulo não a substitui.

**Restaurar pela tela:** empresa › **Versões** › Comparar › **Restaurar…** (Master) › revisar a simulação › Continuar › digitar `RESTAURAR`. Aviso "Desfazer" por ~14 s; depois disso, restaurar o item **Backup** que aparece no topo da lista.

**Recuperar empresa excluída:** Master › **Empresas excluídas** › Recriar empresa.

**Falhas e recuperação:**
| Situação | O que fazer |
|---|---|
| Restauração deu erro | Nada foi gravado (transação). Ler a mensagem (409 = vínculo ameaçado) e tentar parcial ou outra versão. |
| Restaurei a versão errada | Restaurar o **Backup** (`pre_restore`) criado por ela. |
| Gatilho ausente (`\d projects` sem `project_versions_upd/del`) | Reiniciar o servidor (`ensureProjectVersionsSchema` recria na subida) ou rodar `server/projectVersionsSchema.js`. Gravações no intervalo não têm versão. |
| Captura falhando (WARNING `project_versions_capture falhou` no log) | A gravação do usuário não é afetada. Verificar a tabela `project_versions` e o espaço em disco. |
| API de versões indisponível, preciso reverter já | Pelo SQL (Master/DBA): `SELECT id, created_at, actor_name, stats FROM project_versions WHERE project_id='…' ORDER BY id DESC;` e, para devolver activities/phases/team de uma versão: `UPDATE projects SET data = data || (SELECT snapshot FROM project_versions WHERE id=N), updated_at=now() WHERE id='…';` (substitui as três chaves inteiras; **não** preserva comentários novos — prefira a tela). Antes, `SELECT set_config('app.version_skip','1',true)` na mesma transação evita um ponto duplicado. |
| Empresa excluída e a tela não abre | `INSERT INTO projects (id, data, org_id) SELECT project_id, snapshot, org_id FROM project_versions WHERE id=N AND kind='pre_delete';` |
| Disco crescendo | Reduzir `VERSIONS_FULL_DAYS`/`VERSIONS_KEEP_DAYS` e deixar o job rodar, ou `SELECT pg_size_pretty(sum(pg_column_size(snapshot))) FROM project_versions;`. |

## 8. Limites conhecidos (honestidade)

- **Dois usuários editando a mesma empresa ao mesmo tempo ainda é "última gravação vence"** (o documento inteiro é enviado). O versionamento não impede a perda, mas **a torna recuperável** (o estado sobrescrito fica numa versão atribuída a quem gravou depois). Controle de concorrência otimista fica como melhoria futura.
- A versão registra o estado ANTES de cada ponto; dentro de uma janela de 5 min da mesma pessoa os passos intermediários não são pontos separados.
- A atribuição de uma versão é a de quem fez a **primeira** gravação do ponto; o "depois" pode incluir gravações posteriores da mesma pessoa/origem dentro da janela.
- `company`, reuniões e Log não são versionados (o Log registra textualmente as restaurações).
- O cronograma **padrão** (`std-plan`) tem versionamento próprio (`standard_plan_versions` e `standard_plan_draft`); este módulo cobre as empresas.
- Reservas de agenda (`company_calendar_events`) e notificações guardam `activity_id`; após restaurar, datas podem divergir do evento já criado (a tela de reserva já avisa "desatualizado") e atividades na lixeira deixam o vínculo sem destino navegável.
- Restaurar empresa excluída não recria tabelas filhas (ver §5).
- Gravações que chegam por `pool.query({text,values})` (objeto de configuração) ou por conexão fora do pool não passam pelo identificador de autoria; ainda são capturadas, como "Sistema".

## 9. Testes

`node scripts/schedule-version.test.mjs` (14, sem banco): comparação, restauração, idempotência, desfazer, parcial, vínculos de pauta, ids repetidos, subatividade movida, equipe/fases.
`node scripts/project-versions-http.test.mjs` (≈75, servidor e Postgres **locais**, cria e apaga usuários/empresas `oitmp`): gatilho instalado; backup antes da alteração; autoria (tela, API de conectividade em transação, SQL direto); coalescência; o que não vira versão; permissões e isolamento entre organizações; comparação; ponto manual; restauração (sem confirmação, simulação, completa, parcial, bloqueio 409); preservação de comentários; lixeira em vez de apagar; backup `pre_restore`; desfazer idêntico ao estado anterior; exclusão e recriação de empresa; falha do gatilho isolada; documento malformado; volume/desempenho; retenção.
