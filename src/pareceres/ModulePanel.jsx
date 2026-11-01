// Gaveta lateral dos módulos Conhecimento/Pareceres/Modelos: a mesma gaveta compartilhada do SidePanel do App (src/ui/dialog.jsx) —
// role="dialog", foco preso, Esc fecha, Voltar do navegador fecha a gaveta em vez de sair do módulo.
// `onClose` deve ser o handler que já respeita a guarda de alterações não salvas.
import React from 'react';
import { Drawer } from '../ui/dialog.jsx';

export function ModulePanel({ title, onClose, width, children }) {
  return <Drawer title={title} onClose={onClose} overlayClassName="no-print" width={typeof width === 'number' ? `min(${width}px, 100%)` : (width || 'min(360px, 100%)')}>{children}</Drawer>;
}
