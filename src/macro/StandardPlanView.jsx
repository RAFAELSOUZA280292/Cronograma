// "Ver cronograma padrão" (2026-10-19): visualização SOMENTE LEITURA da proposta de cronograma padrão (fases → atividades principais → filhas), para o
// Rafael validar. Dados: shared/cronogramaPadrao.js (rascunho 0.1; não alimenta as empresas novas nem a Auditoria até ser validado).
// Botão no seletor de empresas (CompanySelectorScreen), só equipe PRICETAX.
import React, { useMemo, useState } from 'react';
import { Modal } from '../ui/dialog.jsx';
import { Button, EmptyState, Segmented } from '../ui/index.jsx';
import { loadXlsx } from '../lib/xlsxLoader.js';
import { notify } from '../ui/dialogs.jsx';
import { CRONOGRAMA_PADRAO as P } from '../../shared/cronogramaPadrao.js';

const ORIGEM = {
  modelo: { label: 'Modelo atual', tone: 'ok' },
  'novo-modelo': { label: 'Novo no modelo', tone: 'info' },
  'fluxo-vellore': { label: 'Fluxo da Vellore', tone: 'warn' },
};
const PRIO_TONE = { Crítica: 'bad', Alta: 'warn', Média: 'info', Baixa: '' };
const FASE = new Map(P.fases.map((f) => [f.id, f]));
const faseNome = (id) => (FASE.get(id) ? FASE.get(id).nome : '—');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const diaTexto = (d) => (d === null || d === undefined ? '' : `D+${d}`);
export function faseDasFilhas(m) {
  const fs = m.filhas.map((k) => k.fase).filter((f) => f > 0);
  if (!fs.length) return '';
  const a = Math.min(...fs); const b = Math.max(...fs);
  return a === b ? faseNome(a) : `${faseNome(a)} a ${faseNome(b)}`;
}
const prazoDe = (m) => { const ds = m.filhas.map((k) => k.dia).filter((d) => d !== null && d !== undefined); return ds.length ? Math.max(...ds) : null; };
const executorTxt = (k) => (k.quem ? `${k.exec} (${k.quem})` : k.exec);

const CSS = `
  .sp2 { display:flex; flex-direction:column; gap:14px; font-size:13px; color:var(--text-2); }
  .sp2-draft { display:flex; gap:8px; align-items:flex-start; font-size:12.5px; line-height:1.5; color:var(--text-2); background:rgba(255,159,64,.1); border:1px solid rgba(255,159,64,.45); border-radius:10px; padding:9px 12px; }
  .sp2-tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:8px; }
  .sp2-tile { background:var(--bg-2); border:1px solid var(--border-2); border-radius:12px; padding:9px 12px; }
  .sp2-tile b { display:block; font-size:21px; line-height:1.1; color:var(--text-1); font-variant-numeric:tabular-nums; }
  .sp2-tile span { display:block; margin-top:3px; font-size:11.5px; color:var(--text-4); }
  .sp2-bar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .sp2-search { flex:1 1 200px; min-width:0; background:var(--bg-2); border:1px solid var(--border-2); border-radius:8px; color:var(--text-1); padding:7px 10px; font-size:13px; }
  .sp2-search:focus { outline:none; border-color:var(--ui-accent, #F5C400); }
  .sp2-list { display:flex; flex-direction:column; gap:8px; }
  .sp2-main { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; min-width:0; }
  .sp2-main > summary { list-style:none; cursor:pointer; padding:10px 12px; display:flex; flex-direction:column; gap:4px; }
  .sp2-main > summary::-webkit-details-marker { display:none; }
  .sp2-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .sp2-title { font-weight:800; font-size:14px; color:var(--text-1); overflow-wrap:anywhere; }
  .sp2-meta { font-size:12px; color:var(--text-4); overflow-wrap:anywhere; }
  .sp2-desc { font-size:12.5px; color:var(--text-3); line-height:1.5; overflow-wrap:anywhere; }
  .sp2-kids { border-top:1px solid var(--border-1); display:flex; flex-direction:column; }
  .sp2-kid { padding:9px 12px; border-bottom:1px solid var(--border-1); display:flex; flex-direction:column; gap:4px; min-width:0; }
  .sp2-kid:last-child { border-bottom:0; }
  .sp2-kid-top { display:flex; gap:8px; align-items:baseline; }
  .sp2-code { font-size:11px; font-weight:800; color:var(--text-5); min-width:34px; font-variant-numeric:tabular-nums; }
  .sp2-kid-t { color:var(--text-1); overflow-wrap:anywhere; line-height:1.45; }
  .sp2-kid-m { display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding-left:42px; }
  .sp2-kid-x { padding-left:42px; font-size:12px; color:var(--text-4); line-height:1.5; overflow-wrap:anywhere; }
  .sp2-chip { display:inline-block; font-size:10.5px; font-weight:700; border-radius:999px; padding:1px 8px; border:1px solid var(--border-2); color:var(--text-3); white-space:nowrap; }
  .sp2-chip.ok { color:#3ecf6e; border-color:rgba(62,207,110,.5); } .sp2-chip.warn { color:#ff9f40; border-color:rgba(255,159,64,.5); }
  .sp2-chip.bad { color:#e2574c; border-color:rgba(226,87,76,.5); } .sp2-chip.info { color:#6aa9ff; border-color:rgba(62,166,255,.5); }
  .sp2-phase { margin:0; font-size:13px; font-weight:800; color:var(--text-1); }
  .sp2-phase small { display:block; margin-top:2px; font-size:12px; font-weight:500; color:var(--text-4); }
  .sp2-sec { display:flex; flex-direction:column; gap:8px; }
  .sp2-sec-main { font-size:12px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:var(--text-4); margin:6px 0 0; }
  .sp2-pt { background:var(--bg-2); border:1px solid var(--border-1); border-radius:12px; padding:11px 13px; display:flex; flex-direction:column; gap:5px; }
  .sp2-pt h4 { margin:0; font-size:13.5px; color:var(--text-1); }
  .sp2-pt p { margin:0; line-height:1.55; color:var(--text-3); overflow-wrap:anywhere; }
  .sp2-pt .sug { color:var(--text-2); }
  .sp2-actions { display:flex; flex-wrap:wrap; gap:8px; }
  body:has(.sp2) .asst-fab { display:none !important; }
  @media (max-width: 767px) { .sp2-tiles { grid-template-columns:repeat(3, 1fr); } .sp2-tile { padding:8px 10px; } .sp2-tile b { font-size:18px; } .sp2-main > summary { min-height:44px; } .sp2-kid-m, .sp2-kid-x { padding-left:0; } }
`;

function Chip({ tone, children, title }) { return <span className={`sp2-chip ${tone || ''}`} title={title}>{children}</span>; }

function KidRow({ k }) {
  const prazo = k.dia !== null && k.dia !== undefined ? diaTexto(k.dia) : k.recorrencia || 'Sem prazo';
  return (
    <div className="sp2-kid">
      <div className="sp2-kid-top"><span className="sp2-code">{k.id}</span><span className="sp2-kid-t">{k.titulo}</span></div>
      <div className="sp2-kid-m">
        <Chip>{k.fase > 0 ? faseNome(k.fase) : 'Contínuo'}</Chip>
        <Chip title="Dias a partir do kickoff do cliente">{prazo}</Chip>
        <Chip tone={PRIO_TONE[k.prio]}>{k.prio}</Chip>
        <Chip title="Quem executa">{executorTxt(k)}</Chip>
        {k.foraDaFase && <Chip tone="warn" title="O prazo do guia cai fora da janela da fase">Prazo fora da fase</Chip>}
        {k.conferir.length > 0 && <Chip tone="warn" title={k.conferir.join(' ')}>A conferir</Chip>}
        <Chip tone="info">A validar</Chip>
      </div>
      {(k.entrega || k.nota || k.conferir.length > 0 || k.norma.nt) && (
        <div className="sp2-kid-x">
          {k.entrega && <div><b>Entrega:</b> {k.entrega}</div>}
          {k.norma.nt && <div><b>Referência do guia:</b> {[k.norma.nt, k.norma.hom && k.norma.hom !== '—' && `homologação ${k.norma.hom}`, k.norma.prod && k.norma.prod !== '—' && `produção ${k.norma.prod}`].filter(Boolean).join(' · ')}</div>}
          {k.conferir.length > 0 && <div><b>A conferir:</b> {k.conferir.join(' ')}</div>}
          {k.nota && <div><b>Ajuste no texto:</b> {k.nota}</div>}
        </div>
      )}
    </div>
  );
}

function MainCard({ m, kids, open }) {
  const o = ORIGEM[m.origem];
  const lista = kids || m.filhas;
  const ate = prazoDe({ filhas: lista });
  return (
    <details className="sp2-main" open={open}>
      <summary>
        <div className="sp2-top">
          <span className="sp2-title">{m.titulo}</span>
          <Chip tone={o.tone}>{o.label}</Chip>
          {m.origem === 'fluxo-vellore' && <Chip tone="warn" title="Ainda não há atividades filhas definidas para esta etapa">Sem filhas definidas</Chip>}
        </div>
        <div className="sp2-meta">
          Responsável: {m.responsavel}{faseDasFilhas({ filhas: lista }) ? ` · ${faseDasFilhas({ filhas: lista })}` : ''}{ate !== null ? ` · até ${diaTexto(ate)}` : ''} · {lista.length ? plural(lista.length, 'atividade filha', 'atividades filhas') : 'ainda sem atividades filhas'}
        </div>
        <div className="sp2-desc">{m.descricao}</div>
      </summary>
      {lista.length > 0 && <div className="sp2-kids">{lista.map((k) => <KidRow key={k.id} k={k} />)}</div>}
    </details>
  );
}

export function buildText(visivel) {
  const L = [`Cronograma padrão PRICETAX — proposta ${P.versao} (${P.status} para validação)`, `Prazos em dias a partir do kickoff (D+n).`, ''];
  for (const m of visivel) {
    L.push(`${m.titulo.toUpperCase()} — ${m.responsavel} (${ORIGEM[m.origem].label})`, `  ${m.descricao}`);
    for (const k of m.filhas) L.push(`  • ${k.id} · ${k.titulo} [${k.fase > 0 ? faseNome(k.fase) : 'Contínuo'}; ${k.dia !== null ? diaTexto(k.dia) : k.recorrencia || 'sem prazo'}; ${k.prio}; ${executorTxt(k)}]${k.conferir.length ? ' (a conferir)' : ''}`);
    L.push('');
  }
  L.push('PONTOS PARA VALIDAR');
  P.pontos.forEach((p, i) => L.push(`${i + 1}. ${p.tema}: ${p.situacao} Sugestão: ${p.sugestao}`));
  return L.join('\n');
}

export function buildSheets() {
  return [
    { name: 'Atividades', widths: [30, 14, 16, 8, 80, 22, 12, 12, 10, 18, 22, 40, 40, 10, 16, 30],
      rows: [['Atividade principal', 'Responsável', 'Origem', 'Código', 'Atividade filha', 'Fase', 'Prazo (dias após o kickoff)', 'Recorrência', 'Prioridade', 'Executa', 'Apoio', 'Entrega', 'A conferir', 'Prazo fora da fase', 'Validação (preencher)', 'Comentário (preencher)'],
        ...P.atividades.flatMap((m) => (m.filhas.length ? m.filhas : [null]).map((k) => (k
          ? [m.titulo, m.responsavel, ORIGEM[m.origem].label, k.id, k.titulo, k.fase > 0 ? faseNome(k.fase) : 'Contínuo', k.dia ?? '', k.recorrencia, k.prio, executorTxt(k), k.apoio.join(' | '), k.entrega, k.conferir.join(' '), k.foraDaFase ? 'Sim' : '', '', '']
          : [m.titulo, m.responsavel, ORIGEM[m.origem].label, '', '(sem atividades filhas definidas)', '', '', '', '', '', '', '', '', '', '', ''])))] },
    { name: 'Fases', widths: [26, 10, 10, 70], rows: [['Fase', 'Início (D+)', 'Fim (D+)', 'Marco'], ...P.fases.map((f) => [f.nome, f.dia ?? '', f.diaFim ?? '', f.marco])] },
    { name: 'Pontos para validar', widths: [26, 90, 60, 30], rows: [['Tema', 'Situação', 'Sugestão', 'Decisão (preencher)'], ...P.pontos.map((p) => [p.tema, p.situacao, p.sugestao, ''])] },
  ];
}

async function downloadXlsx() {
  let X; try { X = await loadXlsx(); } catch { notify('Não foi possível preparar a planilha agora. Recarregue a página e tente de novo.', { tone: 'error' }); return; }
  const wb = X.utils.book_new();
  for (const sh of buildSheets()) { const ws = X.utils.aoa_to_sheet(sh.rows); ws['!cols'] = sh.widths.map((wch) => ({ wch })); X.utils.book_append_sheet(wb, ws, sh.name); }
  X.writeFile(wb, `cronograma-padrao-proposta-${P.versao}-${P.geradoEm}.xlsx`);
}

export default function StandardPlanViewModal({ onClose }) {
  const [view, setView] = useState('atividade');
  const [q, setQ] = useState('');
  const total = useMemo(() => P.atividades.reduce((s, m) => s + m.filhas.length, 0), []);
  const aConferir = useMemo(() => P.atividades.reduce((s, m) => s + m.filhas.filter((k) => k.conferir.length).length, 0), []);

  const visivel = useMemo(() => {
    const t = norm(q).trim();
    if (!t) return P.atividades;
    return P.atividades.map((m) => {
      const hitMain = norm(`${m.titulo} ${m.responsavel}`).includes(t);
      const kids = hitMain ? m.filhas : m.filhas.filter((k) => norm(`${k.id} ${k.titulo} ${k.area} ${k.exec} ${k.quem} ${k.entrega}`).includes(t));
      return hitMain || kids.length || norm(m.descricao).includes(t) ? { ...m, filhas: kids } : null;
    }).filter(Boolean);
  }, [q]);

  async function copy() {
    try { await navigator.clipboard.writeText(buildText(visivel)); notify('Cronograma copiado.', { tone: 'success' }); } catch { notify('Não consegui copiar. Use "Baixar Excel".', { tone: 'error' }); }
  }

  return (
    <Modal title="Cronograma padrão" subtitle={`Proposta ${P.versao} · rascunho para validação`} size="lg" width="min(1080px, 100%)" onClose={onClose}
      footer={<div className="sp2-actions"><Button onClick={copy}>Copiar texto</Button><Button variant="primary" onClick={downloadXlsx}>Baixar Excel</Button></div>}>
      <style>{CSS}</style>
      <div className="sp2">
        <div className="sp2-draft"><span><b>Rascunho para você validar.</b> Isto é só para visualizar: as empresas novas continuam recebendo o modelo de 12 atividades, e a Auditoria compara com ele. Quando você aprovar, este passa a ser o padrão. Prazos em dias a partir do kickoff (D+n).</span></div>
        <div className="sp2-tiles">
          <div className="sp2-tile"><b>{P.fases.length - 1}</b><span>fases</span></div>
          <div className="sp2-tile"><b>{P.atividades.length}</b><span>atividades principais</span></div>
          <div className="sp2-tile"><b>{total}</b><span>atividades filhas</span></div>
          <div className="sp2-tile"><b>{aConferir}</b><span>filhas com algo a conferir</span></div>
          <div className="sp2-tile"><b>{P.pontos.length}</b><span>pontos para validar</span></div>
        </div>
        <div className="sp2-bar">
          <Segmented label="Forma de ver" value={view} onChange={setView} options={[{ value: 'atividade', label: 'Por atividade' }, { value: 'fase', label: 'Por fase' }, { value: 'pontos', label: `Pontos para validar (${P.pontos.length})` }]} />
          {view !== 'pontos' && <input className="sp2-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar atividade ou código (ex.: DANFE, F11, Compras)" aria-label="Buscar no cronograma padrão" />}
        </div>

        {view === 'atividade' && (visivel.length === 0 ? <EmptyState title="Nada encontrado" description="Nenhuma atividade bate com a busca." /> : (
          <div className="sp2-list">{visivel.map((m) => <MainCard key={m.key} m={m} open={!!q.trim()} />)}</div>
        ))}

        {view === 'fase' && (visivel.length === 0 ? <EmptyState title="Nada encontrado" description="Nenhuma atividade bate com a busca." /> : (
          <div className="sp2-list">
            {[...P.fases.filter((f) => f.id > 0), P.fases[0]].map((f) => {
              const grupos = visivel.map((m) => ({ m, kids: m.filhas.filter((k) => k.fase === f.id) })).filter((g) => g.kids.length);
              const n = grupos.reduce((s, g) => s + g.kids.length, 0);
              return (
                <div className="sp2-sec" key={f.id}>
                  <h3 className="sp2-phase">{f.nome} · {plural(n, 'atividade', 'atividades')}<small>{f.dia !== null ? `D+${f.dia} a D+${f.diaFim} · ` : ''}{f.marco}</small></h3>
                  {grupos.length === 0 ? <div className="sp2-meta">Nenhuma atividade nesta fase{q.trim() ? ' com essa busca' : ''}.</div> : grupos.map((g) => <MainCard key={g.m.key} m={g.m} kids={g.kids} open={!!q.trim()} />)}
                </div>
              );
            })}
            {!q.trim() && P.atividades.some((m) => m.filhas.length === 0) && (
              <div className="sp2-sec">
                <h3 className="sp2-phase">Etapas sem atividades filhas definidas<small>Aparecem na visão "Por atividade"; ainda não têm fase nem prazo no guia.</small></h3>
                {P.atividades.filter((m) => m.filhas.length === 0).map((m) => <MainCard key={m.key} m={m} />)}
              </div>
            )}
          </div>
        ))}

        {view === 'pontos' && (
          <div className="sp2-list">
            {P.pontos.map((p, i) => (
              <div className="sp2-pt" key={p.id}>
                <h4>{i + 1}. {p.tema}</h4>
                <p>{p.situacao}</p>
                <p className="sug"><b>Sugestão:</b> {p.sugestao}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
