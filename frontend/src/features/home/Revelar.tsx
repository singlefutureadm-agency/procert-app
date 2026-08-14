import type { ElementType, ReactNode } from 'react';

import { useRevelar } from './hooks';

interface Props {
  children: ReactNode;
  /** Elemento renderizado (padrão: div). Útil para manter a semântica da seção. */
  como?: ElementType;
  className?: string;
  /** Atraso da transição, em ms — equivale ao data-aos-delay do legado. */
  atraso?: number;
  id?: string;
}

/**
 * Envolve um bloco e o revela quando entra na viewport.
 * Substitui `data-aos="fade-up"` do template original.
 */
export function Revelar({
  children,
  como: Componente = 'div',
  className = '',
  atraso = 0,
  id,
}: Props) {
  const { referencia, visivel } = useRevelar<HTMLElement>();

  return (
    <Componente
      ref={referencia}
      id={id}
      className={`${className} home__revelar ${visivel ? 'home__revelar--visivel' : ''}`.trim()}
      style={atraso ? { transitionDelay: `${atraso}ms` } : undefined}
    >
      {children}
    </Componente>
  );
}
