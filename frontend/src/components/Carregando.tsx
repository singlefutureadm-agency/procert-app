export function Carregando({ mensagem = 'Carregando...' }: { mensagem?: string }) {
  return (
    <div className="carregando" role="status" aria-live="polite">
      <div className="spinner" />
      <span>{mensagem}</span>
    </div>
  );
}
