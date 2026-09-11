// Rotas do Assistente do Projeto (2026-09, Fase 2 do Assistente
// Inteligente de Projetos). Mesmo padrão de autorização de toda rota de
// projeto: `requireAuth` + `canAccessProject` — quem pode ver a empresa
// pode conversar sobre a memória dela, sem tabela de permissão nova.
import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { canAccessProject } from './routes.js';
import { askProjectAssistant, getConversationMessages, clearConversation, setMessageFeedback, decideProposedAction } from './assistantRetrieval.js';
import { reindexProjectMemory } from './memoryIngest.js';

export const router = Router();

async function loadAuthorizedProject(req, res, projectId) {
  if (!projectId) { res.status(400).json({ message: 'Informe projectId.' }); return null; }
  const { rows } = await pool.query('SELECT data, org_id, updated_at FROM projects WHERE id=$1', [projectId]);
  if (!rows[0]) { res.status(404).json({ message: 'Empresa não encontrada.' }); return null; }
  if (!canAccessProject(req.user, rows[0].data, rows[0].org_id)) { res.status(403).json({ message: 'Sem acesso a essa empresa.' }); return null; }
  return rows[0];
}

// Log-only append pro project.log (2026-09-10, pedido do Rafael: "crie
// log para tudo na aba Reuniões e Atividades") — mesmo helper de
// server/meetingInbox.js, duplicado aqui de propósito (4 linhas, não
// compensa criar um módulo compartilhado só pra isso).
async function appendProjectLog(projectId, action, user) {
  const { rows } = await pool.query('SELECT data FROM projects WHERE id=$1', [projectId]);
  if (!rows[0]) return;
  const data = rows[0].data || {};
  const nextData = {
    ...data,
    log: [{ ts: new Date().toISOString(), action, user, activityId: null }, ...(data.log || [])].slice(0, 300),
  };
  await pool.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(nextData), projectId]);
}

router.get('/conversation', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const project = await loadAuthorizedProject(req, res, projectId);
    if (!project) return;
    const messages = await getConversationMessages(pool, project.org_id, projectId, req.user.id);
    res.json({ messages });
  } catch (e) { next(e); }
});

router.post('/ask', requireAuth, async (req, res, next) => {
  try {
    const { projectId, question, context } = req.body || {};
    const text = (question || '').trim();
    if (!text) return res.status(400).json({ message: 'Informe a pergunta.' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ message: 'Assistente não configurado nesse ambiente (falta ANTHROPIC_API_KEY).' });
    const project = await loadAuthorizedProject(req, res, projectId);
    if (!project) return;
    const message = await askProjectAssistant({ pool, orgId: project.org_id, projectId, userId: req.user.id, question: text, context: context || {}, projectData: project.data, projectUpdatedAt: project.updated_at });
    res.json({ message });
  } catch (e) { next(e); }
});

router.post('/conversation/clear', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const project = await loadAuthorizedProject(req, res, projectId);
    if (!project) return;
    await clearConversation(pool, project.org_id, projectId, req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/messages/:id/feedback', requireAuth, async (req, res, next) => {
  try {
    const { projectId, feedback } = req.body || {};
    if (!['up', 'down'].includes(feedback)) return res.status(400).json({ message: 'Feedback inválido.' });
    const project = await loadAuthorizedProject(req, res, projectId);
    if (!project) return;
    await setMessageFeedback(pool, project.org_id, projectId, req.user.id, req.params.id, feedback);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Reindexação manual da memória do projeto (2026-09-10) — botão de
// autoatendimento pro próprio usuário corrigir o caso de reuniões que a
// RENATA não está encontrando (ex.: reuniões criadas via "Enviar
// transcrição" antes do fix que passou a reindexar automaticamente,
// server/meetingInbox.js). Sem isso, corrigir dependeria de rodar um
// script direto contra o banco de produção — inviável pro Rafael sem
// acesso ao Railway. Idempotente (reindexMeetingMemory sempre apaga e
// recria), então clicar de novo nunca duplica nem piora nada.
router.post('/reindex', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = req.body || {};
    const project = await loadAuthorizedProject(req, res, projectId);
    if (!project) return;
    const result = await reindexProjectMemory(pool, project.org_id, projectId, project.data);
    appendProjectLog(projectId, `${req.user.name} reindexou manualmente a memória da RENATA (${result.meetingsIndexed} reunião(ões), ${result.chunksCreated} trecho(s))`, req.user.name)
      .catch((e) => console.error('Falha ao registrar log de reindexação manual', e.message));
    res.json(result);
  } catch (e) { next(e); }
});

// Checagem barata (Fase 6, 2026-09-10, redução de custo) — usada pelo
// auto-reindex ao entrar numa empresa (src/App.jsx) ANTES de chamar
// /reindex de verdade. syncProjectMemoryFromDiff já mantém a memória
// sincronizada em tempo real a cada edição salva — uma reindexação
// completa só é necessária mesmo pra dois casos concretos: (a) algum
// chunk existe sem embedding (chave da Voyage não configurada na época,
// ou falha pontual numa chamada anterior); (b) alguma reunião não tem
// NENHUM chunk (nunca foi indexada de verdade). Fora isso, reindexar de
// novo só reprocessaria embedding à toa em dados que já estão corretos.
router.get('/reindex-needed', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const project = await loadAuthorizedProject(req, res, projectId);
    if (!project) return;
    const meetings = (project.data.meetings || []).filter((m) => !m.deleted);
    if (!meetings.length) return res.json({ needed: false });

    const { rows: unembedded } = await pool.query(
      `SELECT 1 FROM project_memory_chunks WHERE project_id=$1 AND embedding IS NULL LIMIT 1`,
      [projectId],
    );
    if (unembedded.length) return res.json({ needed: true });

    const { rows: indexedMeetingRows } = await pool.query(
      `SELECT DISTINCT meeting_id FROM project_memory_chunks WHERE project_id=$1`,
      [projectId],
    );
    const indexedMeetingIds = new Set(indexedMeetingRows.map((r) => r.meeting_id));
    const needed = meetings.some((m) => !indexedMeetingIds.has(m.id));
    res.json({ needed });
  } catch (e) { next(e); }
});

// Agente executor (2026-09) — a IA só propõe (ver server/assistantRetrieval.js
// / server/assistantActions.js); esta rota é o único lugar que de fato
// confirma ou rejeita, sempre a partir de um clique explícito do usuário
// no painel (nunca automático).
router.post('/messages/:id/action', requireAuth, async (req, res, next) => {
  try {
    const { projectId, decision, overrides } = req.body || {};
    if (!['confirm', 'reject'].includes(decision)) return res.status(400).json({ message: 'Decisão inválida.' });
    const project = await loadAuthorizedProject(req, res, projectId);
    if (!project) return;
    const result = await decideProposedAction(pool, project.org_id, projectId, req.user.id, req.params.id, decision, req.user.name, overrides || null);
    res.json(result);
  } catch (e) {
    // Erros esperados desse fluxo (mensagem/ação já decidida, reunião
    // apagada nesse meio-tempo) merecem mensagem própria pro usuário, não
    // o "Erro interno do servidor." genérico do handler global.
    if (/não encontrad|já foi decidida|não suportado/i.test(e.message || '')) {
      return res.status(400).json({ message: e.message });
    }
    next(e);
  }
});
