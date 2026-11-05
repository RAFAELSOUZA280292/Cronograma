// Copiar e-mails / E-mail para todos a partir da agenda (§167). node scripts/agenda-attendee-mail.test.mjs
import { attendeePeople, attendeesCopyText, attendeesMailto } from '../src/agenda/attendeeMail.js';
import { parseMailto } from '../src/mail/mailIntent.js';

let failed = 0;
const ok = (n, c, e) => { if (c) console.log(`ok   ${n}`); else { failed += 1; console.log(`FAIL ${n}${e !== undefined ? ` -> ${JSON.stringify(e)}` : ''}`); } };

// O caso do print (AGENDA PRICE TAX - TI)
const att = [
  { name: 'Melissa Argenta', email: 'melissa.argenta@alcast.com.br', optional: true },
  { name: '', email: 'maiara.morais@pricetax.com.br' },
  { name: 'Roberto Cassaniga', email: 'roberto.cassaniga@alcast.com.br' },
  { name: '', email: 'rafael.souza@pricetax.com.br', self: true },
  { name: 'Elizabet Guimaraes Poleto Ferreira', email: 'elizabet.poleto@alcast.com.br' },
  { name: 'Andrigo Bernert', email: 'andrigo.bernert@alcast.com.br', organizer: true },
  { name: 'Grasiele Wessling', email: 'grasiele.wessling@alcast.com.br' },
  { name: 'Jhonatan Daniel Liesch', email: 'Jhonatan.Liesch@alcast.com.br' },
  { name: 'Sala 1', email: 'c_123@resource.calendar.google.com' },
  { name: 'Melissa de novo', email: 'MELISSA.ARGENTA@alcast.com.br' },
  { name: 'sem e-mail', email: '' },
];
const all = attendeePeople(att);
ok('copiar = os 8 envolvidos (com você), sem sala, sem repetido, sem vazio', all.length === 8, all.map((p) => p.email));
const txt = attendeesCopyText(att);
ok('texto para colar: "Nome <e-mail>" e e-mail sozinho quando não há nome', txt.startsWith('Melissa Argenta <melissa.argenta@alcast.com.br>, maiara.morais@pricetax.com.br, ') && txt.includes('rafael.souza@pricetax.com.br'), txt);
const href = attendeesMailto(att, 'AGENDA PRICE TAX - TI');
const back = parseMailto(href);
ok('e-mail para todos: os 7 outros (sem você) no Para', back.to.length === 7 && !back.to.some((p) => p.email === 'rafael.souza@pricetax.com.br'), back);
ok('assunto = nome da agenda', back.subject === 'AGENDA PRICE TAX - TI', back.subject);
ok('assunto com acento, & e quebra de linha', parseMailto(attendeesMailto(att, 'Reunião KUHN & PRICETAX\nfase 2')).subject === 'Reunião KUHN & PRICETAX fase 2');
ok('nome com vírgula vai entre aspas', attendeesCopyText([{ name: 'Souza, Rafael', email: 'r@x.com.br' }]) === '"Souza, Rafael" <r@x.com.br>');
ok('só você no evento: sem e-mail para todos', attendeesMailto([{ email: 'eu@x.com.br', self: true }], 'x') === '');
ok('sem participantes: nada', attendeePeople(null).length === 0 && attendeesCopyText([]) === '');

console.log(failed ? `\n${failed} falha(s).` : '\nagenda-attendee-mail: tudo certo');
process.exit(failed ? 1 : 0);
