import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';

import { AuthProvider } from '@/auth/AuthContext';
import { CarregandoRota } from '@/components/CarregandoRota';
import { TemaProvider } from '@/features/aparencia/TemaContext';
import { queryClient } from '@/lib/queryClient';
import { aplicarTemaDoCache } from '@/lib/tema';
import { router } from '@/router';
import '@/styles/global.css';

// Antes do primeiro render: pinta com a última aparência conhecida para não
// exibir o preset padrão até `GET /api/aparencia` responder. Só a primeira
// visita de cada navegador não tem cache — aí valem os defaults do CSS.
aplicarTemaDoCache();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TemaProvider>
        <AuthProvider>
          {/* Segura as rotas carregadas sob demanda (ver o cabeçalho de
              `router.tsx`). Fica aqui, e não em cada rota, porque o fallback é
              o mesmo para todas e um Suspense por rota multiplicaria o mesmo
              componente por vinte e quatro pontos de montagem. */}
          <Suspense fallback={<CarregandoRota />}>
            <RouterProvider router={router} />
          </Suspense>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </TemaProvider>
    </QueryClientProvider>
  </StrictMode>,
);
