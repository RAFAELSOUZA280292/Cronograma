// Funções puras do painel "Calendário, anotações e atalhos" (2026-10-16, visões 5 e 6). Sem React/DOM para poder testar em Node.

const pad = (n) => String(n).padStart(2, '0');
export const isoOfDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 6 semanas (42 dias), domingo a sábado, cobrindo o mês (year, month 0-11). Cada dia: { iso, day, inMonth }.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const out = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push({ iso: isoOfDate(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return out;
}

// Dia local (YYYY-MM-DD) de um evento da Agenda: dia inteiro vem só com a data; com horário vem ISO e vale o dia no fuso de quem vê.
export function eventDay(ev) {
  const s = ev && ev.start ? String(ev.start) : '';
  if (!s) return '';
  if (s.length <= 10) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : isoOfDate(d);
}

export function eventTime(ev) {
  const s = ev && ev.start ? String(ev.start) : '';
  if (s.length <= 10 || ev.allDay) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Reunião/compromisso recusado não conta (mesma regra da Agenda: só o que a pessoa não recusou).
export const eventCounts = (ev) => !!ev && ev.myResponse !== 'declined';

// Mapa dia → { due: [item], overdue: [item], events: [ev] }. `items` = { boardId, colId, card } de cartões vivos; só cartões NÃO concluídos com prazo.
export function buildDayMap(items, events, todayIso) {
  const map = {};
  const slot = (iso) => map[iso] || (map[iso] = { due: [], overdue: [], events: [] });
  for (const it of items || []) {
    const c = it.card;
    if (!c || c.completed || !c.dueDate) continue;
    (c.dueDate < todayIso ? slot(c.dueDate).overdue : slot(c.dueDate).due).push(it);
  }
  for (const ev of events || []) {
    if (!eventCounts(ev)) continue;
    const iso = eventDay(ev);
    if (iso) slot(iso).events.push(ev);
  }
  for (const k of Object.keys(map)) map[k].events.sort((a, b) => eventTime(a).localeCompare(eventTime(b)) || String(a.title).localeCompare(String(b.title), 'pt-BR'));
  return map;
}

// Título e descrição de uma atividade criada a partir da anotação (HTML sanitizado do editor): título = primeira linha de texto (até 120
// caracteres); a descrição leva o resto — se a nota é só uma linha, não há descrição.
export function splitNote(html, plainText) {
  const plain = String(plainText || '').trim();
  const lines = plain.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { title: '', desc: '' };
  const title = lines[0].slice(0, 120);
  if (lines.length === 1) return { title, desc: '' };
  const h = String(html || '');
  const firstP = h.match(/^\s*<p>([\s\S]*?)<\/p>/i);
  const firstPlain = firstP ? firstP[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
  const desc = firstP && firstPlain === lines[0] ? h.slice(firstP[0].length).trim() : h;
  return { title, desc };
}

// Mesma regra do servidor (server/personalExtras.js): só http/https; sem esquema assume https. Devolve a URL ou ''.
export function cleanUrl(raw) {
  let s = String(raw || '').trim();
  if (!s || s.length > 500) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname || u.username || u.password) return '';
    return u.toString();
  } catch { return ''; }
}
