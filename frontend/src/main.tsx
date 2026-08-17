import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';

import { AuthProvider } from '@/auth/AuthContext';
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
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </TemaProvider>
    </QueryClientProvider>
  </StrictMode>,
);
