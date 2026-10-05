import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import WelcomeSetup from './WelcomeSetup.jsx';

// As boas-vindas aparecem por cima de QUALQUER tela (o App tem dezenas de retornos por módulo), então vivem numa raiz
// React própria, fora da árvore principal. Fecha sozinha quando o usuário passa a constar como configurado.
export function useWelcomeSetup(user, onDone) {
  const id = user ? user.id : null;
  const done = user ? !!user.onboardingDone : true;
  useEffect(() => {
    if (!id || done) return undefined;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<WelcomeSetup user={user} onDone={onDone} />);
    return () => { setTimeout(() => { root.unmount(); host.remove(); }, 0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, done]);
}
