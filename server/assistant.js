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
  const { rows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [projectId]);
  if (!rows[0]) { res.status(404).json({ message: 'Empresa não encontrada.' }); return null; }
  if (!canAccessProject(req.user, rows[0].data, rows[0].org_id)) { res.status(403).json({ message: 'Sem acesso a essa empresa.' }); return null; }
  return rows[0];
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
    const message = await askProjectAssistant({ pool, orgId: project.org_id, projectId, userId: req.user.id, question: text, context: context || {}, projectData: project.data });
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
    res.json(result);
  } catch (e) { next(e); }
});

// Agente executor (2026-09) — a IA só propõe (ver server/assistantRetrieval.js
// / server/assistantActions.js); esta rota é o único lugar que de fato
// confirma ou rejeita, sempre a partir de um clique explícito do usuário
// no painel (nunca automático).
router.post('/messages/:id/action', requireAuth, async (req, res, next) => {
  try {
    const { projectId, decision } = req.body || {};
    if (!['confirm', 'reject'].includes(decision)) return res.status(400).json({ message: 'Decisão inválida.' });
    const project = await loadAuthorizedProject(req, res, projectId);
    if (!project) return;
    const result = await decideProposedAction(pool, project.org_id, projectId, req.user.id, req.params.id, decision, req.user.name);
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
