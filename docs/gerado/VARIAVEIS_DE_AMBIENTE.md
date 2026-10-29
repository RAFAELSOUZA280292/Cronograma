# Variáveis de ambiente (gerado)

> Gerado automaticamente por `scripts/docs-gen.mjs` a partir do código. **Não edite à mão** — rode `npm run docs:gerar`.

Só os **nomes** e onde são lidos; **nunca** valores. Os valores reais ficam no Railway (produção) e no `.env` local (que nunca vai para o git). A coluna "Linha de exemplo" mostra o uso no código (inclui o valor padrão, quando existe).

| Variável | Lida em | Linha de exemplo |
|---|---|---|
| `ACCESS_RETENTION_DAYS` | `server/usageLog.js` | `accessDays: Math.max(90, Number(process.env.ACCESS_RETENTION_DAYS) \|\| 730),` |
| `ANTHROPIC_API_KEY` | `server/assistant.js`, `server/assistantGeneral.js`, `server/dailyContent.js`, `server/evals/runFullEval.mjs` +8 | `if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ message: 'Assistente não configurado nesse ambiente (falta ANTHROPIC_API_KEY).' });` |
| `APP_BASE_URL` | `server/companyCalendar.js`, `server/crm/googleSync.js`, `server/google.js`, `server/xflow.js` | `const appUrl = () => process.env.APP_BASE_URL \|\| '';` |
| `DATABASE_URL` | `server/db.js`, `server/evals/runFullEval.mjs`, `server/renata/scriptedClient.js` | `connectionString: process.env.DATABASE_URL,` |
| `GIT_COMMIT` | `server/evals/runFullEval.mjs` | ``eval-run-${Date.now()}`, EVAL_ORG_ID, process.env.GIT_COMMIT \|\| null, 'v1-fase1',` |
| `GOOGLE_CLIENT_ID` | `server/googleCalendar.js` | `process.env.GOOGLE_CLIENT_ID,` |
| `GOOGLE_CLIENT_SECRET` | `server/googleCalendar.js` | `process.env.GOOGLE_CLIENT_SECRET,` |
| `GOOGLE_REDIRECT_URI` | `server/googleCalendar.js` | `process.env.GOOGLE_REDIRECT_URI` |
| `JWT_SECRET` | `server/auth.js`, `server/widget.js` | `const secret = process.env.JWT_SECRET;` |
| `NODE_ENV` | `server/auth.js`, `server/google.js`, `server/index.js`, `server/renata/scriptedClient.js` | `secure: process.env.NODE_ENV === 'production',` |
| `PORT` | `server/index.js`, `server/renata/internalCall.js` | `const port = process.env.PORT \|\| 3001;` |
| `PROD` | `src/main.jsx` | `if (import.meta.env.PROD && 'serviceWorker' in navigator) {` |
| `PUSH_EXTRA_HOSTS` | `server/push.js` | `const extra = (process.env.PUSH_EXTRA_HOSTS \|\| '').split(',').map((s) => s.trim()).filter(Boolean);` |
| `RENATA_MODEL` | `server/renata/agent.js` | `export const RENATA_MODEL = process.env.RENATA_MODEL \|\| 'claude-sonnet-5';` |
| `RENATA_SCRIPTED_MODEL` | `server/renata/scriptedClient.js` | `const file = process.env.RENATA_SCRIPTED_MODEL;` |
| `SEED_ADMIN_NAME` | `server/db.js` | `[uid('user'), username, hash, process.env.SEED_ADMIN_NAME \|\| 'Administrador PRICETAX']` |
| `SEED_ADMIN_PASSWORD` | `server/db.js` | `const password = process.env.SEED_ADMIN_PASSWORD;` |
| `SEED_ADMIN_USERNAME` | `server/db.js` | `const seedUsername = process.env.SEED_ADMIN_USERNAME;` |
| `TASK_LINK_AUTO` | `server/taskLinkSuggest.js` | `const auto = process.env.TASK_LINK_AUTO !== 'off';` |
| `TASK_LINK_MODE` | `server/taskLinkBackfill.js`, `server/taskLinkSuggest.js`, `server/taskLinks.js` | `res.json({ ...estimate(await accessibleProjects(req.user, effectiveOrgId(req))), mode: process.env.TASK_LINK_MODE \|\| 'normal', aiConfigured: !!proces…` |
| `USAGE_RETENTION_DAYS` | `server/usageLog.js` | `usageDays: Math.max(30, Number(process.env.USAGE_RETENTION_DAYS) \|\| 395),` |
| `VAPID_PRIVATE_KEY` | `server/push.js` | `const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY \|\| '';` |
| `VAPID_PUBLIC_KEY` | `server/push.js` | `const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY \|\| '';` |
| `VAPID_SUBJECT` | `server/push.js` | `const SUBJECT = process.env.VAPID_SUBJECT \|\| 'https://painel.pricetax.com.br';` |
| `VERSIONS_DELETED_DAYS` | `server/projectVersions.js` | `deletedDays: Math.max(30, Number(process.env.VERSIONS_DELETED_DAYS) \|\| 365),` |
| `VERSIONS_FULL_DAYS` | `server/projectVersions.js` | `fullDays: Math.max(7, Number(process.env.VERSIONS_FULL_DAYS) \|\| 90),` |
| `VERSIONS_KEEP_DAYS` | `server/projectVersions.js` | `keepDays: Math.max(90, Number(process.env.VERSIONS_KEEP_DAYS) \|\| 730),` |
| `VOYAGE_API_KEY` | `server/embeddings.js` | `return !!process.env.VOYAGE_API_KEY;` |
