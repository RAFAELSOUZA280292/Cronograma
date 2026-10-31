// Teste de fluxos críticos (Onda 4, E2): Playwright + axe-core contra o servidor REAL (serve `dist/`), com banco local próprio e a RENATA roteirizada.
//   npm run test:e2e        (faz o build, prepara o banco `cronograma_e2e` e roda)
// Nada aqui toca produção: o banco precisa ser local (prepare.mjs e este arquivo recusam outro). O Chromium vem do cache do Playwright; `PW_CHROMIUM` troca o caminho.
import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
export const PORT = Number(process.env.E2E_PORT || 3077);
export const DB = process.env.E2E_DATABASE_URL || 'postgres://localhost:5432/cronograma_e2e';
if (!/^postgres(ql)?:\/\/(?:[^@/]*@)?(localhost|127\.0\.0\.1)(:\d+)?\//.test(DB)) throw new Error('E2E_DATABASE_URL precisa ser um Postgres local.');
process.env.DATABASE_URL = DB; // o setup importa server/db.js neste processo

function findChromium() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  try {
    for (const d of fs.readdirSync(cache).filter((x) => x.startsWith('chromium_headless_shell-')).sort().reverse()) {
      for (const sub of fs.readdirSync(path.join(cache, d))) { const p = path.join(cache, d, sub, 'chrome-headless-shell'); if (fs.existsSync(p)) return p; }
    }
  } catch { /* cai no padrão do Playwright */ }
  return undefined;
}

export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.mjs$/,
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  globalSetup: path.join(here, 'setup.mjs'),
  use: { baseURL: `http://localhost:${PORT}`, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', launchOptions: { executablePath: findChromium() }, trace: 'retain-on-failure' },
  outputDir: path.join(os.tmpdir(), 'ptx-e2e-results'),
  webServer: {
    command: 'node server/index.js',
    cwd: root,
    url: `http://localhost:${PORT}/api/auth/me`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 60000,
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: 'e2e-segredo-local', NODE_ENV: 'development', RENATA_SCRIPTED_MODEL: path.join(here, 'renata-script.mjs'), ANTHROPIC_API_KEY: '', VOYAGE_API_KEY: '' },
    stdout: 'ignore', stderr: 'pipe',
  },
});
