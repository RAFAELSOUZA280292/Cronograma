// Teste puro das frases de inspiração (§77/§100): só frase conferida vai para a tela, redação real com original, sem política partidária na tela,
// nada do que foi reprovado na verificação entra como frase, e a rotação mostra todos os autores.
//   DATABASE_URL=postgres://localhost:5432/cronograma_dev node scripts/inspiration-quotes.test.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/cronograma_dev';
const { ALL_QUOTES, OFFICIAL_QUOTES, LEADER_QUOTES, LEADERS_NOT_AUTHENTICATED, quoteOfDay, factOf, QUOTE_TRIGGER } = await import('../server/inspirationQuotes.js');
let f = 0; const ok = (n, c, e) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(e))); if (!c) f++; };

const ids = ALL_QUOTES.map((q) => q.id);
ok('ids únicos', new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i));
ok('toda frase tem autor, tema, texto e fonte', ALL_QUOTES.every((q) => q.author && q.theme && q.text && q.source));
ok('toda frase de líder com tradução guarda o original ao lado', LEADER_QUOTES.every((q) => !q.translated || (q.original && q.original.length > 10)));
ok('só entra na tela frase oficial; pesquisa não', OFFICIAL_QUOTES.every((q) => q.verification === 'oficial') && !OFFICIAL_QUOTES.some((q) => q.id === 'drucker-p7'));
const political = LEADER_QUOTES.filter((q) => q.screen === false);
ok('as 3 frases de política partidária do Reagan ficam fora da tela, com aviso', political.length === 3 && political.every((q) => q.author === 'Ronald Reagan' && q.note && !OFFICIAL_QUOTES.includes(q)), political.map((q) => q.id));
ok('toda frase que vai à tela tem orientação prática curta (até 130 caracteres)', OFFICIAL_QUOTES.every((q) => q.practice && q.practice.length <= 130), OFFICIAL_QUOTES.filter((q) => !q.practice || q.practice.length > 130).map((q) => q.id));
const authors = [...new Set(OFFICIAL_QUOTES.map((q) => q.author))];
ok('8 autores na Mensagem do dia', authors.length === 8, authors);
ok('a Mensagem do dia tem 69 frases (22 de Senna/Ford + 47 de líderes; 3 políticas e 8 de pesquisa ficam de fora)', OFFICIAL_QUOTES.length === 69, OFFICIAL_QUOTES.length);
const week = Array.from({ length: 8 }, (_, i) => quoteOfDay(`2026-10-${String(26 + i).padStart(2, '0')}`).author);
ok('8 dias seguidos mostram os 8 autores (nenhum domina a semana)', new Set(week).size === 8, week);
ok('a frase do dia é a mesma para todos no mesmo dia', quoteOfDay('2026-10-26').id === quoteOfDay('2026-10-26').id);
const texts = ALL_QUOTES.map((q) => q.text);
// o que a verificação reprovou NÃO pode ser frase
const banned = [/estrat[eé]gia [eé] uma mercadoria/i, /ser poderoso [eé] como ser uma dama/i, /planeje seu trabalho para hoje/i, /disciplina [eé] fazer aquilo que sabemos/i, /dificultar o trabalho das pessoas/i, /ouvir aquilo que n[aã]o est[aá] sendo dito/i, /tema evitar o desafio/i];
ok('nenhuma frase reprovada na verificação entrou como frase', !texts.some((t) => banned.some((b) => b.test(t))), texts.filter((t) => banned.some((b) => b.test(t))));
ok('as 7 frases sem comprovação estão na lista de aviso', LEADERS_NOT_AUTHENTICATED.length === 7);
const jobs = ALL_QUOTES.filter((q) => q.author === 'Steve Jobs');
ok('Jobs usa a redação real do discurso (não a junção "a única maneira de fazer um excelente trabalho")', jobs.length === 9 && !jobs.some((q) => /excelente trabalho/.test(q.text)) && jobs[0].original.startsWith('And the only way'));
ok('Churchill 6 diz que o original está no singular (Hansard) e Churchill 8 (fragmento solto) ficou de fora', ALL_QUOTES.find((q) => q.id === 'churchill-6').source.includes('singular') && !ALL_QUOTES.some((q) => q.id === 'churchill-8'));
ok('Thatcher 8 usa a fala dela ("Sou uma política de convicção"), não a de outra pessoa', ALL_QUOTES.find((q) => q.id === 'thatcher-8').original === 'I am a conviction politician');
ok('a memória da RENATA marca as frases fora da tela e a orientação como da PRICETAX', factOf(ALL_QUOTES.find((q) => q.id === 'reagan-2')).content.includes('NÃO vai para a Mensagem do dia') && factOf(ALL_QUOTES.find((q) => q.id === 'jobs-3')).content.includes('Orientação prática da PRICETAX (não é do autor)'));
ok('o gatilho da RENATA reconhece os novos autores', ['Churchill', 'Thatcher', 'Reagan', 'Steve Jobs', 'Drucker', 'Honda'].every((a) => QUOTE_TRIGGER.test(`uma frase de ${a}`)));
console.log(f ? `\n${f} FALHA(S)` : '\ntodos os testes de frases ok');
process.exit(f ? 1 : 0);
