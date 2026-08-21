import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import type { DadosGraficos } from '@/types';

/**
 * Agregados dos gráficos das telas de Acompanhamento, Certificados e NCs.
 *
 * Uma consulta para as três telas. O backend devolve os três blocos juntos
 * porque somados eles são pequenos, e uma chave só de cache significa que ir de
 * Acompanhamento para Certificados não refaz a agregação no servidor.
 *
 * **Os gráficos ignoram os filtros da tela de propósito.** O filtro serve para
 * achar um registro; o gráfico serve para dar contexto ao que se está olhando.
 * Se ele acompanhasse o filtro, filtrar por "Reprovado" mostraria um gráfico
 * 100% reprovado — verdadeiro e inútil. Cada painel diz isso no rodapé, para
 * ninguém ler o gráfico como se fosse o recorte da tabela.
 */
export function useGraficos() {
  return useQuery({
    queryKey: chaves.graficos,
    queryFn: async () => {
      const { data } = await api.get<DadosGraficos>('/dashboard/graficos');
      return data;
    },
  });
}
