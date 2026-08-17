import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { useTema } from '@/features/aparencia/useTema';
import { Sidebar } from './Sidebar';

export function LayoutPainel() {
  const { usuario, sair } = useAuth();
  const { modo, podeAlternar, alternarModo } = useTema();
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
            {/* O admin pode travar o painel no modo padrão; aí o botão some. */}
            {podeAlternar && (
              <button
                type="button"
                className="btn btn--icone"
                onClick={alternarModo}
                aria-label={
                  modo === 'ESCURO' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'
                }
                title={modo === 'ESCURO' ? 'Modo claro' : 'Modo escuro'}
              >
                {modo === 'ESCURO' ? '☀️' : '🌙'}
              </button>
            )}

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
