import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Evita configurar CORS no navegador durante o desenvolvimento.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  // O build SSR só produz `dist-ssr/prerender.js`, que `scripts/prerender.mjs`
  // importa para escrever o HTML das rotas públicas. Sem `public/` (já está no
  // dist) e sem `manualChunks`, que no SSR apontaria para dependência externa.
  build: isSsrBuild
    ? { copyPublicDir: false, sourcemap: false }
    : {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom', 'react-router-dom'],
              query: ['@tanstack/react-query'],
              forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
            },
          },
        },
      },
}));
