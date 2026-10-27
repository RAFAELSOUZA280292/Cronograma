// Copiar e exportar conversas da RENATA (2026-10-27). Funções PURAS (sem React/DOM) para testar em Node.
// As três telas da RENATA guardam mensagens em formatos diferentes; cada uma vira a mesma forma:
//   { role: 'user' | 'assistant', who, time (ISO ou ''), text (texto simples com **negrito** e "- " de lista), sources: [string] }

export const EXPORT_FORMATS = [
  ['txt', 'Texto (.txt)'],
  ['md', 'Markdown (.md)'],
  ['doc', 'Word (.doc)'],
  ['pdf', 'PDF (imprimir ou salvar)'],
  ['xlsx', 'Excel (.xlsx)'],
  ['json', 'JSON (.json)'],
];

const pad = (n) => String(n).padStart(2, '0');
export function fmtWhen(iso) {
  if (!iso || !String(iso).includes('T')) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fmtDay = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

export const stripBold = (s) => String(s == null ? '' : s).replace(/\*\*([^*]+)\*\*/g, '$1');

// RENATA do projeto: resposta estruturada (introdução, seções, insights) + fontes citadas.
export function fromProjectMessages(messages) {
  return (messages || []).filter((m) => m && (m.content || m.structured)).map((m) => {
    if (m.role === 'user') return { role: 'user', who: 'Você', time: m.createdAt || '', text: String(m.content || ''), sources: [] };
    const st = m.structured;
    let text = String(m.content || '');
    if (st) {
      const parts = [st.introduction || ''];
      if (m.hasEvidence !== false) {
        (st.sections || []).forEach((s) => {
          const block = [`**${s.title}**`];
          if (s.content) block.push(s.content);
          (s.items || []).forEach((it) => block.push(`- ${it}`));
          parts.push(block.join('\n'));
        });
        if ((st.insights || []).length) parts.push(['**Insights rápidos**', ...st.insights.map((i) => `- ${i}`)].join('\n'));
      }
      text = parts.filter(Boolean).join('\n\n');
    }
    const sources = (m.sources || []).map((s) => `${s.meetingTitle || 'Reunião'}${s.meetingDate ? ` · ${fmtDay(s.meetingDate)}` : ''}${s.timeRef ? ` · ${s.timeRef}` : ''}`);
    return { role: 'assistant', who: 'RENATA', time: m.createdAt || '', text, sources };
  });
}

// RENATA geral (e a operacional): { role, text } — a operacional também traz `steps` (ações feitas).
export function fromSimpleMessages(messages) {
  return (messages || []).filter((m) => m && (m.text || (m.steps && m.steps.length))).map((m) => {
    if (m.role === 'user') return { role: 'user', who: 'Você', time: m.createdAt || '', text: String(m.text || ''), sources: [] };
    const acts = (m.steps || []).filter((s) => s.risk !== 'read' && (s.summary || s.tool)).map((s) => `${s.summary || s.tool}${s.status && s.status !== 'success' ? ` (${s.status})` : ''}${s.undone ? ' (desfeito)' : ''}`);
    const text = [String(m.text || ''), acts.length ? ['**Ações executadas**', ...acts.map((a) => `- ${a}`)].join('\n') : ''].filter(Boolean).join('\n\n');
    return { role: 'assistant', who: 'RENATA', time: m.createdAt || '', text, sources: [] };
  });
}

// Texto de UMA mensagem, para o botão "Copiar" de cada balão. Sem asteriscos (cola bem em e-mail e chat).
export function messageText(m, { markdown = false } = {}) {
  const body = markdown ? m.text : stripBold(m.text);
  const src = m.sources && m.sources.length ? `\n\nFontes: ${m.sources.join('; ')}` : '';
  return `${body}${src}`;
}

export function conversationText(data, { markdown = false } = {}) {
  const { title, subtitle, messages, exportedAt } = data;
  const out = [];
  out.push(markdown ? `# ${title}` : title);
  if (subtitle) out.push(markdown ? `_${subtitle}_` : subtitle);
  out.push(`Exportada em ${exportedAt}`);
  (messages || []).forEach((m) => {
    const when = fmtWhen(m.time);
    const head = `${m.who}${when ? ` · ${when}` : ''}`;
    out.push('', markdown ? `### ${head}` : `[${head}]`, messageText(m, { markdown }));
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

export function conversationRows(data) {
  return (data.messages || []).map((m, i) => ({ 'Nº': i + 1, Quem: m.who, 'Data e hora': fmtWhen(m.time), Mensagem: stripBold(m.text), Fontes: (m.sources || []).join('; ') }));
}

export function conversationJson(data) {
  return JSON.stringify({
    titulo: data.title, subtitulo: data.subtitle || '', exportadoEm: data.exportedAt,
    mensagens: (data.messages || []).map((m) => ({ papel: m.role === 'user' ? 'usuario' : 'renata', autor: m.who, hora: m.time || '', texto: stripBold(m.text), fontes: m.sources || [] })),
  }, null, 2);
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inlineHtml = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
function textToHtml(text) {
  return String(text || '').split(/\n{2,}/).map((b) => {
    const lines = b.split('\n').filter((l) => l.trim());
    if (!lines.length) return '';
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inlineHtml(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
    // título em negrito sozinho numa linha seguido de itens: "**Título**\n- a\n- b"
    const out = []; let list = [];
    const flush = () => { if (list.length) { out.push(`<ul>${list.join('')}</ul>`); list = []; } };
    lines.forEach((l) => { if (/^\s*[-•*]\s+/.test(l)) list.push(`<li>${inlineHtml(l.replace(/^\s*[-•*]\s+/, ''))}</li>`); else { flush(); out.push(`<p>${inlineHtml(l)}</p>`); } });
    flush();
    return out.join('');
  }).join('');
}

// Documento autocontido, claro, A4: serve para o PDF (janela de impressão) e para o Word (.doc aceita HTML).
export function conversationHtml(data, { word = false } = {}) {
  const items = (data.messages || []).map((m) => {
    const when = fmtWhen(m.time);
    return `<div class="m ${m.role}"><div class="h"><b>${esc(m.who)}</b>${when ? ` <span>${esc(when)}</span>` : ''}</div>${textToHtml(m.text)}${m.sources && m.sources.length ? `<p class="src">Fontes: ${esc(m.sources.join('; '))}</p>` : ''}</div>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"${word ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"' : ''}><head><meta charset="utf-8"><title>${esc(data.title)}</title><style>
  @page { size: A4; margin: 16mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font: 12px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 19px; margin: 0 0 2px; } .sub { color: #555; margin: 0 0 14px; }
  .m { margin: 0 0 12px; padding: 8px 12px; border-radius: 8px; break-inside: avoid-page; }
  .m.user { background: #fff6cc; border: 1px solid #ecd35a; }
  .m.assistant { background: #f4f4f4; border: 1px solid #ddd; }
  .h { margin-bottom: 4px; } .h span { color: #666; font-size: 10.5px; margin-left: 6px; }
  p { margin: 0 0 6px; } ul { margin: 0 0 6px; padding-left: 18px; } li { margin-bottom: 2px; }
  .src { color: #555; font-size: 10.5px; }
  </style></head><body><h1>${esc(data.title)}</h1><p class="sub">${esc([data.subtitle, `Exportada em ${data.exportedAt}`].filter(Boolean).join(' · '))}</p>${items || '<p>Conversa vazia.</p>'}</body></html>`;
}

export function exportFileName(title, ext, today) {
  const slug = String(title || 'conversa').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'conversa';
  return `${slug}-${today}.${ext}`;
}
