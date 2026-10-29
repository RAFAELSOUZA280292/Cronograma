// M16 (2026-10-29): o que o usuário confirma é executado a partir do que ficou guardado — não pode estar cortado por `compact`.
import assert from 'node:assert/strict';
const { createExecutor } = await import('../server/renata/executor.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const rows = [];
const pool = { query: async (sql, params) => { if (/INSERT INTO renata_actions/.test(sql)) rows.push({ input: JSON.parse(params[12]), status: params[15] }); return { rows: [] }; } };
const tool = { name: 'teste_lote', risk: 'critical', module: 'teste', params: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, texto: { type: 'string' } } }, describe: (i) => `lote de ${i.ids.length}` };
const registry = { get: (name) => (name === 'teste_lote' ? tool : null) };
const ex = createExecutor({ pool, registry, call: async () => ({ ok: true }) });
const ctx = { user: { id: 'u1', name: 'U', orgId: 'o1' }, orgId: 'o1', command: 'x', conversationId: 'c1', toolUseId: 't1' };
const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`); const texto = 'x'.repeat(2500);
const r = await ex.executeTool(ctx, 'teste_lote', { ids, texto });
ok(r.status === 'needs_confirmation', `pede confirmação (${r.status} ${r.error || ''})`);
const pend = rows.find((x) => x.status === 'pending');
ok(pend && pend.input.ids.length === 100 && pend.input.texto.length === 2500, 'o pedido pendente guarda os 100 ids e o texto de 2500 caracteres INTEIROS');
const big = await ex.executeTool(ctx, 'teste_lote', { ids, texto: 'y'.repeat(320000) });
ok(big.ok === false && /grande demais/.test(big.error), 'pedido gigante é recusado em vez de guardado cortado');
console.log(`renata-confirmacao-lote: ${n} checagens OK`);
