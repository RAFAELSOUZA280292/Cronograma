// Contrato com o SDK da Anthropic (E6, 2026-10-31): o que o pacote instalado de fato manda e entende, contra um servidor FALSO em localhost (sem rede, sem chave, sem banco).
// Protege a próxima troca de versão do SDK: versão da API, cabeçalho de autenticação, helper de saída estruturada (zod), parâmetros que a versão 2026-10-21 recusa e imports que o servidor usa.
// Rodar: node scripts/anthropic-sdk-contract.test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

let n = 0;
const ok = (name, fn) => Promise.resolve(fn()).then(() => { n += 1; console.log('ok  ', name); });

const seen = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-sonnet-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: JSON.stringify({ titulo: 'ok', itens: ['a', 'b'] }) }], usage: { input_tokens: 3, output_tokens: 4 } }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const client = new Anthropic({ apiKey: 'chave-falsa-de-teste', baseURL, maxRetries: 0 });

await ok('o SDK instalado manda a versão 2026-10-21 da API e a chave como Authorization: Bearer', async () => {
  await client.messages.create({ model: 'claude-sonnet-5', max_tokens: 16, messages: [{ role: 'user', content: 'oi' }] });
  const h = seen[0].headers;
  assert.equal(h['anthropic-version'], '2026-10-21');
  assert.equal(h.authorization, 'Bearer chave-falsa-de-teste');
  assert.equal(h['x-api-key'], undefined);
});

await ok('messages.parse + zodOutputFormat: manda output_config.format e devolve parsed_output validado pelo schema', async () => {
  const Schema = z.object({ titulo: z.string(), itens: z.array(z.string()) });
  const r = await client.messages.parse({ model: 'claude-sonnet-5', max_tokens: 64, system: [{ type: 'text', text: 's', cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'AAAA' } }, { type: 'text', text: 'estude' }] }],
    output_config: { format: zodOutputFormat(Schema) } });
  assert.deepEqual(r.parsed_output, { titulo: 'ok', itens: ['a', 'b'] });
  const b = seen[seen.length - 1].body;
  assert.equal(b.output_config.format.type, 'json_schema');
  assert.equal(b.messages[0].role, 'user'); assert.equal(b.messages[0].content[0].type, 'document'); // documento só em mensagem do usuário
  assert.equal(b.system[0].cache_control.ttl, '1h');
});

await ok('saída fora do schema vira erro (não passa lixo adiante)', async () => {
  const bad = z.object({ nao_existe: z.string() });
  await assert.rejects(() => client.messages.parse({ model: 'claude-sonnet-5', max_tokens: 64, messages: [{ role: 'user', content: 'oi' }], output_config: { format: zodOutputFormat(bad) } }));
});

await ok('nenhum arquivo do servidor manda temperature/top_p/top_k nem cabeçalho de versão próprio (a versão 2026-10-21 recusa os três)', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'evals' ? [] : walk(`${d}/${e.name}`)) : (e.name.endsWith('.js') ? [`${d}/${e.name}`] : [])));
  const bad = walk('server').filter((f) => /\b(temperature|top_p|top_k)\s*:|anthropic[-_]version/i.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(bad, []);
});

await ok('o servidor não usa o que o SDK 1.x removeu (compactionControl, Text Completions, betas em models)', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : (e.name.endsWith('.js') ? [`${d}/${e.name}`] : [])));
  const bad = walk('server').filter((f) => /compactionControl|completions\.create|\.models\.(list|retrieve)\([^)]*betas/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(bad, []);
});

server.close();
console.log(`\n${n} verificações ok.`);
