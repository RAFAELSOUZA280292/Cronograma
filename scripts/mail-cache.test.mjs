// Memória curta da Caixa (server/mailCache.js): conversa por (pessoa, id, historyId), validade e limite. Puro. Rodar: node scripts/mail-cache.test.mjs
import assert from 'node:assert/strict';
import { createCache, cachedThreads, threadKey } from '../server/mailCache.js';
import { mapLimit } from '../server/googleMail.js';

let t = 0;
const c = createCache({ max: 3, ttlMs: 1000, now: () => t });
c.set('a', 1); c.set('b', 2); c.set('c', 3);
assert.equal(c.get('a'), 1);
c.set('d', 4); // 'b' era o mais antigo sem uso
assert.equal(c.get('b'), undefined);
assert.equal(c.size, 3);
t = 1500;
assert.equal(c.get('a'), undefined, 'venceu');
c.set('u1:x', 1); c.set('u1:y', 2); c.set('u12:z', 3);
c.deletePrefix('u1:');
assert.equal(c.get('u1:x'), undefined);
assert.equal(c.get('u12:z'), 3, 'prefixo de outra pessoa fica');
assert.equal(threadKey('u', 't', null), null);

const cache = createCache({ max: 100 });
let calls = 0;
const fetchOne = async (id) => { calls += 1; return { id, historyId: id === 'b' ? '22' : '1', messages: [] }; };
const list = [{ id: 'a', historyId: '1' }, { id: 'b', historyId: '21' }, { id: 'c', historyId: '1' }];
let r = await cachedThreads(cache, 'u', list, fetchOne, mapLimit);
assert.equal(calls, 3); assert.equal(r.fetched, 3);
assert.deepEqual(r.threads.map((x) => x.id), ['a', 'b', 'c']);
r = await cachedThreads(cache, 'u', [{ id: 'a', historyId: '1' }, { id: 'b', historyId: '22' }, { id: 'c', historyId: '2' }], fetchOne, mapLimit);
assert.equal(calls, 4, 'só a conversa que mudou (c) é buscada de novo; b foi guardada pelo historyId da própria conversa');
r = await cachedThreads(cache, 'outra', [{ id: 'a', historyId: '1' }], fetchOne, mapLimit);
assert.equal(calls, 5, 'cada pessoa tem a sua memória');
const failing = async () => { throw new Error('x'); };
r = await cachedThreads(cache, 'u', [{ id: 'z', historyId: '9' }], failing, mapLimit);
assert.deepEqual(r.threads, [null]);
console.log('mail-cache: ok');
