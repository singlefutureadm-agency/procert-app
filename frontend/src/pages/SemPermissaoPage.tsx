import { Link } from 'react-router-dom';

import { Icone } from '@/components/Icone';

export function SemPermissaoPage() {
  return (
    <div className="tela-centralizada">
      <div className="cartao-auth vidro" style={{ textAlign: 'center' }}>
        <Icone nome="cadeado" tamanho={44} className="icone tela-icone" />
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
