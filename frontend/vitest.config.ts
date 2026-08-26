import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Configuração de teste separada do `vite.config.ts` de propósito.
 *
 * O arquivo de build já carrega proxy de desenvolvimento e `manualChunks`, que
 * não têm nada a ver com teste; misturar os dois faz uma mudança de teste
 * arriscar o bundle de produção. O alias `@/` é repetido aqui porque é a única
 * parte compartilhada — e agora são **três** declarações que precisam ficar em
 * sincronia (`vite.config.ts`, `tsconfig.json` e este arquivo).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/testing/setup.ts'],
    css: false,

    /*
     * Um processo só.
     *
     * A máquina de desenvolvimento tem 4 GB de RAM, e o pool padrão do Vitest
     * abre um worker por núcleo — cada um com o seu jsdom. Sem isto a suíte
     * morre com `JavaScript heap out of memory` antes de terminar, que é um
     * falso negativo caro: parece regressão e não é. O CI roda folgado assim.
     */
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },

    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      // O que tem regra e quebra em silêncio. Página inteira fica de fora: o
      // custo de montá-la não paga o que ela protege — ver DOCUMENTACAO.md §14.
      include: ['src/lib/**/*.ts', 'src/components/**/*.tsx'],
      exclude: ['src/components/Icone.tsx', 'src/**/*.d.ts'],
    },
  },
});
