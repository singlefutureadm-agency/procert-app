import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Icone, type NomeIcone } from '@/components/Icone';
import { useTema } from '@/features/aparencia/useTema';
import { urlArquivo } from '@/lib/arquivos';
import { logoDoTema } from '@/lib/tema';
import type { Role } from '@/types';

interface ItemMenu {
  para: string;
  rotulo: string;
  icone: NomeIcone;
  papeis?: Role[];
  /** Subitens do ramo. O pai continua sendo um link próprio. */
  filhos?: ItemMenu[];
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
      {
        // Acompanhamento é a raiz da trilha: não conformidade e certificado são
        // consequências de uma etapa avaliada, não assuntos irmãos dela.
        para: '/certificacoes',
        rotulo: 'Acompanhamento',
        icone: 'prancheta',
        filhos: [
          { para: '/nao-conformidades', rotulo: 'Não conformidades', icone: 'alerta' },
          { para: '/certificados', rotulo: 'Certificados', icone: 'certificado' },
          { para: '/certificacoes/em-risco', rotulo: 'Em risco', icone: 'ampulheta' },
        ],
      },
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
      {
        para: '/equipe',
        rotulo: 'Equipe interna',
        icone: 'pessoas',
        papeis: ['ADMIN'],
        filhos: [
          {
            para: '/relatorios/equipe',
            rotulo: 'Desempenho',
            icone: 'grafico',
            papeis: ['ADMIN'],
          },
        ],
      },
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

/** `true` quando a rota atual é a do item ou uma descendente dele. */
function naRota(caminho: string, pathname: string): boolean {
  return pathname === caminho || pathname.startsWith(`${caminho}/`);
}

/** Ramos cujo pai ou algum filho responde pela rota atual. */
function ramosDaRota(pathname: string): string[] {
  return MENU.flatMap((grupo) => grupo.itens)
    .filter(
      (item) =>
        item.filhos &&
        (naRota(item.para, pathname) ||
          item.filhos.some((filho) => naRota(filho.para, pathname))),
    )
    .map((item) => item.para);
}

interface Props {
  aberta: boolean;
  aoNavegar: () => void;
}

export function Sidebar({ aberta, aoNavegar }: Props) {
  const { usuario } = useAuth();
  const { aparencia, modo } = useTema();
  const { pathname } = useLocation();

  // A sidebar é pintada com os tokens do modo vigente, então a logo segue o modo.
  const logo = logoDoTema(aparencia, modo);

  const [expandidos, setExpandidos] = useState<string[]>(() => ramosDaRota(pathname));

  /*
   * Chegar num filho por URL colada, link do dashboard ou refresh precisa
   * revelar onde o usuário está — ramo recolhido escondendo a página ativa é a
   * sidebar mentindo. O efeito só ACRESCENTA: recolher um ramo à mão continua
   * valendo enquanto a navegação não sair dele.
   */
  useEffect(() => {
    setExpandidos((atuais) => {
      const faltando = ramosDaRota(pathname).filter((para) => !atuais.includes(para));
      return faltando.length > 0 ? [...atuais, ...faltando] : atuais;
    });
  }, [pathname]);

  const podeVer = (item: ItemMenu) =>
    !item.papeis || (usuario && item.papeis.includes(usuario.role));

  const alternar = (para: string) =>
    setExpandidos((atuais) =>
      atuais.includes(para) ? atuais.filter((p) => p !== para) : [...atuais, para],
    );

  const classeItem = (ativo: boolean) =>
    `sidebar__item ${ativo ? 'sidebar__item--ativo' : ''}`;

  const renderizarItem = (item: ItemMenu) => {
    const filhos = item.filhos?.filter(podeVer) ?? [];

    if (filhos.length === 0) {
      return (
        <NavLink
          key={item.para}
          to={item.para}
          onClick={aoNavegar}
          className={({ isActive }) => classeItem(isActive)}
        >
          <Icone nome={item.icone} />
          <span>{item.rotulo}</span>
        </NavLink>
      );
    }

    const idSubmenu = `submenu-${item.para.replace(/[^a-z0-9]+/gi, '-')}`;
    const expandido = expandidos.includes(item.para);
    // Recolhido com a página ativa dentro: o ramo precisa dizer isso sozinho,
    // senão o único item marcado some da tela e nada indica "onde estou".
    const filhoAtivo = filhos.some((filho) => naRota(filho.para, pathname));

    return (
      <div key={item.para}>
        <div className="sidebar__ramo">
          <NavLink
            to={item.para}
            onClick={aoNavegar}
            className={({ isActive }) =>
              `${classeItem(isActive)} ${
                !expandido && filhoAtivo ? 'sidebar__item--ramo-ativo' : ''
              }`
            }
          >
            <Icone nome={item.icone} />
            <span>{item.rotulo}</span>
          </NavLink>

          {/*
            Alça separada do link. Fundir os dois num botão só custaria o acesso
            direto ao acompanhamento; e o link sozinho, expandindo ao navegar,
            deixaria o usuário sem como recolher o ramo.
          */}
          <button
            type="button"
            className="sidebar__alca-ramo"
            aria-expanded={expandido}
            aria-controls={idSubmenu}
            aria-label={`${expandido ? 'Recolher' : 'Expandir'} ${item.rotulo}`}
            onClick={() => alternar(item.para)}
          >
            <Icone nome="chevron-direita" tamanho={16} />
          </button>
        </div>

        {expandido && (
          <div className="sidebar__submenu" id={idSubmenu}>
            {filhos.map((filho) => (
              <NavLink
                key={filho.para}
                to={filho.para}
                onClick={aoNavegar}
                className={({ isActive }) => classeItem(isActive)}
              >
                <Icone nome={filho.icone} tamanho={18} />
                <span>{filho.rotulo}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className={`sidebar vidro ${aberta ? 'sidebar--aberta' : ''}`}>
      <div className="sidebar__marca">
        {/* Com logo enviada, ela substitui o emblema e o nome vira alt: repetir
            "ProCert" ao lado de uma logo que já diz isso é ruído. */}
        {logo ? (
          <img className="sidebar__logo" src={urlArquivo(logo)} alt="ProCert" />
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
              {itens.map(renderizarItem)}
            </div>
          );
        })}
      </nav>

      <div className="sidebar__rodape">
        <p className="texto-pequeno texto-fraco">
          ProCert · Certificação de Produtos
        </p>
      </div>
    </aside>
  );
}
