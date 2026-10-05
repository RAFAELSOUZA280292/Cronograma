// Script do Scriptable (iOS) colado pelo usuário — mostra atrasadas, vencem hoje e próxima reunião.
// O token e o endereço entram já preenchidos; o resto é fixo. Sem template literal dentro do script
// para não brigar com o template deste arquivo.
const TEMPLATE = String.raw`// PRICETAX — widget do iPhone. Gerado em "Meu perfil > Widget do iPhone".
// Este script mostra a visão escolhida no painel (Meu perfil > iPhone). Cada visão tem o seu próprio script:
// cole um por widget. Se preferir um script só, apague o nome da visão acima e use Editar Widget > Parameter.
const BASE = __BASE__;
const TOKEN = __TOKEN__;
const VIEW = __VIEW__;

const BG = new Color("#0B0B1E");
const TEXT = new Color("#FFFFFF");
const MUTED = new Color("#9CA3C0");
const YELLOW = new Color("#FFD400");
const RED = new Color("#FF6B6B");
const ORANGE = new Color("#FF9F40");
const GREEN = new Color("#3ECF6E");

const PARAM = (((args && args.widgetParameter) || VIEW) || "").toString().trim();
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "pricetax-widget-" + encodeURIComponent(PARAM.toLowerCase() || "padrao") + ".json");

async function load() {
  try {
    const req = new Request(BASE + "/api/widget/summary?view=" + encodeURIComponent(PARAM));
    req.headers = { Authorization: "Bearer " + TOKEN };
    req.timeoutInterval = 15;
    const data = await req.loadJSON();
    if (req.response && req.response.statusCode === 200 && data && data.generatedAt) {
      fm.writeString(cachePath, JSON.stringify(data));
      return { data: data, stale: false };
    }
    if (req.response && (req.response.statusCode === 401 || req.response.statusCode === 403)) return { error: "Token inválido ou revogado. Gere outro em Meu perfil." };
  } catch (e) {}
  if (fm.fileExists(cachePath)) {
    try { return { data: JSON.parse(fm.readString(cachePath)), stale: true }; } catch (e) {}
  }
  return { error: "Sem conexão com o painel." };
}

function hhmm(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function dayLabel(iso, todayIso) {
  const day = new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (day === todayIso) return "";
  const diff = Math.round((new Date(day + "T12:00:00Z") - new Date(todayIso + "T12:00:00Z")) / 86400000);
  if (diff === 1) return "amanhã ";
  return new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }) + " ";
}

function eventText(ev, todayIso) {
  if (ev.ongoing) return "Agora: " + ev.title;
  return dayLabel(ev.start, todayIso) + hhmm(ev.start) + "  " + ev.title;
}

function meetingText(d) {
  if (!d.calendarConnected) return "Agenda não conectada";
  if (!d.nextMeeting) return "Sem reunião a seguir";
  return eventText(d.nextMeeting, d.today);
}

function addText(stack, text, size, color, weight, lines) {
  const t = stack.addText(text);
  t.font = weight ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  if (lines) t.lineLimit = lines;
  return t;
}

const LISTS = {
  overdue: { one: "atrasada", many: "atrasadas", color: RED, get: function (d) { return d.overdue; } },
  today: { one: "vence hoje", many: "vencem hoje", color: YELLOW, get: function (d) { return d.dueToday; } },
  urgent: { one: "urgente", many: "urgentes", color: ORANGE, get: function (d) { return d.urgent || { count: 0, items: [] }; } },
};

function listBlock(w, key, d, maxItems) {
  const def = LISTS[key];
  const block = def.get(d);
  const head = w.addStack();
  head.centerAlignContent();
  addText(head, String(block.count), 19, block.count > 0 ? def.color : GREEN, true);
  head.addSpacer(6);
  addText(head, block.count === 1 ? def.one : def.many, 13, block.count > 0 ? def.color : MUTED, true);
  for (const it of block.items.slice(0, maxItems)) addText(w, "• " + it.title, 12, TEXT, false, 1);
}

function agendaBlock(w, d, maxItems) {
  addText(w, "Agenda", 13, YELLOW, true);
  if (!d.calendarConnected) { addText(w, "Agenda não conectada", 12, MUTED, false, 1); return; }
  const a = d.agenda || { count: 0, items: [] };
  if (a.count === 0) { addText(w, "Nada marcado até amanhã", 12, MUTED, false, 1); return; }
  for (const ev of a.items.slice(0, Math.max(1, maxItems))) addText(w, eventText(ev, d.today), 12, TEXT, false, 1);
}

function meetingBlock(w, d) {
  const row = w.addStack();
  row.centerAlignContent();
  addText(row, "Próxima reunião  ", 11, MUTED, false);
  addText(row, meetingText(d), 12, TEXT, true, 1);
}

function build(result, family) {
  const w = new ListWidget();
  w.backgroundColor = BG;
  w.url = BASE + "/gestao-atividades";
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  w.setPadding(14, 14, 12, 14);

  if (result.error) {
    addText(w, "PRICETAX", 13, YELLOW, true);
    w.addSpacer(6);
    addText(w, result.error, 12, MUTED, false, 4);
    return w;
  }

  const d = result.data;
  const blocks = (d.view && d.view.blocks) || ["overdue", "today", "meeting"];
  const head = w.addStack();
  head.centerAlignContent();
  addText(head, "PRICETAX" + (d.view && d.view.name && PARAM ? "  ·  " + d.view.name : ""), 11, YELLOW, true);
  head.addSpacer();
  if (result.stale) addText(head, "offline", 10, MUTED, false);
  if (PARAM && d.viewFound === false) addText(w, "Não achei a visão \"" + PARAM + "\". Mostrando a primeira.", 10, ORANGE, false, 2);
  w.addSpacer(6);

  if (family === "small") {
    const counts = blocks.filter(function (b) { return LISTS[b]; }).slice(0, 2);
    const row = w.addStack();
    for (let i = 0; i < counts.length; i++) {
      const def = LISTS[counts[i]];
      const block = def.get(d);
      const col = row.addStack(); col.layoutVertically();
      addText(col, String(block.count), 30, block.count > 0 ? def.color : GREEN, true);
      addText(col, block.count === 1 ? def.one : def.many, 11, MUTED, false);
      if (i < counts.length - 1) row.addSpacer();
    }
    w.addSpacer();
    if (blocks.indexOf("meeting") >= 0 || blocks.indexOf("agenda") >= 0) {
      const next = blocks.indexOf("meeting") >= 0 ? d.nextMeeting : (d.agenda && d.agenda.items[0]);
      addText(w, !d.calendarConnected ? "Agenda não conectada" : next ? eventText(next, d.today) : "Sem reunião a seguir", 11, TEXT, true, 3);
    }
    return w;
  }

  const budget = family === "large" ? 16 : 6;
  const avail = {};
  let used = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (LISTS[b]) { avail[b] = Math.min(14, LISTS[b].get(d).items.length); used += 1; }
    else if (b === "agenda") { avail[b] = Math.min(14, d.calendarConnected && d.agenda ? d.agenda.items.length : 0); used += 1; }
    else used += 1;
  }
  const give = {};
  let left = Math.max(0, budget - used);
  let moved = true;
  while (left > 0 && moved) {
    moved = false;
    for (let i = 0; i < blocks.length && left > 0; i++) {
      const b = blocks[i];
      if (avail[b] !== undefined && (give[b] || 0) < avail[b]) { give[b] = (give[b] || 0) + 1; left -= 1; moved = true; }
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (LISTS[b]) listBlock(w, b, d, give[b] || 0);
    else if (b === "agenda") agendaBlock(w, d, give[b] || 1);
    else if (b === "meeting") meetingBlock(w, d);
    if (i < blocks.length - 1) w.addSpacer(6);
  }
  return w;
}

const result = await load();
const family = config.widgetFamily || "medium";
const widget = build(result, family);
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
`;

export function buildScriptableScript({ baseUrl, token, view = '' }) {
  return TEMPLATE.replace('__BASE__', () => JSON.stringify(baseUrl)).replace('__TOKEN__', () => JSON.stringify(token)).replace('__VIEW__', () => JSON.stringify(view));
}
