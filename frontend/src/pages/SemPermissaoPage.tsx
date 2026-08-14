import { Link } from 'react-router-dom';

export function SemPermissaoPage() {
  return (
    <div className="tela-centralizada">
      <div className="cartao-auth vidro" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }} aria-hidden>
          🔒
        </div>
        <h1 style={{ fontSize: '1.5rem' }}>Acesso negado</h1>
        <p className="texto-suave texto-pequeno">
          Seu perfil não tem permissão para acessar esta área.
        </p>
        <Link to="/dashboard" className="btn btn--primario">
          Voltar ao painel
        </Link>
      </div>
    </div>
  );
}
