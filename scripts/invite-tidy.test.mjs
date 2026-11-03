// Convite já respondido sai da Caixa de entrada (server/inviteTidy.js): só convite (novo ou alterado) com resposta Sim/Talvez/Não.
import assert from 'node:assert/strict';
import { isAnsweredInvite } from '../server/inviteTidy.js';
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log('ok  ', name); };
const inv = (kind) => ({ kind, uid: 'u1' });
ok('aceito, recusado ou talvez → arquiva', () => { for (const r of ['accepted', 'declined', 'tentative']) assert.equal(isAnsweredInvite(inv('request'), { myResponse: r }), true, r); });
ok('convite alterado já respondido → arquiva', () => assert.equal(isAnsweredInvite(inv('update'), { myResponse: 'accepted' }), true));
ok('ainda sem resposta fica', () => { assert.equal(isAnsweredInvite(inv('request'), { myResponse: 'needsAction' }), false); assert.equal(isAnsweredInvite(inv('request'), { myResponse: 'unknown' }), false); });
ok('evento que eu organizo não sai sozinho', () => assert.equal(isAnsweredInvite(inv('request'), { myResponse: 'organizer' }), false));
ok('cancelamento, resposta de convidado e sugestão de horário ficam', () => { for (const k of ['cancel', 'reply', 'counter', 'publish']) assert.equal(isAnsweredInvite(inv(k), { myResponse: 'accepted' }), false, k); });
ok('evento que não está na agenda fica', () => assert.equal(isAnsweredInvite(inv('request'), null), false));
console.log(`\n${n} verificações da arrumação dos convites passaram.`);
process.exit(0);
