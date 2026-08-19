import { NavLink } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Icone, type NomeIcone } from '@/components/Icone';
import { useTema } from '@/features/aparencia/useTema';
import type { Role } from '@/types';

interface ItemMenu {
  para: string;
  rotulo: string;
  icone: NomeIcone;
  papeis?: Role[];
}

interface GrupoMenu {
  titulo: string;
  itens: ItemMenu[];
}

const MENU: GrupoMenu[] = [
  {
    titulo: 'Visão geral',
    itens: [{ para: '/dashboard', rotulo: 'Dashboard', icone: 'grafico' }],
  },
  {
    titulo: 'Certificação',
    itens: [
      { para: '/certificacoes', rotulo: 'Acompanhamento', icone: 'prancheta' },
      { para: '/nao-conformidades', rotulo: 'Não conformidades', icone: 'alerta' },
      { para: '/certificados', rotulo: 'Certificados', icone: 'certificado' },
      { para: '/produtos', rotulo: 'Produtos', icone: 'caixa' },
      {
        para: '/categorias',
        rotulo: 'Categorias e trilhas',
        icone: 'pastas',
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
        icone: 'predio',
        papeis: ['ADMIN', 'FUNCIONARIO'],
      },
      { para: '/equipe', rotulo: 'Equipe interna', icone: 'pessoas', papeis: ['ADMIN'] },
    ],
  },
  {
    titulo: 'Configurações',
    itens: [
      {
        para: '/dashboard/aparencia',
        rotulo: 'Aparência',
        icone: 'paleta',
        papeis: ['ADMIN'],
      },
    ],
  },
];

interface Props {
  aberta: boolean;
  aoNavegar: () => void;
}

export function Sidebar({ aberta, aoNavegar }: Props) {
  const { usuario } = useAuth();
  const { aparencia } = useTema();

  const podeVer = (item: ItemMenu) =>
    !item.papeis || (usuario && item.papeis.includes(usuario.role));

  return (
    <aside className={`sidebar vidro ${aberta ? 'sidebar--aberta' : ''}`}>
      <div className="sidebar__marca">
        {/* Com logo enviada, ela substitui o emblema e o nome vira alt: repetir
            "ProCert" ao lado de uma logo que já diz isso é ruído. */}
        {aparencia?.logoUrl ? (
          <img className="sidebar__logo" src={aparencia.logoUrl} alt="ProCert" />
        ) : (
          <>
            <Icone nome="escudo" tamanho={24} />
            <span>ProCert</span>
          </>
        )}
      </div>

      {/* Nomear a navegação separa este landmark do <nav> da home institucional
          na lista de regiões do leitor de tela. */}
      <nav aria-label="Navegação principal">
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
                  <Icone nome={item.icone} />
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
