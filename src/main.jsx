import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import SafeBoundary from './ui/SafeBoundary.jsx';
import { installGlobalErrorCapture } from './lib/clientError.js';

installGlobalErrorCapture();

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
