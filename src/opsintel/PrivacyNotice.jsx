import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api.js';

// Transparência (LGPD): qualquer pessoa logada lê o que o app mede sobre o uso, para quê, quem vê e por quanto tempo.
export default function PrivacyNotice() {
  const [state, setState] = useState({ loading: true, policy: null, error: '' });
  useEffect(() => {
    let alive = true;
    apiGet('/api/activity/policy').then((d) => { if (alive) setState({ loading: false, policy: d.policy, error: '' }); }).catch((e) => { if (alive) setState({ loading: false, policy: null, error: e.message || 'Não foi possível carregar.' }); });
    return () => { alive = false; };
  }, []);
  const { loading, policy: p, error } = state;
  if (loading) return <div style={{ color: 'var(--text-4)', fontSize: 13 }}>Carregando…</div>;
  if (error) return <div style={{ color: 'var(--text-3)', fontSize: 13 }}>{error}</div>;
  const h = { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-4)', margin: '16px 0 6px' };
  const li = { fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)', marginBottom: 3 };
  const para = { fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)', margin: 0 };
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{p.title}</div>
      <div style={h}>Para que serve</div><p style={para}>{p.purpose}</p>
      <div style={h}>Base legal</div><p style={para}>{p.legalBasis}</p>
      <div style={h}>O que é coletado</div><ul style={{ margin: 0, paddingLeft: 18 }}>{p.collected.map((x, i) => <li key={i} style={li}>{x}</li>)}</ul>
      <div style={h}>O que não é coletado</div><ul style={{ margin: 0, paddingLeft: 18 }}>{p.notCollected.map((x, i) => <li key={i} style={li}>{x}</li>)}</ul>
      <div style={h}>Quem vê</div><p style={para}>{p.access}</p>
      <div style={h}>Por quanto tempo fica guardado</div><p style={para}>{p.retention}</p>
      {p.interpretation && <><div style={h}>Como interpretar</div><ul style={{ margin: 0, paddingLeft: 18 }}>{p.interpretation.map((x, i) => <li key={i} style={li}>{x}</li>)}</ul></>}
    </div>
  );
}
