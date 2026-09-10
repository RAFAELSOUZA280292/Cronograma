// Caixa de transcrições (2026-09, pedido do Rafael) — "eu e meus sócios e
// funcionários vão mandar as transcrições, e o painel faz o input pra nós".
// Fluxo: alguém cola a transcrição na aba Reuniões de uma empresa → cria um
// registro `meeting_submissions` (status 'pending') → dispara processamento
// fire-and-forget (mesma convenção do sync do Google Calendar, ver
// PROJECT_CONTEXT.md §21 — nunca segura a resposta HTTP numa chamada
// externa) → a Claude API extrai título/data/participantes/resumo/decisões/
// atividades em JSON validado (`output_config.format` + Zod, sem parsing
// manual de string) → o resultado vira uma reunião de verdade dentro de
// `project.data.meetings[]`, exatamente no mesmo formato que a aba Reuniões
// já usa quando criada manualmente. Empresa/projeto já vem escolhida por
// quem envia (dropdown no frontend) — não pedimos pra IA adivinhar isso,
// porque a transcrição raramente cita CNPJ e o nome da empresa sozinho não
// é uma correspondência confiável.

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { canAccessProject } from './routes.js';
import { reindexMeetingMemory } from './memoryIngest.js';

export const router = Router();

function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

function anthropicConfigured() { return !!process.env.ANTHROPIC_API_KEY; }

const MeetingExtractionSchema = z.object({
  title: z.string().describe('Título curto e descritivo da reunião, em português'),
  date: z.string().nullable().describe('Data da reunião em YYYY-MM-DD — só se estiver explícita no texto (ex.: "10 de agosto de 2026"); nunca deduza a partir de um dia da semana sozinho ("quarta-feira")'),
  time: z.string().nullable().describe('Horário de início em HH:MM, formato 24h — só se explicitamente mencionado'),
  participants: z.array(z.string()).describe('Nomes das pessoas que participaram da reunião, extraídos da transcrição'),
  summary: z.string().describe('Resumo completo e bem organizado da reunião em português, cobrindo os principais tópicos discutidos'),
  decisions: z.string().describe('Decisões concretas tomadas durante a reunião, em português; string vazia se nenhuma decisão explícita foi tomada'),
  actionItems: z.array(z.object({
    title: z.string().describe('O que precisa ser feito — ação concreta e curta, sem o nome do responsável embutido no texto (o nome já vai no campo "responsible" à parte)'),
    responsible: z.string().nullable().describe('Nome da pessoa física responsável por executar, exatamente como ela é chamada na transcrição (ex.: "Evanio Santinon", "Rogeria Guerra", "Daniela") — nunca um cargo genérico, nunca o nome de uma empresa. Se duas pessoas dividem a tarefa (ex.: "Gustavo, com a Francine"), coloque as duas nesse mesmo campo, separadas por vírgula. null se a transcrição não deixar claro quem executa.'),
    owner: z.enum(['pricetax', 'cliente']).describe('De qual lado é essa entrega: "pricetax" quando quem precisa produzir/entregar algo é a própria equipe da consultoria PRICETAX (ex.: fazer uma análise, montar uma prévia, agendar um retorno); "cliente" quando quem precisa produzir/entregar algo é alguém do lado da empresa contratante — a pessoa em "responsible" normalmente já indica de qual lado é, mas classifique mesmo quando "responsible" ficar null'),
    dueDate: z.string().nullable().describe('Prazo em YYYY-MM-DD — só se explicitamente mencionado'),
  })).describe('Lista de atividades e próximos passos definidos na reunião, um item por ação concreta — não agrupe várias ações numa linha só'),
  topics: z.array(z.object({
    title: z.string().describe('Título curto do tópico/bloco de assunto discutido, em português'),
    startTime: z.string().nullable().describe('O timestamp EXATAMENTE como aparece no texto bruto da transcrição no início desse tópico (ex.: "00:00", "12:48") — cite literalmente o texto, não invente nem arredonde. null se a transcrição não tiver marcação de tempo.'),
  })).describe('De 3 a 8 blocos cronológicos de assunto, na ordem em que aparecem na reunião — só o título e o timestamp de início de cada um, NUNCA reproduza as falas aqui (isso já está no campo transcript, que é a fonte original e não deve ser duplicada).'),
  highlights: z.array(z.object({
    type: z.enum(['decisao', 'risco', 'pendencia', 'proximo_passo', 'duvida', 'insight', 'numero_importante']).describe('Classificação do trecho: decisao (algo foi decidido), risco (algo pode dar errado / precisa atenção), pendencia (ficou em aberto), proximo_passo (ação futura combinada), duvida (pergunta sem resposta na call), insight (observação relevante), numero_importante (valor/percentual/prazo citado que merece destaque)'),
    time: z.string().nullable().describe('Timestamp exatamente como aparece no texto, se houver'),
    quote: z.string().describe('Citação literal e curta (uma frase) copiada do texto da transcrição — nunca parafraseada'),
  })).describe('Até 10 trechos mais relevantes da reunião, cada um citado literalmente (não resuma o resto da transcrição aqui, isso é papel do campo summary).'),
});

async function extractMeetingFromTranscript(transcript, clientCompanyName) {
  const client = new Anthropic();
  const contexto = clientCompanyName
    ? `Contexto: esta call é entre a consultoria PRICETAX e o cliente dela, a empresa "${clientCompanyName}". Toda pessoa que não for da equipe da PRICETAX (normalmente identificada na fala como "Pricetax", "consultoria", ou os nomes da equipe da consultoria) é do lado do cliente "${clientCompanyName}".\n\n`
    : '';
  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 10000,
    system: 'Você extrai informações estruturadas de transcrições de reuniões de negócio em português do Brasil. Seja fiel ao conteúdo — nunca invente datas, nomes ou decisões que não estejam no texto. Quando algo não for mencionado explicitamente, deixe null (ou lista/string vazia). Preste atenção especial a quem fala cada trecho (os nomes de interlocutor na transcrição) para saber de que lado (PRICETAX ou cliente) vem cada compromisso assumido. Para "topics" e "highlights", cite timestamps e trechos exatamente como aparecem no texto bruto — nunca invente marcação de tempo que não esteja lá, e nunca copie a transcrição inteira nesses campos (eles são só um índice leve, o texto original já está preservado à parte).',
    messages: [{ role: 'user', content: `${contexto}Extraia as informações estruturadas desta transcrição de reunião:\n\n${transcript}` }],
    output_config: { format: zodOutputFormat(MeetingExtractionSchema) },
  });
  if (!response.parsed_output) throw new Error('A IA não conseguiu estruturar essa transcrição.');
  return response.parsed_output;
}

async function processSubmission(submissionId) {
  try {
    await pool.query(`UPDATE meeting_submissions SET status='processing' WHERE id=$1`, [submissionId]);
    const { rows } = await pool.query('SELECT * FROM meeting_submissions WHERE id=$1', [submissionId]);
    const sub = rows[0];
    if (!sub) return;

    const { rows: projRows } = await pool.query('SELECT id, org_id, data FROM projects WHERE id=$1', [sub.project_id]);
    const project = projRows[0];
    if (!project) throw new Error('Empresa não encontrada.');
    const clientCompanyName = (project.data && project.data.company && project.data.company.name) || '';

    const extracted = await extractMeetingFromTranscript(sub.transcript, clientCompanyName);

    const meeting = {
      id: uid('mtg'),
      title: extracted.title || 'Reunião sem título',
      date: sub.manual_date || extracted.date || '',
      time: sub.manual_time || extracted.time || '',
      participants: extracted.participants || [],
      transcript: sub.transcript,
      summary: extracted.summary || '',
      decisions: extracted.decisions || '',
      actionItems: (extracted.actionItems || []).map((it) => ({
        id: uid('mai'),
        title: it.title || '',
        responsible: it.responsible || '',
        owner: it.owner === 'cliente' ? 'cliente' : 'pricetax',
        dueDate: it.dueDate || '',
        status: 'nao-iniciado',
        deleted: false,
        subtitle: '',
        notes: '',
        subtasks: [],
        comments: [],
        attachments: [],
        createdBy: 'IA (transcrição)',
        createdAt: new Date().toISOString(),
      })),
      topics: extracted.topics || [],
      highlights: extracted.highlights || [],
      shareToken: '',
      shareVisibility: 'private',
      createdAt: new Date().toISOString(),
      deleted: false,
      deletedAt: '',
      deletedBy: '',
    };

    const currentData = project.data || {};
    const nextData = {
      ...currentData,
      meetings: [...(currentData.meetings || []), meeting],
      log: [
        { ts: new Date().toISOString(), action: `Reunião registrada a partir de transcrição enviada: "${meeting.title}"`, user: 'IA (transcrição)', activityId: null },
        ...(currentData.log || []),
      ].slice(0, 300),
    };

    await pool.query('UPDATE projects SET data=$1, updated_at=now() WHERE id=$2', [JSON.stringify(nextData), project.id]);
    await pool.query(
      `UPDATE meeting_submissions SET status='done', meeting_id=$1, processed_at=now() WHERE id=$2`,
      [meeting.id, submissionId],
    );
    // Essa gravação vai direto no banco (fora do fluxo normal de
    // mutateProject/PATCH /api/projects/:id, que é quem dispara
    // syncProjectMemoryFromDiff) — sem isso a reunião nunca entrava na
    // memória pesquisável do Assistente do Projeto (bug real encontrado
    // 2026-09-10: reunião aparecia certinho no cadastro, mas a IA nunca
    // achava conteúdo dela na busca).
    reindexMeetingMemory(pool, project.org_id, project.id, meeting)
      .catch((e) => console.error('Falha ao reindexar memória da reunião criada por transcrição', e.message));
  } catch (e) {
    console.error('Falha ao processar transcrição de reunião', e.message);
    await pool.query(
      `UPDATE meeting_submissions SET status='failed', error_message=$1, processed_at=now() WHERE id=$2`,
      [String(e.message || 'Erro desconhecido').slice(0, 500), submissionId],
    ).catch(() => {});
  }
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    if (!anthropicConfigured()) {
      return res.status(503).json({ message: 'Processamento por IA não configurado nesse ambiente (falta ANTHROPIC_API_KEY).' });
    }
    const { projectId, transcript, date, time } = req.body || {};
    const text = (transcript || '').trim();
    if (!projectId || !text) {
      return res.status(400).json({ message: 'Informe projectId e transcript.' });
    }
    const { rows } = await pool.query('SELECT id, data, org_id FROM projects WHERE id=$1', [projectId]);
    if (!rows[0]) return res.status(404).json({ message: 'Empresa não encontrada.' });
    if (!canAccessProject(req.user, rows[0].data, rows[0].org_id)) {
      return res.status(403).json({ message: 'Sem acesso a essa empresa.' });
    }

    const id = uid('msub');
    await pool.query(
      `INSERT INTO meeting_submissions (id, org_id, project_id, submitted_by, transcript, manual_date, manual_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, rows[0].org_id, projectId, req.user.id, text, date || '', time || ''],
    );

    // Não segura a resposta HTTP na chamada pra Claude API (pode levar
    // dezenas de segundos numa transcrição grande) — mesmo padrão
    // fire-and-forget do sync com Google Calendar.
    processSubmission(id).catch((e) => console.error('Falha fire-and-forget ao processar submissão', e.message));

    res.status(202).json({ submissionId: id });
  } catch (e) { next(e); }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ message: 'Informe projectId.' });
    const { rows: projRows } = await pool.query('SELECT data, org_id FROM projects WHERE id=$1', [projectId]);
    if (!projRows[0]) return res.status(404).json({ message: 'Empresa não encontrada.' });
    if (!canAccessProject(req.user, projRows[0].data, projRows[0].org_id)) {
      return res.status(403).json({ message: 'Sem acesso a essa empresa.' });
    }
    const { rows } = await pool.query(
      `SELECT ms.id, ms.status, ms.error_message, ms.meeting_id, ms.created_at, ms.processed_at, u.name AS submitted_by_name
       FROM meeting_submissions ms JOIN users u ON u.id = ms.submitted_by
       WHERE ms.project_id=$1 ORDER BY ms.created_at DESC LIMIT 50`,
      [projectId],
    );
    res.json({
      submissions: rows.map((r) => ({
        id: r.id,
        status: r.status,
        errorMessage: r.error_message,
        meetingId: r.meeting_id,
        createdAt: r.created_at,
        processedAt: r.processed_at,
        submittedByName: r.submitted_by_name,
      })),
    });
  } catch (e) { next(e); }
});

router.post('/:id/retry', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT ms.status, p.data AS project_data, p.org_id AS project_org_id
       FROM meeting_submissions ms JOIN projects p ON p.id = ms.project_id
       WHERE ms.id=$1`,
      [id],
    );
    if (!rows[0]) return res.status(404).json({ message: 'Envio não encontrado.' });
    if (!canAccessProject(req.user, rows[0].project_data, rows[0].project_org_id)) {
      return res.status(403).json({ message: 'Sem acesso a essa empresa.' });
    }
    if (!anthropicConfigured()) {
      return res.status(503).json({ message: 'Processamento por IA não configurado nesse ambiente (falta ANTHROPIC_API_KEY).' });
    }
    await pool.query(`UPDATE meeting_submissions SET status='pending', error_message='' WHERE id=$1`, [id]);
    processSubmission(id).catch((e) => console.error('Falha fire-and-forget ao reprocessar submissão', e.message));
    res.json({ message: 'Reprocessando.' });
  } catch (e) { next(e); }
});
