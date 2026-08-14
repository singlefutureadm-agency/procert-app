import { Link } from 'react-router-dom';

export function NaoEncontradaPage() {
  return (
    <div className="tela-centralizada">
      <div className="cartao-auth vidro" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }} aria-hidden>
          🧭
        </div>
        <h1 style={{ fontSize: '1.5rem' }}>Página não encontrada</h1>
        <p className="texto-suave texto-pequeno">
          O endereço acessado não existe ou foi movido.
        </p>
        <Link to="/dashboard" className="btn btn--primario">
          Ir para o painel
        </Link>
      </div>
    </div>
  );
}
