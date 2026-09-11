// Memória de conhecimento em camadas da RENATA (Fase 7, 2026-09-11) —
// ver PROJECT_CONTEXT.md pro desenho completo. Um fato só chega aqui
// depois de confirmação explícita do usuário (mesmo fluxo de
// proposedAction das outras 6 ações da RENATA, ver
// server/assistantActions.js `executeSaveKnowledgeFact`) — nunca
// automático. Detecção de conflito é por SIGNIFICADO do CONTEÚDO
// (embedding do `content`, não do `subject` — testado localmente:
// frases curtas tipo "cargo do Felipe" não discriminam bem entre si,
// mas o conteúdo completo sim, ver limiares abaixo).
import { embedTexts, cosineSimilarity } from './embeddings.js';

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

// Calibrado empiricamente (script local, embeddings reais): comparar só
// o "assunto" curto (2-4 palavras) NÃO discrimina bem — frases curtas
// ficam todas parecidas entre si por natureza (~0.5-0.6 de similaridade
// mesmo entre assuntos sem nenhuma relação). Comparar o CONTEÚDO
// completo do fato funciona muito melhor: duas frases sobre o mesmo
// tópico mas contraditórias ("Felipe é o CEO" vs "Felipe não é mais
// CEO") ficam em ~0.86-0.87; frases sem relação nenhuma ficam em
// ~0.48-0.58; paráfrases quase idênticas ficam em ~0.97+. Por isso o
// embedding gravado e comparado é do `content`, não do `subject` — o
// `subject` continua existindo só como rótulo legível pro texto
// injetado no prompt (`loadRelevantFacts`).
const DUPLICATE_SIMILARITY_THRESHOLD = 0.93; // praticamente a mesma frase, paráfrase
const CONFLICT_SIMILARITY_THRESHOLD = 0.75; // mesmo tópico, mas afirmações diferentes

// Acha o fato ativo mais parecido (por CONTEÚDO) no mesmo escopo — não
// compara projetos diferentes entre si, nem projeto com org. Retorna
// null se não achar nada acima do limiar mais baixo (CONFLICT).
export async function findConflictingFact(pool, { orgId, projectId, scope, contentEmbedding }) {
  const conditions = ["org_id = $1", "scope = $2", "status NOT IN ('rejected','superseded')", 'embedding IS NOT NULL'];
  const params = [orgId, scope];
  function addParam(value) { params.push(value); return `$${params.length}`; }
  if (scope === 'project') {
    conditions.push(`project_id = ${addParam(projectId)}`);
  } else {
    conditions.push('project_id IS NULL');
  }
  const { rows } = await pool.query(
    `SELECT id, subject, content, embedding FROM ai_knowledge_facts WHERE ${conditions.join(' AND ')}`,
    params,
  );
  let best = null;
  for (const row of rows) {
    const sim = cosineSimilarity(contentEmbedding, row.embedding);
    if (sim >= CONFLICT_SIMILARITY_THRESHOLD && (!best || sim > best.similarity)) {
      best = { ...row, similarity: sim };
    }
  }
  return best;
}

// Salva um fato novo. Se já existir um fato ativo com conteúdo
// PRATICAMENTE IGUAL (mesmo tópico, mesma afirmação, só parafraseado),
// não duplica. Se o tópico bater mas a afirmação for DIFERENTE, marca
// os dois (o novo e o antigo) como 'conflicting' — nunca sobrescreve,
// nunca apaga.
export async function saveKnowledgeFact(pool, { orgId, projectId, scope, subject, content, sourceUserId, sourceConversationId }) {
  let contentEmbedding = null;
  try {
    [contentEmbedding] = await embedTexts([content], 'document');
  } catch (e) {
    console.error('Assistente do Projeto: falha ao embedar conteúdo do fato novo — seguindo sem detecção de conflito.', e.message);
  }

  let status = 'unvalidated';
  let conflictWith = null;
  if (contentEmbedding) {
    const existing = await findConflictingFact(pool, { orgId, projectId, scope, contentEmbedding });
    if (existing) {
      const sim = cosineSimilarity(contentEmbedding, existing.embedding);
      if (sim >= DUPLICATE_SIMILARITY_THRESHOLD) {
        return { id: existing.id, status: 'duplicate' };
      }
      status = 'conflicting';
      conflictWith = existing.id;
    }
  }

  const id = uid('akf');
  await pool.query(
    `INSERT INTO ai_knowledge_facts (id, org_id, project_id, scope, subject, content, status, source_user_id, source_conversation_id, embedding)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id, orgId, scope === 'project' ? projectId : null, scope, subject, content, status,
      sourceUserId || null, sourceConversationId || null,
      contentEmbedding ? JSON.stringify(contentEmbedding) : null,
    ],
  );
  if (conflictWith) {
    await pool.query(`UPDATE ai_knowledge_facts SET status='conflicting', updated_at=now() WHERE id=$1`, [conflictWith]);
  }
  return { id, status, conflictWith };
}

// Monta o texto "CONHECIMENTO ACUMULADO" injetado no prompt da RENATA —
// fatos do projeto atual + fatos válidos pra organização inteira
// (scope='org'), excluindo rejeitados/substituídos. Fatos conflitantes
// aparecem destacados; o prompt (server/assistantRetrieval.js) é
// instruído a nunca escolher uma versão sozinho quando ver essa marca.
export async function loadRelevantFacts(pool, orgId, projectId, limit = 30) {
  const { rows } = await pool.query(
    `SELECT k.subject, k.content, k.status, k.scope, k.created_at, u.name AS source_user_name
     FROM ai_knowledge_facts k
     LEFT JOIN users u ON u.id = k.source_user_id
     WHERE k.org_id = $1
       AND k.status NOT IN ('rejected', 'superseded')
       AND (k.scope = 'org' OR (k.scope = 'project' AND k.project_id = $2))
     ORDER BY k.created_at DESC
     LIMIT $3`,
    [orgId, projectId, limit],
  );
  if (!rows.length) return '(nenhum conhecimento acumulado registrado ainda para este projeto/organização)';
  return rows.map((r) => {
    const scopeLabel = r.scope === 'org' ? 'PRICETAX (toda a organização)' : 'específico deste projeto';
    const who = r.source_user_name ? `informado por ${r.source_user_name}` : 'origem não registrada';
    const dateLabel = new Date(r.created_at).toLocaleDateString('pt-BR');
    const flag = r.status === 'conflicting' ? ' [CONFLITANTE — existe outra versão divergente deste mesmo assunto; não escolha uma sozinha, avise o usuário e pergunte qual vale]' : '';
    return `- [${r.subject}] ${r.content} (${scopeLabel}, ${who}, em ${dateLabel}, status: ${r.status})${flag}`;
  }).join('\n');
}
