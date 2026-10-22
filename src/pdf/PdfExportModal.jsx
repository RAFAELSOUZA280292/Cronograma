import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button, Segmented } from '../ui/index.jsx';
import { Modal } from '../ui/dialog.jsx';
import { PDF_DEFAULTS, PDF_SECTIONS, PDF_THEMES, mergePdfPrefs } from './pdfTheme.js';

// Janela "Exportar PDF": tema escuro ou claro, orientação e o que entra no relatório.
// mode 'company' = relatório do cronograma; mode 'meeting' = uma reunião (só tema).
const ESSENTIAL = { resumo: true, fases: true, timeline: false, atrasadas: true, proximas: true, reunioes: true, subs: false, concluidas: false };

function Swatch({ theme, active }) {
  const t = PDF_THEMES[theme];
  return (
    <div aria-hidden="true" style={{ width: 92, height: 58, borderRadius: 6, background: t.bg, border: `2px solid ${active ? '#F5C400' : t.line}`, padding: 7, boxSizing: 'border-box', flexShrink: 0 }}>
      <div style={{ height: 5, width: 40, borderRadius: 2, background: t.fill, marginBottom: 6 }} />
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>{[0, 1, 2].map((i) => <div key={i} style={{ flex: 1, height: 12, borderRadius: 2, background: t.card, border: `1px solid ${t.line}` }} />)}</div>
      <div style={{ height: 4, borderRadius: 2, background: t.track }}><div style={{ height: 4, width: '62%', borderRadius: 2, background: t.fill }} /></div>
    </div>
  );
}

export function PdfExportModal({ mode = 'company', prefs, onConfirm, onClose }) {
  const [draft, setDraft] = useState(() => mergePdfPrefs(prefs || PDF_DEFAULTS));
  const isCompany = mode === 'company';
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = (key) => setDraft((d) => ({ ...d, sections: { ...d.sections, [key]: !d.sections[key] } }));
  const anySection = Object.values(draft.sections).some(Boolean);
  const pickTheme = (key) => (
    <button key={key} type="button" aria-pressed={draft.theme === key} onClick={() => set({ theme: key })}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 8, cursor: 'pointer', textAlign: 'left', background: 'transparent', color: 'var(--text-1)', border: `1px solid ${draft.theme === key ? '#F5C400' : 'var(--border-2)'}`, flex: 1 }}>
      <Swatch theme={key} active={draft.theme === key} />
      <span style={{ fontSize: 13, fontWeight: 700 }}>{PDF_THEMES[key].label}
        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 400, color: 'var(--text-4)', marginTop: 2 }}>{key === 'dark' ? 'Padrão visual da marca, ótimo para apresentar' : 'Fundo branco, ótimo para imprimir'}</span>
      </span>
    </button>
  );
  return (
    <Modal title="Exportar PDF" subtitle={isCompany ? 'Escolha o visual e o que entra no relatório' : 'Escolha o visual da reunião'} size="md" onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={FileText} disabled={isCompany && !anySection} disabledReason="Marque pelo menos uma seção" onClick={() => onConfirm(draft)}>Gerar PDF</Button>
        </>
      )}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>Visual</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{['dark', 'light'].map(pickTheme)}</div>

      {isCompany && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', margin: '18px 0 8px' }}>Orientação da página</div>
          <Segmented label="Orientação" value={draft.orientation} onChange={(v) => set({ orientation: v })} options={[{ value: 'landscape', label: 'Paisagem' }, { value: 'portrait', label: 'Retrato' }]} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 8px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>O que entra no relatório</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" onClick={() => set({ sections: { ...ESSENTIAL } })}>Essencial</Button>
              <Button size="sm" onClick={() => set({ sections: Object.fromEntries(PDF_SECTIONS.map((s) => [s.key, true])) })}>Tudo</Button>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 2 }}>
            {PDF_SECTIONS.map((s) => (
              <label key={s.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!draft.sections[s.key]} onChange={() => toggle(s.key)} style={{ marginTop: 2 }} />
                <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{s.label}<span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-4)' }}>{s.hint}</span></span>
              </label>
            ))}
          </div>
        </>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 16 }}>Vai abrir a impressão do navegador: escolha “Salvar como PDF”. As escolhas ficam salvas neste navegador.</div>
    </Modal>
  );
}
