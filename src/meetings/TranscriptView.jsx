// Card "Transcrição da reunião" — 3 modos de leitura (Completa/Por
// temas/Highlights) em vez do <textarea> gigante de antes. A fonte
// bruta (`meeting.transcript`) nunca é alterada aqui — os modos são só
// visualizações derivadas (PROJECT_CONTEXT.md, seção de Reunião).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Search, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import { initials, avatarColor } from './todoUtils.js';
import { parseTranscript, sliceEntriesByTopics, highlightTypeMeta } from './meetingUtils.js';

const PAGE_SIZE = 150;
const MODES = [
  { key: 'completa', label: 'Completa' },
  { key: 'temas', label: 'Por temas' },
  { key: 'highlights', label: 'Highlights' },
];

const TRANSCRIPT_CSS = `
  .mtg-transcript-card { background: var(--bg-2); border: 1px solid var(--border-1); border-radius: 12px; padding: 18px; }
  .mtg-transcript-head { display:flex; align-items:center; gap:8px; font-weight:800; font-size:14px; color:var(--text-1); margin-bottom:12px; }
  .mtg-transcript-search { position:relative; margin-bottom:12px; }
  .mtg-transcript-search input { padding-left:30px; padding-right:90px; }
  .mtg-transcript-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-6); }
  .mtg-transcript-search-nav { position:absolute; right:6px; top:50%; transform:translateY(-50%); display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-5); }
  .mtg-transcript-tabs { display:flex; gap:6px; margin-bottom:14px; }
  .mtg-transcript-tab { font-size:12px; font-weight:700; padding:6px 12px; border-radius:999px; border:1px solid var(--border-2); background:var(--bg-3); color:var(--text-5); cursor:pointer; }
  .mtg-transcript-tab.active { border-color:#F5C400; background:rgba(245,196,0,.12); color:#F5C400; }
  .mtg-bubble { display:flex; gap:10px; padding:10px 0; }
  .mtg-bubble-avatar { width:26px; height:26px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:800; flex-shrink:0; }
  .mtg-bubble-head { display:flex; align-items:baseline; gap:8px; margin-bottom:2px; }
  .mtg-bubble-speaker { font-weight:700; font-size:12.5px; color:var(--text-1); }
  .mtg-bubble-time { font-size:11px; color:var(--text-6); }
  .mtg-bubble-text { font-size:13px; line-height:1.55; color:var(--text-2); white-space:pre-wrap; }
  .mtg-transcript-plain { font-size:13px; line-height:1.6; color:var(--text-2); white-space:pre-wrap; }
  .mtg-topic-head { display:flex; align-items:center; gap:8px; padding:8px 2px; cursor:pointer; user-select:none; font-weight:700; font-size:13px; color:var(--text-2); }
  .mtg-highlight-card { display:flex; flex-direction:column; gap:4px; border-radius:9px; border:1px solid; padding:10px 12px; margin-bottom:8px; }
  .mtg-highlight-type { font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
  .mtg-highlight-time { font-size:10.5px; opacity:.75; margin-left:6px; }
  .mtg-highlight-quote { font-size:13px; font-style:italic; color:var(--text-2); }
  .mtg-transcript-empty { text-align:center; padding:32px 16px; color:var(--text-6); font-size:12.5px; }
  .mtg-transcript-loadmore { display:block; margin:14px auto 0; }
  mark.mtg-tmatch { background:rgba(245,196,0,.35); color:inherit; border-radius:3px; }
  mark.mtg-tmatch.active { background:#F5C400; color:#111; }
`;

function highlightText(text, query, matchCounterRef) {
  if (!query) return text;
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = String(text).split(re);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const idx = matchCounterRef.current++;
      return <mark key={i} className="mtg-tmatch" data-match-index={idx}>{part}</mark>;
    }
    return part;
  });
}

export function TranscriptView({ meeting }) {
  const [mode, setMode] = useState('completa');
  const [search, setSearch] = useState('');
  const [activeMatch, setActiveMatch] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [totalMatches, setTotalMatches] = useState(0);
  const containerRef = useRef(null);
  const matchCounter = useRef(0);
  matchCounter.current = 0;

  const entries = useMemo(() => parseTranscript(meeting.transcript), [meeting.transcript]);
  const topics = meeting.topics || [];
  const highlights = meeting.highlights || [];
  const topicSections = useMemo(() => sliceEntriesByTopics(entries, topics), [entries, topics]);

  // matchCounter só fica com a contagem certa depois que o JSX abaixo é
  // avaliado (highlightText incrementa como efeito colateral durante o
  // render) — por isso o total só pode ser lido de volta num efeito
  // depois do commit, nunca no corpo da função.
  useEffect(() => {
    if (matchCounter.current !== totalMatches) setTotalMatches(matchCounter.current);
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const marks = containerRef.current.querySelectorAll('mark.mtg-tmatch');
    marks.forEach((m) => m.classList.remove('active'));
    const el = containerRef.current.querySelector(`mark[data-match-index="${activeMatch}"]`);
    if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  });

  useEffect(() => { setActiveMatch(0); }, [search, mode]);

  function renderBubbles(list) {
    const shown = list.slice(0, visibleCount);
    return (
      <>
        {shown.map((e, i) => {
          const c = avatarColor(e.speaker);
          return (
            <div key={i} className="mtg-bubble">
              <div className="mtg-bubble-avatar" style={{ background: c.bg, color: c.fg }}>{initials(e.speaker)}</div>
              <div>
                <div className="mtg-bubble-head">
                  <span className="mtg-bubble-speaker">{e.speaker}</span>
                  {e.time && <span className="mtg-bubble-time">{e.time}</span>}
                </div>
                <div className="mtg-bubble-text">{highlightText(e.text, search, matchCounter)}</div>
              </div>
            </div>
          );
        })}
        {list.length > visibleCount && (
          <button type="button" className="mtg-transcript-loadmore" style={{ background: 'var(--bg-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '7px 16px', fontSize: 12, cursor: 'pointer', color: 'var(--text-3)' }} onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
            Carregar mais ({list.length - visibleCount} restantes)
          </button>
        )}
      </>
    );
  }

  function renderCompleta() {
    if (entries) return renderBubbles(entries);
    if (!meeting.transcript) return <div className="mtg-transcript-empty">Esta reunião ainda não possui transcrição.</div>;
    return <div className="mtg-transcript-plain">{highlightText(meeting.transcript, search, matchCounter)}</div>;
  }

  function renderPorTemas() {
    if (topics.length === 0) {
      return <div className="mtg-transcript-empty">Esta reunião foi processada antes deste recurso, ou ainda não passou pela IA — não há tópicos identificados.</div>;
    }
    return topicSections.map((t, idx) => (
      <TopicSection key={idx} topic={t} search={search} matchCounter={matchCounter} />
    ));
  }

  function renderHighlights() {
    if (highlights.length === 0) {
      return <div className="mtg-transcript-empty">Nenhum highlight identificado — reuniões processadas antes deste recurso não têm esse dado.</div>;
    }
    return highlights.map((h, i) => {
      const meta = highlightTypeMeta(h.type);
      return (
        <div key={i} className="mtg-highlight-card" style={{ borderColor: meta.border, background: meta.bg }}>
          <div>
            <span className="mtg-highlight-type" style={{ color: meta.color }}>{meta.label}</span>
            {h.time && <span className="mtg-highlight-time" style={{ color: meta.color }}>{h.time}</span>}
          </div>
          <div className="mtg-highlight-quote">"{h.quote}"</div>
        </div>
      );
    });
  }

  function navigateMatch(dir) {
    if (totalMatches === 0) return;
    setActiveMatch((v) => (v + dir + totalMatches) % totalMatches);
  }

  return (
    <div className="mtg-transcript-card">
      <style>{TRANSCRIPT_CSS}</style>
      <div className="mtg-transcript-head"><Mic size={16} /> Transcrição da reunião</div>

      <div className="mtg-transcript-search">
        <Search size={13} className="mtg-transcript-search-icon" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar na transcrição..." />
        {search && (
          <div className="mtg-transcript-search-nav">
            <span>{totalMatches} resultado{totalMatches === 1 ? '' : 's'}</span>
            <button type="button" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-5)', display: 'flex' }} onClick={() => navigateMatch(-1)}><ChevronUp size={14} /></button>
            <button type="button" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-5)', display: 'flex' }} onClick={() => navigateMatch(1)}><ChevronDown size={14} /></button>
          </div>
        )}
      </div>

      <div className="mtg-transcript-tabs">
        {MODES.map((m) => (
          <button key={m.key} type="button" className={`mtg-transcript-tab ${mode === m.key ? 'active' : ''}`} onClick={() => setMode(m.key)}>{m.label}</button>
        ))}
      </div>

      <div ref={containerRef}>
        {mode === 'completa' && renderCompleta()}
        {mode === 'temas' && renderPorTemas()}
        {mode === 'highlights' && renderHighlights()}
      </div>
    </div>
  );
}

function TopicSection({ topic, search, matchCounter }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="mtg-topic-head" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {topic.title}
        {topic.startTime && <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-6)' }}>{topic.startTime}</span>}
      </div>
      {open && (
        topic.entries.length > 0 ? (
          <div style={{ paddingLeft: 22 }}>
            {topic.entries.map((e, i) => {
              const c = avatarColor(e.speaker);
              return (
                <div key={i} className="mtg-bubble">
                  <div className="mtg-bubble-avatar" style={{ background: c.bg, color: c.fg }}>{initials(e.speaker)}</div>
                  <div>
                    <div className="mtg-bubble-head">
                      <span className="mtg-bubble-speaker">{e.speaker}</span>
                      {e.time && <span className="mtg-bubble-time">{e.time}</span>}
                    </div>
                    <div className="mtg-bubble-text">{highlightText(e.text, search, matchCounter)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ paddingLeft: 22, fontSize: 12, color: 'var(--text-6)' }}>Sem conteúdo reconhecido pra esse trecho — veja a aba Completa.</div>
        )
      )}
    </div>
  );
}
