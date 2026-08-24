import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { RotaProtegida } from '@/auth/RotaProtegida';
import { HomePage } from '@/features/home/HomePage';
import { LoginPage } from '@/pages/LoginPage';

/**
 * Rotas da aplicação.
 *
 * **Carregamento sob demanda.** Só a home e o login entram no pacote inicial:
 * são as duas portas de entrada, e fazê-las esperar um segundo pedaço de código
 * atrasaria justamente a primeira tela que o visitante vê. Todo o resto é
 * `lazy`, baixado quando a rota é aberta.
 *
 * O motivo é medido, não estético: o pacote inicial tinha 512 KB porque levava
 * junto o painel inteiro — dashboard, certificações, produtos, clientes,
 * categorias, equipe e a tela de aparência, com dnd-kit atrás. Quem chegava
 * pela busca para ler a página de serviços baixava tudo isso antes de ver a
 * primeira linha de texto, e tempo de carregamento é sinal de ranqueamento.
 *
 * `lazy` espera um módulo com export default, e todas as páginas aqui usam
 * export nomeado — daí o `.then` que reembala cada uma.
 *
 * O `<Suspense>` que segura essas rotas fica no `main.tsx`, em volta do
 * RouterProvider.
 */

// --- Site institucional ---------------------------------------------------
const SobrePage = lazy(() =>
  import('@/features/home/SobrePage').then((m) => ({ default: m.SobrePage })),
);
const ServicosPage = lazy(() =>
  import('@/features/home/ServicosPage').then((m) => ({ default: m.ServicosPage })),
);
const ContatoPage = lazy(() =>
  import('@/features/home/ContatoPage').then((m) => ({ default: m.ContatoPage })),
);
const TermosDeUsoPage = lazy(() =>
  import('@/features/home/TermosDeUsoPage').then((m) => ({ default: m.TermosDeUsoPage })),
);
const PoliticaPrivacidadePage = lazy(() =>
  import('@/features/home/PoliticaPrivacidadePage').then((m) => ({ default: m.PoliticaPrivacidadePage })),
);

// --- Autenticação e erro --------------------------------------------------
const EsqueciSenhaPage = lazy(() =>
  import('@/pages/EsqueciSenhaPage').then((m) => ({ default: m.EsqueciSenhaPage })),
);
const RedefinirSenhaPage = lazy(() =>
  import('@/pages/RedefinirSenhaPage').then((m) => ({ default: m.RedefinirSenhaPage })),
);
const SemPermissaoPage = lazy(() =>
  import('@/pages/SemPermissaoPage').then((m) => ({ default: m.SemPermissaoPage })),
);
const NaoEncontradaPage = lazy(() =>
  import('@/pages/NaoEncontradaPage').then((m) => ({ default: m.NaoEncontradaPage })),
);

// --- Painel ---------------------------------------------------------------
// O layout entra aqui junto das páginas: ele carrega a Sidebar e o conjunto de
// ícones do painel, que não têm uso nenhum para quem só abriu o site.
const LayoutPainel = lazy(() =>
  import('@/components/layout/LayoutPainel').then((m) => ({ default: m.LayoutPainel })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const CertificacoesPage = lazy(() =>
  import('@/features/certificacoes/CertificacoesPage').then((m) => ({ default: m.CertificacoesPage })),
);
const CertificacaoDetalhePage = lazy(() =>
  import('@/features/certificacoes/CertificacaoDetalhePage').then((m) => ({ default: m.CertificacaoDetalhePage })),
);
const NaoConformidadesPage = lazy(() =>
  import('@/features/nao-conformidades/NaoConformidadesPage').then((m) => ({ default: m.NaoConformidadesPage })),
);
const CertificadosPage = lazy(() =>
  import('@/features/certificados/CertificadosPage').then((m) => ({ default: m.CertificadosPage })),
);
const CertificadosEmRiscoPage = lazy(() =>
  import('@/features/certificados/CertificadosEmRiscoPage').then((m) => ({ default: m.CertificadosEmRiscoPage })),
);
const ProdutosPage = lazy(() =>
  import('@/features/produtos/ProdutosPage').then((m) => ({ default: m.ProdutosPage })),
);
const ProdutoFormPage = lazy(() =>
  import('@/features/produtos/ProdutoFormPage').then((m) => ({ default: m.ProdutoFormPage })),
);
const ClientesPage = lazy(() =>
  import('@/features/clientes/ClientesPage').then((m) => ({ default: m.ClientesPage })),
);
const ClienteFormPage = lazy(() =>
  import('@/features/clientes/ClienteFormPage').then((m) => ({ default: m.ClienteFormPage })),
);
const CategoriasPage = lazy(() =>
  import('@/features/categorias-produto/CategoriasPage').then((m) => ({ default: m.CategoriasPage })),
);
const CategoriaDetalhePage = lazy(() =>
  import('@/features/categorias-produto/CategoriaDetalhePage').then((m) => ({ default: m.CategoriaDetalhePage })),
);
const FuncionariosPage = lazy(() =>
  import('@/features/funcionarios/FuncionariosPage').then((m) => ({ default: m.FuncionariosPage })),
);
const FuncionarioFormPage = lazy(() =>
  import('@/features/funcionarios/FuncionarioFormPage').then((m) => ({ default: m.FuncionarioFormPage })),
);
const AparenciaPage = lazy(() =>
  import('@/features/aparencia/AparenciaPage').then((m) => ({ default: m.AparenciaPage })),
);

const EQUIPE = ['ADMIN', 'FUNCIONARIO'] as const;

export const router = createBrowserRouter([
  // Site institucional público — porta de entrada da plataforma.
  { path: '/', element: <HomePage /> },

  // Páginas institucionais. Cada uma existe como URL própria — e não como
  // âncora da home — para disputar o próprio conjunto de termos de busca, com
  // título, descrição e dados estruturados próprios. Os caminhos são a fonte
  // única de PAGINAS (features/home/conteudo-paginas.ts), que alimenta o menu
  // e o rodapé; ao acrescentar rota pública, atualize também public/sitemap.xml.
  { path: '/sobre', element: <SobrePage /> },
  { path: '/servicos', element: <ServicosPage /> },
  { path: '/contato', element: <ContatoPage /> },

  // Documentos legais: públicos e linkados no rodapé do site. Os caminhos são
  // a fonte única de PAGINAS_LEGAIS (features/home/conteudo-legal.ts).
  { path: '/termos-de-uso', element: <TermosDeUsoPage /> },
  { path: '/politica-de-privacidade', element: <PoliticaPrivacidadePage /> },

  { path: '/login', element: <LoginPage /> },
  { path: '/esqueci-senha', element: <EsqueciSenhaPage /> },
  { path: '/redefinir-senha', element: <RedefinirSenhaPage /> },
  { path: '/sem-permissao', element: <SemPermissaoPage /> },

  {
    // Rota de layout sem `path`: envolve o painel sem ocupar a raiz, que agora
    // pertence à home. Os filhos declaram os caminhos absolutos.
    element: (
      <RotaProtegida>
        <LayoutPainel />
      </RotaProtegida>
    ),
    children: [
      { path: 'dashboard', element: <DashboardPage /> },

      // Certificações — equipe e cliente (o backend restringe o escopo).
      { path: 'certificacoes', element: <CertificacoesPage /> },
      { path: 'certificacoes/produto/:produtoId', element: <CertificacaoDetalhePage /> },
      { path: 'nao-conformidades', element: <NaoConformidadesPage /> },
      { path: 'certificados', element: <CertificadosPage /> },
      // Vencimentos: o backend aplica o escopo, então o CLIENTE também pode
      // abrir e ver só os seus.
      { path: 'certificacoes/em-risco', element: <CertificadosEmRiscoPage /> },

      // Produtos
      { path: 'produtos', element: <ProdutosPage /> },
      {
        path: 'produtos/novo',
        element: (
          <RotaProtegida papeis={[...EQUIPE]}>
            <ProdutoFormPage />
          </RotaProtegida>
        ),
      },
      {
        path: 'produtos/:id/editar',
        element: (
          <RotaProtegida papeis={[...EQUIPE]}>
            <ProdutoFormPage />
          </RotaProtegida>
        ),
      },

      // Clientes
      {
        path: 'clientes',
        element: (
          <RotaProtegida papeis={[...EQUIPE]}>
            <ClientesPage />
          </RotaProtegida>
        ),
      },
      {
        path: 'clientes/novo',
        element: (
          <RotaProtegida papeis={[...EQUIPE]}>
            <ClienteFormPage />
          </RotaProtegida>
        ),
      },
      {
        path: 'clientes/:id/editar',
        element: (
          <RotaProtegida papeis={[...EQUIPE]}>
            <ClienteFormPage />
          </RotaProtegida>
        ),
      },

      // Categorias de produto e suas trilhas de certificação
      {
        path: 'categorias',
        element: (
          <RotaProtegida papeis={[...EQUIPE]}>
            <CategoriasPage />
          </RotaProtegida>
        ),
      },
      {
        path: 'categorias/:id',
        element: (
          <RotaProtegida papeis={[...EQUIPE]}>
            <CategoriaDetalhePage />
          </RotaProtegida>
        ),
      },

      // Equipe interna — somente administradores
      {
        path: 'equipe',
        element: (
          <RotaProtegida papeis={['ADMIN']}>
            <FuncionariosPage />
          </RotaProtegida>
        ),
      },
      {
        path: 'equipe/novo',
        element: (
          <RotaProtegida papeis={['ADMIN']}>
            <FuncionarioFormPage />
          </RotaProtegida>
        ),
      },
      {
        path: 'equipe/:id/editar',
        element: (
          <RotaProtegida papeis={['ADMIN']}>
            <FuncionarioFormPage />
          </RotaProtegida>
        ),
      },

      // Design tokens do painel — somente administradores.
      // O backend repete a checagem em PUT/POST: esconder o menu não é controle.
      {
        path: 'dashboard/aparencia',
        element: (
          <RotaProtegida papeis={['ADMIN']}>
            <AparenciaPage />
          </RotaProtegida>
        ),
      },
    ],
  },

  { path: '*', element: <NaoEncontradaPage /> },
]);
