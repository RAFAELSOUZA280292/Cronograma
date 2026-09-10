// Recuperação da memória do projeto (2026-09, Fase 1 do Assistente
// Inteligente de Projetos) — busca lexical (full-text search nativo do
// Postgres, sem embeddings/pgvector nesta fase, decisão explícita do
// Rafael pra não depender de infraestrutura nova ainda) com filtro por
// participante/reunião/data/tipo, ranqueada por relevância textual +
// leve bônus de recência. Ver PROJECT_CONTEXT.md pro raciocínio
// completo e o roteiro de evolução pra busca semântica.
export async function searchProjectMemory(pool, {
  orgId, projectId, query, participant, meetingId, dateFrom, dateTo, kind, limit = 12,
}) {
  const q = (query || '').trim();
  const limitClamped = Math.min(Math.max(limit, 1), 50);

  // Monta e roda a busca num "modo" de texto — 'and' (plainto_tsquery,
  // TODA palavra da query precisa aparecer no mesmo trecho — mais
  // preciso quando acerta) ou 'or' (websearch_to_tsquery com as palavras
  // separadas por "OR" — QUALQUER uma delas basta, ts_rank_cd ranqueia
  // quem bate mais palavras primeiro). conditions/params são remontados
  // do zero a cada chamada porque os placeholders $N mudam conforme a
  // expressão de texto muda.
  async function runSearch(mode) {
    const conditions = ['org_id = $1', 'project_id = $2'];
    const params = [orgId, projectId];
    function addParam(value) { params.push(value); return `$${params.length}`; }

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
    if (participant) {
      conditions.push(`participants @> ${addParam(JSON.stringify([participant]))}::jsonb`);
    }
    if (meetingId) {
      conditions.push(`meeting_id = ${addParam(meetingId)}`);
    }
    if (kind) {
      conditions.push(`kind = ${addParam(kind)}`);
    }
    if (dateFrom) {
      conditions.push(`meeting_date >= ${addParam(dateFrom)}`);
    }
    if (dateTo) {
      conditions.push(`meeting_date <= ${addParam(dateTo)}`);
    }

    const limitParam = addParam(limitClamped);

    // Recência: reuniões mais recentes ganham um bônus pequeno (até 0.2)
    // sobre o ranking textual, decaindo em ~180 dias — favorece o "o que
    // está acontecendo agora" sem afogar um resultado antigo claramente
    // mais relevante ao texto da pergunta.
    const sql = `
      SELECT id, meeting_id, kind, content, participants, meeting_date, meeting_title, time_ref, source_ref, created_at,
        (${rankSelect} + GREATEST(0, 0.2 - (0.2 * LEAST(1.0, EXTRACT(DAY FROM (now() - COALESCE(meeting_date::timestamptz, created_at))) / 180.0)))) AS score
      FROM project_memory_chunks
      WHERE ${conditions.join(' AND ')}
      ORDER BY score DESC, created_at DESC
      LIMIT ${limitParam}
    `;
    const { rows } = await pool.query(sql, params);
    return rows;
  }

  let rows = await runSearch('and');
  // A busca AND exige que TODA palavra da pergunta reformulada apareça
  // junto no mesmo trecho — perguntas genéricas ("como funciona X na
  // empresa Y") quase nunca batem palavra por palavra com a fala real
  // de uma reunião, e isso retornava zero resultados por construção, não
  // por falta de conteúdo (limitação documentada em PROJECT_CONTEXT.md,
  // agora corrigida aqui). Se a busca exata não achar nada e havia texto
  // de busca, tenta de novo em modo OR antes de desistir.
  if (q && rows.length === 0) {
    rows = await runSearch('or');
  }

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
    score: Number(r.score),
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
