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

// Frases famosas que NÃO constam da lista autenticada de Henry Ford: a RENATA avisa em vez de citar como dele.
export const FORD_NOT_AUTHENTICATED = [
  '“Se eu perguntasse aos clientes o que queriam, diriam cavalos mais rápidos” (“faster horses”): o próprio The Henry Ford diz que nunca foi satisfatoriamente rastreada até Ford — só aparece no início do século XXI, citada por gurus de negócios.',
  '“Se você pensa que pode ou que não pode, de qualquer forma está certo”: não consta da lista autenticada do Benson Ford Research Center (conferi a lista completa).',
  '“O fracasso é apenas a oportunidade de começar de novo, desta vez com mais inteligência”: não consta da lista autenticada de citações (conferi a lista completa); a origem não foi verificada por mim.',
];

// Frase do dia: só as oficiais, intercalando os autores (Senna, Ford, Senna, Ford…) para nenhum dominar a semana.
export const OFFICIAL_QUOTES = (() => {
  const by = {};
  for (const q of QUOTES.filter((x) => x.verification === 'oficial')) (by[q.author] = by[q.author] || []).push(q);
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
export const QUOTE_TRIGGER = /senna|ayrton|henry ford|frase|cita[çc]|inspira|motiva|ep[ií]grafe|cavalos mais r[aá]pidos|faster horse|pensa que pode|come[çc]ar de novo/i;

export function factOf(q) {
  const tier = q.verification === 'oficial'
    ? (q.author === 'Henry Ford' ? 'Comprovação: CONFERIDA na lista oficial de citações autenticadas do Benson Ford Research Center (The Henry Ford).' : 'Comprovação: CONFERIDA no site oficial senna.com (palavra por palavra).')
    : `Comprovação: NÃO conferida na fonte — veio de uma pesquisa recebida pelo Rafael. Ao citar, diga isso.${q.note ? ` ${q.note}` : ''}`;
  const orig = q.original ? ` Original em inglês: “${q.original}” (o texto em português é tradução livre).` : '';
  return {
    id: `${QUOTE_FACT_PREFIX}${q.id}`,
    subject: `Frase de ${q.author} — ${q.theme}`,
    content: `“${q.text}” — ${q.author}. Fonte: ${q.source}${q.sourceUrl ? ` (${q.sourceUrl})` : ''}.${orig} ${tier}`,
    reference: `${q.author}: ${q.source}`.slice(0, 300),
  };
}

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
  const facts = [RULE_FACT, FORD_RULE_FACT, FORD_WARN_FACT, ...QUOTES.map(factOf)];
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
