import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // 'hidden': gera os .map mas NÃO escreve a referência //# sourceMappingURL no JS — o navegador nunca os procura. O servidor também não os
    // entrega (server/index.js responde 404 a *.map) e só os lê para traduzir a pilha dos erros no log (server/sourcemaps.js).
    sourcemap: 'hidden',
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
