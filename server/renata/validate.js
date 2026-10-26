// Validador de parâmetros das ferramentas da RENATA (§101): subconjunto de JSON Schema suficiente para o catálogo. Rejeita campo desconhecido
// (a IA não inventa parâmetros), coage o óbvio (número/booleano vindos como texto) e devolve mensagens em português que a própria IA lê e corrige.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validate(schema, value, path = '') {
  const errors = [];
  const at = path || 'parâmetros';
  const fail = (m) => errors.push(`${at}: ${m}`);
  const sch = schema || {};
  let v = value;
  if (v === undefined || v === null) return { ok: true, value: v, errors };
  switch (sch.type) {
    case 'string': {
      if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
      if (typeof v !== 'string') { fail('esperava texto'); break; }
      v = v.trim();
      if (sch.minLength && v.length < sch.minLength) fail(`mínimo de ${sch.minLength} caractere(s)`);
      if (sch.maxLength && v.length > sch.maxLength) fail(`máximo de ${sch.maxLength} caracteres`);
      if (sch.enum && !sch.enum.includes(v)) fail(`valor inválido "${v}". Use: ${sch.enum.join(', ')}`);
      if (sch.format === 'date' && !(DATE.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v)) fail('data inválida; use AAAA-MM-DD');
      if (sch.format === 'uuid' && !UUID.test(v)) fail('identificador inválido (UUID); busque o registro antes para obter o id');
      if (sch.pattern && !new RegExp(sch.pattern).test(v)) fail(`formato inválido${sch.patternHint ? ` (${sch.patternHint})` : ''}`);
      break;
    }
    case 'integer':
    case 'number': {
      if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.')))) v = Number(v.replace(',', '.'));
      if (typeof v !== 'number' || !Number.isFinite(v)) { fail('esperava número'); break; }
      if (sch.type === 'integer' && !Number.isInteger(v)) fail('esperava número inteiro');
      if (sch.minimum != null && v < sch.minimum) fail(`mínimo ${sch.minimum}`);
      if (sch.maximum != null && v > sch.maximum) fail(`máximo ${sch.maximum}`);
      break;
    }
    case 'boolean': {
      if (v === 'true' || v === 'sim') v = true; else if (v === 'false' || v === 'não' || v === 'nao') v = false;
      if (typeof v !== 'boolean') fail('esperava verdadeiro/falso');
      break;
    }
    case 'array': {
      if (!Array.isArray(v)) { fail('esperava lista'); break; }
      if (sch.maxItems && v.length > sch.maxItems) fail(`no máximo ${sch.maxItems} item(ns)`);
      if (sch.minItems && v.length < sch.minItems) fail(`no mínimo ${sch.minItems} item(ns)`);
      if (sch.items) {
        const out = v.map((x, i) => { const r = validate(sch.items, x, `${at}[${i}]`); errors.push(...r.errors); return r.value; });
        if (!errors.length) v = out;
      }
      break;
    }
    case 'object': {
      if (typeof v !== 'object' || Array.isArray(v)) { fail('esperava objeto'); break; }
      const props = sch.properties || {};
      const out = {};
      for (const k of Object.keys(v)) {
        if (!props[k]) { if (sch.additionalProperties === true) { out[k] = v[k]; continue; } fail(`campo desconhecido "${k}". Campos aceitos: ${Object.keys(props).join(', ') || '(nenhum)'}`); continue; }
        const r = validate(props[k], v[k], path ? `${path}.${k}` : k);
        errors.push(...r.errors);
        if (r.value !== undefined) out[k] = r.value;
      }
      for (const k of sch.required || []) if (out[k] === undefined || out[k] === '') errors.push(`${path ? `${path}.` : ''}${k}: obrigatório`);
      v = out;
      break;
    }
    default: break;
  }
  return { ok: !errors.length, value: v, errors };
}

// Esquema compacto para escrever o catálogo sem repetição.
export const T = {
  str: (description, o = {}) => ({ type: 'string', description, ...o }),
  date: (description) => ({ type: 'string', format: 'date', description }),
  uuid: (description) => ({ type: 'string', format: 'uuid', description }),
  int: (description, o = {}) => ({ type: 'integer', description, ...o }),
  num: (description, o = {}) => ({ type: 'number', description, ...o }),
  bool: (description) => ({ type: 'boolean', description }),
  enm: (description, values) => ({ type: 'string', description, enum: values }),
  arr: (description, items, o = {}) => ({ type: 'array', description, items, ...o }),
  obj: (properties, required = [], o = {}) => ({ type: 'object', properties, required, ...o }),
};
