// Gaveta lateral dos módulos Conhecimento/Pareceres/Modelos: mesma aparência do SidePanel do App, mas acessível
// (role="dialog", foco preso, Esc fecha, Voltar do navegador fecha a gaveta em vez de sair do módulo).
// `onClose` deve ser o handler que já respeita a guarda de alterações não salvas.
import React from 'react';
import { X } from 'lucide-react';
import { useIsMobile } from '../App.jsx';
import { DialogOverlay } from '../ui/dialog.jsx';

export function ModulePanel({ title, onClose, width, children }) {
  const isMobile = useIsMobile();
  const panel = {
    width: isMobile ? '100vw' : (width || 360), maxWidth: isMobile ? '100vw' : '92vw', height: '100%', background: 'var(--bg-2)',
    borderLeft: '1px solid var(--border-2)', overflowY: 'auto',
  };
  return (
    <DialogOverlay
      className="no-print" label={title} onClose={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'flex-end', zIndex: 50, outline: 'none' }}
    >
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottom: '1px solid var(--border-1)', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{title}</div>
          <button type="button" aria-label="Fechar" title="Fechar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-5)', cursor: 'pointer', padding: 4 }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </DialogOverlay>
  );
}
