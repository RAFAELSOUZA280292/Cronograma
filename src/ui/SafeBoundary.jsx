// Limite de erro (error boundary) do app (2026-10-16). Sem ele, qualquer falha ao desenhar uma tela deixa o app INTEIRO em branco. Três formas:
//  • variant="block" (padrão): aviso no lugar da peça que falhou; o resto da tela (barra do módulo, outras peças) segue funcionando;
//  • variant="floating": faixa fixa no rodapé — para modais, cujo lugar na árvore não é visível; o botão da ação "Fechar" fecha o modal;
//  • variant="page": cartão central — último recurso em volta de tudo, com "Recarregar a página".
// `resetKey`: quando muda (trocar de módulo, de aba, fechar o modal), o limite se rearma sozinho. O erro vai para o log do servidor
// (`reportClientError`). IMPORTANTE: o estado da peça que falhou é descartado; o do restante da tela é preservado.
import React from 'react';
import { reportClientError } from '../lib/clientError.js';

const BTN = { fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-2, #333)', background: 'var(--bg-3, #1f1f29)', color: 'var(--text-2, #ddd)', cursor: 'pointer', fontFamily: 'inherit', minHeight: 36 };
const BTN_PRIMARY = { ...BTN, border: '1px solid var(--ui-accent, #F5C400)', background: 'var(--ui-accent, #F5C400)', color: '#17171f', fontWeight: 800 };

export default class SafeBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.where || this.props.label || 'tela'}]`, error);
    reportClientError(this.props.where || this.props.label || 'tela', error, info && info.componentStack);
    if (this.props.onError) { try { this.props.onError(error); } catch (e) { /* ignora */ } }
  }
  componentDidUpdate(prev) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const { variant = 'block', label, actions } = this.props;
    const retry = () => this.setState({ failed: false });
    const extra = (actions || []).map((a) => <button key={a.label} type="button" style={BTN} onClick={() => { a.onClick(); }}>{a.label}</button>);
    const what = label || 'esta parte';

    if (variant === 'page') {
      return (
        <div role="alert" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 480, padding: '24px 26px', borderRadius: 14, border: '1px solid var(--border-2, #333)', background: 'var(--bg-2, #16161f)', color: 'var(--text-2, #ddd)', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-1, #fff)', marginBottom: 8 }}>Algo deu errado</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-4, #aaa)', marginBottom: 16 }}>Não foi possível mostrar {what}. O que já estava salvo está seguro; o que você tinha acabado de digitar pode não ter sido salvo. O erro foi registrado para a equipe.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" style={BTN_PRIMARY} onClick={() => window.location.reload()}>Recarregar a página</button>
              <button type="button" style={BTN} onClick={retry}>Tentar de novo</button>
              {extra}
            </div>
          </div>
        </div>
      );
    }

    const box = variant === 'floating'
      ? { position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 10000, width: 'min(560px, calc(100vw - 24px))', boxShadow: '0 12px 32px rgba(0,0,0,.45)' }
      : { margin: '0 0 12px' };
    return (
      <div role="alert" style={{ ...box, padding: '10px 14px', border: '1px solid var(--border-2, #333)', borderRadius: 12, background: 'var(--bg-2, #16161f)', fontSize: 12.5, color: 'var(--text-3, #bbb)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontFamily: 'Inter, sans-serif' }}>
        <span style={{ flex: '1 1 240px' }}>Não foi possível mostrar {what}. {variant === 'floating' ? 'O resto do sistema segue funcionando.' : 'O resto da tela segue funcionando.'}</span>
        <button type="button" style={BTN} onClick={retry}>Tentar de novo</button>
        {extra}
      </div>
    );
  }
}

// Envolve um componente de modal/gaveta com um limite flutuante (2026-10-16): se ele falhar ao desenhar — no corpo dele OU em qualquer filho —, o modal some,
// a tela de trás segue funcionando e a faixa oferece "Tentar de novo" e "Fechar" (chama o `onCancel`/`onClose` que o próprio modal recebeu). Os modais
// do CRM e do XFlow são montados só enquanto abertos (`estado && modal`), então ao fechar o limite é desmontado e rearma sozinho na próxima abertura.
export function guardedModal(Impl, label, where) {
  function Guarded(props) {
    const close = props.onCancel || props.onClose;
    return (
      <SafeBoundary variant="floating" label={label} where={where} actions={close ? [{ label: 'Fechar', onClick: () => close() }] : undefined}>
        {React.createElement(Impl, props)}
      </SafeBoundary>
    );
  }
  Guarded.displayName = `Guarded(${Impl.displayName || Impl.name || where})`;
  return Guarded;
}
