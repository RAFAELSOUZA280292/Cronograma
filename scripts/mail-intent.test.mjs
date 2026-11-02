// Link mailto: do painel → pedido para a Caixa de e-mail (src/mail/mailIntent.js).
globalThis.window = { dispatchEvent: () => {} };
globalThis.Event = class { constructor(t) { this.type = t; } };
const { parseMailto, requestCompose, mailIntent } = await import('../src/mail/mailIntent.js');
let failed = 0;
const ok = (name, cond, extra) => { console.log(`${cond ? 'ok  ' : 'FALHA'} ${name}`); if (!cond) { failed++; if (extra !== undefined) console.log(extra); } };

ok('endereço simples', JSON.stringify(parseMailto('mailto:paula.rosner@smart01.com.br')) === JSON.stringify({ to: [{ email: 'paula.rosner@smart01.com.br' }], subject: '' }));
const m = parseMailto('MAILTO:a@x.com,%20b@y.com.br?subject=Proposta%20DeLaval&cc=c@z.com');
ok('vários + assunto', m.to.length === 2 && m.to[1].email === 'b@y.com.br' && m.subject === 'Proposta DeLaval', m);
ok('sem endereço válido = null', parseMailto('mailto:') === null && parseMailto('mailto:fulano') === null);
requestCompose(parseMailto('mailto:debora.macedo@delaval.com'));
ok('pedido guarda escrita e pesquisa', mailIntent.compose.to[0].email === 'debora.macedo@delaval.com' && mailIntent.compose.search === 'debora.macedo@delaval.com');
requestCompose(m);
ok('pesquisa com vários usa OR', mailIntent.compose.search === 'a@x.com OR b@y.com.br');
console.log(failed ? `\n${failed} falha(s).` : '\nTodas as verificações passaram.');
process.exit(failed ? 1 : 0);
