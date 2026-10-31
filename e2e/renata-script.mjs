// Modelo "roteirizado" da RENATA só para o teste de fluxos: responde sem chamar IA. "lembre: X" → pede para guardar a preferência (com confirmação).
export default async function respond({ lastUserText, toolResults }) {
  if (toolResults.length) {
    const r = toolResults[0];
    return { content: [{ type: 'text', text: r.error ? `Não consegui: ${r.error}` : 'Pronto, guardei sua preferência.' }] };
  }
  const m = /lembre:\s*(.+)$/i.exec(lastUserText);
  if (m) return { content: [{ type: 'tool_use', name: 'preferencia_guardar', input: { text: m[1] } }] };
  return { content: [{ type: 'text', text: 'Combinado.' }] };
}
