import { apiErrorHandler } from './errorHandler.js';
import { router as experienceRouter } from './experience.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, seedIfEmpty, migrateToPricetaxOrg, migrateAccessModel, migrateXflowBoardOrder, migrateInsightsToKnowledgeFacts } from './db.js';
import { router as apiRouter } from './routes.js';
import { router as xflowRouter } from './xflow.js';
import { router as googleRouter } from './google.js';
import { router as agendaRouter } from './agenda.js';
import { router as macroRouter } from './macro.js';
import { router as inventoryRouter } from './inventory.js';
import { router as inventoryEditRouter } from './inventoryEdit.js';
import { router as taskLinksRouter } from './taskLinks.js';
import { router as taskLinkBackfillRouter } from './taskLinkBackfill.js';
import { router as standardPlanRouter } from './standardPlanApi.js';
import { markV2Provisional } from './standardTemplateStore.js';
import { router as gapsRouter } from './gaps.js';
import { router as meetingInboxRouter } from './meetingInbox.js';
import { router as assistantRouter } from './assistant.js';
import { router as knowledgeRouter } from './knowledge.js';
import { router as pareceresRouter } from './pareceres.js';
import { router as crmRouter } from './crm/routes.js';
import { router as widgetRouter } from './widget.js';
import { router as dailyRouter } from './daily.js';
import { router as templatesRouter } from './documentTemplates.js';
import { router as connectRouter } from './connect.js';
import { router as companyCalendarRouter } from './companyCalendar.js';
import { router as companyShareRouter, publicRouter as publicCompanyRouter, dataRouter as companyDataRouter } from './companyShare.js';
import { router as pushRouter, pushEnabled } from './push.js';
import { router as opsIntelRouter } from './opsIntel.js';
import { startRetentionJob } from './usageLog.js';
import { router as projectVersionsRouter, startVersionRetentionJob } from './projectVersions.js';
import { startCrmScheduler } from './crm/scheduler.js';
import { startTodoScheduler } from './todoNotifications.js';
import { pool } from './db.js';
import { failOrphanedDossiers } from './dossier.js';
import { countMaps } from './sourcemaps.js';
import { seedQuoteFacts, embedQuoteFacts } from './inspirationQuotes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const app = express();
// Modelos de documentos aceitam arquivo de até 30 MB (base64 ≈ 40 MB): o parser maior precisa vir ANTES do global.
app.use('/api/templates', express.json({ limit: '45mb' }));
app.use(express.json({ limit: '15mb' }));
// Express 5 deixa req.body indefinido quando a requisição não traz corpo JSON (no 4 era {}); os handlers desestruturam req.body.
app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });
app.use(cookieParser());

app.use('/api', apiRouter);
app.use('/api/xflow', xflowRouter);
app.use('/api/google', googleRouter);
app.use('/api/agenda', agendaRouter);
app.use('/api/macro', macroRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/inventory', inventoryEditRouter);
app.use('/api/gaps', gapsRouter);
app.use('/api/task-links', taskLinksRouter);
app.use('/api/task-links', taskLinkBackfillRouter);
app.use('/api/standard-plan', standardPlanRouter);
app.use('/api/meeting-inbox', meetingInboxRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/pareceres', pareceresRouter);
app.use('/api/crm', crmRouter);
app.use('/api/widget', widgetRouter);
app.use('/api/daily', dailyRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/connect', connectRouter);
app.use('/api/company-share', companyShareRouter);
app.use('/api/company-calendar', companyCalendarRouter);
app.use('/api/public-company', publicCompanyRouter);
app.use('/d', companyDataRouter);
app.use('/api/push', pushRouter);
app.use('/api/ops-intel', opsIntelRouter);
app.use('/api/experience', experienceRouter);
app.use('/api/project-history', projectVersionsRouter);

// Rota inexistente sob /api responde 404 em JSON — antes caía no fallback do SPA e devolvia o index.html com 200,
// o que enganava qualquer cliente da API (inclusive a de conectividade, §80).
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Rota não encontrada.' });
});

app.use('/api', apiErrorHandler);

// Arquivos de /assets têm o hash do conteúdo no nome (Vite): podem ficar guardados no navegador por 1 ano. O index.html NÃO (é ele que aponta
// para os arquivos novos a cada deploy). Um arquivo de /assets que não existe responde 404 de verdade — antes caía no index.html com 200 (text/html),
// o que mascarava o erro quando uma aba antiga pedia um pedaço (chunk) já removido por um deploy novo.
// Sourcemaps (dist/assets/*.map, build "hidden") são só do servidor, para traduzir pilhas no log — nunca saem para o público.
// (os .map já ficam fora de dist/; este filtro é a 2ª barreira e olha o caminho DECODIFICADO — "x.js%2emap" também é bloqueado)
app.use((req, res, next) => {
  let p = req.path;
  try { p = decodeURIComponent(req.path); } catch (e) { /* caminho malformado: o static também recusa */ }
  return /\.map$/i.test(p) ? res.status(404).type('text/plain').send('Arquivo não encontrado.') : next();
});
app.use(express.static(distDir, {
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/acompanhamento/') || req.path.startsWith('/a/')) res.set('X-Robots-Tag', 'noindex, nofollow');
  if (req.path.startsWith('/assets/')) return res.status(404).type('text/plain').send('Arquivo não encontrado.');
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = process.env.PORT || 3001;

async function start() {
  await initDb();
  await seedIfEmpty();
  await migrateToPricetaxOrg();
  await migrateAccessModel();
  await migrateXflowBoardOrder();
  await migrateInsightsToKnowledgeFacts();
  try {
    const n = await markV2Provisional();
    if (n) console.log(`cronograma padrão: nota da versão 2.0 marcada como provisória em ${n} organização(ões).`);
  } catch (e) { console.error('cronograma padrão: não consegui marcar a 2.0 como provisória:', e.message); }
  try {
    const n = await failOrphanedDossiers(pool);
    if (n) console.log(`Dossiê: ${n} geração(ões) interrompida(s) por reinício do servidor marcada(s) como erro.`);
  } catch (e) { console.error('Dossiê: não consegui limpar gerações interrompidas:', e.message); }
  // Memória da RENATA: frases de inspiração (§77). Não fatal — o app sobe mesmo se falhar.
  try {
    const n = await seedQuoteFacts(pool);
    if (n) console.log(`RENATA: ${n} fato(s) de frases de inspiração registrados na memória.`);
    embedQuoteFacts(pool).catch((e) => console.error('RENATA: embeddings das frases ficaram para depois:', e.message));
  } catch (e) { console.error('RENATA: não consegui registrar as frases de inspiração:', e.message); }
  app.listen(port, () => {
    console.log(`Cronograma server ouvindo na porta ${port}`);
    countMaps().then((n) => console.log(`sourcemaps (só para o log de erros): ${n} arquivo(s) disponíveis`));
    console.log(pushEnabled() ? 'notificações push: ATIVADAS (chaves VAPID presentes)' : 'notificações push: desativadas (sem chaves VAPID)');
    startCrmScheduler();
    startTodoScheduler();
    startRetentionJob();
    startVersionRetentionJob();
  });
}

start().catch((e) => {
  console.error('Falha ao iniciar o servidor:', e);
  process.exit(1);
});
