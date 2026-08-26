import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Preparação comum a toda suíte do frontend.
 *
 * `cleanup` desmonta o que ficou no DOM entre casos. Sem ele um `getByRole`
 * encontra o componente do teste ANTERIOR e o resultado passa a depender da
 * ordem de execução — o tipo de falso positivo que só aparece meses depois,
 * quando alguém insere um caso no meio.
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * `matchMedia` não existe no jsdom, e `lib/tema.ts` o consulta para descobrir o
 * tema do sistema. Sem este stub o import do módulo já lança.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});
