import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (tentativas, erro) => {
        // Não insiste em erros de autorização/validação.
        const status = (erro as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return tentativas < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Chaves de cache centralizadas — evita strings soltas pelo código. */
export const chaves = {
  perfil: ['perfil'] as const,
  dashboard: ['dashboard'] as const,
  /* Chave única para os três gráficos: o payload é um só, então trocar de
     Acompanhamento para Certificados aproveita o cache em vez de refazer a
     conta no servidor. */
  graficos: ['dashboard', 'graficos'] as const,
  estados: ['estados'] as const,
  aparencia: ['aparencia'] as const,
  clientes: (filtros?: unknown) => ['clientes', filtros ?? {}] as const,
  cliente: (id: number) => ['clientes', id] as const,
  clientesResumo: ['clientes', 'resumo'] as const,
  funcionarios: (filtros?: unknown) => ['funcionarios', filtros ?? {}] as const,
  funcionario: (id: number) => ['funcionarios', id] as const,
  funcionariosResumo: ['funcionarios', 'resumo'] as const,
  relatorioEquipe: (filtros?: unknown) =>
    ['relatorios', 'equipe', filtros ?? {}] as const,
  produtos: (filtros?: unknown) => ['produtos', filtros ?? {}] as const,
  produto: (id: number) => ['produtos', id] as const,
  categorias: (filtros?: unknown) => ['categorias', filtros ?? {}] as const,
  categoria: (id: number) => ['categorias', id] as const,
  categoriasResumo: ['categorias', 'resumo'] as const,
  modelosTrilha: (categoriaId: number) =>
    ['categorias', categoriaId, 'modelos-trilha'] as const,
  certificados: (filtros?: unknown) => ['certificados', filtros ?? {}] as const,
  certificadosEmRisco: (dias: number, pagina: number) =>
    ['certificados', 'em-risco', dias, pagina] as const,
  certificadosDoProduto: (produtoId: number) =>
    ['certificados', 'produto', produtoId] as const,
  naoConformidades: (filtros?: unknown) =>
    ['nao-conformidades', filtros ?? {}] as const,
  versaoTrilha: (produtoId: number) =>
    ['certificacoes', 'produto', produtoId, 'versao-trilha'] as const,
  certificacoes: (filtros?: unknown) => ['certificacoes', filtros ?? {}] as const,
  certificacao: (produtoId: number) => ['certificacoes', 'produto', produtoId] as const,
};
