// Simulação do arrastar negócio entre etapas no CRM (2026-10-27), pela API e como a Eduarda (vendedor). SÓ banco local (sandbox-edu).
// Para CADA negócio aberto de CADA funil: move para cada outra etapa aberta, confere a resposta, a leitura da ficha e a posição no quadro;
// no fim devolve o negócio à etapa de origem. Uso: BASE=http://localhost:3001 node scripts/crm-move-sim.mjs [usuario] [limite-de-negocios]
const BASE = process.env.BASE || 'http://localhost:3001';
if (!/localhost|127\.0\.0\.1/.test(BASE)) { console.error('só local'); process.exit(2); }
const user = process.argv[2] || 'sbx_eduarda'; const LIMIT = Number(process.argv[3] || 1e9);
let cookie = '';
async function call(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  let data = null; try { data = await r.json(); } catch { /* */ }
  return { status: r.status, data };
}
await call('POST', '/api/auth/login', { username: user, password: 'sbx-local-pass' });
const opts = (await call('GET', '/api/crm/options')).data;
const pipelines = opts.pipelines;
const fails = new Map(); let moves = 0; let deals = 0; let cadenceMsgs = 0; const slow = [];
const bump = (k, ex) => { const e = fails.get(k) || { n: 0, ex }; e.n++; fails.set(k, e); };
for (const p of pipelines) {
  const board = (await call('GET', `/api/crm/board?pipelineId=${p.id}`)).data;
  const open = board.stages.filter((s) => s.kind === 'open');
  const all = board.stages.flatMap((s) => s.deals.map((d) => ({ ...d, fromStage: s })));
  for (const d of all.filter((x) => x.status === 'open').slice(0, LIMIT)) {
    deals++;
    const targets = open.filter((s) => s.id !== d.stageId);
    for (const t of [...targets, open.find((s) => s.id === d.stageId)]) {
      if (!t) continue;
      const t0 = Date.now();
      const r = await call('POST', `/api/crm/deals/${d.id}/move`, { stageId: t.id });
      const ms = Date.now() - t0; if (ms > 1500) slow.push(`${d.title} → ${t.name}: ${ms}ms`);
      moves++;
      if (r.status !== 200) { bump(`HTTP ${r.status} ${r.data && r.data.message}`, `${p.name}: ${d.title} → ${t.name}`); continue; }
      if (r.data.cadence) cadenceMsgs++;
      const back = (await call('GET', `/api/crm/deals/${d.id}`)).data.deal;
      if (back.stageId !== t.id) bump('resposta 200 mas a ficha NÃO mostra a etapa nova', `${p.name}: ${d.title} → ${t.name} (ficha: ${back.stageName})`);
      const b2 = (await call('GET', `/api/crm/board?pipelineId=${p.id}`)).data;
      const where = b2.stages.find((s) => s.deals.some((x) => x.id === d.id));
      if (!where || where.id !== t.id) bump('o quadro NÃO mostra o negócio na etapa nova', `${p.name}: ${d.title} → ${t.name} (quadro: ${where && where.name})`);
    }
  }
}
console.log(`funis: ${pipelines.length} · negócios: ${deals} · movimentos: ${moves} · com aviso de cadência: ${cadenceMsgs}`);
if (slow.length) console.log('lentos:', slow.slice(0, 5));
if (!fails.size) console.log('NENHUMA falha.');
for (const [k, v] of fails) console.log(`FALHA x${v.n}: ${k} — ex.: ${v.ex}`);
process.exit(fails.size ? 1 : 0);
