import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { DOCUMENTOS, EMPRESA, NAVEGACAO } from '../conteudo';
import { LinkDocumento } from '../LinkDocumento';
import { useRolagem } from '../hooks';

/**
 * Cabeçalho fixo e transparente que ganha fundo escuro ao rolar — mesmo
 * comportamento do legado, que fazia isso adicionando a classe `.scrolled`
 * no <body> via `main.js`.
 */
export function CabecalhoSite() {
  const rolou = useRolagem(80);
  const { autenticado } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const [linksAbertos, setLinksAbertos] = useState(false);
  const botaoLinks = useRef<HTMLButtonElement>(null);

  // Trava a rolagem do fundo enquanto o menu móvel está aberto.
  useEffect(() => {
    document.body.style.overflow = menuAberto ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuAberto]);

  const fechar = () => {
    setMenuAberto(false);
    setLinksAbertos(false);
  };

  return (
    <header className={`home__cabecalho ${rolou ? 'home__cabecalho--rolado' : ''}`}>
      <div className="home__container home__cabecalho-interno">
        <Link to="/" className="home__marca" onClick={fechar}>
          {/* Versão branca: o logo padrão é escuro e some sobre o hero.
              Sem o texto ao lado, a imagem passa a ser o nome acessível
              da marca — por isso `alt` preenchido em vez de decorativa.

              Fixa, de propósito: a logo enviada em /dashboard/aparencia é a
              do painel e não substitui mais esta (decisão de 12/11/2026). O
              cabeçalho é transparente sobre um hero escuro, e uma logo do
              painel sem versão branca sumia ali. */}
          <img src="/img/logo-branco.webp" alt={EMPRESA.nome} width={488} height={174} />
        </Link>

        <nav
          id="home-navegacao"
          className={`home__nav ${menuAberto ? 'home__nav--aberta' : ''}`}
          aria-label="Navegação principal"
        >
          <ul>
            {/* <a> e não <Link>: na home, `/#secao` é rolagem no mesmo
                documento, que o navegador faz sozinho; vindo de uma página
                legal, carrega a home e `useAncoraInicial` posiciona. */}
            {NAVEGACAO.map((item) => (
              <li key={item.ancora}>
                <a href={`/${item.ancora}`} onClick={fechar}>
                  {item.rotulo}
                </a>
              </li>
            ))}

            <li>
              <button
                ref={botaoLinks}
                type="button"
                aria-expanded={linksAbertos}
                onClick={() => setLinksAbertos((aberto) => !aberto)}
              >
                <span>Links Úteis</span>
                <i className="bi bi-chevron-down" aria-hidden />
              </button>
              <ul
                className={`home__nav-suspenso ${
                  linksAbertos ? 'home__nav-suspenso--aberto' : ''
                }`}
              >
                {DOCUMENTOS.map((documento) => (
                  <li key={documento.arquivo}>
                    <LinkDocumento
                      arquivo={documento.arquivo}
                      titulo={documento.rotulo}
                      onClick={() => {
                        fechar();
                        /* O suspenso fecha e o link some com ele. O foco vai
                           para o botão "Links Úteis" ANTES de o visualizador
                           abrir, e é para ele que o modal o devolve ao
                           fechar — sem isto o foco cairia no <body>. */
                        botaoLinks.current?.focus();
                      }}
                    >
                      {documento.rotulo}
                    </LinkDocumento>
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        </nav>

        {/* Quem já tem sessão vai direto ao painel; os demais, ao login. */}
        <Link
          className="home__botao-entrar"
          to={autenticado ? '/dashboard' : '/login'}
          onClick={fechar}
        >
          {autenticado ? 'Painel' : 'Login'}
        </Link>

        <button
          type="button"
          className={`home__menu-movel ${menuAberto ? 'home__menu-movel--aberto' : ''}`}
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuAberto}
          aria-controls="home-navegacao"
          onClick={() => setMenuAberto((aberto) => !aberto)}
        >
          <i className={`bi ${menuAberto ? 'bi-x-lg' : 'bi-list'}`} aria-hidden />
        </button>
      </div>

      {/* Cortina: escurece a página e fecha o menu ao toque fora dele. */}
      {menuAberto && (
        <div className="home__cortina" onClick={fechar} aria-hidden />
      )}
    </header>
  );
}
