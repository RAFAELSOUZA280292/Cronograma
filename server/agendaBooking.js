// Link público de agendamento (2026-11-02, noite; Rafael: "um link público para minha agenda… parceiros sem ler o nome do
// compromisso, somente saber que está ocupado… marcar um compromisso na agenda do Felipe… obrigatório colocar o e-mail das pessoas
// que também devem estar… selecionar se quer link do Meet"). Cada pessoa liga o PRÓPRIO link (users.preferences.agendaBooking):
// quem abre vê só livre/ocupado (nunca título, local ou convidados) e marca um horário livre; o compromisso é criado no Google do dono
// com os convidados informados e, se pedido, o Meet. Ver PROJECT_CONTEXT §139.

import crypto from 'node:crypto';
import { Router } from 'express';
import { google } from 'googleapis';
import { pool } from './db.js';
import { requireAuth } from './auth.js';
import { clientIp } from './accessLog.js';
import { getAuthedClientForUser, savePanelEvent, googleConfigured } from './googleCalendar.js';
import { createNotification } from './notifications.js';

const DAY = 86400000;
const BR_OFFSET = '-03:00';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const DURATIONS = [15, 30, 45, 60, 90];
// Faixas de horário em que se pode marcar (02/11/2026, pedido do Rafael: "permitir agendamento de até de, e de de até de"). O intervalo
// entre duas faixas é o almoço (ou qualquer pausa). Configuração antiga (dayStart/dayEnd + lunch) vira faixas na leitura.
export const MAX_RANGES = 4;
export const DEFAULTS = { duration: 30, ranges: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '18:00' }], dayStart: '08:00', dayEnd: '18:00', daysAhead: 14, minNoticeHours: 2, weekdays: [1, 2, 3, 4, 5], title: '' };
const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Faixas limpas: HH:MM entre 05:00 e 23:00, início antes do fim (mín. 15 min), em ordem, sobrepostas juntadas, no máximo MAX_RANGES.
export function cleanRanges(list) {
  const r = (Array.isArray(list) ? list : []).map((x) => ({ a: hhmmToMin(x && x.start), z: hhmmToMin(x && x.end) }))
    .filter((x) => Number.isFinite(x.a) && Number.isFinite(x.z) && x.a >= 5 * 60 && x.z <= 23 * 60 && x.z - x.a >= 15)
    .sort((x, y) => x.a - y.a);
  const out = [];
  for (const x of r) { const last = out[out.length - 1]; if (last && x.a <= last.z) last.z = Math.max(last.z, x.z); else out.push({ ...x }); }
  return out.slice(0, MAX_RANGES).map((x) => ({ start: fmtMin(x.a), end: fmtMin(x.z) }));
}
function legacyRanges(b) {
  const a = hhmmToMin(b.dayStart); const z = hhmmToMin(b.dayEnd);
  if (!(Number.isFinite(a) && Number.isFinite(z) && z > a)) return null;
  if (b.lunch === false || a >= 13 * 60 || z <= 12 * 60) return cleanRanges([{ start: b.dayStart, end: b.dayEnd }]);
  return cleanRanges([{ start: b.dayStart, end: '12:00' }, { start: '13:00', end: b.dayEnd }]);
}
export const MAX_GUESTS = 20;
export const newBookingToken = () => crypto.randomBytes(18).toString('base64url'); // 24 caracteres, 144 bits

const pad2 = (n) => String(n).padStart(2, '0');
const hhmmToMin = (s) => { const m = /^(\d{2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
// Data de Brasília (AAAA-MM-DD) e dia da semana de um instante.
export function brDay(ms) {
  const d = new Date(ms - 3 * 3600000);
  return { key: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`, dow: d.getUTCDay() };
}
const brInstant = (dayKey, min) => Date.parse(`${dayKey}T${pad2(Math.floor(min / 60))}:${pad2(min % 60)}:00${BR_OFFSET}`);

// Configuração do link, sempre limpa (o que vier fora do permitido volta ao padrão).
export function cleanSettings(b = {}) {
  const s = { ...DEFAULTS, ranges: DEFAULTS.ranges.map((x) => ({ ...x })) };
  if (DURATIONS.includes(Number(b.duration))) s.duration = Number(b.duration);
  const ranges = b.ranges !== undefined ? cleanRanges(b.ranges) : legacyRanges(b);
  if (ranges && ranges.length) s.ranges = ranges;
  s.dayStart = s.ranges[0].start; s.dayEnd = s.ranges[s.ranges.length - 1].end;
  if ([7, 14, 30, 60].includes(Number(b.daysAhead))) s.daysAhead = Number(b.daysAhead);
  if ([0, 1, 2, 4, 12, 24, 48].includes(Number(b.minNoticeHours))) s.minNoticeHours = Number(b.minNoticeHours);
  if (Array.isArray(b.weekdays)) { const w = [...new Set(b.weekdays.map(Number).filter((d) => d >= 0 && d <= 6))].sort(); if (w.length) s.weekdays = w; }
  if (b.title !== undefined) s.title = String(b.title || '').trim().slice(0, 80);
  return s;
}

// Horários livres por dia (horário de Brasília), sem nada que diga O QUE ocupa a agenda. `busy` = [{ start, end }] em ms.
export function computeSlots({ busy, settings, now }) {
  const s = cleanSettings(settings);
  const dur = s.duration * 60000;
  const step = Math.min(30, s.duration) * 60000;
  const earliest = now + s.minNoticeHours * 3600000;
  const ranges = s.ranges.map((r) => [hhmmToMin(r.start), hhmmToMin(r.end)]);
  const days = [];
  for (let i = 0; i <= s.daysAhead; i += 1) {
    const { key, dow } = brDay(now + i * DAY);
    if (!s.weekdays.includes(dow)) continue;
    const dayBusy = (busy || []).filter((b) => b.end > brInstant(key, 0) && b.start < brInstant(key, 24 * 60));
    const slots = [];
    for (const [a, z] of ranges) {
      for (let t = brInstant(key, a); t + dur <= brInstant(key, z); t += step) {
        if (t < earliest) continue;
        if (dayBusy.some((b) => b.start < t + dur && b.end > t)) continue;
        slots.push(new Date(t).toISOString());
      }
    }
    days.push({ date: key, dow, slots, busy: dayBusy.map((b) => ({ start: new Date(Math.max(b.start, brInstant(key, 0))).toISOString(), end: new Date(Math.min(b.end, brInstant(key, 24 * 60))).toISOString() })) });
  }
  return { duration: s.duration, dayStart: s.dayStart, dayEnd: s.dayEnd, ranges: s.ranges, days };
}

// O que ocupa a agenda do dono, a partir dos eventos do Google: só início e fim. Livre ("Mostrar como: livre"), cancelado e convite
// recusado não ocupam; dia inteiro só ocupa se estiver como "ocupado" no Google.
export function busyFromEvents(items) {
  const out = [];
  for (const ev of items || []) {
    if (!ev || ev.status === 'cancelled' || ev.transparency === 'transparent') continue;
    const self = (ev.attendees || []).find((a) => a && a.self);
    if (self && self.responseStatus === 'declined') continue;
    const s = ev.start && (ev.start.dateTime ? Date.parse(ev.start.dateTime) : Date.parse(`${ev.start.date}T00:00:00${BR_OFFSET}`));
    const e = ev.end && (ev.end.dateTime ? Date.parse(ev.end.dateTime) : Date.parse(`${ev.end.date}T00:00:00${BR_OFFSET}`));
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) out.push({ start: s, end: e });
  }
  return out;
}

// Pedido de quem está marcando. E-mail dos participantes é obrigatório (pelo menos um) e o Meet tem de ser escolhido (sim ou não).
export function parseBooking(b = {}) {
  if (b.website) return { error: 'Pedido recusado.' }; // campo-isca: só robô preenche
  const name = String(b.name || '').trim().slice(0, 80);
  if (name.length < 2) return { error: 'Informe o seu nome.' };
  const subject = String(b.subject || '').trim().slice(0, 120);
  if (subject.length < 2) return { error: 'Informe o assunto da reunião.' };
  const raw = Array.isArray(b.emails) ? b.emails : String(b.emails || '').split(/[,;\s]+/);
  const emails = [...new Set(raw.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return { error: 'Informe o e-mail de quem vai participar (pelo menos um).' };
  const bad = emails.find((e) => !EMAIL.test(e));
  if (bad) return { error: `"${bad}" não parece um e-mail válido.` };
  if (emails.length > MAX_GUESTS) return { error: `No máximo ${MAX_GUESTS} participantes.` };
  if (typeof b.meet !== 'boolean') return { error: 'Escolha se a reunião terá link do Google Meet.' };
  const start = Date.parse(String(b.start || ''));
  if (!Number.isFinite(start)) return { error: 'Escolha um horário.' };
  const note = String(b.note || '').trim().slice(0, 1000);
  return { fields: { name, subject, emails, meet: b.meet, start, note } };
}

// ---------- banco ----------
async function ownerByToken(token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  const { rows } = await pool.query(
    `SELECT id, org_id, name, email, username, preferences->'agendaBooking' AS b FROM users
      WHERE preferences->'agendaBooking'->>'token' = $1 AND COALESCE((preferences->'agendaBooking'->>'enabled')::boolean, false) = true AND COALESCE(blocked, false) = false LIMIT 1`,
    [token],
  );
  return rows[0] || null;
}
export async function readBooking(userId) {
  const { rows } = await pool.query("SELECT preferences->'agendaBooking' AS b FROM users WHERE id=$1", [userId]);
  const b = (rows[0] && rows[0].b) || {};
  return { enabled: !!b.enabled && !!b.token, token: b.token || '', settings: cleanSettings(b.settings || {}) };
}
async function writeBooking(userId, value) {
  await pool.query("UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb), '{agendaBooking}', $1::jsonb, true) WHERE id=$2", [JSON.stringify(value), userId]);
}

// ---------- freio por IP (como os outros links públicos: não é segurança forte, é contra abuso) ----------
const hits = new Map();
setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (t - v.start > v.win) hits.delete(k); }, 60000).unref();
export function limited(key, max, win) {
  const t = Date.now(); const rec = hits.get(key);
  if (!rec || t - rec.start > win) { hits.set(key, { start: t, n: 1, win }); return false; }
  rec.n += 1; return rec.n > max;
}

async function ownerBusy(ownerId, settings, now) {
  const client = await getAuthedClientForUser(ownerId);
  if (!client) return null;
  const calendar = google.calendar({ version: 'v3', auth: client });
  const { data } = await calendar.events.list({ calendarId: 'primary', timeMin: new Date(now).toISOString(), timeMax: new Date(now + (settings.daysAhead + 1) * DAY).toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 500 });
  return busyFromEvents(data.items);
}

const firstName = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).join(' ');

// ---------- rotas do dono (logado) ----------
export const router = Router();
router.get('/', requireAuth, async (req, res, next) => {
  try { res.json(await readBooking(req.user.id)); } catch (e) { next(e); }
});
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const cur = await readBooking(req.user.id);
    const enabled = b.enabled === undefined ? cur.enabled : !!b.enabled;
    if (enabled && !googleConfigured()) return res.status(409).json({ message: 'A integração com o Google não está configurada neste ambiente.' });
    if (enabled && !(await getAuthedClientForUser(req.user.id))) return res.status(409).json({ message: 'Conecte o seu Google (Meu perfil › Agenda) antes de ligar o link de agendamento.' });
    const token = b.regenerate || !cur.token ? newBookingToken() : cur.token;
    const value = { enabled, token, settings: cleanSettings(b.settings === undefined ? cur.settings : b.settings) };
    await writeBooking(req.user.id, value);
    res.json({ enabled: value.enabled, token: value.token, settings: value.settings });
  } catch (e) { next(e); }
});

// ---------- rotas públicas (sem login) ----------
export const publicRouter = Router();
publicRouter.use((req, res, nextFn) => { res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Cache-Control', 'no-store'); nextFn(); });
const GONE = 'Este link de agendamento não existe ou foi desligado.';

publicRouter.get('/:token', async (req, res, next) => {
  try {
    if (limited(`v:${clientIp(req) || '-'}`, 60, 60000)) return res.status(429).json({ message: 'Muitas consultas seguidas. Tente de novo em um minuto.' });
    const owner = await ownerByToken(req.params.token);
    if (!owner) return res.status(404).json({ message: GONE });
    const settings = cleanSettings((owner.b && owner.b.settings) || {});
    const now = Date.now();
    let busy;
    try { busy = await ownerBusy(owner.id, settings, now); } catch (e) { console.error('Agendamento: leitura da agenda do dono falhou', String(e && e.message).slice(0, 160)); busy = null; }
    if (!busy) return res.status(503).json({ message: 'A agenda desta pessoa está indisponível agora. Tente mais tarde ou fale com ela por e-mail.' });
    res.json({ owner: { name: firstName(owner.name) }, title: settings.title, ...computeSlots({ busy, settings, now }) });
  } catch (e) { next(e); }
});

publicRouter.post('/:token/book', async (req, res, next) => {
  try {
    const ip = clientIp(req) || '-';
    if (limited(`f:${ip}`, 40, 3600000)) return res.status(429).json({ message: 'Muitas tentativas seguidas deste endereço. Tente de novo mais tarde.' });
    const owner = await ownerByToken(req.params.token);
    if (!owner) return res.status(404).json({ message: GONE });
    const { error, fields } = parseBooking(req.body);
    if (error) return res.status(400).json({ message: error });
    // Só pedido completo conta no freio de marcações (errar o formulário não bloqueia ninguém).
    if (limited(`b:${ip}`, 5, 3600000)) return res.status(429).json({ message: 'Muitos agendamentos seguidos deste endereço. Tente de novo mais tarde.' });
    if (limited(`t:${req.params.token}`, 30, DAY)) return res.status(429).json({ message: 'Esta agenda recebeu muitos pedidos hoje. Tente amanhã ou fale com a pessoa por e-mail.' });
    const settings = cleanSettings((owner.b && owner.b.settings) || {});
    const now = Date.now();
    const busy = await ownerBusy(owner.id, settings, now);
    if (!busy) return res.status(503).json({ message: 'A agenda desta pessoa está indisponível agora. Tente mais tarde.' });
    // O horário tem de continuar livre AGORA (alguém pode ter marcado no meio do caminho).
    const free = computeSlots({ busy, settings, now }).days.some((d) => d.slots.includes(new Date(fields.start).toISOString()));
    if (!free) return res.status(409).json({ message: 'Esse horário acabou de ser ocupado. Escolha outro.', code: 'slot_taken' });
    const startISO = new Date(fields.start).toISOString();
    const endISO = new Date(fields.start + settings.duration * 60000).toISOString();
    const ownerEmail = String(owner.email || owner.username || '').toLowerCase();
    const description = [`Marcada pelo link de agendamento por ${fields.name}.`, `Participantes informados: ${fields.emails.join(', ')}.`, fields.note ? `\nMensagem: ${fields.note}` : ''].filter(Boolean).join('\n');
    const ev = await savePanelEvent(owner.id, null, {
      title: `${settings.title ? `${settings.title}: ` : ''}${fields.subject}`, startISO, endISO, location: '', description,
      attendees: fields.emails.filter((e) => e !== ownerEmail), meet: fields.meet, reminderMinutes: null,
    });
    try {
      await createNotification(pool, {
        orgId: owner.org_id, userId: owner.id, type: 'agenda_booking', title: `${fields.name} marcou um horário com você`,
        body: `${fields.subject} — ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(startISO))}${fields.meet ? ' (com Meet)' : ''}`,
        actorName: fields.name, target: { kind: 'agenda_event', eventId: ev.id, start: startISO },
      });
    } catch (e) { console.error('Agendamento: aviso ao dono falhou (o compromisso foi criado)', e.message); }
    res.status(201).json({ start: startISO, end: endISO, meetLink: ev.meetLink || '', owner: firstName(owner.name) });
  } catch (e) {
    console.error('Agendamento: falha ao marcar', String(e && e.message).slice(0, 200));
    if (e && e.status === 409) return res.status(503).json({ message: 'A agenda desta pessoa está indisponível agora. Tente mais tarde.' });
    next(e);
  }
});
