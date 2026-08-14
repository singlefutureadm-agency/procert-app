import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Sidebar } from './Sidebar';

export function LayoutPainel() {
  const { usuario, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="layout">
      <Sidebar aberta={menuAberto} aoNavegar={() => setMenuAberto(false)} />

      <div className="conteudo">
        <header className="topo vidro">
          <button
            type="button"
            className="btn btn--icone"
            onClick={() => setMenuAberto((aberto) => !aberto)}
            aria-label="Alternar menu de navegação"
          >
            ☰
          </button>

          <strong>Painel ProCert</strong>

          <div className="topo__usuario">
            <div className="texto-direita">
              <div>{usuario?.nome}</div>
              <div className="texto-pequeno texto-fraco">
                {usuario?.role === 'ADMIN'
                  ? 'Administrador'
                  : usuario?.role === 'FUNCIONARIO'
                    ? 'Funcionário'
                    : 'Cliente'}
              </div>
            </div>
            <button type="button" className="btn btn--pequeno" onClick={sair}>
              Sair
            </button>
          </div>
        </header>

        <main className="pagina">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
