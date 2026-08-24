import 'bootstrap-icons/font/bootstrap-icons.css';
import './home.css';

import { useAncoraInicial, useTemaInstitucional } from './hooks';
import { BotoesFlutuantes } from './secoes/BotoesFlutuantes';
import { CabecalhoSite } from './secoes/CabecalhoSite';
import { ChamadaAcao } from './secoes/ChamadaAcao';
import { Contato } from './secoes/Contato';
import { Depoimentos } from './secoes/Depoimentos';
import { Diferenciais } from './secoes/Diferenciais';
import { Hero } from './secoes/Hero';
import { Numeros } from './secoes/Numeros';
import { RodapeSite } from './secoes/RodapeSite';
import { Servicos } from './secoes/Servicos';
import { Sobre } from './secoes/Sobre';

/**
 * Site institucional público — porta de entrada da plataforma.
 *
 * Recriação do `app/views/home.php` do legado: mesma sequência de seções, mesmo
 * conteúdo e mesma identidade visual, agora sem Bootstrap, AdminLTE, AOS, Swiper
 * nem PureCounter — a página não faz nenhuma requisição a CDN.
 *
 * Diferenças em relação ao legado:
 *  • o formulário de contato realmente envia (POST /api/contato); antes apontava
 *    para `forms/contact.php`, arquivo que não existia no repositório
 *  • o item "Portfólio" saiu do menu: a seção correspondente havia sido removida
 *    da página, deixando o link morto (o rodapé ainda apontava para "#portifolio")
 *  • o botão de login vira "Painel" quando já existe sessão ativa
 */
export function HomePage() {
  useTemaInstitucional();
  // Chegadas de fora com `/#sobre` — o rodapé das páginas legais faz isso.
  useAncoraInicial();

  return (
    <div className="home">
      <CabecalhoSite />

      <main>
        <Hero />
        <Sobre />
        <Diferenciais />
        <Servicos />
        <ChamadaAcao />
        <Numeros />
        <Depoimentos />
        <Contato />
      </main>

      <RodapeSite />
      <BotoesFlutuantes />
    </div>
  );
}
