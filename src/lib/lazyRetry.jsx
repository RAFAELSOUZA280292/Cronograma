// Carregamento sob demanda das telas pesadas (code-splitting, 2026-10-16). `lazyRetry` é um React.lazy que, se o pedaço (chunk) não puder ser
// baixado — o caso típico é uma aba antiga aberta depois de um deploy, cujo arquivo com hash já não existe —, mostra um aviso com botão de
// recarregar em vez de deixar a tela em branco. NUNCA recarrega sozinho: a pessoa pode ter algo digitado e ainda não salvo.
import React from 'react';

function ChunkError() {
  return (
    <div role="alert" style={{ margin: '48px auto', maxWidth: 460, padding: '20px 22px', borderRadius: 14, border: '1px solid var(--border-2, #333)', background: 'var(--bg-2, #16161f)', color: 'var(--text-2, #ddd)', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-1, #fff)', marginBottom: 6 }}>O sistema foi atualizado</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-4, #aaa)', marginBottom: 14 }}>Esta parte não pôde ser aberta porque há uma versão mais nova. Termine o que estiver fazendo, salve e recarregue a página.</div>
      <button type="button" onClick={() => window.location.reload()} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--ui-accent, #F5C400)', background: 'var(--ui-accent, #F5C400)', color: '#17171f', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Recarregar a página</button>
    </div>
  );
}

export function lazyRetry(factory) {
  return React.lazy(() => factory().catch((e) => {
    console.error('Falha ao carregar parte do sistema (provável versão nova publicada):', e && e.message);
    return { default: ChunkError };
  }));
}
