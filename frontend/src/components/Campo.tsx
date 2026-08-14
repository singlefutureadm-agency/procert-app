import type { ReactNode } from 'react';

interface Props {
  label: string;
  erro?: string;
  obrigatorio?: boolean;
  dica?: string;
  children: ReactNode;
}

/** Envelope padrão de um campo de formulário: rótulo, controle, erro e dica. */
export function Campo({ label, erro, obrigatorio, dica, children }: Props) {
  return (
    <div className={`campo ${erro ? 'campo--invalido' : ''}`}>
      <label>
        {label}
        {obrigatorio && <span aria-hidden style={{ color: '#fca5a5' }}> *</span>}
      </label>
      {children}
      {dica && !erro && <span className="texto-pequeno texto-fraco">{dica}</span>}
      {erro && <span className="campo__erro" role="alert">{erro}</span>}
    </div>
  );
}
