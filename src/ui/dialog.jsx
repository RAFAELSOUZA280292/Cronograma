// Modal/gaveta acessível (Onda 1, §81): troque `<div ... onClick={fechar}>` do overlay por <DialogOverlay onClose={fechar} ...>.
// Já dá role="dialog" + aria-modal, foco preso (Tab não escapa) e devolvido ao fechar, Esc fecha o de cima (passe o
// requestClose da guarda de alterações) e o Voltar do navegador fecha em vez de sair do módulo (history={false} para
// quem já empilha o próprio histórico, como ActivityDetailModal/MeetingDetailModal).
import React, { useEffect } from 'react';
import { useDialog } from '../lib/nav.js';

export function DialogOverlay({ onClose, label, history, esc, children, ...rest }) {
  const dlg = useDialog(onClose, { history, esc });
  // Sem rótulo explícito, o nome do diálogo vem do primeiro título dentro dele.
  useEffect(() => {
    const el = dlg.ref.current;
    if (!el || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
    const h = el.querySelector('h1,h2,h3,[data-dialog-title]');
    if (h) { if (!h.id) h.id = `dlg-${Math.random().toString(36).slice(2, 8)}`; el.setAttribute('aria-labelledby', h.id); }
  }, []);
  return (
    <div {...rest} {...dlg} aria-label={label || rest['aria-label']} onClick={onClose}>
      {children}
    </div>
  );
}
