import { createBrowserRouter } from 'react-router-dom';

import { RotaProtegida } from '@/auth/RotaProtegida';
import { LayoutPainel } from '@/components/layout/LayoutPainel';
import { AparenciaPage } from '@/features/aparencia/AparenciaPage';
import { CategoriaDetalhePage } from '@/features/categorias-produto/CategoriaDetalhePage';
import { CategoriasPage } from '@/features/categorias-produto/CategoriasPage';
import { CertificacaoDetalhePage } from '@/features/certificacoes/CertificacaoDetalhePage';
import { CertificacoesPage } from '@/features/certificacoes/CertificacoesPage';
import { CertificadosEmRiscoPage } from '@/features/certificados/CertificadosEmRiscoPage';
import { CertificadosPage } from '@/features/certificados/CertificadosPage';
import { ClienteFormPage } from '@/features/clientes/ClienteFormPage';
import { ClientesPage } from '@/features/clientes/ClientesPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { HomePage } from '@/features/home/HomePage';
import { NaoConformidadesPage } from '@/features/nao-conformidades/NaoConformidadesPage';
import { FuncionarioFormPage } from '@/features/funcionarios/FuncionarioFormPage';
import { FuncionariosPage } from '@/features/funcionarios/FuncionariosPage';
import { ProdutoFormPage } from '@/features/produtos/ProdutoFormPage';
import { ProdutosPage } from '@/features/produtos/ProdutosPage';
import { EsqueciSenhaPage } from '@/pages/EsqueciSenhaPage';
import { LoginPage } from '@/pages/LoginPage';
import { NaoEncontradaPage } from '@/pages/NaoEncontradaPage';
import { RedefinirSenhaPage } from '@/pages/RedefinirSenhaPage';
import { SemPermissaoPage } from '@/pages/SemPermissaoPage';

const EQUIPE = ['ADMIN', 'FUNCIONARIO'] as const;

export const router = createBrowserRouter([
  // Site institucional público — porta de entrada da plataforma.
  { path: '/', element: <HomePage /> },

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
