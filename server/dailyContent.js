// Conteúdo diário ("Meu dia", 2026-10-05, §77): evangelho, versículo, sabedoria, horóscopo, horóscopo chinês e inspiração.
// Cada fonte é buscada UMA vez por dia (não por usuário) e guardada em daily_content; o usuário só lê o cache.
// Fontes testadas em 2026-10-05: Liturgia Diária (liturgia.up.railway.app, comunitária, não oficial da CNBB),
// Midvash (versículo do dia + passagens, Bíblia Livre CC BY 4.0, crédito obrigatório), AstroWay (horóscopo, lang=pt).
// ABíbliaDigital (503), Ferramentas da Web (sem resposta) e Ditado API (fora do ar) ficaram de fora.
// Horóscopo chinês e Inspiração são textos GERADOS por IA (sem API gratuita confiável) e saem marcados como tal;
// 
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { pool } from './db.js';
import { logMetric } from './metrics.js';
import { todayInSp } from './widgetSummary.js';
import { quoteOfDay } from './inspirationQuotes.js';

export const CARDS = {
  liturgy: 'Evangelho do dia',
  votd: 'Versículo do dia',
  wisdom: 'Sabedoria do dia',
  horoscope: 'Horóscopo',
  chinese: 'Horóscopo chinês',
  inspiration: 'Inspiração',
};
export const CARD_NEEDS_BIRTH = new Set(['horoscope', 'chinese']);

export const SIGNS = [
  { id: 'aries', name: 'Áries', from: [3, 21] }, { id: 'taurus', name: 'Touro', from: [4, 20] }, { id: 'gemini', name: 'Gêmeos', from: [5, 21] },
  { id: 'cancer', name: 'Câncer', from: [6, 21] }, { id: 'leo', name: 'Leão', from: [7, 23] }, { id: 'virgo', name: 'Virgem', from: [8, 23] },
  { id: 'libra', name: 'Libra', from: [9, 23] }, { id: 'scorpio', name: 'Escorpião', from: [10, 23] }, { id: 'sagittarius', name: 'Sagitário', from: [11, 22] },
  { id: 'capricorn', name: 'Capricórnio', from: [12, 22] }, { id: 'aquarius', name: 'Aquário', from: [1, 20] }, { id: 'pisces', name: 'Peixes', from: [2, 19] },
];

export function westernSign(birthIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthIso || '');
  if (!m) return null;
  const key = Number(m[2]) * 100 + Number(m[3]);
  const ordered = [...SIGNS].sort((x, y) => (x.from[0] * 100 + x.from[1]) - (y.from[0] * 100 + y.from[1]));
  let res = ordered[ordered.length - 1];
  for (const s of ordered) if (key >= s.from[0] * 100 + s.from[1]) res = s;
  return res;
}

export const ANIMALS = [
  { id: 'rat', name: 'Rato' }, { id: 'ox', name: 'Boi' }, { id: 'tiger', name: 'Tigre' }, { id: 'rabbit', name: 'Coelho' },
  { id: 'dragon', name: 'Dragão' }, { id: 'snake', name: 'Serpente' }, { id: 'horse', name: 'Cavalo' }, { id: 'goat', name: 'Cabra' },
  { id: 'monkey', name: 'Macaco' }, { id: 'rooster', name: 'Galo' }, { id: 'dog', name: 'Cão' }, { id: 'pig', name: 'Porco' },
];
const ELEMENTS = ['Metal', 'Água', 'Madeira', 'Fogo', 'Terra'];

// O ano chinês começa no Ano-Novo Lunar (entre 21/jan e 20/fev): quem nasceu antes disso ainda é do ano anterior.
// O cálculo vem do calendário chinês do próprio runtime (Intl), não de uma tabela escrita à mão.
export function chineseSign(birthIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthIso || '');
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  let year;
  try {
    const part = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'UTC', year: 'numeric' }).formatToParts(date).find((p) => p.type === 'relatedYear');
    year = part ? Number(part.value) : NaN;
  } catch { year = NaN; }
  if (!Number.isFinite(year)) return null;
  const animal = ANIMALS[(((year - 4) % 12) + 12) % 12];
  const element = ELEMENTS[Math.floor((((year % 10) + 10) % 10) / 2)];
  return { ...animal, element, year };
}

const TIMEOUT_MS = 8000;
async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const clip = (s, n) => String(s || '').replace(/\s+\n/g, '\n').trim().slice(0, n);

export async function fetchLiturgy(day) {
  const [y, m, d] = day.split('-').map(Number);
  const j = await getJson(`https://liturgia.up.railway.app/v2/?dia=${d}&mes=${m}&ano=${y}`);
  const reading = (arr) => {
    const r = Array.isArray(arr) ? arr[0] : null;
    return r ? { reference: clip(r.referencia, 60), title: clip(r.titulo, 160), text: clip(r.texto, 4000), refrain: clip(r.refrao, 300) } : null;
  };
  const l = j.leituras || {};
  const gospel = reading(l.evangelho);
  if (!gospel || !gospel.text) throw new Error('Liturgia sem evangelho');
  return { title: clip(j.liturgia, 200), color: clip(j.cor, 30), gospel, firstReading: reading(l.primeiraLeitura), psalm: reading(l.salmo), secondReading: reading(l.segundaLeitura) };
}

export async function fetchVotd() {
  const j = await getJson('https://api.midvash.com/v1/votd?language=pt-br');
  if (!j || !j.text) throw new Error('Versículo vazio');
  return { reference: clip(j.reference, 80), text: clip(j.text, 1200), credit: clip(j.copyright, 600), url: j.url || '' };
}

export const WISDOM_REFS = [
  ['3', '5-6'], ['4', '23'], ['10', '4'], ['11', '14'], ['11', '25'], ['12', '25'], ['13', '20'], ['14', '29'], ['15', '1'], ['15', '22'],
  ['16', '3'], ['16', '9'], ['16', '18'], ['17', '17'], ['18', '13'], ['18', '21'], ['19', '20'], ['19', '21'], ['20', '5'], ['22', '1'],
  ['22', '6'], ['24', '5-6'], ['25', '11'], ['27', '17'], ['27', '1'], ['28', '13'], ['29', '18'], ['31', '25-26'], ['9', '9-10'], ['16', '24'],
];

function dayOfYear(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

export async function fetchWisdom(day) {
  const [chapter, range] = WISDOM_REFS[dayOfYear(day) % WISDOM_REFS.length];
  const j = await getJson(`https://api.midvash.com/v1/almeida-livre/proverbios/${chapter}/${range}`);
  const data = j && j.data;
  if (!data || !data.text) throw new Error('Provérbio vazio');
  return { reference: `Provérbios ${chapter}:${range}`, text: clip(data.text, 800), credit: clip(j.meta && j.meta.copyright, 600) };
}

export async function fetchHoroscope(signId) {
  const j = await getJson(`https://api.astroway.info/v1/public/horoscope/daily?sign=${encodeURIComponent(signId)}&lang=pt`);
  const text = j && j.ok && j.data && j.data.horoscope;
  if (!text) throw new Error('Horóscopo vazio');
  return { text: clip(String(text).replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n'), 2500) };
}

const AiDaySchema = z.object({
  rat: z.string(), ox: z.string(), tiger: z.string(), rabbit: z.string(), dragon: z.string(), snake: z.string(),
  horse: z.string(), goat: z.string(), monkey: z.string(), rooster: z.string(), dog: z.string(), pig: z.string(),
});

const AI_MODEL = 'claude-haiku-4-5-20251001';
const AI_SYSTEM = `Você escreve o conteúdo leve do dia para o painel de uma consultoria tributária brasileira.
- Um texto por animal do zodíaco chinês (rat, ox, tiger, rabbit, dragon, snake, horse, goat, monkey, rooster, dog, pig): 2 a 3 frases sobre o dia, no tom de horóscopo de entretenimento, baseado nas características tradicionais do animal. Sem promessas, sem conselho financeiro, de saúde ou jurídico.
- Português do Brasil, sem emojis, sem markdown.`;

async function generateAiDay(client, day) {
  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 3000,
    system: AI_SYSTEM,
    messages: [{ role: 'user', content: `Data: ${day}. Escreva o conteúdo de hoje.` }],
    output_config: { format: zodOutputFormat(AiDaySchema) },
  });
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new Error('IA não devolveu o conteúdo do dia');
  logMetric(pool, { orgId: null, projectId: null, eventType: 'anthropic_api_call', metadata: { feature: 'dailyContent', model: AI_MODEL, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } }).catch(() => {});
  return response.parsed_output;
}

async function cacheGet(kind, key, day) {
  const { rows } = await pool.query('SELECT payload FROM daily_content WHERE kind=$1 AND key=$2 AND day=$3', [kind, key, day]);
  return rows[0] ? rows[0].payload : null;
}
async function cachePut(kind, key, day, payload) {
  await pool.query(
    `INSERT INTO daily_content (kind, key, day, payload) VALUES ($1,$2,$3,$4) ON CONFLICT (kind, key, day) DO UPDATE SET payload=EXCLUDED.payload, created_at=now()`,
    [kind, key, day, JSON.stringify(payload)]
  );
}

const inflight = new Map();
const failedAt = new Map();
const RETRY_AFTER_MS = 10 * 60 * 1000;

async function cached(kind, key, day, loader) {
  const hit = await cacheGet(kind, key, day);
  if (hit) return hit;
  const id = `${kind}|${key}|${day}`;
  if (failedAt.has(id) && Date.now() - failedAt.get(id) < RETRY_AFTER_MS) throw new Error('indisponível (nova tentativa em instantes)');
  if (!inflight.has(id)) {
    inflight.set(id, (async () => {
      try {
        const value = await loader();
        await cachePut(kind, key, day, value);
        failedAt.delete(id);
        return value;
      } catch (e) {
        failedAt.set(id, Date.now());
        throw e;
      } finally { inflight.delete(id); }
    })());
  }
  return inflight.get(id);
}

let aiClient = null;
const getAi = () => aiClient || (process.env.ANTHROPIC_API_KEY ? (aiClient = new Anthropic()) : null);
export function setAiClientForTests(c) { aiClient = c; }

async function aiDay(day) {
  const hit = await cacheGet('ai', 'day', day);
  if (hit) return hit;
  return cached('ai', 'day', day, async () => {
    const client = getAi();
    if (!client) throw new Error('IA não configurada');
    return generateAiDay(client, day);
  });
}

export async function loadCard(kind, { day, birthDate }) {
  const title = CARDS[kind];
  try {
    if (kind === 'liturgy') return { kind, title, ok: true, data: await cached('liturgy', 'br', day, () => fetchLiturgy(day)) };
    if (kind === 'votd') return { kind, title, ok: true, data: await cached('votd', 'pt', day, () => fetchVotd()) };
    if (kind === 'wisdom') return { kind, title, ok: true, data: await cached('wisdom', 'pt', day, () => fetchWisdom(day)) };
    if (kind === 'inspiration') { const q = quoteOfDay(day); return { kind, title, ok: true, data: { text: q.text, author: q.author, theme: q.theme, source: q.source, sourceUrl: q.sourceUrl } }; }
    if (kind === 'horoscope') {
      const sign = westernSign(birthDate);
      if (!sign) return { kind, title, ok: false, needsBirth: true };
      const data = await cached('horoscope', sign.id, day, () => fetchHoroscope(sign.id));
      return { kind, title, ok: true, data: { ...data, sign: sign.name } };
    }
    if (kind === 'chinese') {
      const animal = chineseSign(birthDate);
      if (!animal) return { kind, title, ok: false, needsBirth: true };
      const a = await aiDay(day);
      return { kind, title, ok: true, data: { animal: animal.name, element: animal.element, year: animal.year, text: a[animal.id], ai: true } };
    }
    return { kind, title, ok: false, error: 'Conteúdo desconhecido.' };
  } catch (e) {
    console.error(`Meu dia: falha em ${kind}:`, e.message);
    return { kind, title, ok: false, error: 'Indisponível agora. Tente de novo mais tarde.' };
  }
}

export function today() { return todayInSp(); }
