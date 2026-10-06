// Exportação do Dossiê do cliente (2026-10-02, ver PROJECT_CONTEXT.md §63) — funções PURAS (sem
// React/DOM), pra poder ser testadas em Node. O mesmo documento sai em Markdown (colar/subir no
// Claude, no Notion, no Drive…) e em HTML autocontido (aberto numa janela só pra imprimir/salvar PDF,
// independente do tema escuro/claro do app).

export const WORKSTREAM_STATUS = { em_andamento: 'Em andamento', pendente: 'Pendente', concluida: 'Concluída', indefinida: 'Indefinida' };
export const DECISION_STATE = { vigente: 'Vigente', alterada: 'Alterada depois', revogada: 'Revogada', incerta: 'Incerta' };
export const TODO_STATUS = { 'nao-iniciado': 'Não iniciado', urgente: 'Urgente', 'em-andamento': 'Em andamento', pausada: 'Pausada' };

export function fmtBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function indexMeetings(content) {
  const byId = {};
  (content.meetings || []).forEach((m) => { byId[m.id] = m; });
  return byId;
}
function sourceLabel(m) { return `${fmtBR(m.date) || 'sem data'} · ${m.title || 'Reunião sem título'}`; }
function cites(ids, byId) { return (ids || []).map((id) => byId[id]).filter(Boolean).map(sourceLabel); }

export function dossierToMarkdown(content) {
  const c = content || {};
  const byId = indexMeetings(c);
  const st = c.stats || {};
  const out = [];
  const src = (ids) => { const l = cites(ids, byId); return l.length ? `\n  _Fontes: ${l.join('; ')}_` : ''; };

  out.push(`# Dossiê do cliente${c.company ? ` — ${c.company}` : ''}`);
  const period = st.period && st.period.from ? ` (de ${fmtBR(st.period.from)} a ${fmtBR(st.period.to)})` : '';
  out.push(`_Compilado pela RENATA em ${fmtBR(c.generatedAt)} a partir de ${st.meetingsTotal || 0} reunião(ões)${period}. Conteúdo gerado por IA com base apenas nas reuniões registradas — confira nas fontes citadas antes de usar em decisão._`);

  if (c.executiveSummary) out.push(`## Resumo executivo\n\n${c.executiveSummary}`);

  if ((c.timeline || []).length) {
    out.push(`## Linha do tempo\n\n${c.timeline.map((t) => `- **${fmtBR(t.date) || 'sem data'} — ${t.title}**: ${t.summary}${src(t.meetingIds)}`).join('\n')}`);
  }
  if ((c.workstreams || []).length) {
    out.push(`## Frentes de trabalho\n\n${c.workstreams.map((w) => {
      const pts = (w.keyPoints || []).map((k) => `  - ${k}`).join('\n');
      return `### ${w.name} — ${WORKSTREAM_STATUS[w.status] || w.status}\n\n${w.description}${pts ? `\n\n${pts}` : ''}${(cites(w.meetingIds, byId).length) ? `\n\n_Fontes: ${cites(w.meetingIds, byId).join('; ')}_` : ''}`;
    }).join('\n\n')}`);
  }
  if ((c.decisions || []).length) {
    out.push(`## Decisões\n\n${c.decisions.map((d) => `- **${fmtBR(d.date) || 'sem data'}** — ${d.decision} _[${DECISION_STATE[d.state] || d.state}]_${d.note ? `\n  - ${d.note}` : ''}${src(d.meetingIds)}`).join('\n')}`);
  }
  if ((c.openItems || []).length) {
    const rows = (side) => c.openItems.filter((i) => i.side === side).map((i) => `- ${i.overdue ? '⚠ ' : ''}**${i.title}**${i.subtitle ? ` — ${i.subtitle}` : ''} · ${i.responsible || 'sem responsável'} · ${TODO_STATUS[i.status] || i.status} · prazo: ${fmtBR(i.dueDate) || '—'}${i.overdue ? ' (vencido)' : ''} · origem: ${fmtBR(i.meetingDate)} ${i.meetingTitle}`);
    const px = rows('pricetax'); const cl = rows('cliente');
    out.push(`## Pendências em aberto (dados do sistema)\n\n${px.length ? `### Lado PRICETAX\n\n${px.join('\n')}\n\n` : ''}${cl.length ? `### Lado do cliente\n\n${cl.join('\n')}` : ''}`.trim());
  }
  if ((c.people || []).length) {
    out.push(`## Pessoas\n\n${c.people.map((p) => `- **${p.name}**${[p.role, p.organization].filter(Boolean).length ? ` (${[p.role, p.organization].filter(Boolean).join(' · ')})` : ''}${p.notes ? ` — ${p.notes}` : ''}`).join('\n')}`);
  }
  if ((c.risks || []).length) {
    out.push(`## Riscos e dependências\n\n${c.risks.map((r) => `- **${r.risk}** — ${r.why}${src(r.meetingIds)}`).join('\n')}`);
  }
  if ((c.gaps || []).length) {
    out.push(`## Lacunas e pontos a esclarecer\n\n${c.gaps.map((g) => `- **${g.question}** — ${g.why}${src(g.meetingIds)}`).join('\n')}`);
  }
  if ((c.meetings || []).length) {
    out.push(`## Reuniões consideradas\n\n${c.meetings.map((m) => `- ${sourceLabel(m)}${!m.hasContent ? ' _(sem conteúdo registrado)_' : m.fromTranscript ? ' _(resumo gerado da transcrição)_' : ''}`).join('\n')}`);
  }
  return `${out.join('\n\n')}\n`;
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const paras = (s) => String(s || '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

export function dossierToHtml(content) {
  const c = content || {};
  const byId = indexMeetings(c);
  const st = c.stats || {};
  const srcHtml = (ids) => { const l = cites(ids, byId); return l.length ? `<div class="src">Fontes: ${l.map(esc).join('; ')}</div>` : ''; };
  const period = st.period && st.period.from ? ` (de ${fmtBR(st.period.from)} a ${fmtBR(st.period.to)})` : '';
  const sec = (title, body) => (body ? `<h2>${esc(title)}</h2>${body}` : '');

  const timeline = (c.timeline || []).map((t) => `<li><b>${esc(fmtBR(t.date) || 'sem data')} — ${esc(t.title)}</b>: ${esc(t.summary)}${srcHtml(t.meetingIds)}</li>`).join('');
  const workstreams = (c.workstreams || []).map((w) => `<div class="card"><h3>${esc(w.name)} <span class="tag">${esc(WORKSTREAM_STATUS[w.status] || w.status)}</span></h3><p>${esc(w.description)}</p>${(w.keyPoints || []).length ? `<ul>${w.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}${srcHtml(w.meetingIds)}</div>`).join('');
  const decisions = (c.decisions || []).map((d) => `<li><b>${esc(fmtBR(d.date) || 'sem data')}</b> — ${esc(d.decision)} <span class="tag ${esc(d.state)}">${esc(DECISION_STATE[d.state] || d.state)}</span>${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}${srcHtml(d.meetingIds)}</li>`).join('');
  const openRows = (side) => (c.openItems || []).filter((i) => i.side === side).map((i) => `<tr class="${i.overdue ? 'late' : ''}"><td>${esc(i.title)}${i.subtitle ? `<br><small>${esc(i.subtitle)}</small>` : ''}</td><td>${esc(i.responsible || 'sem responsável')}</td><td>${esc(TODO_STATUS[i.status] || i.status)}</td><td>${esc(fmtBR(i.dueDate) || '—')}${i.overdue ? ' (vencido)' : ''}</td><td>${esc(fmtBR(i.meetingDate))} ${esc(i.meetingTitle)}</td></tr>`).join('');
  const table = (label, rows) => (rows ? `<h3>${label}</h3><table><thead><tr><th>Tarefa</th><th>Responsável</th><th>Status</th><th>Prazo</th><th>Origem</th></tr></thead><tbody>${rows}</tbody></table>` : '');
  const people = (c.people || []).map((p) => `<li><b>${esc(p.name)}</b>${[p.role, p.organization].filter(Boolean).length ? ` (${esc([p.role, p.organization].filter(Boolean).join(' · '))})` : ''}${p.notes ? ` — ${esc(p.notes)}` : ''}</li>`).join('');
  const risks = (c.risks || []).map((r) => `<li><b>${esc(r.risk)}</b> — ${esc(r.why)}${srcHtml(r.meetingIds)}</li>`).join('');
  const gaps = (c.gaps || []).map((g) => `<li><b>${esc(g.question)}</b> — ${esc(g.why)}${srcHtml(g.meetingIds)}</li>`).join('');
  const meetings = (c.meetings || []).map((m) => `<li>${esc(sourceLabel(m))}${!m.hasContent ? ' <i>(sem conteúdo registrado)</i>' : m.fromTranscript ? ' <i>(resumo gerado da transcrição)</i>' : ''}</li>`).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dossiê${c.company ? ` — ${esc(c.company)}` : ''}</title><style>
  @page { margin: 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; color:#111; background:#fff; line-height:1.45; font-size:12.5px; max-width:900px; margin:0 auto; padding:20px; }
  h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:16px; margin:22px 0 8px; padding-bottom:4px; border-bottom:2px solid #F5C400; } h3 { font-size:13.5px; margin:12px 0 4px; }
  .meta { color:#555; font-size:11.5px; margin-bottom:10px; } ul { padding-left:18px; } li { margin-bottom:6px; }
  .src { color:#666; font-size:10.5px; margin-top:2px; } .note { color:#8a4b00; font-size:11.5px; margin-top:2px; }
  .card { border:1px solid #ddd; border-radius:6px; padding:8px 12px; margin-bottom:8px; page-break-inside:avoid; }
  .tag { display:inline-block; font-size:10px; font-weight:700; padding:1px 7px; border-radius:99px; background:#eee; color:#333; vertical-align:middle; }
  .tag.alterada { background:#ffe8cc; } .tag.revogada { background:#ffd9d6; } .tag.vigente { background:#d9f2e0; } .tag.incerta { background:#f2f2c9; }
  table { width:100%; border-collapse:collapse; font-size:11px; } th, td { border:1px solid #ddd; padding:4px 6px; text-align:left; vertical-align:top; } th { background:#f4f4f4; } tr.late td { background:#fff1f0; }
  </style></head><body>
  <h1>Dossiê do cliente${c.company ? ` — ${esc(c.company)}` : ''}</h1>
  <div class="meta">Compilado pela RENATA em ${esc(fmtBR(c.generatedAt))} a partir de ${st.meetingsTotal || 0} reunião(ões)${esc(period)}. Conteúdo gerado por IA com base apenas nas reuniões registradas — confira nas fontes citadas antes de usar em decisão.</div>
  ${sec('Resumo executivo', paras(c.executiveSummary))}
  ${sec('Linha do tempo', timeline && `<ul>${timeline}</ul>`)}
  ${sec('Frentes de trabalho', workstreams)}
  ${sec('Decisões', decisions && `<ul>${decisions}</ul>`)}
  ${sec('Pendências em aberto (dados do sistema)', table('Lado PRICETAX', openRows('pricetax')) + table('Lado do cliente', openRows('cliente')))}
  ${sec('Pessoas', people && `<ul>${people}</ul>`)}
  ${sec('Riscos e dependências', risks && `<ul>${risks}</ul>`)}
  ${sec('Lacunas e pontos a esclarecer', gaps && `<ul>${gaps}</ul>`)}
  ${sec('Reuniões consideradas', meetings && `<ul>${meetings}</ul>`)}
  </body></html>`;
}
