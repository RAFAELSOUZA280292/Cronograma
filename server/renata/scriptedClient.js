// Modelo "roteirizado" SÓ para teste local (§101): em vez de chamar a IA, responde com o que um módulo .mjs decide a partir do estado da conversa. Serve para
// provar, de ponta a ponta e sem custo, o caminho completo (conversa → ferramenta → rotas reais → permissões → auditoria → confirmação). Recusado em produção.
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function loadScriptedClient() {
  const file = process.env.RENATA_SCRIPTED_MODEL;
  if (!file) return null;
  if (process.env.NODE_ENV === 'production' || !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '')) {
    console.error('RENATA_SCRIPTED_MODEL ignorado: só vale com banco local e fora de produção.');
    return null;
  }
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  const respond = mod.default;
  return {
    messages: {
      async create(params) {
        const msgs = params.messages;
        const last = msgs[msgs.length - 1];
        const lastUserText = [...msgs].reverse().find((m) => m.role === 'user' && typeof m.content === 'string');
        const toolResults = last && last.role === 'user' && Array.isArray(last.content) ? last.content.filter((b) => b.type === 'tool_result').map((b) => { try { return { id: b.tool_use_id, error: !!b.is_error, ...JSON.parse(b.content) }; } catch { return { id: b.tool_use_id, error: !!b.is_error, raw: b.content }; } }) : [];
        const lastAssistantTools = [];
        for (const m of msgs) if (m.role === 'assistant' && Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_use') lastAssistantTools.push(b);
        const nameOf = Object.fromEntries(lastAssistantTools.map((b) => [b.id, b.name]));
        const lastResults = toolResults.map((r) => ({ ...r, name: nameOf[r.id] }));
        const r = await respond({ params, messages: msgs, lastUserText: lastUserText ? lastUserText.content : '', toolResults: lastResults, toolUses: lastAssistantTools, tools: params.tools.map((t) => t.name), system: params.system });
        const content = (r.content || []).map((b) => (b.type === 'tool_use' ? { ...b, id: b.id || `toolu_${crypto.randomBytes(6).toString('hex')}` } : b));
        return { content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } };
      },
    },
  };
}
