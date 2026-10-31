// Medição de tamanho das respostas (server/payloadStats.js): agregação em memória e o middleware sobre um Express falso. Rodar: node scripts/payload-stats.test.mjs
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { recordPayload, payloadStats, payloadSnapshot, resetPayloadStats } from '../server/payloadStats.js';

let n = 0;
const ok = (name, fn) => { resetPayloadStats(); fn(); n += 1; console.log('ok  ', name); };

ok('agrega contagem, maior, último e média por rota', () => {
  recordPayload('GET /x', 100 * 1024, 10, 1000);
  recordPayload('GET /x', 300 * 1024, 40, 2000);
  recordPayload('GET /x', 200 * 1024, 20, 3000);
  const [r] = payloadSnapshot();
  assert.equal(r.rota, 'GET /x'); assert.equal(r.chamadas, 3); assert.equal(r.maiorKB, 300); assert.equal(r.ultimoKB, 200); assert.equal(r.mediaKB, 200);
  assert.equal(r.maiorMs, 40); assert.equal(r.ultimoMs, 20);
});

ok('ordena pela maior resposta e separa rotas', () => {
  recordPayload('pequena', 1024, 1); recordPayload('grande', 900 * 1024, 5);
  assert.deepEqual(payloadSnapshot().map((x) => x.rota), ['grande', 'pequena']);
});

ok('só loga acima de 500 KB e no máximo uma vez por minuto', () => {
  const linhas = []; const orig = console.log; console.log = (m) => linhas.push(String(m));
  try {
    recordPayload('GET /big', 100 * 1024, 5, 0);
    recordPayload('GET /big', 600 * 1024, 5, 1000);
    recordPayload('GET /big', 700 * 1024, 5, 2000);
    recordPayload('GET /big', 800 * 1024, 5, 62000);
  } finally { console.log = orig; }
  assert.equal(linhas.length, 2, linhas.join('|'));
  assert.match(linhas[0], /\[payload\] GET \/big: 600 KB/);
});

ok('middleware mede o Content-Length no fim da resposta e ignora erros', () => {
  const res = new EventEmitter(); res.statusCode = 200; res.getHeader = (h) => (h === 'content-length' ? '2048' : undefined);
  payloadStats('GET /m')({}, res, () => {}); res.emit('finish');
  assert.equal(payloadSnapshot()[0].ultimoKB, 2);
  const bad = new EventEmitter(); bad.statusCode = 500; bad.getHeader = () => '9999999';
  payloadStats('GET /e')({}, bad, () => {}); bad.emit('finish');
  assert.equal(payloadSnapshot().find((x) => x.rota === 'GET /e'), undefined);
  const sem = new EventEmitter(); sem.statusCode = 200; sem.getHeader = () => undefined;
  payloadStats('GET /s')({}, sem, () => {}); sem.emit('finish');
  assert.equal(payloadSnapshot().find((x) => x.rota === 'GET /s'), undefined);
});

console.log(`\n${n} verificações ok`);
