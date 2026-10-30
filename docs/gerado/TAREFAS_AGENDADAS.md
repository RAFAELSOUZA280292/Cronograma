# Tarefas agendadas e processos em segundo plano (gerado)

> Gerado automaticamente por `scripts/docs-gen.mjs` a partir do código. **Não edite à mão** — rode `npm run docs:gerar`.

Não há fila externa (Redis etc.): tudo roda **dentro do processo do servidor** (um único contêiner no Railway). Se o servidor reinicia (deploy), o que estava em andamento é interrompido — por isso trabalhos longos gravam o estado no banco e se recuperam (ver `docs/04_SEGURANCA_E_TRAVAS.md`).

## Funções `start…` (iniciadas no boot)

| Função | Arquivo | Iniciada no `index.js`? |
|---|---|---|
| `startRun` | `server/crm/piperun/runs.js:6` | não (chamada em outro lugar) |
| `startCrmScheduler` | `server/crm/scheduler.js:51` | sim |
| `startDossier` | `server/dossier.js:396` | não (chamada em outro lugar) |
| `startStudy` | `server/parecerStudy.js:303` | não (chamada em outro lugar) |
| `startVersionRetentionJob` | `server/projectVersions.js:189` | sim |
| `startTodoScheduler` | `server/todoNotifications.js:102` | sim |
| `startRetentionJob` | `server/usageLog.js:98` | sim |

## Repetições (`setInterval`) encontradas no servidor

| Tipo | Onde | Intervalo | O que faz (trecho) |
|---|---|---|---|
| setInterval | `server/assistant.js:18` |  | `() => { const now = Date.now(` |
| setInterval | `server/connect.js:136` |  | `() => { const now = Date.now(` |
| setInterval | `server/crm/scheduler.js:54` | INTERVAL_MS | `tick` |
| setInterval | `server/projectVersions.js:192` | 24 * 3600 * 1000 | `run` |
| setInterval | `server/renata/routes.js:15` |  | `() => { const now = Date.now(` |
| setInterval | `server/routes.js:1300` |  | `() => { const now = Date.now(` |
| setInterval | `server/todoNotifications.js:105` | 30 * 60 * 1000 | `tick` |
| setInterval | `server/usageLog.js:101` | 24 * 3600 * 1000 | `run` |
| setInterval | `server/widget.js:36` |  | `() => { const now = Date.now(` |
