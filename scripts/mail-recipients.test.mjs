// Destinatários em cartões (src/mail/recipients.js, §153): dividir, ler, juntar de volta e o que está sendo digitado.
import assert from 'node:assert/strict';
import { splitRecipients, parseRecipient, joinRecipients, addRecipients, takeTyped } from '../src/mail/recipients.js';

const text = 'Marlon FINGER <marlon.finger@kuhn.com>, "Souza, Rafael" <rafael.souza@pricetax.com.br>; daniele.veiga@kuhn.com\nRonaldo Dias ronaldodias@pricetax.com.br';
const parts = splitRecipients(text);
assert.equal(parts.length, 4, 'vírgula dentro de aspas não divide; , ; e quebra de linha dividem');
const rs = parts.map(parseRecipient);
assert.deepEqual(rs.map((r) => [r.name, r.email, r.valid]), [
  ['Marlon FINGER', 'marlon.finger@kuhn.com', true], ['Souza, Rafael', 'rafael.souza@pricetax.com.br', true],
  ['', 'daniele.veiga@kuhn.com', true], ['Ronaldo Dias', 'ronaldodias@pricetax.com.br', true],
]);
assert.equal(joinRecipients(rs), 'Marlon FINGER <marlon.finger@kuhn.com>, "Souza, Rafael" <rafael.souza@pricetax.com.br>, daniele.veiga@kuhn.com, Ronaldo Dias <ronaldodias@pricetax.com.br>', 'volta ao texto no formato de sempre');
assert.deepEqual(splitRecipients(joinRecipients(rs)).map(parseRecipient).map((r) => r.email), rs.map((r) => r.email), 'ida e volta sem perder ninguém');

assert.equal(parseRecipient('fulano@').valid, false);
assert.equal(parseRecipient('Fulano').valid, false);
assert.equal(parseRecipient('<A@X.COM>').email, 'a@x.com', 'e-mail em minúsculas');
assert.equal(parseRecipient('mailto:a@x.com').email, 'a@x.com');
assert.equal(joinRecipients([parseRecipient('fulano@')]), 'fulano@', 'inválido volta como foi digitado (o servidor recusa e a tela mostra em vermelho)');

const one = parseRecipient('a@x.com');
assert.equal(addRecipients([one], [parseRecipient('A <A@x.com>'), parseRecipient('b@x.com')]).length, 2, 'o mesmo e-mail não entra duas vezes');

assert.deepEqual(takeTyped('maiara'), { done: [], rest: 'maiara' }, 'sem separador: continua digitando');
const t1 = takeTyped('a@x.com, b@y.com, ama');
assert.deepEqual([t1.done.map((r) => r.email), t1.rest], [['a@x.com', 'b@y.com'], 'ama'], 'colar vários: viram cartões e sobra o trecho');
assert.deepEqual(takeTyped('a@x.com;').done.map((r) => r.email), ['a@x.com'], 'separador no fim fecha o cartão');
assert.deepEqual(takeTyped('"Souza, Ra').done, [], 'vírgula dentro de aspas ainda abertas não fecha cartão');
console.log('mail-recipients: tudo certo');
