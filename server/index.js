import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, seedIfEmpty, migrateToPricetaxOrg } from './db.js';
import { router as apiRouter } from './routes.js';
import { router as xflowRouter } from './xflow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

app.use('/api', apiRouter);
app.use('/api/xflow', xflowRouter);

// eslint-disable-next-line no-unused-vars
app.use('/api', (err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Erro interno do servidor.' });
});

app.use(express.static(distDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = process.env.PORT || 3001;

async function start() {
  await initDb();
  await seedIfEmpty();
  await migrateToPricetaxOrg();
  app.listen(port, () => {
    console.log(`Cronograma server ouvindo na porta ${port}`);
  });
}

start().catch((e) => {
  console.error('Falha ao iniciar o servidor:', e);
  process.exit(1);
});
