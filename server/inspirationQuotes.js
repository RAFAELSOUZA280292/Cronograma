// Frases de inspiração (2026-10-05, §77): base CURADA, não gerada por IA. Duas camadas de comprovação, que nunca se misturam:
//  - 'oficial'  = conferida palavra por palavra na página oficial senna.com (publicada em 23/06/2022): vai para a Mensagem do dia;
//  - 'pesquisa' = veio de uma pesquisa colada pelo Rafael e NÃO foi conferida na fonte: fica só na memória da RENATA, sempre com a ressalva.
// Regra fixa: nenhuma frase entra aqui sem fonte; autor real nunca recebe frase inventada ou "completada" (a redação conta).
import { embedTexts } from './embeddings.js';

const SENNA_PAGE = 'https://www.senna.com/no-dia-do-atleta-olimpico-confira-dez-frases-motivacionais-de-ayrton-senna/';
const SENNA_SOURCE = 'senna.com — “Confira dez frases motivacionais de Ayrton Senna” (23/06/2022)';

const oficial = (n, theme, text) => ({ id: `senna-${n}`, author: 'Ayrton Senna', theme, text, verification: 'oficial', source: SENNA_SOURCE, sourceUrl: SENNA_PAGE });
const pesquisa = (n, theme, text, source, note) => ({ id: `senna-p${n}`, author: 'Ayrton Senna', theme, text, verification: 'pesquisa', source, sourceUrl: '', note });

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
];

export const OFFICIAL_QUOTES = QUOTES.filter((q) => q.verification === 'oficial');

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
export const QUOTE_TRIGGER = /senna|ayrton|frase|cita[çc]|inspira|motiva|ep[ií]grafe/i;

export function factOf(q) {
  const tier = q.verification === 'oficial'
    ? 'Comprovação: CONFERIDA no site oficial senna.com (palavra por palavra).'
    : `Comprovação: NÃO conferida na fonte — veio de uma pesquisa recebida pelo Rafael. Ao citar, diga isso.${q.note ? ` ${q.note}` : ''}`;
  return {
    id: `${QUOTE_FACT_PREFIX}${q.id}`,
    subject: `Frase de ${q.author} — ${q.theme}`,
    content: `“${q.text}” — ${q.author}. Fonte: ${q.source}${q.sourceUrl ? ` (${q.sourceUrl})` : ''}. ${tier}`,
    reference: `${q.author}: ${q.source}`.slice(0, 300),
  };
}

const RULE_FACT = {
  id: `${QUOTE_FACT_PREFIX}regra-senna`,
  subject: 'Como citar Ayrton Senna',
  content: 'Quando alguém pedir uma frase, citação ou inspiração de Ayrton Senna, use SOMENTE as frases registradas nesta memória (subject "Frase de Ayrton Senna"). Sempre informe a fonte e o grau de comprovação: as marcadas como CONFERIDAS no senna.com podem ser citadas como dele; as marcadas como NÃO conferidas só com a ressalva de que a atribuição ainda não foi verificada. Nunca invente, complete ou "melhore" uma frase, e nunca atribua a ele algo que não esteja aqui. A frase do dia da Mensagem do dia (Inspiração) usa apenas as conferidas.',
  reference: 'Regra de uso — frases de Ayrton Senna',
};

// Idempotente (id fixo + DO NOTHING: edições feitas depois na Central de Conhecimento não são sobrescritas). Só a organização PRICETAX.
export async function seedQuoteFacts(pool) {
  const { rows: orgs } = await pool.query(`SELECT id FROM organizations WHERE slug='pricetax' LIMIT 1`);
  if (!orgs[0]) return 0;
  const orgId = orgs[0].id;
  const facts = [RULE_FACT, ...QUOTES.map(factOf)];
  let created = 0;
  for (const f of facts) {
    const r = await pool.query(
      `INSERT INTO ai_knowledge_facts (id, org_id, project_id, scope, subject, content, status, knowledge_type, origin, reference)
       VALUES ($1,$2,NULL,'org',$3,$4,'active',$5,'other',$6) ON CONFLICT (id) DO NOTHING`,
      [f.id, orgId, f.subject, f.content, f.id === RULE_FACT.id ? 'RULE' : 'FACT', f.reference]);
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
