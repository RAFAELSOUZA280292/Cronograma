// Roda os testes PUROS (sem banco, sem servidor, sem chave de IA): são os que o CI executa a cada push. Rodar: npm run test:puro
// Os demais scripts de scripts/*.test.mjs precisam do Postgres local e do servidor local e continuam manuais (docs/gerado/TESTES.md).
// Teste novo que não use banco nem rede entra na lista abaixo; quem usar banco/servidor NÃO entra (o CI não tem nenhum dos dois).
import { spawnSync } from 'node:child_process';

const PUROS = [
  'scripts/board-history.test.mjs', 'scripts/board-merge.test.mjs', 'scripts/board-plan.test.mjs', 'scripts/chat-export.test.mjs',
  'scripts/connect-guide.test.mjs', 'scripts/connect-fixes.test.mjs', 'scripts/crm-board-move.test.mjs', 'scripts/crm-notes-rich.test.mjs',
  'scripts/daily-export.test.mjs', 'scripts/error-messages.test.mjs', 'scripts/focus.test.mjs', 'scripts/inspiration-quotes.test.mjs',
  'scripts/parecer-study-truncation.test.mjs', 'scripts/project-merge.test.mjs', 'scripts/renata-confirmacao-lote.test.mjs',
  'scripts/renata-general-ids.test.mjs', 'scripts/save-retry.test.mjs', 'scripts/schedule-version.test.mjs', 'scripts/team-day.test.mjs',
  'scripts/usage-metrics.test.mjs', 'scripts/prompt-guard.test.mjs', 'scripts/ui-audit.test.mjs', 'scripts/payload-stats.test.mjs', 'scripts/shortcuts.test.mjs', 'scripts/status-dot.test.mjs', 'scripts/ink-on.test.mjs',
  'server/evals/runUnitEval.mjs',
];

const env = { ...process.env };
for (const k of ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'VOYAGE_API_KEY', 'BASE', 'SBX_PASS']) delete env[k];

let failed = 0;
for (const f of PUROS) {
  const r = spawnSync(process.execPath, [f], { env, encoding: 'utf8', timeout: 120000 });
  const ok = r.status === 0;
  const last = String(r.stdout || '').trim().split('\n').pop() || '';
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${f}${ok ? '' : ` (saída ${r.status})`}  ${ok ? last.slice(0, 70) : ''}`);
  if (!ok) { failed += 1; console.log(String(r.stdout || '').slice(-1200)); console.log(String(r.stderr || '').slice(-1200)); }
}
console.log(`\n${PUROS.length - failed} de ${PUROS.length} arquivos passaram${failed ? ` — ${failed} falharam` : ''}.`);
process.exit(failed ? 1 : 0);
