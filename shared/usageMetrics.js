// Núcleo de cálculo da Central de Inteligência Operacional. Funções PURAS (sem banco, sem relógio global), testadas em
// scripts/usage-metrics.test.mjs. Regra de ouro do módulo: todo número sai com a sua BASE.
//   real         = medido pelo rastreador do app (fatias de uso com tempo conectado e tempo com interação)
//   estimado     = calculado a partir de eventos que já existiam (acessos, log de projetos, cartões, RENATA…)
//   indisponivel = não há evidência confiável
// Tempo conectado NÃO é produtividade: o índice de atividade mede só quanto do tempo conectado teve interação.

export const TZ = 'America/Sao_Paulo';
export const SESSION_GAP_S = 30 * 60;     // sessões separadas por mais de 30 min sem evidência
export const ESTIMATE_CAP_S = 5 * 60;     // na estimativa, um intervalo entre dois eventos vale no máximo 5 min
export const ESTIMATE_TAIL_S = 60;        // e o último evento de cada sessão vale 1 min

export const BASIS = { real: 'real', estimado: 'estimado', indisponivel: 'indisponivel' };

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });
const dowFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const dayOf = (ms) => dayFmt.format(new Date(ms));
export const hourOf = (ms) => Number(hourFmt.format(new Date(ms))) % 24;
export const dowOf = (ms) => DOW[dowFmt.format(new Date(ms))];

// ---------- Sessões e tempo estimado (a partir de eventos de evidência) ----------

// timestamps (ms) → sessões [{start,end,count}], separadas por lacunas maiores que gapS.
export function sessionize(timestamps, gapS = SESSION_GAP_S) {
  const ts = [...timestamps].filter(Number.isFinite).sort((a, b) => a - b);
  const out = [];
  for (const t of ts) {
    const cur = out[out.length - 1];
    if (cur && (t - cur.end) / 1000 <= gapS) { cur.end = t; cur.count += 1; } else out.push({ start: t, end: t, count: 1 });
  }
  return out;
}

// Estimativa de tempo ativo: soma dos intervalos entre eventos seguidos da mesma sessão (cada um limitado a capS) + uma cauda
// por sessão. É a mesma ideia dos contadores de "heartbeat": quem fez algo há 2 min estava lá; quem fez há 40 min, não sabemos.
export function estimateActiveSeconds(timestamps, { gapS = SESSION_GAP_S, capS = ESTIMATE_CAP_S, tailS = ESTIMATE_TAIL_S } = {}) {
  const ts = [...timestamps].filter(Number.isFinite).sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < ts.length; i += 1) {
    const next = ts[i + 1];
    const delta = next === undefined ? Infinity : (next - ts[i]) / 1000;
    total += delta <= gapS ? Math.min(delta, capS) : tailS;
  }
  return Math.round(total);
}

// ---------- Fatias medidas (tempo real) ----------

// slices: [{at(ms), connectedS, activeS, module, view, projectId}] → totais, por dia, módulo, tela e projeto.
export function summarizeSlices(slices) {
  const out = { connectedS: 0, activeS: 0, idleS: 0, days: {}, modules: {}, views: {}, projects: {}, hours: Array.from({ length: 7 }, () => Array(24).fill(0)) };
  for (const s of slices) {
    const connected = Math.max(0, s.connectedS | 0); const active = Math.min(connected, Math.max(0, s.activeS | 0));
    out.connectedS += connected; out.activeS += active;
    const d = dayOf(s.at); out.days[d] = out.days[d] || { connectedS: 0, activeS: 0 }; out.days[d].connectedS += connected; out.days[d].activeS += active;
    const m = s.module || 'outros'; out.modules[m] = (out.modules[m] || 0) + active;
    const v = `${m}:${s.view || '-'}`; out.views[v] = (out.views[v] || 0) + active;
    if (s.projectId) out.projects[s.projectId] = (out.projects[s.projectId] || 0) + active;
    out.hours[dowOf(s.at)][hourOf(s.at)] += active;
  }
  out.idleS = out.connectedS - out.activeS;
  return out;
}

// Índice de atividade = tempo com interação ÷ tempo conectado (só onde há medição). Não é produtividade.
export function activityIndex(connectedS, activeS) {
  return connectedS > 0 ? Math.round((activeS / connectedS) * 100) : null;
}

// ---------- Combinação real + estimado por dia ----------

// slicesDays: { 'YYYY-MM-DD': {connectedS, activeS} } (medido). evidenceTs: ms[] de eventos de evidência (estimativa).
// Dia com fatia medida usa o medido (real); dia só com evidência usa a estimativa; sem nada = indisponível (não entra).
export function combineDays(slicesDays, evidenceTs, opts) {
  const byDay = {};
  for (const t of evidenceTs) (byDay[dayOf(t)] = byDay[dayOf(t)] || []).push(t);
  const days = Object.keys({ ...slicesDays, ...byDay }).sort();
  const rows = days.map((date) => {
    const real = slicesDays[date];
    if (real && real.connectedS > 0) return { date, basis: BASIS.real, connectedS: real.connectedS, activeS: real.activeS };
    const est = byDay[date];
    if (est && est.length) {
      const sessions = sessionize(est, opts && opts.gapS);
      return { date, basis: BASIS.estimado, connectedS: null, activeS: estimateActiveSeconds(est, opts), sessions: sessions.length, first: Math.min(...est), last: Math.max(...est) };
    }
    return { date, basis: BASIS.indisponivel, connectedS: null, activeS: null };
  });
  const sum = (b, k) => rows.filter((r) => r.basis === b).reduce((a, r) => a + (r[k] || 0), 0);
  return {
    rows,
    realActiveS: sum(BASIS.real, 'activeS'), realConnectedS: sum(BASIS.real, 'connectedS'),
    estimatedActiveS: sum(BASIS.estimado, 'activeS'),
    realDays: rows.filter((r) => r.basis === BASIS.real).length, estimatedDays: rows.filter((r) => r.basis === BASIS.estimado).length,
  };
}

// ---------- Mapa de calor (dia da semana × hora) ----------

export function heatFromTimestamps(timestamps) {
  const m = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const t of timestamps) m[dowOf(t)][hourOf(t)] += 1;
  return m;
}

// ---------- Geografia ----------

export function haversineKm(a, b) {
  const R = 6371; const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function maskIp(ip) {
  const s = String(ip || '');
  if (!s) return '';
  if (s.includes(':')) return `${s.split(':').slice(0, 3).join(':')}:••••`;
  const p = s.split('.');
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.•••` : s;
}

// Agrupa acessos por local aproximado (centro da cidade informado pelo IP). NUNCA é coordenada exata.
export function aggregateMap(events) {
  const pts = new Map();
  let withoutCoords = 0;
  for (const e of events) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) { withoutCoords += 1; continue; }
    const key = `${e.lat.toFixed(2)},${e.lng.toFixed(2)}`;
    const p = pts.get(key) || { lat: Number(e.lat.toFixed(2)), lng: Number(e.lng.toFixed(2)), city: e.city, region: e.region, country: e.country, count: 0, users: {}, firstAt: e.at, lastAt: e.at, devices: {} };
    p.count += 1; p.firstAt = Math.min(p.firstAt, e.at); p.lastAt = Math.max(p.lastAt, e.at);
    const u = p.users[e.userId] || { id: e.userId, name: e.userName || '', count: 0 }; u.count += 1; p.users[e.userId] = u;
    if (e.device) p.devices[e.device] = (p.devices[e.device] || 0) + 1;
    pts.set(key, p);
  }
  return { points: [...pts.values()].map((p) => ({ ...p, users: Object.values(p.users).sort((a, b) => b.count - a.count), devices: Object.entries(p.devices).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) })).sort((a, b) => b.count - a.count), withoutCoords };
}

// ---------- Alertas de comportamento atípico ----------

const PRESENCE = new Set(['login', 'visit', 'first_use']);
const sev = { alta: 3, media: 2, baixa: 1 };

// events: [{userId,userName,kind,at(ms),ip,city,region,country,lat,lng,device}], now(ms). Janela recente = últimos recentDays;
// o histórico anterior é a linha de base do próprio usuário. Cada alerta traz a evidência e o motivo (regra explícita, sem caixa preta).
export function detectAlerts(events, now, { recentDays = 30, baselineMin = 5 } = {}) {
  const cutoff = now - recentDays * 86400000;
  const byUser = new Map();
  for (const e of events) { const l = byUser.get(e.userId) || []; l.push(e); byUser.set(e.userId, l); }
  const alerts = [];
  const push = (a) => alerts.push({ severity: 'baixa', ...a });
  const place = (e) => [e.city, e.region, e.country].filter(Boolean).join(', ') || 'local não identificado';

  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.at - b.at);
    const presence = list.filter((e) => PRESENCE.has(e.kind));
    const base = presence.filter((e) => e.at < cutoff); const recent = presence.filter((e) => e.at >= cutoff);
    const name = (list[0] && list[0].userName) || userId;
    if (base.length >= baselineMin) {
      const countries = new Set(base.map((e) => e.country).filter(Boolean));
      const cities = new Set(base.map((e) => `${e.city}|${e.region}|${e.country}`).filter((k) => k !== '||'));
      const devices = new Set(base.map((e) => e.device).filter(Boolean));
      const seenCountry = new Set(); const seenCity = new Set(); const seenDevice = new Set();
      for (const e of recent) {
        if (e.country && !countries.has(e.country) && !seenCountry.has(e.country)) { seenCountry.add(e.country); push({ id: `pais:${userId}:${e.country}`, userId, userName: name, rule: 'novo_pais', severity: 'alta', at: e.at, title: 'Acesso de um país nunca usado antes', detail: `${name} acessou de ${place(e)}. Nos acessos anteriores só aparecem: ${[...countries].join(', ')}.`, evidence: [e] }); }
        const ck = `${e.city}|${e.region}|${e.country}`;
        if (e.city && e.country && countries.has(e.country) && !cities.has(ck) && !seenCity.has(ck)) { seenCity.add(ck); push({ id: `cidade:${userId}:${ck}`, userId, userName: name, rule: 'nova_cidade', severity: 'media', at: e.at, title: 'Acesso de uma cidade nova', detail: `${name} acessou de ${place(e)}, local que não aparecia no histórico dele.`, evidence: [e] }); }
        if (e.device && !devices.has(e.device) && !seenDevice.has(e.device) && base.length >= 10) { seenDevice.add(e.device); push({ id: `disp:${userId}:${e.device}`, userId, userName: name, rule: 'novo_dispositivo', severity: 'baixa', at: e.at, title: 'Novo dispositivo ou navegador', detail: `${name} usou ${e.device}, combinação inédita no histórico.`, evidence: [e] }); }
      }
    }
    // Viagem impossível: dois acessos em locais distantes com velocidade implausível (centro da cidade, margem de erro grande).
    for (let i = 1; i < presence.length; i += 1) {
      const a = presence[i - 1]; const b = presence[i];
      if (b.at < cutoff || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) continue;
      const km = haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }); const hours = Math.max((b.at - a.at) / 3600000, 1 / 60);
      if (km >= 300 && km / hours > 900) push({ id: `viagem:${userId}:${b.at}`, userId, userName: name, rule: 'viagem_impossivel', severity: 'alta', at: b.at, title: 'Dois locais distantes em pouco tempo', detail: `${name}: ${place(a)} e ${place(b)} (${Math.round(km)} km) com ${Math.round(hours * 60)} min de diferença. Pode ser VPN ou rede móvel; confirme com a pessoa.`, evidence: [a, b] });
    }
    // Falhas de login em sequência.
    const fails = list.filter((e) => e.kind === 'login_failed' && e.at >= cutoff);
    for (let i = 0; i < fails.length; i += 1) {
      const win = fails.filter((f) => f.at >= fails[i].at && f.at - fails[i].at <= 86400000);
      if (win.length >= 3) { push({ id: `falhas:${userId}:${fails[i].at}`, userId, userName: name, rule: 'falhas_login', severity: win.length >= 5 ? 'alta' : 'media', at: win[win.length - 1].at, title: `${win.length} tentativas de login com senha errada em 24 h`, detail: `${name}: ${win.length} falhas desde ${new Date(fails[i].at).toISOString().slice(0, 16).replace('T', ' ')} UTC, de ${[...new Set(win.map((f) => f.ip).filter(Boolean))].map(maskIp).join(', ') || 'IP desconhecido'}.`, evidence: win }); break; }
    }
    // Vários IPs em 1 hora.
    for (let i = 0; i < recent.length; i += 1) {
      const win = recent.filter((e) => e.at >= recent[i].at && e.at - recent[i].at <= 3600000);
      const ips = [...new Set(win.map((e) => e.ip).filter(Boolean))];
      if (ips.length >= 3) { push({ id: `ips:${userId}:${recent[i].at}`, userId, userName: name, rule: 'varios_ips', severity: 'media', at: win[win.length - 1].at, title: `${ips.length} IPs diferentes em 1 hora`, detail: `${name} apareceu com ${ips.map(maskIp).join(', ')}. Pode ser troca de rede; vale conferir.`, evidence: win }); break; }
    }
    // Madrugada fora do padrão (só com histórico suficiente).
    if (base.length >= 20) {
      const night = (e) => hourOf(e.at) < 5;
      const share = base.filter(night).length / base.length;
      const odd = recent.filter(night);
      if (share < 0.05 && odd.length) push({ id: `madrugada:${userId}:${odd[0].at}`, userId, userName: name, rule: 'horario_atipico', severity: 'baixa', at: odd[odd.length - 1].at, title: 'Acessos de madrugada fora do padrão', detail: `${name} teve ${odd.length} acesso(s) entre 0h e 5h, faixa que representa ${Math.round(share * 100)}% do histórico dele.`, evidence: odd.slice(0, 5) });
    }
  }
  // Mesmo IP falhando em vários usuários (ataque de tentativa).
  const failByIp = new Map();
  for (const e of events) if (e.kind === 'login_failed' && e.at >= cutoff && e.ip) { const s = failByIp.get(e.ip) || new Set(); s.add(e.userId); failByIp.set(e.ip, s); }
  for (const [ip, users] of failByIp) if (users.size >= 3) push({ id: `ip-varios-usuarios:${ip}`, userId: '', userName: '', rule: 'ip_varios_usuarios', severity: 'alta', at: now, title: 'Um IP errou a senha de vários usuários', detail: `O IP ${maskIp(ip)} falhou o login em ${users.size} contas diferentes.`, evidence: [] });
  return alerts.sort((a, b) => sev[b.severity] - sev[a.severity] || b.at - a.at);
}

// ---------- Comparativos ----------

export function pctChange(now, before) {
  if (!Number.isFinite(now) || !Number.isFinite(before)) return null;
  if (before === 0) return now === 0 ? 0 : null;
  return Math.round(((now - before) / before) * 100);
}
