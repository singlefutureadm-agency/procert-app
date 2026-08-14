import { NavLink } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import type { Role } from '@/types';

interface ItemMenu {
  para: string;
  rotulo: string;
  icone: string;
  papeis?: Role[];
}

interface GrupoMenu {
  titulo: string;
  itens: ItemMenu[];
}

const MENU: GrupoMenu[] = [
  {
    titulo: 'Visão geral',
    itens: [{ para: '/dashboard', rotulo: 'Dashboard', icone: '📊' }],
  },
  {
    titulo: 'Certificação',
    itens: [
      { para: '/certificacoes', rotulo: 'Acompanhamento', icone: '📋' },
      { para: '/nao-conformidades', rotulo: 'Não conformidades', icone: '⚠️' },
      { para: '/certificados', rotulo: 'Certificados', icone: '📜' },
      { para: '/produtos', rotulo: 'Produtos', icone: '📦' },
      {
        para: '/categorias',
        rotulo: 'Categorias e trilhas',
        icone: '🗂️',
        papeis: ['ADMIN', 'FUNCIONARIO'],
      },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      {
        para: '/clientes',
        rotulo: 'Clientes',
        icone: '🏢',
        papeis: ['ADMIN', 'FUNCIONARIO'],
      },
      { para: '/equipe', rotulo: 'Equipe interna', icone: '👥', papeis: ['ADMIN'] },
    ],
  },
];

interface Props {
  aberta: boolean;
  aoNavegar: () => void;
}

export function Sidebar({ aberta, aoNavegar }: Props) {
  const { usuario } = useAuth();

  const podeVer = (item: ItemMenu) =>
    !item.papeis || (usuario && item.papeis.includes(usuario.role));

  return (
    <aside className={`sidebar vidro ${aberta ? 'sidebar--aberta' : ''}`}>
      <div className="sidebar__marca">
        <span aria-hidden>🛡️</span>
        <span>ProCert</span>
      </div>

      <nav>
        {MENU.map((grupo) => {
          const itens = grupo.itens.filter(podeVer);
          if (itens.length === 0) return null;

          return (
            <div key={grupo.titulo}>
              <p className="sidebar__grupo">{grupo.titulo}</p>
              {itens.map((item) => (
                <NavLink
                  key={item.para}
                  to={item.para}
                  onClick={aoNavegar}
                  className={({ isActive }) =>
                    `sidebar__item ${isActive ? 'sidebar__item--ativo' : ''}`
                  }
                >
                  <span aria-hidden>{item.icone}</span>
                  <span>{item.rotulo}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sidebar__rodape">
        <p className="texto-pequeno texto-fraco" style={{ padding: '0 12px' }}>
          ProCert · Certificação de Produtos
        </p>
      </div>
    </aside>
  );
}
