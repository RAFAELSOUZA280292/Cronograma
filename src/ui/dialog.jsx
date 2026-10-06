// Modal/gaveta acessível (Onda 1, §81): troque `<div ... onClick={fechar}>` do overlay por <DialogOverlay onClose={fechar} ...>.
// Já dá role="dialog" + aria-modal, foco preso (Tab não escapa) e devolvido ao fechar, Esc fecha o de cima (passe o
// requestClose da guarda de alterações) e o Voltar do navegador fecha em vez de sair do módulo (history={false} para
// quem já empilha o próprio histórico, como ActivityDetailModal/MeetingDetailModal).
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useDialog } from '../lib/nav.js';
import { IconButton } from './index.jsx';

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

// Modal e Drawer únicos: cabeçalho (título + Fechar), corpo que rola, rodapé de ações. Mesmo Esc/Voltar/foco de DialogOverlay.
// `error` aparece dentro (a ação que falhou não fecha a janela); `footer` recebe os botões (Cancelar à esquerda do primário).
function Frame({ kind, title, subtitle, onClose, children, footer, error, size, width, history, busy, label }) {
  const close = () => { if (!busy) onClose(); };
  return (
    <DialogOverlay onClose={close} history={history} label={label || title} className={`ui-frame-overlay ${kind}`}>
      <div className={`ui-frame ${kind} ${size || ''}`} style={width ? { width } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="ui-frame-head">
          <div className="ui-frame-titles">
            <h2 className="ui-frame-title">{title}</h2>
            {subtitle && <div className="ui-frame-sub">{subtitle}</div>}
          </div>
          <IconButton label="Fechar" icon={X} onClick={close} disabled={busy} disabledReason="Aguarde terminar" />
        </div>
        <div className="ui-frame-body">{children}</div>
        {error && <div className="ui-frame-err" role="alert">{error}</div>}
        {footer && <div className="ui-frame-foot">{footer}</div>}
      </div>
    </DialogOverlay>
  );
}
export function Modal(props) { return <Frame kind="modal" {...props} />; }
export function Drawer(props) { return <Frame kind="drawer" {...props} />; }
