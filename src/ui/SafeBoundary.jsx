// Limite de erro de uma peça isolada da tela (2026-10-16): se ela falhar ao desenhar, mostra um aviso pequeno com "Tentar de novo" em vez de deixar o
// app inteiro em branco. Usado no painel "Calendário, anotações e atalhos". `onError` recebe o erro (ex.: para recolher uma preferência salva).
import React from 'react';

export default class SafeBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label || 'painel'}]`, error);
    if (this.props.onError) { try { this.props.onError(error); } catch (e) { /* ignora */ } }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ margin: '0 0 12px', padding: '10px 14px', border: '1px solid var(--border-2)', borderRadius: 12, background: 'var(--bg-2)', fontSize: 12.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>Não foi possível mostrar {this.props.label || 'esta parte'}. O resto da tela segue funcionando.</span>
        <button type="button" onClick={() => this.setState({ failed: false })} style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--bg-3)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', minHeight: 32 }}>Tentar de novo</button>
      </div>
    );
  }
}
