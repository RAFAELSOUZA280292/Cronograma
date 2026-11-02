// Regras do formulário de compromisso da Agenda (criar e editar) e da proposta de novo horário — puras, testadas em
// scripts/agenda-invite.test.mjs. Horário sempre de Brasília (-03:00, sem horário de verão desde 2019).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_GUESTS = 30;
export const REMINDERS = [-1, 0, 5, 10, 15, 30, 60, 120, 1440];

export function brInstant(date, time) {
  return new Date(`${date}T${time}:00-03:00`);
}

// "2026-11-04T17:30:00.000Z" → "qua., 4 de nov., 14:30–15:30" (Brasília).
export function fmtBrRange(startISO, endISO) {
  const s = new Date(startISO); const e = new Date(endISO);
  if (Number.isNaN(s.getTime())) return '';
  const day = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: 'numeric', month: 'short' }).format(s);
  const hm = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(d);
  return Number.isNaN(e.getTime()) ? `${day}, ${hm(s)}` : `${day}, ${hm(s)}–${hm(e)}`;
}

// Valida o corpo de POST/PATCH /api/agenda/events. Devolve { error } ou { fields } pronto para o Google.
export function parseEventForm(b) {
  const body = b || {};
  const title = String(body.title || '').trim().slice(0, 200);
  if (!title) return { error: 'Dê um título ao compromisso.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))) return { error: 'Informe a data do compromisso.' };
  if (!/^\d{2}:\d{2}$/.test(String(body.startTime || ''))) return { error: 'Informe a hora de início.' };
  const minutes = Number(body.durationMinutes || 60);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 12 * 60) return { error: 'A duração precisa ficar entre 5 minutos e 12 horas.' };
  const start = brInstant(body.date, body.startTime);
  if (Number.isNaN(start.getTime())) return { error: 'Data ou hora inválida.' };
  const attendees = [...new Set((Array.isArray(body.attendees) ? body.attendees : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  const bad = attendees.find((e) => !EMAIL.test(e));
  if (bad) return { error: `"${bad}" não parece um e-mail válido.` };
  if (attendees.length > MAX_GUESTS) return { error: `No máximo ${MAX_GUESTS} convidados.` };
  let reminderMinutes = null;
  if (body.reminderMinutes !== undefined && body.reminderMinutes !== null && body.reminderMinutes !== '') {
    reminderMinutes = Number(body.reminderMinutes);
    if (!REMINDERS.includes(reminderMinutes)) return { error: 'Lembrete inválido.' };
  }
  let colorId;
  if (body.colorId !== undefined && body.colorId !== null) {
    colorId = String(body.colorId);
    if (colorId && !/^(?:[1-9]|1[01])$/.test(colorId)) return { error: 'Cor inválida.' };
  }
  return {
    fields: {
      ...(colorId !== undefined ? { colorId } : {}),
      title,
      startISO: start.toISOString(),
      endISO: new Date(start.getTime() + minutes * 60000).toISOString(),
      location: String(body.location || '').slice(0, 300),
      description: String(body.description || '').slice(0, 4000),
      attendees,
      meet: !!body.meet,
      reminderMinutes,
    },
  };
}

// Novo horário (proposta ou aceite de proposta): { start, end } ISO, fim depois do início, no máximo 12 h.
export function parseRange(b) {
  const s = Date.parse(String((b || {}).start || ''));
  const e = Date.parse(String((b || {}).end || ''));
  if (Number.isNaN(s) || Number.isNaN(e)) return { error: 'Informe o novo horário.' };
  if (e <= s) return { error: 'O fim precisa ser depois do início.' };
  if (e - s > 12 * 3600000) return { error: 'A reunião pode ter no máximo 12 horas.' };
  return { startISO: new Date(s).toISOString(), endISO: new Date(e).toISOString() };
}

// Nota que vai ao organizador quando você propõe outro horário (aparece na resposta do convite no Google e no Outlook).
export function proposalComment(startISO, endISO, note) {
  const extra = String(note || '').trim().slice(0, 300);
  return `Proposta de novo horário: ${fmtBrRange(startISO, endISO)} (horário de Brasília).${extra ? ` ${extra}` : ''}`;
}

// Nenhuma fonte da Agenda pode segurar a tela para sempre (02/11/2026: a agenda do Rafael ficou "processando infinitamente").
// Cada leitura externa tem prazo; a que estourar vira aviso na tela e o resto aparece normalmente.
export function withDeadline(p, ms, label) {
  let timer;
  const late = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error(`${label} demorou mais de ${Math.round(ms / 1000)} s para responder.`), { deadline: true })), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
