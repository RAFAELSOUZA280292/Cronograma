// Conferidor da documentação (2026-10-29): lê docs/*.md (os numerados 00–10 e CLAUDE.md) e confere contra o CÓDIGO:
//   1) todo caminho citado em `crase` (server/…, src/…, scripts/…, docs/…, shared/…, public/…) existe;
//   2) toda referência `arquivo:linha` aponta para uma linha que existe no arquivo;
//   3) toda rota `/api/…` citada existe em docs/gerado/ROTAS.md (ou é um prefixo montado);
//   4) toda variável de AMBIENTE citada (NOME_EM_MAIUSCULAS) consta em docs/gerado/VARIAVEIS_DE_AMBIENTE.md ou na lista de exceções conhecidas;
//   5) NENHUM segredo vazou (chave de API, token pxk_/pxw_ completo, senha em URL de banco, chave privada).
//   node scripts/docs-check.mjs            # relatório; sai com código 1 só se achar SEGREDO ou caminho inexistente em excesso (--estrito: qualquer erro)
//   node scripts/docs-check.mjs --so arquivo.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const estrito = args.includes('--estrito');
const so = args.includes('--so') ? args[args.indexOf('--so') + 1] : '';
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const docsDir = path.join(ROOT, 'docs');
const files = fs.readdirSync(docsDir).filter((f) => /^(0\d|1\d)_.*\.md$/.test(f)).map((f) => path.join('docs', f));
files.push('CLAUDE.md');
const targets = so ? files.filter((f) => f.endsWith(so)) : files;

const rotas = fs.existsSync(path.join(ROOT, 'docs/gerado/ROTAS.md')) ? read(path.join(ROOT, 'docs/gerado/ROTAS.md')) : '';
const rotaSet = [...rotas.matchAll(/^\| (GET|POST|PUT|PATCH|DELETE|ALL|USE) \| `([^`]+)`/gm)].map((m) => m[2]);
const mounts = [...rotas.matchAll(/^\| `(\/[^`]*)` \| `server\//gm)].map((m) => m[1]);
const toRe = (r) => new RegExp(`^${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z_]+/g, '[^/]+').replace(/\\\[\^\/\]\+/g, '[^/]+')}$`);
const rotaRes = rotaSet.map(toRe);
const envs = fs.existsSync(path.join(ROOT, 'docs/gerado/VARIAVEIS_DE_AMBIENTE.md')) ? new Set([...read(path.join(ROOT, 'docs/gerado/VARIAVEIS_DE_AMBIENTE.md')).matchAll(/^\| `([A-Z][A-Z0-9_]+)`/gm)].map((m) => m[1])) : new Set();
const ENV_OK = new Set(['PRICETAX_URL', 'PRICETAX_TOKEN', 'PRICETAX_CRM_TOKEN', 'RAILWAY_API_TOKEN', 'RAILWAY_TOKEN', 'PRICETAX_TRANSCRIPTS_TOKEN', 'PRICETAX_MEETINGS_TOKEN', 'RENATA_SCRIPTED_MODEL', 'RENATA_MODEL', 'ANTHROPIC_BASE_URL', 'BASE', 'HOME', 'PATH', 'NODE_ENV', 'DATABASE_URL', 'JWT_SECRET']);
const NOT_ENV = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'ALL', 'USE', 'JSON', 'SQL', 'API', 'HTTP', 'HTTPS', 'PDF', 'CSV', 'ICS', 'IA', 'CRM', 'RT', 'OK', 'SPA', 'PWA', 'JWT', 'CPF', 'CNPJ', 'IBS', 'CBS', 'PIS', 'COFINS', 'ICMS', 'LGPD', 'XSS', 'CORS', 'UTC', 'GMT', 'BRT', 'TTL', 'URL', 'ID', 'FK', 'PK', 'UUID', 'SSL', 'TLS', 'ISO', 'RSVP', 'SDR', 'XML', 'XLSX', 'BYTEA', 'JSONB', 'NULL', 'TRUE', 'FALSE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SELECT', 'INSERT', 'UPDATE', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'FOR', 'ON', 'IN', 'AS', 'LIMIT', 'OFFSET', 'ORDER', 'BY']);

const ID_OK = new Set(['requireAuth', 'pushState', 'popState', 'localStorage', 'sessionStorage', 'useState', 'useEffect', 'dryRun', 'orgId', 'userId', 'maxRetries', 'countTokens', 'injectManifest', 'savedStatusLabel']);
const SEGREDOS = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'chave da Anthropic'],
  [/pxk_[A-Za-z0-9_-]{20,}/, 'token de conectividade completo'],
  [/pxw_[A-Za-z0-9_-]{20,}/, 'token de widget completo'],
  [/postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/, 'senha em URL de banco'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'chave privada'],
  [/\b(?:xox[baprs]-|ghp_|github_pat_|AKIA)[A-Za-z0-9_-]{12,}/, 'token de serviço externo'],
  [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, 'JWT completo'],
];

// Texto de todo o código-fonte: constantes em MAIÚSCULAS (ex.: MAX_STEPS) só são suspeitas se não existirem em lugar nenhum.
const walk = (dir, acc = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (['node_modules', 'dist', '.sourcemaps', '.git'].includes(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, acc); else if (/\.(m?js|jsx|css|py|sh|json)$/.test(e.name)) acc.push(p); } return acc; };
const CODE = ['server', 'src', 'shared', 'scripts'].filter((d) => fs.existsSync(path.join(ROOT, d))).flatMap((d) => walk(path.join(ROOT, d))).map((f) => read(f)).join('\n');
const ROTAS_QUE_NAO_EXISTEM_DE_PROPOSITO = new Set(['/api/health']);
let secretHits = 0; let missingPaths = 0; let badLines = 0; let badRoutes = 0; let badEnvs = 0; let badIds = 0;
const report = [];
for (const f of targets) {
  const text = read(path.join(ROOT, f)); const lines = text.split('\n');
  const local = { paths: new Set(), lines: new Set(), routes: new Set(), envs: new Set(), ids: new Set() };
  lines.forEach((l, i) => {
    for (const [re, nome] of SEGREDOS) if (re.test(l)) { secretHits += 1; report.push(`SEGREDO  ${f}:${i + 1}  ${nome}`); }
    // caminhos e arquivo:linha dentro de `crase`
    for (const m of l.matchAll(/`((?:server|src|scripts|docs|shared|public)\/[A-Za-z0-9_./\-]+?\.[A-Za-z0-9]+)(?::(\d+)(?:-(\d+))?)?`/g)) {
      const p = m[1];
      if (/[*<>{}]/.test(p)) continue;
      if (!exists(p)) { local.paths.add(p); continue; }
      if (m[2]) { const n = read(path.join(ROOT, p)).split('\n').length; if (Number(m[2]) > n || (m[3] && Number(m[3]) > n)) local.lines.add(`${p}:${m[2]} (arquivo tem ${n} linhas)`); }
    }
    // rotas
    for (const m of l.matchAll(/`(?:(?:GET|POST|PUT|PATCH|DELETE)\s+)?(\/(?:api|d)\/[A-Za-z0-9_\-:/.{}…*]*)`/g)) {
      const r = m[1].replace(/[….]+$/, '').replace(/\/$/, '').split('?')[0]; if (!r || /[*{}…]/.test(r) || /\[/.test(r)) continue;
      if (rotaRes.some((re) => re.test(r)) || mounts.includes(r) || mounts.some((p) => r === p || (r.startsWith(`${p}/`) && /\/…|\/\*/.test(m[1])))) continue;
      if (rotaSet.some((x) => x.startsWith(`${r}/`))) continue; // prefixo de rotas existentes
      if (!ROTAS_QUE_NAO_EXISTEM_DE_PROPOSITO.has(r)) local.routes.add(r);
    }
    // identificadores camelCase em crase (funções/variáveis): precisam existir em algum lugar do código — detector de nome inventado
    for (const m of l.matchAll(/`([a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+)(?:\(.*?\))?`/g)) { const id = m[1]; if (id.length >= 6 && !CODE.includes(id) && !ID_OK.has(id)) local.ids.add(id); }
    // variáveis de ambiente em crase
    for (const m of l.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g)) { const v = m[1]; if (!NOT_ENV.has(v) && !envs.has(v) && !ENV_OK.has(v) && !/^(GET|POST)_/.test(v) && !CODE.includes(v)) local.envs.add(v); }
  });
  badIds += local.ids.size; missingPaths += local.paths.size; badLines += local.lines.size; badRoutes += local.routes.size; badEnvs += local.envs.size;
  const bits = [];
  if (local.paths.size) bits.push(`  caminhos que NÃO existem (${local.paths.size}): ${[...local.paths].slice(0, 12).join(', ')}`);
  if (local.lines.size) bits.push(`  linhas fora do arquivo (${local.lines.size}): ${[...local.lines].slice(0, 8).join('; ')}`);
  if (local.routes.size) bits.push(`  rotas que não constam no catálogo (${local.routes.size}): ${[...local.routes].slice(0, 12).join(', ')}`);
  if (local.ids.size) bits.push(`  identificadores camelCase que NÃO existem no código (${local.ids.size}): ${[...local.ids].slice(0, 15).join(', ')}`);
  if (local.envs.size) bits.push(`  nomes em MAIÚSCULAS que não existem no código (${local.envs.size}): ${[...local.envs].slice(0, 12).join(', ')}`);
  report.push(`${bits.length ? 'ATENÇÃO ' : 'ok       '}${f} (${lines.length} linhas)${bits.length ? `\n${bits.join('\n')}` : ''}`);
}
console.log(report.join('\n'));
console.log(`\nresumo: ${targets.length} documentos · segredos ${secretHits} · caminhos inexistentes ${missingPaths} · linhas inválidas ${badLines} · rotas fora do catálogo ${badRoutes} · variáveis fora do catálogo ${badEnvs} · identificadores inexistentes ${badIds}`);
process.exit(secretHits || (estrito && (missingPaths || badLines || badRoutes || badEnvs || badIds)) ? 1 : 0);
