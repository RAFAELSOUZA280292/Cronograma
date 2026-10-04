const TZ = 'America/Sao_Paulo';

function validTs(v) {
  if (typeof v !== 'string' || !v) return null;
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export function cardEventsOf(data) {
  const events = [];
  let withoutOpenDate = 0;
  let closedWithoutDate = 0;
  for (const board of (data && data.boards) || []) {
    for (const col of board.columns || []) {
      for (const card of col.cards || []) {
        if (!card || !card.id) continue;
        const opened = validTs(card.createdAt);
        if (opened) events.push({ cardId: card.id, kind: 'opened', at: opened });
        else withoutOpenDate += 1;
        if (card.completed) {
          const closed = validTs(card.completedAt);
          if (closed) events.push({ cardId: card.id, kind: 'closed', at: closed });
          else closedWithoutDate += 1;
        }
      }
    }
  }
  return { events, withoutOpenDate, closedWithoutDate };
}

export async function syncCardEvents(pool, userId, data) {
  try {
    const { events } = cardEventsOf(data);
    if (!events.length) return;
    await pool.query(
      `INSERT INTO personal_card_events (user_id, card_id, kind, occurred_at)
       SELECT $1, t.card_id, t.kind, t.at
       FROM unnest($2::text[], $3::text[], $4::timestamptz[]) AS t(card_id, kind, at)
       ON CONFLICT DO NOTHING`,
      [userId, events.map((e) => e.cardId), events.map((e) => e.kind), events.map((e) => e.at)],
    );
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
