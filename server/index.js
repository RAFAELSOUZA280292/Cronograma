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
import { startCrmScheduler } from './crm/scheduler.js';
import { startTodoScheduler } from './todoNotifications.js';
import { pool } from './db.js';
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

// Rota inexistente sob /api responde 404 em JSON — antes caía no fallback do SPA e devolvia o index.html com 200,
// o que enganava qualquer cliente da API (inclusive a de conectividade, §80).
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Rota não encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use('/api', (err, req, res, next) => {
  // Erros de validação conhecidos (4xx lançados com `status`, ex.: anexo grande demais) voltam com a mensagem; o resto é 500 genérico.
  if (err && err.type === 'entity.too.large') return res.status(413).json({ message: 'O conteúdo enviado é grande demais. Reduza o tamanho dos anexos e tente de novo.' });
  if (err && err.status >= 400 && err.status < 500 && err.message) return res.status(err.status).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Erro interno do servidor.' });
});

// Arquivos de /assets têm o hash do conteúdo no nome (Vite): podem ficar guardados no navegador por 1 ano. O index.html NÃO (é ele que aponta
// para os arquivos novos a cada deploy). Um arquivo de /assets que não existe responde 404 de verdade — antes caía no index.html com 200 (text/html),
// o que mascarava o erro quando uma aba antiga pedia um pedaço (chunk) já removido por um deploy novo.
app.use(express.static(distDir, {
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
app.get('/{*splat}', (req, res) => {
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
  // Memória da RENATA: frases de inspiração (§77). Não fatal — o app sobe mesmo se falhar.
  try {
    const n = await seedQuoteFacts(pool);
    if (n) console.log(`RENATA: ${n} fato(s) de frases de inspiração registrados na memória.`);
    embedQuoteFacts(pool).catch((e) => console.error('RENATA: embeddings das frases ficaram para depois:', e.message));
  } catch (e) { console.error('RENATA: não consegui registrar as frases de inspiração:', e.message); }
  app.listen(port, () => {
    console.log(`Cronograma server ouvindo na porta ${port}`);
    startCrmScheduler();
    startTodoScheduler();
  });
}

start().catch((e) => {
  console.error('Falha ao iniciar o servidor:', e);
  process.exit(1);
});
