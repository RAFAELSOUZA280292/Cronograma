import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import LaunchTour from './LaunchTour.jsx';

// Mesma ideia de src/daily/useWelcomeSetup.jsx: raiz React própria, por cima de qualquer tela. Espera a boas-vindas do dia
// (onboardingDone) para não empilhar as duas num usuário novo; fecha quando o servidor deixa de marcar user.launchTour.
export function useLaunchTour(user, onDone) {
  const id = user ? user.id : null;
  const pending = !!(user && user.launchTour && user.onboardingDone);
  useEffect(() => {
    if (!id || !pending) return undefined;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<LaunchTour user={user} onDone={onDone} />);
    return () => { setTimeout(() => { root.unmount(); host.remove(); }, 0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pending]);
}
