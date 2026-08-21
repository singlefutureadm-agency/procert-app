import {
  BarrasHorizontais,
  ColunasAgrupadas,
  GradeGraficos,
  Grafico,
  type FatiaGrafico,
  type GrupoColunas,
} from '@/components/Graficos';
import { rotuloStatusNaoConformidade } from '@/lib/formatadores';
import { useGraficos } from '../graficos/useGraficos';

/**
 * Gráficos abaixo da lista de não conformidades.
 *
 * O primeiro cruza **status × criticidade**, e é a comparação que a lista não
 * consegue fazer: ela mostra as NCs uma a uma, ordenadas por prazo, então "as
 * maiores estão sendo resolvidas na mesma velocidade que as menores?" só se
 * responde contando na mão. Colunas agrupadas colocam Menor e Maior lado a
 * lado dentro de cada status, partindo da mesma linha de base — que é o que
 * permite comparar as duas alturas.
 *
 * Agrupadas, e não empilhadas: empilhar deixaria comparar só o segmento de
 * baixo, porque o de cima passa a começar numa altura diferente em cada coluna.
 *
 * O segundo responde "de onde elas vêm": a etapa da trilha que mais gera NC é
 * onde vale mexer no processo — um critério ambíguo, um documento mal
 * especificado. É a informação que transforma a lista em ação.
 */
export function PainelGraficosNaoConformidades() {
  const { data, isLoading, isError } = useGraficos();

  if (isLoading) {
    return (
      <GradeGraficos>
        <div className="esqueleto vidro" style={{ height: 260 }} aria-hidden />
        <div className="esqueleto vidro" style={{ height: 260 }} aria-hidden />
      </GradeGraficos>
    );
  }

  if (isError || !data) return null;

  const { porStatus, porEtapa, total } = data.naoConformidades;

  const grupos: GrupoColunas[] = porStatus.map((linha) => ({
    rotulo: rotuloStatusNaoConformidade[linha.status],
    fatias: [
      { rotulo: 'Menor', valor: linha.menor, cor: 'var(--graf-alerta)' },
      {
        rotulo: 'Maior',
        valor: linha.maior,
        cor: 'var(--graf-reprovado)',
        // Criticidade maior é a série que precisa saltar sem depender de cor.
        textura: true,
      },
    ],
  }));

  const fatiasEtapa: FatiaGrafico[] = porEtapa.map((linha) => ({
    rotulo: linha.etapa,
    valor: linha.total,
    cor: 'var(--graf-andamento)',
  }));

  const emAberto = porStatus
    .filter((l) => l.status === 'ABERTA' || l.status === 'EM_TRATATIVA')
    .reduce((soma, l) => soma + l.total, 0);

  const maioresEmAberto = porStatus
    .filter((l) => l.status === 'ABERTA' || l.status === 'EM_TRATATIVA')
    .reduce((soma, l) => soma + l.maior, 0);

  return (
    <GradeGraficos>
      <Grafico
        titulo="Situação por criticidade"
        descricao="Menor e Maior lado a lado dentro de cada status."
        destaque={total}
        rodape={
          maioresEmAberto > 0
            ? `${maioresEmAberto} de criticidade maior ainda em aberto, de ${emAberto} no total. Maior aparece riscado além de vermelho.`
            : 'Maior aparece riscado além de vermelho — a distinção não depende de enxergar a cor.'
        }
        vazio={total === 0}
        mensagemVazio="Nenhuma não conformidade registrada."
      >
        <ColunasAgrupadas
          titulo="Não conformidades por situação e criticidade"
          grupos={grupos}
          colunaIdentidade="Situação"
        />
      </Grafico>

      <Grafico
        titulo="Etapas que mais geram NC"
        descricao="Onde a trilha trava com mais frequência."
        destaque={porEtapa.length > 0 ? porEtapa[0].total : 0}
        rodape="Considera todas as NCs, independentemente do filtro acima. Repetição na mesma etapa costuma ser critério ambíguo, não desatenção do cliente."
        vazio={porEtapa.length === 0}
        mensagemVazio="Nenhuma não conformidade registrada."
      >
        <BarrasHorizontais
          titulo="Etapas que mais geram não conformidade"
          fatias={fatiasEtapa}
          colunaIdentidade="Etapa"
          colunaValor="Não conformidades"
        />
      </Grafico>
    </GradeGraficos>
  );
}
