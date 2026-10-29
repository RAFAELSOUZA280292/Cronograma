// Gerador de documentação exata (2026-10-29). Lê o CÓDIGO e o BANCO e escreve docs/gerado/*.md — o que é fato verificável (rotas, tabelas, variáveis, tarefas agendadas,
// testes, arquivos, índice do PROJECT_CONTEXT, histórico do git). Nunca escreve valor de segredo: só NOMES de variáveis.
//   node scripts/docs-gen.mjs [--git /caminho/do/clone-com-historico] [--db postgres://localhost:5432/cronograma_dev]
// Rode de novo sempre que mudar rota, tabela, variável, tarefa agendada ou teste. O texto explicativo (manuais, segurança, arquitetura) fica em docs/*.md, escrito à mão.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'gerado');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8');
const walk = (dir, filter, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.sourcemaps', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, acc); else if (filter(p)) acc.push(p);
  }
  return acc.sort();
};
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const STAMP = `> Gerado automaticamente por \`scripts/docs-gen.mjs\` a partir do código. **Não edite à mão** — rode \`npm run docs:gerar\`.`;
fs.mkdirSync(OUT, { recursive: true });
const write = (name, body) => { fs.writeFileSync(path.join(OUT, name), `${body.trimEnd()}\n`); console.log(`ok  docs/gerado/${name} (${body.split('\n').length} linhas)`); };

// ============================================================================ 1) ROTAS
function mountsFromIndex() {
  const idx = read(path.join(ROOT, 'server/index.js'));
  const imports = {};
  for (const m of idx.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/([^']+)\.js'/g)) {
    for (const part of m[1].split(',')) {
      const [orig, alias] = part.trim().split(/\s+as\s+/);
      if (orig) imports[(alias || orig).trim()] = { file: `server/${m[2]}.js`, exported: orig.trim() };
    }
  }
  const mounts = [];
  for (const m of idx.matchAll(/app\.use\(\s*'([^']+)'\s*,\s*([A-Za-z0-9_]+)\s*\)/g)) {
    if (imports[m[2]]) mounts.push({ prefix: m[1], ...imports[m[2]], line: lineOf(idx, m.index) });
  }
  return mounts;
}

function scanRoutes() {
  const mounts = mountsFromIndex();
  const byFileVar = new Map(mounts.map((m) => [`${m.file}#${m.exported}`, m.prefix]));
  const byFile = new Map(); mounts.forEach((m) => { if (!byFile.has(m.file)) byFile.set(m.file, m.prefix); });
  const files = walk(path.join(ROOT, 'server'), (p) => p.endsWith('.js') && !p.includes('/scripts/') && !p.includes('/evals/'));
  const routes = [];
  const re = /\b(\w*[rR]outer|r|app)\.(get|post|put|patch|delete|all)\(\s*(['"`])([^'"`\n]+)\3([^\n]*)/g;
  for (const f of files) {
    const text = read(f); const lines = text.split('\n'); const fr = rel(f);
    for (const m of text.matchAll(re)) {
      const ln = lineOf(text, m.index);
      const variable = m[1];
      const prefix = byFileVar.get(`${fr}#${variable}`) ?? byFile.get(fr) ?? (fr.startsWith('server/crm/') ? '/api/crm' : '(sem prefixo conhecido)'); // subpastas do CRM são montadas por server/crm/routes.js
      const restLine = m[5] || '';
      const head = restLine.split(/async\s*\(|\(req|function\s*\(|wrap\(/)[0];
      const mws = head.split(',').map((s) => s.trim()).filter((s) => s && !/^[)}\]]+$/.test(s)).filter((s) => /^[A-Za-z_$][\w$.]*(\(.*\))?$/.test(s) && !/^(async|req|res|next)$/.test(s));
      // comentário logo acima (até 2 linhas seguidas)
      const com = [];
      for (let i = ln - 2; i >= 0 && com.length < 2 && /^\s*\/\//.test(lines[i]); i -= 1) com.unshift(lines[i].replace(/^\s*\/\/\s?/, ''));
      const tail = (restLine.match(/\/\/\s*(.+)$/) || [])[1] || '';
      routes.push({ method: m[2].toUpperCase(), prefix, sub: m[4], file: fr, line: ln, mws, note: clip(com.join(' ') || tail, 170) });
    }
    // sub-montagens (router.use('/x', ...)) — só registrar
    for (const m of text.matchAll(/\brouter\.use\(\s*'(\/[^']*)'\s*,([^\n]*)/g)) {
      routes.push({ method: 'USE', prefix: byFile.get(fr) ?? '', sub: m[1], file: fr, line: lineOf(text, m.index), mws: [], note: clip(`monta: ${m[2]}`, 170) });
    }
  }
  return { mounts, routes };
}

function genRoutes() {
  const { mounts, routes } = scanRoutes();
  const full = (r) => `${r.prefix === '/api' ? '/api' : r.prefix}${r.sub === '/' && r.prefix !== '/api' ? '' : r.sub}`.replace(/\/\//g, '/');
  const groups = new Map();
  for (const r of routes) { const k = r.prefix; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const out = [`# Rotas da API (catálogo gerado)\n\n${STAMP}\n`,
    `Total: **${routes.filter((r) => r.method !== 'USE').length} rotas** em **${groups.size} grupos**. Cada linha mostra o método, o endereço completo, a proteção que aparece na própria linha da rota (\`requireAuth\`, etc.) e onde fica o código. A coluna "Proteção" vem do código: se estiver vazia, **olhe o arquivo** — a proteção pode estar em \`router.use(...)\` no topo do arquivo (ver "Proteção do grupo" abaixo de cada título).\n`,
    '## Como o servidor monta os grupos (`server/index.js`)\n', '| Prefixo | Arquivo | Linha |', '|---|---|---|',
    ...mounts.map((m) => `| \`${m.prefix}\` | \`${m.file}\` | ${m.line} |`),
    '\nMontagens extras (fora do `index.js`): `/api/connect/crm` = o roteador do CRM (`server/crm/routes.js`) reaproveitado por `server/connect.js` para a chave `crm_operate`/`write_all`/`read_all`; `/api/templates` tem limite de corpo próprio (45 MB) definido no `index.js`.\n'];
  const order = [...groups.keys()].sort((a, b) => (a === '/api' ? -1 : b === '/api' ? 1 : a.localeCompare(b)));
  for (const k of order) {
    const list = groups.get(k).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    const files = [...new Set(list.map((r) => r.file))];
    const guard = files.map((f) => { const t = read(path.join(ROOT, f)); const ms = [...t.matchAll(/\brouter\.use\(\s*([A-Za-z_$][\w$.]*(?:\([^)]*\))?)\s*\)/g)].map((m) => m[1]); return ms.length ? `\`${f}\`: ${ms.map((x) => `\`${x}\``).join(', ')}` : ''; }).filter(Boolean);
    out.push(`## \`${k}\` — ${list.filter((r) => r.method !== 'USE').length} rotas\n`);
    out.push(`Arquivos: ${files.map((f) => `\`${f}\``).join(', ')}.${guard.length ? ` Proteção do grupo (\`router.use\` global): ${guard.join('; ')}.` : ''}\n`);
    out.push('| Método | Endereço | Proteção na linha | Para que serve (comentário do código) | Onde |', '|---|---|---|---|---|');
    for (const r of list) out.push(`| ${r.method} | \`${esc(full(r))}\` | ${r.mws.length ? esc(r.mws.map((x) => `\`${x}\``).join(' ')) : ''} | ${esc(r.note)} | \`${r.file}:${r.line}\` |`);
    out.push('');
  }
  out.push('## Rotas que NÃO passam pelo roteador `/api`\n', '- `GET /d/…` (dados públicos do link de acompanhamento) e `/a/…`, `/acompanhamento/…` (páginas públicas; `X-Robots-Tag: noindex`) — ver `server/companyShare.js` e `server/index.js`.',
    '- Arquivos estáticos do front (`dist/`) e o *fallback* de página única (SPA) ficam no fim do `server/index.js`; qualquer `/api/...` desconhecido responde 404 em JSON.');
  write('ROTAS.md', out.join('\n'));
  return routes.length;
}

// ============================================================================ 2) BANCO
async function genDb() {
  const url = opt('--db', process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev');
  if (!/localhost|127\.0\.0\.1/.test(url)) { console.log('pulado: BANCO.md só lê banco LOCAL'); return; }
  let pg; try { pg = (await import('pg')).default; } catch { console.log('pulado: pacote pg ausente'); return; }
  const pool = new pg.Pool({ connectionString: url });
  try {
    const cols = (await pool.query(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`)).rows;
    const cons = (await pool.query(`SELECT c.conrelid::regclass::text AS tbl, c.contype, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY 1,2`)).rows;
    const idx = (await pool.query(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2`)).rows;
    const trg = (await pool.query(`SELECT event_object_table AS tbl, trigger_name, action_timing, event_manipulation, action_statement FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY 1,2`)).rows;
    const tables = [...new Set(cols.map((c) => c.table_name))];
    const jsonb = tables.map((t) => [t, cols.filter((c) => c.table_name === t && /json/i.test(c.udt_name)).map((c) => c.column_name)]).filter(([, c]) => c.length);
    const out = [`# Banco de dados (gerado do Postgres local após \`initDb\`)\n\n${STAMP}\n`,
      `**${tables.length} tabelas.** Sem ORM: SQL direto com \`pg\`. O esquema nasce em \`server/db.js\` (função \`initDb\`, com \`CREATE TABLE IF NOT EXISTS\` e \`ALTER … ADD COLUMN IF NOT EXISTS\`, sempre aditivo) e em módulos próprios (\`server/crm/\`, \`server/renata/schema.js\`, \`server/meetingEditsSchema.js\`, \`server/projectVersionsSchema.js\`). Colunas \`jsonb\` guardam estruturas flexíveis (a principal: \`projects.data\`, o cronograma inteiro da empresa).\n`,
      '## Índice das tabelas\n', '| Tabela | Colunas | Colunas jsonb |', '|---|---|---|',
      ...tables.map((t) => `| [\`${t}\`](#${t.replace(/_/g, '_')}) | ${cols.filter((c) => c.table_name === t).length} | ${(jsonb.find(([x]) => x === t) || [, []])[1].map((x) => `\`${x}\``).join(', ')} |`), ''];
    for (const t of tables) {
      out.push(`## ${t}\n`, '| Coluna | Tipo | Nulo? | Padrão |', '|---|---|---|---|');
      for (const c of cols.filter((x) => x.table_name === t)) out.push(`| \`${c.column_name}\` | ${c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type === 'ARRAY' ? `${c.udt_name}[]` : c.data_type} | ${c.is_nullable === 'YES' ? 'sim' : 'não'} | ${esc(clip(c.column_default || '', 50))} |`);
      const kind = { p: 'Chave primária', f: 'Chave estrangeira', u: 'Único', c: 'Regra (CHECK)' };
      const cs = cons.filter((c) => c.tbl === t); if (cs.length) { out.push('', '**Travas do banco:**'); cs.forEach((c) => out.push(`- ${kind[c.contype] || c.contype}: \`${esc(clip(c.def, 200))}\``)); }
      const ix = idx.filter((i) => i.tablename === t && !/_pkey$/.test(i.indexname)); if (ix.length) { out.push('', '**Índices:**'); ix.forEach((i) => out.push(`- \`${i.indexname}\`: \`${esc(clip(i.indexdef.replace(/^CREATE (UNIQUE )?INDEX \S+ ON (public\.)?\S+ /, '$1'), 160))}\``)); }
      const tg = trg.filter((x) => x.tbl === t); if (tg.length) { out.push('', '**Gatilhos (triggers):**'); [...new Map(tg.map((x) => [x.trigger_name, x])).values()].forEach((x) => out.push(`- \`${x.trigger_name}\` (${x.action_timing} ${tg.filter((y) => y.trigger_name === x.trigger_name).map((y) => y.event_manipulation).join('/')}): \`${esc(clip(x.action_statement, 120))}\``)); }
      out.push('');
    }
    write('BANCO.md', out.join('\n'));
  } catch (e) { console.log(`pulado: BANCO.md (${e.message})`); } finally { await pool.end(); }
}

// ============================================================================ 3) VARIÁVEIS DE AMBIENTE
function genEnv() {
  const files = [...walk(path.join(ROOT, 'server'), (p) => /\.(js|mjs)$/.test(p)), ...walk(path.join(ROOT, 'src'), (p) => /\.(js|jsx)$/.test(p)), ...walk(path.join(ROOT, 'shared'), (p) => /\.(js|ts)$/.test(p)), path.join(ROOT, 'vite.config.js')].filter((f) => fs.existsSync(f));
  const map = new Map();
  for (const f of files) {
    const text = read(f); const lines = text.split('\n');
    for (const m of text.matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]+)/g)) {
      const k = m[1]; if (!map.has(k)) map.set(k, { files: new Set(), sample: '' });
      const e = map.get(k); e.files.add(rel(f));
      if (!e.sample) { const l = lines[lineOf(text, m.index) - 1].trim(); e.sample = clip(l.replace(/(['"`])[A-Za-z0-9+/_=.-]{24,}\1/g, '$1…$1'), 150); }
    }
  }
  const out = [`# Variáveis de ambiente (gerado)\n\n${STAMP}\n`, 'Só os **nomes** e onde são lidos; **nunca** valores. Os valores reais ficam no Railway (produção) e no `.env` local (que nunca vai para o git). A coluna "Linha de exemplo" mostra o uso no código (inclui o valor padrão, quando existe).\n', '| Variável | Lida em | Linha de exemplo |', '|---|---|---|'];
  for (const [k, v] of [...map].sort((a, b) => a[0].localeCompare(b[0]))) out.push(`| \`${k}\` | ${[...v.files].slice(0, 4).map((f) => `\`${f}\``).join(', ')}${v.files.size > 4 ? ` +${v.files.size - 4}` : ''} | \`${esc(v.sample)}\` |`);
  write('VARIAVEIS_DE_AMBIENTE.md', out.join('\n'));
  return map.size;
}

// ============================================================================ 4) TAREFAS AGENDADAS
function genJobs() {
  const files = walk(path.join(ROOT, 'server'), (p) => p.endsWith('.js') && !p.includes('/scripts/') && !p.includes('/evals/'));
  const rows = [];
  for (const f of files) {
    const text = read(f);
    for (const m of text.matchAll(/\bsetInterval\s*\(([\s\S]{0,500}?)\)\s*(?:\.unref\(\))?\s*;/g)) {
      const body = m[1]; let depth = 0; let cut = -1;
      for (let k = 0; k < body.length; k += 1) { const c = body[k]; if ('([{'.includes(c)) depth += 1; else if (')]}'.includes(c)) depth -= 1; else if (c === ',' && depth === 0) cut = k; }
      const every = cut >= 0 ? body.slice(cut + 1) : '';
      const ln = lineOf(text, m.index);
      rows.push({ kind: 'setInterval', file: rel(f), line: ln, every: clip(every, 60), what: clip(cut >= 0 ? body.slice(0, cut) : body, 110) });
    }
  }
  const starts = walk(path.join(ROOT, 'server'), (p) => p.endsWith('.js')).flatMap((f) => [...read(f).matchAll(/export (?:async )?function (start\w+)\s*\(/g)].map((m) => ({ file: rel(f), name: m[1], line: lineOf(read(f), m.index) })));
  const idx = read(path.join(ROOT, 'server/index.js'));
  const called = new Set([...idx.matchAll(/\b(start\w+)\(\)/g)].map((m) => m[1]));
  const out = [`# Tarefas agendadas e processos em segundo plano (gerado)\n\n${STAMP}\n`,
    'Não há fila externa (Redis etc.): tudo roda **dentro do processo do servidor** (um único contêiner no Railway). Se o servidor reinicia (deploy), o que estava em andamento é interrompido — por isso trabalhos longos gravam o estado no banco e se recuperam (ver `docs/04_SEGURANCA_E_TRAVAS.md`).\n',
    '## Funções `start…` (iniciadas no boot)\n', '| Função | Arquivo | Iniciada no `index.js`? |', '|---|---|---|', ...starts.map((s) => `| \`${s.name}\` | \`${s.file}:${s.line}\` | ${called.has(s.name) ? 'sim' : 'não (chamada em outro lugar)'} |`),
    '\n## Repetições (`setInterval`) encontradas no servidor\n', '| Tipo | Onde | Intervalo | O que faz (trecho) |', '|---|---|---|---|',
    ...rows.map((r) => `| ${r.kind} | \`${r.file}:${r.line}\` | ${esc(r.every)} | \`${esc(r.what)}\` |`)];
  write('TAREFAS_AGENDADAS.md', out.join('\n'));
}

// ============================================================================ 5) TESTES
function genTests() {
  const files = walk(path.join(ROOT, 'scripts'), (p) => /\.(mjs|js|py|sh)$/.test(p) && !p.includes('/fixtures/'));
  const out = [`# Testes e scripts (gerado)\n\n${STAMP}\n`, 'Não há *test runner* (Jest etc.). A verificação é: `npm run build` limpo + scripts descartáveis que sobem o servidor/Postgres **locais**. Todos recusam rodar contra banco que não seja `localhost`. Cabeçalho = o que o script prova (copiado do próprio arquivo).\n', '| Script | Como rodar / o que prova |', '|---|---|'];
  for (const f of files) {
    const head = read(f).split('\n').slice(0, 6).filter((l) => /^\s*(\/\/|#|\*|\/\*)/.test(l) && !/^#!/.test(l)).map((l) => l.replace(/^\s*(\/\/|#|\*|\/\*)+\s?/, '')).join(' ');
    out.push(`| \`${rel(f)}\` | ${esc(clip(head, 420))} |`);
  }
  write('TESTES.md', out.join('\n'));
  return files.length;
}

// ============================================================================ 6) ARQUIVOS
function genFiles() {
  const groups = [['server', /\.js$/], ['shared', /\.(js|ts)$/], ['src', /\.(js|jsx|mjs|css)$/]];
  const out = [`# Mapa de arquivos (gerado)\n\n${STAMP}\n`, 'Cada arquivo com o número de linhas e a **primeira frase do comentário de cabeçalho** (quase todos têm uma). Use para achar "onde mora" algo antes de abrir arquivos grandes. Arquivos acima de 1.000 linhas: leia com `offset`/`limit` ou `grep`.\n'];
  for (const [dir, re] of groups) {
    const fs_ = walk(path.join(ROOT, dir), (p) => re.test(p));
    out.push(`## \`${dir}/\` — ${fs_.length} arquivos\n`, '| Arquivo | Linhas | O que é |', '|---|---|---|');
    for (const f of fs_) {
      const t = read(f); const ls = t.split('\n');
      const head = ls.slice(0, 8).filter((l) => /^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => l.replace(/^\s*(\/\/|\/\*+|\*)+\s?/, '').trim()).filter(Boolean)[0] || '';
      out.push(`| \`${rel(f)}\` | ${ls.length} | ${esc(clip(head, 190))} |`);
    }
    out.push('');
  }
  write('ARQUIVOS.md', out.join('\n'));
}

// ============================================================================ 7) ÍNDICE DO PROJECT_CONTEXT
function genContextIndex() {
  const t = read(path.join(ROOT, 'PROJECT_CONTEXT.md')).split('\n');
  const out = [`# Índice do PROJECT_CONTEXT.md (gerado)\n\n${STAMP}\n`, `O \`PROJECT_CONTEXT.md\` tem ${t.length} linhas (a memória cronológica de cada decisão e bug). **Não leia inteiro**: ache a seção aqui e leia só o trecho (\`Read\` com \`offset\`/\`limit\`).\n`, '| Linha | Seção | Primeira frase |', '|---|---|---|'];
  t.forEach((l, i) => {
    const m = l.match(/^(#{1,2})\s+(.*)/); if (!m) return;
    let first = ''; for (let j = i + 1; j < Math.min(i + 12, t.length) && !first; j += 1) { const x = t[j].trim(); if (x && !/^#|^\||^```|^-{3}/.test(x)) first = x.replace(/[*_`]/g, ''); }
    out.push(`| ${i + 1} | ${esc(clip(m[2], 110))} | ${esc(clip(first, 150))} |`);
  });
  write('INDICE_PROJECT_CONTEXT.md', out.join('\n'));
}

// ============================================================================ 8) HISTÓRICO (git)
function genHistory() {
  const g = opt('--git', '');
  if (!g || !fs.existsSync(path.join(g, '.git'))) { console.log('pulado: HISTORICO_COMMITS.md (passe --git /caminho/do/clone)'); return; }
  const log = execFileSync('git', ['-C', g, 'log', '--date=format:%Y-%m-%d %H:%M', '--pretty=format:%ad\t%h\t%s'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean).map((l) => l.split('\t'));
  const byDay = new Map(); for (const [d, h, ...s] of log) { const day = d.slice(0, 10); if (!byDay.has(day)) byDay.set(day, []); byDay.get(day).push({ time: d.slice(11), h, s: s.join('\t') }); }
  const out = [`# Histórico de commits (gerado do git)\n\n${STAMP}\n`, `${log.length} commits, do mais recente ao mais antigo. Horário do commit **como gravado pelo git na máquina de deploy** (use com cuidado: pode estar em UTC ou Brasília). O "porquê" detalhado de cada mudança está no \`PROJECT_CONTEXT.md\`.\n`];
  for (const [day, list] of [...byDay].sort((a, b) => b[0].localeCompare(a[0]))) { out.push(`## ${day} (${list.length})\n`); list.forEach((c) => out.push(`- \`${c.h}\` ${c.time} — ${clip(c.s, 220)}`)); out.push(''); }
  write('HISTORICO_COMMITS.md', out.join('\n'));
}

// ============================================================================ 9) ENDEREÇOS DO FRONT
function genFrontRoutes() {
  const t = read(path.join(ROOT, 'src/lib/routes.js'));
  const paths = [...t.matchAll(/^\s{2}(\w+):\s*'(\/[^']*)'/gm)].map((m) => ({ mode: m[1], path: m[2] }));
  const out = [`# Endereços do front-end (gerado)\n\n${STAMP}\n`, 'O app **não tem roteador de páginas**: a navegação interna é por estado (`mode`) + `pushState`; `src/lib/routes.js` só liga cada módulo a um endereço (para favoritar/abrir direto) e define `canOpenMode` (quem pode abrir). Abaixo, o mapa módulo → endereço.\n', '| Módulo (`mode`) | Endereço |', '|---|---|', ...paths.map((p) => `| \`${p.mode}\` | \`${p.path}\` |`)];
  write('ENDERECOS_DO_FRONT.md', out.join('\n'));
}

const nRoutes = genRoutes();
await genDb();
const nEnv = genEnv();
genJobs();
const nTests = genTests();
genFiles();
genContextIndex();
genHistory();
genFrontRoutes();
console.log(`\nresumo: ${nRoutes} rotas/montagens, ${nEnv} variáveis, ${nTests} scripts`);
