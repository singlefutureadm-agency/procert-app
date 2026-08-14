interface Props {
  valor: number;
  mostrarRotulo?: boolean;
}

export function Progresso({ valor, mostrarRotulo = true }: Props) {
  const percentual = Math.min(100, Math.max(0, Math.round(valor)));

  return (
    <div className="linha-flex">
      <div
        className="progresso"
        role="progressbar"
        aria-valuenow={percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ flex: 1 }}
      >
        <div className="progresso__barra" style={{ width: `${percentual}%` }} />
      </div>
      {mostrarRotulo && (
        <span className="texto-pequeno texto-suave sem-quebra">{percentual}%</span>
      )}
    </div>
  );
}
