// Ingestão/chunking da memória do projeto (2026-09, Fase 1 do
// Assistente Inteligente de Projetos) — transforma o conteúdo já
// existente de uma reunião (transcrição bruta, resumo, decisões,
// tópicos, highlights, itens de ação e comentários) em linhas
// pesquisáveis de `project_memory_chunks`, SEM duplicar a fonte de
// verdade (que continua em `projects.data.meetings[]`). Reindexar é
// sempre seguro de rodar de novo: cada chamada apaga e recria do zero
// os chunks daquela reunião (ver PROJECT_CONTEXT.md).
import { parseTranscript, splitDecisionLines } from '../shared/transcriptParser.js';
import { voyageConfigured, embedTexts } from './embeddings.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

const MAX_TRANSCRIPT_CHUNK_CHARS = 1200;

function groupTranscriptEntries(entries) {
  const groups = [];
  let current = [];
  let currentLen = 0;
  for (const e of entries) {
    const lineLen = e.text.length + (e.speaker || '').length + (e.time || '').length + 4;
    if (current.length && currentLen + lineLen > MAX_TRANSCRIPT_CHUNK_CHARS) {
      groups.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(e);
    currentLen += lineLen;
  }
  if (current.length) groups.push(current);
  return groups;
}

function groupRawParagraphs(rawText) {
  const paragraphs = (rawText || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const groups = [];
  let current = '';
  for (const p of paragraphs) {
    if (current && current.length + p.length > MAX_TRANSCRIPT_CHUNK_CHARS) {
      groups.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${p}` : p;
  }
  if (current) groups.push(current);
  return groups.length ? groups : (rawText || '').trim() ? [rawText.trim()] : [];
}

// Monta a lista de chunks de UMA reunião, sem tocar no banco — separado
// da escrita pra poder ser testado isoladamente (ver server/scripts se
// algum dia precisar de um dry-run).
export function buildMeetingChunks(orgId, projectId, meeting) {
  const chunks = [];
  const meetingId = meeting.id;
  const meetingTitle = meeting.title || 'Reunião sem título';
  const meetingDate = meeting.date || null;
  let order = 0;

  function push(kind, content, { participants = [], timeRef = '', sourceRef = {} } = {}) {
    const trimmed = (content || '').trim();
    if (!trimmed) return;
    chunks.push({
      id: uid('pmc'),
      orgId, projectId, meetingId, kind,
      content: trimmed,
      participants: participants.filter(Boolean),
      meetingDate, meetingTitle,
      timeRef: timeRef || '',
      sourceRef: { meetingId, ...sourceRef },
      chunkOrder: order++,
    });
  }

  // Transcrição — reaproveita o MESMO reconhecimento de padrão usado na
  // aba "Completa" da tela de Reunião (shared/transcriptParser.js), pra
  // nunca divergir do que o usuário já vê na tela.
  const entries = parseTranscript(meeting.transcript);
  if (entries) {
    for (const group of groupTranscriptEntries(entries)) {
      const content = group.map((e) => `${e.speaker} (${e.time}): ${e.text}`).join('\n');
      const speakers = Array.from(new Set(group.map((e) => e.speaker).filter(Boolean)));
      push('transcript_segment', content, { participants: speakers, timeRef: group[0].time });
    }
  } else if (meeting.transcript) {
    // Formato não reconhecido — cai pra chunking simples por parágrafo,
    // sem fingir que sabemos quem falou o quê.
    for (const para of groupRawParagraphs(meeting.transcript)) {
      push('transcript_segment', para);
    }
  }

  // Resumo
  push('meeting_summary', meeting.summary, { participants: meeting.participants || [] });

  // Decisões — uma por linha (mesma separação usada na leitura da tela).
  // Não sabemos hoje QUEM propôs cada decisão especificamente (o schema
  // de `decisions` é uma string única, sem atribuição por item) — por
  // isso `participants` fica vazio aqui, de propósito, em vez de chutar.
  splitDecisionLines(meeting.decisions).forEach((d) => push('meeting_decision', d));

  // Highlights e tópicos gerados pela IA (reuniões processadas depois
  // da reforma de transcrição — podem não existir em reuniões antigas).
  (meeting.highlights || []).forEach((h) => {
    push('meeting_highlight', `[${h.type}] ${h.quote}`, { timeRef: h.time || '' });
  });
  (meeting.topics || []).forEach((t) => {
    push('meeting_topic', t.title, { timeRef: t.startTime || '' });
  });

  // Atividades nascidas desta reunião + comentários de cada uma.
  (meeting.actionItems || []).filter((it) => !it.deleted).forEach((it) => {
    const side = it.owner === 'cliente' ? 'lado do cliente' : 'lado da PRICETAX';
    const parts = [
      it.title,
      it.subtitle,
      it.notes,
      `Responsável: ${it.responsible || 'sem responsável'} (${side})`,
      `Status: ${it.status || 'nao-iniciado'}`,
      it.dueDate ? `Prazo: ${it.dueDate}` : 'Sem prazo',
    ].filter(Boolean);
    push('activity', parts.join('\n'), {
      participants: it.responsible ? [it.responsible] : [],
      sourceRef: { activityId: it.id },
    });
    (it.comments || []).forEach((c) => {
      push('activity_comment', c.text, {
        participants: c.user ? [c.user] : [],
        sourceRef: { activityId: it.id, commentId: c.id },
      });
    });
  });

  return chunks;
}

async function insertChunks(client, chunks) {
  for (const c of chunks) {
    await client.query(
      `INSERT INTO project_memory_chunks
        (id, org_id, project_id, meeting_id, kind, content, participants, meeting_date, meeting_title, time_ref, source_ref, chunk_order, embedding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [c.id, c.orgId, c.projectId, c.meetingId, c.kind, c.content, JSON.stringify(c.participants), c.meetingDate, c.meetingTitle, c.timeRef, JSON.stringify(c.sourceRef), c.chunkOrder, c.embedding ? JSON.stringify(c.embedding) : null],
    );
  }
}

// Embeda todos os chunks de uma reunião numa ÚNICA chamada em lote —
// evita N chamadas de rede pra N chunks (ver server/embeddings.js).
// Sem VOYAGE_API_KEY configurada, ou se a chamada falhar, os chunks
// continuam sendo criados sem embedding — pesquisável só por texto até
// a próxima reindexação, nunca derruba a reindexação inteira por causa
// disso (mesma filosofia de "peça faltando não quebra o resto" já usada
// em askProjectAssistant).
async function embedChunksInPlace(chunks) {
  if (!voyageConfigured() || !chunks.length) return;
  try {
    const vectors = await embedTexts(chunks.map((c) => c.content), 'document');
    vectors.forEach((v, i) => { chunks[i].embedding = v; });
  } catch (e) {
    console.error('Memória do projeto: falha ao gerar embeddings — chunks ficam sem busca semântica até a próxima reindexação.', e.message);
  }
}

// Reindexa UMA reunião — apaga tudo que já existia pra ela e recria do
// zero. Idempotente: pode ser chamado quantas vezes for preciso (a cada
// edição de reunião, no backfill, etc.) sem duplicar nem acumular lixo.
export async function reindexMeetingMemory(pool, orgId, projectId, meeting) {
  const chunks = buildMeetingChunks(orgId, projectId, meeting);
  // Chamada de rede fica FORA da transação de propósito — não faz
  // sentido segurar uma conexão/lock do Postgres esperando a API da
  // Voyage responder.
  await embedChunksInPlace(chunks);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM project_memory_chunks WHERE project_id=$1 AND meeting_id=$2', [projectId, meeting.id]);
    await insertChunks(client, chunks);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return chunks.length;
}

// Reindexa todas as reuniões não excluídas de um projeto — usado no
// backfill inicial e sempre que fizer sentido reprocessar tudo de uma
// empresa de uma vez.
export async function reindexProjectMemory(pool, orgId, projectId, project) {
  const meetings = (project.meetings || []).filter((m) => !m.deleted);
  let total = 0;
  for (const m of meetings) {
    total += await reindexMeetingMemory(pool, orgId, projectId, m);
  }
  return { meetingsIndexed: meetings.length, chunksCreated: total };
}

export async function deleteMeetingMemory(pool, projectId, meetingId) {
  await pool.query('DELETE FROM project_memory_chunks WHERE project_id=$1 AND meeting_id=$2', [projectId, meetingId]);
}

// Chamado a cada PATCH /api/projects/:id (routes.js) — compara o
// `meetings[]` de antes e depois do salvamento e só reindexa as
// reuniões que de fato mudaram de conteúdo (mesmo espírito do diff que
// `notifyActivityChanges` já faz pra notificações). Reunião apagada
// (soft-delete) tem seus chunks removidos, não reindexados.
export async function syncProjectMemoryFromDiff(pool, orgId, projectId, current, next_) {
  const currentById = new Map((current.meetings || []).map((m) => [m.id, m]));
  for (const m of (next_.meetings || [])) {
    if (m.deleted) {
      await deleteMeetingMemory(pool, projectId, m.id);
      continue;
    }
    const before = currentById.get(m.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(m)) {
      await reindexMeetingMemory(pool, orgId, projectId, m);
    }
  }
}
