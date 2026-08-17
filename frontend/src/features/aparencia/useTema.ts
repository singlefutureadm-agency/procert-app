import { useContext } from 'react';

import { TemaContext } from './TemaContext';

export function useTema() {
  const contexto = useContext(TemaContext);
  if (!contexto) {
    throw new Error('useTema precisa estar dentro de <TemaProvider>.');
  }
  return contexto;
}
