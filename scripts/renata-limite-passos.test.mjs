// RENATA travada em "…" (2026-10-29): ao gastar os 10 passos de consulta sem concluir, a conversa ficava sem resposta. Prova: resposta final forçada, horário
// guardado em cada mensagem sem nunca ir para a IA, e as ferramentas novas que leem o conteúdo da reunião (reuniao_ver, reunioes_buscar). IA SIMULADA, banco local.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/renata-limite-passos.test.mjs
import crypto from 'node:crypto';
import pg from 'pg';
import { createAgent } from '../server/renata/agent.js';
import { registerEmpresas } from '../server/renata/tools/empresas.js';

const DB = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
if (!/localhost|127\.0\.0\.1/.test(DB)) { console.error('Recusado: só banco local.'); process.exit(2); }
let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };

// ---------- agente com tudo simulado ----------
const store = new Map();
const fakePool = { async query(sql, p) {
  if (/^INSERT INTO renata_conversations/.test(sql)) { store.set(p[0], { id: p[0], org_id: p[1], user_id: p[2], title: p[3], messages: [], context: {} }); return { rows: [] }; }
  if (/^UPDATE renata_conversations/.test(sql)) { const c = store.get(p[0]); c.messages = JSON.parse(p[1]); c.context = JSON.parse(p[2]); return { rows: [] }; }
  if (/^SELECT \* FROM renata_conversations/.test(sql)) return { rows: [store.get(p[0])].filter(Boolean) };
  return { rows: [] };
} };
const registry = { forModel: () => [{ name: 'consultar', description: 'x', input_schema: { type: 'object', properties: {} } }], get: () => ({ risk: 'read' }) };
const executor = { executeTool: async () => ({ ok: true, status: 'success', summary: 'consulta', data: { n: 1 } }), cancelAction: async () => ({}) };
const user = { id: 'u1', orgId: 'o1', name: 'Rafael', role: 'master' };
const run = async (respond) => {
  const calls = []; let n = 0;
  const client = { messages: { async create(params) { calls.push(params); n += 1; return respond(params, n); } } };
  const agent = createAgent({ pool: fakePool, registry, executor, getClient: () => client, generalContext: async () => '' });
  const out = await agent.chat({ user, message: 'o que respondo à KUHN?', conversationId: null, context: null, today: '2026-10-29' });
  return { out, calls, conv: store.get(out.conversationId) };
};
const toolUse = (n) => ({ content: [{ type: 'tool_use', id: `toolu_${n}`, name: 'consultar', input: { n } }], stop_reason: 'tool_use', usage: {} });

const a = await run((params) => (params.tool_choice ? { content: [{ type: 'text', text: 'Resposta final com o que consegui ver.' }], stop_reason: 'end_turn', usage: {} } : toolUse(Math.random())));
ok('10 passos de consulta sem concluir: a RENATA responde mesmo assim', a.out.reply === 'Resposta final com o que consegui ver.', a.out.reply);
ok('foram 10 consultas + 1 chamada final sem ferramentas (tool_choice none)', a.calls.length === 11 && a.calls[10].tool_choice && a.calls[10].tool_choice.type === 'none', a.calls.length);
ok('a chamada final leva o aviso de limite', JSON.stringify(a.calls[10].messages.slice(-1)).includes('limite de consultas'));
ok('o horário (_at) NUNCA vai para a IA', a.calls.every((c) => c.messages.every((m) => !('_at' in m))));
ok('a conversa guardada tem o horário da pergunta e da resposta', a.conv.messages[0]._at && a.conv.messages.filter((m) => m.role === 'assistant').every((m) => m._at) && !Number.isNaN(Date.parse(a.out.at)), a.out.at);

const b = await run(() => ({ content: [{ type: 'text', text: 'Resposta direta.' }], stop_reason: 'end_turn', usage: {} }));
ok('resposta normal: 1 chamada, sem passo forçado', b.calls.length === 1 && b.out.reply === 'Resposta direta.' && !b.calls[0].tool_choice);

const c = await run((params) => { if (params.tool_choice) throw new Error('IA fora do ar'); return toolUse(Math.random()); });
ok('se a chamada final falhar, ainda sai uma mensagem em português (nunca "…" vazio)', /não consegui montar a resposta/.test(c.out.reply), c.out.reply);

const trunc = await run(() => ({ content: [{ type: 'text', text: 'Resposta que foi cortada no meio da fra' }], stop_reason: 'max_tokens', usage: {} }));
ok('M19: resposta cortada por limite de tokens ganha o aviso (não parece completa)', /cortada aqui/.test(trunc.out.reply) && trunc.out.reply.startsWith('Resposta que foi cortada'), trunc.out.reply);
const d = await run(() => ({ content: [], stop_reason: 'end_turn', usage: {} }));
ok('resposta vazia da IA não vira "…" na tela', d.out.reply === '', d.out.reply);

// ---------- ferramentas de leitura de reunião ----------
const pool = new pg.Pool({ connectionString: DB });
const ORG = 'sandbox-edu'; const RUN = crypto.randomBytes(3).toString('hex'); const PID = `rlp-${RUN}`; const PID_OTHER = `rlp-o-${RUN}`;
const tools = new Map(); registerEmpresas({ add: (t) => tools.set(t.name, t) });
try {
  await pool.query(`DELETE FROM projects WHERE id = ANY($1)`, [[PID, PID_OTHER]]);
  const meetings = [
    { id: 'm1', title: 'Saldo credor PIS/COFINS', date: '2026-10-20', time: '10:00', participants: ['Ana (KUHN)'], summary: 'Cliente perguntou como usar o saldo credor.', decisions: 'Levantar o saldo.', transcript: 'T'.repeat(9000), deleted: false, actionItems: [{ id: 'a1', title: 'Enviar saldo', responsible: 'Ana', owner: 'cliente', dueDate: '2026-11-03', status: 'nao-iniciado', deleted: false }] },
    { id: 'm2', title: 'Futura', date: '2099-01-01', summary: 'ainda não aconteceu', deleted: false, actionItems: [] },
    { id: 'm3', title: 'Apagada', date: '2026-10-28', summary: 'x', deleted: true, actionItems: [] },
  ];
  await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [PID, JSON.stringify({ company: { name: `Empresa Leitura ${RUN}`, nomeFantasia: '' }, meetings }), ORG]);
  await pool.query('INSERT INTO projects (id, data, org_id) VALUES ($1,$2,$3)', [PID_OTHER, JSON.stringify({ company: { name: 'Outra', nomeFantasia: '' }, meetings: [] }), 'sandbox-edu']);
  const staff = { id: 'x', name: 'Teste', role: 'master', isSuperAdmin: true, orgId: ORG, companiesAccess: true, allCompaniesAccess: true };
  const ctx = { user: staff, orgId: ORG };
  const v = tools.get('reuniao_ver');
  const r1 = await v.run(ctx, { empresaId: PID });
  ok('reuniao_ver sem id: devolve a mais recente que JÁ aconteceu (ignora futura e apagada)', r1.status === 200 && r1.json.id === 'm1' && /saldo credor/.test(r1.json.resumo), r1.json && r1.json.id);
  ok('traz decisões, participantes e tarefas com responsável e lado', r1.json.decisoes === 'Levantar o saldo.' && r1.json.participantes[0] === 'Ana (KUHN)' && r1.json.tarefas[0].ladoCliente === true && r1.json.tarefas[0].prazo === '2026-11-03');
  ok('sem transcricao=true não manda a transcrição', !('transcricao' in r1.json));
  const r2 = await v.run(ctx, { empresaId: PID, reuniaoId: 'm1', transcricao: true });
  ok('com transcricao=true (equipe): trecho de 8.000 caracteres e aviso de corte', r2.json.transcricao.length === 8000 && r2.json.transcricaoCortada === true);
  const r3 = await v.run({ ...ctx, user: { ...staff, role: 'cliente', isSuperAdmin: false } }, { empresaId: PID, reuniaoId: 'm1', transcricao: true });
  ok('quem não é equipe nunca recebe a transcrição', r3.status !== 200 || !('transcricao' in r3.json), r3.status);
  ok('reunião inexistente e empresa inexistente dão 404', (await v.run(ctx, { empresaId: PID, reuniaoId: 'nope' })).status === 404 && (await v.run(ctx, { empresaId: 'nao-existe' })).status === 404);
  ok('reunião excluída não é lida', (await v.run(ctx, { empresaId: PID, reuniaoId: 'm3' })).status === 404);
  const s = await tools.get('reunioes_buscar').run(ctx, { empresaId: PID, consulta: 'saldo credor' });
  ok('reunioes_buscar responde sem erro (lista de trechos da memória da empresa)', s.status === 200 && Array.isArray(s.json.trechos), s);
  ok('reunioes_buscar: empresa sem acesso/inexistente dá 404', (await tools.get('reunioes_buscar').run(ctx, { empresaId: 'nao-existe', consulta: 'x' })).status === 404);
} catch (e) { failed += 1; console.error('ERRO NO TESTE', e); }
await pool.query(`DELETE FROM projects WHERE id = ANY($1)`, [[PID, PID_OTHER]]).catch(() => {});
await pool.end();
console.log(failed ? `\n${failed} falha(s)` : '\nTudo certo.');
process.exit(failed ? 1 : 0);
