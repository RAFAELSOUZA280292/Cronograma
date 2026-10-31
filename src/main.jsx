import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import SafeBoundary from './ui/SafeBoundary.jsx';
import { installGlobalErrorCapture } from './lib/clientError.js';

installGlobalErrorCapture();

// Auditor de leitura/acessibilidade (Onda 1 / Q1): só no desenvolvimento; o Vite o remove do pacote de produção. Ver src/dev/uiAudit.js.
if (import.meta.env.DEV) import('./dev/uiAudit.js').then((m) => m.installUiAudit()).catch(() => {});

// PWA (2026-10-17): registra o service worker só em produção; falha de registro nunca atrapalha o app.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SafeBoundary variant="page" label="o sistema" where="root">
      <App />
    </SafeBoundary>
  </React.StrictMode>
);
