// Fusão de três vias do quadro pessoal (2026-10-27, §117). O painel grava o quadro INTEIRO; com duas abas (ou duas pessoas) abertas, a
// aba que salvava por último apagava o que a outra tinha acabado de gravar. Agora, quando o servidor avisa que o quadro mudou desde
// a versão que a aba conhecia (409), a aba junta: `base` (o que ela conhecia), `mine` (o que ela quer gravar) e `theirs` (o que
// está no servidor). Funções puras, sem React nem DOM — testáveis em Node.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Igualdade profunda que ignora a ordem das chaves (o jsonb do Postgres reordena chaves; o JSON.stringify não serve para comparar).
export function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

const CAPS = { log: 300, history: 200 };
const stable = (v) => (isObj(v) ? `{${Object.keys(v).sort().map((k) => `${k}:${stable(v[k])}`).join(',')}}` : Array.isArray(v) ? `[${v.map(stable).join(',')}]` : JSON.stringify(v));

// Ids na ordem do `primary`, e os que só existem no `secondary` entram logo depois do vizinho anterior dele (ou no começo).
function weave(primary, secondary) {
  const out = [...primary];
  const seen = new Set(out);
  secondary.forEach((id, i) => {
    if (seen.has(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j -= 1) { const p = out.indexOf(secondary[j]); if (p !== -1) { at = p + 1; break; } }
    out.splice(at, 0, id);
    seen.add(id);
  });
  return out;
}

const orderOf = (list, within) => list.map((x) => x.id).filter((id) => within.has(id));
const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function mergeKeyed(base, mine, theirs) {
  const bMap = new Map(base.map((x) => [x.id, x]));
  const mMap = new Map(mine.map((x) => [x.id, x]));
  const tMap = new Map(theirs.map((x) => [x.id, x]));
  const mineIds = mine.map((x) => x.id);
  const theirIds = theirs.map((x) => x.id);
  // Quem reordenou define a ordem; se ninguém reordenou, vale a de quem está gravando.
  const baseIds = new Set(base.map((x) => x.id));
  const mineReordered = !sameOrder(orderOf(mine, baseIds), orderOf(base, new Set(mineIds)));
  const theirsReordered = !sameOrder(orderOf(theirs, baseIds), orderOf(base, new Set(theirIds)));
  const ids = theirsReordered && !mineReordered ? weave(theirIds, mineIds) : weave(mineIds, theirIds);
  const out = [];
  for (const id of ids) {
    const m = mMap.get(id); const t = tMap.get(id); const b = bMap.get(id);
    if (m && t) out.push(merge(b, m, t));
    else if (m) { if (!(b && deepEqual(b, m))) out.push(m); } // só eu tenho: se existia e não mexi, a outra aba apagou
    else if (t) { if (!(b && deepEqual(b, t))) out.push(t); } // só a outra aba tem: se existia e ela não mexeu, eu apaguei
  }
  return out;
}

function mergeLoose(key, base, mine, theirs) {
  const bSet = new Set(base.map(stable));
  const mSet = new Set(mine.map(stable));
  const tSet = new Set(theirs.map(stable));
  const out = [];
  const seen = new Set();
  const push = (x) => { const k = stable(x); if (!seen.has(k)) { seen.add(k); out.push(x); } };
  mine.forEach((x) => { const k = stable(x); if (!(bSet.has(k) && !tSet.has(k))) push(x); }); // some se a outra aba removeu algo que eu não mexi
  theirs.forEach((x) => { const k = stable(x); if (!(bSet.has(k) && !mSet.has(k))) push(x); });
  if (out.length && out.every((x) => isObj(x) && typeof x.ts === 'string')) out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return CAPS[key] ? out.slice(0, CAPS[key]) : out;
}

function mergeArrays(key, base, mine, theirs) {
  const b = Array.isArray(base) ? base : [];
  const all = [...b, ...mine, ...theirs];
  const keyed = all.length > 0 && all.every((x) => isObj(x) && typeof x.id === 'string');
  return keyed ? mergeKeyed(b, mine, theirs) : mergeLoose(key, b, mine, theirs);
}

function mergeObjects(base, mine, theirs) {
  const b = isObj(base) ? base : {};
  const out = {};
  for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const inM = mine[k] !== undefined; const inT = theirs[k] !== undefined; const inB = b[k] !== undefined;
    if (inM && inT) out[k] = merge(b[k], mine[k], theirs[k], k);
    else if (inM) { if (!(inB && deepEqual(b[k], mine[k]))) out[k] = mine[k]; }
    else if (inT) { if (!(inB && deepEqual(b[k], theirs[k]))) out[k] = theirs[k]; }
  }
  return out;
}

// Regra de ouro: o que só um lado mexeu vale; o que os dois mexeram é fundido campo a campo; no mesmo campo vence quem está gravando.
function merge(base, mine, theirs, key) {
  if (deepEqual(mine, theirs)) return mine;
  if (base !== undefined && deepEqual(base, mine)) return theirs;
  if (base !== undefined && deepEqual(base, theirs)) return mine;
  if (Array.isArray(mine) && Array.isArray(theirs)) return mergeArrays(key, base, mine, theirs);
  if (isObj(mine) && isObj(theirs)) return mergeObjects(base, mine, theirs);
  return mine;
}

// Um cartão que uma aba moveu de coluna enquanto a outra o editava aparece nas duas colunas depois da fusão: fica só uma cópia, onde
// quem está gravando o colocou.
function dedupeCards(pages, minePages) {
  const where = new Map();
  for (const p of minePages || []) for (const c of p.columns || []) for (const k of c.cards || []) where.set(k.id, `${p.id}/${c.id}`);
  const seen = new Set();
  const place = (p, c, k) => (where.has(k.id) ? where.get(k.id) === `${p.id}/${c.id}` : !seen.has(k.id));
  return pages.map((p) => ({
    ...p,
    columns: (p.columns || []).map((c) => ({
      ...c,
      cards: (c.cards || []).filter((k) => { if (!place(p, c, k)) return false; if (seen.has(k.id)) return false; seen.add(k.id); return true; }),
    })),
  }));
}

// Quadro inteiro { boards: [páginas], linkedBoards, … }.
export function mergeBoards(base, mine, theirs) {
  if (!theirs) return mine;
  if (!mine) return theirs;
  const out = merge(base || undefined, mine, theirs);
  if (!out || !Array.isArray(out.boards)) return out;
  const pages = dedupeCards(out.boards, mine.boards);
  return deepEqual(pages, out.boards) ? out : { ...out, boards: pages };
}

// Uma página só (o quadro compartilhado de outra pessoa é lido e gravado página a página).
export function mergePage(base, mine, theirs) {
  if (!theirs) return mine;
  if (!mine) return theirs;
  const out = merge(base || undefined, mine, theirs);
  if (!out || !Array.isArray(out.columns)) return out;
  const [page] = dedupeCards([out], [mine]);
  return deepEqual(page, out) ? out : page;
}

// Empresa (cronograma) inteira — mesma regra do quadro, aplicada ao documento `projects.data` (A3, 2026-10-29): atividades, subatividades, reuniões, tarefas,
// equipe e fases são fundidas por `id`; o `log` é a união (até 300); no MESMO campo vence quem está gravando; o que só um lado mexeu vale.
export function mergeProjects(base, mine, theirs) {
  if (!theirs) return mine;
  if (!mine) return theirs;
  return merge(base || undefined, mine, theirs);
}
