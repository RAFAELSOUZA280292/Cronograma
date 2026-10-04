const TZ = 'America/Sao_Paulo';

function validTs(v) {
  if (typeof v !== 'string' || !v) return null;
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

const SAME_EVENT_MS = 3000;
const HISTORY_OPEN = /^Tarefa (criada|duplicada)$/;
const CLOSE_TEXT = '(?:Marcada como concluída|Status alterado: (?:.+ → )?Concluída)';
const HISTORY_CLOSE = new RegExp(`^${CLOSE_TEXT}$`);
const LOG_OPEN = /^Tarefa criada: ".*"$/;
const LOG_CLOSE = new RegExp(`^".*" — ${CLOSE_TEXT}$`);

function collapse(events) {
  const sorted = [...events].sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const out = [];
  for (const e of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.cardId === e.cardId && prev.kind === e.kind && Date.parse(e.at) - Date.parse(prev.at) < SAME_EVENT_MS) continue;
    out.push(e);
  }
  return out;
}

export function cardEventsOf(data) {
  const cardEvents = [];
  const logEvents = [];
  let withoutOpenDate = 0;
  let closedWithoutDate = 0;
  for (const board of (data && data.boards) || []) {
    for (const col of board.columns || []) {
      for (const card of col.cards || []) {
        if (!card || !card.id) continue;
        let hasOpen = false;
        let hasClose = false;
        const add = (kind, at) => {
          cardEvents.push({ cardId: card.id, kind, at, loose: false });
          if (kind === 'opened') hasOpen = true; else hasClose = true;
        };
        const created = validTs(card.createdAt);
        if (created) add('opened', created);
        if (card.completed) {
          const closed = validTs(card.completedAt);
          if (closed) add('closed', closed);
        }
        for (const h of Array.isArray(card.history) ? card.history : []) {
          const at = h && validTs(h.ts);
          if (!at || typeof h.action !== 'string') continue;
          if (HISTORY_OPEN.test(h.action)) add('opened', at);
          else if (HISTORY_CLOSE.test(h.action)) add('closed', at);
        }
        if (!hasOpen) withoutOpenDate += 1;
        if (card.completed && !hasClose) closedWithoutDate += 1;
      }
    }
    for (const l of Array.isArray(board.log) ? board.log : []) {
      const at = l && validTs(l.ts);
      if (!at || typeof l.action !== 'string') continue;
      if (LOG_OPEN.test(l.action)) logEvents.push({ cardId: `log:${at}:o`, kind: 'opened', at, loose: true });
      else if (LOG_CLOSE.test(l.action)) logEvents.push({ cardId: `log:${at}:c`, kind: 'closed', at, loose: true });
    }
  }
  const events = collapse(cardEvents);
  const near = (kind, at) => events.some((e) => e.kind === kind && Math.abs(Date.parse(e.at) - Date.parse(at)) < SAME_EVENT_MS);
  const fromLog = [];
  for (const e of logEvents.sort((a, b) => (a.at < b.at ? -1 : 1))) {
    if (near(e.kind, e.at)) continue;
    const prev = fromLog[fromLog.length - 1];
    if (prev && prev.kind === e.kind && Date.parse(e.at) - Date.parse(prev.at) < SAME_EVENT_MS) continue;
    fromLog.push(e);
  }
  return { events: [...events, ...fromLog], withoutOpenDate, closedWithoutDate };
}

export async function syncCardEvents(pool, userId, data) {
  try {
    const { events } = cardEventsOf(data);
    if (!events.length) return;
    const res = await pool.query(
      `INSERT INTO personal_card_events (user_id, card_id, kind, occurred_at)
       SELECT $1, t.card_id, t.kind, t.at
       FROM unnest($2::text[], $3::text[], $4::timestamptz[], $5::boolean[]) AS t(card_id, kind, at, loose)
       WHERE NOT EXISTS (
         SELECT 1 FROM personal_card_events e
         WHERE e.user_id = $1 AND e.kind = t.kind
           AND e.occurred_at BETWEEN t.at - interval '3 seconds' AND t.at + interval '3 seconds'
           AND (t.loose OR e.card_id = t.card_id)
       )
       ON CONFLICT DO NOTHING`,
      [userId, events.map((e) => e.cardId), events.map((e) => e.kind), events.map((e) => e.at), events.map((e) => e.loose)],
    );
    if (res.rowCount >= 5) console.log(`Indicadores: ${res.rowCount} evento(s) novo(s) registrados para ${userId}`);
  } catch (e) {
    console.error('Indicadores: falha ao registrar eventos de atividade', e.message);
  }
}

export async function getActivityStats(pool, userId, days) {
  const periodDays = Number.isInteger(days) && days > 0 ? days : null;
  const { rows } = await pool.query(
    `SELECT kind,
            EXTRACT(DOW FROM occurred_at AT TIME ZONE $2)::int AS dow,
            EXTRACT(DAY FROM occurred_at AT TIME ZONE $2)::int AS dom,
            count(*)::int AS n
     FROM personal_card_events
     WHERE user_id=$1 AND ($3::int IS NULL OR occurred_at >= now() - ($3::int * interval '1 day'))
     GROUP BY kind, dow, dom`,
    [userId, TZ, periodDays],
  );
  const mk = (len) => ({ opened: Array(len).fill(0), closed: Array(len).fill(0) });
  const weekday = mk(7);
  const monthDay = mk(31);
  let opened = 0;
  let closed = 0;
  for (const r of rows) {
    if (r.kind !== 'opened' && r.kind !== 'closed') continue;
    weekday[r.kind][r.dow] += r.n;
    monthDay[r.kind][r.dom - 1] += r.n;
    if (r.kind === 'opened') opened += r.n; else closed += r.n;
  }
  const { rows: first } = await pool.query('SELECT min(occurred_at) AS first FROM personal_card_events WHERE user_id=$1', [userId]);
  const firstEventAt = first[0] && first[0].first ? first[0].first.toISOString() : null;

  const { rows: span } = await pool.query(
    `SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS today,
            to_char(CASE WHEN $3::int IS NOT NULL THEN (now() AT TIME ZONE $1)::date - ($3::int - 1)
                         ELSE COALESCE((SELECT min(occurred_at AT TIME ZONE $1)::date FROM personal_card_events WHERE user_id=$2), (now() AT TIME ZONE $1)::date) END, 'YYYY-MM-DD') AS from_day`,
    [TZ, userId, periodDays],
  );
  const { today, from_day: fromDay } = span[0];
  const { rows: cal } = await pool.query(
    `SELECT EXTRACT(DOW FROM d)::int AS dow, EXTRACT(DAY FROM d)::int AS dom
     FROM generate_series($1::date, $2::date, interval '1 day') AS d`,
    [fromDay, today],
  );
  const weekdayDays = Array(7).fill(0);
  const monthDayDays = Array(31).fill(0);
  for (const r of cal) { weekdayDays[r.dow] += 1; monthDayDays[r.dom - 1] += 1; }

  return { opened, closed, weekday, monthDay, firstEventAt, today, fromDay, totalDays: cal.length, weekdayDays, monthDayDays };
}

const WINDOW_DAYS = 30;

function titlesOf(data) {
  const map = new Map();
  for (const board of (data && data.boards) || []) {
    for (const col of board.columns || []) {
      for (const card of col.cards || []) if (card && card.id) map.set(card.id, card.title || '');
    }
  }
  return map;
}

export async function getDayDetail(pool, userId, date, data) {
  const { rows: events } = await pool.query(
    `SELECT card_id, kind, occurred_at FROM personal_card_events
     WHERE user_id=$1 AND (occurred_at AT TIME ZONE $2)::date = $3::date
     ORDER BY occurred_at`,
    [userId, TZ, date],
  );
  const { rows: win } = await pool.query(
    `SELECT to_char(occurred_at AT TIME ZONE $2, 'YYYY-MM-DD') AS d, kind, count(*)::int AS n
     FROM personal_card_events
     WHERE user_id=$1
       AND (occurred_at AT TIME ZONE $2)::date BETWEEN $3::date - ($4::int - 1) AND $3::date
     GROUP BY d, kind`,
    [userId, TZ, date, WINDOW_DAYS],
  );
  const { rows: days } = await pool.query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS d FROM generate_series($1::date - ($2::int - 1), $1::date, interval '1 day') AS d`,
    [date, WINDOW_DAYS],
  );
  const byDay = new Map(days.map((r) => [r.d, { d: r.d, opened: 0, closed: 0 }]));
  for (const r of win) if (byDay.has(r.d) && (r.kind === 'opened' || r.kind === 'closed')) byDay.get(r.d)[r.kind] = r.n;
  const titles = titlesOf(data);
  return {
    date,
    window: [...byDay.values()],
    events: events
      .filter((e) => e.kind === 'opened' || e.kind === 'closed')
      .map((e) => ({ cardId: e.card_id, kind: e.kind, at: e.occurred_at.toISOString(), title: titles.has(e.card_id) ? titles.get(e.card_id) : null })),
  };
}
