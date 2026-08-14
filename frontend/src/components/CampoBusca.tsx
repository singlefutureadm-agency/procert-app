import { useEffect, useState } from 'react';

interface Props {
  valor: string;
  aoMudar: (valor: string) => void;
  placeholder?: string;
  atrasoMs?: number;
}

/** Busca com debounce — evita uma requisição por tecla digitada. */
export function CampoBusca({
  valor,
  aoMudar,
  placeholder = 'Buscar...',
  atrasoMs = 400,
}: Props) {
  const [texto, setTexto] = useState(valor);

  useEffect(() => setTexto(valor), [valor]);

  useEffect(() => {
    if (texto === valor) return;

    const temporizador = setTimeout(() => aoMudar(texto), atrasoMs);
    return () => clearTimeout(temporizador);
  }, [texto, valor, atrasoMs, aoMudar]);

  return (
    <div className="campo" style={{ minWidth: 240 }}>
      <input
        type="search"
        value={texto}
        placeholder={placeholder}
        onChange={(evento) => setTexto(evento.target.value)}
        aria-label={placeholder}
      />
    </div>
  );
}
