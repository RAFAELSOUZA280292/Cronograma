// Sugestão da atividade do cronograma para cada tarefa que sai de uma transcrição (Fase 2 do plano, 2026-10-13;
// docs/PLANO_VINCULO_TAREFA_ATIVIDADE.md). Conjunto FECHADO: a IA só escolhe entre as atividades daquela empresa ou diz "nenhuma";
// o id devolvido é validado em código. Duas camadas: IA (uma chamada em lote, separada da extração — falha não derruba a reunião) e
// regra simples de reserva (área → atividade, sobreposição de palavras). Nunca confirma sozinha: grava `activityLink.status =
// 'suggested'` e o humano confirma/troca na tela (Fase 1). A camada "aprendido" (Fase 3) entra antes destas duas.
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { norm } from './inventory.js';
import { titleTokens, jaccard } from './gaps.js';
import { STUDY_MODEL } from './parecerStudy.js';

export const MIN_CONFIDENCE = 0.5;   // abaixo disso não sugere (mostra "escolher atividade")
export const HIGH_CONFIDENCE = 0.8;  // acima disso entra no "confirmar todas"
const CHUNK = 30;
const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));

const AREA_WORDS = {
  Comercial: ['vendas', 'comercial'], Compras: ['compras'], Controladoria: ['controladoria'], Diretoria: ['diretoria'],
  Financeiro: ['financeiro'], Fiscal: ['fiscal'], 'Jurídico': ['juridico'], 'Logística': ['logistica'],
  RH: ['rh', 'recursos humanos'], TI: ['sistemas', 'ti'],
};

const liveActivities = (activities) => (activities || []).filter((a) => a && !a.deleted && a.id && a.title);

// Regra de reserva (função pura): devolve { activityId, confidence, reason } ou null.
export function ruleSuggest(task, activities) {
  const acts = liveActivities(activities);
  const words = AREA_WORDS[task.area] || [];
  if (words.length) {
    const hit = acts.find((a) => {
      const t = ` ${norm(a.title).replace(/[^a-z0-9 ]/g, ' ')} `;
      return words.some((w) => t.includes(` ${w} `));
    });
    if (hit) return { activityId: hit.id, confidence: 0.6, reason: `A tarefa é da área ${task.area}, que é o foco da atividade "${hit.title}".` };
  }
  const tt = titleTokens(task.title);
  let best = null;
  for (const a of acts) {
    const j = jaccard(tt, titleTokens(a.title));
    if (j >= 0.34 && (!best || j > best.j)) best = { a, j };
  }
  if (best) return { activityId: best.a.id, confidence: 0.5, reason: `O título da tarefa tem palavras em comum com "${best.a.title}".` };
  return null;
}

const SuggestSchema = z.object({
  suggestions: z.array(z.object({
    taskId: z.string().describe('O id da tarefa exatamente como recebido.'),
    activityId: z.string().nullable().describe('O id da atividade do cronograma a que a tarefa pertence, exatamente como recebido — ou null se nenhuma se encaixa com segurança.'),
    confidence: z.number().describe('De 0 a 1: 0,9+ quando o assunto da tarefa é claramente o da atividade; 0,5 a 0,8 quando é provável; abaixo de 0,5 devolva activityId null.'),
    reason: z.string().describe('Uma frase curta, em português, dizendo por que a tarefa pertence a essa atividade.'),
  })),
});

const SYSTEM = 'Você é a RENATA, assistente da consultoria PRICETAX (Reforma Tributária). Cada empresa-cliente tem um cronograma com atividades macro (ex.: Kickoff, envio de dados, apresentação prévia, workshop por área como Compras ou Fiscal, validação, comitê). Dada uma lista de tarefas que saíram de uma reunião, diga a qual atividade DO CRONOGRAMA DESTA EMPRESA cada tarefa pertence — a atividade que a tarefa faz andar. Escolha somente entre as atividades listadas e copie o id exatamente. Se nenhuma se encaixa com segurança, devolva activityId null: é melhor não sugerir do que chutar. Responda só o JSON pedido.';

export function buildPrompt({ activities, phases, tasks, meeting }) {
  const phaseName = new Map((phases || []).map((p) => [p.id, p.name]));
  const acts = liveActivities(activities).map((a) => `- id=${a.id} | ${a.title} | fase: ${phaseName.get(a.phase) || '—'}${a.responsible ? ` | responsável: ${a.responsible}` : ''}${a.date ? ` | data: ${a.date}` : ''}${a.desc ? ` | ${clip(a.desc, 140)}` : ''}`);
  const ts = tasks.map((t) => `- id=${t.id} | ${clip(t.title, 220)}${t.area ? ` | área: ${t.area}` : ''} | lado: ${t.owner === 'cliente' ? 'cliente' : 'PRICETAX'}${t.responsible ? ` | responsável: ${t.responsible}` : ''}`);
  return `ATIVIDADES DO CRONOGRAMA:\n${acts.join('\n')}\n\nREUNIÃO: ${clip(meeting && meeting.title, 120)}\n${meeting && meeting.summary ? `Resumo: ${clip(meeting.summary, 900)}\n` : ''}\nTAREFAS:\n${ts.join('\n')}`;
}

// Valida a resposta da IA contra o conjunto fechado. Função pura.
export function validateAi(parsed, tasks, activities) {
  const ids = new Set(liveActivities(activities).map((a) => a.id));
  const taskIds = new Set(tasks.map((t) => t.id));
  const out = {};
  for (const s of (parsed && parsed.suggestions) || []) {
    if (!s || !taskIds.has(s.taskId) || out[s.taskId]) continue;
    const conf = Math.max(0, Math.min(1, Number(s.confidence) || 0));
    if (!s.activityId || !ids.has(s.activityId) || conf < MIN_CONFIDENCE) continue;
    out[s.taskId] = { activityId: s.activityId, confidence: Math.round(conf * 100) / 100, reason: clip(s.reason, 240), source: 'ia' };
  }
  return out;
}

// Junta sugestões às tarefas (função pura). Tarefa que já tem vínculo humano não é tocada.
export function applySuggestions(items, suggestions) {
  return items.map((it) => {
    const s = suggestions[it.id];
    if (!s || it.activityId || (it.activityLink && it.activityLink.status === 'confirmed')) return it;
    return { ...it, activityId: '', activityLink: { status: 'suggested', suggestedId: s.activityId, confidence: s.confidence, reason: s.reason, source: s.source } };
  });
}

// Ponto de entrada. `client` = SDK da Anthropic (injetável em teste); sem client ou se a IA falhar, só a regra de reserva.
export async function suggestActivityLinks({ client, activities, phases, tasks, meeting }) {
  const acts = liveActivities(activities);
  const result = { suggestions: {}, usage: { input: 0, output: 0 }, usedAI: false, aiError: '' };
  if (!acts.length || !tasks.length) return result;
  let ai = {};
  if (client) {
    try {
      for (let i = 0; i < tasks.length; i += CHUNK) {
        const chunk = tasks.slice(i, i + CHUNK);
        const res = await client.messages.parse({
          model: STUDY_MODEL,
          max_tokens: 4000,
          system: [{ type: 'text', text: SYSTEM }],
          messages: [{ role: 'user', content: buildPrompt({ activities, phases, tasks: chunk, meeting }) }],
          output_config: { format: zodOutputFormat(SuggestSchema) },
        });
        Object.assign(ai, validateAi(res.parsed_output, chunk, activities));
        result.usage.input += (res.usage && res.usage.input_tokens) || 0;
        result.usage.output += (res.usage && res.usage.output_tokens) || 0;
      }
      result.usedAI = true;
    } catch (e) {
      result.aiError = String(e && e.message || e).slice(0, 200);
      console.error('Vínculo tarefa→atividade: sugestão por IA falhou — usando a regra de reserva.', result.aiError);
      ai = {};
    }
  }
  for (const t of tasks) {
    if (ai[t.id]) { result.suggestions[t.id] = ai[t.id]; continue; }
    if (result.usedAI) continue; // a IA olhou e decidiu que nenhuma se encaixa: não sobrepõe com a regra
    const r = ruleSuggest(t, activities);
    if (r) result.suggestions[t.id] = { ...r, source: 'regra' };
  }
  return result;
}
