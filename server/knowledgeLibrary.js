// Biblioteca de conhecimento da RENATA (2026-10-27, pedido do Rafael: "um local para dar input de conhecimento — material sobre Produtor Rural antes e
// depois da reforma — e deixar a RENATA expert nisso") — ver PROJECT_CONTEXT.md §116.
// Fluxo de um material (PDF, Word, PowerPoint, Excel, texto…):
//   1) LER: o arquivo vira texto (server/materialText.js) e é fatiado em trechos de ~1.400 caracteres (com título e página/slide);
//   2) INDEXAR: cada trecho ganha busca por palavra (tsvector) e por significado (embedding Voyage, opcional) — daí a RENATA acha o trecho certo
//      mesmo num documento de 200 páginas, sem mandar o documento inteiro para a IA a cada pergunta;
//   3) ESTUDAR: a IA lê o material e devolve um estudo (resumo, pontos-chave, comparativo antes × depois, perguntas e respostas, base legal, limites);
//   4) LEMBRAR: o estudo vira UM fato de conhecimento da organização (origem 'internal_document', referência 'Material PRICETAX:<id>') — aparece nas
//      Memórias, entra na invalidação do cache de respostas e é o "id" que a RENATA cita quando usa o material.
// No chat (RENATA do projeto e geral), `materialPromptLines` devolve, para a pergunta feita, o resumo do material mais próximo e até 6 trechos —
// só para a equipe PRICETAX (isStaff) e só quando a pergunta realmente toca algum material (senão custo zero).
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { pool } from './db.js';
import { embedTexts, voyageConfigured, cosineSimilarity } from './embeddings.js';
import { chunkText } from './materialText.js';

export const uid = (p) => `${p}-${crypto.randomBytes(5).toString('hex')}`;
export const clip = (s, n) => { const t = String(s || '').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const MATERIAL_REF_PREFIX = 'Material PRICETAX:';
export const STUDY_MODEL = 'claude-sonnet-5';
export const STALE_MS = 30 * 60 * 1000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PASSAGES = 6;
const PASSAGE_CHARS_BUDGET = 8000;

export async function ensureKnowledgeLibrarySchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS knowledge_materials (
      id              TEXT PRIMARY KEY,
      org_id          TEXT NOT NULL,
      title           TEXT NOT NULL,
      topic           TEXT NOT NULL DEFAULT '',
      tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
      note            TEXT NOT NULL DEFAULT '',
      source_kind     TEXT NOT NULL DEFAULT 'file',
      file_name       TEXT NOT NULL DEFAULT '',
      mime_type       TEXT NOT NULL DEFAULT '',
      file_size       INTEGER NOT NULL DEFAULT 0,
      file_data       BYTEA,
      full_text       TEXT NOT NULL DEFAULT '',
      text_hash       TEXT NOT NULL DEFAULT '',
      char_count      INTEGER NOT NULL DEFAULT 0,
      chunk_count     INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'processing',
      stage           TEXT NOT NULL DEFAULT '',
      progress        JSONB NOT NULL DEFAULT '{}'::jsonb,
      error           TEXT NOT NULL DEFAULT '',
      study           JSONB,
      study_error     TEXT NOT NULL DEFAULT '',
      fact_id         TEXT,
      created_by      TEXT,
      created_by_name TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      archived_at     TIMESTAMPTZ
    )`);
  await db.query('CREATE INDEX IF NOT EXISTS knowledge_materials_org_idx ON knowledge_materials (org_id, created_at DESC)');
  await db.query(`
    CREATE TABLE IF NOT EXISTS knowledge_material_chunks (
      id          TEXT PRIMARY KEY,
      material_id TEXT NOT NULL REFERENCES knowledge_materials(id) ON DELETE CASCADE,
      org_id      TEXT NOT NULL,
      idx         INTEGER NOT NULL,
      heading     TEXT NOT NULL DEFAULT '',
      ref         TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL,
      embedding   JSONB
    )`);
  await db.query(`ALTER TABLE knowledge_material_chunks ADD COLUMN IF NOT EXISTS content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', immutable_unaccent(content))) STORED`);
  await db.query('CREATE INDEX IF NOT EXISTS knowledge_material_chunks_tsv_idx ON knowledge_material_chunks USING GIN (content_tsv)');
  await db.query('CREATE INDEX IF NOT EXISTS knowledge_material_chunks_mat_idx ON knowledge_material_chunks (material_id, idx)');
}

// ---------- estudo ----------
export const MaterialStudySchema = z.object({
  subject: z.string().describe('Assunto central do material em até 12 palavras.'),
  executiveSummary: z.string().describe('Resumo em 4 a 7 frases: o que o material trata, a conclusão principal e por que importa para a PRICETAX e seus clientes. Só o que o material afirma.'),
  keyPoints: z.array(z.string()).describe('De 5 a 14 pontos-chave, cada um uma frase clara e autossuficiente, com números, prazos, percentuais e condições exatamente como no material.'),
  comparisons: z.array(z.object({
    topic: z.string().describe('O ponto comparado (ex.: "Tributação da venda do produtor rural pessoa física").'),
    before: z.string().describe('Como é ANTES da reforma tributária (regime atual), conforme o material; "" se o material não disser.'),
    after: z.string().describe('Como fica DEPOIS da reforma (CBS/IBS), conforme o material; "" se o material não disser.'),
    basis: z.string().describe('Norma/artigo que o material cita para esse ponto; "" se não citar.'),
  })).describe('Comparativo antes × depois da reforma, de 0 a 15 itens. Lista vazia se o material não faz esse tipo de comparação — não invente.'),
  faq: z.array(z.object({
    question: z.string().describe('Pergunta que um consultor ou cliente faria sobre o tema.'),
    answer: z.string().describe('Resposta objetiva, SOMENTE com o que o material sustenta.'),
  })).describe('De 5 a 12 perguntas e respostas práticas.'),
  themes: z.array(z.string()).describe('De 6 a 14 temas e palavras-chave (tributos, institutos, normas, setores) pelos quais o material deve ser encontrado.'),
  appliesTo: z.string().describe('Perfil de cliente e situações em que o material deve ser usado, em 1 a 3 frases.'),
  usageTriggers: z.array(z.string()).describe('De 3 a 8 sinais numa conversa que indicam que este material é relevante.'),
  legalBasis: z.array(z.string()).describe('Normas e artigos que o material cita (ex.: "LC 214/2025, art. 164"); lista vazia se não citar.'),
  limits: z.string().describe('O que o material NÃO cobre, premissas, data de referência e o que pode estar desatualizado; "" se o documento não disser.'),
});

const STUDY_SYSTEM = [
  'Você é a RENATA, assistente da consultoria PRICETAX, estudando um material de referência (apresentação, nota técnica, estudo, planilha, artigo) para se tornar especialista no tema.',
  'Regras: (1) use SOMENTE o que está no material — não complete com conhecimento próprio, não invente artigos, alíquotas, números ou prazos; (2) o que o material não diz fica vazio; (3) preserve números, percentuais, prazos e condições exatamente como aparecem; (4) se o material tratar do antes e do depois da reforma tributária, monte o comparativo ponto a ponto; (5) se houver sinal de desatualização (datas antigas, norma citada como projeto), registre em "limits".',
  '(6) seja conciso: cada item em até 2 frases; se o material for uma norma extensa, estude os temas e as regras mais relevantes em vez de percorrer artigo por artigo.',
  'Escreva em português do Brasil, objetivo, para consultores tributários.',
].join('\n');

const COMPACT_HINT = 'ATENÇÃO: o estudo anterior ficou grande demais e foi cortado. Seja enxuto: no máximo 8 pontos-chave, 8 itens de comparativo, 6 perguntas, 8 temas e 6 sinais de uso; cada item em 1 a 2 frases curtas; não liste artigo por artigo — priorize o que mais importa para a consultoria.';
const NOTES_SYSTEM = 'Você é a RENATA. Leia a parte do material abaixo e escreva ANOTAÇÕES densas em português (até 5.000 caracteres): fatos, números, prazos, regras, comparativos antes × depois, normas citadas e perguntas que o trecho responde. Somente o que o texto diz; nada de suposições.';
const PART_CHARS = 100_000;

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (!/overloaded|rate_limit|^429\b|^(529|503|502)\b|timed? ?out|ECONNRESET|ETIMEDOUT|fetch failed|Connection error/i.test(String((e && e.message) || e))) throw e;
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export function friendlyError(raw) {
  const msg = String(raw || '');
  if (/credit balance is too low/i.test(msg)) return 'Sem créditos na conta da Anthropic — recarregue em Plans & Billing e tente de novo.';
  if (/invalid x-api-key|authentication_error|^401\b/i.test(msg)) return 'A chave da API da Anthropic é inválida ou foi revogada — confira no Railway.';
  if (/ANTHROPIC_API_KEY|api key/i.test(msg)) return 'A IA não está configurada neste ambiente (falta a ANTHROPIC_API_KEY).';
  if (/rate_limit|^429\b/i.test(msg)) return 'Limite de uso da API da Anthropic atingido agora — aguarde um minuto e tente de novo.';
  if (/overloaded|^(529|503)\b/i.test(msg)) return 'A IA está sobrecarregada no momento — tente de novo em alguns minutos.';
  if (/max_tokens|Unterminated|cortada/i.test(msg)) return 'A IA não conseguiu terminar o estudo (resposta cortada). Tente de novo.';
  return clip(msg, 300) || 'Falha desconhecida.';
}

let cachedClient = null;
const getClient = () => { if (!process.env.ANTHROPIC_API_KEY) throw new Error('A IA não está configurada neste ambiente (falta a ANTHROPIC_API_KEY).'); if (!cachedClient) cachedClient = new Anthropic(); return cachedClient; };
export const deps = { client: getClient, embed: (texts, type) => embedTexts(texts, type), embedOn: () => voyageConfigured() };

export async function studyMaterial({ title, topic, note, text }) {
  const client = deps.client();
  let body = text;
  if (text.length > PART_CHARS * 1.1) {
    const parts = [];
    for (let i = 0; i < text.length; i += PART_CHARS) parts.push(text.slice(i, i + PART_CHARS));
    const notes = [];
    for (let i = 0; i < parts.length; i += 1) {
      const r = await withRetry(() => client.messages.create({ model: STUDY_MODEL, max_tokens: 3500, system: [{ type: 'text', text: NOTES_SYSTEM }], messages: [{ role: 'user', content: `Material "${title}" — parte ${i + 1} de ${parts.length}:\n\n${parts[i]}` }] }));
      notes.push(`### Parte ${i + 1}\n${(r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')}`);
    }
    body = `(O material é longo; abaixo estão as anotações de cada parte, feitas a partir do texto completo.)\n\n${notes.join('\n\n')}`;
  }
  const ask = (compact) => withRetry(() => client.messages.parse({
    model: STUDY_MODEL,
    max_tokens: 16000,
    system: [{ type: 'text', text: STUDY_SYSTEM, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: `Estude este material. Título no sistema: "${title}".${topic ? ` Tema indicado por quem enviou: ${topic}.` : ''}${note ? ` Orientação de uso dada por quem enviou: ${note}` : ''}${compact ? `\n\n${COMPACT_HINT}` : ''}\n\n=== MATERIAL ===\n${body}` }],
    output_config: { format: zodOutputFormat(MaterialStudySchema) },
  }));
  // Texto normativo longo (ex.: uma lei inteira) gera um estudo maior que o limite de saída: a resposta vem cortada no meio do JSON.
  // Primeira tentativa com folga; se ainda cortar, repete pedindo o estudo enxuto.
  const truncated = (e) => /Unterminated|Failed to parse structured output|max_tokens|cortada/i.test(String((e && e.message) || e));
  let response;
  try { response = await ask(false); if (response.stop_reason === 'max_tokens') throw new Error('Resposta cortada por tamanho (max_tokens).'); } catch (e) {
    if (!truncated(e)) throw e;
    response = await ask(true);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('Resposta cortada por tamanho (max_tokens).');
  if (!response.parsed_output) throw new Error('A IA não conseguiu estruturar o estudo.');
  return response.parsed_output;
}

// ---------- sugestão de título, tema e etiquetas (ao escolher o arquivo, antes de enviar) ----------
export const MetadataSchema = z.object({
  title: z.string().describe('Título claro e específico do material, até 100 caracteres, como um consultor o nomearia na biblioteca (ex.: "Produtor Rural — antes e depois da reforma"). Use o título do próprio documento quando ele existir.'),
  topic: z.string().describe('Tema principal em 1 a 4 palavras (ex.: "Produtor Rural", "Split Payment"). Prefira um tema já existente da lista quando for o mesmo assunto.'),
  tags: z.array(z.string()).describe('De 3 a 8 etiquetas curtas (1 a 3 palavras): tributos, normas, setores, institutos. Reaproveite etiquetas já existentes quando couberem.'),
});

const METADATA_SYSTEM = 'Você organiza a biblioteca de materiais de uma consultoria tributária (PRICETAX). Leia o trecho do material e proponha título, tema e etiquetas para ele ser encontrado depois. Use somente o que o texto mostra; não invente norma, número ou assunto. Português do Brasil, sem aspas nem ponto final no título.';
const METADATA_MODEL = 'claude-haiku-4-5-20251001';

// Começo do documento (onde ficam título e sumário) + amostras do meio e do fim, para não mandar 1,5 milhão de caracteres só para dar nome ao arquivo.
export function sampleForMetadata(text, { head = 9000, slice = 1800, slices = 3 } = {}) {
  const t = String(text || '');
  if (t.length <= head + slice * slices) return t;
  const rest = t.length - head; const parts = [t.slice(0, head)];
  for (let i = 1; i <= slices; i += 1) { const at = head + Math.floor((rest * i) / (slices + 1)) - Math.floor(slice / 2); parts.push(`[…]\n${t.slice(at, at + slice)}`); }
  return parts.join('\n\n');
}

export async function suggestMetadata({ text, fileName = '', known = {} }) {
  const client = deps.client();
  const lists = [
    (known.topics || []).length ? `Temas já usados na biblioteca: ${known.topics.join('; ')}.` : '',
    (known.tags || []).length ? `Etiquetas já usadas na biblioteca: ${known.tags.join('; ')}.` : '',
  ].filter(Boolean).join('\n');
  const response = await withRetry(() => client.messages.parse({
    model: METADATA_MODEL,
    max_tokens: 600,
    system: [{ type: 'text', text: METADATA_SYSTEM }],
    messages: [{ role: 'user', content: `${fileName ? `Nome do arquivo: ${fileName}\n` : ''}${lists ? `${lists}\n` : ''}\n=== MATERIAL (início e amostras) ===\n${sampleForMetadata(text)}` }],
    output_config: { format: zodOutputFormat(MetadataSchema) },
  }));
  if (response.stop_reason === 'max_tokens') throw new Error('Resposta cortada por tamanho (max_tokens).');
  const o = response.parsed_output;
  if (!o) throw new Error('A IA não conseguiu sugerir título, tema e etiquetas.');
  const seen = new Set();
  const tags = (o.tags || []).map((x) => String(x).trim().replace(/^#/, '').slice(0, 40)).filter((x) => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  return { title: clip(o.title, 120).replace(/[.\s]+$/, ''), topic: clip(o.topic, 60), tags };
}

export function factContentOf(m, study) {
  const head = `Material de referência PRICETAX "${clip(m.title, 120)}"${m.topic ? ` (tema: ${clip(m.topic, 80)})` : ''}.`;
  if (!study) return `${head} ${clip(m.note || m.full_text, 500)}`.trim();
  const cmp = (study.comparisons || []).slice(0, 3).map((c) => `${clip(c.topic, 80)}: antes ${clip(c.before, 120)} → depois ${clip(c.after, 120)}`).join(' | ');
  return [
    `${head} ${clip(study.executiveSummary, 700)}`,
    (study.keyPoints || []).length ? `Pontos-chave: ${study.keyPoints.slice(0, 4).map((k) => clip(k, 180)).join(' | ')}` : '',
    cmp ? `Antes × depois da reforma: ${cmp}` : '',
    study.appliesTo ? `Usar quando: ${clip(study.appliesTo, 220)}` : '',
    (study.themes || []).length ? `Temas: ${study.themes.slice(0, 12).join(', ')}.` : '',
  ].filter(Boolean).join(' ');
}

// ---------- processamento ----------
export const running = new Set();
const setState = (id, patch) => pool.query(
  `UPDATE knowledge_materials SET ${Object.keys(patch).map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now() WHERE id=$1`,
  [id, ...Object.values(patch).map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : v))],
);

async function upsertFact(m, content, embedding) {
  const subject = `Material PRICETAX: ${clip(m.title, 140)}`;
  if (m.fact_id) {
    await pool.query(`UPDATE ai_knowledge_facts SET subject=$2, content=$3, embedding=$4, status='active', updated_at=now() WHERE id=$1`, [m.fact_id, subject, content, embedding ? JSON.stringify(embedding) : null]);
    return m.fact_id;
  }
  const id = uid('akf');
  await pool.query(
    `INSERT INTO ai_knowledge_facts (id, org_id, project_id, scope, subject, content, status, knowledge_type, source_user_id, embedding, origin, reference, source_date)
     VALUES ($1,$2,NULL,'org',$3,$4,'active','FACT',$5,$6,'internal_document',$7,CURRENT_DATE)`,
    [id, m.org_id, subject, content, m.created_by || null, embedding ? JSON.stringify(embedding) : null, `${MATERIAL_REF_PREFIX}${m.id}`],
  );
  await setState(m.id, { fact_id: id });
  return id;
}

export async function indexMaterial(id) {
  const { rows: [m] } = await pool.query('SELECT * FROM knowledge_materials WHERE id=$1', [id]);
  if (!m) return;
  const chunks = chunkText(m.full_text);
  if (!chunks.length) throw new Error('O material não tem texto aproveitável.');
  let vectors = [];
  if (deps.embedOn()) {
    try {
      for (let i = 0; i < chunks.length; i += 100) {
        await setState(id, { stage: 'indexar', progress: { done: i, total: chunks.length } });
        vectors.push(...await deps.embed(chunks.slice(i, i + 100).map((c) => `${c.heading ? `${c.heading}\n` : ''}${c.content}`), 'document'));
      }
    } catch (e) { console.error('Biblioteca: embeddings falharam — seguindo só com a busca por palavra.', e.message); vectors = []; }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM knowledge_material_chunks WHERE material_id=$1', [id]);
    for (let i = 0; i < chunks.length; i += 200) {
      const slice = chunks.slice(i, i + 200);
      const params = []; const values = slice.map((c, k) => {
        const o = params.length; params.push(uid('kmc'), id, m.org_id, c.idx, c.heading, c.ref, c.content, vectors[i + k] ? JSON.stringify(vectors[i + k]) : null);
        return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8}::jsonb)`;
      });
      await client.query(`INSERT INTO knowledge_material_chunks (id, material_id, org_id, idx, heading, ref, content, embedding) VALUES ${values.join(',')}`, params);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  await setState(id, { chunk_count: chunks.length, stage: 'estudar', progress: { done: chunks.length, total: chunks.length } });
  // fato provisório: o material já é citável (e invalida o cache de respostas) antes do estudo terminar
  let emb = null; const provisional = factContentOf(m, null);
  if (deps.embedOn()) { try { [emb] = await deps.embed([provisional], 'document'); } catch (e) { /* sem embedding do fato */ } }
  await upsertFact(m, provisional, emb);
}

export async function processMaterial(id, { skipIndex = false } = {}) {
  if (running.has(id)) return;
  running.add(id);
  try {
    await setState(id, { status: 'processing', stage: skipIndex ? 'estudar' : 'indexar', error: '', study_error: '' });
    if (!skipIndex) await indexMaterial(id);
    let { rows: [m] } = await pool.query('SELECT * FROM knowledge_materials WHERE id=$1', [id]);
    try {
      await setState(id, { stage: 'estudar' });
      const study = await studyMaterial({ title: m.title, topic: m.topic, note: m.note, text: m.full_text });
      const content = factContentOf(m, study);
      let emb = null;
      if (deps.embedOn()) { try { [emb] = await deps.embed([content], 'document'); } catch (e) { /* sem embedding do fato */ } }
      await upsertFact(m, content, emb);
      await setState(id, { study, study_error: '' });
    } catch (e) {
      console.error('Biblioteca: estudo do material falhou:', e.message);
      await setState(id, { study_error: friendlyError(e.message) });
    }
    await setState(id, { status: 'ready', stage: '', progress: {} });
  } catch (e) {
    console.error('Biblioteca: leitura do material falhou:', e.message);
    await setState(id, { status: 'failed', stage: '', error: friendlyError(e.message) }).catch(() => {});
  } finally { running.delete(id); }
}

// ---------- busca ----------
const lexical = async (orgId, q, mode, limit, materialIds) => {
  const text = mode === 'or' ? q.split(/\s+/).filter(Boolean).join(' OR ') : q;
  const fn = mode === 'or' ? 'websearch_to_tsquery' : 'plainto_tsquery';
  const params = [orgId, text, limit]; let extra = '';
  if (materialIds) { params.push(materialIds); extra = 'AND c.material_id = ANY($4::text[])'; }
  const tsq = `${fn}('portuguese', immutable_unaccent($2))`;
  const { rows } = await pool.query(
    `SELECT c.id, c.material_id, c.idx, c.heading, c.ref, c.content, ts_rank_cd(c.content_tsv, ${tsq}) AS rank
     FROM knowledge_material_chunks c JOIN knowledge_materials m ON m.id = c.material_id
     WHERE c.org_id=$1 AND m.archived_at IS NULL AND m.status='ready' AND c.content_tsv @@ ${tsq} ${extra}
     ORDER BY rank DESC LIMIT $3`, params);
  return rows;
};

const STOP = new Set(['para', 'como', 'qual', 'quais', 'sobre', 'esse', 'essa', 'isso', 'esta', 'este', 'pelo', 'pela', 'pelos', 'pelas', 'mais', 'menos', 'muito', 'pode', 'podem', 'deve', 'devem', 'fazer', 'quero', 'preciso', 'precisa', 'existe', 'tenho', 'quando', 'onde', 'porque', 'entao', 'ainda', 'sera', 'seria', 'foram', 'uma', 'umas', 'uns', 'dos', 'das', 'nos', 'nas', 'que', 'com', 'por', 'sem', 'seu', 'sua', 'ele', 'ela', 'sao', 'ser', 'tem', 'ter', 'foi', 'nao', 'sim', 'falamos', 'falar', 'explique', 'resuma', 'diga']);
const normWord = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const wordsOf = (text) => normWord(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)).map((w) => (w.length > 6 ? w.slice(0, 6) : w));

// Duas etapas: (1) escolhe os materiais que a pergunta toca — por palavra nos trechos e por significado no resumo; (2) dentro deles, ranqueia os trechos.
// Sem a primeira etapa teríamos de carregar os vetores de TODOS os trechos da biblioteca a cada pergunta.
export async function searchMaterial({ orgId, query, limit = MAX_PASSAGES }) {
  const q = String(query || '').trim();
  if (!q) return { materials: [], passages: [] };
  let lex = await lexical(orgId, q, 'and', 30, null);
  if (!lex.length) lex = await lexical(orgId, q, 'or', 30, null);
  let qVec = null; const byMaterial = new Map();
  lex.forEach((r) => byMaterial.set(r.material_id, (byMaterial.get(r.material_id) || 0) + Number(r.rank)));
  if (deps.embedOn()) {
    try {
      [qVec] = await deps.embed([q], 'query');
      const { rows: facts } = await pool.query(
        `SELECT m.id, f.embedding FROM knowledge_materials m JOIN ai_knowledge_facts f ON f.id = m.fact_id
         WHERE m.org_id=$1 AND m.archived_at IS NULL AND m.status='ready' AND f.embedding IS NOT NULL`, [orgId]);
      facts.map((f) => ({ id: f.id, sim: cosineSimilarity(qVec, f.embedding) })).filter((f) => f.sim >= 0.4).sort((a, b) => b.sim - a.sim).slice(0, 4)
        .forEach((f) => byMaterial.set(f.id, (byMaterial.get(f.id) || 0) + f.sim));
    } catch (e) { console.error('Biblioteca: busca semântica falhou — seguindo só por palavra.', e.message); qVec = null; }
  }
  const ids = [...byMaterial.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0]);
  if (!ids.length) return { materials: [], passages: [] };
  const { rows: mats } = await pool.query(
    `SELECT m.id, m.title, m.topic, m.fact_id, m.study, f.content AS fact_content FROM knowledge_materials m LEFT JOIN ai_knowledge_facts f ON f.id = m.fact_id WHERE m.id = ANY($1::text[])`, [ids]);
  const lexScore = new Map(lex.map((r) => [r.id, Number(r.rank)]));
  const maxLex = Math.max(0.0001, ...lexScore.values());
  const { rows: chunks } = await pool.query('SELECT id, material_id, idx, heading, ref, content, embedding FROM knowledge_material_chunks WHERE material_id = ANY($1::text[]) LIMIT 4000', [ids]);
  // Cobertura ponderada: que fração dos termos da pergunta (ponderados pela raridade nos trechos candidatos) o trecho contém. O rank do Postgres sozinho
  // premia a repetição de uma palavra comum ("IBS" 30 vezes), o que traria material errado para uma pergunta sobre outro assunto.
  const terms = [...new Set(wordsOf(q))];
  const stemsOf = new Map(chunks.map((c) => [c.id, new Set(wordsOf(`${c.heading} ${c.content}`))]));
  const df = new Map(); terms.forEach((t) => df.set(t, [...stemsOf.values()].filter((st) => st.has(t)).length));
  const idf = (t) => Math.log(1 + chunks.length / (1 + df.get(t)));
  const idfSum = terms.reduce((n, t) => n + idf(t), 0) || 1;
  const coverage = (c) => terms.reduce((n, t) => n + (stemsOf.get(c.id).has(t) ? idf(t) : 0), 0) / idfSum;
  const matched = (c) => terms.filter((t) => stemsOf.get(c.id).has(t)).length;
  const need = Math.min(2, terms.length); // uma palavra solta ("receita" em "receita de bolo") não basta para dizer que o trecho trata do assunto
  const scored = chunks.map((c) => {
    const cov = coverage(c);
    const l = matched(c) >= need ? 0.7 * cov + 0.3 * (lexScore.has(c.id) ? lexScore.get(c.id) / maxLex : 0) : 0;
    const s = qVec && c.embedding ? cosineSimilarity(qVec, c.embedding) : 0;
    return { ...c, lex: l, sem: s, score: l + s };
  }).filter((c) => c.lex >= 0.2 || c.sem >= 0.48).sort((a, b) => b.score - a.score);
  // trechos muito abaixo do melhor são ruído (uma palavra comum como "IBS" casa com qualquer material do tema)
  const floor = scored.length ? scored[0].score * 0.6 : 0;
  scored.splice(0, scored.length, ...scored.filter((c) => c.score >= floor).slice(0, limit));
  const matById = new Map(mats.map((m) => [m.id, m]));
  const topIds = [...new Set(scored.map((c) => c.material_id))];
  const materials = topIds.slice(0, 2).map((id) => matById.get(id)).filter(Boolean);
  return {
    materials: materials.map((m) => ({ id: m.id, title: m.title, topic: m.topic, factId: m.fact_id, summary: m.fact_content || '' })),
    passages: scored.map((c) => ({ chunkId: c.id, materialId: c.material_id, title: (matById.get(c.material_id) || {}).title || '', factId: (matById.get(c.material_id) || {}).fact_id || null, idx: c.idx, heading: c.heading, ref: c.ref, content: c.content, score: c.score, lexical: c.lex, semantic: c.sem })),
  };
}

// Linhas para o bloco "CONHECIMENTO ACUMULADO" do prompt (server/knowledgeFacts.js `loadRelevantFacts`).
export async function materialPromptLines(orgId, query) {
  try {
    const { materials, passages } = await searchMaterial({ orgId, query });
    if (!passages.length) return { lines: [], factIds: [] };
    const out = []; const factIds = new Set();
    materials.forEach((m) => { if (m.factId && m.summary) { factIds.add(m.factId); out.push(`- [id=${m.factId}] [MATERIAL] [Material PRICETAX: ${m.title}] ${clip(m.summary, 1300)} (material de referência estudado pela RENATA — resumo)`); } });
    let used = 0;
    passages.forEach((p) => {
      if (!p.factId || used + p.content.length > PASSAGE_CHARS_BUDGET) return;
      used += p.content.length; factIds.add(p.factId);
      const where = [p.ref, p.heading].filter(Boolean).join(' · ');
      out.push(`- [id=${p.factId}] [MATERIAL] [Material PRICETAX: ${p.title}${where ? ` — ${where}` : ''}] TRECHO: ${p.content.replace(/\n{2,}/g, '\n')}`);
    });
    return { lines: out, factIds: [...factIds] };
  } catch (e) {
    console.error('Biblioteca: consulta ao material falhou — seguindo sem ele.', e.message);
    return { lines: [], factIds: [] };
  }
}

// Linhas das listas e rótulos usados pelas rotas.
