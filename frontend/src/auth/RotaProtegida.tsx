import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { Carregando } from '@/components/Carregando';
import type { Role } from '@/types';
import { useAuth } from './useAuth';

interface Props {
  children: ReactNode;
  /** Papéis autorizados. Omitido, basta estar autenticado. */
  papeis?: Role[];
}

/**
 * Substitui os blocos `if ($_SESSION['id_tipo_usuario'] == '1')` espalhados
 * por 30+ arquivos do legado. Aqui a regra é declarativa e fica em um lugar só
 * — e o backend valida de novo, independentemente do que a UI permita.
 */
export function RotaProtegida({ children, papeis }: Props) {
  const { autenticado, carregando, usuario } = useAuth();
  const local = useLocation();

  if (carregando) {
    return <Carregando mensagem="Validando sessão..." />;
  }

  if (!autenticado || !usuario) {
    return <Navigate to="/login" state={{ de: local.pathname }} replace />;
  }

  if (papeis?.length && !papeis.includes(usuario.role)) {
    return <Navigate to="/sem-permissao" replace />;
  }

  return <>{children}</>;
}
