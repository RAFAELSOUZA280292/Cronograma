// Corpo de e-mail desenhado num iframe sem script (sandbox), com o HTML já higienizado no servidor. Usado na leitura,
// na prévia da citação e da assinatura (src/mail/Compose.jsx).
import React, { useEffect, useMemo, useRef, useState } from 'react';

const FRAME_CSS = 'html,body{margin:0;padding:0;background:#fff;color:#1f2937}body{padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}blockquote{margin:0 0 0 6px;padding-left:10px;border-left:2px solid #d1d5db;color:#4b5563}a{color:#1d4ed8}';

// iframe sem script: allow-same-origin só para medir a altura do conteúdo (sem allow-scripts nada roda lá dentro).
export default function MailFrame({ html, title = 'Conteúdo do e-mail', minHeight = 60 }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(120);
  const srcDoc = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>${FRAME_CSS}</style></head><body>${html}</body></html>`, [html]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let ro;
    const measure = () => {
      const doc = el.contentDocument;
      if (doc && doc.documentElement) setHeight(Math.min(Math.max(doc.documentElement.scrollHeight, minHeight), 20000));
    };
    const onLoad = () => {
      measure();
      const doc = el.contentDocument;
      if (doc && doc.body && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(measure); ro.observe(doc.body); }
      if (doc) doc.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
    };
    el.addEventListener('load', onLoad);
    measure();
    return () => { el.removeEventListener('load', onLoad); if (ro) ro.disconnect(); };
  }, [srcDoc]);

  return <iframe ref={ref} className="mail-frame" title={title} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={srcDoc} style={{ height }} />;
}
