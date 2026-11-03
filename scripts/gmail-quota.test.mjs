// Cota do Gmail por pessoa (server/gmailQuota.js, §148): medidor por origem, Caixa repete quando o Google pede pausa, fundo cede a vez.
import assert from 'node:assert/strict';
import { meteredGmail, usage, resetMeters, isQuotaError, BACKGROUND_CEILING } from '../server/gmailQuota.js';

const quota = () => Object.assign(new Error("Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'"), { code: 403 });
function fake(failures = 0) {
  const calls = { get: 0 };
  let left = failures;
  const threads = { get: async (args) => { calls.get += 1; if (left > 0) { left -= 1; throw quota(); } return { data: { id: args.id } }; } };
  const users = { threads, labels: { get: async () => ({ data: {} }) }, messages: { attachments: { get: async () => ({ data: {} }) } }, getProfile: async () => ({ data: { emailAddress: 'a@x' } }) };
  return { gmail: { users }, calls };
}
let n = 0;
const ok = async (name, fn) => { resetMeters(); await fn(); n += 1; console.log(`ok   ${name}`); };

await ok('conta as unidades por origem (threads.get 10, labels.get 1, anexo 5, perfil 1)', async () => {
  const { gmail } = fake();
  const g = meteredGmail(gmail, 'u1', { source: 'caixa' });
  await g.users.threads.get({ id: 't1' }); await g.users.labels.get({ id: 'INBOX' }); await g.users.messages.attachments.get({}); await g.users.getProfile({});
  const v = meteredGmail(fake().gmail, 'u1', { source: 'varredura' });
  await v.users.threads.get({ id: 't2' });
  assert.deepEqual(usage('u1'), { total: 27, bySource: { caixa: 17, varredura: 10 } });
  assert.equal(usage('u2').total, 0, 'outra pessoa não soma');
});
await ok('a Caixa repete quando o Google pede pausa e devolve o e-mail', async () => {
  const { gmail, calls } = fake(2);
  const r = await meteredGmail(gmail, 'u1', { delays: [1, 1, 1] }).users.threads.get({ id: 't9' });
  assert.equal(r.data.id, 't9'); assert.equal(calls.get, 3);
});
await ok('a Caixa desiste depois de 3 repetições (o erro chega à tela)', async () => {
  const { gmail, calls } = fake(10);
  await assert.rejects(meteredGmail(gmail, 'u1', { delays: [1, 1, 1] }).users.threads.get({ id: 'x' }), (e) => isQuotaError(e));
  assert.equal(calls.get, 4);
});
await ok('erro que não é de cota não repete', async () => {
  const users = { threads: { get: async () => { throw Object.assign(new Error('Not Found'), { code: 404 }); } } };
  let tries = 0; const g = meteredGmail({ users: { threads: { get: async (a) => { tries += 1; return users.threads.get(a); } } } }, 'u1', { delays: [1, 1, 1] });
  await assert.rejects(g.users.threads.get({}), /Not Found/); assert.equal(tries, 1);
});
await ok('tarefa de fundo não repete e não começa com a cota apertada', async () => {
  const { gmail, calls } = fake(1);
  await assert.rejects(meteredGmail(gmail, 'u1', { source: 'varredura', background: true }).users.threads.get({}), (e) => isQuotaError(e));
  assert.equal(calls.get, 1);
  resetMeters();
  const caixa = meteredGmail(fake().gmail, 'u1');
  for (let i = 0; i < BACKGROUND_CEILING / 10; i += 1) await caixa.users.threads.get({ id: `c${i}` });
  const bg = fake();
  await assert.rejects(meteredGmail(bg.gmail, 'u1', { source: 'convites', background: true }).users.threads.get({}), (e) => e.code === 'GMAIL_BUSY');
  assert.equal(bg.calls.get, 0, 'nem chamou o Google');
  await caixa.users.threads.get({ id: 'ainda' });
});
await ok('reconhece erro de cota (429 e 403 de cota), não o de permissão', async () => {
  assert.ok(isQuotaError({ code: 429, message: '' }));
  assert.ok(isQuotaError(quota()));
  assert.ok(isQuotaError({ code: 403, message: 'User Rate Limit Exceeded' }));
  assert.ok(!isQuotaError({ code: 403, message: 'Request had insufficient authentication scopes.' }));
});
console.log(`${n} verificações da cota do Gmail passaram.`);
