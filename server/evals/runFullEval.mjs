#!/usr/bin/env node
// RENATA Eval Harness — Fase 1 — modo FULL EVAL.
// Executa o pipeline REAL de askProjectAssistant (server/assistantRetrieval.js,
// sem nenhuma alteração de comportamento) contra os casos de
// server/evals/evalCases.js. Consome tokens de verdade (ANTHROPIC_API_KEY) —
// por isso NUNCA roda sozinho em build/CI, só por comando explícito:
//
//   node server/evals/runFullEval.mjs [--cache=with|without] [--category=CONFLICT] [--case=temporal-02-hard] [--baseline] [--teardown]
//
// --cache=without (padrão) limpa ai_answer_cache antes de CADA caso, pra
// garantir que uma resposta antiga nunca mascare o comportamento atual.
// --baseline grava o relatório em docs/RENATA_EVAL_BASELINE.md, rotulado
// "BASELINE — BEFORE P0/P1 BRAIN IMPROVEMENTS", e registra a execução em
// ai_eval_runs (histórico, fora do caminho crítico de produção).
// --teardown remove toda a fixture do Postgres local ao final (por padrão
// ela FICA no banco, pra permitir inspecionar/reexecutar sem re-seedar).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { EVAL_CASES } from './evalCases.js';
import { runEvalSuite } from './evalRunner.js';
import { buildReport, buildFailureTraces } from './evalReport.js';
import { EVAL_ORG_ID, teardownFixtures } from './fixtures.js';

function loadDotEnvIfPresent() {
  // Mesmo padrão do resto do projeto: sem dependência de `dotenv` (não é
  // uma dependência do package.json) — só um parser mínimo, igual ao usado
  // em scripts `_test_*.mjs` descartáveis desta base.
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function parseArgs(argv) {
  const args = { cache: 'without', category: null, caseId: null, baseline: false, teardown: false };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (key === 'cache') args.cache = value;
    else if (key === 'category') args.category = value;
    else if (key === 'case') args.caseId = value;
    else if (key === 'baseline') args.baseline = true;
    else if (key === 'teardown') args.teardown = true;
  }
  return args;
}

async function main() {
  loadDotEnvIfPresent();
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      '\nFULL EVAL não pode rodar: ANTHROPIC_API_KEY não está configurada neste ambiente.\n' +
      'Este é o mesmo pipeline de produção (askProjectAssistant chama resolveQuery/synthesizeAnswer via Anthropic) — sem a chave,\n' +
      'não existe forma honesta de medir o comportamento real da RENATA (rodar sem a chave produziria só erros, não um baseline).\n' +
      'Configure ANTHROPIC_API_KEY em .env ou na variável de ambiente e rode de novo.\n',
    );
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('\nFULL EVAL não pode rodar: DATABASE_URL não configurada (precisa de um Postgres local pra seedar a fixture).\n');
    process.exit(2);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  let cases = EVAL_CASES;
  if (args.category) cases = cases.filter((c) => c.category === args.category);
  if (args.caseId) cases = cases.filter((c) => c.id === args.caseId);
  if (!cases.length) {
    console.error(`Nenhum caso encontrado pro filtro informado (category=${args.category}, case=${args.caseId}).`);
    process.exit(2);
  }

  console.log(`RENATA Eval Harness — FULL EVAL — ${cases.length} caso(s), cache=${args.cache}${args.baseline ? ' [BASELINE]' : ''}\n`);

  const startedAt = Date.now();
  const { results } = await runEvalSuite(pool, cases, { cacheMode: args.cache });
  const elapsedMs = Date.now() - startedAt;

  const label = args.baseline
    ? 'BASELINE — BEFORE P0/P1 BRAIN IMPROVEMENTS (Fase 1, nenhuma mudança arquitetural aplicada)'
    : `Execução ad-hoc — ${new Date().toISOString()}`;
  const report = buildReport(results, { label, baseline: args.baseline });
  const traces = buildFailureTraces(results);

  console.log(report.text);
  console.log(`\n\nTempo total de execução do harness: ${(elapsedMs / 1000).toFixed(1)}s\n`);

  const totalTokens = results.reduce((sum, r) => sum + r.performance.tokensInput + r.performance.tokensOutput, 0);
  console.log(`Tokens totais consumidos nesta execução: ${totalTokens} (input+output, soma de todos os casos)`);

  if (args.baseline) {
    const outPath = path.resolve(process.cwd(), 'docs/RENATA_EVAL_BASELINE.md');
    const fullDoc = [report.text, '\n---\n', traces].join('\n');
    fs.writeFileSync(outPath, fullDoc, 'utf8');
    console.log(`\nBaseline gravado em ${outPath}`);

    await pool.query(
      `INSERT INTO ai_eval_runs (id, org_id, run_at, git_commit, eval_set_version, results, summary_metrics)
       VALUES ($1,$2,now(),$3,$4,$5,$6)`,
      [
        `eval-run-${Date.now()}`, EVAL_ORG_ID, process.env.GIT_COMMIT || null, 'v1-fase1',
        JSON.stringify(results.map((r) => ({ id: r.id, category: r.category, passed: r.passed, failReasons: r.failReasons }))),
        JSON.stringify({ total: report.total, passed: report.passed, failed: report.failed, totalTokens, elapsedMs }),
      ],
    ).catch((e) => console.error('Aviso: falha ao gravar em ai_eval_runs (não bloqueia o baseline já salvo em docs/).', e.message));
  } else {
    const outPath = path.resolve(process.cwd(), 'server/evals/.last-run-failure-traces.md');
    fs.writeFileSync(outPath, traces, 'utf8');
    console.log(`\nFailure traces desta execução salvos em ${outPath}`);
  }

  if (args.teardown) {
    await teardownFixtures(pool);
    console.log('\nFixture removida do Postgres local (--teardown).');
  }

  await pool.end();
  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FULL EVAL falhou de forma inesperada:', e);
  process.exit(2);
});
