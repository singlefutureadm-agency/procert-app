import 'bootstrap-icons/font/bootstrap-icons.css';
import './home.css';

import { grafo, organizacao, URL_SITE } from '@/lib/seo';
import { useSeo } from '@/lib/seo';
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
  // Chegadas de fora com `/#sobre` — links antigos e compartilhados continuam
  // válidos mesmo depois que o menu passou a apontar para páginas próprias.
  useAncoraInicial();

  useSeo({
    titulo: 'ProCert | Certificação de EPI e de produtos',
    descricao:
      'Organismo de Certificação de Produto especializado em equipamentos de proteção individual para trabalho em altura. Certificação, auditoria de fábrica, ensaios e emissão de certificado.',
    caminho: '/',
    dadosEstruturados: grafo(organizacao(), {
      '@type': 'WebSite',
      name: 'ProCert',
      url: URL_SITE,
      inLanguage: 'pt-BR',
    }),
  });

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
