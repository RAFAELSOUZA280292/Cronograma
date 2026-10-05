// Script do Scriptable (iOS) colado pelo usuário — mostra atrasadas, vencem hoje e próxima reunião.
// O token e o endereço entram já preenchidos; o resto é fixo. Sem template literal dentro do script
// para não brigar com o template deste arquivo.
const TEMPLATE = String.raw`// PRICETAX — widget do iPhone. Gerado em "Meu perfil > Widget do iPhone".
const BASE = __BASE__;
const TOKEN = __TOKEN__;

const BG = new Color("#0B0B1E");
const TEXT = new Color("#FFFFFF");
const MUTED = new Color("#9CA3C0");
const YELLOW = new Color("#FFD400");
const RED = new Color("#FF6B6B");
const GREEN = new Color("#3ECF6E");

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "pricetax-widget.json");

async function load() {
  try {
    const req = new Request(BASE + "/api/widget/summary");
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
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function dayLabel(iso, todayIso) {
  const day = new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (day === todayIso) return "";
  const diff = Math.round((new Date(day + "T12:00:00Z") - new Date(todayIso + "T12:00:00Z")) / 86400000);
  if (diff === 1) return "amanhã ";
  return new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }) + " ";
}

function meetingText(d) {
  const m = d.nextMeeting;
  if (!d.calendarConnected) return "Agenda não conectada";
  if (!m) return "Sem reunião a seguir";
  if (m.ongoing) return "Agora: " + m.title;
  return dayLabel(m.start, d.today) + hhmm(m.start) + "  " + m.title;
}

function addText(stack, text, size, color, weight, lines) {
  const t = stack.addText(text);
  t.font = weight ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  if (lines) t.lineLimit = lines;
  return t;
}

function section(w, label, color, block, maxItems, size) {
  const head = w.addStack();
  head.centerAlignContent();
  addText(head, String(block.count), size + 6, block.count > 0 ? color : GREEN, true);
  head.addSpacer(6);
  addText(head, label, size, block.count > 0 ? color : MUTED, true);
  for (const it of block.items.slice(0, maxItems)) {
    addText(w, "• " + it.title, size - 1, TEXT, false, 1);
  }
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
  const small = family === "small";
  const items = family === "large" ? 4 : family === "medium" ? 2 : 0;

  const head = w.addStack();
  head.centerAlignContent();
  addText(head, "PRICETAX", 11, YELLOW, true);
  head.addSpacer();
  if (result.stale) addText(head, "offline", 10, MUTED, false);
  w.addSpacer(6);

  if (small) {
    const row = w.addStack();
    const a = row.addStack(); a.layoutVertically();
    addText(a, String(d.overdue.count), 30, d.overdue.count > 0 ? RED : GREEN, true);
    addText(a, d.overdue.count === 1 ? "atrasada" : "atrasadas", 11, MUTED, false);
    row.addSpacer();
    const b = row.addStack(); b.layoutVertically();
    addText(b, String(d.dueToday.count), 30, d.dueToday.count > 0 ? YELLOW : GREEN, true);
    addText(b, "hoje", 11, MUTED, false);
    w.addSpacer();
    addText(w, meetingText(d), 11, TEXT, true, 3);
    return w;
  }

  section(w, d.overdue.count === 1 ? "atrasada" : "atrasadas", RED, d.overdue, items, 13);
  w.addSpacer(8);
  section(w, d.dueToday.count === 1 ? "vence hoje" : "vencem hoje", YELLOW, d.dueToday, items, 13);
  w.addSpacer();
  const meet = w.addStack();
  meet.centerAlignContent();
  addText(meet, "Próxima reunião  ", 11, MUTED, false);
  addText(meet, meetingText(d), 12, TEXT, true, 1);
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

export function buildScriptableScript({ baseUrl, token }) {
  return TEMPLATE.replace('__BASE__', JSON.stringify(baseUrl)).replace('__TOKEN__', JSON.stringify(token));
}
