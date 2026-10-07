// Recuperação da memória do projeto (2026-09, Fases 1 e 3 do Assistente
// Inteligente de Projetos) — busca HÍBRIDA: lexical (full-text search
// nativo do Postgres, com fallback OR quando a busca exata não acha
// nada — ver PROJECT_CONTEXT.md §30) + semântica (embeddings via Voyage
// AI, server/embeddings.js, opcional — só entra se VOYAGE_API_KEY
// estiver configurada). As duas rodam em paralelo e são combinadas por
// id de chunk. Filtro por participante/reunião/data/tipo é comum às
// duas. Ver PROJECT_CONTEXT.md §30/§31 pro raciocínio completo.
import { voyageConfigured, embedTexts, cosineSimilarity } from './embeddings.js';

// Reuniões mais recentes ganham um bônus pequeno (até 0.2) sobre o
// ranking de relevância, decaindo em ~180 dias — favorece o "o que está
// acontecendo agora" sem afogar um resultado antigo claramente mais
// relevante. Mesma fórmula pras pernas lexical e semântica, pra não
// desequilibrar a combinação das duas.
const RECENCY_BONUS_SQL = `GREATEST(0, 0.2 - (0.2 * LEAST(1.0, EXTRACT(DAY FROM (now() - COALESCE(meeting_date::timestamptz, created_at))) / 180.0)))`;

// Limite de segurança pra quantos chunks com embedding buscamos pra
// ranquear em JS por projeto/pergunta — na escala de dados de hoje
// (baixos milhares de chunks por projeto) isso nunca deveria ser
// atingido; existe só pra não deixar um projeto excepcionalmente grande
// transferir uma quantidade de dados sem limite numa única pergunta.
const SEMANTIC_CANDIDATES_LIMIT = 1000;

export async function searchProjectMemory(pool, {
  orgId, projectId, query, participant, meetingId, dateFrom, dateTo, kind, limit = 12,
}) {
  const q = (query || '').trim();
  const limitClamped = Math.min(Math.max(limit, 1), 50);

  // Filtros comuns às buscas lexical e semântica — reconstruídos do
  // zero a cada chamada porque os placeholders $N mudam conforme quem
  // chama adiciona a condição de texto (lexical) ou de embedding
  // (semântica) por cima.
  function buildBaseConditions() {
    const conditions = ['org_id = $1', 'project_id = $2'];
    const params = [orgId, projectId];
    function addParam(value) { params.push(value); return `$${params.length}`; }
    if (participant) conditions.push(`participants @> ${addParam(JSON.stringify([participant]))}::jsonb`);
    if (meetingId) conditions.push(`meeting_id = ${addParam(meetingId)}`);
    if (kind) conditions.push(`kind = ${addParam(kind)}`);
    if (dateFrom) conditions.push(`meeting_date >= ${addParam(dateFrom)}`);
    if (dateTo) conditions.push(`meeting_date <= ${addParam(dateTo)}`);
    return { conditions, params, addParam };
  }

  // Monta e roda a busca lexical num "modo" de texto — 'and'
  // (plainto_tsquery, TODA palavra da query precisa aparecer no mesmo
  // trecho — mais preciso quando acerta) ou 'or' (websearch_to_tsquery
  // com as palavras separadas por "OR" — QUALQUER uma delas basta,
  // ts_rank_cd ranqueia quem bate mais palavras primeiro).
  async function runLexicalSearch(mode) {
    const { conditions, params, addParam } = buildBaseConditions();
    let rankSelect = '0';
    if (q) {
      // `immutable_unaccent()` espelha o que já foi aplicado na coluna
      // gerada `content_tsv` (server/db.js) — sem isso, "débito" na
      // pergunta não bateria com "debito" sem acento numa transcrição
      // colada sem acentuação correta.
      const queryText = mode === 'or' ? q.split(/\s+/).filter(Boolean).join(' OR ') : q;
      const qParam = addParam(queryText);
      const tsqFn = mode === 'or' ? 'websearch_to_tsquery' : 'plainto_tsquery';
      const tsq = `${tsqFn}('portuguese', immutable_unaccent(${qParam}))`;
      conditions.push(`content_tsv @@ ${tsq}`);
      rankSelect = `ts_rank_cd(content_tsv, ${tsq})`;
    }
    const limitParam = addParam(limitClamped);
    const sql = `
      SELECT id, meeting_id, kind, content, participants, meeting_date, meeting_title, time_ref, source_ref, created_at,
        (${rankSelect} + ${RECENCY_BONUS_SQL}) AS score
      FROM project_memory_chunks
      WHERE ${conditions.join(' AND ')}
      ORDER BY score DESC, created_at DESC
      LIMIT ${limitParam}
    `;
    const { rows } = await pool.query(sql, params);
    return rows;
  }

  let lexicalRows = await runLexicalSearch('and');
  // A busca AND exige que TODA palavra da pergunta reformulada apareça
  // junto no mesmo trecho — perguntas genéricas ("como funciona X na
  // empresa Y") quase nunca batem palavra por palavra com a fala real
  // de uma reunião, e isso retornava zero resultados por construção, não
  // por falta de conteúdo (limitação documentada em PROJECT_CONTEXT.md).
  // Se a busca exata não achar nada e havia texto de busca, tenta de
  // novo em modo OR antes de desistir.
  if (q && lexicalRows.length === 0) {
    lexicalRows = await runLexicalSearch('or');
  }

  // Perna semântica (Fase 3) — compara SIGNIFICADO, não palavra: embeda
  // a pergunta e ranqueia por similaridade de cosseno contra os chunks
  // já embedados do projeto. Opcional (só roda com VOYAGE_API_KEY
  // configurada) e nunca derruba a busca inteira se falhar — nesse caso
  // segue só com o resultado lexical de sempre.
  let semanticRows = [];
  if (q && voyageConfigured()) {
    try {
      const [queryVector] = await embedTexts([q], 'query');
      const { conditions, params } = buildBaseConditions();
      conditions.push('embedding IS NOT NULL');
      const sql = `
        SELECT id, meeting_id, kind, content, participants, meeting_date, meeting_title, time_ref, source_ref, created_at, embedding,
          ${RECENCY_BONUS_SQL} AS recency_bonus
        FROM project_memory_chunks
        WHERE ${conditions.join(' AND ')}
        LIMIT ${SEMANTIC_CANDIDATES_LIMIT}
      `;
      const { rows: candidates } = await pool.query(sql, params);
      semanticRows = candidates
        .map((r) => ({ ...r, score: cosineSimilarity(queryVector, r.embedding) + Number(r.recency_bonus) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limitClamped);
    } catch (e) {
      console.error('Memória do projeto: busca semântica falhou, seguindo só com a busca lexical.', e.message);
    }
  }

  // Combina os dois conjuntos por id do chunk — quem aparece nos dois
  // (lexical E semântica concordam) tem as pontuações somadas, reforço
  // de confiança; quem aparece em só um mantém a pontuação isolada.
  const byId = new Map();
  [...lexicalRows, ...semanticRows].forEach((r) => {
    const prev = byId.get(r.id);
    if (prev) prev.score += Number(r.score);
    else byId.set(r.id, { ...r, score: Number(r.score) });
  });
  const merged = Array.from(byId.values()).sort((a, b) => b.score - a.score).slice(0, limitClamped);

  return merged.map((r) => ({
    id: r.id,
    meetingId: r.meeting_id,
    kind: r.kind,
    content: r.content,
    participants: r.participants || [],
    meetingDate: r.meeting_date,
    meetingTitle: r.meeting_title,
    timeRef: r.time_ref,
    sourceRef: r.source_ref || {},
    score: r.score,
  }));
}

// Busca por relevância (acima) é o padrão pra "o que foi discutido sobre
// X" — mas quando o assunto é EXPLICAR uma atividade específica cujo
// título sozinho não é autoexplicativo (pedido do Rafael: "não to
// entendendo pelo título, a Renata deve ir ler a transcrição"), o que
// importa é COMPLETUDE, não ranking textual — a atividade foi extraída
// de algum ponto da conversa, e o texto do título pode não ter as mesmas
// palavras que apareceram na fala. Por isso esta função busca TODOS os
// segmentos de transcrição de UMA reunião específica, sem filtro de
// relevância nenhum — o LLM é quem lê e acha a parte que explica.
export async function getMeetingTranscriptChunks(pool, orgId, projectId, meetingId, limit = 40) {
  const { rows } = await pool.query(
    `SELECT id, meeting_id, kind, content, participants, meeting_date, meeting_title, time_ref, source_ref
     FROM project_memory_chunks
     WHERE org_id=$1 AND project_id=$2 AND meeting_id=$3 AND kind='transcript_segment'
     ORDER BY chunk_order ASC LIMIT $4`,
    [orgId, projectId, meetingId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    meetingId: r.meeting_id,
    kind: r.kind,
    content: r.content,
    participants: r.participants || [],
    meetingDate: r.meeting_date,
    meetingTitle: r.meeting_title,
    timeRef: r.time_ref,
    sourceRef: r.source_ref || {},
    score: 0,
  }));
}

// ---------- Busca em VÁRIAS empresas (Etapa 3 do plano da RENATA, 2026-10-08) ----------
// A busca acima é sempre de UM projeto e continua intocada (já validada). Esta é para a RENATA geral responder "quais clientes
// falaram de X?": o filtro `project_id = ANY(acessíveis)` entra no SQL ANTES de qualquer ranking (nunca compara trecho de empresa
// sem acesso), ela limita quantos trechos cada empresa pode ocupar (senão a empresa com mais reuniões engole a resposta) e devolve
// uma COBERTURA exata — por empresa: quantos trechos batem, em quantas reuniões e a mais recente — calculada no banco, não pela IA.
const HIGH_SIGNAL_KINDS = ['meeting_summary', 'meeting_decision', 'meeting_highlight', 'meeting_topic', 'activity'];
// Embeddings ficam em JSONB (~15 KB cada): na perna semântica entre empresas só entram os trechos de maior sinal e mais recentes.
const ACROSS_SEMANTIC_LIMIT = 600;

export async function searchMemoryAcross(pool, {
  orgId, projectIds, query, kind, dateFrom, dateTo, perProject = 3, limit = 24,
}) {
  const empty = { chunks: [], coverage: [], mode: 'none' };
  if (!orgId || !Array.isArray(projectIds) || !projectIds.length) return empty;
  const q = String(query || '').trim();
  const cap = Math.min(Math.max(limit, 1), 60);

  function base() {
    const params = [orgId, projectIds];
    const add = (v) => { params.push(v); return `$${params.length}`; };
    const cond = ['org_id = $1', 'project_id = ANY($2::text[])'];
    if (kind) cond.push(`kind = ${add(kind)}`);
    if (dateFrom) cond.push(`meeting_date >= ${add(dateFrom)}`);
    if (dateTo) cond.push(`meeting_date <= ${add(dateTo)}`);
    return { cond, params, add };
  }
  const tsqOf = (mode, ref) => (mode === 'or' ? `websearch_to_tsquery('portuguese', immutable_unaccent(${ref}))` : `plainto_tsquery('portuguese', immutable_unaccent(${ref}))`);
  const orText = (text) => text.split(/\s+/).filter(Boolean).join(' OR ');

  async function lexical(mode) {
    const { cond, params, add } = base();
    const ref = add(mode === 'or' ? orText(q) : q);
    const tsq = tsqOf(mode, ref);
    cond.push(`content_tsv @@ ${tsq}`);
    const where = cond.join(' AND ');
    const limitRef = add(400);
    const { rows } = await pool.query(
      `SELECT id, project_id, meeting_id, kind, content, participants, meeting_date, meeting_title, time_ref, source_ref, created_at,
         (ts_rank_cd(content_tsv, ${tsq}) + ${RECENCY_BONUS_SQL}) AS score
       FROM project_memory_chunks WHERE ${where} ORDER BY score DESC, created_at DESC LIMIT ${limitRef}`, params);
    const cov = await pool.query(
      `SELECT project_id, count(*)::int AS mentions, count(DISTINCT meeting_id)::int AS meetings, max(meeting_date) AS last_date,
         (array_agg(meeting_title ORDER BY meeting_date DESC NULLS LAST))[1] AS last_title
       FROM project_memory_chunks WHERE ${where} GROUP BY project_id`, params.slice(0, params.length - 1));
    return { rows, cov: cov.rows };
  }

  let rows = []; let cov = []; let mode = 'recent';
  if (q) {
    ({ rows, cov } = await lexical('and'));
    mode = 'and';
    if (!rows.length) { ({ rows, cov } = await lexical('or')); mode = 'or'; }
  } else {
    // Sem assunto ("o que foi tratado nas últimas reuniões?"): resumos mais recentes de cada empresa.
    const { cond, params, add } = base();
    if (!kind) cond.push(`kind = ${add('meeting_summary')}`);
    const limitRef = add(400);
    ({ rows } = await pool.query(
      `SELECT id, project_id, meeting_id, kind, content, participants, meeting_date, meeting_title, time_ref, source_ref, created_at, 0 AS score
       FROM project_memory_chunks WHERE ${cond.join(' AND ')} ORDER BY meeting_date DESC NULLS LAST, created_at DESC LIMIT ${limitRef}`, params));
  }

  // Perna semântica (opcional, só com VOYAGE_API_KEY): acha paráfrase que a busca por palavra perde.
  let semantic = [];
  if (q && voyageConfigured()) {
    try {
      const [vec] = await embedTexts([q], 'query');
      const { cond, params, add } = base();
      cond.push('embedding IS NOT NULL');
      if (!kind) cond.push(`kind = ANY(${add(HIGH_SIGNAL_KINDS)}::text[])`);
      const lim = add(ACROSS_SEMANTIC_LIMIT);
      const { rows: cands } = await pool.query(
        `SELECT id, project_id, meeting_id, kind, content, participants, meeting_date, meeting_title, time_ref, source_ref, created_at, embedding, ${RECENCY_BONUS_SQL} AS bonus
         FROM project_memory_chunks WHERE ${cond.join(' AND ')} ORDER BY meeting_date DESC NULLS LAST LIMIT ${lim}`, params);
      semantic = cands.map((r) => ({ ...r, score: cosineSimilarity(vec, r.embedding) + Number(r.bonus) })).sort((a, b) => b.score - a.score).slice(0, 80);
    } catch (e) {
      console.error('Memória entre empresas: busca semântica falhou, seguindo só com a lexical.', e.message);
    }
  }

  const byId = new Map();
  [...rows, ...semantic].forEach((r) => {
    const prev = byId.get(r.id);
    if (prev) prev.score += Number(r.score); else byId.set(r.id, { ...r, score: Number(r.score) });
  });
  const ranked = [...byId.values()].sort((a, b) => b.score - a.score);
  // Limite por empresa, depois completa em rodízio até o teto — nenhuma empresa ocupa tudo.
  const taken = new Map(); const picked = [];
  for (const r of ranked) {
    if ((taken.get(r.project_id) || 0) >= perProject) continue;
    taken.set(r.project_id, (taken.get(r.project_id) || 0) + 1);
    picked.push(r);
    if (picked.length >= cap) break;
  }
  const chunks = picked.map((r) => ({
    id: r.id, projectId: r.project_id, meetingId: r.meeting_id, kind: r.kind, content: r.content, participants: r.participants || [],
    meetingDate: r.meeting_date, meetingTitle: r.meeting_title, timeRef: r.time_ref, score: r.score,
  }));
  // Cobertura: do SQL (lexical). Sem texto de busca ou só semântica, deriva do que foi recuperado.
  let coverage = cov.map((c) => ({ projectId: c.project_id, mentions: c.mentions, meetings: c.meetings, lastDate: c.last_date, lastTitle: c.last_title }));
  if (!coverage.length && chunks.length) {
    const g = new Map();
    for (const c of chunks) { const e = g.get(c.projectId) || { projectId: c.projectId, mentions: 0, meetings: new Set(), lastDate: null, lastTitle: '' }; e.mentions += 1; e.meetings.add(c.meetingId); if (!e.lastDate || String(c.meetingDate) > String(e.lastDate)) { e.lastDate = c.meetingDate; e.lastTitle = c.meetingTitle; } g.set(c.projectId, e); }
    coverage = [...g.values()].map((e) => ({ ...e, meetings: e.meetings.size }));
  }
  coverage.sort((a, b) => b.mentions - a.mentions);
  return { chunks, coverage, mode: semantic.length ? `${mode}+semantic` : mode };
}
