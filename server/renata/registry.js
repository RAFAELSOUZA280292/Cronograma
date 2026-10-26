// Catálogo central de ferramentas da RENATA (§101). Cada ferramenta é uma operação estruturada: nome, módulo, descrição para a IA, esquema de parâmetros,
// risco (read | write | critical), regra de confirmação, como obter o "antes", como desfazer e como descrever o que vai acontecer. Módulo novo = um arquivo em
// `tools/` que chama `registry.add(...)`; nada mais muda (executor, auditoria, confirmação e agente são genéricos).
const JSON_KEYS = new Set(['type', 'description', 'enum', 'properties', 'required', 'items', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'additionalProperties', 'format']);

function toJsonSchema(s) {
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (!JSON_KEYS.has(k)) continue;
    if (k === 'format' && !['date'].includes(v)) continue; // só formatos que a API de ferramentas entende
    if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v).map(([p, x]) => [p, toJsonSchema(x)]));
    else if (k === 'items') out.items = toJsonSchema(v);
    else out[k] = v;
  }
  if (out.type === 'object' && !out.properties) out.properties = {};
  return out;
}

export function createRegistry() {
  const tools = new Map();
  return {
    add(def) {
      if (!def.name || !def.module || !def.summary || !def.params) throw new Error(`Ferramenta incompleta: ${def.name}`);
      if (!['read', 'write', 'critical'].includes(def.risk)) throw new Error(`Risco inválido em ${def.name}`);
      if (!def.route && !def.run) throw new Error(`Ferramenta sem execução: ${def.name}`);
      if (tools.has(def.name)) throw new Error(`Ferramenta duplicada: ${def.name}`);
      tools.set(def.name, def);
    },
    get: (n) => tools.get(n),
    all: () => [...tools.values()],
    // Só as ferramentas que ESTE usuário pode usar (o servidor ainda confere de novo ao executar).
    forUser(user) { return [...tools.values()].filter((t) => !t.visible || t.visible(user)); },
    forModel(user) {
      return this.forUser(user).map((t) => ({
        name: t.name,
        description: `[${t.module}] ${t.summary}${t.risk === 'critical' ? ' (AÇÃO CRÍTICA: o sistema pede confirmação ao usuário antes de executar.)' : ''}${t.bulkNote ? ` ${t.bulkNote}` : ''}`,
        input_schema: toJsonSchema(t.params),
      }));
    },
  };
}
