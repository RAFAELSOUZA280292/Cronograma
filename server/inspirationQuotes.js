// Frases de inspiração (2026-10-05, §77): base CURADA, não gerada por IA. Duas camadas de comprovação, que nunca se misturam:
//  - 'oficial'  = conferida na fonte oficial do autor (Senna: senna.com; Henry Ford: lista autenticada do Benson Ford Research Center,
//                 The Henry Ford): vai para a Mensagem do dia;
//  - 'pesquisa' = veio de uma pesquisa colada pelo Rafael e NÃO foi conferida na fonte: fica só na memória da RENATA, sempre com a ressalva.
// Regra fixa: nenhuma frase entra aqui sem fonte; autor real nunca recebe frase inventada ou "completada" (a redação conta).
// Frases traduzidas guardam o ORIGINAL ao lado (`original`) e saem marcadas como tradução livre.
import { embedTexts } from './embeddings.js';

const SENNA_PAGE = 'https://www.senna.com/no-dia-do-atleta-olimpico-confira-dez-frases-motivacionais-de-ayrton-senna/';
const SENNA_SOURCE = 'senna.com — “Confira dez frases motivacionais de Ayrton Senna” (23/06/2022)';

const oficial = (n, theme, text) => ({ id: `senna-${n}`, author: 'Ayrton Senna', theme, text, verification: 'oficial', source: SENNA_SOURCE, sourceUrl: SENNA_PAGE });
const pesquisa = (n, theme, text, source, note) => ({ id: `senna-p${n}`, author: 'Ayrton Senna', theme, text, verification: 'pesquisa', source, sourceUrl: '', note });

const FORD_URL = 'https://www.thehenryford.org/collections-and-research/digital-resources/popular-topics/henry-ford-quotes';
const FORD_LIST = 'lista de citações autenticadas do Benson Ford Research Center (The Henry Ford)';
const ford = (n, theme, text, original, where) => ({ id: `ford-${n}`, author: 'Henry Ford', theme, text, original, translated: true, verification: 'oficial', source: `${where} — ${FORD_LIST}`, sourceUrl: FORD_URL });

export const QUOTES = [
  oficial(1, 'Competitividade', 'O segundo nada mais é do que o primeiro dos perdedores.'),
  oficial(2, 'Dedicação', 'Se você quer ser bem sucedido, precisa ter dedicação total, buscar seu último limite e dar o melhor de si.'),
  oficial(3, 'Determinação', 'Seja você quem for, seja qual for a posição social que você tenha na vida, a mais alta ou a mais baixa, tenha sempre como meta muita força, muita determinação e sempre faça tudo com muito amor, que um dia você chega lá. De alguma maneira você chega lá.'),
  oficial(4, 'Coragem', 'Não sei dirigir de outra maneira que não seja arriscada. Quando tiver de ultrapassar vou ultrapassar mesmo. Cada piloto tem o seu limite. O meu é um pouco acima do dos outros.'),
  oficial(5, 'Foco', 'Vencer é o que importa. O resto é a consequência.'),
  oficial(6, 'Excelência', 'No que diz respeito ao empenho, ao compromisso, ao esforço, à dedicação, não existe meio termo. Ou você faz uma coisa bem feita ou não faz.'),
  oficial(7, 'Coragem', 'O medo faz parte da vida da gente. Algumas pessoas não sabem como enfrentá-lo, outras – acho que estou entre elas – aprendem a conviver com ele e o encaram não como uma coisa negativa, mas como um sentimento de autopreservação.'),
  oficial(8, 'Coragem', 'O medo me fascina.'),
  oficial(9, 'Resiliência', 'Nas adversidades uns desistem, enquanto outros batem recordes.'),
  oficial(10, 'Coragem', 'Vencer sem correr riscos é triunfar sem glórias!'),

  pesquisa(1, 'Superação', 'Quando chego ao meu limite, descubro que tenho força para ir além.', 'exposição TAG Heuer sobre Senna (segundo a pesquisa recebida)', 'A redação NÃO coincide com nenhuma das 10 frases da página oficial; tratar como paráfrase até achar a fonte.'),
  pesquisa(2, 'Humildade', 'Tenho muito a aprender ainda.', 'entrevista a Reginaldo Leme após o título de 1988, em Suzuka (segundo a pesquisa; a própria pesquisa fala em reconstrução histórica)'),
  pesquisa(3, 'Dedicação', 'Você dá tudo de si, absolutamente tudo.', 'fala publicada no lançamento do McLaren Senna, 2017 (segundo a pesquisa)'),
  pesquisa(4, 'Atitude', 'Se você não busca mais o espaço, então você não é um piloto.', 'resposta a Jackie Stewart sobre o GP do Japão de 1990 (segundo a pesquisa)'),
  pesquisa(5, 'Equilíbrio', 'A regra principal é saber se segurar.', 'entrevista ao Roda Viva, 1986 (segundo a pesquisa; não achei a transcrição)'),
  pesquisa(6, 'Equipe', 'Você tem que, realmente, trabalhar em equipe.', 'entrevista ao Roda Viva, 1986 (segundo a pesquisa; não achei a transcrição)'),
  pesquisa(7, 'Melhoria contínua', 'Há um grande desejo em mim de sempre melhorar, de ficar melhor.', 'acervo oficial Senna (segundo a pesquisa, sem data)'),
  pesquisa(8, 'Planejamento', 'Tudo foi exaustivamente pensado e planejado para dar certo. E deu.', 'declaração de 1993, reproduzida pela Folha de S.Paulo em 8/5/1994 (segundo a pesquisa)'),

  // Henry Ford — as 12 conferidas, uma a uma, na lista oficial completa (PDF "Long Version", 57 páginas) e na página do museu em 05/10/2026.
  ford(1, 'Concorrência', 'O concorrente que devemos temer é aquele que não se preocupa conosco, mas continua melhorando seu próprio negócio o tempo todo.', 'The competitor to be feared is one who never bothers about you at all but goes on making his own business better all the time.', 'Ford News, p. 2, 15/02/1923'),
  ford(2, 'Crescimento', 'Empresas que crescem por meio do desenvolvimento e da melhoria não morrem.', 'Businesses that grow by development and improvement do not die.', 'Ford News, p. 2, 15/02/1923'),
  ford(3, 'Estratégia', 'Esteja pronto para revisar qualquer sistema, descartar qualquer método e abandonar qualquer teoria se o sucesso do trabalho exigir isso.', 'Be ready to revise any system, scrap any method, abandon any theory, if the success of the job requires it.', 'Ford News, p. 2, 15/01/1923'),
  ford(4, 'Inovação', 'Muitas pessoas procuram maneiras melhores de fazer coisas que nem deveriam precisar ser feitas.', 'Many people are busy trying to find better ways of doing things that should not have to be done at all.', 'Ford News, p. 2, 15/11/1922'),
  ford(5, 'Dinheiro', 'O dinheiro arruinará a vida de qualquer homem que o trate como algo diferente de uma ferramenta de trabalho.', 'Money will ruin the life of any man who treats it like anything but a tool with which to work.', 'New Orleans Times-Picayune, entrevista de Meigs Frost, 22/07/1934'),
  ford(6, 'Sucesso', 'Fazer pelo mundo mais do que o mundo faz por você: isso é sucesso.', 'But to do for the world more than the world does for you--that is Success.', 'Ford News, p. 2, 01/03/1926'),
  ford(7, 'Oportunidade', 'A única coisa que você pode dar a alguém sem prejudicá-lo é uma oportunidade.', 'The only thing you can give a man without hurting him is an opportunity.', 'New Orleans Times-Picayune, entrevista de Meigs Frost, 22/07/1934'),
  ford(8, 'Trabalho', 'O trabalho é a nossa sanidade, o nosso respeito próprio, a nossa salvação. O trabalho do dia é o centro de tudo.', "Work is our sanity, our self-respect, our salvation. The day's work is the center of everything.", 'The New York Times, 11/04/1915'),
  ford(9, 'Persistência', 'Os sucessos rápidos, conquistados em pouco tempo e sem dificuldade, não valem muito.', 'The short successes that can be gained in a brief time and without difficulty, are not worth much.', 'Ford News, p. 2, 01/01/1922'),
  ford(10, 'Pensamento', 'Os golpes duros têm seu lugar e seu valor, mas pensar com afinco leva mais longe em menos tempo.', 'Hard knocks have a place and value, but hard thinking goes farther in less time.', 'Ford News, p. 2, 15/01/1926'),
  ford(11, 'Caráter', 'A maior coisa que podemos produzir é o caráter. Tudo o mais pode ser tirado de nós, menos o nosso caráter.', 'Greatest thing we can produce is character. Everything else can be taken from us, but not our character.', 'Cincinnati Times-Star, entrevista de Beckman, 11/11/1937'),
  ford(12, 'Mudança', 'Sempre que você achar que está “definido”, ou que alguma coisa está “definida” para a vida toda, é melhor se preparar para uma mudança repentina.', "Whenever you get the idea that you are 'fixed' or that anything is 'fixed' for life, you'd better get ready for a sudden change.", 'N.Y. World-Telegram, 26/07/1933'),
];

// Orientação prática da PRICETAX para as frases de Senna e Ford (as dos líderes trazem a sua na própria entrada). Não é do autor.
const PRACTICE = {
  'senna-1': 'Não se contente em ser o segundo melhor para o cliente: entregue o que faz a diferença.',
  'senna-2': 'Escolha uma entrega de hoje e dê o seu melhor nela até o fim.',
  'senna-3': 'Faça tudo com muito amor e determinação, inclusive a tarefa que ninguém vai ver.',
  'senna-4': 'Conheça o seu limite técnico e assuma o risco calculado quando a tese pedir.',
  'senna-5': 'Foque no resultado do cliente; o resto vem como consequência.',
  'senna-6': 'Faça bem feito ou não faça: revise a entrega antes de enviar.',
  'senna-7': 'Reconheça o medo de errar e use-o como cuidado, não como freio.',
  'senna-8': 'Olhe para o que o assusta no projeto: é onde está o aprendizado.',
  'senna-9': 'Em um imprevisto, procure a forma de entregar ainda melhor.',
  'senna-10': 'Assuma o risco que você consegue sustentar tecnicamente.',
  'ford-1': 'Acompanhe quem melhora sem fazer barulho: aprenda o que ele faz de diferente.',
  'ford-2': 'Melhore um processo seu hoje, por menor que seja.',
  'ford-3': 'Se o método não entrega o resultado, troque-o sem apego.',
  'ford-4': 'Antes de melhorar uma tarefa, pergunte se ela precisa existir.',
  'ford-5': 'Trate o dinheiro como meio de entregar valor, não como o fim.',
  'ford-6': 'Entregue um pouco mais do que o combinado, com a qualidade de sempre.',
  'ford-7': 'Dê a alguém do time uma oportunidade real de crescer.',
  'ford-8': 'Valorize o trabalho do dia: ele é a base de tudo que vem depois.',
  'ford-9': 'Sucesso rápido vale pouco: planeje o passo difícil que sustenta o resultado.',
  'ford-10': 'Pense antes de agir: dez minutos de análise poupam horas de retrabalho.',
  'ford-11': 'Seu caráter é o ativo que ninguém tira: cumpra o que prometeu ao cliente.',
  'ford-12': 'Não se acomode no que está “definido”: reveja a premissa do projeto hoje.',
};
QUOTES.forEach((q) => { if (PRACTICE[q.id]) q.practice = PRACTICE[q.id]; });

// ---- Líderes (2026-10-25): 60 frases pedidas pelo Rafael, CADA UMA conferida na fonte por uma verificação por autor. Só entra a redação REAL
// (quando a frase da pesquisa estava condensada ou diferente, vale a do original, com a tradução fiel); o que não passou virou aviso (LEADERS_NOT_AUTHENTICATED).
// `practice` = orientação prática da PRICETAX para o trabalho (nossa, rotulada na tela; não é do autor). `screen:false` = frase real que a RENATA pode citar
// mas que não vai para a Mensagem do dia (política partidária: há colaboradores de crenças diferentes).
const lead = (author, key, n, theme, text, original, source, sourceUrl, practice, extra = {}) => ({ id: `${key}-${n}`, author, theme, text, original, translated: true, verification: 'oficial', source, sourceUrl, practice, ...extra });
const TF = 'Margaret Thatcher Foundation';
const thatcher = (n, theme, text, original, source, url, practice, extra) => lead('Margaret Thatcher', 'thatcher', n, theme, text, original, `${source} — ${TF}`, url, practice, extra);
const ICS = 'International Churchill Society';
const churchill = (n, theme, text, original, source, url, practice) => lead('Winston Churchill', 'churchill', n, theme, text, original, `${source} — ${ICS}`, url, practice);
const reagan = (n, theme, text, original, source, url, practice, extra) => lead('Ronald Reagan', 'reagan', n, theme, text, original, `${source} — Ronald Reagan Presidential Library`, url, practice, extra);
const JOBS_URL = 'https://news.stanford.edu/2005/06/12/youve-got-find-love-jobs-says/';
const jobs = (n, theme, text, original, practice) => lead('Steve Jobs', 'jobs', n, theme, text, original, 'Discurso de formatura na Universidade Stanford, 12/06/2005 — transcrição oficial da Stanford News', JOBS_URL, practice);
const drucker = (n, theme, text, original, source, url, practice, extra) => lead('Peter Drucker', 'drucker', n, theme, text, original, source, url, practice, extra);
const honda = (n, theme, text, original, source, url, practice) => lead('Soichiro Honda', 'honda', n, theme, text, original, source, url, practice);
const HONDA_US = 'honda.com/history, rubrica "Soichiro Honda, Founder" (atribuição institucional da Honda, sem data nem ocasião)';

export const LEADER_QUOTES = [
  thatcher(1, 'Convicção', 'Vocês podem dar meia-volta, se quiserem. A dama não vai dar meia-volta.', "You turn if you want to. The lady's not for turning.", 'Conferência do Partido Conservador, Brighton, 10/10/1980', 'https://www.margaretthatcher.org/document/104431', 'Decida o que não é negociável no seu trabalho e sustente com calma, sem se justificar demais.'),
  thatcher(2, 'Persistência', 'Muitas vezes é preciso travar batalhas mais de uma vez para vencê-las.', 'You often have to fight battles more than once to win them.', 'Discurso à Câmara de Comércio Britânica, Savoy Hotel, 10/01/1979 (registrada em nota editorial da Fundação que cita a imprensa, Guardian de 11/01/1979)', 'https://www.margaretthatcher.org/document/103922', 'Tese recusada não morreu: reapresente com dado novo ou por outro ângulo.'),
  thatcher(5, 'Responsabilidade', 'Centavos não caem do céu; é preciso ganhá-los aqui na terra.', "Pennies don't fall from heaven, they have to be earned here on earth.", "Lord Mayor's Banquet, Guildhall, 12/11/1979", 'https://www.margaretthatcher.org/document/104167', 'Transforme a meta de hoje numa entrega concreta, com dono e prazo.'),
  thatcher(6, 'Integridade', 'Se você simplesmente se propuser a ser querido, estaria disposto a ceder em qualquer coisa, a qualquer momento, não é? E não realizaria nada!', 'You know, if you just set out to be liked, you would be prepared to compromise on anything, wouldn\'t you, at any time? And you would achieve nothing!', 'Entrevista à Press Association, Downing Street, 03/05/1989', 'https://www.margaretthatcher.org/document/107427', 'Diga ao cliente o que ele precisa ouvir, com respeito. Agradar não é a meta.'),
  thatcher(8, 'Convicção', 'Sou uma política de convicção.', 'I am a conviction politician', 'Entrevista coletiva, CHOGM, Melbourne, 07/10/1981', 'https://www.margaretthatcher.org/document/104713', 'Saiba explicar por que você defende cada tese, com a norma na mão.'),
  thatcher(9, 'Paciência', 'Sou extraordinariamente paciente, desde que no fim eu consiga o que quero.', 'I am extraordinarily patient—provided I get my own way in the end.', 'Resposta na Câmara dos Comuns (Hansard), 31/03/1982', 'https://www.margaretthatcher.org/document/104908', 'Paciência com objetivo: defina o resultado esperado e a data de revisão.'),
  thatcher(10, 'Valor', 'Não é a criação de riqueza que está errada, mas o amor ao dinheiro por si mesmo.', 'But it is not the creation of wealth that is wrong but love of money for its own sake.', 'Discurso à Assembleia Geral da Igreja da Escócia, Edimburgo, 21/05/1988', 'https://www.margaretthatcher.org/document/107246', 'Meça o valor entregue ao cliente antes do valor cobrado.'),

  churchill(1, 'Persistência', 'Nunca ceda, nunca ceda, nunca, nunca, nunca — em nada, grande ou pequeno, importante ou trivial — nunca ceda, exceto a convicções de honra e bom senso.', 'never give in, never give in, never, never, never-in nothing, great or small, large or petty – never give in except to convictions of honour and good sense.', 'Discurso na Harrow School, 29/10/1941', 'https://winstonchurchill.org/resources/speeches/1941-1945-war-leader/never-give-in/', 'Quando a tese estiver certa, não ceda por cansaço. Ceda só a um argumento melhor.'),
  churchill(2, 'Esforço', 'Não tenho nada a oferecer senão sangue, trabalho árduo, lágrimas e suor.', 'I have nothing to offer but blood, toil, tears and sweat.', 'Primeiro discurso como primeiro-ministro, 13/05/1940', 'https://winstonchurchill.org/resources/speeches/1940-the-finest-hour/blood-toil-tears-and-sweat/', 'Resultado pede esforço visível: o que você entrega hoje para merecer a confiança de amanhã?'),
  churchill(3, 'Coragem', 'Lutaremos nas praias, lutaremos nos locais de pouso, lutaremos nos campos e nas ruas, lutaremos nas colinas; nunca nos renderemos.', 'we shall fight on the beaches, we shall fight on the landing grounds, we shall fight in the fields and in the streets, we shall fight in the hills; we shall never surrender', 'Câmara dos Comuns, 04/06/1940', 'https://winstonchurchill.org/resources/speeches/1940-the-finest-hour/we-shall-fight-on-the-beaches/', 'Mantenha a posição técnica em todas as frentes, da reunião ao e-mail.'),
  churchill(4, 'Dever', 'Os homens ainda dirão: “Esta foi a melhor hora deles.”', "men will still say, 'This was their finest hour.'", 'Câmara dos Comuns, 18/06/1940', 'https://winstonchurchill.org/resources/speeches/1940-the-finest-hour/their-finest-hour/', 'Reconheça o esforço do time em voz alta, no momento em que ele acontece.'),
  churchill(5, 'Gratidão', 'Nunca, no campo dos conflitos humanos, tanto foi devido por tantos a tão poucos.', 'Never in the field of human conflict was so much owed by so many to so few.', 'Câmara dos Comuns, 20/08/1940', 'https://winstonchurchill.org/resources/speeches/1940-the-finest-hour/the-few/', 'Agradeça, pelo nome, a quem sustentou a entrega.'),
  churchill(6, 'Autonomia', 'Ainda somos senhores do nosso destino. Ainda somos capitães de nossas almas.', 'We still are master of our fate. We still are captain of our souls.', 'Câmara dos Comuns, 09/09/1941 (Hansard, "War Situation"; o original está no singular)', 'https://api.parliament.uk/historic-hansard/commons/1941/sep/09/war-situation', 'Foque no que está sob o seu controle: o próximo passo, hoje.'),
  churchill(7, 'Resistência', 'Mas devemos aprender a ser igualmente bons no que é curto e intenso e no que é longo e duro.', 'But we must learn to be equally good at what is short and sharp and what is long and tough.', 'Discurso na Harrow School, 29/10/1941', 'https://winstonchurchill.org/resources/speeches/1941-1945-war-leader/never-give-in/', 'Equilibre a urgência do dia com o projeto de meses: reserve tempo para os dois.'),
  churchill(9, 'Perseverança', 'Podemos ter certeza de que só precisamos perseverar para vencer.', 'we can be sure that we have only to persevere to conquer.', 'Discurso na Harrow School, 29/10/1941', 'https://winstonchurchill.org/resources/speeches/1941-1945-war-leader/never-give-in/', 'Constância vence: faça hoje o passo pequeno que o cronograma pede.'),
  churchill(10, 'Visão', 'Não falemos de dias mais sombrios; falemos antes de dias mais severos. Estes não são dias sombrios; são grandes dias.', 'Do not let us speak of darker days: let us speak rather of sterner days. These are not dark days; these are great days', 'Discurso na Harrow School, 29/10/1941', 'https://winstonchurchill.org/resources/speeches/1941-1945-war-leader/never-give-in/', 'Trate o prazo apertado como exigência a vencer, não como desculpa.'),

  reagan(1, 'Destino', 'Você e eu temos um encontro marcado com o destino.', 'You and I have a rendezvous with destiny.', '"A Time for Choosing", 27/10/1964', 'https://www.reaganlibrary.gov/archives/speech/time-choosing-speech-october-27-1964', 'Escolha uma ação de hoje que honre o compromisso que você assumiu com o cliente.'),
  reagan(4, 'Ambição', 'É hora de percebermos que somos uma nação grande demais para nos limitarmos a pequenos sonhos.', "It is time for us to realize that we're too great a nation to limit ourselves to small dreams.", 'Discurso de posse, 20/01/1981', 'https://www.reaganlibrary.gov/archives/speech/inaugural-address-1981', 'Pense grande: que resultado o seu cliente ainda não imaginou que é possível?'),
  reagan(5, 'Iniciativa', 'Não acredito em um destino que recaia sobre nós façamos o que fizermos. Acredito, sim, em um destino que recairá sobre nós se nada fizermos.', 'I do not believe in a fate that will fall on us no matter what we do. I do believe in a fate that will fall on us if we do nothing.', 'Discurso de posse, 20/01/1981', 'https://www.reaganlibrary.gov/archives/speech/inaugural-address-1981', 'Não decidir também é uma escolha, com consequências. Decida e comece.'),
  reagan(6, 'Ambição', 'Temos todo o direito de sonhar sonhos heroicos.', 'We have every right to dream heroic dreams.', 'Discurso de posse, 20/01/1981', 'https://www.reaganlibrary.gov/archives/speech/inaugural-address-1981', 'Permita-se uma meta grande para este trimestre e escreva o primeiro passo.'),
  reagan(8, 'Oportunidade', 'Acreditamos que a oportunidade é o verdadeiro motor do progresso, o capitão dos grandes empreendimentos.', 'We believe opportunity is the true engine of progress, the captain of great endeavors.', 'Pronunciamento de rádio, 15/09/1984', 'https://www.reaganlibrary.gov/archives/speech/radio-address-nation-presidential-campaign-2', 'Procure a oportunidade escondida dentro do problema do cliente.'),
  reagan(9, 'Crescimento', 'Não há limites para o crescimento e o progresso humano quando homens e mulheres são livres para seguir seus sonhos.', 'There are no limits to growth and human progress when men and women are free to follow their dreams.', 'Segundo discurso de posse, 21/01/1985', 'https://www.reaganlibrary.gov/archives/speech/inaugural-address-1985', 'Dê autonomia a quem está perto do trabalho: gente livre para decidir avança mais.'),
  reagan(10, 'Realismo', 'Mas temos de encarar a verdade e depois trabalhar para mudar o quadro.', 'But we have to face the truth and then go to work to turn things around.', 'Pronunciamento à nação sobre a economia, 05/02/1981', 'https://reaganlibrary.gov/research/speeches/20581c', 'Comece pelo diagnóstico honesto; só depois apresente a solução.'),
  reagan(2, 'Governo', 'Na atual crise, o governo não é a solução para o nosso problema; o governo é o problema.', 'In this present crisis, government is not the solution to our problem; government is the problem.', 'Discurso de posse, 20/01/1981', 'https://www.reaganlibrary.gov/archives/speech/inaugural-address-1981', '', { screen: false, note: 'Frase real, mas política partidária: fora da Mensagem do dia (colaboradores de crenças diferentes). Cite só se pedirem, com a fonte.' }),
  reagan(3, 'Governo', 'Somos uma nação que tem um governo, e não o contrário.', 'We are a nation that has a government -- not the other way around.', 'Discurso de posse, 20/01/1981', 'https://www.reaganlibrary.gov/archives/speech/inaugural-address-1981', '', { screen: false, note: 'Frase real, mas política partidária: fora da Mensagem do dia. Cite só se pedirem, com a fonte.' }),
  reagan(7, 'Governo', 'O governo pode e deve proporcionar oportunidade, não sufocá-la; fomentar a produtividade, não reprimi-la.', 'Government can and must provide opportunity, not smother it; foster productivity, not stifle it.', 'Discurso de posse, 20/01/1981', 'https://www.reaganlibrary.gov/archives/speech/inaugural-address-1981', '', { screen: false, note: 'Frase real, mas política partidária: fora da Mensagem do dia. Cite só se pedirem, com a fonte.' }),

  jobs(1, 'Excelência', 'E a única maneira de fazer um grande trabalho é amar o que você faz.', 'And the only way to do great work is to love what you do.', 'Escolha a parte do trabalho que você faria de graça e eleve o padrão dela hoje.'),
  jobs(2, 'Ambição', 'Continue com fome. Continue tolo.', 'Stay Hungry. Stay Foolish.', 'Pergunte hoje uma coisa que você ainda não sabe, sem medo de parecer iniciante.'),
  jobs(3, 'Propósito', 'Seu tempo é limitado, então não o desperdice vivendo a vida de outra pessoa.', "Your time is limited, so don't waste it living someone else's life.", 'Revise se o que você faz hoje serve ao seu objetivo, e não ao de outra pessoa.'),
  jobs(4, 'Coragem', 'E o mais importante: tenha coragem de seguir seu coração e sua intuição.', 'And most important, have the courage to follow your heart and intuition.', 'Defenda a decisão em que você acredita, mesmo sem consenso, e explique o porquê.'),
  jobs(5, 'Visão', 'De novo: você não consegue conectar os pontos olhando para a frente; só consegue conectá-los olhando para trás.', "Again, you can't connect the dots looking forward; you can only connect them looking backward.", 'Registre hoje o que aprendeu: mais tarde, vai se conectar com outra coisa.'),
  jobs(6, 'Resiliência', 'Às vezes a vida te acerta a cabeça com um tijolo. Não perca a fé.', "Sometimes life hits you in the head with a brick. Don't lose faith.", 'Quando um projeto der errado, mantenha a fé no método e ajuste o plano.'),
  jobs(7, 'Busca', 'Se você ainda não encontrou, continue procurando. Não se acomode.', "If you haven't found it yet, keep looking. Don't settle.", 'Procure o que torna o seu trabalho excelente e não aceite o “bom o bastante”.'),
  jobs(9, 'Decisão', 'Lembrar que vou morrer em breve é a ferramenta mais importante que já encontrei para me ajudar a fazer as grandes escolhas da vida.', "Remembering that I'll be dead soon is the most important tool I've ever encountered to help me make the big choices in life.", 'Ao decidir algo grande, pergunte: eu faria isso se tivesse pouco tempo?'),
  jobs(10, 'Coragem', 'Não há razão para não seguir seu coração.', 'There is no reason not to follow your heart.', 'Siga o que você acredita ser certo e explique o motivo ao time.'),

  drucker(2, 'Eficácia', 'Não há nada tão inútil quanto fazer com grande eficiência aquilo que não deveria ser feito de modo algum.', 'There is surely nothing quite so useless as doing with great efficiency what should not be done at all.', 'Harvard Business Review, maio/1963, "Managing for Business Effectiveness" (texto localizado via Quote Investigator; o artigo da HBR não foi lido)', 'https://quoteinvestigator.com/2017/02/09/efficient/', 'Antes de aperfeiçoar uma tarefa, pergunte se ela precisa existir.'),
  drucker(3, 'Oportunidade', 'Resultados são obtidos explorando oportunidades, e não resolvendo problemas. Tudo o que se pode esperar de resolver um problema é restabelecer a normalidade.', 'Results are obtained by exploiting opportunities, not by solving problems. All one can hope to get by solving a problem is to restore normality.', 'Managing for Results (1964), cap. 1 (trecho visto no Google Books)', '', 'Dedique a primeira hora a uma oportunidade, não a um problema que já está sob controle.'),
  drucker(4, 'Tempo', 'O tempo é o recurso mais escasso e, a menos que seja administrado, nada mais pode ser administrado.', 'Time is the scarcest resource, and unless it is managed, nothing else can be managed.', 'The Effective Executive (1967), cap. 2 (trecho visto no Google Books)', '', 'Bloqueie hoje uma hora sem interrupção para o trabalho que mais importa.'),
  drucker(5, 'Eficácia', 'Eficiência é preocupar-se em fazer as coisas da maneira certa. Eficácia é fazer as coisas certas.', 'Efficiency is concerned with doing things right. Effectiveness is doing the right things.', 'Management: Tasks, Responsibilities, Practices (1974), cap. 4 (trecho visto no Google Books)', '', 'Antes de fazer bem, confirme que é a coisa certa a fazer.'),
  drucker(6, 'Liderança', '… elevar a visão de uma pessoa a horizontes mais altos, levar seu desempenho a um padrão mais alto, construir sua personalidade além de seus limites normais.', "...lifting of a man's vision to higher sights, the raising of a man's performance to a higher standard, the building of a man's personality beyond its normal limitations.", 'The Practice of Management (1954), p. 138 da edição de 2012 (trecho visto no Google Books; a abertura da frase não foi vista)', '', 'Eleve um colega: mostre um padrão mais alto e dê o apoio para ele chegar lá.'),
  drucker(9, 'Inovação', 'Para ser eficaz, uma inovação precisa ser simples e precisa ser focada. Deve fazer uma só coisa; senão, confunde.', 'An innovation, to be effective, has to be simple and it has to be focused. It should do only one thing, otherwise it confuses.', 'Innovation and Entrepreneurship (1985), p. 123 da edição de 2012 (trecho visto no Google Books)', '', 'Simplifique a entrega até ela caber numa frase.'),

  honda(1, 'Persistência', 'O sucesso representa 1% do seu trabalho, que resulta dos 99% chamados de fracasso.', 'Success represents the 1% of your work which results from the 99% that is called failure', 'Honda Europa, release de 09/04/2020 (atribuição institucional; o original em japonês e a ocasião não foram encontrados)', 'https://hondanews.eu/eu/en/cars/media/pressreleases/203177/honda-origins-history-and-values-in-animated-manga-comic-format', 'Errou? Registre o aprendizado e tente de novo: é o caminho normal.'),
  honda(3, 'Filosofia', 'Ação sem filosofia é uma arma letal; filosofia sem ação não tem valor.', 'Action without philosophy is a lethal weapon; philosophy without action is worthless.', 'Citada por Kawamoto no prefácio do livreto "Honda Philosophy", 01/01/1992 (história oficial da Honda)', 'https://global.honda/en/about/history-digest/75years-history/chapter1/section3/page2.html', 'Toda tarefa de hoje deve ter um propósito claro e uma ação concreta.'),
  honda(4, 'Originalidade', 'Não desejamos imitar os outros.', 'We do not wish to imitate others.', HONDA_US, 'https://www.honda.com/history', 'Não copie o concorrente: procure o que só a PRICETAX consegue entregar.'),
  honda(5, 'Inovação', 'A não conformidade é essencial para um artista ou inventor.', 'Non conformity is essential to an artist or inventor.', HONDA_US, 'https://www.honda.com/history', 'Questione um processo que “sempre foi assim”.'),
  honda(6, 'Propósito', 'O valor da vida pode ser medido pelo número de vezes que sua alma foi profundamente tocada.', 'The value of life can be measured by how many times your soul has been deeply stirred.', HONDA_US, 'https://www.honda.com/history', 'Procure no trabalho de hoje um momento que valeu a pena.'),
  honda(7, 'Contribuição', 'O que posso fazer pela sociedade e pelos outros?', 'What can I do for society and for others?', 'Filosofia Honda (global.honda, "Hondaism"; no japonês original a pergunta é coletiva: “o que podemos fazer”)', 'https://global.honda/en/about/hondaism/', 'Pergunte como este projeto contribui para além da entrega.'),
  honda(8, 'Propósito', 'Ver essa pessoa feliz é o que me dá felicidade.', 'Seeing that person happy is what gives me happiness.', 'Filosofia Honda (global.honda, "Hondaism")', 'https://global.honda/en/about/hondaism/', 'Celebre quando o cliente entende e sorri: é o melhor indicador.'),
  honda(9, 'Aprendizado', 'Devemos ter vontade de enfrentar as dificuldades e sabedoria para criar novos valores, sem nos prender a padrões estabelecidos.', 'We must possess the will to challenge difficulties and the wisdom to create new values without being bound by established standards.', HONDA_US, 'https://www.honda.com/history', 'Enfrente a dificuldade e crie uma forma nova de resolvê-la.'),
  honda(10, 'Competição', 'Sem corridas o automóvel não melhoraria. A competição frente a frente diante de uma multidão é o caminho para se tornar o número um do mundo.', 'Without racing the automobile would not get better. Head-to-head competition in front of a crowd is the way to become number one in the world.', HONDA_US, 'https://www.honda.com/history', 'Teste suas ideias em público: apresente cedo, receba crítica e melhore.'),

  // Real, mas não visto na fonte primária: só a RENATA, com a ressalva.
  { id: 'drucker-p7', author: 'Peter Drucker', theme: 'Planejamento', text: 'Planejamento de longo prazo não lida com decisões futuras. Lida com a dimensão de futuro das decisões presentes.', original: '…it does not deal with future decisions. It deals with the futurity of present decisions.', translated: true, verification: 'pesquisa', source: 'Management Science 5(3), abril/1959, "Long-Range Planning: Challenge to Management Science" (referência vinda de artigo que o cita; o texto não foi lido)', sourceUrl: '', note: 'A versão curta que circula ("o futuro das decisões presentes") não foi achada no texto.' },
];

// Frases que circulam com o nome destes autores mas NÃO foram comprovadas na fonte: a RENATA avisa em vez de citar como dele(a).
export const LEADERS_NOT_AUTHENTICATED = [
  'Margaret Thatcher — “Ser poderoso é como ser uma dama. Se você precisa dizer que é, então não é” (“Being powerful is like being a lady…”): a ligação com Thatcher só surge em 1984, sem citação direta; o Quote Investigator a acha antes (1975/76) com Jesse Carr, sindicalista do Alasca. Nada na Margaret Thatcher Foundation.',
  'Margaret Thatcher — “Planeje seu trabalho para hoje e todos os dias. Depois, execute seu plano”: só aparece em sites de citações, sem discurso nem data. Não achei na Fundação.',
  'Margaret Thatcher — “Disciplina é fazer aquilo que sabemos ser certo, mesmo quando é difícil”: não consta da Fundação; circula também creditada a Brian Tracy, e a versão longa original é “Disciplining yourself to do what you know is right and important, although difficult, is the highroad to pride, self-esteem, and personal satisfaction”.',
  'Peter Drucker — “A estratégia é uma mercadoria. A execução é uma arte” (“Strategy is a commodity, execution is an art”): não achei em obra dele; o Drucker Institute a lista como citação frequente SEM fonte. Provável atribuição incorreta.',
  'Peter Drucker — “Grande parte do que chamamos de gestão consiste em dificultar o trabalho das pessoas”: circula como dele desde 1975/76, mas não achei em obra dele com livro e ano.',
  'Peter Drucker — “O mais importante na comunicação é ouvir aquilo que não está sendo dito”: só aparece como epígrafe de livros a partir de 2009; nenhuma obra dele localizada.',
  'Soichiro Honda — “Em vez de temer o desafio e o fracasso, tema evitar o desafio e não fazer nada”: nenhuma fonte da Honda traz essa frase (a Honda publica só um texto institucional parecido: “Doing nothing through fear of failure prevents progress”). Real dele sobre fracasso: “To me, success can only be achieved through repeated failure and introspection” (Honda USA).',
];

// Frases famosas que NÃO constam da lista autenticada de Henry Ford: a RENATA avisa em vez de citar como dele.
export const FORD_NOT_AUTHENTICATED = [
  '“Se eu perguntasse aos clientes o que queriam, diriam cavalos mais rápidos” (“faster horses”): o próprio The Henry Ford diz que nunca foi satisfatoriamente rastreada até Ford — só aparece no início do século XXI, citada por gurus de negócios.',
  '“Se você pensa que pode ou que não pode, de qualquer forma está certo”: não consta da lista autenticada do Benson Ford Research Center (conferi a lista completa).',
  '“O fracasso é apenas a oportunidade de começar de novo, desta vez com mais inteligência”: não consta da lista autenticada de citações (conferi a lista completa); a origem não foi verificada por mim.',
];

export const ALL_QUOTES = [...QUOTES, ...LEADER_QUOTES];

// Frase do dia: só as oficiais com `screen` ligado (não vão as de política partidária), intercalando os autores para nenhum dominar a semana.
export const OFFICIAL_QUOTES = (() => {
  const by = {};
  for (const q of ALL_QUOTES.filter((x) => x.verification === 'oficial' && x.screen !== false)) (by[q.author] = by[q.author] || []).push(q);
  const lists = Object.values(by);
  const out = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
})();

function dayOfYear(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

// Frase do dia: só as oficiais, determinística por data (todo mundo vê a mesma no mesmo dia).
export function quoteOfDay(day) {
  return OFFICIAL_QUOTES[dayOfYear(day) % OFFICIAL_QUOTES.length];
}

// ---- memória da RENATA -------------------------------------------------------------------------------------------------
export const QUOTE_FACT_PREFIX = 'akf-quote-';
export const QUOTE_TRIGGER = /senna|ayrton|henry ford|thatcher|churchill|reagan|steve jobs|\bjobs\b|drucker|honda|frase|cita[çc]|inspira|motiva|ep[ií]grafe|cavalos mais r[aá]pidos|faster horse|pensa que pode|come[çc]ar de novo/i;

const TIER_BY_AUTHOR = {
  'Henry Ford': 'Comprovação: CONFERIDA na lista oficial de citações autenticadas do Benson Ford Research Center (The Henry Ford).',
  'Ayrton Senna': 'Comprovação: CONFERIDA no site oficial senna.com (palavra por palavra).',
};

export function factOf(q) {
  const tier = q.verification === 'oficial'
    ? (TIER_BY_AUTHOR[q.author] || `Comprovação: CONFERIDA na fonte indicada, com a redação original (verificação de 25/10/2026). Quando a fonte é institucional ou de trecho de livro, isso está dito na fonte.`)
    : `Comprovação: NÃO conferida na fonte — ${q.author === 'Ayrton Senna' ? 'veio de uma pesquisa recebida pelo Rafael' : 'a origem não foi lida por completo'}. Ao citar, diga isso.${q.note ? ` ${q.note}` : ''}`;
  const orig = q.original ? ` Original em inglês: “${q.original}” (o texto em português é tradução livre).` : '';
  const screen = q.screen === false ? ` NÃO vai para a Mensagem do dia. ${q.note || ''}` : '';
  const practice = q.practice ? ` Orientação prática da PRICETAX (não é do autor): ${q.practice}` : '';
  return {
    id: `${QUOTE_FACT_PREFIX}${q.id}`,
    subject: `Frase de ${q.author} — ${q.theme}`,
    content: `“${q.text}” — ${q.author}. Fonte: ${q.source}${q.sourceUrl ? ` (${q.sourceUrl})` : ''}.${orig} ${tier}${screen}${practice}`,
    reference: `${q.author}: ${q.source}`.slice(0, 300),
  };
}

const LEADERS_RULE_FACT = {
  id: `${QUOTE_FACT_PREFIX}regra-lideres`,
  subject: 'Como citar Thatcher, Churchill, Reagan, Steve Jobs, Peter Drucker e Soichiro Honda',
  content: 'Quando alguém pedir uma frase destes autores, use SOMENTE as registradas nesta memória (subject "Frase de <autor>"): todas conferidas na fonte, com a redação original e a fonte ao lado — a redação conta, não a "melhore". Informe sempre o autor, a fonte e que o português é tradução livre. NÃO cite como deles as frases listadas em "Frases atribuídas a líderes SEM comprovação"; avise que não há comprovação. Frases marcadas "NÃO vai para a Mensagem do dia" são reais, mas só devem ser citadas se a pessoa pedir. A "orientação prática" é da PRICETAX, não do autor: nunca a apresente como fala dele(a).',
  reference: 'Regra de uso — frases de líderes',
};
const LEADERS_WARN_FACT = {
  id: `${QUOTE_FACT_PREFIX}lideres-nao-autenticadas`,
  subject: 'Frases atribuídas a líderes SEM comprovação',
  content: `Estas frases circulam com o nome de Thatcher, Drucker e Honda mas NÃO foram comprovadas na fonte (verificação de 25/10/2026). Se alguém pedir ou citar uma delas, avise e não a apresente como fala do autor: ${LEADERS_NOT_AUTHENTICATED.join(' | ')}`,
  reference: 'Aviso — frases sem comprovação atribuídas a líderes',
};

const RULE_FACT = {
  id: `${QUOTE_FACT_PREFIX}regra-senna`,
  subject: 'Como citar Ayrton Senna',
  content: 'Quando alguém pedir uma frase, citação ou inspiração de Ayrton Senna, use SOMENTE as frases registradas nesta memória (subject "Frase de Ayrton Senna"). Sempre informe a fonte e o grau de comprovação: as marcadas como CONFERIDAS no senna.com podem ser citadas como dele; as marcadas como NÃO conferidas só com a ressalva de que a atribuição ainda não foi verificada. Nunca invente, complete ou "melhore" uma frase, e nunca atribua a ele algo que não esteja aqui. A frase do dia da Mensagem do dia (Inspiração) usa apenas as conferidas.',
  reference: 'Regra de uso — frases de Ayrton Senna',
};

const FORD_RULE_FACT = {
  id: `${QUOTE_FACT_PREFIX}regra-ford`,
  subject: 'Como citar Henry Ford',
  content: 'Quando alguém pedir uma frase ou citação de Henry Ford, use SOMENTE as frases registradas nesta memória (subject "Frase de Henry Ford"): todas conferidas na lista oficial de citações autenticadas do Benson Ford Research Center (The Henry Ford). Informe a fonte (publicação e data) e que o português é tradução livre do original em inglês. Nunca atribua a ele outra frase sem checar a lista oficial. O The Henry Ford adverte que muitas citações circulam sem comprovação e, por política, o centro de pesquisa não verifica citações fora da lista. A frase do dia da Mensagem do dia (Inspiração) alterna Senna e Ford, só com as conferidas.',
  reference: 'Regra de uso — frases de Henry Ford',
};
const FORD_WARN_FACT = {
  id: `${QUOTE_FACT_PREFIX}ford-nao-autenticadas`,
  subject: 'Frases atribuídas a Henry Ford SEM comprovação',
  content: `Estas frases circulam como de Henry Ford mas NÃO constam da lista autenticada do Benson Ford Research Center. Se alguém pedir ou citar uma delas, avise que não há comprovação de que ele a disse e não a apresente como dele: ${FORD_NOT_AUTHENTICATED.join(' ')}`,
  reference: 'Aviso — frases sem comprovação atribuídas a Henry Ford',
};

// Idempotente (id fixo + DO NOTHING: edições feitas depois na Central de Conhecimento não são sobrescritas). Só a organização PRICETAX.
export async function seedQuoteFacts(pool) {
  const { rows: orgs } = await pool.query(`SELECT id FROM organizations WHERE slug='pricetax' LIMIT 1`);
  if (!orgs[0]) return 0;
  const orgId = orgs[0].id;
  const facts = [RULE_FACT, FORD_RULE_FACT, FORD_WARN_FACT, LEADERS_RULE_FACT, LEADERS_WARN_FACT, ...ALL_QUOTES.map(factOf)];
  let created = 0;
  for (const f of facts) {
    const r = await pool.query(
      `INSERT INTO ai_knowledge_facts (id, org_id, project_id, scope, subject, content, status, knowledge_type, origin, reference)
       VALUES ($1,$2,NULL,'org',$3,$4,'active',$5,'other',$6) ON CONFLICT (id) DO NOTHING`,
      [f.id, orgId, f.subject, f.content, /regra-|nao-autenticadas/.test(f.id) ? 'RULE' : 'FACT', f.reference]);
    created += r.rowCount;
  }
  return created;
}

// Melhor esforço: embeddings das frases para a busca semântica. Sem chave/limite de uso, segue só com a busca por palavras.
export async function embedQuoteFacts(pool) {
  const { rows } = await pool.query(`SELECT id, content FROM ai_knowledge_facts WHERE id LIKE $1 AND embedding IS NULL AND status='active'`, [`${QUOTE_FACT_PREFIX}%`]);
  if (!rows.length) return 0;
  const vectors = await embedTexts(rows.map((r) => r.content), 'document');
  for (let i = 0; i < rows.length; i++) await pool.query('UPDATE ai_knowledge_facts SET embedding=$1 WHERE id=$2', [JSON.stringify(vectors[i]), rows[i].id]);
  return rows.length;
}
