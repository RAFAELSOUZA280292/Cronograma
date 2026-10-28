// Correção de uma reunião já registrada pela API de conectividade (§116e, escopo `meetings_edit`). Função pura sobre o `data` do projeto:
// valida tudo, devolve o `data` novo, a lista de mudanças (antes → depois) e o corpo que desfaz. Quem grava (transação, log, versão) é a rota.
import { AREAS } from './areas.js';

export const MEETING_FIELDS = ['title', 'date', 'time', 'summary', 'decisions', 'participants', 'actionItems'];
export const CONTROL_FIELDS = ['dryRun', 'note'];
export const ITEM_FIELDS = ['title', 'responsible', 'kind', 'dueDate', 'area', 'owner'];
const KINDS = ['tarefa', 'decisao', 'risco', 'pendencia'];
const OWNERS = ['pricetax', 'cliente'];
export const MAX_ITEM_OPS = 100;
const MAX_PARTICIPANTS = 60;
const TEXT_MAX = 20000; // mesmo limite com que o GET devolve resumo/decisões: o que se lê é o que se pode reenviar

export const isISODay = (v) => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const d = new Date(`${v}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; }; // 2026-02-31 não vale (Date.parse arredondaria para março)
const stripAccents = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const alive = (l) => (Array.isArray(l) ? l : []).filter((x) => x && !x.deleted);
const str = (v, what) => { if (typeof v !== 'string') throw new Error(`${what} deve ser texto.`); return v; };

const META = {
  title: (v) => { const t = str(v, 'title').trim(); if (!t) throw new Error('title não pode ficar vazio.'); if (t.length > 200) throw new Error('title passa de 200 caracteres.'); return t; },
  date: (v) => { if (v === '' || v === null) return ''; if (!isISODay(v)) throw new Error('date deve ser AAAA-MM-DD (ou "" para limpar).'); return v; },
  time: (v) => { if (v === '' || v === null) return ''; if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error('time deve ser HH:MM em 24 h (ou "" para limpar).'); return v; },
  summary: (v) => { const t = str(v, 'summary'); if (t.length > TEXT_MAX) throw new Error(`summary passa de ${TEXT_MAX} caracteres.`); return t; },
  decisions: (v) => { const t = str(v, 'decisions'); if (t.length > TEXT_MAX) throw new Error(`decisions passa de ${TEXT_MAX} caracteres.`); return t; },
};

const name = (v, what) => { const t = str(v, what).trim(); if (!t) throw new Error(`${what} não pode ficar vazio.`); if (t.length > 120) throw new Error(`${what} passa de 120 caracteres.`); return t; };

// `participants`: lista inteira (substitui) OU { add: [...], remove: [...], rename: { "nome antigo": "nome novo" } } (nome comparado sem acento e sem diferença de maiúsculas).
function applyParticipants(current, spec) {
  const key = (s) => stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
  let list = (Array.isArray(current) ? current : []).map(String);
  if (Array.isArray(spec)) list = spec.map((p) => name(p, 'participante'));
  else if (spec && typeof spec === 'object') {
    const extra = Object.keys(spec).filter((k) => !['add', 'remove', 'rename'].includes(k));
    if (extra.length) throw new Error(`participants: campo não permitido (${extra.join(', ')}). Use add, remove e rename.`);
    for (const r of spec.remove === undefined ? [] : [].concat(spec.remove)) {
      const k = key(name(r, 'participante a remover'));
      if (!list.some((p) => key(p) === k)) throw new Error(`participants.remove: "${r}" não está na reunião.`);
      list = list.filter((p) => key(p) !== k);
    }
    if (spec.rename !== undefined) {
      if (!spec.rename || typeof spec.rename !== 'object' || Array.isArray(spec.rename)) throw new Error('participants.rename deve ser um objeto { "nome antigo": "nome novo" }.');
      for (const [from, to] of Object.entries(spec.rename)) {
        const k = key(name(from, 'participante a renomear'));
        if (!list.some((p) => key(p) === k)) throw new Error(`participants.rename: "${from}" não está na reunião.`);
        list = list.map((p) => (key(p) === k ? name(to, 'novo nome') : p));
      }
    }
    for (const a of spec.add === undefined ? [] : [].concat(spec.add)) { const n = name(a, 'participante a incluir'); if (!list.some((p) => key(p) === key(n))) list.push(n); }
  } else throw new Error('participants deve ser uma lista de nomes ou { add, remove, rename }.');
  const seen = new Set();
  list = list.filter((p) => { const k = key(p); if (seen.has(k)) return false; seen.add(k); return true; });
  if (list.length > MAX_PARTICIPANTS) throw new Error(`participants passa de ${MAX_PARTICIPANTS} pessoas.`);
  return list;
}

const ITEM = {
  title: (v) => { const t = str(v, 'title do item').trim(); if (!t) throw new Error('title do item não pode ficar vazio.'); if (t.length > 300) throw new Error('title do item passa de 300 caracteres.'); return t; },
  responsible: (v) => { if (v === null) return ''; const t = str(v, 'responsible').trim(); if (t.length > 120) throw new Error('responsible passa de 120 caracteres.'); return t; },
  kind: (v) => { const k = stripAccents(str(v, 'kind')).trim().toLowerCase(); if (!KINDS.includes(k)) throw new Error(`kind inválido: "${v}" (use ${KINDS.join(', ')}).`); return k; },
  dueDate: (v) => { if (v === '' || v === null) return ''; if (!isISODay(v)) throw new Error('dueDate deve ser AAAA-MM-DD (ou "" para limpar).'); return v; },
  area: (v) => { if (v === '' || v === null) return ''; if (!AREAS.includes(v)) throw new Error(`area inválida: "${v}" (use ${AREAS.join(', ')} ou "").`); return v; },
  owner: (v) => { if (!OWNERS.includes(v)) throw new Error(`owner inválido: "${v}" (use pricetax ou cliente).`); return v; },
  responsibleStatus: (v) => { if (!['', 'auto', 'confirmar'].includes(v)) throw new Error('responsibleStatus inválido.'); return v; },
};

// Campos do item vêm em `set: {...}` ou soltos ao lado de `op`/`id`; qualquer outro nome (status, activityId, activityLink…) é recusado.
function itemFields(op, allowed) {
  const raw = op.set !== undefined ? op.set : Object.fromEntries(Object.entries(op).filter(([k]) => !['op', 'id', 'set'].includes(k)));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('"set" deve ser um objeto com os campos a alterar.');
  const bad = Object.keys(raw).filter((k) => !allowed.includes(k));
  if (bad.length) throw new Error(`campo não permitido em item: ${bad.join(', ')}. Permitidos: ${allowed.join(', ')}.`);
  return raw;
}

const itemView = (it) => ({ title: it.title || '', responsible: it.responsible || '', kind: it.kind || 'tarefa', dueDate: it.dueDate || '', area: it.area || '', owner: it.owner || 'pricetax' });

// `fromUndo`: o corpo vem da correção guardada em meeting_edits (nunca do cliente); só nele vale o campo interno `responsibleStatus`, para o desfazer devolver o aviso "confirmar" da RENATA.
export function applyMeetingEdit(data, meetingId, body, who, { fromUndo = false } = {}) {
  const errors = [];
  const fail = (target, message) => errors.push({ target, message });
  const next = structuredClone(data);
  const m = alive(next.meetings).find((x) => x.id === meetingId);
  if (!m) return { notFound: true };
  const before = structuredClone(m);
  const changes = []; const undo = {}; const undoItems = [];
  const stamp = new Date().toISOString();

  const unknown = Object.keys(body || {}).filter((k) => !MEETING_FIELDS.includes(k) && !CONTROL_FIELDS.includes(k));
  if (unknown.length) fail('body', `campo não permitido: ${unknown.join(', ')}. Permitidos: ${MEETING_FIELDS.join(', ')} (e dryRun, note).`);

  for (const f of ['title', 'date', 'time', 'summary', 'decisions']) {
    if (body[f] === undefined) continue;
    try {
      const v = META[f](body[f]);
      const old = m[f] === undefined ? '' : m[f];
      if (!same(old, v)) { changes.push({ target: 'meeting', field: f, before: old, after: v }); undo[f] = old; m[f] = v; }
    } catch (e) { fail(f, e.message); }
  }
  if (body.participants !== undefined) {
    try {
      const old = Array.isArray(m.participants) ? m.participants : [];
      const v = applyParticipants(old, body.participants);
      if (!same(old, v)) { changes.push({ target: 'meeting', field: 'participants', before: old, after: v }); undo.participants = old; m.participants = v; }
    } catch (e) { fail('participants', e.message); }
  }

  if (body.actionItems !== undefined) {
    const ops = body.actionItems;
    if (!Array.isArray(ops) || !ops.length) fail('actionItems', 'actionItems deve ser uma lista de operações ({op:"set"|"add"|"delete"|"restore", …}).');
    else if (ops.length > MAX_ITEM_OPS) fail('actionItems', `no máximo ${MAX_ITEM_OPS} operações por chamada.`);
    else {
      if (!Array.isArray(m.actionItems)) m.actionItems = [];
      ops.forEach((op, i) => {
        const at = `actionItems[${i}]`;
        try {
          if (!op || typeof op !== 'object' || Array.isArray(op)) throw new Error('operação inválida (esperado um objeto).');
          if (op.op === 'add') {
            const f = itemFields(op, ITEM_FIELDS);
            const it = { title: ITEM.title(f.title === undefined ? '' : f.title) };
            for (const k of ITEM_FIELDS.filter((x) => x !== 'title' && f[x] !== undefined)) it[k] = ITEM[k](f[k]);
            const created = {
              id: `mai-${Math.random().toString(36).slice(2, 9)}`, title: it.title, responsible: it.responsible || '', area: it.area || undefined,
              owner: it.owner || 'pricetax', kind: it.kind || 'tarefa', dueDate: it.dueDate || '', status: 'nao-iniciado', deleted: false, subtitle: '', notes: '',
              subtasks: [], comments: [], attachments: [], createdBy: who, createdAt: stamp,
            };
            m.actionItems.push(created);
            changes.push({ target: 'actionItem', op: 'add', id: created.id, after: itemView(created) });
            undoItems.push({ op: 'delete', id: created.id });
          } else if (op.op === 'set') {
            const id = typeof op.id === 'string' ? op.id : '';
            const it = alive(m.actionItems).find((x) => x.id === id);
            if (!it) throw new Error(`item não encontrado na reunião (id ${id || 'ausente'}).`);
            const f = itemFields(op, fromUndo ? [...ITEM_FIELDS, 'responsibleStatus'] : ITEM_FIELDS);
            if (!Object.keys(f).length) throw new Error('nenhum campo para alterar.');
            const prev = {};
            for (const [k, raw] of Object.entries(f).sort(([a], [b]) => (a === 'responsibleStatus') - (b === 'responsibleStatus'))) {
              const v = ITEM[k](raw);
              const old = k === 'owner' ? (it.owner || 'pricetax') : k === 'kind' ? (it.kind || 'tarefa') : (it[k] === undefined || it[k] === null ? '' : it[k]);
              if (same(old, v)) continue;
              prev[k] = old;
              changes.push({ target: 'actionItem', op: 'set', id, field: k, before: old, after: v });
              it[k] = v;
              // responsável corrigido por uma pessoa/IA de fora: some o aviso "confirmar" da RENATA (o nome original que ela ouviu fica guardado)
              if (k === 'responsible' && it.responsibleStatus) { prev.responsibleStatus = it.responsibleStatus; it.responsibleStatus = ''; }
              // `activityId` e `activityLink` NÃO são tocados: o vínculo com o cronograma só muda na tela (ou quando o item é excluído).
            }
            if (Object.keys(prev).length) undoItems.push({ op: 'set', id, set: prev });
          } else if (op.op === 'delete' || op.op === 'restore') {
            const id = typeof op.id === 'string' ? op.id : '';
            const del = op.op === 'delete';
            if (Object.keys(op).some((k) => !['op', 'id'].includes(k))) throw new Error(`${op.op} só aceita op e id.`);
            const it = (m.actionItems || []).find((x) => x && x.id === id && !!x.deleted === !del);
            if (!it) throw new Error(del ? `item não encontrado na reunião (id ${id || 'ausente'}).` : `item excluído não encontrado (id ${id || 'ausente'}).`);
            Object.assign(it, del ? { deleted: true, deletedAt: stamp, deletedBy: who } : { deleted: false, deletedAt: '', deletedBy: '' });
            changes.push({ target: 'actionItem', op: del ? 'delete' : 'restore', id, before: itemView(it) });
            undoItems.push({ op: del ? 'restore' : 'delete', id });
          } else throw new Error(`operação desconhecida: ${op.op === undefined ? 'sem "op"' : `"${op.op}"`} (use set, add, delete ou restore).`);
        } catch (e) { fail(at, e.message); }
      });
    }
  }

  if (!errors.length && !changes.length) fail('body', 'Nada a alterar: informe ao menos um campo com valor diferente do atual.');
  if (errors.length) return { errors };
  m.editedAt = stamp; m.editedBy = who;
  if (undoItems.length) undo.actionItems = undoItems.reverse();
  return { next, meeting: m, before, changes, undo };
}
