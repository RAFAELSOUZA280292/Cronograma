// Escopo da busca como dica (server/retrievalScope.js). Sem banco/IA/rede. Rodar: node scripts/retrieval-scope.test.mjs
import assert from 'node:assert/strict';
import { MIN_SCOPED_CHUNKS, hasScope, needsWidening, mergeScoped } from '../server/retrievalScope.js';

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const c = (id) => ({ id });

ok('hasScope: só tipo ou reunião contam; vazio, null e undefined não', () => {
  assert.equal(hasScope({ kind: 'meeting_topic' }), true); assert.equal(hasScope({ meetingId: 'm5' }), true);
  assert.equal(hasScope({}), false); assert.equal(hasScope({ kind: undefined, meetingId: undefined }), false); assert.equal(hasScope(null), false);
});

ok('tipo (kind) SEMPRE completa com a busca aberta, mesmo com resultado farto (o kind errado perdia evidência com 7 trechos)', () => {
  assert.equal(needsWidening({ kind: 'transcript_segment' }, 7), true);
  assert.equal(needsWidening({ kind: 'meeting_topic' }, 0), true);
  assert.equal(needsWidening({ kind: 'activity', meetingId: 'm5' }, 12), true);
});

ok('reunião-alvo: completa só quando trouxe pouco; com resultado farto continua rigorosa', () => {
  assert.equal(needsWidening({ meetingId: 'm5' }, 1), true);
  assert.equal(needsWidening({ meetingId: 'm5' }, MIN_SCOPED_CHUNKS - 1), true);
  assert.equal(needsWidening({ meetingId: 'm5' }, MIN_SCOPED_CHUNKS), false);
});

ok('sem filtro nada muda', () => {
  assert.equal(needsWidening({}, 0), false); assert.equal(needsWidening(undefined, 0), false); assert.equal(needsWidening({ kind: undefined, meetingId: undefined }, 0), false);
});

ok('mesclar: escopo primeiro, depois a busca aberta sem repetir; respeita o limite', () => {
  assert.deepEqual(mergeScoped([c('a'), c('b')], [c('b'), c('x'), c('y')], 12).map((x) => x.id), ['a', 'b', 'x', 'y']);
  assert.deepEqual(mergeScoped([], [c('x')], 12).map((x) => x.id), ['x']);
  assert.deepEqual(mergeScoped(null, null), []);
  assert.deepEqual(mergeScoped([c('a'), null, c('a')], [undefined], 12).map((x) => x.id), ['a']);
});

ok('mesclar: guarda vagas para a busca aberta mesmo se o escopo encher o limite', () => {
  const scoped = Array.from({ length: 12 }, (_, i) => c(`s${i}`));
  const wide = [c('w0'), c('w1'), c('w2'), c('w3'), c('w4'), c('w5')];
  const out = mergeScoped(scoped, wide, 12, 4).map((x) => x.id);
  assert.equal(out.length, 12);
  assert.deepEqual(out.slice(0, 8), scoped.slice(0, 8).map((x) => x.id));
  assert.deepEqual(out.slice(8), ['w0', 'w1', 'w2', 'w3']);
});

ok('mesclar: se a busca aberta traz menos que a reserva, o resto do escopo ocupa a vaga', () => {
  const scoped = Array.from({ length: 12 }, (_, i) => c(`s${i}`));
  const out = mergeScoped(scoped, [c('w0')], 12, 4).map((x) => x.id);
  assert.equal(out.length, 12); assert.ok(out.includes('w0')); assert.equal(out.filter((i) => i.startsWith('s')).length, 11);
});

console.log(`\n${n} testes passaram.`);
