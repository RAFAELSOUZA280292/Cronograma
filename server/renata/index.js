// Montagem da RENATA operacional (§101): catálogo de ferramentas + executor + agente + rotas. Módulo novo = um arquivo em tools/ registrado aqui.
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db.js';
import { createRegistry } from './registry.js';
import { createExecutor } from './executor.js';
import { createAgent } from './agent.js';
import { registerCrm } from './tools/crm.js';
import { registerBoard } from './tools/board.js';
import { registerEmpresas } from './tools/empresas.js';
import { registerReports } from './tools/reports.js';
import { registerPlataforma } from './tools/plataforma.js';
import { registerBiblioteca } from './tools/biblioteca.js';
import { loadScriptedClient } from './scriptedClient.js';
import { buildGeneralContext } from '../assistantGeneral.js';
import { logMetric } from '../metrics.js';

export const registry = createRegistry();
registerPlataforma(registry);
registerReports(registry);
registerBiblioteca(registry);
registerCrm(registry);
registerBoard(registry);
registerEmpresas(registry);

export const executor = createExecutor({ pool, registry });

let real = null;
let scripted;
export async function getClient() {
  if (scripted === undefined) scripted = await loadScriptedClient();
  if (scripted) return scripted;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!real) real = new Anthropic();
  return real;
}
export const aiConfigured = async () => !!(await getClient());

const isStaff = (u) => !!u && (u.isSuperAdmin || u.role === 'master' || u.role === 'pricetax');
export const agent = createAgent({
  pool, registry, executor,
  getClient: () => { if (scripted) return scripted; if (!real) real = new Anthropic(); return real; },
  generalContext: async ({ user, question }) => (await buildGeneralContext({ pool, user, orgId: user.orgId, question, isStaff: isStaff(user) })).text,
  logUsage: (res) => { logMetric(pool, { orgId: null, projectId: null, eventType: 'anthropic_api_call', metadata: { feature: 'renata_agent', model: res.model || '', inputTokens: (res.usage && res.usage.input_tokens) || 0, outputTokens: (res.usage && res.usage.output_tokens) || 0 } }).catch(() => {}); },
});
