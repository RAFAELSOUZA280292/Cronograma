import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import SafeBoundary from './ui/SafeBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SafeBoundary variant="page" label="o sistema" where="root">
      <App />
    </SafeBoundary>
  </React.StrictMode>
);
