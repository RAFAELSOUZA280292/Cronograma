// Backfill manual da memória do projeto (2026-09, Fase 1 do Assistente
// Inteligente de Projetos) — indexa TODAS as reuniões já existentes em
// TODOS os projetos, não só as novas daqui pra frente. Rodar uma vez
// (local: `DATABASE_URL=... node server/scripts/reindexAllMeetings.js`;
// produção: revisar com o Rafael antes, é uma escrita em massa numa
// tabela nova). Seguro de rodar mais de uma vez — reindexação é sempre
// apagar-e-recriar por reunião (ver server/memoryIngest.js).
import { pool } from '../db.js';
import { reindexProjectMemory } from '../memoryIngest.js';

async function main() {
  const { rows } = await pool.query('SELECT id, data, org_id FROM projects');
  console.log(`Encontrados ${rows.length} projetos.`);
  let totalMeetings = 0, totalChunks = 0;
  for (const row of rows) {
    const project = row.data || {};
    const companyName = (project.company && project.company.name) || row.id;
    const { meetingsIndexed, chunksCreated } = await reindexProjectMemory(pool, row.org_id, row.id, project);
    if (meetingsIndexed > 0) {
      console.log(`  ${companyName}: ${meetingsIndexed} reunião(ões), ${chunksCreated} chunk(s)`);
    }
    totalMeetings += meetingsIndexed;
    totalChunks += chunksCreated;
  }
  console.log(`Concluído: ${totalMeetings} reuniões indexadas, ${totalChunks} chunks criados no total.`);
  await pool.end();
}

main().catch((e) => { console.error('Falha no backfill:', e); process.exit(1); });
